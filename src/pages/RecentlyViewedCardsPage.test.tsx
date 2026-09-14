import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { Card, CardsDataFile } from '../domain/cards/types'
import type { RecentlyViewedCard } from '../domain/recentlyViewed/types'
import type { RecentlyViewedCardRepository } from '../repositories/recentlyViewedCardRepository'
import { RecentlyViewedCardsPage } from './RecentlyViewedCardsPage'

function card(cardNumber: string, name: string): Card {
  return {
    cardNumber,
    name,
    cardType: 'holomem',
    colors: ['red'],
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
    searchText: name,
  }
}

const cardsData: CardsDataFile = {
  format: 'holocard-cards',
  formatVersion: 1,
  dataVersion: `sha256:${'0'.repeat(64)}`,
  generatedAt: '2026-09-15T00:00:00.000Z',
  cards: [card('A', 'カードA'), card('B', 'カードB')],
}

function memoryRepository(
  initial: RecentlyViewedCard[] = [],
): RecentlyViewedCardRepository {
  let records = [...initial]
  return {
    list: vi.fn(async () => records),
    recordView: vi.fn(async (cardNumber) => ({
      cardNumber,
      viewedAt: '2026-09-15T00:00:00.000Z',
    })),
    remove: vi.fn(async (cardNumber) => {
      records = records.filter((record) => record.cardNumber !== cardNumber)
    }),
    clear: vi.fn(async () => {
      records = []
    }),
  }
}

function renderPage(
  repository = memoryRepository(),
  loadCards: () => Promise<CardsDataFile> = async () => cardsData,
) {
  render(
    <MemoryRouter initialEntries={['/recent']}>
      <RecentlyViewedCardsPage repository={repository} loadCards={loadCards} />
    </MemoryRouter>,
  )
  return repository
}

describe('RecentlyViewedCardsPage', () => {
  it('shows loading, privacy copy, and a useful empty state', async () => {
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent(
      '最近見たカードを読み込んでいます…',
    )
    expect(
      screen.getByText('最近見たカードはこのブラウザ内に保存されます。'),
    ).toBeVisible()
    expect(
      await screen.findByText('最近見たカードはありません。'),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'カードを探す' })).toHaveAttribute(
      'href',
      '/cards',
    )
  })

  it('renders latest-first records with current card data and accessible links', async () => {
    renderPage(
      memoryRepository([
        { cardNumber: 'B', viewedAt: '2026-09-15T01:02:00.000Z' },
        { cardNumber: 'A', viewedAt: '2026-09-15T00:01:00.000Z' },
      ]),
    )
    const list = await screen.findByRole('region', {
      name: '最近見たカード一覧',
    })
    expect(
      within(list)
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(['カードB', 'カードA'])
    expect(screen.getByRole('link', { name: 'カードB' })).toHaveAttribute(
      'href',
      '/cards/B',
    )
    expect(screen.getAllByText('赤 / ホロメン')).toHaveLength(2)
    expect(screen.getAllByRole('time')[0]).toHaveAttribute(
      'datetime',
      '2026-09-15T01:02:00.000Z',
    )
    expect(screen.getAllByRole('img')).toHaveLength(2)
  })

  it('keeps an unknown card visible without a detail link and allows removal', async () => {
    const repository = renderPage(
      memoryRepository([
        { cardNumber: 'UNKNOWN', viewedAt: '2026-09-15T00:00:00.000Z' },
      ]),
    )
    expect(
      await screen.findByText('現在のカード一覧では見つかりません'),
    ).toBeVisible()
    expect(
      screen.queryByRole('link', { name: 'UNKNOWN' }),
    ).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', {
        name: 'UNKNOWNを最近見たカードから削除',
      }),
    )
    expect(
      await screen.findByText('最近見たカードはありません。'),
    ).toBeVisible()
    expect(repository.remove).toHaveBeenCalledWith('UNKNOWN')
  })

  it('confirms, cancels, and completes clear all', async () => {
    const repository = renderPage(
      memoryRepository([
        { cardNumber: 'A', viewedAt: '2026-09-15T00:00:00.000Z' },
      ]),
    )
    fireEvent.click(
      await screen.findByRole('button', {
        name: '最近見たカードの履歴をすべて削除',
      }),
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent(
      '最近見たカードの履歴をすべて削除しますか？',
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'キャンセル' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: '最近見たカードの履歴をすべて削除',
      }),
    )
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'すべて削除',
      }),
    )
    expect(
      await screen.findByText('最近見たカードはありません。'),
    ).toBeVisible()
    expect(repository.clear).toHaveBeenCalledTimes(1)
  })

  it('shows load and mutation errors with alert semantics', async () => {
    const { unmount } = render(
      <MemoryRouter>
        <RecentlyViewedCardsPage
          repository={memoryRepository()}
          loadCards={async () => {
            throw new Error('offline')
          }}
        />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '最近見たカードを読み込めませんでした。',
    )
    unmount()

    const repository = memoryRepository([
      { cardNumber: 'A', viewedAt: '2026-09-15T00:00:00.000Z' },
    ])
    vi.mocked(repository.remove).mockRejectedValueOnce(new Error('failed'))
    renderPage(repository)
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'カードAを最近見たカードから削除',
      }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '最近見たカードから削除できませんでした。',
    )
  })
})
