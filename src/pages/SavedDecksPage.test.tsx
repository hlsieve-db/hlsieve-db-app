import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { Deck } from '../domain/decks/types'
import type { DeckRepository } from '../repositories/deckRepository'
import { SavedDecksPage } from './SavedDecksPage'

function deck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: 'deck-1',
    name: 'テストデッキ',
    entries: [{ cardNumber: 'CARD-001', quantity: 3 }],
    createdAt: '2026-09-08T00:00:00.000Z',
    updatedAt: '2026-09-08T01:00:00.000Z',
    ...overrides,
  }
}

function repository(overrides: Partial<DeckRepository> = {}): DeckRepository {
  return {
    listDecks: vi.fn(async () => []),
    getDeck: vi.fn(async () => undefined),
    saveDeck: vi.fn(async () => undefined),
    deleteDeck: vi.fn(async () => undefined),
    ...overrides,
  }
}

function Location() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}</output>
}

function renderPage(
  deckRepository: DeckRepository,
  createNewDeck = () => deck({ id: 'new-deck', entries: [] }),
) {
  render(
    <MemoryRouter initialEntries={['/decks']}>
      <Routes>
        <Route
          path="/decks"
          element={
            <SavedDecksPage
              repository={deckRepository}
              createNewDeck={createNewDeck}
            />
          }
        />
        <Route path="/decks/:deckId" element={<p>Editor destination</p>} />
      </Routes>
      <Location />
    </MemoryRouter>,
  )
}

describe('SavedDecksPage', () => {
  it('shows loading and the empty state', async () => {
    let resolveList!: (decks: Deck[]) => void
    const listPromise = new Promise<Deck[]>((resolve) => {
      resolveList = resolve
    })
    renderPage(repository({ listDecks: () => listPromise }))

    expect(screen.getByText('デッキを読み込んでいます…')).toBeVisible()
    resolveList([])
    expect(await screen.findByText('デッキがありません')).toBeVisible()
  })

  it('lists totals, update information, and an editor link', async () => {
    renderPage(repository({ listDecks: async () => [deck()] }))

    expect(await screen.findByText('テストデッキ')).toBeVisible()
    expect(screen.getByText('合計 3枚')).toBeVisible()
    expect(screen.getByText(/^更新 /)).toBeVisible()
    fireEvent.click(screen.getByRole('link', { name: '開く' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/decks/deck-1')
  })

  it('creates, saves, and opens a new deck', async () => {
    const saveDeck = vi.fn(async () => undefined)
    renderPage(repository({ saveDeck }))
    await screen.findByText('デッキがありません')

    fireEvent.click(screen.getByRole('button', { name: '新しいデッキを作成' }))

    await waitFor(() =>
      expect(saveDeck).toHaveBeenCalledWith(
        deck({ id: 'new-deck', entries: [] }),
      ),
    )
    expect(screen.getByTestId('location')).toHaveTextContent('/decks/new-deck')
  })

  it('does not navigate when creation persistence fails', async () => {
    renderPage(
      repository({ saveDeck: async () => Promise.reject(new Error('full')) }),
    )
    await screen.findByText('デッキがありません')
    fireEvent.click(screen.getByRole('button', { name: '新しいデッキを作成' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'デッキを作成できませんでした。',
    )
    expect(screen.getByTestId('location')).toHaveTextContent('/decks')
  })

  it('requires confirmation before deleting and supports cancel', async () => {
    const deleteDeck = vi.fn(async () => undefined)
    renderPage(repository({ listDecks: async () => [deck()], deleteDeck }))
    await screen.findByText('テストデッキ')

    fireEvent.click(screen.getByRole('button', { name: 'テストデッキを削除' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      '「テストデッキ」を削除しますか？',
    )
    expect(deleteDeck).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('deletes only after confirmation', async () => {
    const deleteDeck = vi.fn(async () => undefined)
    renderPage(repository({ listDecks: async () => [deck()], deleteDeck }))
    await screen.findByText('テストデッキ')

    fireEvent.click(screen.getByRole('button', { name: 'テストデッキを削除' }))
    fireEvent.click(screen.getByRole('button', { name: '削除する' }))

    await waitFor(() => expect(deleteDeck).toHaveBeenCalledWith('deck-1'))
    expect(screen.getByText('デッキがありません')).toBeVisible()
  })

  it('keeps the deck visible when deletion fails', async () => {
    renderPage(
      repository({
        listDecks: async () => [deck()],
        deleteDeck: async () => Promise.reject(new Error('blocked')),
      }),
    )
    await screen.findByText('テストデッキ')
    fireEvent.click(screen.getByRole('button', { name: 'テストデッキを削除' }))
    fireEvent.click(screen.getByRole('button', { name: '削除する' }))

    expect(
      await screen.findByText('デッキを削除できませんでした。'),
    ).toBeVisible()
    expect(screen.getByText('テストデッキ')).toBeVisible()
  })

  it('shows list errors and retries', async () => {
    const listDecks = vi
      .fn<() => Promise<Deck[]>>()
      .mockRejectedValueOnce(new Error('blocked'))
      .mockResolvedValueOnce([])
    renderPage(repository({ listDecks }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'デッキを読み込めませんでした。',
    )
    fireEvent.click(screen.getByRole('button', { name: '再試行' }))
    expect(await screen.findByText('デッキがありません')).toBeVisible()
    expect(listDecks).toHaveBeenCalledTimes(2)
  })
})
