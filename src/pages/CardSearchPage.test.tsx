import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { Card, CardsDataFile } from '../domain/cards/types'
import type { DeckRepository } from '../repositories/deckRepository'
import { CardSearchPage } from './CardSearchPage'

function emptyDeckRepository(): DeckRepository {
  return {
    listDecks: vi.fn(async () => []),
    getDeck: vi.fn(async () => undefined),
    saveDeck: vi.fn(async () => undefined),
    deleteDeck: vi.fn(async () => undefined),
  }
}

function card(
  cardNumber: string,
  name: string,
  overrides: Partial<Card> = {},
): Card {
  return {
    cardNumber,
    name,
    cardType: 'holomem',
    colors: ['green'],
    bloomLevel: 'debut',
    debutType: 'normal',
    isBuzz: false,
    tags: [],
    abilities: [],
    arts: [],
    batonPass: [],
    effectTags: [],
    criticalColors: [],
    rarities: [],
    products: [],
    illustrators: [],
    qas: [],
    searchText: `${cardNumber.toLowerCase()} ${name}`,
    ...overrides,
  }
}

function fixtureCards(count = 30): Card[] {
  const featured = [
    card('Z-003', 'フワモコ', {
      colors: ['red', 'blue'],
      bloomLevel: 'first',
      isBuzz: true,
      criticalColors: ['red', 'blue'],
      effectTags: ['draw', 'deck_search'],
      searchText: 'z-003 ふわもこ どろー',
      imageUrl: 'https://example.com/z-003.png',
    }),
    card('A-001', '青カード', {
      colors: ['blue'],
      bloomLevel: 'second',
      effectTags: ['draw'],
      searchText: 'a-001 青かーど どろー',
      releaseDate: '2026-01-01',
    }),
    card('M-002', '赤い推し', {
      cardType: 'oshi',
      colors: ['red'],
      bloomLevel: 'first',
      effectTags: ['deck_search'],
      searchText: 'm-002 赤い推し さーち',
      releaseDate: '2025-01-01',
    }),
  ]
  const remaining = Array.from(
    { length: Math.max(0, count - featured.length) },
    (_, index) =>
      card(
        `F-${String(index + 1).padStart(3, '0')}`,
        `フィラーカード${index + 1}`,
        {
          searchText: `f-${String(index + 1).padStart(3, '0')} ふぃらーかーど${index + 1}`,
          releaseDate: `2024-01-${String((index % 28) + 1).padStart(2, '0')}`,
        },
      ),
  )
  return [...featured, ...remaining]
}

function dataFile(cards = fixtureCards()): CardsDataFile {
  return {
    format: 'holocard-cards',
    formatVersion: 1,
    dataVersion: `sha256:${'0'.repeat(64)}`,
    generatedAt: '2026-09-07T00:00:00.000Z',
    cards,
  }
}

function LocationControls() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <aside>
      <output data-testid="location">
        {location.pathname}
        {location.search}
      </output>
      <button type="button" onClick={() => navigate(-1)}>
        履歴を戻る
      </button>
      <button type="button" onClick={() => navigate(1)}>
        履歴を進む
      </button>
    </aside>
  )
}

function renderPage({
  entries = ['/cards'],
  initialIndex,
  loadCards = vi.fn(async () => dataFile()),
  repository = emptyDeckRepository(),
}: {
  entries?: string[]
  initialIndex?: number
  loadCards?: () => Promise<CardsDataFile>
  repository?: DeckRepository
} = {}) {
  render(
    <MemoryRouter initialEntries={entries} initialIndex={initialIndex}>
      <Routes>
        <Route
          path="/cards"
          element={
            <>
              <CardSearchPage loadCards={loadCards} repository={repository} />
              <LocationControls />
            </>
          }
        />
        <Route path="/previous" element={<p>前の画面</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return { loadCards }
}

async function loaded() {
  await screen.findByText(/30件/)
}

function group(name: string) {
  return screen.getByRole('group', { name })
}

describe('CardSearchPage loading and results', () => {
  it('shows accessible loading state without results', () => {
    renderPage({ loadCards: () => new Promise(() => undefined) })
    expect(
      screen.getByText('カードデータを読み込んでいます…'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/件のカード/)).not.toBeInTheDocument()
  })

  it('renders total count, at most 24 cards, images, and fallback', async () => {
    renderPage()
    await loaded()

    expect(screen.getAllByRole('article')).toHaveLength(24)
    expect(
      screen.getByRole('img', { name: 'フワモコのカード画像' }),
    ).toHaveAttribute('loading', 'lazy')
    expect(screen.getAllByText('画像なし').length).toBeGreaterThan(0)
    expect(screen.getByText('Z-003')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'フワモコ' }),
    ).toBeInTheDocument()
  })

  it('shows an error without results and retries successfully', async () => {
    const loadCards = vi
      .fn<() => Promise<CardsDataFile>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(dataFile())
    renderPage({ loadCards })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'カードデータを読み込めませんでした。',
    )
    expect(screen.queryByText(/件のカード/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '再試行' }))
    expect(
      screen.getByText('カードデータを読み込んでいます…'),
    ).toBeInTheDocument()
    await loaded()
    expect(loadCards).toHaveBeenCalledTimes(2)
  })

  it('shows an empty state and clear action', async () => {
    renderPage({ entries: ['/cards?q=missing'] })
    expect(
      await screen.findByText('条件に一致するカードがありません。'),
    ).toBeInTheDocument()
    expect(screen.getByText('0件')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: '条件をクリア' })[0]!)
    await loaded()
  })
})

describe('CardSearchPage initial URL and navigation', () => {
  it('restores query, filters, sort, and page from URL', async () => {
    renderPage({
      entries: [
        '/cards?q=%E3%83%95%E3%83%AF%E3%83%A2%E3%82%B3&color=red&type=holomem&bloom=buzz&critical=red&tag=draw&sort=card_number_asc&page=2',
      ],
    })
    await screen.findByText(/1件/)

    expect(screen.getByLabelText('キーワード')).toHaveValue('フワモコ')
    expect(
      within(group('色')).getByRole('checkbox', { name: '赤' }),
    ).toBeChecked()
    expect(
      within(group('カードタイプ')).getByRole('checkbox', {
        name: 'ホロメン',
      }),
    ).toBeChecked()
    expect(
      within(group('Bloom / Buzz')).getByRole('checkbox', { name: 'Buzz' }),
    ).toBeChecked()
    expect(
      within(group('Critical')).getByRole('checkbox', { name: '赤' }),
    ).toBeChecked()
    expect(
      within(group('効果タグ')).getByRole('checkbox', { name: 'ドロー' }),
    ).toBeChecked()
    expect(screen.getByLabelText('並び順')).toHaveValue('card_number_asc')
  })

  it('canonically replaces malformed, unknown, and default parameters', async () => {
    renderPage({ entries: ['/cards?sort=default&page=1&foo=bar&color=pink'] })
    await loaded()
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/cards'),
    )
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/cards$/)
  })

  it('replaces an out-of-range page with the effective page', async () => {
    renderPage({ entries: ['/cards?page=99'] })
    await screen.findByText('2 / 2ページ')
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/cards?page=2'),
    )
  })

  it('restores controls and results on back and forward navigation', async () => {
    renderPage({
      entries: ['/cards?q=フワモコ', '/cards?q=青カード'],
      initialIndex: 1,
    })
    expect(
      await screen.findByRole('heading', { name: '青カード' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '履歴を戻る' }))
    expect(
      await screen.findByRole('heading', { name: 'フワモコ' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('キーワード')).toHaveValue('フワモコ')

    fireEvent.click(screen.getByRole('button', { name: '履歴を進む' }))
    expect(
      await screen.findByRole('heading', { name: '青カード' }),
    ).toBeInTheDocument()
  })
})

describe('CardSearchPage query and filters', () => {
  it('preserves Japanese input, normalizes matching, resets page, and replaces history', async () => {
    renderPage({
      entries: ['/previous', '/cards?page=2'],
      initialIndex: 1,
    })
    await screen.findByText('2 / 2ページ')
    fireEvent.change(screen.getByLabelText('キーワード'), {
      target: { value: 'フワモコ' },
    })

    expect(
      await screen.findByRole('heading', { name: 'フワモコ' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('キーワード')).toHaveValue('フワモコ')
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/cards?q=%E3%83%95%E3%83%AF%E3%83%A2%E3%82%B3',
    )
    fireEvent.click(screen.getByRole('button', { name: '履歴を戻る' }))
    expect(await screen.findByText('前の画面')).toBeInTheDocument()
  })

  it('does not navigate during IME composition and commits on composition end', async () => {
    renderPage()
    await loaded()
    const input = screen.getByLabelText('キーワード')
    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: 'フワモコ' } })
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/cards$/)
    expect(input).toHaveValue('フワモコ')

    fireEvent.compositionEnd(input, { data: 'フワモコ' })
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('q='),
    )
  })

  it('wires all structured filter groups and canonical modes to URL', async () => {
    renderPage({ entries: ['/cards?page=2'] })
    await screen.findByText('2 / 2ページ')

    fireEvent.click(within(group('色')).getByRole('checkbox', { name: '赤' }))
    fireEvent.change(screen.getByLabelText('色の一致条件'), {
      target: { value: 'and' },
    })
    fireEvent.click(
      within(group('カードタイプ')).getByRole('checkbox', {
        name: 'ホロメン',
      }),
    )
    fireEvent.click(
      within(group('Bloom / Buzz')).getByRole('checkbox', { name: 'Buzz' }),
    )
    fireEvent.click(
      within(group('Critical')).getByRole('checkbox', { name: '赤' }),
    )
    fireEvent.change(screen.getByLabelText('Criticalの一致条件'), {
      target: { value: 'and' },
    })
    fireEvent.click(
      within(group('効果タグ')).getByRole('checkbox', { name: 'ドロー' }),
    )
    fireEvent.change(screen.getByLabelText('効果タグの一致条件'), {
      target: { value: 'or' },
    })

    expect(
      await screen.findByRole('heading', { name: 'フワモコ' }),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/cards?color=red&colorMode=and&type=holomem&bloom=buzz&critical=red&criticalMode=and&tag=draw&tagMode=or',
      ),
    )
  })

  it('uses push for filter changes and clear-all', async () => {
    renderPage()
    await loaded()
    fireEvent.click(within(group('色')).getByRole('checkbox', { name: '赤' }))
    await screen.findByText('2件')
    fireEvent.click(screen.getByRole('button', { name: '履歴を戻る' }))
    await loaded()
    expect(
      within(group('色')).getByRole('checkbox', { name: '赤' }),
    ).not.toBeChecked()

    fireEvent.click(
      within(group('Bloom / Buzz')).getByRole('checkbox', { name: 'Buzz' }),
    )
    fireEvent.click(screen.getAllByRole('button', { name: '条件をクリア' })[0]!)
    await loaded()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/cards$/)
    fireEvent.click(screen.getByRole('button', { name: '履歴を戻る' }))
    await screen.findByText('1件')
  })
})

describe('CardSearchPage sort and pagination', () => {
  it('changes rendered order, pushes URL, resets page, and restores default', async () => {
    renderPage({ entries: ['/cards?page=2'] })
    await screen.findByText('2 / 2ページ')
    fireEvent.change(screen.getByLabelText('並び順'), {
      target: { value: 'card_number_asc' },
    })

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/cards?sort=card_number_asc',
      ),
    )
    const results = screen.getByRole('region', { name: /件のカード/ })
    expect(
      within(results).getAllByRole('heading', { level: 2 })[0],
    ).toHaveTextContent('青カード')

    fireEvent.change(screen.getByLabelText('並び順'), {
      target: { value: 'default' },
    })
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/cards$/),
    )
    expect(
      within(results).getAllByRole('heading', { level: 2 })[0],
    ).toHaveTextContent('フワモコ')
  })

  it('navigates next and previous while preserving filters', async () => {
    renderPage({ entries: ['/cards?color=green'] })
    await screen.findByText('1 / 2ページ')
    const previous = screen.getByRole('button', { name: '前へ' })
    const next = screen.getByRole('button', { name: '次へ' })
    expect(previous).toBeDisabled()
    expect(next).toBeEnabled()

    fireEvent.click(next)
    await screen.findByText('2 / 2ページ')
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/cards?color=green&page=2',
    )
    expect(screen.getByRole('button', { name: '次へ' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '前へ' }))
    await screen.findByText('1 / 2ページ')
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/cards?color=green',
    )
  })
})
