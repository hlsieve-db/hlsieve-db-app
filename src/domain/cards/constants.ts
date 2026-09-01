import type { CardColor, CriticalColor, EffectTag } from './types'

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
