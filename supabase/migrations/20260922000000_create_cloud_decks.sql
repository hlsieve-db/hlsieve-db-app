-- Cloud Sync Phase 2: the decks table and its row level security.
--
-- Decks are stored as the domain object the app already has, so the Deck type
-- stays free of cloud metadata and the share, export and backup formats are
-- unaffected. Everything the sync needs to bookkeep lives in columns instead.

create table public.decks (
  -- Defaulted from the session so a client cannot claim another account's row,
  -- and null for an anonymous caller, which the not null constraint rejects.
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,

  -- Deck ids are text rather than uuid: the app generates uuids, but an
  -- imported backup keeps whatever id it carried, so a uuid column would
  -- refuse decks the app itself considers valid.
  id text not null,

  deck jsonb not null,

  -- Server clocks, used to find rows changed since the last sync. The deck's
  -- own createdAt and updatedAt stay inside `deck` and remain the timestamps
  -- that describe when the user edited it.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A deleted deck is kept as a tombstone so an offline device cannot resurrect
  -- it by pushing a copy it still holds.
  deleted_at timestamptz,

  constraint decks_pkey primary key (user_id, id),

  -- Exactly what the app accepts locally: any non-empty string. A stricter
  -- rule here would reject decks the app itself considers valid, which an
  -- imported backup can carry, and the upload would be the only thing to fail.
  constraint decks_id_not_empty check (char_length(id) > 0),

  constraint decks_deck_is_object check (jsonb_typeof(deck) = 'object')
);

-- Serves both "everything I own" and "what changed since my last sync".
create index decks_user_updated_at_idx
  on public.decks (user_id, updated_at desc);

-- Timestamps are assigned by the database so a device with a wrong clock
-- cannot make its rows look newer than they are.
create function public.decks_set_timestamps()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger decks_set_timestamps
  before insert or update on public.decks
  for each row execute function public.decks_set_timestamps();

alter table public.decks enable row level security;

-- Each policy names the authenticated role, so an anonymous caller is not a
-- candidate for it at all. auth.uid() is wrapped in a select so the planner
-- evaluates it once per statement rather than once per row.
create policy decks_select_own on public.decks
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy decks_insert_own on public.decks
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- `using` decides which rows may be updated, `with check` decides what they may
-- become. Both are required, or an owner could hand a row to another account.
create policy decks_update_own on public.decks
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- No delete policy on purpose. Removing a deck is an update that sets
-- deleted_at, and closing an account removes the rows through the cascade on
-- auth.users, so no client ever needs to delete a row directly.

-- Row level security narrows what a caller may reach; it does not grant the
-- privilege to reach it. This project was created with "automatically expose
-- new tables" off, so nothing is granted implicitly and the table privileges
-- have to be spelled out here.
--
-- Delete is withheld deliberately, which makes the missing delete policy above
-- a second lock rather than the only one. Nothing is granted to anon: an
-- anonymous caller has no business reaching this table at all.
grant select, insert, update
  on table public.decks
  to authenticated;
