import type {
  Ability,
  Card,
  CardColor,
  CriticalColor,
  EffectTag,
} from './types'

export const CARD_TYPE_LABELS = {
  oshi: '推しホロメン',
  holomem: 'ホロメン',
  support: 'サポート',
  cheer: 'エール',
} satisfies Record<Card['cardType'], string>

export const CARD_COLOR_LABELS = {
  white: '白',
  green: '緑',
  red: '赤',
  blue: '青',
  purple: '紫',
  yellow: '黄',
  colorless: '無',
} satisfies Record<CardColor, string>

export const CRITICAL_COLOR_LABELS = {
  white: '白',
  green: '緑',
  red: '赤',
  blue: '青',
  purple: '紫',
  yellow: '黄',
} satisfies Record<CriticalColor, string>

export const EFFECT_TAG_LABELS = {
  second_turn_one: '後攻1T効果',
  bloom_effect: 'Bloom時効果',
  collab_effect: 'コラボ時効果',
  gift: 'ギフト',
  draw: 'ドロー',
  deck_search: 'デッキサーチ',
  cheer_acceleration: 'エール加速',
  cheer_recovery: 'エール回収',
  archive_recovery: 'アーカイブ回収',
  arts_boost: 'アーツ強化',
  damage_reduction: 'ダメージ軽減',
  special_damage: '特殊ダメージ',
} satisfies Record<EffectTag, string>

export const BLOOM_LEVEL_LABELS = {
  debut: 'Debut',
  first: '1st',
  second: '2nd',
  spot: 'Spot',
} satisfies Record<NonNullable<Card['bloomLevel']>, string>

export const DEBUT_TYPE_LABELS = {
  normal: '通常',
  extra: 'エクストラ',
} satisfies Record<NonNullable<Card['debutType']>, string>

export const ABILITY_TYPE_LABELS = {
  normal: '能力',
  bloom: 'Bloomエフェクト',
  collab: 'コラボエフェクト',
  gift: 'ギフト',
} satisfies Record<NonNullable<Ability['type']>, string>

export const SUPPORT_TYPE_LABELS = {
  staff: 'スタッフ',
  item: 'アイテム',
  event: 'イベント',
  tool: 'ツール',
  mascot: 'マスコット',
  fan: 'ファン',
} satisfies Record<NonNullable<Card['supportType']>, string>

export const SUPPORT_SEARCH_CATEGORY_LABELS = {
  limited: 'LIMITED',
  general: 'サポート（LIMITED以外）',
  tool: 'ツール',
  fan: 'ファン',
} satisfies Record<NonNullable<Card['supportSearchCategory']>, string>
