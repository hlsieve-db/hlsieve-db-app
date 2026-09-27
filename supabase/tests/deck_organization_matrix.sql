-- Exercises deck_folders, deck_tags and deck_organizations: their privileges,
-- row isolation, the three organization states, one-way deletion times, and the
-- three tombstone functions.
--
-- Run only against a throwaway Postgres database.
--
--   psql -v ON_ERROR_STOP=0 -f supabase/tests/deck_organization_matrix.sql

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

-- In filename order, as production would apply them. The organization tables
-- have foreign keys into decks, so the earlier migrations come first.
\ir ../migrations/20260922000000_create_cloud_decks.sql
\ir ../migrations/20260925000000_create_cloud_deck_versions.sql
\ir ../migrations/20260927000000_create_cloud_deck_organization.sql
\ir ../migrations/20260927100000_add_deck_definition_upsert.sql

-- ------------------------------------------------------------- structure
\echo '--- folder and tag primary keys are (user_id, id) (expect: user_id,id twice)'
select c.conrelid::regclass as table_name, a.attname
  from pg_constraint c
  join unnest(c.conkey) with ordinality as k(attnum, ord) on true
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
 where c.conrelid in (
         'public.deck_folders'::regclass,
         'public.deck_tags'::regclass
       )
   and c.contype = 'p'
 order by c.conrelid::regclass::text, k.ord;

\echo '--- organization primary key is (user_id, deck_id) (expect: user_id then deck_id)'
select a.attname
  from pg_constraint c
  join unnest(c.conkey) with ordinality as k(attnum, ord) on true
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
 where c.conrelid = 'public.deck_organizations'::regclass
   and c.contype = 'p'
 order by k.ord;

\echo '--- organization foreign keys and indexes exist (expect: t,t,t,t)'
select exists (
         select from pg_constraint
          where conrelid = 'public.deck_organizations'::regclass
            and conname = 'deck_organizations_parent_fkey'
            and contype = 'f'
       ) as deck_fk,
       exists (
         select from pg_constraint
          where conrelid = 'public.deck_organizations'::regclass
            and conname = 'deck_organizations_folder_fkey'
            and contype = 'f'
       ) as folder_fk,
       exists (
         select from pg_indexes
          where schemaname = 'public'
            and indexname = 'deck_organizations_user_updated_at_idx'
       ) as updated_index,
       exists (
         select from pg_indexes
          where schemaname = 'public'
            and indexname = 'deck_organizations_user_folder_idx'
       ) as folder_index;

\echo '--- no unique constraint on a folder or tag name (expect: 0)'
select count(*) as name_unique_constraints
  from pg_constraint c
  join unnest(c.conkey) with ordinality as k(attnum, ord) on true
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
 where c.conrelid in (
         'public.deck_folders'::regclass,
         'public.deck_tags'::regclass
       )
   and c.contype = 'u'
   and a.attname = 'name';

\echo '--- production table privileges are narrow (expect: t,t,t,f and no anon, x3)'
select t.relname,
       has_table_privilege('authenticated', t.oid, 'select') as auth_select,
       has_table_privilege('authenticated', t.oid, 'insert') as auth_insert,
       has_table_privilege('authenticated', t.oid, 'update') as auth_update,
       has_table_privilege('authenticated', t.oid, 'delete') as auth_delete,
       (has_table_privilege('anon', t.oid, 'select')
        or has_table_privilege('anon', t.oid, 'insert')
        or has_table_privilege('anon', t.oid, 'update')
        or has_table_privilege('anon', t.oid, 'delete')) as anon_any
  from pg_class t
 where t.relname in ('deck_folders', 'deck_tags', 'deck_organizations')
   and t.relnamespace = 'public'::regnamespace
 order by t.relname;

\echo '--- row level security is on for all three (expect: t,t,t)'
select relname, relrowsecurity
  from pg_class
 where relname in ('deck_folders', 'deck_tags', 'deck_organizations')
   and relnamespace = 'public'::regnamespace
 order by relname;

\echo '--- no delete policy exists on any of the three (expect: 0)'
select count(*) as delete_policies
  from pg_policies
 where schemaname = 'public'
   and tablename in ('deck_folders', 'deck_tags', 'deck_organizations')
   and cmd = 'DELETE';

\echo '--- only authenticated may call the new RPCs (expect: t,f x3)'
select name,
       has_function_privilege('authenticated', name, 'execute') as authenticated_execute,
       has_function_privilege('anon', name, 'execute') as anon_execute
  from (values
          ('public.tombstone_deck_folder(text)'),
          ('public.tombstone_deck_tag(text)'),
          ('public.tombstone_deck_with_related(text)')
       ) as f(name);

-- A check constraint runs as the caller, so the role writing the row needs
-- execute on the function the constraint calls. Without the grant every
-- organization write is refused.
\echo '--- authenticated may evaluate the tag list constraint, anon may not (expect: t,f)'
select has_function_privilege(
         'authenticated',
         'public.deck_organization_tag_ids_valid(text[])',
         'execute'
       ) as authenticated_execute,
       has_function_privilege(
         'anon',
         'public.deck_organization_tag_ids_valid(text[])',
         'execute'
       ) as anon_execute;

\echo '--- only authenticated may call the definition upsert RPCs (expect: t,f x2)'
select name,
       has_function_privilege('authenticated', name, 'execute') as authenticated_execute,
       has_function_privilege('anon', name, 'execute') as anon_execute
  from (values
          ('public.upsert_deck_folder(text,text,integer)'),
          ('public.upsert_deck_tag(text,text)')
       ) as f(name);

\echo '--- the deployed deck tombstone RPC is unchanged (expect: t, 2 columns)'
select exists (
         select from pg_proc p
          where p.pronamespace = 'public'::regnamespace
            and p.proname = 'tombstone_deck_with_versions'
            and pg_get_function_identity_arguments(p.oid) = 'p_deck_id text'
       ) as signature_kept,
       (select count(*)
          from pg_proc p
          join unnest(p.proargnames) as n(name) on true
         where p.pronamespace = 'public'::regnamespace
           and p.proname = 'tombstone_deck_with_versions'
           and n.name in ('deck_found', 'versions_tombstoned')
       ) as result_columns_kept;

-- Widen table grants so the checks below exercise row level security
-- independently from the production privilege layer. The checks above already
-- proved the real grants.
grant select, insert, update, delete on public.decks to authenticated, anon;
grant select, insert, update, delete on public.deck_versions to authenticated, anon;
grant select, insert, update, delete on public.deck_folders to authenticated, anon;
grant select, insert, update, delete on public.deck_tags to authenticated, anon;
grant select, insert, update, delete on public.deck_organizations to authenticated, anon;

-- --------------------------------------------------------------- user A
set role authenticated;
set hlsieve.uid = '11111111-1111-1111-1111-111111111111';

insert into public.decks (id, deck)
  values ('deck-a', '{"id":"deck-a","name":"A","entries":[],"createdAt":"2026-09-27T00:00:00.000Z","updatedAt":"2026-09-27T00:00:00.000Z"}');
insert into public.decks (id, deck)
  values ('deck-b', '{"id":"deck-b","name":"B","entries":[],"createdAt":"2026-09-27T00:00:00.000Z","updatedAt":"2026-09-27T00:00:00.000Z"}');

\echo '--- A inserts folders and tags and reads them back (expect: 2, 2)'
insert into public.deck_folders (id, name, sort_order) values
  ('folder-1', '大会用', 0),
  ('folder-2', '練習用', 1);
insert into public.deck_tags (id, name) values
  ('tag-1', '赤'),
  ('tag-2', '青');
select count(*) as folders from public.deck_folders;
select count(*) as tags from public.deck_tags;

\echo '--- the same name is accepted under another id (expect: INSERT 0 1)'
insert into public.deck_folders (id, name) values ('folder-3', '大会用');

\echo '--- an untrimmed or oversized name is refused (expect: error x3)'
insert into public.deck_folders (id, name) values ('bad-1', ' 大会用');
insert into public.deck_folders (id, name) values ('bad-2', '');
insert into public.deck_tags (id, name) values ('bad-3', repeat('あ', 31));

\echo '--- a negative sort order is refused (expect: error)'
insert into public.deck_folders (id, name, sort_order) values ('bad-4', '順序', -1);

\echo '--- A organizes a deck and reads it back (expect: folder-1, {tag-1,tag-2})'
insert into public.deck_organizations (deck_id, folder_id, tag_ids)
  values ('deck-a', 'folder-1', array['tag-1', 'tag-2']);
select folder_id, tag_ids from public.deck_organizations where deck_id = 'deck-a';

\echo '--- an organization for an unknown deck is refused (expect: error)'
insert into public.deck_organizations (deck_id) values ('missing');

\echo '--- an organization naming an unknown folder is refused (expect: error)'
insert into public.deck_organizations (deck_id, folder_id)
  values ('deck-b', 'missing');

\echo '--- an empty folder id is refused rather than meaning none (expect: error)'
insert into public.deck_organizations (deck_id, folder_id) values ('deck-b', '');

\echo '--- repeated, empty or excessive tags are refused (expect: error x3)'
insert into public.deck_organizations (deck_id, tag_ids)
  values ('deck-b', array['tag-1', 'tag-1']);
insert into public.deck_organizations (deck_id, tag_ids)
  values ('deck-b', array['tag-1', '']);
insert into public.deck_organizations (deck_id, tag_ids)
  values ('deck-b', array['t1','t2','t3','t4','t5','t6','t7','t8','t9','t10','t11']);

-- The three states the application distinguishes.
\echo '--- an explicitly cleared organization is a row, not an absence (expect: 1 row, null, {})'
insert into public.deck_organizations (deck_id) values ('deck-b');
select deck_id, folder_id, tag_ids, deleted_at is null as active
  from public.deck_organizations
 where deck_id = 'deck-b';

\echo '--- an unknown tag id is accepted, since an array cannot reference (expect: INSERT 0 1)'
insert into public.deck_organizations (deck_id, tag_ids)
  values ('deck-a', array['ghost-tag'])
  on conflict (user_id, deck_id) do update set tag_ids = excluded.tag_ids;

-- Put deck-a back the way the later checks expect it.
update public.deck_organizations
   set tag_ids = array['tag-1', 'tag-2'], folder_id = 'folder-1'
 where deck_id = 'deck-a';

\echo '--- the server chooses created_at and updated_at (expect: t, t)'
insert into public.deck_folders (id, name, created_at, updated_at)
  values ('folder-4', '時刻', '2099-01-01T00:00:00Z', '2099-01-01T00:00:00Z');
select created_at < '2090-01-01T00:00:00Z' as server_chose_created,
       updated_at < '2090-01-01T00:00:00Z' as server_chose_updated
  from public.deck_folders where id = 'folder-4';

\echo '--- an insert cannot backdate a deletion (expect: t)'
insert into public.deck_folders (id, name, deleted_at)
  values ('folder-5', '削除済み', '2000-01-01T00:00:00Z');
select deleted_at > '2020-01-01T00:00:00Z' as server_chose_delete_time
  from public.deck_folders where id = 'folder-5';

\echo '--- repeating a tombstone keeps the first deletion time (expect: t)'
select deleted_at as first_deleted_at
  from public.deck_folders where id = 'folder-5' \gset
update public.deck_folders set deleted_at = now() where id = 'folder-5';
select deleted_at = :'first_deleted_at'::timestamptz as deletion_time_stable
  from public.deck_folders where id = 'folder-5';

-- Unlike a deck version, the schema permits clearing deleted_at. Whether a row
-- may actually come back that way is decided per table by the client, and the
-- next three checks pin both halves of that rule.
\echo '--- the schema itself permits clearing deleted_at (expect: t)'
update public.deck_folders set deleted_at = null where id = 'folder-5';
select deleted_at is null as revived
  from public.deck_folders where id = 'folder-5';

-- A deleted folder or tag stays deleted: an offline device reconnecting with a
-- folder it has not heard about must not resurrect it for every device. The
-- client writes the upsert with this where clause, so a tombstoned row is left
-- alone rather than refused, and the unsent-changes queue does not fill with a
-- write that can never succeed.
update public.deck_folders set deleted_at = now() where id = 'folder-5';

\echo '--- the folder upsert leaves a tombstoned folder alone and says so (expect: f,t)'
select * from public.upsert_deck_folder('folder-5', '復活しない', 0);

\echo '--- that folder is still deleted and still has its old name (expect: t, 削除済み)'
select deleted_at is not null as still_deleted, name
  from public.deck_folders where id = 'folder-5';

\echo '--- the same call updates a folder that is still active (expect: t,f)'
select * from public.upsert_deck_folder('folder-2', '別の名前', 3);
select name, sort_order from public.deck_folders where id = 'folder-2';

\echo '--- it creates a folder that does not exist yet (expect: t,f)'
select * from public.upsert_deck_folder('folder-6', '新しい', 4);

\echo '--- it still refuses a value the table refuses (expect: error x2)'
select * from public.upsert_deck_folder('folder-6', ' 空白つき', 4);
select * from public.upsert_deck_folder('folder-6', '負の順序', -1);

\echo '--- an empty id is refused rather than written (expect: error)'
select * from public.upsert_deck_folder('', '名前なしid', 0);

\echo '--- the tag upsert behaves the same way (expect: t,f then f,t)'
select * from public.upsert_deck_tag('tag-2', '青あらため');
update public.deck_tags set deleted_at = now() where id = 'tag-2';
select * from public.upsert_deck_tag('tag-2', '復活しない');
select deleted_at is not null as still_deleted, name
  from public.deck_tags where id = 'tag-2';

-- Restored, because later checks read this folder and tag.
update public.deck_folders set name = '練習用', sort_order = 1
 where id = 'folder-2';
update public.deck_tags set name = '青', deleted_at = null where id = 'tag-2';

-- An organization is the one of the three that may come back, for the same
-- reason a deck may: the row says what the device holds now.
\echo '--- an organization may be revived, as a deck may (expect: t)'
insert into public.deck_organizations (deck_id, folder_id, tag_ids)
  values ('deck-b', null, array['tag-2'])
  on conflict (user_id, deck_id) do update
     set folder_id = excluded.folder_id,
         tag_ids = excluded.tag_ids,
         deleted_at = null;
select deleted_at is null as active
  from public.deck_organizations where deck_id = 'deck-b';

-- --------------------------------------------------------------- folder RPC
\echo '--- deleting a folder clears it from its decks and reports them (expect: t,1)'
select * from public.tombstone_deck_folder('folder-1');

\echo '--- the folder is a tombstone and the deck keeps its tags (expect: t, null, {tag-1,tag-2})'
select (select deleted_at is not null
          from public.deck_folders where id = 'folder-1') as folder_tombstoned,
       folder_id,
       tag_ids
  from public.deck_organizations where deck_id = 'deck-a';

\echo '--- deleting the same folder again reports nothing found (expect: f,0)'
select * from public.tombstone_deck_folder('folder-1');

\echo '--- an empty folder id is refused (expect: error)'
select * from public.tombstone_deck_folder('');

-- ------------------------------------------------------------------ tag RPC
\echo '--- deleting a tag removes it from its decks and reports them (expect: t,1)'
select * from public.tombstone_deck_tag('tag-1');

\echo '--- the remaining tags keep their order (expect: t, {tag-2})'
select (select deleted_at is not null
          from public.deck_tags where id = 'tag-1') as tag_tombstoned,
       tag_ids
  from public.deck_organizations where deck_id = 'deck-a';

\echo '--- deleting the same tag again reports nothing found (expect: f,0)'
select * from public.tombstone_deck_tag('tag-1');

-- ----------------------------------------------------------------- deck RPC
insert into public.deck_versions (id, deck_id, label, snapshot, created_at)
  values ('version-a', 'deck-a', '大会前', '{"name":"A","entries":[]}', now());

\echo '--- deleting a deck tombstones its versions and its organization (expect: t,1,t)'
select * from public.tombstone_deck_with_related('deck-a');

\echo '--- all three rows are tombstones and none were removed (expect: t,t,t)'
select (select deleted_at is not null from public.decks where id = 'deck-a') as deck,
       (select deleted_at is not null
          from public.deck_versions where id = 'version-a') as version,
       (select deleted_at is not null
          from public.deck_organizations where deck_id = 'deck-a') as organization;

\echo '--- deleting it again is idempotent and reports no new work (expect: t,0,f)'
select * from public.tombstone_deck_with_related('deck-a');

\echo '--- an unknown deck reports not found (expect: f,0,f)'
select * from public.tombstone_deck_with_related('missing');

\echo '--- the older deck RPC still works on its own (expect: t,0)'
select * from public.tombstone_deck_with_versions('deck-b');

-- Both functions stay callable while a tab that predates the newer one is still
-- open, so the two have to agree whichever order they are called in.
insert into public.decks (id, deck)
  values ('deck-old', '{"id":"deck-old","name":"OLD","entries":[],"createdAt":"2026-09-27T00:00:00.000Z","updatedAt":"2026-09-27T00:00:00.000Z"}');
insert into public.deck_organizations (deck_id, tag_ids)
  values ('deck-old', array['tag-2']);
insert into public.deck_versions (id, deck_id, label, snapshot, created_at)
  values ('version-old', 'deck-old', '旧', '{"name":"OLD","entries":[]}', now());

\echo '--- the older RPC leaves the organization active, as it always did (expect: t,1 then t)'
select * from public.tombstone_deck_with_versions('deck-old');
select deleted_at is null as organization_still_active
  from public.deck_organizations where deck_id = 'deck-old';

\echo '--- the newer RPC then finishes the job (expect: t,0,t)'
select * from public.tombstone_deck_with_related('deck-old');

\echo '--- and the other order is no different (expect: t,1,t then t,0)'
insert into public.decks (id, deck)
  values ('deck-new', '{"id":"deck-new","name":"NEW","entries":[],"createdAt":"2026-09-27T00:00:00.000Z","updatedAt":"2026-09-27T00:00:00.000Z"}');
insert into public.deck_organizations (deck_id, tag_ids)
  values ('deck-new', array['tag-2']);
insert into public.deck_versions (id, deck_id, label, snapshot, created_at)
  values ('version-new', 'deck-new', '新', '{"name":"NEW","entries":[]}', now());
select * from public.tombstone_deck_with_related('deck-new');
select * from public.tombstone_deck_with_versions('deck-new');

\echo '--- nothing was removed by either one (expect: t,t,t)'
select (select deleted_at is not null from public.decks where id = 'deck-new') as deck,
       (select deleted_at is not null
          from public.deck_versions where id = 'version-new') as version,
       (select deleted_at is not null
          from public.deck_organizations where deck_id = 'deck-new') as organization;

-- --------------------------------------------------------------- user B
set hlsieve.uid = '22222222-2222-2222-2222-222222222222';

\echo '--- B sees none of A''s folders, tags or organizations (expect: 0,0,0)'
select (select count(*) from public.deck_folders) as folders,
       (select count(*) from public.deck_tags) as tags,
       (select count(*) from public.deck_organizations) as organizations;

\echo '--- B cannot update A''s rows (expect: UPDATE 0 x3)'
update public.deck_folders set name = 'のっとり' where id = 'folder-2';
update public.deck_tags set name = 'のっとり' where id = 'tag-2';
update public.deck_organizations set folder_id = null where deck_id = 'deck-b';

\echo '--- B''s RPC calls do not touch A''s rows (expect: f,0 x2)'
select * from public.tombstone_deck_folder('folder-2');
select * from public.tombstone_deck_tag('tag-2');

\echo '--- A''s folder and tag are untouched (expect: 練習用, 青)'
reset role;
select name as folder_name from public.deck_folders where id = 'folder-2';
select name as tag_name from public.deck_tags where id = 'tag-2';
set role authenticated;
set hlsieve.uid = '22222222-2222-2222-2222-222222222222';

\echo '--- B may use the same folder id for its own row (expect: INSERT 0 1)'
insert into public.deck_folders (id, name) values ('folder-2', '別アカウント');

\echo '--- B cannot claim a row for A (expect: error)'
insert into public.deck_tags (user_id, id, name)
  values ('11111111-1111-1111-1111-111111111111', 'tag-9', 'なりすまし');

\echo '--- B cannot hand its own row to A (expect: error)'
update public.deck_folders
   set user_id = '11111111-1111-1111-1111-111111111111'
 where id = 'folder-2';

-- --------------------------------------------------------------- anonymous
set role anon;
set hlsieve.uid = '';

\echo '--- anon sees nothing (expect: 0,0,0)'
select (select count(*) from public.deck_folders) as folders,
       (select count(*) from public.deck_tags) as tags,
       (select count(*) from public.deck_organizations) as organizations;

\echo '--- anon cannot insert anywhere (expect: error x3)'
insert into public.deck_folders (id, name) values ('anon-folder', '匿名');
insert into public.deck_tags (id, name) values ('anon-tag', '匿名');
insert into public.deck_organizations (deck_id) values ('deck-b');

\echo '--- anon cannot call the RPCs (expect: error x5)'
select * from public.tombstone_deck_folder('folder-2');
select * from public.tombstone_deck_tag('tag-2');
select * from public.tombstone_deck_with_related('deck-b');
select * from public.upsert_deck_folder('anon-folder', '匿名', 0);
select * from public.upsert_deck_tag('anon-tag', '匿名');

-- ------------------------------------------------------------ account removal
reset role;
\echo '--- removing an account removes its rows through the cascade (expect: 0,0,0)'
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select (select count(*) from public.deck_folders
         where user_id = '11111111-1111-1111-1111-111111111111') as folders,
       (select count(*) from public.deck_tags
         where user_id = '11111111-1111-1111-1111-111111111111') as tags,
       (select count(*) from public.deck_organizations
         where user_id = '11111111-1111-1111-1111-111111111111') as organizations;
