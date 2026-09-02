export type FixtureKind = 'list' | 'detail'

export interface FixtureManifestEntry {
  id: string
  kind: FixtureKind
  file: string
  sourceUrl: string
  capturedAt: string
  notes: string
  expectedSignals?: readonly string[]
}

export const fixtureManifest = [
  {
    id: 'list-normal-multi-result',
    kind: 'list',
    file: 'list/normal-multi-result.html',
    sourceUrl:
      'https://hololive-official-cardgame.com/cardlist/cardsearch/?expansion=hBP01&view=text',
    capturedAt: '2026-09-02',
    notes: '通常の複数件検索結果。推しホロメンなど複数カードを含む。',
    expectedSignals: ['検索結果', 'hBP01-001', '推しホロメン'],
  },
  {
    id: 'list-support-results',
    kind: 'list',
    file: 'list/support-results.html',
    sourceUrl:
      'https://hololive-official-cardgame.com/cardlist/cardsearch/?card_kind%5B%5D=%E3%82%B5%E3%83%9D%E3%83%BC%E3%83%88&view=text',
    capturedAt: '2026-09-02',
    notes: 'サポート絞り込み結果。通常サポートとLIMITEDを含む。',
    expectedSignals: ['サポート', 'デッキ構築ルール', 'LIMITED'],
  },
  {
    id: 'list-special-deck-building-rules',
    kind: 'list',
    file: 'list/special-deck-building-rules.html',
    sourceUrl:
      'https://hololive-official-cardgame.com/cardlist/cardsearch/?keyword=%E3%83%87%E3%83%83%E3%82%AD%E6%A7%8B%E7%AF%89%E3%83%AB%E3%83%BC%E3%83%AB&view=text',
    capturedAt: '2026-09-02',
    notes: 'カードではない説明用の特殊entry「デッキ構築ルール」。',
    expectedSignals: [
      'デッキ構築ルール',
      '※本説明用カードはデッキ登録できません。',
    ],
  },
  {
    id: 'detail-oshi-kiara-multiple-qa',
    kind: 'detail',
    file: 'detail/oshi-kiara-multiple-qa.html',
    sourceUrl: 'https://hololive-official-cardgame.com/cardlist/?faq=&id=34',
    capturedAt: '2026-09-02',
    notes: '推しホロメン。Q番号・公開日・質問・回答・関連カードを含む複数Q&A。',
    expectedSignals: [
      'hBP01-006',
      '推しホロメン',
      'Q689',
      'Q682',
      '関連カード',
    ],
  },
  {
    id: 'detail-multicolor-fuwamoco',
    kind: 'detail',
    file: 'detail/multicolor-fuwamoco.html',
    sourceUrl: 'https://hololive-official-cardgame.com/cardlist/?faq=&id=614',
    capturedAt: '2026-09-02',
    notes: '青赤の多色1stホロメン。アーツ・タグ・エクストラ・複数Q&Aを含む。',
    expectedSignals: ['hBP03-050', 'FUWAMOCO', '青', '赤', 'Bloomレベル'],
  },
  {
    id: 'detail-multicolor-fuwamoco-reprint',
    kind: 'detail',
    file: 'detail/multicolor-fuwamoco-reprint.html',
    sourceUrl: 'https://hololive-official-cardgame.com/cardlist/?faq=&id=2545',
    capturedAt: '2026-09-02',
    notes:
      'hBP03-050の別収録商品版。同一カードナンバーの実在リプリント比較用。',
    expectedSignals: ['hBP03-050', 'FUWAMOCO', 'サマー・ホログラム'],
  },
  {
    id: 'detail-spot-kanata',
    kind: 'detail',
    file: 'detail/spot-kanata.html',
    sourceUrl: 'https://hololive-official-cardgame.com/cardlist/?faq=&id=337',
    capturedAt: '2026-09-02',
    notes: 'Spotホロメン。Q&Aなしの詳細ケース。',
    expectedSignals: ['hBP02-070', '魔法少女かなた', 'Spot'],
  },
  {
    id: 'detail-buzz-houshou-marine',
    kind: 'detail',
    file: 'detail/buzz-houshou-marine.html',
    sourceUrl: 'https://hololive-official-cardgame.com/cardlist/?faq=&id=1149',
    capturedAt: '2026-09-02',
    notes: 'Buzzホロメンの1st詳細。特殊ダメージとエクストラを含む。',
    expectedSignals: ['hSD09-003', 'Buzzホロメン', '特殊ダメージ'],
  },
  {
    id: 'detail-second-houshou-marine',
    kind: 'detail',
    file: 'detail/second-houshou-marine.html',
    sourceUrl: 'https://hololive-official-cardgame.com/cardlist/?faq=&id=1150',
    capturedAt: '2026-09-02',
    notes: '2ndホロメン。タグ・キーワード・アーツを含む。',
    expectedSignals: ['hSD09-004', '2nd', 'アーツ'],
  },
  {
    id: 'detail-tool-stone-axe',
    kind: 'detail',
    file: 'detail/tool-stone-axe.html',
    sourceUrl: 'https://hololive-official-cardgame.com/cardlist/?faq=&id=1278',
    capturedAt: '2026-09-02',
    notes: 'サポート・ツール。複数商品・特殊ダメージ・複数Q&Aを含む。',
    expectedSignals: ['hBP01-114', 'サポート・ツール', 'Q650', '関連カード'],
  },
  {
    id: 'detail-fan-35p',
    kind: 'detail',
    file: 'detail/fan-35p.html',
    sourceUrl: 'https://hololive-official-cardgame.com/cardlist/?faq=&id=671',
    capturedAt: '2026-09-02',
    notes: 'サポート・ファン。タグ相当の固有名と複数Q&Aを含む。',
    expectedSignals: ['hBP03-107', 'サポート・ファン', '35P'],
  },
  {
    id: 'detail-cheer-white',
    kind: 'detail',
    file: 'detail/cheer-white.html',
    sourceUrl: 'https://hololive-official-cardgame.com/cardlist/?faq=&id=168',
    capturedAt: '2026-09-02',
    notes: 'エール詳細。多数の収録商品を持つQ&Aなしケース。',
    expectedSignals: ['hY01-001', '白エール', 'カードタイプ'],
  },
  {
    id: 'detail-debut-shirogane-noel',
    kind: 'detail',
    file: 'detail/debut-shirogane-noel.html',
    sourceUrl: 'https://hololive-official-cardgame.com/cardlist/?faq=&id=1151',
    capturedAt: '2026-09-02',
    notes: 'Debutホロメン。タグ・キーワード・アーツを含むQ&Aなしケース。',
    expectedSignals: ['hSD09-005', 'Debut', '白銀ノエル'],
  },
  {
    id: 'detail-limited-two-tone-pc',
    kind: 'detail',
    file: 'detail/limited-two-tone-pc.html',
    sourceUrl: 'https://hololive-official-cardgame.com/cardlist/?faq=&id=952',
    capturedAt: '2026-09-02',
    notes: 'サポート・アイテム・LIMITED。能力テキストと複数Q&Aを含む。',
    expectedSignals: ['hBP04-089', 'サポート・アイテム・LIMITED', 'Q404'],
  },
] as const satisfies readonly FixtureManifestEntry[]
