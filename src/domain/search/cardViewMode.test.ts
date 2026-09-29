import { describe, expect, it, vi } from 'vitest'

import {
  CARD_VIEW_MODE_STORAGE_KEY,
  readCardViewMode,
  writeCardViewMode,
} from './cardViewMode'

describe('card view mode', () => {
  it.each([
    [null, 'image'],
    ['image', 'image'],
    ['text', 'text'],
    ['compact', 'image'],
    ['', 'image'],
  ] as const)('reads %s as %s', (stored, expected) => {
    const storage = { getItem: vi.fn(() => stored) }
    expect(readCardViewMode(storage)).toBe(expected)
    expect(storage.getItem).toHaveBeenCalledWith(CARD_VIEW_MODE_STORAGE_KEY)
  })

  it('falls back when storage is unavailable and tolerates blocked writes', () => {
    expect(
      readCardViewMode({
        getItem: () => {
          throw new Error('blocked')
        },
      }),
    ).toBe('image')
    expect(() =>
      writeCardViewMode('text', {
        setItem: () => {
          throw new Error('blocked')
        },
      }),
    ).not.toThrow()
  })

  it('is safe when window is unavailable during server rendering', () => {
    vi.stubGlobal('window', undefined)

    try {
      expect(readCardViewMode()).toBe('image')
      expect(() => writeCardViewMode('text')).not.toThrow()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('persists the selected mode', () => {
    const storage = { setItem: vi.fn() }
    writeCardViewMode('text', storage)
    expect(storage.setItem).toHaveBeenCalledWith(
      CARD_VIEW_MODE_STORAGE_KEY,
      'text',
    )
  })
})
