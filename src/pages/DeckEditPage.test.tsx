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
  useNavigate,
  useParams,
} from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  Card,
  CardPrintingsDataFile,
  CardsDataFile,
} from '../domain/cards/types'
import { SELECTED_DECK_STORAGE_KEY } from '../domain/decks/selectedDeckPreference'
import type { Deck } from '../domain/decks/types'
import { AuthProvider } from '../auth/AuthProvider'
import type { AuthSource } from '../auth/authSource'
import type { DeckShareSource } from '../share/deckShareSource'

/** A resolved session, so the editor sees an authenticated visitor. */
function signedInAuthSource(): AuthSource {
  return {
    getSessionUser: async () => ({ id: 'user-a' }),
    subscribe: () => () => undefined,
    signInWithGoogle: async () => ({ ok: true }),
    sendMagicLink: async () => ({ ok: true }),
    signOut: async () => ({ ok: true }),
  }
}
import { decodeDeckSharePayload } from '../domain/share/deckShareCodec'
import type { DeckRepository } from '../repositories/deckRepository'
import type { DeckVersionRepository } from '../repositories/deckVersionRepository'
import { DeckEditPage } from './DeckEditPage'

function deck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: 'deck-1',
    name: 'テストデッキ',
    entries: [],
    createdAt: '2026-09-08T00:00:00.000Z',
    updatedAt: '2026-09-08T00:00:00.000Z',
    ...overrides,
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
    imageUrl: `https://example.com/${cardNumber}.png`,
    cardType: 'holomem',
    bloomLevel: 'debut',
    colors: ['red'],
    isBuzz: false,
    tags: [],
    isLimited: false,
    abilities: [],
    arts: [],
    batonPass: [],
    effectTags: [],
    criticalColors: [],
    rarities: [],
    products: [],
    illustrators: [],
    qas: [],
    searchText: `${name.toLowerCase()} ${cardNumber.toLowerCase()}`,
    ...overrides,
  }
}

const cards = [
  card('CARD-001', '赤いカード', {
    effectTags: ['draw'],
    releaseDate: '2025-01-01',
  }),
  card('CARD-002', '青いカード', {
    colors: ['blue'],
    bloomLevel: 'first',
    criticalColors: ['blue'],
    effectTags: ['deck_search'],
    releaseDate: '2026-01-01',
  }),
  card('CARD-003', '緑のカード', {
    colors: ['green'],
    bloomLevel: 'second',
    isBuzz: true,
  }),
  card('CARD-004', '赤青カード', {
    colors: ['red', 'blue'],
    bloomLevel: 'first',
    criticalColors: ['red', 'blue'],
    effectTags: ['draw', 'deck_search'],
  }),
  card('OSHI-001', '推しカード', { cardType: 'oshi' }),
  card('MAIN-UNLIMITED', '無制限カード', { deckLimit: null }),
  card('MAIN-SIX', '6枚カード', { deckLimit: 6 }),
  card('CHEER-001', '白エール', { cardType: 'cheer' }),
  card('hBP01-030', 'IRyS'),
]

function cardsData(source = cards): CardsDataFile {
  return {
    format: 'holocard-cards',
    formatVersion: 1,
    dataVersion: `sha256:${'0'.repeat(64)}`,
    generatedAt: '2026-09-08T00:00:00.000Z',
    cards: source,
  }
}

function printingsData(
  source = cards,
  groups: CardPrintingsDataFile['cards'] = {},
): CardPrintingsDataFile {
  return {
    format: 'hlsieve-card-printings',
    formatVersion: 1,
    cardsDataVersion: cardsData(source).dataVersion,
    dataVersion: `sha256:${'1'.repeat(64)}`,
    cards: Object.fromEntries(
      source.map((value, index) => [
        value.cardNumber,
        groups[value.cardNumber] ?? {
          defaultPrintingOfficialId: String(index + 1),
          printings: [
            {
              officialId: String(index + 1),
              officialUrl: `https://example.com/printings/${index + 1}`,
              isParallel: false,
              imageUrl: value.imageUrl,
              products: ['PRカード'],
            },
          ],
        },
      ]),
    ),
  }
}

function repository(overrides: Partial<DeckRepository> = {}): DeckRepository {
  return {
    listDecks: vi.fn(async () => []),
    getDeck: vi.fn(async () => deck()),
    saveDeck: vi.fn(async () => undefined),
    deleteDeck: vi.fn(async () => undefined),
    ...overrides,
  }
}

function renderPage({
  deckRepository = repository(),
  loadCards = vi.fn(async () => cardsData()),
  loadPrintings = vi.fn(async () => printingsData()),
  path = '/decks/deck-1',
  // Null by default, which is a build with no Supabase: the long share URL is
  // then the whole feature, exactly as it was before short links existed.
  shareSource = null,
  // Signed out by default, which is what every existing test assumes.
  authSource = null,
  deckVersions,
}: {
  deckRepository?: DeckRepository
  loadCards?: () => Promise<CardsDataFile>
  loadPrintings?: () => Promise<CardPrintingsDataFile>
  path?: string
  shareSource?: DeckShareSource | null
  authSource?: AuthSource | null
  deckVersions?: DeckVersionRepository
} = {}) {
  render(
    <AuthProvider authSource={authSource}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/decks/:deckId"
            element={
              <DeckEditPage
                repository={deckRepository}
                deckVersions={deckVersions}
                loadCards={loadCards}
                loadPrintings={loadPrintings}
                shareSource={shareSource}
              />
            }
          />
          <Route path="/decks" element={<p>Deck list destination</p>} />
          <Route
            path="/cards/:cardNumber"
            element={<CardDetailDestination />}
          />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
  return { deckRepository, loadCards, loadPrintings, shareSource }
}

function CardDetailDestination() {
  const { cardNumber } = useParams<'cardNumber'>()
  const navigate = useNavigate()
  return (
    <>
      <p>Card detail destination: {cardNumber}</p>
      <button type="button" onClick={() => navigate(-1)}>
        Browser Back
      </button>
    </>
  )
}

const originalClipboard = navigator.clipboard

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: originalClipboard,
  })
  localStorage.clear()
})

describe('DeckEditPage loading', () => {
  it('makes the loaded Deck the shared selected Deck preference', async () => {
    localStorage.setItem(SELECTED_DECK_STORAGE_KEY, 'another-deck')
    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'テストデッキ' }),
    ).toBeVisible()
    expect(localStorage.getItem(SELECTED_DECK_STORAGE_KEY)).toBe('deck-1')
  })

  it('shows a deck loading state', () => {
    renderPage({
      deckRepository: repository({
        getDeck: () => new Promise(() => undefined),
      }),
    })
    expect(screen.getByText('デッキを読み込んでいます…')).toBeVisible()
  })

  it('shows an unknown deck with a list link', async () => {
    renderPage({
      deckRepository: repository({ getDeck: async () => undefined }),
    })
    expect(
      await screen.findByRole('heading', { name: 'デッキが見つかりません' }),
    ).toBeVisible()
    expect(
      screen.getAllByRole('link', { name: '保存デッキへ戻る' })[0],
    ).toHaveAttribute('href', '/decks')
  })

  it('shows repository errors and retries', async () => {
    const getDeck = vi
      .fn<(id: string) => Promise<Deck | undefined>>()
      .mockRejectedValueOnce(new Error('blocked'))
      .mockResolvedValueOnce(deck())
    renderPage({ deckRepository: repository({ getDeck }) })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'デッキを読み込めませんでした。',
    )
    fireEvent.click(screen.getByRole('button', { name: '再試行' }))
    expect(
      await screen.findByRole('heading', { name: 'テストデッキ' }),
    ).toBeVisible()
    expect(getDeck).toHaveBeenCalledTimes(2)
  })
})

describe('DeckEditPage editor operations', () => {
  it('does not retain the old Deck-linked probability calculator', async () => {
    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'テストデッキ' }),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: '確率計算' }),
    ).not.toBeInTheDocument()
  })

  it('shows card data loading without blocking the editor', async () => {
    renderPage({ loadCards: () => new Promise(() => undefined) })

    expect(
      await screen.findByRole('heading', { name: 'テストデッキ' }),
    ).toBeVisible()
    expect(screen.getByText('カードデータを読み込んでいます…')).toBeVisible()
  })

  it('loads entries, displays total, and warns without deleting unknown cards', async () => {
    renderPage({
      deckRepository: repository({
        getDeck: async () =>
          deck({
            entries: [
              { cardNumber: 'CARD-001', quantity: 2 },
              { cardNumber: 'UNKNOWN-001', quantity: 1 },
            ],
          }),
      }),
    })

    const currentCards = await screen.findByRole('region', {
      name: '現在のカード',
    })
    expect(
      within(currentCards).queryByText('赤いカード'),
    ).not.toBeInTheDocument()
    expect(
      await within(currentCards).findByRole('button', {
        name: '赤いカードを1枚追加',
      }),
    ).toBeVisible()
    expect(
      within(currentCards).getByRole('button', {
        name: 'UNKNOWN-001を1枚追加',
      }),
    ).toBeVisible()
    expect(
      within(currentCards).queryByRole('link', {
        name: /UNKNOWN-001.*カード詳細/,
      }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('カード情報なし')).toBeVisible()
    expect(screen.getByText('合計 3枚')).toBeVisible()
  })

  it('renames with trim, rejects whitespace, and autosaves', async () => {
    const saveDeck = vi.fn<(value: Deck) => Promise<void>>(
      async () => undefined,
    )
    renderPage({ deckRepository: repository({ saveDeck }) })
    const input = await screen.findByLabelText('デッキ名')
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveAttribute('inputmode', 'text')

    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: '名前を保存' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'デッキ名を入力してください。',
    )
    expect(saveDeck).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '  新しい名前  ' } })
    fireEvent.click(screen.getByRole('button', { name: '名前を保存' }))
    await waitFor(() => expect(saveDeck).toHaveBeenCalledTimes(1))
    expect(saveDeck.mock.calls[0]?.[0].name).toBe('新しい名前')
    expect(screen.getByRole('heading', { name: '新しい名前' })).toBeVisible()
    expect(document.title).toBe('新しい名前 | HLSieve DB')
    expect(await screen.findByText('保存しました')).toBeVisible()
  })

  it('shows incomplete counts and actionable issues', async () => {
    renderPage()

    expect(await screen.findByText('作成中')).toBeVisible()
    expect(screen.getByText('0 / 1')).toBeVisible()
    expect(screen.getByText('0 / 50')).toBeVisible()
    expect(screen.getByText('0 / 20')).toBeVisible()
    expect(screen.getByText('0 / 71')).toBeVisible()
    expect(
      screen.getByText('メインデッキをあと50枚追加してください'),
    ).toBeVisible()
    expect(
      screen.getByText('2026年6月19日施行の制限ルールを反映'),
    ).toBeVisible()
  })

  it('shows a legal deck and groups entries by derived zone', async () => {
    renderPage({
      deckRepository: repository({
        getDeck: async () =>
          deck({
            entries: [
              { cardNumber: 'OSHI-001', quantity: 1 },
              { cardNumber: 'MAIN-UNLIMITED', quantity: 50 },
              { cardNumber: 'CHEER-001', quantity: 20 },
            ],
          }),
      }),
    })

    expect(await screen.findByText('使用可能')).toBeVisible()
    expect(screen.getByText('1 / 1')).toBeVisible()
    expect(screen.getByText('50 / 50')).toBeVisible()
    expect(screen.getByText('20 / 20')).toBeVisible()
    expect(screen.getByText('71 / 71')).toBeVisible()
    expect(screen.getByRole('heading', { name: /推しホロメン/ })).toBeVisible()
    expect(
      screen.getByRole('heading', { name: /^メインデッキ50枚$/ }),
    ).toBeVisible()
    expect(screen.getByRole('heading', { name: /エールデッキ/ })).toBeVisible()
    const currentCards = screen.getByRole('region', { name: '現在のカード' })
    const oshiEntry = within(currentCards).getByText('推しカード').closest('li')
    expect(oshiEntry).toHaveClass('deck-entry')
    expect(oshiEntry).not.toHaveClass('deck-entry--compact')
    expect(within(oshiEntry!).getByText('OSHI-001')).toBeVisible()
    expect(
      within(oshiEntry!).getByRole('button', {
        name: '推しカードをデッキから削除',
      }),
    ).toBeVisible()
  })

  it('renders non-Oshi entries as three-column image and quantity tiles', async () => {
    renderPage({
      deckRepository: repository({
        getDeck: async () =>
          deck({
            entries: [
              { cardNumber: 'CARD-001', quantity: 2 },
              { cardNumber: 'CARD-002', quantity: 10 },
              { cardNumber: 'CHEER-001', quantity: 1 },
            ],
          }),
      }),
    })

    const currentCards = await screen.findByRole('region', {
      name: '現在のカード',
    })
    await within(currentCards).findByRole('button', {
      name: '赤いカードを1枚追加',
    })
    expect(
      within(currentCards).queryByText('赤いカード'),
    ).not.toBeInTheDocument()
    expect(within(currentCards).queryByText('CARD-001')).not.toBeInTheDocument()

    const mainList = within(currentCards)
      .getByRole('heading', { name: /^メインデッキ12枚$/ })
      .closest('section')!
      .querySelector('ul')!
    expect(mainList).toHaveClass('deck-entry-list--compact')
    expect(mainList.children).toHaveLength(2)

    const firstTile = mainList.children[0] as HTMLElement
    expect(firstTile).toHaveClass('deck-entry--compact')
    expect(firstTile.children[0]).toHaveClass('deck-card-image-link')
    expect(firstTile.children[0]?.children[0]).toHaveClass('deck-card-image')
    expect(firstTile.children[1]).toHaveClass('deck-quantity-control')
    const controls = firstTile.children[1] as HTMLElement
    expect(controls.children).toHaveLength(3)
    expect(controls.children[0]).toHaveTextContent('−')
    expect(controls.children[1]).toHaveTextContent('2')
    expect(controls.children[1]).toHaveAttribute('aria-label', '現在 2枚')
    expect(controls.children[2]).toHaveTextContent('＋')

    const cheerList = screen
      .getByRole('heading', { name: /エールデッキ/ })
      .closest('section')!
      .querySelector('ul')!
    expect(cheerList).toHaveClass('deck-entry-list--compact')
    expect(cheerList.children[0]?.children[0]).toHaveClass(
      'deck-card-image-link',
    )
    expect(cheerList.children[0]?.children[0]?.children[0]).toHaveClass(
      'deck-card-image',
    )
  })

  it('renders Deck entries in canonical category and card-number order without changing stored order', async () => {
    const sourceEntries = [
      { cardNumber: 'CARD-003', quantity: 3 },
      { cardNumber: 'CARD-004', quantity: 4 },
      { cardNumber: 'CARD-002', quantity: 2 },
    ]
    const getDeck = vi.fn(async () => deck({ entries: sourceEntries }))
    renderPage({ deckRepository: repository({ getDeck }) })

    const currentCards = await screen.findByRole('region', {
      name: '現在のカード',
    })
    await within(currentCards).findByRole('link', {
      name: '青いカードのカード詳細を開く',
    })
    const mainList = within(currentCards)
      .getByRole('heading', { name: /^メインデッキ9枚$/ })
      .closest('section')!
      .querySelector('ul')!
    const detailLinks = within(mainList).getAllByRole('link')

    expect(detailLinks.map((link) => link.getAttribute('aria-label'))).toEqual([
      '青いカードのカード詳細を開く',
      '赤青カードのカード詳細を開く',
      '緑のカードのカード詳細を開く',
    ])
    expect((await getDeck()).entries).toEqual(sourceEntries)
  })

  it('links Oshi, Main, and Cheer images to logical Card Detail routes and supports keyboard-style activation and Back navigation', async () => {
    renderPage({
      deckRepository: repository({
        getDeck: async () =>
          deck({
            entries: [
              { cardNumber: 'OSHI-001', quantity: 1 },
              { cardNumber: 'CARD-001', quantity: 2 },
              { cardNumber: 'CHEER-001', quantity: 20 },
            ],
          }),
      }),
    })

    const currentCards = await screen.findByRole('region', {
      name: '現在のカード',
    })
    const oshiLink = await within(currentCards).findByRole('link', {
      name: '推しカードのカード詳細を開く',
    })
    const mainLink = within(currentCards).getByRole('link', {
      name: '赤いカードのカード詳細を開く',
    })
    const cheerLink = within(currentCards).getByRole('link', {
      name: '白エールのカード詳細を開く',
    })

    expect(oshiLink).toHaveAttribute('href', '/cards/OSHI-001')
    expect(mainLink).toHaveAttribute('href', '/cards/CARD-001')
    expect(cheerLink).toHaveAttribute('href', '/cards/CHEER-001')
    expect(mainLink.getAttribute('href')).not.toContain('?printing=')
    expect(mainLink.tagName).toBe('A')
    mainLink.focus()
    expect(mainLink).toHaveFocus()

    fireEvent.click(mainLink, { detail: 0 })
    expect(screen.getByText('Card detail destination: CARD-001')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Browser Back' }))
    expect(
      await screen.findByRole('region', { name: '現在のカード' }),
    ).toBeVisible()
  })

  it('keeps quantity controls outside image links and does not navigate when they change quantity', async () => {
    const saveDeck = vi.fn(async () => undefined)
    renderPage({
      deckRepository: repository({
        getDeck: async () =>
          deck({ entries: [{ cardNumber: 'CARD-001', quantity: 2 }] }),
        saveDeck,
      }),
    })
    const currentCards = await screen.findByRole('region', {
      name: '現在のカード',
    })
    const link = await within(currentCards).findByRole('link', {
      name: '赤いカードのカード詳細を開く',
    })
    expect(
      within(link).queryByRole('button', { name: /赤いカードを1枚/ }),
    ).not.toBeInTheDocument()

    fireEvent.click(
      within(currentCards).getByRole('button', {
        name: '赤いカードを1枚減らす',
      }),
    )
    expect(screen.getByRole('region', { name: '現在のカード' })).toBeVisible()
    fireEvent.click(
      within(currentCards).getByRole('button', {
        name: '赤いカードを1枚追加',
      }),
    )
    expect(screen.getByRole('region', { name: '現在のカード' })).toBeVisible()
    await waitFor(() => expect(saveDeck).toHaveBeenCalledTimes(2))
  })

  it('links add-card result images and names to logical Card Detail while quantity controls remain independent', async () => {
    const saveDeck = vi.fn(async () => undefined)
    renderPage({ deckRepository: repository({ saveDeck }) })
    const picker = await screen.findByRole('region', { name: 'カードを追加' })
    const resultLink = await within(picker).findByRole('link', {
      name: '赤いカードのカード詳細を開く',
    })
    const result = resultLink.closest('li')!

    expect(resultLink).toHaveAttribute('href', '/cards/CARD-001')
    expect(resultLink.getAttribute('href')).not.toContain('printing')
    expect(within(resultLink).getByRole('presentation')).toBeVisible()
    expect(
      within(resultLink).getByRole('heading', { name: '赤いカード' }),
    ).toBeVisible()
    expect(
      within(resultLink).queryByRole('button', { name: /赤いカードを1枚/ }),
    ).not.toBeInTheDocument()

    fireEvent.click(
      within(result).getByRole('button', { name: '赤いカードを1枚追加' }),
    )
    expect(within(result).getByLabelText('現在 1枚')).toBeVisible()
    expect(screen.getByRole('region', { name: 'カードを追加' })).toBeVisible()
    await waitFor(() => expect(saveDeck).toHaveBeenCalledTimes(1))

    fireEvent.click(
      within(result).getByRole('button', { name: '赤いカードを1枚減らす' }),
    )
    expect(within(result).getByLabelText('現在 0枚')).toBeVisible()
    expect(screen.getByRole('region', { name: 'カードを追加' })).toBeVisible()
    await waitFor(() => expect(saveDeck).toHaveBeenCalledTimes(2))

    fireEvent.click(resultLink)
    expect(screen.getByText('Card detail destination: CARD-001')).toBeVisible()
  })

  it('uses the original non-parallel artwork only in Deck picker thumbnails', async () => {
    const reprinted = card('REPRINT-001', '再録カード', {
      imageUrl: 'https://img.example/representative.png',
    })
    const data = cardsData([reprinted])
    const printingData = printingsData([reprinted], {
      'REPRINT-001': {
        defaultPrintingOfficialId: '200',
        printings: [
          {
            officialId: '200',
            officialUrl: 'https://example.com/printings/200',
            isParallel: false,
            imageUrl: 'https://img.example/reprint.png',
            products: ['ブースターパック「エンチャントレガリア」'],
          },
          {
            officialId: '100',
            officialUrl: 'https://example.com/printings/100',
            isParallel: false,
            imageUrl: 'https://img.example/original.png',
            products: ['ブースターパック「ブルーミングレディアンス」'],
          },
        ],
      },
    })
    printingData.cardsDataVersion = data.dataVersion
    renderPage({
      loadCards: async () => data,
      loadPrintings: async () => printingData,
    })

    const picker = await screen.findByRole('region', { name: 'カードを追加' })
    await within(picker).findByText('再録カード')
    expect(picker.querySelector('img')).toHaveAttribute(
      'src',
      'https://img.example/original.png',
    )
  })

  it('falls back to the logical representative image when printing data fails', async () => {
    const fallbackCard = card('FALLBACK-001', 'フォールバックカード', {
      imageUrl: 'https://img.example/fallback.png',
    })
    renderPage({
      loadCards: async () => cardsData([fallbackCard]),
      loadPrintings: async () => {
        throw new Error('printing unavailable')
      },
    })

    const picker = await screen.findByRole('region', { name: 'カードを追加' })
    await within(picker).findByText('フォールバックカード')
    expect(picker.querySelector('img')).toHaveAttribute(
      'src',
      'https://img.example/fallback.png',
    )
  })

  it('shows copy-limit, restricted-card, and deckLimit issues', async () => {
    renderPage({
      deckRepository: repository({
        getDeck: async () =>
          deck({
            entries: [
              { cardNumber: 'OSHI-001', quantity: 1 },
              { cardNumber: 'CARD-001', quantity: 5 },
              { cardNumber: 'MAIN-SIX', quantity: 7 },
              { cardNumber: 'hBP01-030', quantity: 2 },
              { cardNumber: 'MAIN-UNLIMITED', quantity: 36 },
              { cardNumber: 'CHEER-001', quantity: 20 },
            ],
          }),
      }),
    })

    expect(await screen.findByText('ルール違反あり')).toBeVisible()
    expect(screen.getByText(/CARD-001 赤いカードは4枚まで/)).toBeVisible()
    expect(screen.getByText(/MAIN-SIX 6枚カードは6枚まで/)).toBeVisible()
    expect(
      screen.getByText(/hBP01-030 IRySは制限カードのため1枚まで/),
    ).toBeVisible()
  })

  it('reuses searchCards and adds duplicate logical cards by quantity', async () => {
    const saveDeck = vi.fn<(value: Deck) => Promise<void>>(
      async () => undefined,
    )
    renderPage({ deckRepository: repository({ saveDeck }) })
    const search = await screen.findByLabelText('カード検索')
    expect(search).toHaveAttribute('type', 'text')
    expect(search).toHaveAttribute('inputmode', 'text')

    fireEvent.change(search, { target: { value: '赤い' } })
    const picker = screen.getByRole('region', { name: 'カードを追加' })
    expect(await within(picker).findByText('赤いカード')).toBeVisible()
    expect(within(picker).queryByText('青いカード')).not.toBeInTheDocument()
    const add = within(picker).getByRole('button', {
      name: '赤いカードを1枚追加',
    })
    fireEvent.click(add)
    fireEvent.click(add)

    expect(within(picker).getByLabelText('現在 2枚')).toHaveTextContent('2')
    expect(screen.getByText('合計 2枚')).toBeVisible()
    await waitFor(() => expect(saveDeck).toHaveBeenCalledTimes(2))
    expect(saveDeck.mock.calls[1]?.[0].entries).toEqual([
      { cardNumber: 'CARD-001', quantity: 2 },
    ])
    expect(saveDeck.mock.calls[1]?.[0]).not.toHaveProperty('legality')
    expect(saveDeck.mock.calls[1]?.[0]).not.toHaveProperty('rulesVersion')
  })

  it('keeps Q&A search off by default and toggles shared question, answer, and cross-source AND matching', async () => {
    const qaOnlyCard = card('QA-ONLY', '本文にないカード', {
      qas: [
        {
          id: 'Q-DECK',
          question: '白上フブキがいる場合、この能力は使えますか？',
          answer: 'はい、ターンプレイヤーが処理します。',
          officialUrl: 'https://example.com/qa/Q-DECK',
          relatedCardNumbers: ['QA-ONLY'],
        },
      ],
      searchText:
        'qa-only 本文にないかーど 白上ふぶきがいる場合、この能力は使えますか? はい、たーんぷれいやーが処理します。',
    })
    renderPage({
      loadCards: vi.fn(async () => cardsData([...cards, qaOnlyCard])),
      loadPrintings: vi.fn(async () => printingsData([...cards, qaOnlyCard])),
    })
    // Gated on the loaded data, or the absence asserted below would also hold
    // for a picker that has not received any cards yet.
    await screen.findByText('10件')
    const search = screen.getByLabelText('カード検索')
    const includeQa = screen.getByLabelText('Q&Aを含める')
    const picker = screen.getByRole('region', { name: 'カードを追加' })

    expect(includeQa).not.toBeChecked()

    fireEvent.change(search, { target: { value: 'フブキ' } })
    expect(
      within(picker).queryByText('本文にないカード'),
    ).not.toBeInTheDocument()

    fireEvent.click(includeQa)
    expect(await within(picker).findByText('本文にないカード')).toBeVisible()

    fireEvent.change(search, { target: { value: 'ターンプレイヤー' } })
    expect(await within(picker).findByText('本文にないカード')).toBeVisible()

    fireEvent.change(search, {
      target: { value: 'フブキ ターンプレイヤー' },
    })
    expect(await within(picker).findByText('本文にないカード')).toBeVisible()

    fireEvent.change(search, { target: { value: '本文にないカード フブキ' } })
    expect(await within(picker).findByText('本文にないカード')).toBeVisible()

    fireEvent.click(includeQa)
    expect(
      within(picker).queryByText('本文にないカード'),
    ).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: '本文にないカード' } })
    expect(await within(picker).findByText('本文にないカード')).toBeVisible()
    fireEvent.click(includeQa)
    expect(await within(picker).findByText('本文にないカード')).toBeVisible()
  })

  it('shows an empty search result without inventing search semantics', async () => {
    renderPage()
    // The count appears with the loaded card data, and so does the line below.
    // The search input renders before either, so waiting for it would leave
    // the assertion racing the load.
    await screen.findByText('9件')
    const search = screen.getByLabelText('カード検索')
    fireEvent.change(search, { target: { value: '存在しない語' } })
    expect(screen.getByText('条件に一致するカードがありません。')).toBeVisible()
  })

  it('keeps shared structured filters collapsed by default and retains active values', async () => {
    renderPage()
    await screen.findByText('9件')
    const includeQa = screen.getByLabelText('Q&Aを含める')
    fireEvent.click(includeQa)
    expect(includeQa).toBeChecked()
    const summary = screen.getByText('詳細条件')
    const details = summary.closest('details')!
    expect(details).not.toHaveAttribute('open')

    fireEvent.click(summary)
    expect(details).toHaveAttribute('open')
    fireEvent.click(
      within(details)
        .getByRole('group', { name: '色' })
        .querySelector('input[value="blue"]')!,
    )
    expect(screen.getByText('詳細条件（1件）')).toBeVisible()
    expect(screen.getByText('青いカード')).toBeVisible()
    fireEvent.click(screen.getByText('詳細条件（1件）'))
    expect(details).not.toHaveAttribute('open')
    expect(
      details.querySelector<HTMLInputElement>('input[value="blue"]'),
    ).toBeChecked()

    fireEvent.click(screen.getByText('詳細条件（1件）'))
    fireEvent.click(
      within(details).getByRole('button', { name: '条件をクリア' }),
    )
    expect(includeQa).not.toBeChecked()
    expect(screen.getByText('詳細条件')).toBeVisible()
    expect(screen.getByText('9件')).toBeVisible()
  })

  it('matches the Cards search contract for modes, types, Bloom, Critical, tags, sort, and combined conditions', async () => {
    renderPage()
    await screen.findByText('9件')
    fireEvent.click(screen.getByText('詳細条件'))
    const details = screen.getByText('詳細条件').closest('details')!
    const clear = () =>
      fireEvent.click(
        within(details).getByRole('button', { name: '条件をクリア' }),
      )
    const checkbox = (groupName: string, value: string) =>
      within(details)
        .getByRole('group', { name: groupName })
        .querySelector<HTMLInputElement>(`input[value="${value}"]`)!

    fireEvent.click(checkbox('色', 'blue'))
    fireEvent.click(checkbox('色', 'red'))
    fireEvent.change(within(details).getByLabelText('色の一致条件'), {
      target: { value: 'and' },
    })
    expect(screen.getByText('赤青カード')).toBeVisible()
    expect(screen.getByText('1件')).toBeVisible()
    clear()

    fireEvent.click(checkbox('カードタイプ', 'oshi'))
    expect(screen.getByText('推しカード')).toBeVisible()
    clear()

    fireEvent.click(checkbox('Bloom / Buzz', 'buzz'))
    expect(screen.getByText('緑のカード')).toBeVisible()
    clear()

    fireEvent.click(checkbox('Critical', 'blue'))
    fireEvent.click(checkbox('Critical', 'red'))
    fireEvent.change(within(details).getByLabelText('Criticalの一致条件'), {
      target: { value: 'and' },
    })
    expect(screen.getByText('赤青カード')).toBeVisible()
    clear()

    fireEvent.click(checkbox('効果タグ', 'draw'))
    fireEvent.click(checkbox('効果タグ', 'deck_search'))
    expect(screen.getByText('赤青カード')).toBeVisible()
    fireEvent.change(within(details).getByLabelText('効果タグの一致条件'), {
      target: { value: 'or' },
    })
    expect(screen.getByText('赤いカード')).toBeVisible()
    expect(screen.getByText('青いカード')).toBeVisible()
    clear()

    fireEvent.change(within(details).getByLabelText('並び順'), {
      target: { value: 'release_date_desc' },
    })
    const picker = screen.getByRole('region', { name: 'カードを追加' })
    expect(
      within(picker).getAllByRole('heading', { level: 3 })[0],
    ).toHaveTextContent('青いカード')

    fireEvent.change(screen.getByLabelText('カード検索'), {
      target: { value: '赤青' },
    })
    fireEvent.click(checkbox('色', 'blue'))
    fireEvent.click(checkbox('カードタイプ', 'holomem'))
    fireEvent.click(checkbox('Bloom / Buzz', 'first'))
    fireEvent.click(checkbox('Critical', 'red'))
    fireEvent.click(checkbox('効果タグ', 'deck_search'))
    expect(screen.getByText('赤青カード')).toBeVisible()
    expect(screen.getByText('1件')).toBeVisible()
  })

  it('uses the shared eight-value Card Type filter in the deck editor', async () => {
    renderPage()
    await screen.findByText('9件')
    fireEvent.click(screen.getByText('詳細条件'))
    const details = screen.getByText('詳細条件').closest('details')!
    const group = within(details).getByRole('group', { name: 'カードタイプ' })

    expect(
      within(group)
        .getAllByRole('checkbox')
        .map((input) => input.getAttribute('value')),
    ).toEqual([
      'oshi',
      'holomem',
      'support_limited',
      'support_general',
      'support_tool',
      'support_fan',
      'support_mascot',
      'cheer',
    ])
    expect(group).toHaveTextContent('サポート（リミテッド）')
    expect(group).toHaveTextContent('サポート（非リミテッド）')
    expect(group).toHaveTextContent('ツール')
    expect(group).toHaveTextContent('ファン')
    expect(group).toHaveTextContent('マスコット')
  })

  it('separates Mascot from general support through the shared search core', async () => {
    const supportCards = [
      card('GENERAL-001', '通常サポート', {
        cardType: 'support',
        supportSearchCategory: 'general',
      }),
      card('MASCOT-001', 'マスコットサポート', {
        cardType: 'support',
        supportType: 'mascot',
        supportSearchCategory: 'general',
      }),
    ]
    renderPage({
      loadCards: async () => cardsData(supportCards),
      loadPrintings: async () => printingsData(supportCards),
    })
    await screen.findByText('2件')
    fireEvent.click(screen.getByText('詳細条件'))
    const details = screen.getByText('詳細条件').closest('details')!
    const typeGroup = within(details).getByRole('group', {
      name: 'カードタイプ',
    })

    fireEvent.click(
      within(typeGroup).getByRole('checkbox', { name: 'マスコット' }),
    )
    expect(screen.getByText('マスコットサポート')).toBeVisible()
    expect(screen.queryByText('通常サポート')).not.toBeInTheDocument()
  })

  it('reuses 24-card pagination and keeps the current page while quantities change', async () => {
    const manyCards = Array.from({ length: 30 }, (_, index) =>
      card(
        `PAGE-${String(index + 1).padStart(3, '0')}`,
        `ページカード${index + 1}`,
      ),
    )
    renderPage({ loadCards: async () => cardsData(manyCards) })
    await screen.findByText('1 / 2')
    const pagination = screen.getByRole('navigation', {
      name: 'カード追加結果のページ',
    })
    fireEvent.click(within(pagination).getByRole('button', { name: '次へ' }))
    expect(screen.getByText('2 / 2')).toBeVisible()
    fireEvent.click(screen.getByLabelText('Q&Aを含める'))
    expect(screen.getByText('1 / 2')).toBeVisible()
    fireEvent.click(within(pagination).getByRole('button', { name: '次へ' }))
    expect(screen.getByText('2 / 2')).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: 'ページカード25を1枚追加' }),
    )
    expect(screen.getByText('2 / 2')).toBeVisible()
    const picker = screen.getByRole('region', { name: 'カードを追加' })
    expect(within(picker).getByLabelText('現在 1枚')).toBeVisible()
  })

  it('increments, decrements to removal, and autosaves compact entries', async () => {
    const saveDeck = vi.fn<(value: Deck) => Promise<void>>(
      async () => undefined,
    )
    renderPage({
      deckRepository: repository({
        getDeck: async () =>
          deck({
            entries: [
              { cardNumber: 'CARD-001', quantity: 1 },
              { cardNumber: 'CARD-002', quantity: 1 },
            ],
          }),
        saveDeck,
      }),
    })
    const currentCards = await screen.findByRole('region', {
      name: '現在のカード',
    })

    fireEvent.click(
      await within(currentCards).findByRole('button', {
        name: '赤いカードを1枚追加',
      }),
    )
    expect(within(currentCards).getByLabelText('現在 2枚')).toHaveTextContent(
      '2',
    )
    fireEvent.click(
      within(currentCards).getByRole('button', {
        name: '青いカードを1枚減らす',
      }),
    )
    expect(
      within(currentCards).queryByRole('button', {
        name: '青いカードを1枚追加',
      }),
    ).not.toBeInTheDocument()
    fireEvent.click(
      within(currentCards).getByRole('button', {
        name: '赤いカードを1枚減らす',
      }),
    )
    fireEvent.click(
      within(currentCards).getByRole('button', {
        name: '赤いカードを1枚減らす',
      }),
    )
    expect(screen.getByText('カードが追加されていません。')).toBeVisible()
    expect(screen.getByText('合計 0枚')).toBeVisible()
    await waitFor(() => expect(saveDeck).toHaveBeenCalledTimes(4))
    expect(saveDeck.mock.calls[3]?.[0].entries).toEqual([])
  })

  it('serializes rapid saves so the latest state cannot be overwritten', async () => {
    let resolveFirst!: () => void
    const firstSave = new Promise<void>((resolve) => {
      resolveFirst = resolve
    })
    const saved: Deck[] = []
    const saveDeck = vi.fn(async (value: Deck) => {
      saved.push(value)
      if (saved.length === 1) await firstSave
    })
    renderPage({ deckRepository: repository({ saveDeck }) })
    const search = await screen.findByLabelText('カード検索')
    fireEvent.change(search, { target: { value: '赤い' } })
    const add = await within(
      screen.getByRole('region', { name: 'カードを追加' }),
    ).findByRole('button', {
      name: '赤いカードを1枚追加',
    })
    fireEvent.click(add)
    fireEvent.click(add)

    await waitFor(() => expect(saveDeck).toHaveBeenCalledTimes(1))
    expect(saved[0]?.entries[0]?.quantity).toBe(1)
    resolveFirst()
    await waitFor(() => expect(saveDeck).toHaveBeenCalledTimes(2))
    expect(saved[1]?.entries[0]?.quantity).toBe(2)
  })

  it('shows a save error and retries with the next edit', async () => {
    const saveDeck = vi
      .fn<(value: Deck) => Promise<void>>()
      .mockRejectedValueOnce(new Error('quota'))
      .mockResolvedValueOnce(undefined)
    renderPage({ deckRepository: repository({ saveDeck }) })
    const search = await screen.findByLabelText('カード検索')
    fireEvent.change(search, { target: { value: '赤い' } })
    fireEvent.click(
      await within(
        screen.getByRole('region', { name: 'カードを追加' }),
      ).findByRole('button', { name: '赤いカードを1枚追加' }),
    )
    expect(
      await screen.findByText(/デッキを保存できませんでした/),
    ).toBeVisible()

    fireEvent.click(
      within(screen.getByRole('region', { name: 'カードを追加' })).getByRole(
        'button',
        { name: '赤いカードを1枚追加' },
      ),
    )
    expect(await screen.findByText('保存しました')).toBeVisible()
    expect(saveDeck).toHaveBeenCalledTimes(2)
  })

  it('shows card loader errors and retries independently', async () => {
    const loadCards = vi
      .fn<() => Promise<CardsDataFile>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(cardsData())
    renderPage({ loadCards })

    const editor = await screen.findByRole('heading', { name: 'テストデッキ' })
    expect(editor).toBeVisible()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('カードデータを読み込めませんでした。')
    fireEvent.click(within(alert).getByRole('button', { name: '再試行' }))
    expect(await screen.findByLabelText('カード検索')).toBeVisible()
    expect(loadCards).toHaveBeenCalledTimes(2)
  })
})

describe('DeckEditPage short share link', () => {
  function source(overrides: Partial<DeckShareSource> = {}): DeckShareSource {
    return {
      createShare: vi.fn(async () => ({
        ok: true as const,
        shareId: 'Ab3xK9pQ',
      })),
      loadShare: vi.fn(async () => ({
        ok: false as const,
        reason: 'not-found' as const,
      })),
      ...overrides,
    }
  }

  async function openShare(
    shareSource: DeckShareSource | null,
    { signedIn = true }: { signedIn?: boolean } = {},
  ) {
    renderPage({
      shareSource,
      authSource: signedIn ? signedInAuthSource() : null,
    })
    fireEvent.click(
      await screen.findByRole('button', { name: '共有リンクを作成' }),
    )
    if (signedIn && shareSource) {
      // The session resolves asynchronously; wait for it before acting.
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: '短いリンクを作成' }),
        ).toBeEnabled(),
      )
    }
  }

  // Anonymous creation would let anyone fill the database with 12KB rows, and
  // the same database holds the cloud decks.
  describe('while signed out', () => {
    it('cannot create a short link, and says why', async () => {
      await openShare(source(), { signedIn: false })

      expect(
        screen.getByRole('button', { name: '短いリンクを作成' }),
      ).toBeDisabled()
      expect(
        screen.getByText(/短い共有リンクの作成にはログインが必要です/),
      ).toBeVisible()
    })

    it('can still create the long share URL, which needs no account', async () => {
      const shareSource = source()
      await openShare(shareSource, { signedIn: false })

      const value = (screen.getByLabelText('共有URL') as HTMLInputElement).value
      expect(new URL(value).pathname).toBe('/deck/share')
      expect(new URL(value).searchParams.get('d')).toBeTruthy()
      // Nothing was sent anywhere to produce it.
      expect(shareSource.createShare).not.toHaveBeenCalled()
    })
  })

  it('reports a sign-in rejection from the database distinctly', async () => {
    await openShare(
      source({
        createShare: vi.fn(async () => ({
          ok: false as const,
          reason: 'sign-in-required' as const,
        })),
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: '短いリンクを作成' }))

    expect(
      await screen.findByText(/短い共有リンクの作成にはログインが必要です/),
    ).toBeVisible()
  })

  // Without a server there is nothing to offer, and the long URL still works.
  it('offers no short link when Supabase is not configured', async () => {
    await openShare(null)

    expect(screen.getByLabelText('共有URL')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: '短いリンクを作成' }),
    ).not.toBeInTheDocument()
  })

  it('creates a short link from the same payload as the long URL', async () => {
    const shareSource = source()
    await openShare(shareSource)

    fireEvent.click(screen.getByRole('button', { name: '短いリンクを作成' }))

    const input = (await screen.findByLabelText(
      '短い共有URL',
    )) as HTMLInputElement
    const url = new URL(input.value)
    expect(url.origin).toBe(window.location.origin)
    expect(url.pathname).toBe('/s/Ab3xK9pQ')
    expect(url.search).toBe('')

    // The payload sent matches what the long URL carries, rather than a second
    // serialisation of the deck.
    const longUrl = new URL(
      (screen.getByLabelText('共有URL') as HTMLInputElement).value,
    )
    const decoded = decodeDeckSharePayload(longUrl.searchParams.get('d') ?? '')
    expect(shareSource.createShare).toHaveBeenCalledWith(
      decoded.ok ? decoded.value : undefined,
    )
  })

  it('says the snapshot is fixed at creation time', async () => {
    await openShare(source())
    fireEvent.click(screen.getByRole('button', { name: '短いリンクを作成' }))
    await screen.findByLabelText('短い共有URL')

    expect(
      screen.getByText(
        /あとでデッキを編集しても、このリンクの内容は変わりません/,
      ),
    ).toBeVisible()
    // No promise is made about how long it is kept.
    expect(document.body.textContent ?? '').not.toContain('永久')
  })

  it('reports a size rejection separately from a general failure', async () => {
    await openShare(
      source({
        createShare: vi.fn(async () => ({
          ok: false as const,
          reason: 'too-large' as const,
        })),
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: '短いリンクを作成' }))

    expect(
      await screen.findByText(/短いリンクのサイズ上限を超えています/),
    ).toBeVisible()
    // The long URL is still on screen as the way through.
    expect(screen.getByLabelText('共有URL')).toBeVisible()
  })

  it('reports a network failure without leaking database detail', async () => {
    await openShare(
      source({
        createShare: vi.fn(async () => ({
          ok: false as const,
          reason: 'failed' as const,
        })),
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: '短いリンクを作成' }))

    expect(
      await screen.findByText(/短いリンクを作成できませんでした/),
    ).toBeVisible()
    const text = document.body.textContent ?? ''
    ;['PGRST', 'SQLSTATE', '22023', 'supabase'].forEach((fragment) =>
      expect(text).not.toContain(fragment),
    )
  })
})

describe('DeckEditPage share link', () => {
  it('generates a current-origin UTF-8 share URL from the current logical deck', async () => {
    renderPage({
      deckRepository: repository({
        getDeck: async () =>
          deck({
            name: '日本語共有デッキ',
            entries: [
              { cardNumber: 'CARD-003', quantity: 1 },
              { cardNumber: 'CARD-002', quantity: 2 },
            ],
          }),
      }),
    })

    fireEvent.click(
      await screen.findByRole('button', { name: '共有リンクを作成' }),
    )
    const value = (screen.getByLabelText('共有URL') as HTMLInputElement).value
    const url = new URL(value)
    expect(url.origin).toBe(window.location.origin)
    expect(url.pathname).toBe('/deck/share')
    expect([...url.searchParams.keys()]).toEqual(['d'])
    expect(decodeDeckSharePayload(url.searchParams.get('d') ?? '')).toEqual({
      ok: true,
      value: {
        v: 1,
        name: '日本語共有デッキ',
        entries: [
          { cardNumber: 'CARD-003', quantity: 1 },
          { cardNumber: 'CARD-002', quantity: 2 },
        ],
      },
    })
    expect(
      screen.getByText('共有URLにはデッキ名とカード構成が含まれます。'),
    ).toBeVisible()
  })

  it('regenerates the visible link when the deck is edited', async () => {
    renderPage()
    fireEvent.click(
      await screen.findByRole('button', { name: '共有リンクを作成' }),
    )
    const input = screen.getByLabelText('共有URL') as HTMLInputElement
    const before = input.value

    const search = screen.getByLabelText('カード検索')
    fireEvent.change(search, { target: { value: '赤い' } })
    const addCardRegion = screen.getByRole('region', { name: 'カードを追加' })
    fireEvent.click(
      await within(addCardRegion).findByRole('button', {
        name: '赤いカードを1枚追加',
      }),
    )

    await waitFor(() => expect(input.value).not.toBe(before))
    const encoded = new URL(input.value).searchParams.get('d') ?? ''
    expect(decodeDeckSharePayload(encoded)).toEqual({
      ok: true,
      value: {
        v: 1,
        name: 'テストデッキ',
        entries: [{ cardNumber: 'CARD-001', quantity: 1 }],
      },
    })
  })

  it('announces clipboard success and keeps the URL after clipboard failure', async () => {
    const writeText = vi
      .fn<(value: string) => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('permission denied'))
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    renderPage()
    fireEvent.click(
      await screen.findByRole('button', { name: '共有リンクを作成' }),
    )
    const input = screen.getByLabelText('共有URL') as HTMLInputElement
    const link = input.value

    fireEvent.click(screen.getByRole('button', { name: 'コピー' }))
    expect(await screen.findByText('コピーしました')).toBeVisible()
    expect(writeText).toHaveBeenLastCalledWith(link)

    fireEvent.click(screen.getByRole('button', { name: 'コピー' }))
    expect(await screen.findByText(/コピーできませんでした/)).toBeVisible()
    expect(input.value).toBe(link)
  })
})

describe('DeckEditPage text export', () => {
  it('copies the exact formatted current Deck and announces success', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    renderPage({
      deckRepository: repository({
        getDeck: async () =>
          deck({
            name: '日本語🎴デッキ',
            entries: [
              { cardNumber: 'CARD-002', quantity: 3 },
              { cardNumber: 'OSHI-001', quantity: 1 },
              { cardNumber: 'CHEER-001', quantity: 10 },
              { cardNumber: 'CARD-001', quantity: 4 },
              { cardNumber: 'UNKNOWN-999', quantity: 2 },
            ],
          }),
      }),
    })

    const copy = await screen.findByRole('button', {
      name: 'デッキリストをテキストでコピー',
    })
    expect(copy).toHaveTextContent('テキストをコピー')
    await waitFor(() => expect(copy).toBeEnabled())
    fireEvent.click(copy)

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText).toHaveBeenCalledWith(
      [
        'HLSieve DB Deck',
        'デッキ名: 日本語🎴デッキ',
        '',
        '【推しホロメン】',
        '1 OSHI-001 推しカード',
        '',
        '【メインデッキ】',
        '4 CARD-001 赤いカード',
        '3 CARD-002 青いカード',
        '',
        '【エールデッキ】',
        '10 CHEER-001 白エール',
        '',
        '【未確認カード】',
        '2 UNKNOWN-999 不明なカード',
        '',
        'Main: 7枚',
        'Cheer: 10枚',
        'Total: 20枚',
        '',
        'https://hlsieve.com',
      ].join('\n'),
    )
    expect(
      await screen.findByText('デッキリストをコピーしました。'),
    ).toHaveAttribute('role', 'status')
  })

  it('reports clipboard failure without a silent fallback', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn(async () => Promise.reject(new Error('denied'))),
      },
    })
    renderPage({
      deckRepository: repository({
        getDeck: async () =>
          deck({ entries: [{ cardNumber: 'CARD-001', quantity: 1 }] }),
      }),
    })

    const copy = await screen.findByRole('button', {
      name: 'デッキリストをテキストでコピー',
    })
    await waitFor(() => expect(copy).toBeEnabled())
    fireEvent.click(copy)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'コピーできませんでした。',
    )
  })

  it('disables text export for an empty Deck', async () => {
    renderPage()

    expect(
      await screen.findByRole('button', {
        name: 'デッキリストをテキストでコピー',
      }),
    ).toBeDisabled()
    expect(screen.getByText('デッキにカードがありません。')).toBeVisible()
  })

  it('waits for Card data and exposes load failure instead of losing entries', async () => {
    renderPage({
      deckRepository: repository({
        getDeck: async () =>
          deck({ entries: [{ cardNumber: 'UNKNOWN-999', quantity: 2 }] }),
      }),
      loadCards: async () => Promise.reject(new Error('offline')),
    })

    expect(
      await screen.findByRole('button', {
        name: 'デッキリストをテキストでコピー',
      }),
    ).toBeDisabled()
    expect(
      await screen.findByText('カードデータの読み込み後にコピーできます。'),
    ).toHaveAttribute('role', 'alert')
  })
})

describe('DeckEditPage analysis', () => {
  it('shows an accessible empty analysis state', async () => {
    renderPage()

    const analysis = await screen.findByRole('region', { name: 'デッキ分析' })
    expect(analysis).toHaveTextContent(
      'カードを追加するとデッキ構成を確認できます。',
    )
  })

  it('shows totals, composition, restrictions, and unknown cards', async () => {
    renderPage({
      deckRepository: repository({
        getDeck: async () =>
          deck({
            entries: [
              { cardNumber: 'OSHI-001', quantity: 1 },
              { cardNumber: 'CARD-001', quantity: 2 },
              { cardNumber: 'CARD-004', quantity: 3 },
              { cardNumber: 'CARD-003', quantity: 1 },
              { cardNumber: 'CHEER-001', quantity: 4 },
              { cardNumber: 'hBP01-030', quantity: 2 },
              { cardNumber: 'UNKNOWN-999', quantity: 2 },
            ],
          }),
      }),
    })

    const analysis = await screen.findByRole('region', { name: 'デッキ分析' })
    expect(
      within(analysis).getByRole('heading', { name: '概要' }),
    ).toBeVisible()
    expect(within(analysis).getByText('合計').nextSibling).toHaveTextContent(
      '15枚',
    )
    expect(
      within(analysis).getByRole('listitem', { name: '赤 4枚 50.0%' }),
    ).toBeVisible()
    expect(
      within(analysis).getByRole('listitem', { name: '赤/青 3枚 37.5%' }),
    ).toBeVisible()
    expect(analysis).toHaveTextContent('Buzz')
    expect(analysis).toHaveTextContent('1枚')
    expect(analysis).toHaveTextContent('hBP01-030 IRyS')
    expect(analysis).toHaveTextContent('2枚 / 上限1枚')
    expect(analysis).toHaveTextContent('上限超過')
    expect(analysis).toHaveTextContent('UNKNOWN-999')
    expect(analysis).toHaveTextContent('分類不能 2枚')
  })

  it('updates immediately from the current in-memory Deck', async () => {
    renderPage({
      deckRepository: repository({
        getDeck: async () =>
          deck({ entries: [{ cardNumber: 'CARD-001', quantity: 1 }] }),
      }),
    })

    const analysis = await screen.findByRole('region', { name: 'デッキ分析' })
    expect(
      within(analysis).getByRole('listitem', { name: '赤 1枚 100.0%' }),
    ).toBeVisible()

    const addButtons = screen.getAllByRole('button', {
      name: '赤いカードを1枚追加',
    })
    fireEvent.click(addButtons.at(-1)!)

    await waitFor(() =>
      expect(
        within(analysis).getByRole('listitem', { name: '赤 2枚 100.0%' }),
      ).toBeVisible(),
    )
    expect(within(analysis).getByText('メイン').nextSibling).toHaveTextContent(
      '2枚',
    )
  })

  it('keeps the Deck text export available alongside analysis', async () => {
    renderPage({
      deckRepository: repository({
        getDeck: async () =>
          deck({ entries: [{ cardNumber: 'CARD-001', quantity: 1 }] }),
      }),
    })

    const copyButton = await screen.findByRole('button', {
      name: 'デッキリストをテキストでコピー',
    })
    await waitFor(() => expect(copyButton).toBeEnabled())
    expect(screen.getByRole('region', { name: 'デッキ分析' })).toBeVisible()
  })
})

/**
 * Building for a limited format.
 *
 * The rules are the ordinary ones; what changes is which cards may be used. So
 * the editor narrows what the search offers and says what in the deck would not
 * be allowed, and never edits the deck to suit the format: a deck part way
 * through a rebuild is exactly the case that has to survive.
 */
describe('DeckEditPage regulations', () => {
  const SELECTION = 'selection-cup-2026-autumn'
  // One of the three products the Selection Cup definition names, so the
  // fixture pool is built the same way production builds it.
  const SELECTION_PRODUCT = 'ブースターパック バウンサーバウンド'

  /** Cards split across the pool, so the narrowing is visible. */
  const regulationCards = [
    card('IN-MAIN', 'プール内メイン', { products: [SELECTION_PRODUCT] }),
    card('OUT-MAIN', 'プール外メイン', { products: ['ブースターパック'] }),
    card('IN-OSHI', 'プール内推し', {
      cardType: 'oshi',
      products: [SELECTION_PRODUCT],
    }),
    card('OUT-OSHI', 'プール外推し', {
      cardType: 'oshi',
      products: ['ブースターパック'],
    }),
    card('CHEER-OUT', 'プール外エール', {
      cardType: 'cheer',
      products: ['ブースターパック'],
    }),
  ]

  function renderRegulationPage({
    regulationId,
    entries = [],
    saveDeck = vi.fn(async () => undefined),
  }: {
    regulationId?: string
    entries?: Deck['entries']
    saveDeck?: DeckRepository['saveDeck']
  } = {}) {
    const stored = deck({ ...(regulationId ? { regulationId } : {}), entries })
    renderPage({
      deckRepository: repository({
        getDeck: vi.fn(async () => stored),
        saveDeck,
      }),
      loadCards: vi.fn(async () => cardsData(regulationCards)),
      loadPrintings: vi.fn(async () => printingsData(regulationCards)),
    })
    return { saveDeck, stored }
  }

  const selector = () =>
    screen.getByLabelText('使用するレギュレーション') as HTMLSelectElement
  const onlyAllowedToggle = () =>
    screen.getByLabelText('使用可能カードのみ表示')
  const searchBox = () => screen.getByLabelText('カード検索')

  describe('choosing the format', () => {
    it('shows ordinary construction for a deck that names none', async () => {
      renderRegulationPage()

      expect(await screen.findByText('5件')).toBeVisible()
      expect(selector().value).toBe('standard')
      expect(screen.queryByLabelText('使用可能カードのみ表示')).toBeNull()
    })

    it('shows the tournament a deck names', async () => {
      renderRegulationPage({ regulationId: SELECTION })

      await screen.findByText('3件')
      expect(selector().value).toBe(SELECTION)
    })

    it('saves the deck when a tournament is chosen', async () => {
      const { saveDeck } = renderRegulationPage()
      await screen.findByText('5件')

      fireEvent.change(selector(), { target: { value: SELECTION } })

      await waitFor(() => expect(saveDeck).toHaveBeenCalledTimes(1))
      expect(
        (saveDeck as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].regulationId,
      ).toBe(SELECTION)
    })

    // Ordinary construction is the absence of the field, so going back removes
    // it rather than writing 'standard'.
    it('removes the format when going back to ordinary construction', async () => {
      const { saveDeck } = renderRegulationPage({ regulationId: SELECTION })
      await screen.findByText('3件')

      fireEvent.change(selector(), { target: { value: 'standard' } })

      await waitFor(() => expect(saveDeck).toHaveBeenCalledTimes(1))
      const saved = (saveDeck as ReturnType<typeof vi.fn>).mock
        .calls[0]?.[0] as Deck
      expect('regulationId' in saved).toBe(false)
    })

    it('offers the formats on record and no others', async () => {
      renderRegulationPage()
      await screen.findByText('5件')

      expect(
        [...selector().options].map((option) => option.value).sort(),
      ).toEqual(['selection-cup-2026-autumn', 'standard'])
    })
  })

  describe('a format this build does not have', () => {
    it('says so and shows the deck as ordinary construction', async () => {
      renderRegulationPage({ regulationId: 'future-or-removed-rule' })

      expect(
        await screen.findByText(
          /このデッキのレギュレーション定義が見つかりません/,
        ),
      ).toBeVisible()
      expect(selector().value).toBe('standard')
    })

    // Opening a deck is not a decision about it.
    it('does not rewrite the deck merely by opening it', async () => {
      const { saveDeck } = renderRegulationPage({
        regulationId: 'future-or-removed-rule',
      })
      await screen.findByText('5件')

      expect(saveDeck).not.toHaveBeenCalled()
    })

    it('keeps the unknown format through an unrelated edit', async () => {
      const { saveDeck } = renderRegulationPage({
        regulationId: 'future-or-removed-rule',
      })
      await screen.findByText('5件')

      fireEvent.change(screen.getByLabelText('デッキ名'), {
        target: { value: '新しい名前' },
      })
      fireEvent.click(screen.getByRole('button', { name: '名前を保存' }))

      await waitFor(() => expect(saveDeck).toHaveBeenCalledTimes(1))
      expect(
        (saveDeck as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].regulationId,
      ).toBe('future-or-removed-rule')
    })

    it('replaces it only when the reporter chooses another', async () => {
      const { saveDeck } = renderRegulationPage({
        regulationId: 'future-or-removed-rule',
      })
      await screen.findByText('5件')

      fireEvent.change(selector(), { target: { value: SELECTION } })

      await waitFor(() => expect(saveDeck).toHaveBeenCalledTimes(1))
      expect(
        (saveDeck as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].regulationId,
      ).toBe(SELECTION)
    })
  })

  describe('what the search offers', () => {
    it('leaves the search alone under ordinary construction', async () => {
      renderRegulationPage()

      expect(await screen.findByText('5件')).toBeVisible()
    })

    it('offers only the pool for the restricted sections', async () => {
      renderRegulationPage({ regulationId: SELECTION })

      // The two pool cards plus the cheer card, which the pool does not
      // restrict; the two out-of-pool cards are gone.
      expect(await screen.findByText('3件')).toBeVisible()
      const picker = screen.getByRole('region', { name: 'カードを追加' })
      expect(within(picker).getByText('プール内メイン')).toBeVisible()
      expect(within(picker).getByText('プール内推し')).toBeVisible()
      expect(within(picker).queryByText('プール外メイン')).toBeNull()
      expect(within(picker).queryByText('プール外推し')).toBeNull()
    })

    // The pool holds no cheer card at all, so restricting cheer by it would
    // leave nothing to build an cheer deck from.
    it('still offers every cheer card', async () => {
      renderRegulationPage({ regulationId: SELECTION })
      await screen.findByText('3件')

      fireEvent.change(searchBox(), { target: { value: 'エール' } })

      expect(await screen.findByText('プール外エール')).toBeVisible()
    })

    it('offers everything again when the reporter asks to see it', async () => {
      renderRegulationPage({ regulationId: SELECTION })
      await screen.findByText('3件')

      fireEvent.click(onlyAllowedToggle())

      expect(await screen.findByText('5件')).toBeVisible()
      expect(screen.getByText('プール外メイン')).toBeVisible()
    })

    it('marks a card the format does not allow', async () => {
      renderRegulationPage({ regulationId: SELECTION })
      await screen.findByText('3件')
      fireEvent.click(onlyAllowedToggle())
      await screen.findByText('5件')

      expect(
        screen.getAllByText('このレギュレーションでは使用できません').length,
      ).toBe(2)
    })

    // A deck may be part way towards the format, so the card can still be
    // added; the deck warning says what is left to fix.
    it('lets a card the format does not allow be added anyway', async () => {
      const { saveDeck } = renderRegulationPage({ regulationId: SELECTION })
      await screen.findByText('3件')
      fireEvent.click(onlyAllowedToggle())
      await screen.findByText('5件')

      fireEvent.click(
        screen.getByRole('button', { name: 'プール外メインを1枚追加' }),
      )

      await waitFor(() => expect(saveDeck).toHaveBeenCalled())
      expect(
        await screen.findByText(
          /このレギュレーションでは使用できないカードがあります/,
        ),
      ).toBeVisible()
    })

    // Deliberately not in the URL: it is a way of looking at the search rather
    // than part of the search itself.
    it('keeps the toggle out of the address bar', async () => {
      renderRegulationPage({ regulationId: SELECTION })
      await screen.findByText('3件')
      const before = window.location.search

      fireEvent.click(onlyAllowedToggle())
      await screen.findByText('5件')

      expect(window.location.search).toBe(before)
    })

    it('still filters the narrowed pool by the ordinary search', async () => {
      renderRegulationPage({ regulationId: SELECTION })
      await screen.findByText('3件')

      fireEvent.change(searchBox(), { target: { value: 'プール内推し' } })

      expect(await screen.findByText('1件')).toBeVisible()
    })
  })

  describe('cards already in the deck', () => {
    const withOutOfPool = () =>
      renderRegulationPage({
        regulationId: SELECTION,
        entries: [
          { cardNumber: 'OUT-MAIN', quantity: 2 },
          { cardNumber: 'IN-MAIN', quantity: 1 },
        ],
      })

    it('says which cards the format does not allow, and how many', async () => {
      withOutOfPool()

      expect(
        await screen.findByText(
          /このレギュレーションでは使用できないカードがあります/,
        ),
      ).toBeVisible()
      const warning = screen.getByRole('alert')
      expect(
        within(warning).getByText(
          /OUT-MAIN プール外メイン ×2（対象カードプール外）/,
        ),
      ).toBeVisible()
      expect(within(warning).queryByText(/IN-MAIN/)).toBeNull()
    })

    it('says so without removing anything', async () => {
      const { saveDeck } = withOutOfPool()
      await screen.findByText(/使用できないカードがあります/)

      expect(saveDeck).not.toHaveBeenCalled()
      expect(screen.getByText('カードは自動では削除しません。')).toBeVisible()
    })

    it('keeps the cards when the format changes', async () => {
      const { saveDeck } = withOutOfPool()
      await screen.findByText(/使用できないカードがあります/)

      fireEvent.change(selector(), { target: { value: 'standard' } })

      await waitFor(() => expect(saveDeck).toHaveBeenCalledTimes(1))
      expect(
        (saveDeck as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].entries,
      ).toEqual([
        { cardNumber: 'OUT-MAIN', quantity: 2 },
        { cardNumber: 'IN-MAIN', quantity: 1 },
      ])
    })

    // Choosing a format the deck does not yet fit is how a rebuild starts, so
    // the cards it does not allow stay where they are.
    it('keeps every card when a limited format is chosen', async () => {
      const saveDeck = vi.fn<(value: Deck) => Promise<void>>(
        async () => undefined,
      )
      renderRegulationPage({
        entries: [
          { cardNumber: 'OUT-MAIN', quantity: 2 },
          { cardNumber: 'OUT-OSHI', quantity: 1 },
        ],
        saveDeck,
      })
      await screen.findByText('5件')

      fireEvent.change(selector(), { target: { value: SELECTION } })

      await waitFor(() => expect(saveDeck).toHaveBeenCalledTimes(1))
      expect(saveDeck.mock.calls[0]?.[0].entries).toEqual([
        { cardNumber: 'OUT-MAIN', quantity: 2 },
        { cardNumber: 'OUT-OSHI', quantity: 1 },
      ])
      expect(
        await screen.findByText(
          /このレギュレーションでは使用できないカードがあります/,
        ),
      ).toBeVisible()
    })

    it('stops warning once the deck is back to ordinary construction', async () => {
      withOutOfPool()
      await screen.findByText(/使用できないカードがあります/)

      fireEvent.change(selector(), { target: { value: 'standard' } })

      await waitFor(() =>
        expect(screen.queryByText(/使用できないカードがあります/)).toBeNull(),
      )
    })

    it('says nothing under ordinary construction', async () => {
      renderRegulationPage({
        entries: [{ cardNumber: 'OUT-MAIN', quantity: 2 }],
      })
      await screen.findByText('5件')

      expect(screen.queryByText(/使用できないカードがあります/)).toBeNull()
    })

    // The ordinary rules are unchanged by any of this: they are still reported,
    // and in their own place rather than mixed into the format warning.
    it('still reports the ordinary deck rules separately', async () => {
      withOutOfPool()

      const legality = await screen.findByRole('region', {
        name: 'デッキ構築状態',
      })
      expect(legality).toBeVisible()
      expect(
        within(legality).queryByText(/使用できないカードがあります/),
      ).toBeNull()
    })
  })
})

/**
 * Keeping the deck as it is now.
 *
 * Only when asked: the editor saves on every change, so snapshotting those
 * would bury the states someone actually wanted to come back to.
 */
describe('DeckEditPage versions', () => {
  function renderWithVersions(
    createVersion = vi.fn<DeckVersionRepository['createVersion']>(async () => ({
      id: 'version-1',
      deckId: 'deck-1',
      label: '大会前',
      createdAt: '2026-09-25T02:30:00.000Z',
      snapshot: { name: 'テストデッキ', entries: [] },
    })),
  ) {
    const deckVersions: DeckVersionRepository = {
      listAllVersions: vi.fn(async () => []),
      listVersions: vi.fn(async () => []),
      getVersion: vi.fn(async () => undefined),
      saveVersion: vi.fn(async () => undefined),
      createVersion,
      deleteVersion: vi.fn(async () => undefined),
      deleteVersionsForDeck: vi.fn(async () => undefined),
    }
    renderPage({ deckVersions })
    return { createVersion, deckVersions }
  }

  it('keeps the deck under the label that was typed', async () => {
    const { createVersion } = renderWithVersions()
    await screen.findByLabelText('バージョンを保存')

    fireEvent.change(screen.getByLabelText('バージョンを保存'), {
      target: { value: '大会前' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'バージョンを保存' }))

    await waitFor(() => expect(createVersion).toHaveBeenCalledTimes(1))
    expect(createVersion.mock.calls[0]?.[1]).toBe('大会前')
    expect(await screen.findByText('バージョンを保存しました')).toBeVisible()
  })

  // An unlabelled snapshot is named after when it was taken, by the store.
  it('allows an empty label', async () => {
    const { createVersion } = renderWithVersions()
    await screen.findByLabelText('バージョンを保存')

    fireEvent.click(screen.getByRole('button', { name: 'バージョンを保存' }))

    await waitFor(() => expect(createVersion).toHaveBeenCalledTimes(1))
    expect(createVersion.mock.calls[0]?.[1]).toBe('')
  })

  it('keeps nothing when the editor is merely used', async () => {
    const { createVersion } = renderWithVersions()
    const search = await screen.findByLabelText('カード検索')

    fireEvent.change(search, { target: { value: '赤い' } })
    fireEvent.click(
      await within(
        screen.getByRole('region', { name: 'カードを追加' }),
      ).findByRole('button', { name: '赤いカードを1枚追加' }),
    )

    await waitFor(() => expect(screen.getByText('保存しました')).toBeVisible())
    expect(createVersion).not.toHaveBeenCalled()
  })

  it('says so when it could not be kept', async () => {
    renderWithVersions(
      vi.fn(async () => {
        throw new Error('quota')
      }),
    )
    await screen.findByLabelText('バージョンを保存')

    fireEvent.click(screen.getByRole('button', { name: 'バージョンを保存' }))

    expect(
      await screen.findByText('バージョンを保存できませんでした。'),
    ).toBeVisible()
  })

  it('links to the snapshots kept of this deck', async () => {
    renderWithVersions()

    expect(
      await screen.findByRole('link', { name: '保存したバージョンを見る' }),
    ).toHaveAttribute('href', '/decks/deck-1/versions')
  })
})
