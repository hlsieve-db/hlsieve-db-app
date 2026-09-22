import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import indexHtml from '../index.html?raw'
import { SITE_ORIGIN } from './domain/site/constants'
import App from './App'

vi.mock('./repositories/loadCardsData', () => ({
  loadCardsData: vi.fn(() => new Promise(() => undefined)),
}))

// The app now builds every local store from one factory, so stubbing that is
// enough to keep these route tests away from IndexedDB.
vi.mock('./repositories/appRepositories', () => ({
  createAppRepositories: () => ({
    namespace: { kind: 'anonymous' },
    decks: {
      listDecks: vi.fn(async () => []),
      getDeck: vi.fn(async () => undefined),
      saveDeck: vi.fn(async () => undefined),
      deleteDeck: vi.fn(async () => undefined),
      importDecks: vi.fn(async () => undefined),
    },
    favoriteCards: {
      listFavorites: vi.fn(async () => []),
      getFavorite: vi.fn(async () => undefined),
      addFavorite: vi.fn(),
      removeFavorite: vi.fn(),
    },
    savedSearchPresets: {
      listPresets: vi.fn(async () => []),
      getPreset: vi.fn(async () => undefined),
      createPreset: vi.fn(),
      removePreset: vi.fn(),
    },
    tournamentReports: {
      listReports: vi.fn(async () => []),
      getReport: vi.fn(async () => undefined),
      createReport: vi.fn(),
      updateReport: vi.fn(),
      deleteReport: vi.fn(),
      importReports: vi.fn(),
    },
    recentlyViewedCards: {
      list: vi.fn(async () => []),
      recordView: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
    },
  }),
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
    expect(screen.getByRole('link', { name: '利用条件' })).toHaveAttribute(
      'href',
      '/disclaimer',
    )
  })

  it('routes to updates and cleans disclaimer robots metadata on navigation', () => {
    render(
      <MemoryRouter initialEntries={['/updates']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: '更新履歴' })).toBeVisible()
    expect(document.title).toBe('更新履歴 | HLSieve DB')

    fireEvent.click(screen.getByRole('link', { name: '利用条件' }))
    expect(screen.getByRole('heading', { name: '利用条件' })).toBeVisible()
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex,follow',
    )

    fireEvent.click(screen.getByRole('link', { name: 'HLSieve DB' }))
    expect(screen.getByRole('heading', { name: 'カード検索' })).toBeVisible()
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'index,follow',
    )
  })

  // Google fetches this page during OAuth verification, unauthenticated, and
  // reaches it from the home page footer.
  it('routes to the privacy policy from the footer without signing in', () => {
    render(
      <MemoryRouter initialEntries={['/cards']}>
        <App />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('link', { name: 'プライバシーポリシー' }))
    expect(
      screen.getByRole('heading', { name: 'プライバシーポリシー' }),
    ).toBeVisible()
    expect(document.title).toBe('プライバシーポリシー | HLSieve DB')
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'index,follow',
    )
    // Nothing gates the page: the policy body itself renders while signed out,
    // with no sign-in control standing in front of it.
    expect(
      screen.getByText(/Googleアカウントのパスワードは取得も保存もしません/),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /ログイン/ }),
    ).not.toBeInTheDocument()
  })

  // The route exists whether or not a server is configured; with none, the
  // page says short links are unavailable rather than failing to resolve.
  it('routes /s/:shareId to the short share page as noindex', async () => {
    render(
      <MemoryRouter initialEntries={['/s/Ab3xK9pQ']}>
        <App />
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('heading', { name: '共有デッキ' }),
    ).toBeVisible()
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex,follow',
    )
    // The long share route is untouched and still its own page.
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull()
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

  it('routes to the official Q&A search with canonical metadata', () => {
    render(
      <MemoryRouter initialEntries={['/qa?q=Q617&page=2']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: '公式Q&A検索' })).toBeVisible()
    expect(document.title).toBe('公式Q&A検索 | HLSieve DB')
    expect(
      document.head.querySelector('link[rel="canonical"]'),
    ).toHaveAttribute('href', 'https://hlsieve.com/qa')
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
    expect(screen.getByRole('link', { name: 'カード検索へ' })).toHaveAttribute(
      'href',
      '/cards',
    )
    expect(screen.getByRole('link', { name: '保存デッキへ' })).toHaveAttribute(
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

    expect(screen.getByRole('button', { name: 'カード' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'デッキ' })).toBeVisible()
    expect(screen.getByRole('link', { name: '保存デッキ' })).toHaveAttribute(
      'href',
      '/decks',
    )
    expect(await screen.findByText('デッキがありません')).toBeVisible()
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex,follow',
    )
  })

  it('routes to local deck comparison with noindex metadata', async () => {
    render(
      <MemoryRouter initialEntries={['/deck-compare']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'デッキ比較' })).toBeVisible()
    expect(screen.getByText('デッキを読み込んでいます…')).toBeVisible()
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex,follow',
    )
    expect(
      document.head.querySelector('link[rel="canonical"]'),
    ).toHaveAttribute('href', `${SITE_ORIGIN}/deck-compare`)
  })

  it('routes to local favorites with canonical noindex metadata', async () => {
    render(
      <MemoryRouter initialEntries={['/favorites']}>
        <App />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('heading', { name: 'お気に入りカード' }),
    ).toBeVisible()
    expect(document.title).toBe('お気に入りカード | HLSieve DB')
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex,follow',
    )
    expect(
      document.head.querySelector('link[rel="canonical"]'),
    ).toHaveAttribute('href', `${SITE_ORIGIN}/favorites`)
  })

  it('routes to recently viewed cards with canonical noindex metadata', async () => {
    render(
      <MemoryRouter initialEntries={['/recent']}>
        <App />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('heading', { name: '最近見たカード' }),
    ).toBeVisible()
    expect(document.title).toBe('最近見たカード | HLSieve DB')
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex,follow',
    )
    expect(
      document.head.querySelector('link[rel="canonical"]'),
    ).toHaveAttribute('href', `${SITE_ORIGIN}/recent`)
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
