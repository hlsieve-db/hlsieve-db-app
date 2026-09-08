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

import type {
  Card,
  CardPrintingGroupPublic,
  CardPrintingsDataFile,
  CardsDataFile,
} from '../domain/cards/types'
import { CardDetailPage } from './CardDetailPage'

const cardsVersion = `sha256:${'0'.repeat(64)}`

function card(overrides: Partial<Card> = {}): Card {
  return {
    cardNumber: 'TEST-001',
    name: 'テストホロメン',
    imageUrl: 'https://example.com/default.png',
    cardType: 'holomem',
    colors: ['blue'],
    bloomLevel: 'first',
    isBuzz: true,
    hp: 100,
    tags: [],
    isLimited: false,
    abilities: [{ type: 'gift', text: '変わらない能力本文' }],
    arts: [
      {
        name: '固定アーツ',
        requiredCheers: [],
        effectText: '変わらないアーツ本文',
      },
    ],
    batonPass: [],
    effectTags: [],
    criticalColors: [],
    rarities: ['C', 'P'],
    products: ['論理商品'],
    illustrators: ['論理絵師'],
    qas: [],
    searchText: 'test',
    officialUrl: 'https://example.com/logical',
    ...overrides,
  }
}

function cardsData(cards: Card[] = [card()]): CardsDataFile {
  return {
    format: 'holocard-cards',
    formatVersion: 1,
    dataVersion: cardsVersion,
    generatedAt: '2026-09-08T00:00:00.000Z',
    cards,
  }
}

function group(): CardPrintingGroupPublic {
  return {
    defaultPrintingOfficialId: '10',
    printings: [
      {
        officialId: '10',
        officialUrl: 'https://example.com/printing/10',
        isParallel: false,
        imageUrl: 'https://example.com/default.png',
        rarity: 'C',
        products: ['ブースターパック Vol.1', 'スタートデッキ 青'],
        illustrator: '通常絵師',
      },
      {
        officialId: '20',
        officialUrl: 'https://example.com/printing/20',
        isParallel: true,
        imageUrl: 'https://example.com/parallel.png',
        rarity: 'P',
        products: ['特別な長い商品名を持つパラレル収録商品'],
        illustrator: 'パラレル絵師',
      },
    ],
  }
}

function printingsData({
  cardsDataVersion = cardsVersion,
  cards = { 'TEST-001': group() },
}: {
  cardsDataVersion?: string
  cards?: Record<string, CardPrintingGroupPublic>
} = {}): CardPrintingsDataFile {
  return {
    format: 'hlsieve-card-printings',
    formatVersion: 1,
    cardsDataVersion,
    dataVersion: `sha256:${'1'.repeat(64)}`,
    cards,
  }
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
        戻る
      </button>
      <button type="button" onClick={() => navigate(1)}>
        進む
      </button>
    </aside>
  )
}

function renderDetail({
  path = '/cards/TEST-001',
  loadCards = vi.fn(async () => cardsData()),
  loadPrintings = vi.fn(async () => printingsData()),
}: {
  path?: string
  loadCards?: () => Promise<CardsDataFile>
  loadPrintings?: () => Promise<CardPrintingsDataFile>
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
            />
          }
        />
      </Routes>
      <HistoryControls />
    </MemoryRouter>,
  )
  return { loadCards, loadPrintings }
}

describe('Card Detail printing variants', () => {
  it('renders logical content while printing data is still loading', async () => {
    const loadPrintings = vi.fn(
      () => new Promise<CardPrintingsDataFile>(() => undefined),
    )
    renderDetail({ loadPrintings })

    expect(
      await screen.findByRole('heading', { name: 'テストホロメン' }),
    ).toBeVisible()
    expect(screen.getByText('変わらない能力本文')).toBeVisible()
    expect(screen.getByText('版情報を読み込んでいます…')).toBeVisible()
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://example.com/default.png',
    )
  })

  it('selects the default printing without adding a query parameter', async () => {
    renderDetail({ path: '/cards/TEST-001?view=compact' })

    const selector = await screen.findByRole('group', {
      name: 'カードの版を選択',
    })
    expect(
      within(selector).getByRole('button', {
        name: 'テストホロメン 通常 C 版 10',
      }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/cards/TEST-001?view=compact',
    )
    expect(
      screen.getByRole('img', { name: 'テストホロメンのカード画像' }),
    ).toHaveAttribute('src', 'https://example.com/default.png')
    expect(
      screen.getByRole('link', { name: '公式カードページ' }),
    ).toHaveAttribute('href', 'https://example.com/printing/10')
    expect(screen.getAllByText('通常')).toHaveLength(2)
    expect(screen.getByText('通常絵師')).toBeVisible()
    expect(screen.getByText('ブースターパック Vol.1')).toBeVisible()
    expect(screen.getByText('スタートデッキ 青')).toBeVisible()
    expect(screen.getAllByText('版 10')).toHaveLength(2)
  })

  it('switches only visual metadata and pushes a preserved URL state', async () => {
    renderDetail({ path: '/cards/TEST-001?view=compact' })
    const parallelButton = await screen.findByRole('button', {
      name: 'テストホロメン パラレル P 版 20',
    })

    fireEvent.click(parallelButton)

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/cards/TEST-001?view=compact&printing=20',
    )
    expect(parallelButton).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByRole('img', { name: 'テストホロメンのカード画像' }),
    ).toHaveAttribute('src', 'https://example.com/parallel.png')
    expect(
      screen.getByRole('link', { name: '公式カードページ' }),
    ).toHaveAttribute('href', 'https://example.com/printing/20')
    expect(screen.getByText('パラレル絵師')).toBeVisible()
    expect(
      screen.getByText('特別な長い商品名を持つパラレル収録商品'),
    ).toBeVisible()
    expect(screen.getByText('変わらない能力本文')).toBeVisible()
    expect(screen.getByText('変わらないアーツ本文')).toBeVisible()
    expect(screen.getByText('Buzzホロメン')).toBeVisible()
    await waitFor(() =>
      expect(document.title).toBe('テストホロメン | HLSieve DB'),
    )
  })

  it('supports valid direct links and browser Back/Forward selection history', async () => {
    renderDetail()
    const parallelButton = await screen.findByRole('button', {
      name: 'テストホロメン パラレル P 版 20',
    })
    fireEvent.click(parallelButton)
    expect(parallelButton).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: '戻る' }))
    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe(
        '/cards/TEST-001',
      ),
    )
    expect(
      screen.getByRole('button', {
        name: 'テストホロメン 通常 C 版 10',
      }),
    ).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: '進む' }))
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/cards/TEST-001?printing=20',
      ),
    )
    expect(parallelButton).toHaveAttribute('aria-pressed', 'true')
  })

  it('restores a non-default printing from a direct-link mount', async () => {
    renderDetail({ path: '/cards/TEST-001?printing=20' })

    expect(
      await screen.findByRole('button', {
        name: 'テストホロメン パラレル P 版 20',
      }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByRole('img', { name: 'テストホロメンのカード画像' }),
    ).toHaveAttribute('src', 'https://example.com/parallel.png')
  })

  it.each([
    ['nonnumeric', 'abc'],
    ['unknown', '999'],
    ['cross-card', '30'],
    ['explicit default', '10'],
  ])('canonicalizes %s printing queries to the default', async (_, value) => {
    const data = printingsData({
      cards: {
        'TEST-001': group(),
        'OTHER-001': {
          defaultPrintingOfficialId: '30',
          printings: [
            {
              officialId: '30',
              officialUrl: 'https://example.com/printing/30',
              isParallel: false,
              products: [],
            },
          ],
        },
      },
    })
    renderDetail({
      path: `/cards/TEST-001?keep=yes&printing=${value}`,
      loadPrintings: async () => data,
    })

    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe(
        '/cards/TEST-001?keep=yes',
      ),
    )
    expect(
      screen.getByRole('heading', { name: 'テストホロメン' }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', {
        name: 'テストホロメン 通常 C 版 10',
      }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('hides the selector for one printing but displays its metadata', async () => {
    const single = group()
    single.printings = single.printings.slice(0, 1)
    renderDetail({
      loadPrintings: async () =>
        printingsData({ cards: { 'TEST-001': single } }),
    })

    await screen.findByText('通常絵師')
    expect(
      screen.queryByRole('group', { name: 'カードの版を選択' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('通常')).toBeVisible()
    expect(screen.getByText('版 10')).toBeVisible()
  })

  it('uses the placeholder when the selected printing has no image', async () => {
    const missingImage = group()
    missingImage.printings[1] = {
      ...missingImage.printings[1]!,
      imageUrl: undefined,
    }
    renderDetail({
      path: '/cards/TEST-001?printing=20',
      loadPrintings: async () =>
        printingsData({ cards: { 'TEST-001': missingImage } }),
    })

    await screen.findByRole('button', {
      name: 'テストホロメン パラレル P 版 20',
    })
    expect(screen.getAllByText('画像なし')).toHaveLength(2)
    expect(
      screen.queryByRole('img', { name: 'テストホロメンのカード画像' }),
    ).not.toBeInTheDocument()
  })

  it('retries a printing-only load error without hiding logical content', async () => {
    const loadPrintings = vi
      .fn<() => Promise<CardPrintingsDataFile>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(printingsData())
    renderDetail({ loadPrintings })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '版情報を読み込めませんでした。',
    )
    expect(screen.getByText('変わらない能力本文')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '版情報を再試行' }))
    expect(await screen.findByText('通常絵師')).toBeVisible()
    expect(loadPrintings).toHaveBeenCalledTimes(2)
  })

  it('isolates compatibility failures and falls back to logical visual links', async () => {
    renderDetail({
      loadPrintings: async () =>
        printingsData({ cardsDataVersion: `sha256:${'f'.repeat(64)}` }),
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'カード情報と版情報の互換性を確認できませんでした。',
    )
    expect(
      screen.getByRole('heading', { name: 'テストホロメン' }),
    ).toBeVisible()
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://example.com/default.png',
    )
    expect(
      screen.getByRole('link', { name: '公式カードページ' }),
    ).toHaveAttribute('href', 'https://example.com/logical')
  })

  it('surfaces a missing printing group without hiding logical detail', async () => {
    renderDetail({ loadPrintings: async () => printingsData({ cards: {} }) })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'このカードの版情報が見つかりませんでした。',
    )
    expect(screen.getByText('変わらないアーツ本文')).toBeVisible()
    expect(
      screen.getByRole('link', { name: '公式カードページ' }),
    ).toHaveAttribute('href', 'https://example.com/logical')
  })

  it('omits optional rarity and illustrator without inventing placeholders', async () => {
    const optional = group()
    optional.printings = [
      {
        officialId: '10',
        officialUrl: 'https://example.com/printing/10',
        isParallel: false,
        products: [],
      },
    ]
    renderDetail({
      loadPrintings: async () =>
        printingsData({ cards: { 'TEST-001': optional } }),
    })

    await screen.findByRole('heading', { name: '版情報' })
    expect(screen.queryByText('レアリティ')).not.toBeInTheDocument()
    expect(screen.queryByText('イラストレーター')).not.toBeInTheDocument()
    expect(screen.queryByText('不明')).not.toBeInTheDocument()
    expect(screen.queryByText('初出商品')).not.toBeInTheDocument()
    expect(screen.queryByText('発売日')).not.toBeInTheDocument()
  })
})
