import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
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
  it.each([
    '/cards',
    '/cards/CARD-001',
    '/favorites',
    '/recent',
    '/decks',
    '/decks/deck-1',
    '/deck/share',
    '/probability',
    '/qa',
    '/mulligan',
    '/swiss',
    '/tournament-report',
    '/tournament-history',
    '/tournament-stats',
    '/updates',
    '/disclaimer',
    '/unknown',
  ])(
    'shows the visual subtitle without changing brand identity on %s',
    (path) => {
      mockColorScheme(false)
      render(
        <MemoryRouter initialEntries={[path]}>
          <AppNavigation />
        </MemoryRouter>,
      )

      expect(screen.getByText('ホロライブOCGカード検索DB')).toBeVisible()
      expect(screen.getByRole('link', { name: 'HLSieve DB' })).toHaveAttribute(
        'href',
        '/cards',
      )
    },
  )

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

  it('marks Card and Deck categories for deep routes', () => {
    mockColorScheme(false)
    const cards = render(
      <MemoryRouter initialEntries={['/cards/CARD-001']}>
        <AppNavigation />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'カード' })).toHaveAttribute(
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
    expect(screen.getByRole('button', { name: 'デッキ' })).toHaveClass(
      'is-active',
    )
    expect(screen.getByRole('button', { name: 'デッキ' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('shows five concise primary categories before the theme control', () => {
    mockColorScheme(false)
    const { container } = render(
      <MemoryRouter initialEntries={['/updates']}>
        <AppNavigation />
      </MemoryRouter>,
    )
    const navigation = screen.getByRole('navigation')
    expect(
      within(navigation)
        .getAllByRole('button')
        .map((button) => button.textContent?.replace('▾', '')),
    ).toEqual(['カード', 'デッキ', '大会', 'ツール'])
    expect(screen.getByRole('link', { name: '更新履歴' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      within(navigation).queryByRole('link', { name: '免責事項・利用条件' }),
    ).not.toBeInTheDocument()
    expect(
      navigation.compareDocumentPosition(
        container.querySelector('.theme-control')!,
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('opens one desktop disclosure and closes it by toggle, outside click, and Escape', () => {
    mockColorScheme(false)
    render(
      <MemoryRouter initialEntries={['/cards']}>
        <AppNavigation />
      </MemoryRouter>,
    )
    const cardButton = screen.getByRole('button', { name: 'カード' })
    fireEvent.click(cardButton)
    expect(cardButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: '公式Q&A検索' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'デッキ' }))
    expect(cardButton).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('link', { name: '保存デッキ' })).toBeVisible()

    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('link', { name: '保存デッキ' })).toBeNull()

    fireEvent.click(cardButton)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(cardButton).toHaveAttribute('aria-expanded', 'false')
    expect(cardButton).toHaveFocus()
  })

  it('closes desktop and mobile navigation after route links are used', async () => {
    mockColorScheme(false)
    render(
      <MemoryRouter initialEntries={['/cards']}>
        <AppNavigation />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'カード' }))
    fireEvent.click(screen.getByRole('link', { name: 'お気に入り' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'カード' })).toHaveAttribute(
        'aria-expanded',
        'false',
      ),
    )

    const menuButton = screen.getByRole('button', { name: 'メニュー' })
    fireEvent.click(menuButton)
    expect(menuButton).toHaveAttribute('aria-expanded', 'true')
    const mobileMenu = screen.getByRole('navigation', {
      name: 'モバイルメニュー',
    })
    expect(within(mobileMenu).getByText('カード')).toBeVisible()
    expect(within(mobileMenu).getByText('デッキ')).toBeVisible()
    expect(within(mobileMenu).getByText('大会')).toBeVisible()
    expect(within(mobileMenu).getByText('ツール')).toBeVisible()
    expect(within(mobileMenu).getByText('その他')).toBeVisible()
    expect(screen.getByLabelText('テーマ')).toBeVisible()
    fireEvent.click(
      within(mobileMenu).getByRole('link', { name: 'マリガン計算' }),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('navigation', { name: 'モバイルメニュー' }),
      ).not.toBeInTheDocument(),
    )
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
  })
})
