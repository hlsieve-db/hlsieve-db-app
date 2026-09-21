-- Checks the decks policies against a REAL Supabase project.
--
-- Unlike tests/rls_matrix.sql, this creates nothing: no auth schema, no
-- auth.users rows, no roles, no policies. It only reads auth.users, and every
-- write it makes is to rows it created itself, inside one transaction that
-- always rolls back. The project is left exactly as it was.
--
-- NEVER run rls_matrix.sql against a real project. That one stubs the auth
-- schema and writes to auth.users.
--
-- Before running:
--   1. Sign in twice through the app to create two real accounts.
--   2. Copy their ids from Authentication -> Users in the dashboard.
--   3. Replace both placeholders below. Running with them unreplaced stops
--      immediately.
--   4. Paste the whole file into the SQL editor and run it once.
--
-- The final statement is ROLLBACK and there is no COMMIT anywhere: do not add
-- one. A failed check raises, which aborts the transaction, so nothing is kept
-- either way. Seeing the closing notice means every check passed.

begin;

do $$
declare
  -- Replace both. The check below refuses to run while they are unchanged.
  user_a constant uuid := '00000000-0000-0000-0000-000000000000';
  user_b constant uuid := '11111111-1111-1111-1111-111111111111';

  -- Deliberately unmistakable, so no real deck can share an id with them.
  deck_a  constant text := '__hlsieve_rls_check_a__';
  deck_x  constant text := '__hlsieve_rls_check_cross__';
  deck_sh constant text := '__hlsieve_rls_check_shared__';

  visible int;
  touched int;
begin
  -- ------------------------------------------------------------- preflight
  if user_a = '00000000-0000-0000-0000-000000000000'::uuid
     or user_b = '11111111-1111-1111-1111-111111111111'::uuid then
    raise exception
      'Replace the two placeholder user ids with real account ids first.';
  end if;
  if user_a = user_b then
    raise exception 'The two user ids must be different accounts.';
  end if;
  if not exists (select 1 from auth.users where id = user_a) then
    raise exception 'user_a is not an account in this project.';
  end if;
  if not exists (select 1 from auth.users where id = user_b) then
    raise exception 'user_b is not an account in this project.';
  end if;

  -- ---------------------------------------------------------------- user A
  -- The SQL editor is not a PostgREST request, so the identity is asserted
  -- rather than assumed before anything is read from it.
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_a, 'role', 'authenticated')::text,
    true
  );
  if auth.uid() is distinct from user_a then
    raise exception
      'auth.uid() is %, not user_a; the impersonation did not take effect.',
      coalesce(auth.uid()::text, 'null');
  end if;

  insert into public.decks (id, deck) values (deck_a, '{"name":"A"}');

  select count(*) into visible
    from public.decks where user_id = user_a and id = deck_a;
  if visible <> 1 then
    raise exception 'A cannot read the deck it just inserted.';
  end if;

  update public.decks set deck = '{"name":"A2"}'
   where user_id = user_a and id = deck_a;
  get diagnostics touched = row_count;
  if touched <> 1 then raise exception 'A cannot update its own deck.'; end if;

  update public.decks set deleted_at = now()
   where user_id = user_a and id = deck_a;
  get diagnostics touched = row_count;
  if touched <> 1 then
    raise exception 'A cannot tombstone its own deck.';
  end if;

  delete from public.decks where user_id = user_a and id = deck_a;
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception
      'A deleted a row; there should be no delete policy on public.decks.';
  end if;

  begin
    insert into public.decks (user_id, id, deck)
      values (user_b, deck_x, '{"name":"x"}');
    raise exception 'A inserted a row owned by B.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.decks set user_id = user_b
     where user_id = user_a and id = deck_a;
    raise exception 'A handed its row to B.';
  exception
    when insufficient_privilege then null;
  end;

  -- ---------------------------------------------------------------- user B
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_b, 'role', 'authenticated')::text,
    true
  );
  if auth.uid() is distinct from user_b then
    raise exception 'auth.uid() did not switch to user_b.';
  end if;

  select count(*) into visible from public.decks where id = deck_a;
  if visible <> 0 then raise exception 'B can see a deck of A.'; end if;

  update public.decks set deck = '{"name":"hijack"}' where id = deck_a;
  get diagnostics touched = row_count;
  if touched <> 0 then raise exception 'B updated a deck of A.'; end if;

  delete from public.decks where id = deck_a;
  get diagnostics touched = row_count;
  if touched <> 0 then raise exception 'B deleted a deck of A.'; end if;

  -- Ids are only unique per account, so B may hold one A also uses.
  insert into public.decks (id, deck) values (deck_sh, '{"name":"B"}');
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_a, 'role', 'authenticated')::text,
    true
  );
  insert into public.decks (id, deck) values (deck_sh, '{"name":"A"}');
  select count(*) into visible
    from public.decks where user_id = user_a and id = deck_sh;
  if visible <> 1 then
    raise exception 'A and B cannot hold the same deck id independently.';
  end if;

  -- ------------------------------------------------------------- anonymous
  set local role anon;
  perform set_config('request.jwt.claims', '', true);
  if auth.uid() is not null then
    raise exception 'auth.uid() is still set for an anonymous caller.';
  end if;

  select count(*) into visible from public.decks;
  if visible <> 0 then
    raise exception 'An anonymous caller can read % deck row(s).', visible;
  end if;

  begin
    insert into public.decks (user_id, id, deck)
      values (user_a, '__hlsieve_rls_check_anon__', '{}');
    raise exception 'An anonymous caller inserted a row.';
  exception
    when insufficient_privilege or not_null_violation then null;
  end;

  update public.decks set deck = '{"name":"anon"}' where id = deck_a;
  get diagnostics touched = row_count;
  if touched <> 0 then raise exception 'An anonymous caller updated a row.'; end if;

  delete from public.decks where id = deck_a;
  get diagnostics touched = row_count;
  if touched <> 0 then raise exception 'An anonymous caller deleted a row.'; end if;

  reset role;
  raise notice 'All production RLS checks passed. Rolling back, nothing kept.';
end
$$;

rollback;
