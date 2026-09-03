import type { CriticalColor } from '../../../src/domain/cards/types'
import type { MergedCardCandidate } from '../merge/types'

export function deriveCriticalColors(
  card: MergedCardCandidate,
): CriticalColor[] {
  const colors: CriticalColor[] = []

  for (const art of card.arts) {
    const color = art.critical?.color
    if (color && !colors.includes(color)) {
      colors.push(color)
    }
  }

  return colors
}
