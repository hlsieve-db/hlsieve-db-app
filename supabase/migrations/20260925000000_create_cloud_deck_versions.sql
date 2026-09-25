-- Cloud Sync Phase 7A-2A: immutable manual deck snapshots.
--
-- The application stores the same snapshot shape it keeps in IndexedDB. A row
-- may only move from active to deleted; the snapshot itself never changes.

create table public.deck_versions (
  user_id uuid not null default auth.uid(),
  id text not null,
  deck_id text not null,
  label text not null,
  snapshot jsonb not null,

  -- This is DeckVersion.createdAt, not a sync receipt timestamp, so the value
  -- supplied by the creating device is retained.
  created_at timestamptz not null,
  deleted_at timestamptz,

  constraint deck_versions_pkey primary key (user_id, id),
  constraint deck_versions_parent_fkey
    foreign key (user_id, deck_id)
    references public.decks (user_id, id)
    on delete cascade,
  constraint deck_versions_id_not_empty check (char_length(id) > 0),
  constraint deck_versions_deck_id_not_empty check (char_length(deck_id) > 0),
  constraint deck_versions_label_valid check (
    char_length(btrim(label)) > 0 and char_length(label) <= 50
  ),
  constraint deck_versions_snapshot_is_object check (
    jsonb_typeof(snapshot) = 'object'
  )
);

-- The primary key serves id lookups. This separate access path is needed for
-- listing and tombstoning every version belonging to one parent deck.
create index deck_versions_user_deck_idx
  on public.deck_versions (user_id, deck_id);

create function public.deck_versions_protect_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.id is distinct from old.id
     or new.deck_id is distinct from old.deck_id
     or new.label is distinct from old.label
     or new.snapshot is distinct from old.snapshot
     or new.created_at is distinct from old.created_at then
    raise exception 'deck version content is immutable'
      using errcode = '22000';
  end if;

  if old.deleted_at is not null then
    if new.deleted_at is null then
      raise exception 'a deck version tombstone cannot be revived'
        using errcode = '22000';
    end if;
    -- Repeating a tombstone is idempotent and keeps the first deletion time.
    new.deleted_at := old.deleted_at;
    return new;
  end if;

  if new.deleted_at is null then
    raise exception 'the only permitted deck version update is tombstoning'
      using errcode = '22000';
  end if;

  -- A client supplies only the intent. The database supplies the time.
  new.deleted_at := now();
  return new;
end;
$$;

create trigger deck_versions_protect_immutable
  before update on public.deck_versions
  for each row execute function public.deck_versions_protect_immutable();

alter table public.deck_versions enable row level security;

create policy deck_versions_select_own on public.deck_versions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy deck_versions_insert_own on public.deck_versions
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and deleted_at is null
  );

create policy deck_versions_update_own on public.deck_versions
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- No DELETE policy and no DELETE grant. Account removal physically deletes the
-- parent deck, whose foreign-key cascade then removes its versions.
grant select, insert, update
  on table public.deck_versions
  to authenticated;

-- Deletes one parent and every active child tombstone as one transaction. The
-- function is SECURITY INVOKER and its statements remain subject to RLS.
create function public.tombstone_deck_with_versions(p_deck_id text)
returns table (deck_found boolean, versions_tombstoned integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  child_count integer;
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

  update public.decks
     set deleted_at = now()
   where user_id = (select auth.uid())
     and id = p_deck_id
     and deleted_at is null;

  return query select parent_found, child_count;
end;
$$;

-- Functions are executable by PUBLIC unless explicitly narrowed.
revoke all on function public.deck_versions_protect_immutable() from public;
revoke all on function public.tombstone_deck_with_versions(text) from public;
revoke all on function public.tombstone_deck_with_versions(text) from anon;
grant execute on function public.tombstone_deck_with_versions(text)
  to authenticated;
