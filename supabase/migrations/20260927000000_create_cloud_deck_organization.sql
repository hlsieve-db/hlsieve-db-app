-- Cloud Sync Phase 7B-3A: folders, tags, and what each deck is organized by.
--
-- The application already stores these three things in IndexedDB. This adds the
-- account-side copy, following the decks table: the row carries the values the
-- app holds, the sync bookkeeping lives in columns, and a removed row is kept
-- as a tombstone so an offline device cannot resurrect it by pushing a copy.
--
-- Deliberately absent:
--
--   * No unique constraint on a folder or tag name. Two devices can each create
--     "大会用" with different ids while offline, and a unique name would make
--     one of them fail to sync for good. The application already numbers a
--     clashing name on import instead.
--   * No foreign key from deck_organizations.tag_ids: a foreign key cannot be
--     declared on an array element. Removing a tag from every deck is done by
--     the RPC below, and an unresolved id is dropped when the row is read.
--   * No immutability trigger. Unlike a deck version, a folder is editable, and
--     clearing deleted_at is how "this device still has it" is expressed, the
--     same as for decks.

-- --------------------------------------------------------------------- folders
create table public.deck_folders (
  -- Defaulted from the session so a client cannot claim another account's row,
  -- and null for an anonymous caller, which the not null constraint rejects.
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,

  -- Text rather than uuid, as with decks: an imported backup keeps whatever id
  -- it carried, and a uuid column would refuse ids the app itself accepts.
  id text not null,

  name text not null,

  -- The order the reporter arranged, as the application stores it. Reordering
  -- writes every folder, so this column is not a conflict of its own: a later
  -- write simply wins.
  sort_order integer not null default 0,

  -- These carry the row's sync times, not the folder's own. The application
  -- keeps a createdAt and an updatedAt of its own for the same folder, and a
  -- round trip through the account replaces them with these server values.
  --
  -- So reconciliation compares only what the reporter chose, never a timestamp:
  --
  --   folder        name only (sort_order is not a conflict: a later write wins)
  --   tag           name only
  --   organization  folder_id and tag_ids, with tag_ids normalised first
  --
  -- Comparing whole objects would report every row as a conflict the first time
  -- a second device syncs.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint deck_folders_pkey primary key (user_id, id),
  constraint deck_folders_id_not_empty check (char_length(id) > 0),

  -- Exactly the rule the application enforces locally, including that the name
  -- is stored already trimmed, so a value the app would refuse to read back
  -- cannot be stored here either.
  constraint deck_folders_name_valid check (
    name = btrim(name)
    and char_length(name) > 0
    and char_length(name) <= 50
  ),
  constraint deck_folders_sort_order_not_negative check (sort_order >= 0)
);

-- Serves both "everything I own" and "what changed since my last sync".
create index deck_folders_user_updated_at_idx
  on public.deck_folders (user_id, updated_at desc);

-- ------------------------------------------------------------------------ tags
create table public.deck_tags (
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint deck_tags_pkey primary key (user_id, id),
  constraint deck_tags_id_not_empty check (char_length(id) > 0),
  constraint deck_tags_name_valid check (
    name = btrim(name)
    and char_length(name) > 0
    and char_length(name) <= 30
  )
);

create index deck_tags_user_updated_at_idx
  on public.deck_tags (user_id, updated_at desc);

-- ---------------------------------------------------------------- organization
-- A check constraint may not contain a subquery, so the list rules live in one
-- immutable function instead of being spread across several checks.
create function public.deck_organization_tag_ids_valid(tag_ids text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select tag_ids is not null
     and array_position(tag_ids, null) is null
     and array_position(tag_ids, '') is null
     -- At most ten per deck, and no repeats, which is what the application
     -- stores. Order is not checked here: it is normalised when read.
     and cardinality(tag_ids) <= 10
     and cardinality(tag_ids) = (
       select count(distinct value) from unnest(tag_ids) as value
     );
$$;

-- What one deck is organized by.
--
-- Three states are distinct and all three are meaningful:
--
--   * deleted_at set                  the organization itself was deleted
--   * tag_ids '{}' and folder_id null the reporter explicitly cleared everything
--   * no row at all                   the deck has never been organized
--
-- The middle one is why an empty row is never removed as redundant, and why the
-- application keeps writing it.
create table public.deck_organizations (
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,

  -- One row per deck, which is how the application stores it locally too.
  deck_id text not null,

  -- Null means no folder. The application represents that as the absence of the
  -- property, and its cloud repository is the one place that converts.
  folder_id text,

  tag_ids text[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint deck_organizations_pkey primary key (user_id, deck_id),

  -- The row describes a deck, so it cannot exist without one. A tombstoned deck
  -- keeps its row, so this does not remove the organization when a deck is
  -- deleted; the RPC below tombstones it instead.
  constraint deck_organizations_parent_fkey
    foreign key (user_id, deck_id)
    references public.decks (user_id, id)
    on delete cascade,

  -- The folder has to exist, which is also what the application requires of
  -- itself. A deleted folder keeps its row, so this stays satisfied after a
  -- folder is removed, and the RPC clears the reference anyway.
  constraint deck_organizations_folder_fkey
    foreign key (user_id, folder_id)
    references public.deck_folders (user_id, id),

  constraint deck_organizations_deck_id_not_empty check (char_length(deck_id) > 0),
  constraint deck_organizations_folder_id_not_empty check (
    folder_id is null or char_length(folder_id) > 0
  ),
  constraint deck_organizations_tag_ids_valid check (
    public.deck_organization_tag_ids_valid(tag_ids)
  )
);

create index deck_organizations_user_updated_at_idx
  on public.deck_organizations (user_id, updated_at desc);

-- Clearing one folder from every deck that names it is the one access path the
-- primary key does not serve.
create index deck_organizations_user_folder_idx
  on public.deck_organizations (user_id, folder_id)
  where folder_id is not null;

-- -------------------------------------------------------------- server clocks
-- Timestamps are assigned by the database so a device with a wrong clock cannot
-- make its rows look newer than they are, and so a deletion time cannot be
-- backdated or quietly moved by a repeated tombstone.
create function public.deck_organization_set_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    if new.deleted_at is not null then
      new.deleted_at := now();
    end if;
  else
    new.created_at := old.created_at;
    if new.deleted_at is null then
      -- Clearing deleted_at is permitted by the schema, but only one of these
      -- three rows may actually be brought back that way.
      --
      -- An organization may: like a deck, the row says what the device holds
      -- now, and an upsert from a device that still organizes that deck is that
      -- device saying so.
      --
      -- A folder or a tag may NOT. A deleted definition stays deleted, because
      -- an offline device reconnecting with a folder it has not heard about
      -- would otherwise resurrect it for every device, and the reporter deleted
      -- it on purpose. The rule is enforced by the client instead of here: a
      -- folder or tag upsert is written as
      --
      --   on conflict (user_id, id) do update ... where <table>.deleted_at is null
      --
      -- so a tombstoned row is left alone rather than refused, which keeps the
      -- unsent-changes queue from filling with a write that can never succeed.
      -- Refusing it in this trigger would do the opposite.
      null;
    elsif old.deleted_at is not null then
      -- Repeating a tombstone is idempotent and keeps the first deletion time.
      new.deleted_at := old.deleted_at;
    else
      new.deleted_at := now();
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger deck_folders_set_timestamps
  before insert or update on public.deck_folders
  for each row execute function public.deck_organization_set_timestamps();

create trigger deck_tags_set_timestamps
  before insert or update on public.deck_tags
  for each row execute function public.deck_organization_set_timestamps();

create trigger deck_organizations_set_timestamps
  before insert or update on public.deck_organizations
  for each row execute function public.deck_organization_set_timestamps();

-- --------------------------------------------------------- row level security
alter table public.deck_folders enable row level security;
alter table public.deck_tags enable row level security;
alter table public.deck_organizations enable row level security;

-- Each policy names the authenticated role, so an anonymous caller is not a
-- candidate for it at all. auth.uid() is wrapped in a select so the planner
-- evaluates it once per statement rather than once per row.
create policy deck_folders_select_own on public.deck_folders
  for select to authenticated using ((select auth.uid()) = user_id);

create policy deck_folders_insert_own on public.deck_folders
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- `using` decides which rows may be updated, `with check` decides what they may
-- become. Both are required, or an owner could hand a row to another account.
create policy deck_folders_update_own on public.deck_folders
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy deck_tags_select_own on public.deck_tags
  for select to authenticated using ((select auth.uid()) = user_id);

create policy deck_tags_insert_own on public.deck_tags
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy deck_tags_update_own on public.deck_tags
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy deck_organizations_select_own on public.deck_organizations
  for select to authenticated using ((select auth.uid()) = user_id);

create policy deck_organizations_insert_own on public.deck_organizations
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy deck_organizations_update_own on public.deck_organizations
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- No delete policy on any of the three, on purpose. Removing a folder, a tag or
-- an organization is an update that sets deleted_at, and closing an account
-- removes the rows through the cascade on auth.users.

-- Row level security narrows what a caller may reach; it does not grant the
-- privilege to reach it. Nothing is granted implicitly in this project, so the
-- table privileges are spelled out, delete is withheld deliberately, and
-- nothing at all is granted to anon.
grant select, insert, update on table public.deck_folders to authenticated;
grant select, insert, update on table public.deck_tags to authenticated;
grant select, insert, update on table public.deck_organizations to authenticated;

-- ------------------------------------------------------------------------ RPCs
-- Each function is SECURITY INVOKER, so its statements remain subject to row
-- level security and a caller can only ever reach its own rows.

-- Removes one folder and takes it off every deck that named it, as one
-- transaction, and reports how many decks that was. The decks themselves stay:
-- a deck pointing at a folder that no longer exists is a state nothing in the
-- application can describe.
create function public.tombstone_deck_folder(p_folder_id text)
returns table (folder_found boolean, organizations_cleared integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  cleared integer;
  found boolean;
begin
  if p_folder_id is null or char_length(p_folder_id) = 0 then
    raise exception 'folder id must not be empty' using errcode = '22023';
  end if;

  select exists (
    select 1
      from public.deck_folders
     where user_id = (select auth.uid())
       and id = p_folder_id
       and deleted_at is null
  ) into found;

  -- The references go first, so no moment inside the transaction has a row
  -- naming a folder that is already gone.
  update public.deck_organizations
     set folder_id = null
   where user_id = (select auth.uid())
     and folder_id = p_folder_id
     and deleted_at is null;
  get diagnostics cleared = row_count;

  update public.deck_folders
     set deleted_at = now()
   where user_id = (select auth.uid())
     and id = p_folder_id
     and deleted_at is null;

  return query select found, cleared;
end;
$$;

-- Removes one tag and takes it off every deck carrying it, as one transaction,
-- and reports how many decks that was. array_remove keeps the remaining order,
-- which is already the order the application stores.
create function public.tombstone_deck_tag(p_tag_id text)
returns table (tag_found boolean, organizations_cleared integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  cleared integer;
  found boolean;
begin
  if p_tag_id is null or char_length(p_tag_id) = 0 then
    raise exception 'tag id must not be empty' using errcode = '22023';
  end if;

  select exists (
    select 1
      from public.deck_tags
     where user_id = (select auth.uid())
       and id = p_tag_id
       and deleted_at is null
  ) into found;

  update public.deck_organizations
     set tag_ids = array_remove(tag_ids, p_tag_id)
   where user_id = (select auth.uid())
     and tag_ids @> array[p_tag_id]
     and deleted_at is null;
  get diagnostics cleared = row_count;

  update public.deck_tags
     set deleted_at = now()
   where user_id = (select auth.uid())
     and id = p_tag_id
     and deleted_at is null;

  return query select found, cleared;
end;
$$;

-- Deletes one deck and everything that only describes that deck: its versions
-- and its organization, as one transaction.
--
-- tombstone_deck_with_versions is left exactly as it was. A deployed build calls
-- it by name and checks its result columns, so this is an additional function
-- rather than a change to that one.
create function public.tombstone_deck_with_related(p_deck_id text)
returns table (
  deck_found boolean,
  versions_tombstoned integer,
  organization_tombstoned boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  child_count integer;
  organization_count integer;
  parent_found boolean;
begin
  if p_deck_id is null or char_length(p_deck_id) = 0 then
    raise exception 'deck id must not be empty' using errcode = '22023';
  end if;

  select exists (
    select 1
      from public.decks
     where user_id = (select auth.uid())
       and id = p_deck_id
  ) into parent_found;

  update public.deck_versions
     set deleted_at = now()
   where user_id = (select auth.uid())
     and deck_id = p_deck_id
     and deleted_at is null;
  get diagnostics child_count = row_count;

  update public.deck_organizations
     set deleted_at = now()
   where user_id = (select auth.uid())
     and deck_id = p_deck_id
     and deleted_at is null;
  get diagnostics organization_count = row_count;

  update public.decks
     set deleted_at = now()
   where user_id = (select auth.uid())
     and id = p_deck_id
     and deleted_at is null;

  return query select parent_found, child_count, organization_count > 0;
end;
$$;

-- Functions are executable by PUBLIC unless explicitly narrowed.
revoke all on function
  public.deck_organization_tag_ids_valid(text[]) from public;
revoke all on function public.deck_organization_set_timestamps() from public;
revoke all on function public.tombstone_deck_folder(text) from public, anon;
revoke all on function public.tombstone_deck_tag(text) from public, anon;
revoke all on function public.tombstone_deck_with_related(text) from public, anon;

-- A check constraint is evaluated as the caller, not as the table owner, so the
-- role doing the insert needs execute on the function the constraint calls.
-- Without this, every organization write is refused; the matrix covers it.
grant execute on function
  public.deck_organization_tag_ids_valid(text[]) to authenticated;

grant execute on function public.tombstone_deck_folder(text) to authenticated;
grant execute on function public.tombstone_deck_tag(text) to authenticated;
grant execute on function public.tombstone_deck_with_related(text)
  to authenticated;
