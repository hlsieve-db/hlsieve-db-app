-- Short deck share links: /s/<shareId>.
--
-- Deliberately separate from public.decks. A share is an immutable snapshot
-- that anyone holding the link may read, owned by nobody; a deck row is private
-- to one account and mutable. Mixing the two would mean one table whose rows
-- follow two different access rules, so nothing here touches public.decks.
--
-- The table is unreachable from the API. No role is granted anything on it and
-- row level security is on with no policy, so the only way in is the two
-- functions below, which run as their owner and each touch exactly one row.
-- That is what stops a caller from enumerating every shared deck.
--
-- Creating a share needs an account; reading one does not. Anonymous creation
-- would let anyone fill the database with 12KB rows, and this database also
-- holds the cloud decks, so the damage would not stop at sharing. Anonymous
-- users keep the long /deck/share URL, which needs no server at all, so
-- nothing they could do before is taken away.

create table public.deck_shares (
  -- Eight base62 characters, from a cryptographically random source. Not
  -- derived from the deck, the account or the clock: the id is the only secret
  -- protecting the snapshot, so it must not be guessable from anything the
  -- sharer already published.
  share_id text not null,

  -- The existing SharedDeckPayloadV1: { v, name, entries }. No account
  -- identifier, no email and no local deck id, because the payload the client
  -- already builds for the long URL contains none of those.
  --
  -- There is deliberately no creator column either. Signing in is required to
  -- create a share, but who created it is not recorded: the snapshot is not
  -- owned, listed or deletable per user, so storing an account id would add a
  -- link between a person and a deck that nothing needs.
  deck jsonb not null,

  created_at timestamptz not null default now(),

  constraint deck_shares_pkey primary key (share_id),
  constraint deck_shares_id_is_base62 check (share_id ~ '^[A-Za-z0-9]{8}$'),
  constraint deck_shares_deck_is_object check (jsonb_typeof(deck) = 'object'),

  -- The same ceiling the client enforces in MAX_SHARED_DECK_JSON_LENGTH, so a
  -- payload the browser would refuse to encode cannot be stored by calling the
  -- function directly. jsonb::text is compact, so this is never looser than the
  -- client's own check.
  constraint deck_shares_deck_within_size check (length(deck::text) <= 12000)
);

comment on table public.deck_shares is
  'Immutable deck snapshots addressed by a random short id. Reachable only through create_deck_share and get_deck_share.';

-- Eight base62 characters derived from gen_random_uuid(), which is a
-- cryptographically strong source in core Postgres, so pgcrypto is not needed.
-- The 128 random bits are folded into one integer before the base62 digits are
-- taken, which keeps the modulo bias far below anything observable.
create function public.generate_deck_share_id()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text :=
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  raw bytea := pg_catalog.uuid_send(pg_catalog.gen_random_uuid());
  value numeric := 0;
  result text := '';
  index int;
begin
  for index in 0..15 loop
    value := value * 256 + pg_catalog.get_byte(raw, index);
  end loop;
  for index in 1..8 loop
    result := result || pg_catalog.substr(alphabet, (value % 62)::int + 1, 1);
    value := pg_catalog.div(value, 62);
  end loop;
  return result;
end;
$$;

-- Stores one snapshot and returns its id.
--
-- security definer, because the caller has no privilege on the table. The
-- search_path is pinned empty and every reference is schema qualified, so the
-- body cannot be redirected by a caller-controlled path. There is no dynamic
-- SQL: the payload is only ever bound as a parameter.
create function public.create_deck_share(deck jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  candidate text;
  attempt int;
begin
  -- Checked in the body as well as through the grant. A grant is one revoke
  -- away from being wrong, and this is the only thing standing between an
  -- anonymous caller and unbounded writes, so it does not rest on one control.
  if auth.uid() is null then
    raise exception 'Creating a deck share requires a signed in account.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Validated here as well as in the browser, because this function is the
  -- real entry point and the browser is not a trusted caller.
  if deck is null or pg_catalog.jsonb_typeof(deck) <> 'object' then
    raise exception 'A deck share payload must be a JSON object.'
      using errcode = 'invalid_parameter_value';
  end if;
  if (deck ->> 'v') is distinct from '1' then
    raise exception 'Unsupported deck share payload version.'
      using errcode = 'invalid_parameter_value';
  end if;
  -- coalesce, because jsonb_typeof of an absent key is SQL NULL rather than
  -- 'null', and a NULL comparison would let a payload with no name through.
  -- It is left unqualified because coalesce is a SQL construct resolved by the
  -- parser, not a function the empty search_path could hide.
  if coalesce(pg_catalog.jsonb_typeof(deck -> 'name'), 'absent') <> 'string'
     or pg_catalog.length(pg_catalog.btrim(deck ->> 'name')) = 0 then
    raise exception 'A deck share payload needs a name.'
      using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(pg_catalog.jsonb_typeof(deck -> 'entries'), 'absent')
       <> 'array' then
    raise exception 'A deck share payload needs an entries array.'
      using errcode = 'invalid_parameter_value';
  end if;
  if pg_catalog.jsonb_array_length(deck -> 'entries') > 200 then
    raise exception 'A deck share payload holds too many entries.'
      using errcode = 'invalid_parameter_value';
  end if;
  if pg_catalog.length(deck::text) > 12000 then
    raise exception 'A deck share payload is too large.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- A collision is astronomically unlikely, but it is cheap to survive one and
  -- expensive to debug if it ever happens, so the id is reallocated here rather
  -- than surfacing a unique violation to the browser.
  for attempt in 1..8 loop
    candidate := public.generate_deck_share_id();
    begin
      insert into public.deck_shares (share_id, deck)
        values (candidate, create_deck_share.deck);
      return candidate;
    exception
      when unique_violation then null;
    end;
  end loop;

  raise exception 'Could not allocate an unused deck share id.';
end;
$$;

-- Returns one snapshot, or null when the id is unknown. Takes an exact id and
-- returns at most one row on purpose: there is no way to ask for a list, a
-- range or a count, so holding one link reveals nothing about any other.
create function public.get_deck_share(share_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select shares.deck
    from public.deck_shares as shares
   where shares.share_id = get_deck_share.share_id
     and get_deck_share.share_id ~ '^[A-Za-z0-9]{8}$'
$$;

alter table public.deck_shares enable row level security;

-- No policy is defined on purpose. With row level security on and nothing
-- granted, both locks have to be removed before the table becomes reachable.
revoke all on table public.deck_shares from anon, authenticated;

-- Postgres grants execute on a new function to PUBLIC, which would hand these
-- security definer functions to every role. Both are taken back first.
revoke all on function public.generate_deck_share_id() from public;
revoke all on function public.create_deck_share(jsonb) from public;
revoke all on function public.get_deck_share(text) from public;

-- The id generator stays internal. Creating is for signed in callers only;
-- reading is open, because a share link is meant to be opened by anyone it is
-- sent to, signed in or not.
grant execute on function public.create_deck_share(jsonb) to authenticated;
grant execute on function public.get_deck_share(text) to anon, authenticated;
