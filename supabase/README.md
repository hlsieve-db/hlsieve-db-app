# Supabase

Schema for the optional Cloud Sync. Every device still stores every deck in
IndexedDB and works without an account; an account adds a copy, it does not move
where the data lives.

**All five migrations are applied to production as of 2026-09-27**, in filename
order:

| Migration                                           | What it added                                     |
| --------------------------------------------------- | ------------------------------------------------- |
| `20260922000000_create_cloud_decks.sql`             | `decks`                                           |
| `20260922100000_create_deck_shares.sql`             | `deck_shares` and its two functions               |
| `20260925000000_create_cloud_deck_versions.sql`     | `deck_versions` and the parent tombstone          |
| `20260927000000_create_cloud_deck_organization.sql` | `deck_folders`, `deck_tags`, `deck_organizations` |
| `20260927100000_add_deck_definition_upsert.sql`     | the two definition upsert functions               |

The checks in this file were run against the production project after the last
two were applied: row level security on all three new tables, nine policies and
no DELETE policy, `select`/`insert`/`update` for `authenticated` only, nothing
for `anon`, every new function `security invoker` and unreachable by `anon`, and
`tombstone_deck_with_versions` unchanged. The existing rows were untouched.

A new migration goes on the end and is applied the same way. Nothing here is
`create ... if not exists`, so re-running an applied file fails loudly rather
than diverging quietly from this record.

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

The matrix is intentionally standalone and leaves its throwaway database spent
after the deliberate rollback test. Run it only against a container you are
about to discard, never against the project.

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
three earlier migrations and needs nothing else, and
`20260927100000_add_deck_definition_upsert.sql` runs after it. Both were applied
on 2026-09-27. Neither changes `tombstone_deck_with_versions`, so a build
already in use kept working, and neither adds a store to IndexedDB, so
`DB_VERSION` was unaffected.

**Never run `tests/deck_organization_matrix.sql` against the project.** It
creates its own `auth` schema and its last section deletes an account to prove
the cascade. It belongs to a throwaway container only, like the other matrices.

`docs/deploy/phase-7b3e-production.md` records how that apply was carried out,
including the verification queries, and is the starting point for the next
schema change.

## What production has that this repository does not

The project carries a function `rls_auto_enable` and an event trigger
`ensure_rls`, which turns row level security on for a newly created table. They
were made in the dashboard and are not recorded in any migration here, so a
throwaway Postgres built from `migrations/` alone does not have them.

Every migration in this directory enables row level security itself, so the two
overlap rather than depend on each other, and either one alone is enough. The
2026-09-27 apply was checked for this: `ensure_rls` left the grants exactly as
the migration wrote them, and the policy list matched the file.

Keep enabling row level security explicitly in new migrations. Relying on the
event trigger would make the repository's own SQL incomplete, and a check run
against a container would pass while the real table was unprotected.

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
- **Two functions delete a deck, and both must stay.**
  `tombstone_deck_with_related` also tombstones the deck's organization row;
  `tombstone_deck_with_versions` predates it and does not. A tab loaded before
  the newer one existed keeps calling the older one, so removing it would break
  that tab until it is reloaded. The client tries the newer one first and falls
  back only on "no such function". They agree in either order, because each one
  only tombstones what is still active.
- **After any schema change, ask PostgREST to reload:**
  ```sql
  notify pgrst, 'reload schema';
  ```
  Supabase reloads on its own within about a minute, and the app treats a table
  it cannot see yet as "nowhere to send this", so nothing is lost either way.
  The notify just makes the moment predictable.
