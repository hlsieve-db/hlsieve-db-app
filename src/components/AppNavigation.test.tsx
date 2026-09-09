import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { THEME_STORAGE_KEY } from '../domain/theme/theme'
import { AppNavigation } from './AppNavigation'

function mockColorScheme(initialMatches: boolean) {
  let matches = initialMatches
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const mediaQuery = {
    get matches() {
      return matches
    },
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: vi.fn(
      (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener)
      },
    ),
    removeEventListener: vi.fn(
      (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener)
      },
    ),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => mediaQuery),
  })
  return {
    setMatches(next: boolean) {
      matches = next
      for (const listener of listeners) {
        listener({ matches: next } as MediaQueryListEvent)
      }
    },
  }
}

afterEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.style.colorScheme = ''
  document.documentElement.style.backgroundColor = ''
})

describe('AppNavigation theme control', () => {
  it('defaults to system and follows media-query changes', async () => {
    const media = mockColorScheme(false)
    render(
      <MemoryRouter initialEntries={['/cards']}>
        <AppNavigation />
      </MemoryRouter>,
    )

    expect(screen.getByLabelText('テーマ')).toHaveValue('system')
    await waitFor(() =>
      expect(document.documentElement).toHaveAttribute('data-theme', 'light'),
    )
    media.setMatches(true)
    await waitFor(() =>
      expect(document.documentElement).toHaveAttribute('data-theme', 'dark'),
    )
  })

  it.each(['light', 'dark'] as const)(
    'restores a saved %s preference',
    async (preference) => {
      mockColorScheme(preference === 'light')
      localStorage.setItem(THEME_STORAGE_KEY, preference)
      render(
        <MemoryRouter>
          <AppNavigation />
        </MemoryRouter>,
      )
      expect(screen.getByLabelText('テーマ')).toHaveValue(preference)
      await waitFor(() =>
        expect(document.documentElement).toHaveAttribute(
          'data-theme',
          preference,
        ),
      )
    },
  )

  it('persists selector changes and ignores system changes while forced', async () => {
    const media = mockColorScheme(false)
    render(
      <MemoryRouter>
        <AppNavigation />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('テーマ'), {
      target: { value: 'dark' },
    })
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    await waitFor(() =>
      expect(document.documentElement).toHaveAttribute('data-theme', 'dark'),
    )
    media.setMatches(false)
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })

  it('marks Cards and Decks sections with aria-current', () => {
    mockColorScheme(false)
    const cards = render(
      <MemoryRouter initialEntries={['/cards/CARD-001']}>
        <AppNavigation />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Cards' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      screen.getByRole('link', { name: 'HLSieve DB' }),
    ).not.toHaveAttribute('aria-current')
    cards.unmount()

    render(
      <MemoryRouter initialEntries={['/deck/share']}>
        <AppNavigation />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Decks' })).toHaveClass('active')
    expect(screen.getByRole('link', { name: 'Decks' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})
