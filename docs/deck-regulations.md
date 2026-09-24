# Deck regulation maintenance

A regulation is a tournament format: the ordinary deck rules plus a restricted
pool of cards. Adding one should be adding a file, not changing the validator,
the editor or the deck model. This document is how to do that, and what the
existing pieces already guarantee so you do not have to re-derive them.

Nothing here describes work in progress. Every path, name and behaviour below is
in `main` today.

## Files

| Path                                              | What it holds                                                                                                                           |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain/regulations/types.ts`                 | `RegulationDefinition`, `RegulationCardPool`, `DeckSection`, `DEFAULT_POOL_SECTIONS`, `DeckRegulationViolation`, `DeckRegulationResult` |
| `src/domain/regulations/standard.ts`              | `STANDARD_REGULATION_ID`, `STANDARD_REGULATION`                                                                                         |
| `src/domain/regulations/selectionCup2026Osaka.ts` | The current Selection definition: `SELECTION_CUP_2026_OSAKA_ID`, `SELECTION_CUP_2026_OSAKA`                                             |
| `src/domain/regulations/registry.ts`              | `REGULATIONS`, `getRegulation`, `hasRegulation`, `isRegulationActive`, `listRegulations`                                                |
| `src/domain/regulations/engine.ts`                | `getAllowedCardNumbers`, `isCardAllowed`, `validateDeckRegulation`                                                                      |
| `src/domain/regulations/deckRegulationId.ts`      | `normalizeDeckRegulationId`, `sameDeckRegulation` — comparison rules, not lookup                                                        |
| `src/domain/decks/deck.ts`                        | `setDeckRegulation` — the only way the UI may change a deck's regulation                                                                |
| `src/domain/decks/deckContent.ts`                 | `deckContentEquals` — used by cloud conflict detection                                                                                  |
| `src/domain/decks/backup.ts`                      | `hasSameDeckContent` — used by backup import de-duplication                                                                             |
| `src/pages/DeckEditPage.tsx`                      | Selector, search pool narrowing, the "使用可能カードのみ表示" toggle, deck violation warning                                            |
| `src/components/decks/DeckRegulationBadge.tsx`    | The label shown on the saved deck list and the comparison screen                                                                        |

Tests: `engine.test.ts`, `registry.test.ts`, `deckRegulationId.test.ts` and
`selectionCupProduction.test.ts` (the last one runs against `public/cards.json`),
all in `src/domain/regulations/`.

## Adding a regulation

1. **Read the official rules.** You need the usable-card scope, any named
   exceptions, any banned cards, and the dates.
2. **Find the product name in the published card data**, not on the official
   page. See [Product names](#product-names); this is the step that goes wrong.
3. **Add a definition file** to `src/domain/regulations/`, named after the
   regulation in the repository's camelCase style, e.g.
   `selectionCup2027Tokyo.ts`. Export the id as a named constant and the
   definition beside it, as `selectionCup2026Osaka.ts` does.
4. **Add it to `REGULATIONS`** in `registry.ts`. That array is the only place
   the app learns a format exists.
5. **Fill in the fields** (below), then run the checks in
   [Checks after adding one](#checks-after-adding-one).

### Fields

```ts
export const SELECTION_CUP_2026_OSAKA_ID = 'selection-cup-2026-osaka'

export const SELECTION_CUP_2026_OSAKA: RegulationDefinition = {
  id: SELECTION_CUP_2026_OSAKA_ID,
  name: 'hGS 2026 大阪 セレクションロード',
  description:
    '対象商品に収録されているカードで構築します。エールは対象外です。',
  effectiveFrom: '2026-08-29',
  cardPool: {
    allowedProductNames: ['【使用可能カード】hGS 2026 大阪 セレクションロード'],
    expectedCardCount: 683,
    appliesTo: ['oshi', 'main'],
  },
}
```

- `id` — stable and internal, kebab-case. It ends up stored in decks, so it
  outlives the event's branding. Never show it to a reporter and never rename it
  (see [Changing an existing regulation](#changing-an-existing-regulation)).
- `name` — what screens display, via `getRegulation(id).name`.
- `description` — optional. The deck editor shows it for non-Standard formats.
- `effectiveFrom` / `effectiveTo` — ISO day strings, **both bounds inclusive**,
  compared as strings by `isRegulationActive`. Omitting `effectiveFrom` means it
  has always applied; omitting `effectiveTo` means it has not ended.
- `allowedProductNames` — exact product names from the card data.
- `expectedCardCount` — how many card numbers those products resolve to.
  **Test-time only**: no runtime code reads it. See
  [Product names](#product-names).
- `appliesTo` — which deck sections the pool restricts. Omitted means
  `['oshi', 'main']` (`DEFAULT_POOL_SECTIONS`). State it explicitly anyway: a
  pool holding no cheer card could mean cheer is unrestricted or that no cheer
  card is legal, and those are opposite rules.
- `additionalAllowedCardNumbers` — cards allowed on top of the products.
- `bannedCardNumbers` — cards not allowed, whatever else says otherwise.

A definition may omit `cardPool` entirely, which means no pool restriction at
all. That is what `standard.ts` does.

## Product names

The published card data has **no stable product id**. A product is identified by
its display name and nothing else, so `allowedProductNames` holds name strings
and `getAllowedCardNumbers` matches them against `Card.products`.

That makes a rename or a character-level difference a real hazard: nothing
matches, the pool comes out empty, and the app would then call every card in
the deck illegal. So:

- **Take the string from `public/cards.json`, not from the official page.**
  Watch for full-width brackets and other look-alike characters. The current
  Selection product uses `【` `】` (U+3010/U+3011), not `〖` `〗`.
- **Set `expectedCardCount`** and let `selectionCupProduction.test.ts` compare it
  against the data. A rename then fails a test loudly instead of emptying the
  pool quietly.
- **Do not make runtime legality depend on that count.** If it ever disagrees
  with the data, the tests are the place that fails; production must not start
  refusing decks over an integrity number.

To list the product names in the current data with their card counts:

```sh
node -e "const d=require('./public/cards.json');const m=new Map();for(const c of d.cards)for(const p of c.products)m.set(p,(m.get(p)??0)+1);require('node:fs').writeFileSync('.cache/products.txt',[...m].sort((a,b)=>b[1]-a[1]).map(([n,c])=>c+'  '+n).join('\n'),'utf8')"
```

Read `.cache/products.txt` in an editor rather than the terminal, which may not
render Japanese correctly. As of this writing the data holds 37 product names
over 1381 cards, and the Selection overlay resolves to 683 card numbers: 44
oshi, 639 main (515 holomem + 124 support) and no cheer card at all.

The official list publishes this pool as a product that its cards carry
_alongside_ the product they were actually printed in, which is why the pool
needs no card-by-card transcription. Expect a future event to work the same way;
if one does not, `additionalAllowedCardNumbers` can carry an explicit list.

## Card pool semantics

```
allowed = cards whose Card.products contains one of allowedProductNames
        + additionalAllowedCardNumbers
        - bannedCardNumbers
```

- **A ban wins.** It is applied last when building the pool, and
  `isCardAllowed` refuses a banned card before looking at anything else.
- **A ban applies to the whole regulation**, including sections outside
  `appliesTo`. A cheer card banned by name is not usable just because cheer is
  unrestricted.
- **Cards, not printings.** A deck stores a card number, and the official pools
  are published the same way, so a second illustration of an allowed card is the
  same allowed card.
- **Sections outside `appliesTo` are unrestricted** unless the card is banned.
- `getAllowedCardNumbers` returns `undefined` when there is no pool — either no
  `cardPool`, or one that names neither products nor additional cards. That is
  deliberately not "a pool containing everything": only `undefined` stays
  correct as new cards are published.
- Deck size, copy limits, the restricted-card list and unknown cards are **not**
  handled here. They are the ordinary legality rules in
  `src/domain/decks/legality.ts` and `restrictions.ts`, which every format in
  play today shares. `validateDeckRegulation` skips a card the data does not
  know, because the legality layer already reports it.

## Standard

`id: 'standard'`, no `cardPool`, so nothing is restricted.

On a deck, ordinary construction is **the absence of the field**:

- `regulationId === undefined` is the canonical stored form.
- `'standard'` means the same thing semantically but is **never persisted**.
  `setDeckRegulation(deck, 'standard')` and `setDeckRegulation(deck, undefined)`
  both delete the field.
- Decks made before regulations existed therefore read as Standard with no
  migration.

`normalizeDeckRegulationId` maps `undefined` to `'standard'`, so the two compare
equal wherever decks are compared.

## Regulation on a deck

`Deck.regulationId?: string`.

- `isDeck` accepts a missing value or any string, and rejects a non-string. An
  id this build does not define is **valid data**.
- `normalizeDeckRegulationId` keeps an unknown id as it is. It does **not** fold
  it into Standard: doing so would make a deck built for a removed format
  compare equal to an unrestricted one, and the format would be lost the next
  time anything wrote the deck back.
- `getRegulation(id)` falls back to Standard for an unknown id, so the app stays
  usable. `hasRegulation(id)` tells you whether that was a real match, which is
  how the UI knows to warn.
- Nothing rewrites an unknown id. Opening a deck, listing decks, renaming or
  editing cards all keep it; only the reporter choosing another format in the
  editor replaces it.
- `deckContentEquals` and `hasSameDeckContent` both compare the normalized
  regulation, so two decks holding the same cards for different tournaments are
  different decks: cloud sync asks which copy to keep, and backup import brings
  the file in rather than skipping it.

## Deck Editor behaviour

- The selector offers Standard, every currently active regulation
  (`listRegulations()`), and the regulation the open deck already names if it is
  no longer active. Other finished formats are not offered.
- Every change goes through `setDeckRegulation`. Never assign `regulationId`
  from the UI, or choosing Standard would persist `'standard'`.
- The search pool is narrowed by filtering the cards **handed to** the existing
  search. `searchCards`, `SearchFilters` and `SearchUrlState` know nothing about
  regulations, and there is no product filter UI.
- The "使用可能カードのみ表示" toggle appears only for a restricted format,
  defaults to on, and is deliberately not in the URL: it is a way of looking
  rather than part of the search, so a reload starts it on again.
- With the toggle off, cards outside the pool appear, are marked
  「このレギュレーションでは使用できません」, and **can still be added** — a deck
  may be part way through a rebuild. Banned cards stay hidden either way.
- Cards already in the deck that the format disallows are listed as a warning
  (`対象カードプール外` or `禁止カード`, with quantities). They are never removed,
  quantities are never changed, and saving is never blocked.
- For a deck naming an unknown format, the selector itself shows 通常構築,
  because `getRegulation` falls back, and the warning
  「このデッキのレギュレーション定義が見つかりません。現在はスタンダードとして表示しています。」
  sits beside it. The deck keeps the unknown id until the reporter picks
  something; note that picking 通常構築 explicitly _does_ delete it, which is
  the intended way to clear one. The saved deck list is blunter about the same
  deck and labels it 不明なレギュレーション — the editor has room for a sentence
  and a list row does not.
- The ordinary legality summary is a separate section and is unchanged.
- Saving is the ordinary save path, so an account with Cloud Sync on gets the
  change through the same wrapper, pending queue and retry as any other edit.

## Cloud, backup and share

- **Cloud Sync** stores the whole deck as JSON, so `regulationId` travels with
  it. No schema change, no migration, and `public.decks` only requires the value
  to be a JSON object.
- **Backup** stores whole decks too, so the field round-trips.
  `DECK_BACKUP_VERSION` stays 1: adding an optional field is backward
  compatible, and an older build ignores it.
- **Share carries no regulation.** `buildDeckSharePayload` emits exactly
  `{ v, name, entries }`, and `create_deck_share` in the migration rejects any
  other key, so adding one would need both a payload version bump and a
  migration. A deck saved from a share is therefore an ordinary deck, and the
  share pages show no regulation label at all — labelling it "Standard" would be
  a guess that is wrong exactly when it matters.
- `SHARED_DECK_FORMAT_VERSION` stays 1, and `DB_VERSION` stays 5.

## Changing an existing regulation

Ask one question: **would a deck built under the old wording need to be
reproducible?**

Edit the existing definition when the change is a correction to something that
was always meant to be true:

- a mistyped product name, a wrong `expectedCardCount`, a typo in `name`
- a card the official rules always allowed or banned but we recorded wrongly

Add a new definition with a **new id** when the rules themselves changed:

- products added or removed for a new season
- a card newly banned or newly excepted from a given date
- anything a player could have legally built under before and could not after

The reason is that decks store the id. Overwriting a definition retroactively
changes what every existing deck is checked against, and a deck that was legal
becomes a deck with warnings it never earned. Adding an id leaves those decks
alone, and their format keeps resolving.

Set `effectiveTo` on the old definition when its event has ended. It then stops
being offered to new decks while decks that already name it keep working, and
`getRegulation` keeps resolving it. Note that no definition carries an
`effectiveTo` yet, so there is currently no "finished" label in the UI; add one
with a test when the first such definition lands.

## Checks after adding one

Targeted first:

```sh
npx vitest run src/domain/regulations
```

Cover at least:

- the product name exists in `public/cards.json`
- the pool size equals `expectedCardCount`
- the section counts are what the official scope implies
- a representative card in each restricted section is allowed
- a card outside the pool is refused
- sections outside `appliesTo` stay unrestricted
- Standard is still unrestricted

Then the full gate:

```sh
npm run test:run
npm run build
npm run lint
npm run format:check
npx tsc --noEmit
git diff --check
```

Adding a regulation should touch only `src/domain/regulations/`. If the diff
reaches the deck model, the editor, the search, `supabase/`, `public/` or a
migration, something is being worked around rather than configured.

## When the current shape is not enough

`RegulationCardPool` covers card pools and nothing else, on purpose. Extend it
only when a real regulation needs one of these, and not before:

- a tournament-specific deck size or copy limit
- a restriction keyed on something other than a deck section
- a constraint over combinations of cards rather than individual cards

Any of those is a change to the ordinary legality rules or a genuine new field,
not something to anticipate with a rules DSL.

## Checklist

```
[ ] 公式ルールを確認した
[ ] public/cards.json 上の実際の product 名を確認した（括弧などの文字も）
[ ] src/domain/regulations/ に定義ファイルを追加した
[ ] registry.ts の REGULATIONS に追加した
[ ] internal id を決めた（kebab-case、表示名から独立）
[ ] name / description / effectiveFrom / effectiveTo を設定した
[ ] allowedProductNames を設定した
[ ] expectedCardCount を設定し、テストで一致を確認した
[ ] appliesTo を明示した（cheer を含めるかを判断した）
[ ] additionalAllowedCardNumbers / bannedCardNumbers を確認した
[ ] 代表カードの allowed / pool 外カードの rejected をテストした
[ ] npx vitest run src/domain/regulations
[ ] full gate（test:run / build / lint / format:check / tsc / diff-check）
[ ] 差分が src/domain/regulations/ だけであることを確認した
[ ] Deck Editor で選択・検索絞り込み・警告を実機確認した
```
