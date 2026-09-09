import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

function cardsData(): CardsDataFile {
  return {
    format: 'holocard-cards',
    formatVersion: 1,
    dataVersion,
    generatedAt: '2026-09-09T00:00:00.000Z',
    cards: [testCard],
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
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => localStorage.clear())

describe('Card Detail deck quick add', () => {
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
  })
})
