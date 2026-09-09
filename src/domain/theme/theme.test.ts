import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  THEME_STORAGE_KEY,
  applyEffectiveTheme,
  readThemePreference,
  resolveEffectiveTheme,
  writeThemePreference,
} from './theme'

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.style.colorScheme = ''
  document.documentElement.style.backgroundColor = ''
  document.head.querySelector('meta[name="theme-color"]')?.remove()
})

describe('theme preference', () => {
  it.each([
    [null, 'system'],
    ['invalid', 'system'],
    ['light', 'light'],
    ['dark', 'dark'],
    ['system', 'system'],
  ] as const)('reads %s as %s', (stored, expected) => {
    const storage = { getItem: vi.fn(() => stored) }
    expect(readThemePreference(storage)).toBe(expected)
    expect(storage.getItem).toHaveBeenCalledWith(THEME_STORAGE_KEY)
  })

  it('falls back when storage is unavailable and tolerates blocked writes', () => {
    expect(
      readThemePreference({
        getItem: () => {
          throw new Error('blocked')
        },
      }),
    ).toBe('system')
    expect(() =>
      writeThemePreference('dark', {
        setItem: () => {
          throw new Error('blocked')
        },
      }),
    ).not.toThrow()
  })

  it('persists the selected preference', () => {
    const storage = { setItem: vi.fn() }
    writeThemePreference('light', storage)
    expect(storage.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'light')
  })

  it.each([
    ['system', false, 'light'],
    ['system', true, 'dark'],
    ['light', true, 'light'],
    ['dark', false, 'dark'],
  ] as const)('resolves %s/%s to %s', (preference, dark, expected) => {
    expect(resolveEffectiveTheme(preference, dark)).toBe(expected)
  })

  it('applies the effective root theme and browser theme color', () => {
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.append(meta)

    applyEffectiveTheme('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(document.documentElement.style.backgroundColor).toBe(
      'rgb(11, 18, 26)',
    )
    expect(meta).toHaveAttribute('content', '#0b121a')
  })
})
