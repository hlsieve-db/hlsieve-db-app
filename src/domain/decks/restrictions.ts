import type { CardRestriction } from './types'

export const DECK_RULES_EFFECTIVE_FROM = '2026-06-19'

export const DECK_ZONE_COUNTS = {
  oshi: 1,
  main: 50,
  cheer: 20,
} as const

export const TOTAL_DECK_COUNT =
  DECK_ZONE_COUNTS.oshi + DECK_ZONE_COUNTS.main + DECK_ZONE_COUNTS.cheer
export const DEFAULT_MAIN_COPY_LIMIT = 4

// Update this single list when the Japanese official restricted-card rules change.
export const CURRENT_DECK_RESTRICTIONS: readonly CardRestriction[] = [
  {
    cardNumber: 'hBP01-030',
    maxCopies: 1,
    effectiveFrom: DECK_RULES_EFFECTIVE_FROM,
    note: 'IRyS',
  },
  {
    cardNumber: 'hBP07-101',
    maxCopies: 1,
    effectiveFrom: DECK_RULES_EFFECTIVE_FROM,
    note: 'ASMRマイク',
  },
]
