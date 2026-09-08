import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { Card, CardsDataFile } from '../domain/cards/types'
import type { Deck } from '../domain/decks/types'
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
  card('CARD-001', '赤いカード'),
  card('CARD-002', '青いカード'),
  card('CARD-003', '緑のカード'),
  card('OSHI-001', '推しカード', { cardType: 'oshi' }),
  card('MAIN-UNLIMITED', '無制限カード', { deckLimit: null }),
  card('MAIN-SIX', '6枚カード', { deckLimit: 6 }),
  card('CHEER-001', '白エール', { cardType: 'cheer' }),
  card('hBP01-030', 'IRyS'),
]

function cardsData(): CardsDataFile {
  return {
    format: 'holocard-cards',
    formatVersion: 1,
    dataVersion: `sha256:${'0'.repeat(64)}`,
    generatedAt: '2026-09-08T00:00:00.000Z',
    cards,
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
  path = '/decks/deck-1',
}: {
  deckRepository?: DeckRepository
  loadCards?: () => Promise<CardsDataFile>
  path?: string
} = {}) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/decks/:deckId"
          element={
            <DeckEditPage repository={deckRepository} loadCards={loadCards} />
          }
        />
        <Route path="/decks" element={<p>Deck list destination</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return { deckRepository, loadCards }
}

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

    expect(await screen.findByText('赤いカード')).toBeVisible()
    expect(screen.getAllByText(/UNKNOWN-001/).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('カードデータに存在しないカードです')).toBeVisible()
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
    expect(screen.getByRole('heading', { name: /メインデッキ/ })).toBeVisible()
    expect(screen.getByRole('heading', { name: /エールデッキ/ })).toBeVisible()
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
    expect(screen.getByText('赤いカード')).toBeVisible()
    expect(screen.queryByText('青いカード')).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: '赤いカードをデッキに追加' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: '赤いカードをデッキに追加' }),
    )

    expect(screen.getByLabelText('赤いカードの現在枚数')).toHaveTextContent('2')
    expect(screen.getByText('合計 2枚')).toBeVisible()
    await waitFor(() => expect(saveDeck).toHaveBeenCalledTimes(2))
    expect(saveDeck.mock.calls[1]?.[0].entries).toEqual([
      { cardNumber: 'CARD-001', quantity: 2 },
    ])
    expect(saveDeck.mock.calls[1]?.[0]).not.toHaveProperty('legality')
    expect(saveDeck.mock.calls[1]?.[0]).not.toHaveProperty('rulesVersion')
  })

  it('shows an empty search result without inventing search semantics', async () => {
    renderPage()
    const search = await screen.findByLabelText('カード検索')
    fireEvent.change(search, { target: { value: '存在しない語' } })
    expect(screen.getByText('条件に一致するカードがありません。')).toBeVisible()
  })

  it('increments, decrements to removal, removes directly, and autosaves totals', async () => {
    const saveDeck = vi.fn(async () => undefined)
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
    await screen.findByText('赤いカード')

    fireEvent.click(
      screen.getByRole('button', { name: '赤いカードを1枚増やす' }),
    )
    expect(screen.getByLabelText('赤いカードの現在枚数')).toHaveTextContent('2')
    fireEvent.click(
      screen.getByRole('button', { name: '青いカードを1枚減らす' }),
    )
    expect(screen.queryByText('青いカード')).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: '赤いカードをデッキから削除' }),
    )
    expect(screen.getByText('カードが追加されていません。')).toBeVisible()
    expect(screen.getByText('合計 0枚')).toBeVisible()
    await waitFor(() => expect(saveDeck).toHaveBeenCalledTimes(3))
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
    const add = screen.getByRole('button', {
      name: '赤いカードをデッキに追加',
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
      screen.getByRole('button', { name: '赤いカードをデッキに追加' }),
    )
    expect(
      await screen.findByText(/デッキを保存できませんでした/),
    ).toBeVisible()

    fireEvent.click(
      screen.getByRole('button', { name: '赤いカードを1枚増やす' }),
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
