-- Exercises deck_versions RLS, immutability and the atomic parent tombstone.
-- Run only against a throwaway Postgres database.
--
--   psql -v ON_ERROR_STOP=0 -f supabase/tests/deck_versions_matrix.sql

create schema auth;
create table auth.users (id uuid primary key);

create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('hlsieve.uid', true), '')::uuid;
$$;

do $$
begin
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
end
$$;

grant usage on schema public, auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

\ir ../migrations/20260922000000_create_cloud_decks.sql
\ir ../migrations/20260925000000_create_cloud_deck_versions.sql

-- ------------------------------------------------------------- structure
\echo '--- primary key contains user_id,id (expect: user_id then id)'
select a.attname
  from pg_constraint c
  join unnest(c.conkey) with ordinality as k(attnum, ord) on true
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
 where c.conrelid = 'public.deck_versions'::regclass
   and c.contype = 'p'
 order by k.ord;

\echo '--- parent FK and deck lookup index exist (expect: t, t)'
select exists (
         select from pg_constraint
          where conrelid = 'public.deck_versions'::regclass
            and conname = 'deck_versions_parent_fkey'
            and contype = 'f'
       ) as parent_fk,
       exists (
         select from pg_indexes
          where schemaname = 'public'
            and tablename = 'deck_versions'
            and indexname = 'deck_versions_user_deck_idx'
       ) as deck_index;

\echo '--- production table privileges are narrow (expect: t,t,t,f and no anon)'
select has_table_privilege('authenticated', 'public.deck_versions', 'select') as auth_select,
       has_table_privilege('authenticated', 'public.deck_versions', 'insert') as auth_insert,
       has_table_privilege('authenticated', 'public.deck_versions', 'update') as auth_update,
       has_table_privilege('authenticated', 'public.deck_versions', 'delete') as auth_delete,
       (has_table_privilege('anon', 'public.deck_versions', 'select')
        or has_table_privilege('anon', 'public.deck_versions', 'insert')
        or has_table_privilege('anon', 'public.deck_versions', 'update')
        or has_table_privilege('anon', 'public.deck_versions', 'delete')) as anon_any;

\echo '--- only authenticated can call the parent tombstone RPC (expect: t,f)'
select has_function_privilege(
         'authenticated',
         'public.tombstone_deck_with_versions(text)',
         'execute'
       ) as authenticated_execute,
       has_function_privilege(
         'anon',
         'public.tombstone_deck_with_versions(text)',
         'execute'
       ) as anon_execute;

-- Widen table grants so the checks below exercise RLS independently from the
-- production privilege layer. The checks above already proved the real grants.
grant select, insert, update, delete on public.decks to authenticated, anon;
grant select, insert, update, delete on public.deck_versions to authenticated, anon;

-- --------------------------------------------------------------- user A
set role authenticated;
set hlsieve.uid = '11111111-1111-1111-1111-111111111111';

insert into public.decks (id, deck)
  values ('deck-a', '{"id":"deck-a","name":"A","entries":[],"createdAt":"2026-09-25T00:00:00.000Z","updatedAt":"2026-09-25T00:00:00.000Z"}');

\echo '--- A inserts and reads its own version (expect: INSERT 0 1, 1)'
insert into public.deck_versions
  (id, deck_id, label, snapshot, created_at)
values
  ('version-a', 'deck-a', '大会前',
   '{"name":"A","entries":[],"regulationId":"future-rule"}',
   '2026-09-25T00:00:00Z');
select count(*) as a_visible from public.deck_versions;

\echo '--- composite primary key rejects a duplicate for A (expect: error)'
insert into public.deck_versions
  (id, deck_id, label, snapshot, created_at)
values ('version-a', 'deck-a', 'duplicate', '{"name":"A","entries":[]}', now());

\echo '--- parent FK rejects an unknown deck (expect: error)'
insert into public.deck_versions
  (id, deck_id, label, snapshot, created_at)
values ('orphan', 'missing', 'orphan', '{"name":"A","entries":[]}', now());

\echo '--- A cannot insert an already-deleted row (expect: error)'
insert into public.deck_versions
  (id, deck_id, label, snapshot, created_at, deleted_at)
values ('predeleted', 'deck-a', 'x', '{"name":"A","entries":[]}', now(), now());

\echo '--- immutable fields cannot change (expect: error x6)'
update public.deck_versions set deck_id = 'other' where id = 'version-a';
update public.deck_versions set label = 'changed' where id = 'version-a';
update public.deck_versions set snapshot = '{"name":"changed","entries":[]}' where id = 'version-a';
update public.deck_versions set created_at = now() + interval '1 day' where id = 'version-a';
update public.deck_versions set id = 'changed' where id = 'version-a';
update public.deck_versions
   set user_id = '22222222-2222-2222-2222-222222222222'
 where id = 'version-a';

\echo '--- only a tombstone update is accepted and uses server time (expect: t)'
update public.deck_versions
   set deleted_at = '2099-01-01T00:00:00Z'
 where id = 'version-a';
select deleted_at < '2090-01-01T00:00:00Z' as server_chose_delete_time
  from public.deck_versions where id = 'version-a';

\echo '--- repeating tombstone preserves the first server time (expect: t)'
select deleted_at as first_deleted_at
  from public.deck_versions where id = 'version-a' \gset
update public.deck_versions set deleted_at = now() where id = 'version-a';
select deleted_at = :'first_deleted_at'::timestamptz as deletion_time_stable
  from public.deck_versions where id = 'version-a';

\echo '--- a tombstone cannot be revived (expect: error)'
update public.deck_versions set deleted_at = null where id = 'version-a';

-- --------------------------------------------------------------- user B
set hlsieve.uid = '22222222-2222-2222-2222-222222222222';
insert into public.decks (id, deck)
  values ('deck-a', '{"id":"deck-a","name":"B","entries":[],"createdAt":"2026-09-25T00:00:00.000Z","updatedAt":"2026-09-25T00:00:00.000Z"}');

\echo '--- B sees none of A and cannot update A (expect: 0, UPDATE 0)'
select count(*) as b_sees_a from public.deck_versions;
update public.deck_versions set deleted_at = now() where id = 'version-a';

\echo '--- B may reuse the same version id under its own parent (expect: INSERT 0 1)'
insert into public.deck_versions
  (id, deck_id, label, snapshot, created_at)
values ('version-a', 'deck-a', 'B', '{"name":"B","entries":[]}', now());

\echo '--- B cannot claim A as owner (expect: error)'
insert into public.deck_versions
  (user_id, id, deck_id, label, snapshot, created_at)
values (
  '11111111-1111-1111-1111-111111111111',
  'stolen', 'deck-a', 'x', '{"name":"x","entries":[]}', now()
);

-- ------------------------------------------------------------- anonymous
reset role;
set role anon;
reset hlsieve.uid;

\echo '--- anonymous sees nothing (expect: 0)'
select count(*) as anon_visible from public.deck_versions;

\echo '--- anonymous cannot insert/update/delete (expect: error or zero x3)'
insert into public.deck_versions
  (id, deck_id, label, snapshot, created_at)
values ('anon', 'deck-a', 'x', '{"name":"x","entries":[]}', now());
update public.deck_versions set deleted_at = now();
delete from public.deck_versions;

\echo '--- anonymous cannot call the parent tombstone RPC (expect: error)'
select * from public.tombstone_deck_with_versions('deck-a');

-- ---------------------------------------------------------- parent RPC
reset role;
set role authenticated;
set hlsieve.uid = '11111111-1111-1111-1111-111111111111';

insert into public.decks (id, deck)
  values ('rpc-deck', '{"id":"rpc-deck","name":"RPC","entries":[],"createdAt":"2026-09-25T00:00:00.000Z","updatedAt":"2026-09-25T00:00:00.000Z"}');
insert into public.deck_versions
  (id, deck_id, label, snapshot, created_at)
values
  ('rpc-v1', 'rpc-deck', 'one', '{"name":"RPC","entries":[]}', now()),
  ('rpc-v2', 'rpc-deck', 'two', '{"name":"RPC","entries":[]}', now());

\echo '--- RPC tombstones two children and their parent (expect: t,2 then 2,1)'
select * from public.tombstone_deck_with_versions('rpc-deck');
select count(*) filter (where deleted_at is not null) as deleted_children,
       (select count(*) from public.decks
         where id = 'rpc-deck' and deleted_at is not null) as deleted_parent
  from public.deck_versions where deck_id = 'rpc-deck';

\echo '--- RPC is deterministic on repeat (expect: t,0)'
select * from public.tombstone_deck_with_versions('rpc-deck');

\echo '--- RPC cannot touch another account (expect: f,0)'
set hlsieve.uid = '22222222-2222-2222-2222-222222222222';
select * from public.tombstone_deck_with_versions('rpc-deck');

-- ------------------------------------------------------- atomic rollback
reset role;
create function public.reject_parent_tombstone()
returns trigger language plpgsql as $$
begin
  if new.id = 'rollback-deck' then
    raise exception 'deliberate parent failure';
  end if;
  return new;
end;
$$;
create trigger reject_parent_tombstone
  before update on public.decks
  for each row execute function public.reject_parent_tombstone();

set role authenticated;
set hlsieve.uid = '11111111-1111-1111-1111-111111111111';
insert into public.decks (id, deck)
  values ('rollback-deck', '{"id":"rollback-deck","name":"R","entries":[],"createdAt":"2026-09-25T00:00:00.000Z","updatedAt":"2026-09-25T00:00:00.000Z"}');
insert into public.deck_versions
  (id, deck_id, label, snapshot, created_at)
values ('rollback-v1', 'rollback-deck', 'one', '{"name":"R","entries":[]}', now());

\echo '--- parent failure aborts the child tombstone too (expect: error, then t)'
select * from public.tombstone_deck_with_versions('rollback-deck');
select deleted_at is null as child_rolled_back
  from public.deck_versions where id = 'rollback-v1';

-- ----------------------------------------------------- physical deletion
\echo '--- authenticated has no production DELETE grant (proved before widening)'
\echo '--- and no DELETE policy: even widened grant reaches zero foreign rows'

reset role;
\echo '--- account deletion cascades parent and versions (expect: 0 for A)'
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select count(*) as a_versions_remaining
  from public.deck_versions
 where user_id = '11111111-1111-1111-1111-111111111111';
