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

## Conventions

- The frontend uses the anon key only. The service role key never reaches the
  browser, which is a static bundle on Cloudflare Pages and cannot hide one.
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
