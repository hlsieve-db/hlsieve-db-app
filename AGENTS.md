# HLSieve DB Agent Rules

Before starting any task, read and follow
[`docs/ai-working-rules.md`](docs/ai-working-rules.md). These rules are
mandatory.

Use Minimal Context / Scoped Task Mode:

- Search first, then read only the files required for the current task.
- Do not scan the whole repository.
- Prefer targeted tests while implementing; run the full gate once at the end.
- Do not expand the task into unrelated cleanup, refactoring, UI, or docs work.
- Do not commit or push without explicit approval.
