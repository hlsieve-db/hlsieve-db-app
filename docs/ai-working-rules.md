# AI Working Rules — Minimal Context / Scoped Task Mode

These rules apply equally to Codex and Claude Code. They are the shared source
of truth for AI-assisted work in HLSieve DB.

## Core principle

Read the minimum information required to complete the current task safely. Do
not try to understand the entire repository before beginning.

Search first, read second. Locate the relevant symbols and files, then open
only what the task requires.

## Repository exploration

At the start of a task, the following checks are appropriate when relevant:

- `git status`, the current branch, and `HEAD`
- `git diff --name-only`
- targeted `rg` or `grep` searches for relevant symbols and filenames
- files explicitly named by the task

Do not routinely read or enumerate all of `src/`, tests, migrations, or docs.
Do not fetch a large Git history or read surrounding code “just in case.”

Start with a working read budget of approximately:

- six production files
- three test files

This is guidance, not an absolute limit. Read additional files only when there
is a concrete task-specific reason.

## Large files and generated data

Unless the task directly requires them, do not read:

- `public/cards.json`
- `public/card-printings.json`
- `node_modules/`
- `dist/`
- `coverage/`
- lockfiles
- generated output
- large fixtures

When card data or another large file must be checked, extract only the needed
information with `rg`, `grep`, `jq`, or a small focused script. Do not load the
whole file into context.

## Tests and validation

During implementation, run targeted tests for the area being changed. Run the
full project gate once after the implementation is complete.

Do not rerun the full suite after every small edit. Additional full runs are
appropriate only for major changes or when diagnosing a failure that targeted
checks cannot explain.

## Re-reading files

Do not repeatedly reload an unchanged file in full. After editing, prefer:

- the relevant lines around the change
- `git diff` for the edited file
- a targeted test or check

## Scope control

Do not expand a task into unrelated:

- refactoring or cleanup
- architecture changes
- documentation
- UI changes
- route changes

If safe completion requires a substantial scope increase, stop and report what
must be inspected and why instead of loading a large area of the repository.

## Git safety

Do not commit or push without explicit approval. A normal approved push is:

```sh
git push origin main
```

Do not use any of the following unless a task explicitly authorizes the exact
operation:

- amend
- rebase
- squash
- force or `--force-with-lease`
- reset
- checkout
- restore
- clean
- stash
- any other history rewrite

## HLSieve DB protected areas

Do not change these areas unless the current task directly requires it:

- `public/cards.json`
- `public/card-printings.json`
- share formats, including short share
- backup formats
- regulation definitions
- Supabase migrations
- update history
- SEO or prerender behavior
- unrelated UI
- unrelated routes

## Git history

Current code is the source of truth. Do not read the full Git log. If history
is needed, keep it focused, for example:

```sh
git log -5 --oneline
git log -5 -- path/to/file
```

## Documentation

Do not read all of `docs/` unless the task requires documentation-wide work.
Read only the relevant document. Likewise, read only the necessary section of
`README.md`.

## Reporting

Keep completion reports concise and focused on:

- what was implemented
- changed files
- tests and validation
- unresolved items

Do not repeat known project specifications at length in every report.

## Agent handoff

Codex and Claude Code must apply this same rule set. When work changes hands,
prefer the current repository state and the task-specific prompt over rereading
a long prior conversation.
