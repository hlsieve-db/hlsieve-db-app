-- Exercises the access rules and the behaviour of the deck share functions.
--
-- Runs against a throwaway Postgres, not a real project. It stubs auth.uid()
-- only, because creating a share requires a signed in caller while reading one
-- does not, and both halves of that need exercising. No auth.users table is
-- needed: a share records nothing about who made it.
--
--   psql -v ON_ERROR_STOP=0 -f supabase/tests/deck_shares_matrix.sql
--
-- Lines marked "expect: error" are supposed to fail; the run continues so the
-- whole matrix is covered in one pass.
--
-- The collision section at the end replaces generate_deck_share_id with a stub
-- that repeats itself, and does not restore it. The database is spent after a
-- run: throw the container away rather than running anything else against it.
-- NEVER run this against a real project.

create schema auth;

-- Supabase derives this from the request's JWT. Here it comes from a session
-- setting so the test can be signed in or out on demand.
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

\ir ../migrations/20260922100000_create_deck_shares.sql

-- ------------------------------------------------------------- privileges
\echo '--- no role holds anything on the table (expect: 0 rows)'
select grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'deck_shares'
   and grantee in ('anon', 'authenticated', 'public');

\echo '--- only the two entry points are callable (expect: generator false)'
select p.proname,
       has_function_privilege('anon', p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like '%deck_share%'
 order by p.proname;

\echo '--- row level security is on with no policy (expect: t and 0)'
select relrowsecurity as rls_enabled,
       (select count(*) from pg_policies
         where schemaname = 'public' and tablename = 'deck_shares') as policies
  from pg_class where oid = 'public.deck_shares'::regclass;

-- ------------------------------------------------------------ id quality
\echo '--- 5000 ids are distinct and well formed (expect: 5000, 5000, 5000)'
select count(*) as drawn,
       count(distinct id) as distinct_ids,
       count(*) filter (where id ~ '^[A-Za-z0-9]{8}$') as well_formed
  from (select public.generate_deck_share_id() as id
          from generate_series(1, 5000)) samples;

-- ------------------------------------------------------------- anonymous
-- Signed out: may read a share, may not create one.
set role anon;
reset hlsieve.uid;

\echo '--- anonymous cannot read the table (expect: error)'
select count(*) from public.deck_shares;

\echo '--- anonymous cannot write the table (expect: error)'
insert into public.deck_shares (share_id, deck) values ('AAAAAAAA', '{}');

\echo '--- anonymous cannot update or delete (expect: error, error)'
update public.deck_shares set deck = '{}';
delete from public.deck_shares;

\echo '--- anonymous cannot mint an id on its own (expect: error)'
select public.generate_deck_share_id();

\echo '--- anonymous cannot create a share at all (expect: error)'
select public.create_deck_share(
  '{"v":1,"name":"匿名デッキ","entries":[{"cardNumber":"hBP04-042","quantity":4}]}'::jsonb
);

-- --------------------------------------------------------- authenticated
set role authenticated;
set hlsieve.uid = '11111111-1111-1111-1111-111111111111';

\echo '--- a signed in caller may create a share (expect: t)'
select public.create_deck_share(
  '{"v":1,"name":"共有デッキ","entries":[{"cardNumber":"hBP04-042","quantity":4}]}'::jsonb
) as created_id \gset
select :'created_id' ~ '^[A-Za-z0-9]{8}$' as created_id_well_formed;

-- The grant is not the only control: a caller holding the authenticated role
-- with no session still cannot create.
\echo '--- the authenticated role without a session cannot create (expect: error)'
reset hlsieve.uid;
select public.create_deck_share('{"v":1,"name":"A","entries":[]}'::jsonb);
set hlsieve.uid = '11111111-1111-1111-1111-111111111111';

\echo '--- a signed in caller may read a share (expect: the payload)'
select public.get_deck_share(:'created_id') as fetched_by_authenticated;

\echo '--- a signed in caller still cannot touch the table (expect: error, error)'
select count(*) from public.deck_shares;
insert into public.deck_shares (share_id, deck) values ('BBBBBBBB', '{}');

\echo '--- a signed in caller still cannot mint an id (expect: error)'
select public.generate_deck_share_id();

-- Back to signed out for the reader side.
set role anon;
reset hlsieve.uid;

\echo '--- anonymous may read a share created by someone else (expect: the payload)'
select public.get_deck_share(:'created_id') as fetched_by_anon;

\echo '--- an unknown id is null, not an error (expect: t)'
select public.get_deck_share('ZZZZZZZZ') is null as unknown_is_null;

\echo '--- a malformed id is null, not an error (expect: t, t, t)'
select public.get_deck_share('../secret') is null as traversal_is_null,
       public.get_deck_share('') is null as empty_is_null,
       public.get_deck_share('short') is null as wrong_length_is_null;

-- The id is case sensitive, so a link that lost its casing is simply unknown
-- rather than resolving to somebody else's deck.
\echo '--- a case folded id does not resolve (expect: t)'
select public.get_deck_share(lower(:'created_id')) is null
    or lower(:'created_id') = :'created_id' as case_folded_is_null;

-- ------------------------------------------------------------ validation
-- Signed in, so each rejection below is the payload check firing rather than
-- the sign in check.
set role authenticated;
set hlsieve.uid = '11111111-1111-1111-1111-111111111111';

\echo '--- rejects a payload that is not an object (expect: error)'
select public.create_deck_share('[]'::jsonb);
select public.create_deck_share('"a string"'::jsonb);

\echo '--- rejects an unsupported version (expect: error)'
select public.create_deck_share('{"v":2,"name":"A","entries":[]}'::jsonb);

-- An absent key is a separate case from a key of the wrong type: jsonb_typeof
-- returns SQL NULL for one and a type name for the other, and an early version
-- of this function let the absent ones through.
\echo '--- rejects an absent name (expect: error)'
select public.create_deck_share('{"v":1,"entries":[]}'::jsonb);

\echo '--- rejects a blank name (expect: error)'
select public.create_deck_share('{"v":1,"name":"   ","entries":[]}'::jsonb);

\echo '--- rejects a name that is not a string (expect: error)'
select public.create_deck_share('{"v":1,"name":5,"entries":[]}'::jsonb);

\echo '--- rejects an absent entries key (expect: error)'
select public.create_deck_share('{"v":1,"name":"A"}'::jsonb);

\echo '--- rejects entries that are not an array (expect: error)'
select public.create_deck_share('{"v":1,"name":"A","entries":"x"}'::jsonb);

\echo '--- rejects an absent version (expect: error)'
select public.create_deck_share('{"name":"A","entries":[]}'::jsonb);

-- Top level shape. The browser sends exactly three keys; a caller reaching the
-- function directly must not be able to attach anything else, least of all the
-- account fields the snapshot is specified never to hold.
\echo '--- rejects an extra top level key (expect: error)'
select public.create_deck_share(
  '{"v":1,"name":"A","entries":[],"note":"x"}'::jsonb);

\echo '--- rejects smuggled account fields (expect: error, error, error)'
select public.create_deck_share(
  '{"v":1,"name":"A","entries":[],"email":"a@example.test"}'::jsonb);
select public.create_deck_share(
  '{"v":1,"name":"A","entries":[],"user_id":"11111111-1111-1111-1111-111111111111"}'::jsonb);
select public.create_deck_share(
  '{"v":1,"name":"A","entries":[],"userId":"someone"}'::jsonb);

\echo '--- rejects a name with surrounding whitespace (expect: error)'
select public.create_deck_share('{"v":1,"name":" A ","entries":[]}'::jsonb);

\echo '--- rejects a name past the deck name limit of 100 (expect: error)'
select public.create_deck_share(jsonb_build_object(
  'v', 1, 'name', repeat('a', 101), 'entries', '[]'::jsonb));

\echo '--- accepts a name of exactly 100 (expect: t)'
select public.create_deck_share(jsonb_build_object(
  'v', 1, 'name', repeat('a', 100), 'entries', '[]'::jsonb))
  ~ '^[A-Za-z0-9]{8}$' as name_at_limit_ok;

-- Entry shape.
\echo '--- rejects an entry that is not an object (expect: error, error)'
select public.create_deck_share('{"v":1,"name":"A","entries":["x"]}'::jsonb);
select public.create_deck_share('{"v":1,"name":"A","entries":[[]]}'::jsonb);

\echo '--- rejects an extra key on an entry (expect: error)'
select public.create_deck_share(
  '{"v":1,"name":"A","entries":[{"cardNumber":"x","quantity":1,"foil":true}]}'::jsonb);

\echo '--- rejects a missing cardNumber (expect: error)'
select public.create_deck_share(
  '{"v":1,"name":"A","entries":[{"quantity":1}]}'::jsonb);

\echo '--- rejects a missing quantity (expect: error)'
select public.create_deck_share(
  '{"v":1,"name":"A","entries":[{"cardNumber":"x"}]}'::jsonb);

\echo '--- rejects a cardNumber that is not a string (expect: error)'
select public.create_deck_share(
  '{"v":1,"name":"A","entries":[{"cardNumber":5,"quantity":1}]}'::jsonb);

\echo '--- rejects a blank or untrimmed cardNumber (expect: error, error, error)'
select public.create_deck_share(
  '{"v":1,"name":"A","entries":[{"cardNumber":"","quantity":1}]}'::jsonb);
select public.create_deck_share(
  '{"v":1,"name":"A","entries":[{"cardNumber":"   ","quantity":1}]}'::jsonb);
select public.create_deck_share(
  '{"v":1,"name":"A","entries":[{"cardNumber":" x ","quantity":1}]}'::jsonb);

\echo '--- rejects a cardNumber past 100 characters (expect: error)'
select public.create_deck_share(jsonb_build_object(
  'v', 1, 'name', 'A', 'entries',
  jsonb_build_array(jsonb_build_object(
    'cardNumber', repeat('x', 101), 'quantity', 1))));

\echo '--- accepts a cardNumber of exactly 100 (expect: t)'
select public.create_deck_share(jsonb_build_object(
  'v', 1, 'name', 'A', 'entries',
  jsonb_build_array(jsonb_build_object(
    'cardNumber', repeat('x', 100), 'quantity', 1))))
  ~ '^[A-Za-z0-9]{8}$' as card_number_at_limit_ok;

-- quantity: a safe integer of at least one. There is no upper bound in the
-- share codec beyond that, so none is invented here.
\echo '--- rejects a non-numeric quantity (expect: error, error, error)'
select public.create_deck_share(
  '{"v":1,"name":"A","entries":[{"cardNumber":"x","quantity":"1"}]}'::jsonb);
select public.create_deck_share(
  '{"v":1,"name":"A","entries":[{"cardNumber":"x","quantity":null}]}'::jsonb);
select public.create_deck_share(
  '{"v":1,"name":"A","entries":[{"cardNumber":"x","quantity":true}]}'::jsonb);

\echo '--- rejects a fractional, zero or negative quantity (expect: error x3)'
select public.create_deck_share(
  '{"v":1,"name":"A","entries":[{"cardNumber":"x","quantity":1.5}]}'::jsonb);
select public.create_deck_share(
  '{"v":1,"name":"A","entries":[{"cardNumber":"x","quantity":0}]}'::jsonb);
select public.create_deck_share(
  '{"v":1,"name":"A","entries":[{"cardNumber":"x","quantity":-1}]}'::jsonb);

\echo '--- rejects a quantity past the safe integer range (expect: error)'
select public.create_deck_share(
  '{"v":1,"name":"A","entries":[{"cardNumber":"x","quantity":9007199254740992}]}'::jsonb);

\echo '--- accepts the largest safe integer, as the codec does (expect: t)'
select public.create_deck_share(
  '{"v":1,"name":"A","entries":[{"cardNumber":"x","quantity":9007199254740991}]}'::jsonb)
  ~ '^[A-Za-z0-9]{8}$' as max_safe_quantity_ok;

\echo '--- rejects a repeated card number (expect: error)'
select public.create_deck_share(
  '{"v":1,"name":"A","entries":[{"cardNumber":"x","quantity":1},{"cardNumber":"x","quantity":2}]}'::jsonb);

\echo '--- one malformed entry rejects the whole payload (expect: error)'
select public.create_deck_share(
  '{"v":1,"name":"A","entries":[{"cardNumber":"ok","quantity":1},{"cardNumber":"bad","quantity":0}]}'::jsonb);

\echo '--- accepts a payload the browser would produce (expect: t)'
select public.create_deck_share(
  '{"v":1,"name":"わたしのデッキ","entries":[{"cardNumber":"hBP04-042","quantity":4},{"cardNumber":"hSD01-001","quantity":1}]}'::jsonb)
  ~ '^[A-Za-z0-9]{8}$' as realistic_payload_ok;

\echo '--- rejects more entries than the share contract allows (expect: error)'
select public.create_deck_share(jsonb_build_object(
  'v', 1, 'name', 'A',
  'entries', (select jsonb_agg(jsonb_build_object('cardNumber', 'x', 'quantity', 1))
                from generate_series(1, 201))));

\echo '--- accepts exactly the contract maximum of 200 entries (expect: t)'
select public.create_deck_share(jsonb_build_object(
  'v', 1, 'name', 'A',
  'entries', (select jsonb_agg(jsonb_build_object(
                       'cardNumber', 'card-' || n, 'quantity', 1))
                from generate_series(1, 200) as n)))
  ~ '^[A-Za-z0-9]{8}$' as max_entries_ok;

\echo '--- rejects a payload past the size the client also refuses (expect: error)'
-- Valid in every other respect: 200 distinct entries with the longest card
-- numbers the contract allows come to roughly 27000 characters.
select public.create_deck_share(jsonb_build_object(
  'v', 1, 'name', 'A',
  'entries', (select jsonb_agg(jsonb_build_object(
                       'cardNumber', rpad('card-' || n, 100, 'x'),
                       'quantity', 1))
                from generate_series(1, 200) as n)));

-- --------------------------------------------------------------- snapshot
\echo '--- a stored share is immutable through the API (expect: error)'
update public.deck_shares set deck = '{"v":1,"name":"tampered","entries":[]}';

reset role;
reset hlsieve.uid;

-- --------------------------------------------------------------- collision
-- The generator is swapped for one that repeats itself, which is the only way
-- to reach the retry path deliberately. A real collision is far too unlikely
-- to wait for, and the retry is the part worth proving.
create table public.collision_probe (calls int not null default 0);
insert into public.collision_probe values (0);

create or replace function public.generate_deck_share_id()
returns text language plpgsql volatile set search_path = '' as $$
declare
  seen int;
begin
  update public.collision_probe set calls = calls + 1 returning calls into seen;
  -- The first three draws repeat an id that is already taken.
  return case when seen <= 3 then 'COLLIDE1' else 'ESCAPED1' end;
end;
$$;

insert into public.deck_shares (share_id, deck)
  values ('COLLIDE1', '{"v":1,"name":"taken","entries":[]}');

set hlsieve.uid = '11111111-1111-1111-1111-111111111111';

\echo '--- a colliding id is reallocated rather than failing (expect: ESCAPED1)'
select public.create_deck_share('{"v":1,"name":"B","entries":[]}'::jsonb) as after_collision;

\echo '--- it took the retries to get there (expect: 4)'
select calls from public.collision_probe;

create or replace function public.generate_deck_share_id()
returns text language plpgsql volatile set search_path = '' as $$
begin
  return 'ALWAYSXX';
end;
$$;
insert into public.deck_shares (share_id, deck)
  values ('ALWAYSXX', '{"v":1,"name":"taken","entries":[]}');

\echo '--- giving up is an error, not a duplicate row (expect: error)'
select public.create_deck_share('{"v":1,"name":"C","entries":[]}'::jsonb);

\echo '--- nothing was written by the failed attempt (expect: 1)'
select count(*) as always_rows from public.deck_shares where share_id = 'ALWAYSXX';

-- ------------------------------------------------------------- separation
\echo '--- the cloud deck table is untouched by this migration (expect: f)'
select exists(select 1 from pg_tables
               where schemaname = 'public' and tablename = 'decks') as decks_exists;
