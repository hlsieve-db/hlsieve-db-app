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
import type { Deck } from '../domain/decks/types'
import { decodeDeckSharePayload } from '../domain/share/deckShareCodec'
import type { DeckRepository } from '../repositories/deckRepository'
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
}: {
  deckRepository?: DeckRepository
  loadCards?: () => Promise<CardsDataFile>
  loadPrintings?: () => Promise<CardPrintingsDataFile>
  path?: string
} = {}) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/decks/:deckId"
          element={
            <DeckEditPage
              repository={deckRepository}
              loadCards={loadCards}
              loadPrintings={loadPrintings}
            />
          }
        />
        <Route path="/decks" element={<p>Deck list destination</p>} />
        <Route path="/cards/:cardNumber" element={<CardDetailDestination />} />
      </Routes>
    </MemoryRouter>,
  )
  return { deckRepository, loadCards, loadPrintings }
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
})

describe('DeckEditPage loading', () => {
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
    expect(screen.getByText('カード情報なし')).toBeVisible()
    expect(screen.getByText('合計 3枚')).toBeVisible()
  })

  it('renames with trim, rejects whitespace, and autosaves', async () => {
    const saveDeck = vi.fn<(value: Deck) => Promise<void>>(
      async () => undefined,
    )
    renderPage({ deckRepository: repository({ saveDeck }) })
    const input = await screen.findByLabelText('デッキ名')

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

  it('links Oshi, Main, and Cheer images to logical Card Detail routes and preserves Back navigation', async () => {
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

    fireEvent.click(mainLink)
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

  it('preserves existing Q&A-term matching without adding a Deck editor option', async () => {
    const qaOnlyCard = card('QA-ONLY', '本文にないカード', {
      qas: [
        {
          id: 'Q-DECK',
          question: '白上フブキがいる場合、この能力は使えますか？',
          answer: 'はい、使えます。',
          officialUrl: 'https://example.com/qa/Q-DECK',
          relatedCardNumbers: ['QA-ONLY'],
        },
      ],
      searchText:
        'qa-only 本文にないかーど 白上ふぶきがいる場合、この能力は使えますか? はい、使えます。',
    })
    renderPage({
      loadCards: vi.fn(async () => cardsData([...cards, qaOnlyCard])),
      loadPrintings: vi.fn(async () => printingsData([...cards, qaOnlyCard])),
    })
    const search = await screen.findByLabelText('カード検索')

    fireEvent.change(search, { target: { value: 'フブキ' } })

    const picker = screen.getByRole('region', { name: 'カードを追加' })
    expect(await within(picker).findByText('本文にないカード')).toBeVisible()
    expect(screen.queryByLabelText('Q&Aを含める')).not.toBeInTheDocument()
  })

  it('shows an empty search result without inventing search semantics', async () => {
    renderPage()
    const search = await screen.findByLabelText('カード検索')
    fireEvent.change(search, { target: { value: '存在しない語' } })
    expect(screen.getByText('条件に一致するカードがありません。')).toBeVisible()
  })

  it('keeps shared structured filters collapsed by default and retains active values', async () => {
    renderPage()
    await screen.findByText('9件')
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

  it('uses the shared seven-value Card Type filter in the deck editor', async () => {
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
      'cheer',
    ])
    expect(group).toHaveTextContent('サポート（リミテッド）')
    expect(group).toHaveTextContent('サポート（非リミテッド）')
    expect(group).toHaveTextContent('ツール')
    expect(group).toHaveTextContent('ファン')
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

describe('DeckEditPage share link', () => {
  it('generates a current-origin UTF-8 share URL from the current logical deck', async () => {
    renderPage({
      deckRepository: repository({
        getDeck: async () =>
          deck({
            name: '日本語共有デッキ',
            entries: [{ cardNumber: 'CARD-001', quantity: 2 }],
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
        entries: [{ cardNumber: 'CARD-001', quantity: 2 }],
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
        '3 CARD-002 青いカード',
        '4 CARD-001 赤いカード',
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
