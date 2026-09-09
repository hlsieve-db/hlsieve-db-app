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
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  Card,
  CardPrintingsDataFile,
  CardsDataFile,
} from '../domain/cards/types'
import type { DeckRepository } from '../repositories/deckRepository'
import { CardDetailPage } from './CardDetailPage'
import { CardSearchPage } from './CardSearchPage'

function emptyDeckRepository(): DeckRepository {
  return {
    listDecks: vi.fn(async () => []),
    getDeck: vi.fn(async () => undefined),
    saveDeck: vi.fn(async () => undefined),
    deleteDeck: vi.fn(async () => undefined),
  }
}

function card(overrides: Partial<Card> = {}): Card {
  return {
    cardNumber: 'TEST-001',
    name: 'テストホロメン',
    imageUrl: 'https://example.com/test.png',
    nameReading: 'てすとほろめん',
    cardType: 'holomem',
    colors: ['red', 'blue'],
    bloomLevel: 'debut',
    debutType: 'extra',
    isBuzz: true,
    hp: 120,
    life: 5,
    tags: [],
    supportType: undefined,
    isLimited: false,
    supportSearchCategory: undefined,
    abilities: [{ type: 'bloom', text: '能力本文をそのまま表示する。' }],
    arts: [
      {
        name: 'テストアーツ',
        requiredCheers: [
          { color: 'red', count: 2 },
          { color: 'any', count: 1 },
        ],
        damage: 60,
        effectText: 'アーツ効果本文。',
        critical: { color: 'blue', bonusDamage: 20 },
      },
    ],
    batonPass: [{ color: 'green', count: 1 }],
    extraText: '追加テキスト本文。',
    effectTags: ['draw', 'deck_search'],
    criticalColors: ['red', 'blue'],
    rarities: [],
    products: [],
    illustrators: [],
    qas: [
      {
        question: 'このカードは使えますか？',
        answer: 'はい、使えます。',
      },
    ],
    deckLimit: 2,
    releaseDate: '2026-01-02',
    searchText: 'detail-only-search-text',
    officialUrl: 'https://example.com/card/TEST-001',
    ...overrides,
  }
}

function dataFile(cards: Card[] = [card()]): CardsDataFile {
  return {
    format: 'holocard-cards',
    formatVersion: 1,
    dataVersion: `sha256:${'0'.repeat(64)}`,
    generatedAt: '2026-09-07T00:00:00.000Z',
    cards,
  }
}

function printingsData(cardNumber = 'TEST-001'): CardPrintingsDataFile {
  return {
    format: 'hlsieve-card-printings',
    formatVersion: 1,
    cardsDataVersion: `sha256:${'0'.repeat(64)}`,
    dataVersion: `sha256:${'1'.repeat(64)}`,
    cards: {
      [cardNumber]: {
        defaultPrintingOfficialId: '1',
        printings: [
          {
            officialId: '1',
            officialUrl: `https://example.com/card/${cardNumber}`,
            isParallel: false,
            imageUrl: 'https://example.com/test.png',
            rarity: 'C',
            products: ['テスト商品'],
          },
        ],
      },
    },
  }
}

function renderDetail({
  path = '/cards/TEST-001',
  loadCards = vi.fn(async () => dataFile()),
  loadPrintings = vi.fn(async () => printingsData()),
  repository = emptyDeckRepository(),
}: {
  path?: string
  loadCards?: () => Promise<CardsDataFile>
  loadPrintings?: () => Promise<CardPrintingsDataFile>
  repository?: DeckRepository
} = {}) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/cards/:cardNumber"
          element={
            <CardDetailPage
              loadCards={loadCards}
              loadPrintings={loadPrintings}
              repository={repository}
            />
          }
        />
        <Route path="/cards" element={<p>検索画面</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return { loadCards, loadPrintings }
}

function HistoryControls() {
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
    </aside>
  )
}

beforeEach(() => {
  document.title = 'HLSieve DB'
})

describe('CardDetailPage route and loader states', () => {
  it('shows an accessible loading state for a direct deep link', () => {
    renderDetail({ loadCards: () => new Promise(() => undefined) })

    expect(screen.getByText('HLSieve DB')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'カード詳細' })).toBeVisible()
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent(
      'カード情報を読み込んでいます…',
    )
  })

  it('shows a load error and retries successfully', async () => {
    const loadCards = vi
      .fn<() => Promise<CardsDataFile>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(dataFile())
    renderDetail({ loadCards })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'カード情報を読み込めませんでした。',
    )
    fireEvent.click(screen.getByRole('button', { name: '再試行' }))
    expect(
      screen.getByText('カード情報を読み込んでいます…'),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'テストホロメン' }),
    ).toBeVisible()
    expect(loadCards).toHaveBeenCalledTimes(2)
  })

  it('shows branded not-found UI and fallback link', async () => {
    renderDetail({ path: '/cards/UNKNOWN' })

    expect(
      await screen.findByRole('heading', { name: 'カードが見つかりません' }),
    ).toBeVisible()
    expect(screen.getByText('HLSieve DB')).toBeVisible()
    expect(
      screen.getAllByRole('link', { name: 'カード検索へ戻る' })[0],
    ).toHaveAttribute('href', '/cards')
    expect(document.title).toBe('カードが見つかりません | HLSieve DB')
  })
})

describe('CardDetailPage public card information', () => {
  it('renders primary fields, gameplay text, Q&A, and official URL', async () => {
    renderDetail()

    expect(
      await screen.findByRole('heading', { name: 'テストホロメン' }),
    ).toBeVisible()
    expect(screen.getByText('TEST-001')).toBeVisible()
    expect(screen.getByText('てすとほろめん')).toBeVisible()
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'テストホロメンのカード画像',
    )
    expect(screen.getByText('ホロメン')).toBeVisible()
    expect(screen.getByText('赤・青')).toBeVisible()
    expect(screen.getByText('Debut（エクストラ）')).toBeVisible()
    expect(screen.getByText('Buzzホロメン')).toBeVisible()
    expect(screen.getByText('120')).toBeVisible()
    expect(screen.getByText('5')).toBeVisible()
    expect(screen.queryByText('LIMITED')).not.toBeInTheDocument()
    expect(screen.getByText('緑 × 1')).toBeVisible()
    expect(screen.getByText('能力本文をそのまま表示する。')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'テストアーツ' })).toBeVisible()
    expect(screen.getByText('赤 × 2')).toBeVisible()
    expect(screen.getByText('任意 × 1')).toBeVisible()
    expect(screen.getByText('60')).toBeVisible()
    expect(screen.getByText('青 +20')).toBeVisible()
    expect(screen.getByText('アーツ効果本文。')).toBeVisible()
    expect(screen.getByText('追加テキスト本文。')).toBeVisible()
    expect(screen.getByText('ドロー')).toBeVisible()
    expect(screen.getByText('デッキサーチ')).toBeVisible()
    expect(
      within(screen.getByRole('region', { name: 'Critical対応色' })).getByText(
        '赤',
      ),
    ).toBeVisible()
    expect(screen.getByText('2026-01-02')).toBeVisible()
    expect(screen.getByText('2枚')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Q&A（1件）' })).toBeVisible()
    expect(screen.getByText('Q. このカードは使えますか？')).toBeVisible()
    expect(screen.getByText('A. はい、使えます。')).toBeInTheDocument()
    expect(
      screen.queryByText('detail-only-search-text'),
    ).not.toBeInTheDocument()
    const officialLink = screen.getByRole('link', {
      name: '公式カードページ',
    })
    expect(officialLink).toHaveAttribute(
      'href',
      'https://example.com/card/TEST-001',
    )
    expect(officialLink).toHaveAttribute('target', '_blank')
    await waitFor(() =>
      expect(document.title).toBe('テストホロメン | HLSieve DB'),
    )
  })

  it('omits absent optional fields, Q&A, and official URL', async () => {
    renderDetail({
      loadPrintings: () => new Promise(() => undefined),
      loadCards: async () =>
        dataFile([
          card({
            imageUrl: undefined,
            nameReading: undefined,
            bloomLevel: undefined,
            debutType: undefined,
            isBuzz: false,
            hp: undefined,
            life: undefined,
            supportType: undefined,
            isLimited: undefined,
            supportSearchCategory: undefined,
            abilities: [],
            arts: [],
            batonPass: [],
            extraText: undefined,
            effectTags: [],
            criticalColors: [],
            qas: [],
            deckLimit: null,
            releaseDate: undefined,
            officialUrl: undefined,
          }),
        ]),
    })

    await screen.findByRole('heading', { name: 'テストホロメン' })
    expect(screen.getByText('画像なし')).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: /^Q&A/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: '公式カードページ' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('undefined')).not.toBeInTheDocument()
  })

  it('shows support gameplay classifications only for support cards', async () => {
    renderDetail({
      loadCards: async () =>
        dataFile([
          card({
            cardType: 'support',
            supportType: 'tool',
            isLimited: true,
            supportSearchCategory: 'limited',
          }),
        ]),
    })

    await screen.findByRole('heading', { name: 'テストホロメン' })
    expect(screen.getByText('サポート')).toBeVisible()
    expect(screen.getByText('ツール')).toBeVisible()
    expect(screen.getByText('対象')).toBeVisible()
    expect(screen.getAllByText('LIMITED')).toHaveLength(2)
  })
})

describe('search to detail navigation', () => {
  it('links by cardNumber and browser Back restores the search URL and controls', async () => {
    const cards = Array.from({ length: 30 }, (_, index) =>
      card({
        cardNumber: `CARD-${String(index + 1).padStart(3, '0')}`,
        name: `カード${index + 1}`,
        imageUrl: undefined,
        nameReading: undefined,
        colors: ['green'],
        isBuzz: false,
        supportType: undefined,
        isLimited: undefined,
        supportSearchCategory: undefined,
        abilities: [],
        arts: [],
        batonPass: [],
        extraText: undefined,
        effectTags: [],
        criticalColors: [],
        qas: [],
        deckLimit: undefined,
        officialUrl: undefined,
        searchText: `card-${index + 1} かーど${index + 1}`,
      }),
    )
    const loadCards = vi.fn(async () => dataFile(cards))

    render(
      <MemoryRouter initialEntries={['/cards?color=green&page=2']}>
        <Routes>
          <Route
            path="/cards"
            element={
              <CardSearchPage
                loadCards={loadCards}
                repository={emptyDeckRepository()}
              />
            }
          />
          <Route
            path="/cards/:cardNumber"
            element={
              <CardDetailPage
                loadCards={loadCards}
                loadPrintings={async () => printingsData('CARD-025')}
                repository={emptyDeckRepository()}
              />
            }
          />
        </Routes>
        <HistoryControls />
      </MemoryRouter>,
    )

    await screen.findByText('2 / 2ページ')
    fireEvent.click(screen.getByRole('link', { name: 'カード25' }))
    expect(
      await screen.findByRole('heading', { name: 'カード25' }),
    ).toBeVisible()
    expect(screen.getByTestId('location')).toHaveTextContent('/cards/CARD-025')

    fireEvent.click(screen.getByRole('button', { name: '履歴を戻る' }))
    await screen.findByText('2 / 2ページ')
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/cards?color=green&page=2',
    )
    expect(
      within(screen.getByRole('group', { name: '色' })).getByRole('checkbox', {
        name: '緑',
      }),
    ).toBeChecked()
  })

  it('uses an encoded cardNumber in the result link', async () => {
    const encodedCard = card({ cardNumber: 'TEST 001', name: '空白カード' })
    render(
      <MemoryRouter>
        <CardSearchPage
          loadCards={async () => dataFile([encodedCard])}
          repository={emptyDeckRepository()}
        />
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('link', { name: '空白カード' }),
    ).toHaveAttribute('href', '/cards/TEST%20001')
  })
})
