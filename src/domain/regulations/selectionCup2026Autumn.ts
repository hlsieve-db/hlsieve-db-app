import type { RegulationDefinition } from './types'

/**
 * The card pool for the autumn 2026 Selection Cup.
 *
 * The official rules name three products, and allow any card whose number
 * appears in one of them. The names below are those products exactly as the
 * card data spells them, including the differing quotation marks: two carry
 * 「」 and one does not.
 *
 * The card count is what those products resolve to today. It is asserted by the
 * tests rather than by the app: if a name stops matching, nothing would be in
 * the pool and every card would read as banned, which is worse than being out
 * of date. The test says so before a release does.
 *
 * Cheer is not restricted. The products do contain cheer cards, so the rule
 * cannot be inferred from the pool either way and is written down instead.
 */
export const SELECTION_CUP_2026_AUTUMN_ID = 'selection-cup-2026-autumn'

/**
 * The event runs 2026-09-19 to 2026-09-23 and again 2026-10-01 to 2026-10-31,
 * but the dates below are one span covering both.
 *
 * They say when the format may be chosen, not when it is played: someone
 * building for the October dates during the last week of September needs it
 * offered then. Splitting the run into real sessions would need a shape this
 * definition does not have, and nothing yet asks for one.
 */
export const SELECTION_CUP_2026_AUTUMN: RegulationDefinition = {
  id: SELECTION_CUP_2026_AUTUMN_ID,
  // The first spelling of this id named the wrong event. Decks saved under it
  // still resolve here rather than losing the format they were built for.
  aliasIds: ['selection-cup-2026-osaka'],
  name: 'セレクションカップ 2026年9-10月',
  description:
    '推しホロメンとメインデッキは、対象3商品に収録されているカードのみ使用できます。エールデッキは対象外です。',
  effectiveFrom: '2026-09-19',
  effectiveTo: '2026-10-31',
  cardPool: {
    allowedProductNames: [
      'ブースターパック バウンサーバウンド',
      'エクストラブースター サマー・ホログラム',
      'ブースターパック「ボリュームヴォルテックス」',
    ],
    expectedCardCount: 364,
    appliesTo: ['oshi', 'main'],
  },
}
