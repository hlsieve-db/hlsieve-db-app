import type { Card, CardPrintingGroupPublic, CardPrintingPublic } from './types'

export const PRODUCT_RELEASE_DATES = {
  '【hololive production OFFICIAL SHOP限定】hololive OFFICIAL CARD GAME 1st Anniversary Celebration Set':
    '2025-06-27',
  '【イベント物販／hololive production OFFICIAL SHOP限定商品】オフィシャルホロカコレクション-PCセット-':
    '2025-05-02',
  '【イベント物販限定商品】スタートデッキセット-2025 ホロナツパラダイスver.':
    '2025-08-16',
  '【使用可能カード】hGS 2026 大阪 セレクションロード': '2026-08-29',
  'hololive OFFICIAL CARD GAME ツインウエハース': '2026-05-25',
  'エクストラブースター サマー・ホログラム': '2026-08-21',
  'オフィシャルホロカコレクション-2025ライブセット-': '2026-05-02',
  スタートエールセット: '2024-09-20',
  'スタートデッキ FLOW GLOW 推し 虎金妃笑虎': '2025-11-21',
  'スタートデッキ FLOW GLOW 推し 輪堂千速': '2025-11-21',
  'スタートデッキ 黄 不知火フレア': '2025-02-28',
  'スタートデッキ 紫 癒月ちょこ': '2024-12-20',
  'スタートデッキ 推し Advent': '2026-02-20',
  'スタートデッキ 推し Justice': '2026-02-20',
  'スタートデッキ 青 猫又おかゆ': '2024-12-20',
  'スタートデッキ 赤 百鬼あやめ': '2024-12-20',
  'スタートデッキ 赤 宝鐘マリン': '2025-08-29',
  'スタートデッキ 白 轟はじめ': '2025-02-28',
  'スタートデッキ 白 天音かなた': '2025-08-29',
  'スタートデッキ 緑 風真いろは': '2025-02-28',
  'スタートデッキ「ときのそら＆AZKi」': '2024-09-20',
  'ブースターパック バウンサーバウンド': '2026-06-19',
  'ブースターパック「アヤカシヴァーミリオン」': '2025-12-19',
  'ブースターパック「エリートスパーク」': '2025-03-21',
  'ブースターパック「エンチャントレガリア」': '2025-09-19',
  'ブースターパック「キュリアスユニバース」': '2025-06-20',
  'ブースターパック「クインテットスペクトラム」': '2024-12-20',
  'ブースターパック「ディーヴァフィーバー」': '2026-03-13',
  'ブースターパック「ブルーミングレディアンス」': '2024-09-20',
  'ブースターパック「ボリュームヴォルテックス」': '2026-09-19',
  'ライブスタートデッキ さくらみこ': '2026-04-24',
  'ライブスタートデッキ 儒烏風亭らでん': '2026-04-24',
  'ライブスタートデッキ 森カリオペ': '2026-04-24',
  'ライブスタートデッキ 星街すいせい': '2026-04-24',
  'ライブスタートデッキ 大空スバル': '2026-04-24',
  'ライブスタートデッキ 白上フブキ': '2026-04-24',
} as const satisfies Readonly<Record<string, string>>

export const PRODUCTS_WITHOUT_SINGLE_RELEASE_DATE = {
  PRカード: {
    noSingleReleaseDate: true,
    reason:
      'PRカード is an umbrella category whose cards become available on their individual distribution start dates.',
    sources: [
      'https://hololive-official-cardgame.com/cardlist/',
      'https://hololive-official-cardgame.com/wp-content/themes/tcg/assets/img/rule/floor_app_ver1-2-11.pdf',
    ],
  },
} as const satisfies Readonly<
  Record<
    string,
    {
      noSingleReleaseDate: true
      reason: string
      sources: readonly string[]
    }
  >
>

export function hasNoSingleProductReleaseDate(product: string): boolean {
  return Object.prototype.hasOwnProperty.call(
    PRODUCTS_WITHOUT_SINGLE_RELEASE_DATE,
    product,
  )
}

function getPrintingReleaseDate(
  printing: CardPrintingPublic,
): string | undefined {
  return printing.products
    .map((product): string | undefined =>
      Object.prototype.hasOwnProperty.call(PRODUCT_RELEASE_DATES, product)
        ? PRODUCT_RELEASE_DATES[product as keyof typeof PRODUCT_RELEASE_DATES]
        : undefined,
    )
    .filter((date): date is string => date !== undefined)
    .sort()[0]
}

export function getOriginalNonParallelImageUrl(
  group: CardPrintingGroupPublic | undefined,
  fallbackImageUrl?: string,
): string | undefined {
  const nonParallel =
    group?.printings.filter(
      (printing): printing is CardPrintingPublic & { imageUrl: string } =>
        !printing.isParallel && printing.imageUrl !== undefined,
    ) ?? []

  if (nonParallel.length === 0) return fallbackImageUrl
  if (nonParallel.length === 1) return nonParallel[0].imageUrl

  const dated = nonParallel
    .map((printing) => ({
      imageUrl: printing.imageUrl,
      releaseDate: getPrintingReleaseDate(printing),
    }))
    .filter(
      (candidate): candidate is { imageUrl: string; releaseDate: string } =>
        candidate.releaseDate !== undefined,
    )

  if (dated.length !== nonParallel.length) return fallbackImageUrl
  const earliestDate = dated.reduce(
    (earliest, candidate) =>
      candidate.releaseDate < earliest ? candidate.releaseDate : earliest,
    dated[0].releaseDate,
  )
  const earliestImages = new Set(
    dated
      .filter((candidate) => candidate.releaseDate === earliestDate)
      .map((candidate) => candidate.imageUrl),
  )

  return earliestImages.size === 1
    ? earliestImages.values().next().value
    : fallbackImageUrl
}

export function buildOriginalPrintingImageMap(
  cards: readonly Card[],
  printingGroups: Readonly<Record<string, CardPrintingGroupPublic>>,
): Map<string, string> {
  const images = new Map<string, string>()
  for (const card of cards) {
    const imageUrl = getOriginalNonParallelImageUrl(
      printingGroups[card.cardNumber],
      card.imageUrl,
    )
    if (imageUrl !== undefined) images.set(card.cardNumber, imageUrl)
  }
  return images
}
