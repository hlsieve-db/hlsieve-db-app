-- Cloud Sync Phase 7B-3B: writing a folder or a tag without reviving a deleted one.
--
-- A deleted folder or tag stays deleted. An offline device reconnecting with a
-- folder it has not heard about must not resurrect it for every other device,
-- because the reporter deleted it on purpose.
--
-- The rule needs a conditional upsert:
--
--   on conflict (user_id, id) do update ... where <table>.deleted_at is null
--
-- which the client library cannot express, so it lives here instead. A
-- tombstoned row is left alone and reported, not refused: refusing it would put
-- a write in the unsent-changes queue that can never succeed.
--
-- An organization is deliberately not given a function of its own. Like a deck,
-- its row says what the device holds now, so an ordinary upsert that clears
-- deleted_at is the correct behaviour there.
--
-- The previous migration is not edited: its production state is not known here,
-- and rewriting an applied file would leave the recorded history disagreeing
-- with the database.

create function public.upsert_deck_folder(
  p_id text,
  p_name text,
  p_sort_order integer
)
returns table (written boolean, skipped_tombstone boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected integer;
begin
  if p_id is null or char_length(p_id) = 0 then
    raise exception 'folder id must not be empty' using errcode = '22023';
  end if;

  -- Every other rule about the values — the trimmed name, its length, the
  -- order not being negative — stays in the table's own constraints, so this
  -- function cannot disagree with a write made any other way.
  insert into public.deck_folders (id, name, sort_order)
  values (p_id, p_name, p_sort_order)
      on conflict (user_id, id) do update
         set name = excluded.name,
             sort_order = excluded.sort_order
       where public.deck_folders.deleted_at is null;
  get diagnostics affected = row_count;

  if affected > 0 then
    return query select true, false;
    return;
  end if;

  -- Nothing was written, which for this statement means the row exists and is
  -- a tombstone. Reported so the caller can stop treating the write as
  -- outstanding rather than retrying it forever.
  return query select
    false,
    exists (
      select 1
        from public.deck_folders
       where user_id = (select auth.uid())
         and id = p_id
         and deleted_at is not null
    );
end;
$$;

create function public.upsert_deck_tag(p_id text, p_name text)
returns table (written boolean, skipped_tombstone boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected integer;
begin
  if p_id is null or char_length(p_id) = 0 then
    raise exception 'tag id must not be empty' using errcode = '22023';
  end if;

  insert into public.deck_tags (id, name)
  values (p_id, p_name)
      on conflict (user_id, id) do update
         set name = excluded.name
       where public.deck_tags.deleted_at is null;
  get diagnostics affected = row_count;

  if affected > 0 then
    return query select true, false;
    return;
  end if;

  return query select
    false,
    exists (
      select 1
        from public.deck_tags
       where user_id = (select auth.uid())
         and id = p_id
         and deleted_at is not null
    );
end;
$$;

revoke all on function
  public.upsert_deck_folder(text, text, integer) from public, anon;
revoke all on function public.upsert_deck_tag(text, text) from public, anon;

grant execute on function
  public.upsert_deck_folder(text, text, integer) to authenticated;
grant execute on function public.upsert_deck_tag(text, text) to authenticated;
