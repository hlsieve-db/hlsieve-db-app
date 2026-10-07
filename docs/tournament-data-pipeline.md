# Tournament data pipeline

Tournament data enters the application through the Phase 9B contract:

```text
TournamentImportPayload
  -> normalize / validate / merge
  -> published static JSON
  -> Tournament UI
```

Development and tests may use synthetic fixtures, but synthetic data must not
be published as real Production tournament results. A future official API,
improved public surface, authorized feed, or organizer-provided dataset should
continue to produce `TournamentImportPayload` so the downstream contract can
remain unchanged.

## Phase 9C collector status

The local headed Chromium collector is usable when collection starts from a
known public Bushi Navi Event. It has been verified to read the public Result
detail DOM, obtain the `sourceEventId` and ranks, follow public DECK LOG pages,
extract Deck Log codes and Oshi/Main/Cheer card numbers and quantities, produce
`TournamentImportPayload`, and pass it to the Phase 9B normalization and
validation pipeline.

Complete Event discovery is not currently supported. In particular:

- A single day on `/event/result/list` reached its 10-result boundary, but
  complete pagination could not be proven.
- The same public filter later returned zero rows, inconsistent with the
  previously observed ten rows.
- The ordinary Event search cannot reliably find past series or expose the
  Event IDs needed to join to `/event/result/{sourceEventId}`.
- DECK LOG returned CloudFront 403 responses to headless Chromium.

Therefore public Result counts of zero or fewer than ten must not be treated as
proof that every Event was discovered. A complete backfill from 2026-09-19 is
not available. Local headless collection and GitHub Actions/cloud headless
collection are also not available.

Series `3440` is mapped to `selectioncup`, environment `bp09` (9th set), with
no round value. It is not limited
to 2026-09-19 through 2026-09-23: a public Result was also observed on
2026-09-26. The overall Tournament DB collection start date remains
2026-09-19.

Phase 9D and later product work may proceed against the published static JSON
contract with synthetic test fixtures while source discovery remains on hold.

## Best-effort Result discovery

The standalone `tournaments:discover` command performs a read-only,
headed-browser preview of Event IDs observed on the public Bushi Navi Result
List. Discovery produces `TournamentDiscoveryCandidate` values and observation
records only. It does not write to the Tournament queue, collect Deck Logs, or
publish Tournament data.

By default, the command revisits the target date and the preceding three dates.
The overlap is intentional: a previous zero-result observation does not mark a
date complete, and later runs may discover results published after the first
attempt. Observation files accumulate every Event ID previously seen for a
series/date, while the append-only run log records the IDs visible during each
individual attempt. Both are stored below the Git-ignored
`.cache/tournaments/discovery` directory.

Ten visible rows are recorded as a saturated observation meaning "at least ten
results". Zero rows mean only that the current attempt observed zero results.
Neither state proves completeness. Challenges and source failures are reported
separately.

The scheduled Daily workflow runs the same four-day Discovery Core before its
existing date selection. Discovered candidates pass through a separate
Automated Intake policy that adds only Event IDs absent from the latest Queue
state. Existing records in every status, including `published` and
`needs-review`, remain byte-for-byte unchanged; explicit resubmission remains a
Manual Intake responsibility. The Queue lock is acquired only after Discovery,
and the repository reloads and atomically replaces the Queue while holding that
lock.

Public-source failures and challenges mark Discovery as degraded but do not
stop processing Events already present in the Queue. Queue corruption, lock
conflicts, and atomic-write failures do stop the Daily run because Queue safety
cannot be guaranteed. Daily Discovery uses headed Chromium, matching the
existing scheduled Queue collection path; no headless fallback, User-Agent
override, or challenge bypass is provided. Historical reconciliation writes
remain outside Discovery-2.

Historical reconciliation preview reuses the same Discovery Core through
`tournaments:discover -- --from YYYY-MM-DD --to YYYY-MM-DD`. The range is
inclusive and processed sequentially in seven-day chunks by default. Each
chunk is independently recorded in the existing observation repository, but
previous observations never cause a query to be skipped. The preview compares
unique candidates with the current Queue using the Automated Intake validation
policy without acquiring the Queue mutation lock or writing the Queue.

The reconciliation report is explicitly best-effort and states that
completeness is not guaranteed. It separates existing, new, and rejected
candidates; successful zero-result observations; saturated queries; and failed
or challenged queries. Reconciliation Queue writes, Event collection, and
publication remain separate, unimplemented operations.

If the public list exposes the same Event ID under more than one query context,
candidate deduplication prefers a non-saturated observation over a saturated
one. Every raw query context remains available in the append-only run log; this
preference only selects the representative series/date shown in the preview.

## Collection boundaries

Without a new explicit approval, do not use undocumented or internal APIs,
reuse APIs discovered through network inspection, analyze application bundles,
spoof User-Agent values, alter headers, bypass WAF/CAPTCHA or headless blocks,
or make routine operation depend on people manually editing JSON.
