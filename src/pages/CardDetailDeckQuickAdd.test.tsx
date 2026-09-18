import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  Card,
  CardPrintingsDataFile,
  CardsDataFile,
} from '../domain/cards/types'
import { SELECTED_DECK_STORAGE_KEY } from '../domain/decks/selectedDeckPreference'
import type { Deck } from '../domain/decks/types'
import type { DeckRepository } from '../repositories/deckRepository'
import { CardDetailPage } from './CardDetailPage'
import { CardSearchPage } from './CardSearchPage'
import { DeckEditPage } from './DeckEditPage'

const dataVersion = `sha256:${'0'.repeat(64)}`

const testCard: Card = {
  cardNumber: 'TEST-001',
  name: 'テストカード',
  imageUrl: 'https://example.com/default.png',
  officialUrl: 'https://example.com/card/10',
  cardType: 'holomem',
  colors: ['blue'],
  isBuzz: false,
  tags: [],
  abilities: [],
  arts: [],
  batonPass: [],
  effectTags: [],
  criticalColors: [],
  rarities: ['C', 'P'],
  products: [],
  illustrators: [],
  qas: [],
  searchText: 'test-001 てすとかーど',
}

function cardsData(cards: Card[] = [testCard]): CardsDataFile {
  return {
    format: 'holocard-cards',
    formatVersion: 1,
    dataVersion,
    generatedAt: '2026-09-09T00:00:00.000Z',
    cards,
  }
}

function printingsData(): CardPrintingsDataFile {
  return {
    format: 'hlsieve-card-printings',
    formatVersion: 1,
    cardsDataVersion: dataVersion,
    dataVersion: `sha256:${'1'.repeat(64)}`,
    cards: {
      'TEST-001': {
        defaultPrintingOfficialId: '10',
        printings: [
          {
            officialId: '10',
            officialUrl: 'https://example.com/card/10',
            imageUrl: 'https://example.com/default.png',
            isParallel: false,
            rarity: 'C',
            products: [],
          },
          {
            officialId: '20',
            officialUrl: 'https://example.com/card/20',
            imageUrl: 'https://example.com/parallel.png',
            isParallel: true,
            rarity: 'P',
            products: [],
          },
        ],
      },
    },
  }
}

function deck(id: string, quantity = 0): Deck {
  return {
    id,
    name: `デッキ${id.slice(-1)}`,
    entries: quantity ? [{ cardNumber: 'TEST-001', quantity }] : [],
    createdAt: '2026-09-09T00:00:00.000Z',
    updatedAt: '2026-09-09T00:00:00.000Z',
  }
}

function repository(
  decks: Deck[],
  overrides: Partial<DeckRepository> = {},
): DeckRepository {
  return {
    listDecks: vi.fn(async () => decks),
    getDeck: vi.fn(async () => undefined),
    saveDeck: vi.fn(async () => undefined),
    deleteDeck: vi.fn(async () => undefined),
    ...overrides,
  }
}

function renderDetail(deckRepository: DeckRepository) {
  return render(
    <MemoryRouter initialEntries={['/cards/TEST-001']}>
      <Routes>
        <Route
          path="/cards/:cardNumber"
          element={
            <CardDetailPage
              loadCards={async () => cardsData()}
              loadPrintings={async () => printingsData()}
              repository={deckRepository}
            />
          }
        />
        <Route path="/decks" element={<p>保存デッキ一覧</p>} />
        <Route path="/decks/:deckId" element={<p>選択中デッキ編集画面</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => localStorage.clear())

Object.defineProperty(window, 'scrollTo', {
  configurable: true,
  value: vi.fn(),
})

describe('Card Detail deck quick add', () => {
  it('links back to the same selected deck used by Quick Add', async () => {
    localStorage.setItem(SELECTED_DECK_STORAGE_KEY, 'deck-2')
    renderDetail(repository([deck('deck-1'), deck('deck-2', 3)]))

    expect(await screen.findByLabelText('追加先デッキ')).toHaveValue('deck-2')
    expect(
      screen.getByRole('link', { name: '作成中デッキへ戻る' }),
    ).toHaveAttribute('href', '/decks/deck-2')
    expect(
      screen.getByRole('link', { name: 'カード検索へ戻る' }),
    ).toHaveAttribute('href', '/cards')
  })

  it('falls back safely for no decks and stale selected deck preferences', async () => {
    const { unmount } = renderDetail(repository([]))
    expect(
      await screen.findByRole('link', { name: '作成中デッキへ戻る' }),
    ).toHaveAttribute('href', '/decks')
    unmount()

    localStorage.setItem(SELECTED_DECK_STORAGE_KEY, 'stale-deck')
    renderDetail(repository([deck('deck-1')]))
    expect(await screen.findByLabelText('追加先デッキ')).toHaveValue('deck-1')
    expect(
      screen.getByRole('link', { name: '作成中デッキへ戻る' }),
    ).toHaveAttribute('href', '/decks/deck-1')
  })

  it('returns to the selected Deck Edit route without changing its quantity', async () => {
    renderDetail(repository([deck('deck-1', 2)]))

    expect(await screen.findByLabelText('現在 2枚')).toBeVisible()
    fireEvent.click(screen.getByRole('link', { name: '作成中デッキへ戻る' }))
    expect(screen.getByText('選択中デッキ編集画面')).toBeVisible()
  })

  it('round-trips from Deck Edit to Detail and back to the same Deck with quantity intact', async () => {
    const selectedDeck = deck('deck-1', 2)
    const deckRepository = repository([selectedDeck], {
      getDeck: vi.fn(async (id) =>
        id === selectedDeck.id ? selectedDeck : undefined,
      ),
    })
    render(
      <MemoryRouter initialEntries={['/decks/deck-1']}>
        <Routes>
          <Route
            path="/decks/:deckId"
            element={
              <DeckEditPage
                repository={deckRepository}
                loadCards={async () => cardsData()}
                loadPrintings={async () => printingsData()}
              />
            }
          />
          <Route
            path="/cards/:cardNumber"
            element={
              <CardDetailPage
                loadCards={async () => cardsData()}
                loadPrintings={async () => printingsData()}
                repository={deckRepository}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    const currentCards = await screen.findByRole('region', {
      name: '現在のカード',
    })
    fireEvent.change(screen.getByLabelText('カード検索'), {
      target: { value: 'テスト' },
    })
    fireEvent.click(screen.getByLabelText('Q&Aを含める'))
    fireEvent.click(
      await within(currentCards).findByRole('link', {
        name: 'テストカードのカード詳細を開く',
      }),
    )
    expect(await screen.findByLabelText('追加先デッキ')).toHaveValue('deck-1')
    expect(screen.getByLabelText('現在 2枚')).toBeVisible()
    fireEvent.click(screen.getByRole('link', { name: '作成中デッキへ戻る' }))
    expect(
      await screen.findByRole('heading', { name: 'デッキ1' }),
    ).toBeVisible()
    expect(
      within(
        screen.getByRole('region', { name: '現在のカード' }),
      ).getByLabelText('現在 2枚'),
    ).toBeVisible()
    expect(screen.getByLabelText('カード検索')).toHaveValue('テスト')
    expect(screen.getByLabelText('Q&Aを含める')).toBeChecked()
  })

  it('restores Deck Editor pagination from the explicit return link', async () => {
    const manyCards = Array.from({ length: 30 }, (_, index) => ({
      ...testCard,
      cardNumber: `TEST-${String(index + 1).padStart(3, '0')}`,
      name: `テストカード${index + 1}`,
      searchText: `test-${String(index + 1).padStart(3, '0')} てすとかーど${index + 1}`,
    }))
    const selectedDeck = deck('deck-1')
    const deckRepository = repository([selectedDeck], {
      getDeck: vi.fn(async () => selectedDeck),
    })
    render(
      <MemoryRouter initialEntries={['/decks/deck-1']}>
        <Routes>
          <Route
            path="/decks/:deckId"
            element={
              <DeckEditPage
                repository={deckRepository}
                loadCards={async () => cardsData(manyCards)}
                loadPrintings={async () => printingsData()}
              />
            }
          />
          <Route
            path="/cards/:cardNumber"
            element={
              <CardDetailPage
                loadCards={async () => cardsData(manyCards)}
                loadPrintings={async () => printingsData()}
                repository={deckRepository}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByLabelText('Q&Aを含める'))
    const pagination = await screen.findByRole('navigation', {
      name: 'カード追加結果のページ',
    })
    fireEvent.click(within(pagination).getByRole('button', { name: '次へ' }))
    expect(screen.getByText('2 / 2')).toBeVisible()
    fireEvent.click(
      screen.getByRole('link', {
        name: 'テストカード25のカード詳細を開く',
      }),
    )
    fireEvent.click(
      await screen.findByRole('link', { name: '作成中デッキへ戻る' }),
    )

    expect(await screen.findByText('2 / 2')).toBeVisible()
    expect(screen.getByLabelText('Q&Aを含める')).toBeChecked()
  })

  it('renders the selected deck and quantity between the main image and printings', async () => {
    renderDetail(repository([deck('deck-1', 2)]))

    expect(await screen.findByLabelText('追加先デッキ')).toHaveValue('deck-1')
    expect(screen.getByLabelText('現在 2枚')).toBeVisible()
    const image = screen.getByRole('img', { name: 'テストカードのカード画像' })
    const quickAdd = screen
      .getByRole('heading', { name: 'デッキへ追加' })
      .closest('section')!
    const printings = screen
      .getByRole('heading', { name: '版情報' })
      .closest('section')!
    expect(
      image
        .closest('.detail-card__image-frame')!
        .compareDocumentPosition(quickAdd) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      quickAdd.compareDocumentPosition(printings) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('increments, decrements to removal, persists, and keeps quantity independent of printing', async () => {
    const saveDeck = vi.fn<(value: Deck) => Promise<void>>(
      async () => undefined,
    )
    renderDetail(repository([deck('deck-1')], { saveDeck }))
    await screen.findByLabelText('追加先デッキ')

    const minus = screen.getByRole('button', {
      name: 'テストカードを1枚減らす',
    })
    expect(minus).toBeDisabled()
    fireEvent.click(
      screen.getByRole('button', { name: 'テストカードを1枚追加' }),
    )
    expect(screen.getByLabelText('現在 1枚')).toBeVisible()
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'テストカード パラレル P 版 20',
      }),
    )
    expect(screen.getByLabelText('現在 1枚')).toBeVisible()
    fireEvent.click(minus)
    expect(screen.getByLabelText('現在 0枚')).toBeVisible()
    expect(minus).toBeDisabled()
    await waitFor(() => expect(saveDeck).toHaveBeenCalledTimes(2))
    expect(saveDeck.mock.calls[1]?.[0].entries).toEqual([])
  })

  it('shares the preference and updates quantity when switching decks', async () => {
    localStorage.setItem(SELECTED_DECK_STORAGE_KEY, 'deck-2')
    renderDetail(repository([deck('deck-1', 1), deck('deck-2', 3)]))

    const selector = await screen.findByLabelText('追加先デッキ')
    expect(selector).toHaveValue('deck-2')
    expect(screen.getByLabelText('現在 3枚')).toBeVisible()
    fireEvent.change(selector, { target: { value: 'deck-1' } })
    expect(screen.getByLabelText('現在 1枚')).toBeVisible()
  })

  it('shows no-deck and repository error UX without hiding card detail', async () => {
    const { unmount } = renderDetail(repository([]))
    const createLink = await screen.findByRole('link', {
      name: 'デッキを作成',
    })
    expect(createLink.closest('p')).toHaveTextContent('デッキがありません。')
    expect(screen.getByRole('heading', { name: 'テストカード' })).toBeVisible()
    unmount()

    renderDetail(
      repository([], {
        listDecks: vi.fn(async () => {
          throw new Error('blocked')
        }),
      }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '保存デッキを読み込めませんでした。',
    )
    expect(screen.getByRole('heading', { name: 'テストカード' })).toBeVisible()
  })

  it('shows a save error and retains optimistic quantity', async () => {
    renderDetail(
      repository([deck('deck-1')], {
        saveDeck: vi.fn(async () => {
          throw new Error('quota')
        }),
      }),
    )
    await screen.findByLabelText('追加先デッキ')
    fireEvent.click(
      screen.getByRole('button', { name: 'テストカードを1枚追加' }),
    )
    expect(screen.getByLabelText('現在 1枚')).toBeVisible()
    expect(
      await screen.findByText(/デッキを保存できませんでした/),
    ).toBeVisible()
  })

  it('keeps the Cards page selected deck when navigating to detail', async () => {
    const deckRepository = repository([deck('deck-1'), deck('deck-2', 2)])
    render(
      <MemoryRouter initialEntries={['/cards?q=テストカード']}>
        <Routes>
          <Route
            path="/cards"
            element={
              <CardSearchPage
                loadCards={async () => cardsData()}
                repository={deckRepository}
              />
            }
          />
          <Route
            path="/cards/:cardNumber"
            element={
              <CardDetailPage
                loadCards={async () => cardsData()}
                loadPrintings={async () => printingsData()}
                repository={deckRepository}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    const selector = await screen.findByLabelText('追加先デッキ')
    fireEvent.change(selector, { target: { value: 'deck-2' } })
    fireEvent.click(screen.getByRole('link', { name: 'テストカード' }))
    expect(await screen.findByLabelText('追加先デッキ')).toHaveValue('deck-2')
    expect(screen.getByLabelText('現在 2枚')).toBeVisible()
    fireEvent.click(screen.getByRole('link', { name: 'カード検索へ戻る' }))
    expect(await screen.findByLabelText('キーワード')).toHaveValue(
      'テストカード',
    )
  })
})
