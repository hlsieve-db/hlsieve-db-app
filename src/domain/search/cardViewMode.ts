export const CARD_VIEW_MODE_STORAGE_KEY = 'hlsieve:card-view-mode'

export type CardViewMode = 'image' | 'text'

export function isCardViewMode(value: unknown): value is CardViewMode {
  return value === 'image' || value === 'text'
}

function getDefaultStorage(): Storage | undefined {
  return typeof window === 'undefined' ? undefined : window.localStorage
}

export function readCardViewMode(
  storage: Pick<Storage, 'getItem'> | undefined = getDefaultStorage(),
): CardViewMode {
  if (!storage) return 'image'

  try {
    const value = storage.getItem(CARD_VIEW_MODE_STORAGE_KEY)
    return isCardViewMode(value) ? value : 'image'
  } catch {
    return 'image'
  }
}

export function writeCardViewMode(
  mode: CardViewMode,
  storage: Pick<Storage, 'setItem'> | undefined = getDefaultStorage(),
): void {
  if (!storage) return

  try {
    storage.setItem(CARD_VIEW_MODE_STORAGE_KEY, mode)
  } catch {
    // The selected mode still applies for this session when storage is blocked.
  }
}
