# Production card-data update workflow

This workflow creates a reviewable candidate before changing production data. It never commits, pushes, or deploys automatically.

## Architecture

The update follows this fixed order:

1. Discovery (ALL, parallel-only, and non-parallel pagination)
2. Detail fetch using `.cache/cards/details`
3. Parse, normalize, merge, semantic overrides, EffectTag derivation, and search indexing
4. Generate linked `cards.json` and `card-printings.json` candidates
5. Audit the candidate against the current production snapshots
6. Publish only an audit status of `safe`
7. Regenerate sitemap source assets and Card Detail prerender output
8. Verify, review, commit, push, and verify production manually

The existing individual `cards:discover`, `cards:fetch-details`, `cards:audit`, and `cards:publish` commands remain available. Use the phased commands below for production updates.

## Update procedure

Start from a clean, current branch. The prepare phase performs the only live official-site access in this workflow and writes candidates only below `.cache/cards/update`.

```sh
npm run cards:update:prepare
```

Preparation is blocked unless Discovery is complete, all expected pages were covered, both Discovery and detail retries are zero, every discovered printing has a detail result, and all official IDs are valid and unique.

Audit without changing `public/`:

```sh
npm run cards:update:audit
```

Review both generated reports:

- `.cache/reports/card-update.json`
- `.cache/reports/card-update.md`
- `.cache/reports/card-update-entry.candidate.json`

The history candidate contains only user-facing counts and a draft summary. Audit never publishes it. Confirm the actual publication date, rewrite the summary and notes for users, then add the reviewed entry to `src/domain/updates/history.ts`. Correction-only releases are supported with `changedCards` and notes even when no new Card is added. Never fabricate older entries whose publication date cannot be verified. If data changed, publish is blocked until a reviewed history entry has the candidate Cards and printing data versions.

Exit status `0` means safe, `2` means manual review is required, `3` means publication is blocked, and `1` means an unexpected implementation or I/O failure. Any logical-card or printing removal blocks automatic publication. Resolve new product release-date gaps in `PRODUCT_RELEASE_DATES`; explicitly classify umbrella categories that have no single release date in `PRODUCTS_WITHOUT_SINGLE_RELEASE_DATE`, and do not replace chronology with an official-ID heuristic. `PRカード` is such an umbrella category: official rules use each promotion's distribution start date rather than one product release date. Review the confirmed Buzz overrides for `hBP07-019`, `hBP07-048`, and `hBP07-076`.

`cards:update:production` is a convenience command for prepare plus audit only. It deliberately does not publish:

```sh
npm run cards:update:production
```

After human review, publish the exact audited candidate:

```sh
npm run cards:update:publish
```

Publishing updates the two linked snapshots plus `public/sitemap.xml` and `public/robots.txt`. It refuses warning or blocked reports. `card-printings.json.cardsDataVersion` must match the new Cards data version even if no printing changed.

Regenerate and verify all derived assets. `npm run build` creates the Card Detail prerender HTML and OGP metadata from each logical Card's `imageUrl`.

```sh
npm run cards:update:verify
npm run test:run
npm run build
npm run lint
npm run format:check
git diff --check
git status --short
git diff --stat
git diff
```

Confirm that sitemap Card URLs equal the logical-card count, with one additional `/cards` URL. Review total/card-number/Japanese-name/reading/ability searches, structured filters, EffectTags, products, and rarity versus printing behavior. Confirm existing Deck entries still resolve by `cardNumber`; a genuinely removed Card remains subject to the existing unknown-card policy.

Restricted-card rules are maintained separately in `src/domain/decks/restrictions.ts`. The report includes the current effective date and a reminder, but the card-data workflow never scrapes or changes restriction rules.

Only after reviewing the complete diff should a maintainer commit and push manually. After Cloudflare Pages deploys, verify the production card count, representative searches, Card Detail metadata/OGP, `https://hlsieve.com/sitemap.xml`, and Search Console sitemap status when relevant.
