# Supabase

Schema for the optional Cloud Sync. Nothing in the application runtime reads
this yet: HLSieve still stores every deck in IndexedDB and works without an
account.

**None of this SQL has been run yet.** It is reviewed but unexecuted: no
Postgres was available when it was written, and no project has had the
migration applied. Before relying on it, apply the migration to a real
Postgres and run the row level security checks below.

```
supabase/
  migrations/  applied in filename order
  tests/       runnable checks, not part of the app test suite
```

## Applying a migration

There is no Supabase CLI in this repository and no dependency was added for
one. Apply `migrations/*.sql` in filename order, either by pasting it into the
SQL editor of the project or with `psql` against its connection string.

Migrations are written to run once, in order. They do not use
`create ... if not exists`, so a second run fails loudly instead of quietly
diverging from the recorded history.

## Checking row level security

`tests/rls_matrix.sql` covers what each caller may do: an owner, a different
signed-in account, and an anonymous one. It stubs `auth.users` and `auth.uid()`
so it can run against a throwaway Postgres:

```sh
docker run --rm -d --name hlsieve-pg -e POSTGRES_PASSWORD=x postgres:16-alpine
docker cp supabase hlsieve-pg:/work
docker exec -u postgres hlsieve-pg \
  psql -v ON_ERROR_STOP=0 -f /work/tests/rls_matrix.sql
docker rm -f hlsieve-pg
```

Statements marked `expect: error` are meant to fail; `ON_ERROR_STOP=0` keeps the
run going so one pass covers the whole matrix.

Run it as a role that neither owns the table nor is a superuser, as the script
does with `set role`. Those two bypass row level security, so a broken policy
would still let every check pass.

## Checking the short deck share rules

`tests/deck_shares_matrix.sql` covers the other half: that nothing can reach
`deck_shares` except through the two functions, that the payload checks hold,
and that a colliding id is reallocated rather than surfacing an error.

```sh
docker run --rm -d --name hlsieve-pg -e POSTGRES_PASSWORD=x postgres:16-alpine
docker cp supabase hlsieve-pg:/work
docker exec -u postgres hlsieve-pg   psql -v ON_ERROR_STOP=0 -f /work/tests/deck_shares_matrix.sql
docker rm -f hlsieve-pg
```

It needs no auth stubs: a share belongs to nobody, and creating one works
signed out. Its last section replaces the id generator with a stub to reach the
retry path and does not put it back, so discard the container afterwards.

## Checking DeckVersion rules

`tests/deck_versions_matrix.sql` applies the deck and DeckVersion migrations to
a throwaway Postgres. It covers the composite key and parent foreign key, row
isolation, immutable snapshot fields, one-way tombstones, server deletion
timestamps, and the atomic parent-plus-children tombstone function.

```sh
docker run --rm -d --name hlsieve-pg -e POSTGRES_PASSWORD=x postgres:16-alpine
docker cp supabase hlsieve-pg:/work
docker exec -u postgres hlsieve-pg \
  psql -v ON_ERROR_STOP=0 -f /work/tests/deck_versions_matrix.sql
docker rm -f hlsieve-pg
```

It has not been applied to production. The matrix is intentionally standalone
and leaves its throwaway database spent after the deliberate rollback test.

## Checking folder, tag and organization rules

`tests/deck_organization_matrix.sql` applies all four migrations in filename
order to a throwaway Postgres — the organization tables have foreign keys into
`decks`, so the earlier ones have to be there first. It covers the composite
keys, the deck and folder foreign keys, that no name is unique, the narrow
privileges, row isolation between two accounts and an anonymous caller, the
three organization states, server-assigned timestamps, a deletion time that
cannot be backdated or moved, revival being permitted (unlike a deck version),
the three tombstone functions with their reported counts, that
`tombstone_deck_with_versions` is left as the deployed build calls it, and the
cascade when an account is removed.

```sh
docker run --rm -d --name hlsieve-pg -e POSTGRES_PASSWORD=x postgres:16-alpine
docker cp supabase hlsieve-pg:/work
docker exec -u postgres hlsieve-pg   psql -v ON_ERROR_STOP=0 -f /work/tests/deck_organization_matrix.sql
docker rm -f hlsieve-pg
```

Its last section deletes an account to prove the cascade, so the database is
spent afterwards; discard the container.

It was run this way on postgres:16-alpine (Docker engine 29.3.1) and every
check matched its `expect:` line. The nineteen errors in the output are the
deliberate ones: three name checks, one sort order, the deck and folder foreign
keys, an empty folder id, three tag-list rules, an empty argument to the folder
function, two attempts by one account to write another'''s row, and three inserts
and three function calls as an anonymous caller. Errors and results are printed
on different streams, so a deliberate error can appear one check later than the
`echo` it belongs to.

The matrix also pins the rule the schema cannot state. Clearing `deleted_at` is
permitted by the table, but only an organization is actually brought back that
way. A folder or tag upsert is written as

```sql
insert into public.deck_folders (id, name, sort_order) values (...)
    on conflict (user_id, id) do update
       set name = excluded.name, sort_order = excluded.sort_order,
           deleted_at = null
     where public.deck_folders.deleted_at is null;
```

so a deleted definition stays deleted when an offline device reconnects with a
folder it has not heard about, while an active one is still updated. It is left
alone rather than refused, so the unsent-changes queue cannot fill with a write
that can never succeed. The client implements this in 7B-3B.

Reconciliation compares only what the reporter chose, never a timestamp: a
folder and a tag by `name` alone, an organization by `folder_id` and its
normalised `tag_ids`. `sort_order` is not a conflict — a later write wins.
These three tables merge the application's own timestamps with the row's sync
times, so a round trip replaces `createdAt` and `updatedAt`, and comparing whole
objects would report every row as a conflict the first time a second device
syncs.

That run also caught a real defect, which is fixed in the migration: a check
constraint is evaluated as the caller, so `authenticated` needs execute on
`deck_organization_tag_ids_valid`. Without the grant, every write to
`deck_organizations` was refused with "permission denied for function".

### Applying it

`migrations/20260927000000_create_cloud_deck_organization.sql` runs after the
three earlier migrations and needs nothing else. It has not been applied to
production. It does not change `tombstone_deck_with_versions`, so a build
already in use keeps working after it is applied, and it adds no store to
IndexedDB, so `DB_VERSION` is unaffected.

## Conventions

- The frontend uses the publishable key only. The secret key never reaches the
  browser, which is a static bundle on Cloudflare Pages and cannot hide one.
  (The `anon` role the policies mention is a Postgres role, not an API key.)
- `user_id` defaults to `auth.uid()` and is checked again by the policies, so a
  client cannot claim another account's row by sending its id.
- A deck is stored as the `Deck` object the app already has. Sync bookkeeping
  lives in columns, so the domain type, the share link format and the backup
  format stay unchanged.
- `created_at` and `updated_at` are set by the database and describe when the
  row was synced. When the user last edited the deck stays inside the `deck`
  JSON, where it already lives.
- Deleting a deck sets `deleted_at`. Rows are removed only when the account is,
  through the cascade on `auth.users`.
