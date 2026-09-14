import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { FavoriteCardsProvider } from '../contexts/FavoriteCardsContext'
import type { Card, CardsDataFile } from '../domain/cards/types'
import type { FavoriteCard } from '../domain/favorites/types'
import type { DeckRepository } from '../repositories/deckRepository'
import type { FavoriteCardRepository } from '../repositories/favoriteCardRepository'
import { CardDetailPage } from './CardDetailPage'
import { CardSearchPage } from './CardSearchPage'
import { FavoriteCardsPage } from './FavoriteCardsPage'

function card(cardNumber: string, name: string): Card {
  return {
    cardNumber,
    name,
    cardType: 'holomem',
    colors: ['red'],
    bloomLevel: 'first',
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
    imageUrl: `https://example.com/${cardNumber}.png`,
    searchText: `${cardNumber} ${name}`,
  }
}

const cards = [card('CARD-A', 'カードA'), card('CARD-B', 'カードB')]
const cardsData: CardsDataFile = {
  format: 'holocard-cards',
  formatVersion: 1,
  dataVersion: `sha256:${'0'.repeat(64)}`,
  generatedAt: '2026-09-14T00:00:00.000Z',
  cards,
}

function memoryFavoriteRepository(
  initial: FavoriteCard[] = [],
): FavoriteCardRepository {
  const values = new Map(
    initial.map((favorite) => [favorite.cardNumber, favorite]),
  )
  let tick = initial.length
  return {
    listFavorites: vi.fn(async () =>
      [...values.values()].sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) ||
          left.cardNumber.localeCompare(right.cardNumber, 'en'),
      ),
    ),
    getFavorite: vi.fn(async (cardNumber) => values.get(cardNumber)),
    addFavorite: vi.fn(async (cardNumber) => {
      const existing = values.get(cardNumber)
      if (existing) return existing
      const favorite = {
        cardNumber,
        createdAt: `2026-09-${String(14 + tick++).padStart(2, '0')}T00:00:00.000Z`,
      }
      values.set(cardNumber, favorite)
      return favorite
    }),
    removeFavorite: vi.fn(async (cardNumber) => {
      values.delete(cardNumber)
    }),
  }
}

const emptyDeckRepository: DeckRepository = {
  listDecks: vi.fn(async () => []),
  getDeck: vi.fn(async () => undefined),
  saveDeck: vi.fn(async () => undefined),
  deleteDeck: vi.fn(async () => undefined),
}

function renderFavorites(repository = memoryFavoriteRepository()) {
  render(
    <MemoryRouter initialEntries={['/favorites']}>
      <FavoriteCardsProvider repository={repository}>
        <FavoriteCardsPage loadCards={async () => cardsData} />
      </FavoriteCardsProvider>
    </MemoryRouter>,
  )
  return repository
}

describe('FavoriteCardsPage', () => {
  it('shows an empty state and card-search route', async () => {
    renderFavorites()
    expect(
      await screen.findByText('お気に入りカードはありません。'),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'カードを探す' })).toHaveAttribute(
      'href',
      '/cards',
    )
  })

  it('renders current card data in newest-first order and links logical detail', async () => {
    renderFavorites(
      memoryFavoriteRepository([
        { cardNumber: 'CARD-A', createdAt: '2026-09-14T00:00:00.000Z' },
        { cardNumber: 'CARD-B', createdAt: '2026-09-15T00:00:00.000Z' },
      ]),
    )
    const list = await screen.findByRole('region', {
      name: 'お気に入りカード一覧',
    })
    const headings = within(list).getAllByRole('heading', { level: 2 })
    expect(headings.map((heading) => heading.textContent)).toEqual([
      'カードB',
      'カードA',
    ])
    expect(screen.getByRole('link', { name: 'カードB' })).toHaveAttribute(
      'href',
      '/cards/CARD-B',
    )
    expect(screen.getAllByText('赤 / ホロメン')).toHaveLength(2)
  })

  it('keeps unknown records visible and removable', async () => {
    const repository = renderFavorites(
      memoryFavoriteRepository([
        { cardNumber: 'REMOVED-001', createdAt: '2026-09-15T00:00:00.000Z' },
      ]),
    )
    expect(
      await screen.findByText('現在のカード一覧では見つかりません'),
    ).toBeVisible()
    expect(screen.getByText('REMOVED-001')).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', {
        name: 'REMOVED-001をお気に入りから削除',
      }),
    )
    expect(
      await screen.findByText('お気に入りカードはありません。'),
    ).toBeVisible()
    expect(repository.removeFavorite).toHaveBeenCalledWith('REMOVED-001')
  })

  it('removes a favorite immediately and persists the change', async () => {
    const repository = renderFavorites(
      memoryFavoriteRepository([
        { cardNumber: 'CARD-A', createdAt: '2026-09-14T00:00:00.000Z' },
      ]),
    )
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'カードAをお気に入りから削除',
      }),
    )
    expect(
      await screen.findByText('お気に入りカードはありません。'),
    ).toBeVisible()
    expect(repository.removeFavorite).toHaveBeenCalledWith('CARD-A')
  })

  it('reports repository load and mutation failures', async () => {
    const loadFailure = memoryFavoriteRepository()
    vi.mocked(loadFailure.listFavorites).mockRejectedValue(new Error('failed'))
    const { unmount } = render(
      <MemoryRouter>
        <FavoriteCardsProvider repository={loadFailure}>
          <FavoriteCardsPage loadCards={async () => cardsData} />
        </FavoriteCardsProvider>
      </MemoryRouter>,
    )
    expect(
      await screen.findByText('お気に入りを読み込めませんでした。'),
    ).toBeVisible()
    unmount()

    const saveFailure = memoryFavoriteRepository([
      { cardNumber: 'CARD-A', createdAt: '2026-09-14T00:00:00.000Z' },
    ])
    vi.mocked(saveFailure.removeFavorite).mockRejectedValue(new Error('failed'))
    renderFavorites(saveFailure)
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'カードAをお気に入りから削除',
      }),
    )
    expect(
      await screen.findByText('お気に入りを保存できませんでした。'),
    ).toBeVisible()
    expect(screen.getByRole('heading', { name: 'カードA' })).toBeVisible()
  })
})

describe('favorite Card cross-page integration', () => {
  it('does not show an incorrect star while favorite state is loading', async () => {
    const repository = memoryFavoriteRepository()
    vi.mocked(repository.listFavorites).mockImplementation(
      () => new Promise(() => undefined),
    )
    render(
      <MemoryRouter initialEntries={['/cards']}>
        <FavoriteCardsProvider repository={repository}>
          <CardSearchPage
            loadCards={async () => cardsData}
            repository={emptyDeckRepository}
          />
        </FavoriteCardsProvider>
      </MemoryRouter>,
    )
    const button = await screen.findByRole('button', {
      name: 'カードAのお気に入り状態を確認中',
    })
    expect(button).toBeDisabled()
    expect(button).not.toHaveAttribute('aria-pressed')
    expect(button).toHaveTextContent('確認中')
  })

  it('loads favorites once, syncs Search and Detail, and persists add/remove', async () => {
    const repository = memoryFavoriteRepository()
    render(
      <MemoryRouter initialEntries={['/cards']}>
        <FavoriteCardsProvider repository={repository}>
          <Routes>
            <Route
              path="/cards"
              element={
                <CardSearchPage
                  loadCards={async () => cardsData}
                  repository={emptyDeckRepository}
                />
              }
            />
            <Route
              path="/cards/:cardNumber"
              element={
                <CardDetailPage
                  loadCards={async () => cardsData}
                  loadPrintings={() => new Promise(() => undefined)}
                  repository={emptyDeckRepository}
                />
              }
            />
            <Route
              path="/favorites"
              element={<FavoriteCardsPage loadCards={async () => cardsData} />}
            />
          </Routes>
        </FavoriteCardsProvider>
      </MemoryRouter>,
    )

    const add = await screen.findByRole('button', {
      name: 'カードAをお気に入りに追加',
    })
    expect(repository.listFavorites).toHaveBeenCalledTimes(1)
    expect(add).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(add)
    expect(
      await screen.findByRole('button', {
        name: 'カードAをお気に入りから削除',
      }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(repository.addFavorite).toHaveBeenCalledWith('CARD-A')

    fireEvent.click(screen.getByRole('link', { name: 'カードA' }))
    expect(
      await screen.findByRole('button', {
        name: 'カードAをお気に入りから削除',
      }),
    ).toBeVisible()
    expect(repository.listFavorites).toHaveBeenCalledTimes(1)
    fireEvent.click(
      screen.getByRole('button', {
        name: 'カードAをお気に入りから削除',
      }),
    )
    await waitFor(() =>
      expect(repository.removeFavorite).toHaveBeenCalledWith('CARD-A'),
    )
    expect(
      await screen.findByRole('button', { name: 'カードAをお気に入りに追加' }),
    ).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps logical favorite state unchanged when switching printings', async () => {
    const repository = memoryFavoriteRepository([
      { cardNumber: 'CARD-A', createdAt: '2026-09-14T00:00:00.000Z' },
    ])
    render(
      <MemoryRouter initialEntries={['/cards/CARD-A']}>
        <FavoriteCardsProvider repository={repository}>
          <Routes>
            <Route
              path="/cards/:cardNumber"
              element={
                <CardDetailPage
                  loadCards={async () => cardsData}
                  loadPrintings={async () => ({
                    format: 'hlsieve-card-printings',
                    formatVersion: 1,
                    cardsDataVersion: cardsData.dataVersion,
                    dataVersion: `sha256:${'1'.repeat(64)}`,
                    cards: {
                      'CARD-A': {
                        defaultPrintingOfficialId: '10',
                        printings: [
                          {
                            officialId: '10',
                            officialUrl: 'https://example.com/10',
                            isParallel: false,
                            products: [],
                          },
                          {
                            officialId: '20',
                            officialUrl: 'https://example.com/20',
                            isParallel: true,
                            products: [],
                          },
                        ],
                      },
                    },
                  })}
                  repository={emptyDeckRepository}
                />
              }
            />
          </Routes>
        </FavoriteCardsProvider>
      </MemoryRouter>,
    )

    const favorite = await screen.findByRole('button', {
      name: 'カードAをお気に入りから削除',
    })
    fireEvent.click(
      await screen.findByRole('button', { name: 'カードA パラレル 版 20' }),
    )
    expect(favorite).toHaveAttribute('aria-pressed', 'true')
    expect(repository.addFavorite).not.toHaveBeenCalled()
    expect(repository.removeFavorite).not.toHaveBeenCalled()
  })
})
