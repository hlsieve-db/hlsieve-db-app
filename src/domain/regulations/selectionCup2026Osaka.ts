import type { RegulationDefinition } from './types'

/**
 * The card pool for hGS 2026 大阪 セレクションロード.
 *
 * The official card list publishes this pool as a product that the cards in it
 * also carry alongside the product they were actually printed in, so the pool
 * is already in the data and does not have to be transcribed card by card. The
 * name below is that product exactly as the data spells it.
 *
 * The card count is what the products resolve to today. It is asserted by the
 * tests rather than by the app: if the official name changes, nothing would
 * match and the pool would read as "no card is allowed", which is worse than
 * being out of date. The test says so before a release does.
 *
 * Cheer is not restricted. The pool contains no cheer card at all, which could
 * be read either way, so the rule is written down rather than inferred.
 */
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
