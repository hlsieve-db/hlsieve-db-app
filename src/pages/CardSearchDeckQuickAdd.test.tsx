import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Card, CardsDataFile } from '../domain/cards/types'
import { SELECTED_DECK_STORAGE_KEY } from '../domain/decks/selectedDeckPreference'
import type { Deck } from '../domain/decks/types'
import type { DeckRepository } from '../repositories/deckRepository'
import { CardSearchPage } from './CardSearchPage'

function card(cardNumber: string, name: string): Card {
  return {
    cardNumber,
    name,
    cardType: 'holomem',
    colors: ['blue'],
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
    searchText: `${cardNumber.toLowerCase()} ${name.toLowerCase()} ${cardNumber === 'CARD-001' ? 'あるふぁ' : ''}`,
  }
}

const cards = [
  card('CARD-001', 'アルファ'),
  ...Array.from({ length: 29 }, (_, index) =>
    card(`CARD-${String(index + 2).padStart(3, '0')}`, `カード${index + 2}`),
  ),
]

function cardsData(): CardsDataFile {
  return {
    format: 'holocard-cards',
    formatVersion: 1,
    dataVersion: `sha256:${'0'.repeat(64)}`,
    generatedAt: '2026-09-09T00:00:00.000Z',
    cards,
  }
}

function deck(id: string, quantity = 0): Deck {
  return {
    id,
    name: `デッキ${id.slice(-1)}`,
    entries: quantity ? [{ cardNumber: 'CARD-001', quantity }] : [],
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

function Location() {
  const location = useLocation()
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  )
}

function renderPage(
  deckRepository: DeckRepository,
  path = '/cards?q=アルファ',
) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <CardSearchPage
        loadCards={async () => cardsData()}
        repository={deckRepository}
      />
      <Location />
    </MemoryRouter>,
  )
}

afterEach(() => localStorage.clear())

describe('CardSearchPage deck quick add', () => {
  it('shows no-deck guidance without breaking search', async () => {
    renderPage(repository([]))

    const createLink = await screen.findByRole('link', {
      name: 'デッキを作成',
    })
    expect(createLink.closest('p')).toHaveTextContent('デッキがありません。')
    expect(createLink).toHaveAttribute('href', '/decks')
    expect(
      screen.getByRole('button', { name: 'アルファを1枚追加' }),
    ).toBeDisabled()
    expect(screen.getByLabelText('現在 0枚')).toBeVisible()
  })

  it('increments, decrements, removes zero entries, and autosaves without changing the URL', async () => {
    const saveDeck = vi.fn<(value: Deck) => Promise<void>>(
      async () => undefined,
    )
    renderPage(repository([deck('deck-1', 1)], { saveDeck }))

    expect(await screen.findByLabelText('追加先デッキ')).toHaveValue('deck-1')
    expect(screen.getByLabelText('現在 1枚')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'アルファを1枚追加' }))
    expect(screen.getByLabelText('現在 2枚')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'アルファを1枚減らす' }))
    expect(screen.getByLabelText('現在 1枚')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'アルファを1枚減らす' }))
    expect(screen.getByLabelText('現在 0枚')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'アルファを1枚減らす' }),
    ).toBeDisabled()

    await waitFor(() => expect(saveDeck).toHaveBeenCalledTimes(3))
    expect(saveDeck.mock.calls[2]?.[0].entries).toEqual([])
    expect(screen.getByTestId('location')).toHaveTextContent('/cards?q=')
  })

  it('shares a valid preference, switches decks, and falls back from a stale ID', async () => {
    localStorage.setItem(SELECTED_DECK_STORAGE_KEY, 'deck-2')
    const { unmount } = render(
      <MemoryRouter initialEntries={['/cards?q=アルファ']}>
        <CardSearchPage
          loadCards={async () => cardsData()}
          repository={repository([deck('deck-1', 1), deck('deck-2', 3)])}
        />
      </MemoryRouter>,
    )
    const selector = await screen.findByLabelText('追加先デッキ')
    expect(selector).toHaveValue('deck-2')
    expect(screen.getByLabelText('現在 3枚')).toBeVisible()
    fireEvent.change(selector, { target: { value: 'deck-1' } })
    expect(screen.getByLabelText('現在 1枚')).toBeVisible()
    expect(localStorage.getItem(SELECTED_DECK_STORAGE_KEY)).toBe('deck-1')
    unmount()

    localStorage.setItem(SELECTED_DECK_STORAGE_KEY, 'deleted-deck')
    renderPage(repository([deck('deck-1'), deck('deck-2')]))
    expect(await screen.findByLabelText('追加先デッキ')).toHaveValue('deck-1')
    expect(localStorage.getItem(SELECTED_DECK_STORAGE_KEY)).toBe('deck-1')
  })

  it('keeps pagination and search history unchanged while editing quantity', async () => {
    renderPage(repository([deck('deck-1')]), '/cards?page=2')
    await screen.findByText('2 / 2ページ')
    fireEvent.click(screen.getByRole('button', { name: 'カード26を1枚追加' }))
    expect(screen.getByTestId('location')).toHaveTextContent('?page=2')
    expect(screen.getByText('2 / 2ページ')).toBeVisible()
  })

  it('isolates repository load and save failures from card search', async () => {
    const listDecks = vi
      .fn<() => Promise<Deck[]>>()
      .mockRejectedValueOnce(new Error('blocked'))
      .mockResolvedValueOnce([deck('deck-1')])
    const saveDeck = vi.fn(async () => {
      throw new Error('quota')
    })
    renderPage(repository([], { listDecks, saveDeck }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('保存デッキを読み込めませんでした。')
    expect(screen.getByRole('heading', { name: 'アルファ' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '再試行' }))
    await screen.findByLabelText('追加先デッキ')
    fireEvent.click(screen.getByRole('button', { name: 'アルファを1枚追加' }))
    expect(
      await screen.findByText(/デッキを保存できませんでした/),
    ).toBeVisible()
  })
})
