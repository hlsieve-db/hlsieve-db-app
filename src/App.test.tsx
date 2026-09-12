import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import indexHtml from '../index.html?raw'
import { SITE_ORIGIN } from './domain/site/constants'
import App from './App'

vi.mock('./repositories/loadCardsData', () => ({
  loadCardsData: vi.fn(() => new Promise(() => undefined)),
}))

vi.mock('./repositories/deckRepository', () => ({
  deckRepository: {
    listDecks: vi.fn(async () => []),
    getDeck: vi.fn(async () => undefined),
    saveDeck: vi.fn(async () => undefined),
    deleteDeck: vi.fn(async () => undefined),
  },
}))

vi.mock('./repositories/tournamentReportRepository', () => ({
  tournamentReportRepository: {
    listReports: vi.fn(async () => []),
    getReport: vi.fn(async () => undefined),
    createReport: vi.fn(),
    updateReport: vi.fn(),
    deleteReport: vi.fn(),
  },
}))

describe('App', () => {
  it('正式名称とカード検索画面の見出しを表示する', () => {
    render(
      <MemoryRouter initialEntries={['/cards']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByText('HLSieve DB')).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'カード検索' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('hOCG Card Tool')).not.toBeInTheDocument()
  })

  it('root HTMLのdocument titleに正式名称を設定する', () => {
    const document = new DOMParser().parseFromString(
      indexHtml.replaceAll('__SITE_ORIGIN__', SITE_ORIGIN),
      'text/html',
    )

    expect(document.title).toBe('HLSieve DB | ホロライブOCGカード検索DB')
    expect(
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute('content'),
    ).toContain('非公式')
    expect(
      document.querySelector('link[rel="icon"]')?.getAttribute('href'),
    ).toBe('/favicon.svg')
    expect(
      document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    ).toBe('https://hlsieve.com/cards')
    expect(
      document
        .querySelector('meta[property="og:title"]')
        ?.getAttribute('content'),
    ).toBe('HLSieve DB | ホロライブOCGカード検索DB')
    expect(
      document
        .querySelector('meta[property="og:url"]')
        ?.getAttribute('content'),
    ).toBe('https://hlsieve.com/cards')
    expect(
      document
        .querySelector('meta[name="twitter:card"]')
        ?.getAttribute('content'),
    ).toBe('summary_large_image')
    expect(indexHtml).toContain('hlsieve:theme')
    expect(indexHtml).toContain('__SITE_ORIGIN__')
    expect(indexHtml).not.toContain(SITE_ORIGIN)
    expect(indexHtml).not.toContain('vite.svg')
  })

  it('shows the fan-made disclaimer', () => {
    render(
      <MemoryRouter initialEntries={['/cards']}>
        <App />
      </MemoryRouter>,
    )
    expect(
      screen.getByText('HLSieve DBは非公式のファンメイドツールです。'),
    ).toBeVisible()
    expect(
      screen.getByRole('link', { name: '免責事項・利用条件' }),
    ).toHaveAttribute('href', '/disclaimer')
  })

  it('routes to updates and cleans disclaimer robots metadata on navigation', () => {
    render(
      <MemoryRouter initialEntries={['/updates']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: '更新履歴' })).toBeVisible()
    expect(document.title).toBe('更新履歴 | HLSieve DB')

    fireEvent.click(screen.getByRole('link', { name: '免責事項・利用条件' }))
    expect(
      screen.getByRole('heading', { name: '免責事項・利用条件' }),
    ).toBeVisible()
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex,follow',
    )

    fireEvent.click(screen.getByRole('link', { name: 'Cards' }))
    expect(screen.getByRole('heading', { name: 'カード検索' })).toBeVisible()
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'index,follow',
    )
  })

  it('canonicalizes parameterized card searches to the Cards route', () => {
    render(
      <MemoryRouter initialEntries={['/cards?q=AZKi&page=2']}>
        <App />
      </MemoryRouter>,
    )

    expect(
      document.head.querySelector('link[rel="canonical"]'),
    ).toHaveAttribute('href', 'https://hlsieve.com/cards')
  })

  it('routes to the standalone probability calculator', () => {
    render(
      <MemoryRouter initialEntries={['/probability']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: '確率計算' })).toBeVisible()
    expect(screen.getByLabelText(/現在の山札枚数/)).toHaveValue(50)
    expect(document.title).toBe('確率計算 | HLSieve DB')
  })

  it('routes to the standalone mulligan calculator', () => {
    render(
      <MemoryRouter initialEntries={['/mulligan']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'マリガン計算' })).toBeVisible()
    expect(screen.getByLabelText('現在の山札枚数')).toHaveValue(50)
    expect(screen.getByLabelText('初手枚数')).toHaveValue(7)
    expect(document.title).toBe('マリガン計算 | HLSieve DB')
  })

  it('routes to the standalone Swiss calculator', () => {
    render(
      <MemoryRouter initialEntries={['/swiss']}>
        <App />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('heading', { name: 'スイスドロー計算' }),
    ).toBeVisible()
    expect(screen.getByLabelText('参加人数')).toHaveValue(64)
    expect(document.title).toBe('スイスドロー計算 | HLSieve DB')
  })

  it('routes to the tournament report builder', () => {
    render(
      <MemoryRouter initialEntries={['/tournament-report']}>
        <App />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('heading', { name: '大会戦績レポート' }),
    ).toBeVisible()
    expect(screen.getByLabelText('大会名（必須）')).toBeVisible()
    expect(document.title).toBe('大会戦績レポート | HLSieve DB')
  })

  it('routes to the local tournament history with noindex metadata', async () => {
    render(
      <MemoryRouter initialEntries={['/tournament-history']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: '大会戦績履歴' })).toBeVisible()
    expect(
      await screen.findByText('保存された大会戦績はありません。'),
    ).toBeVisible()
    expect(document.title).toBe('大会戦績履歴 | HLSieve DB')
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex,follow',
    )
  })

  it('routes to local tournament statistics with noindex metadata', async () => {
    render(
      <MemoryRouter initialEntries={['/tournament-stats']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: '大会戦績統計' })).toBeVisible()
    expect(
      await screen.findByText('保存された大会戦績がありません。'),
    ).toBeVisible()
    expect(document.title).toBe('大会戦績統計 | HLSieve DB')
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex,follow',
    )
    expect(
      document.head.querySelector('link[rel="canonical"]'),
    ).toHaveAttribute('href', `${SITE_ORIGIN}/tournament-stats`)
  })

  it('renders a branded Not Found page with navigation', () => {
    render(
      <MemoryRouter initialEntries={['/this-does-not-exist']}>
        <App />
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('heading', { name: 'ページが見つかりません' }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Cardsへ' })).toHaveAttribute(
      'href',
      '/cards',
    )
    expect(screen.getByRole('link', { name: 'Decksへ' })).toHaveAttribute(
      'href',
      '/decks',
    )
    expect(document.title).toBe('ページが見つかりません | HLSieve DB')
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex',
    )
  })

  it('Decks navigation and canonical deck routes are available', async () => {
    render(
      <MemoryRouter initialEntries={['/decks']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Cards' })).toHaveAttribute(
      'href',
      '/cards',
    )
    expect(screen.getByRole('link', { name: 'Decks' })).toHaveAttribute(
      'href',
      '/decks',
    )
    expect(await screen.findByText('デッキがありません')).toBeVisible()
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex,follow',
    )
  })

  it('uses /decks/:deckId for the editor route', async () => {
    render(
      <MemoryRouter initialEntries={['/decks/missing']}>
        <App />
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('heading', { name: 'デッキが見つかりません' }),
    ).toBeVisible()
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex,follow',
    )
  })
})
