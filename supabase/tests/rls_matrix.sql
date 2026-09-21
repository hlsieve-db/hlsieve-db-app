-- Exercises every row level security rule the decks migration relies on.
--
-- Runs against a throwaway Postgres, not a real project, so it stubs the two
-- things Supabase supplies: the auth.users table and auth.uid(). Against a real
-- project the same statements can be run through the SQL editor after removing
-- the stub section.
--
--   psql -v ON_ERROR_STOP=0 -f supabase/tests/rls_matrix.sql
--
-- Lines marked "expect: error" are supposed to fail; the run continues so the
-- whole matrix is covered in one pass.

-- ---------------------------------------------------------------- stubs
create schema auth;
create table auth.users (id uuid primary key);

-- Supabase derives this from the request's JWT. Here it comes from a session
-- setting so the test can switch identity.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('hlsieve.uid', true), '')::uuid;
$$;

create role authenticated;
create role anon;
grant usage on schema public, auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

\ir ../migrations/20260922000000_create_cloud_decks.sql

-- Supabase grants these to both roles automatically; row level security, not
-- the grant, is what keeps an anonymous caller out.
grant select, insert, update, delete on public.decks to authenticated, anon;

-- ---------------------------------------------------------------- user A
set role authenticated;
set hlsieve.uid = '11111111-1111-1111-1111-111111111111';

\echo '--- A inserts its own deck (expect: INSERT 0 1)'
insert into public.decks (id, deck) values ('deck-a', '{"name":"A"}');

\echo '--- A inserts the non-uuid id an imported backup can carry (expect: INSERT 0 1)'
insert into public.decks (id, deck) values ('my hand written id', '{"name":"legacy"}');

\echo '--- A sees both of its decks (expect: 2)'
select count(*) as a_visible from public.decks;

\echo '--- A updates its own deck (expect: UPDATE 1)'
update public.decks set deck = '{"name":"A2"}' where id = 'deck-a';

\echo '--- A tombstones its own deck (expect: UPDATE 1)'
update public.decks set deleted_at = now() where id = 'my hand written id';

\echo '--- A cannot create a row owned by B (expect: error)'
insert into public.decks (user_id, id, deck)
  values ('22222222-2222-2222-2222-222222222222', 'stolen', '{"name":"x"}');

\echo '--- A cannot hand its row to B (expect: error)'
update public.decks
   set user_id = '22222222-2222-2222-2222-222222222222'
 where id = 'deck-a';

\echo '--- A cannot delete, no policy grants it (expect: DELETE 0)'
delete from public.decks where id = 'deck-a';

\echo '--- A cannot store an empty id, which the app rejects too (expect: error)'
insert into public.decks (id, deck) values ('', '{}');

-- The remaining id shapes are ones the app accepts, so the cloud accepts them
-- too. Narrowing the rule here would make upload the only step that fails.
\echo '--- A stores a whitespace-only id, as the app allows (expect: INSERT 0 1)'
insert into public.decks (id, deck) values ('   ', '{"name":"blank"}');

\echo '--- A stores a 200 character id (expect: INSERT 0 1)'
insert into public.decks (id, deck)
  values (repeat('a', 200), '{"name":"long-200"}');

\echo '--- A stores a 201 character id (expect: INSERT 0 1)'
insert into public.decks (id, deck)
  values (repeat('b', 201), '{"name":"long-201"}');

\echo '--- A cannot store a deck that is not an object (expect: error)'
insert into public.decks (id, deck) values ('bad', '[]');

\echo '--- the server overrides a client clock (expect: t)'
insert into public.decks (id, deck, created_at, updated_at)
  values ('clock-skew', '{"name":"skew"}', '2099-01-01Z', '2099-01-01Z');
select updated_at < '2090-01-01Z' as server_overrode_client_clock
  from public.decks where id = 'clock-skew';

-- ---------------------------------------------------------------- user B
set hlsieve.uid = '22222222-2222-2222-2222-222222222222';

\echo '--- B cannot see any deck of A (expect: 0)'
select count(*) as b_sees_of_a from public.decks;

\echo '--- B updating A''s deck reaches nothing (expect: UPDATE 0)'
update public.decks set deck = '{"name":"hijack"}' where id = 'deck-a';

\echo '--- B deleting A''s deck reaches nothing (expect: DELETE 0)'
delete from public.decks where id = 'deck-a';

\echo '--- B may reuse the same deck id independently (expect: INSERT 0 1)'
insert into public.decks (id, deck) values ('deck-a', '{"name":"B"}');

\echo '--- B sees only its own deck (expect: 1)'
select count(*) as b_visible from public.decks;

-- ---------------------------------------------------------------- anonymous
-- Every policy names the authenticated role, so this caller matches none of
-- them and there is nothing to evaluate.
reset role;
set role anon;
reset hlsieve.uid;

\echo '--- anonymous sees nothing (expect: 0)'
select count(*) as anon_visible from public.decks;

\echo '--- anonymous cannot insert (expect: error)'
insert into public.decks (id, deck) values ('anon', '{}');

\echo '--- anonymous update reaches nothing (expect: UPDATE 0)'
update public.decks set deck = '{}';

\echo '--- anonymous delete reaches nothing (expect: DELETE 0)'
delete from public.decks;

-- ---------------------------------------------------------------- cascade
reset role;

\echo '--- every row survives until its owner does (expect: 7, six of A and one of B)'
select count(*) as total_rows from public.decks;

\echo '--- closing an account removes its decks (expect: only B remains)'
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select user_id, id from public.decks order by user_id, id;
