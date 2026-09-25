import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { Card, CardsDataFile } from '../domain/cards/types'
import type { Deck } from '../domain/decks/types'
import type { DeckVersion } from '../domain/deckVersions/types'
import type { DeckRepository } from '../repositories/deckRepository'
import type { DeckVersionRepository } from '../repositories/deckVersionRepository'
import { DeckVersionsPage } from './DeckVersionsPage'

function card(cardNumber: string, name: string, overrides: Partial<Card> = {}) {
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
    searchText: name,
    ...overrides,
  } as Card
}

const cards = [
  card('CARD-001', '赤いカード'),
  card('CARD-002', '青いカード'),
  card('OSHI-001', '推しカード', { cardType: 'oshi' }),
  card('CHEER-001', '白エール', { cardType: 'cheer' }),
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

function deck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: 'deck-1',
    name: '現在のデッキ',
    entries: [{ cardNumber: 'CARD-001', quantity: 4 }],
    createdAt: '2026-09-20T00:00:00.000Z',
    updatedAt: '2026-09-24T00:00:00.000Z',
    ...overrides,
  }
}

function version(overrides: Partial<DeckVersion> = {}): DeckVersion {
  return {
    id: 'version-1',
    deckId: 'deck-1',
    label: '大会前',
    createdAt: '2026-09-22T02:30:00.000Z',
    snapshot: {
      name: '大会前のデッキ',
      entries: [
        { cardNumber: 'CARD-001', quantity: 2 },
        { cardNumber: 'OSHI-001', quantity: 1 },
        { cardNumber: 'CHEER-001', quantity: 3 },
      ],
    },
    ...overrides,
  }
}

function renderPage({
  stored = deck(),
  versions = [version()],
  saveDeck = vi.fn<(value: Deck) => Promise<void>>(async () => undefined),
  deleteVersion = vi.fn(async () => undefined),
}: {
  stored?: Deck | null
  versions?: DeckVersion[]
  saveDeck?: DeckRepository['saveDeck']
  deleteVersion?: DeckVersionRepository['deleteVersion']
} = {}) {
  const repository: DeckRepository = {
    listDecks: vi.fn(async () => (stored ? [stored] : [])),
    getDeck: vi.fn(async () => stored ?? undefined),
    saveDeck,
    deleteDeck: vi.fn(async () => undefined),
  }
  const deckVersions: DeckVersionRepository = {
    listAllVersions: vi.fn(async () => versions),
    listVersions: vi.fn(async () => versions),
    getVersion: vi.fn(async () => versions[0]),
    saveVersion: vi.fn(async () => undefined),
    createVersion: vi.fn(async () => version()),
    deleteVersion,
    deleteVersionsForDeck: vi.fn(async () => undefined),
  }

  render(
    <MemoryRouter initialEntries={['/decks/deck-1/versions']}>
      <Routes>
        <Route
          path="/decks/:deckId/versions"
          element={
            <DeckVersionsPage
              repository={repository}
              deckVersions={deckVersions}
              loadCards={vi.fn(async () => cardsData())}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  )
  return { repository, deckVersions, saveDeck, deleteVersion }
}

describe('the snapshots kept of a deck', () => {
  it('lists each one with when it was kept and what is in it', async () => {
    renderPage()

    expect(await screen.findByText('大会前')).toBeVisible()
    expect(screen.getByText(/保存 2026\/09\/22/)).toBeVisible()
    expect(
      await screen.findByText('推し 1枚・メイン 2枚・エール 3枚'),
    ).toBeVisible()
  })

  it('names the format each one was built for', async () => {
    renderPage({
      versions: [
        version({
          snapshot: {
            name: '大会前のデッキ',
            entries: [],
            regulationId: 'selection-cup-2026-autumn',
          },
        }),
      ],
    })

    expect(
      await screen.findByText(/セレクションカップ 2026年9-10月/),
    ).toBeVisible()
  })

  it('says so when there are none', async () => {
    renderPage({ versions: [] })

    expect(
      await screen.findByText(/保存されたバージョンはありません/),
    ).toBeVisible()
  })

  it('says so when the deck is gone', async () => {
    renderPage({ stored: null })

    expect(await screen.findByText('デッキが見つかりません。')).toBeVisible()
  })

  // Opening the list is not a decision about the deck.
  it('writes nothing merely by being opened', async () => {
    const { saveDeck, deckVersions } = renderPage()
    await screen.findByText('大会前')

    expect(saveDeck).not.toHaveBeenCalled()
    expect(deckVersions.createVersion).not.toHaveBeenCalled()
  })
})

describe('comparing a snapshot with the deck now', () => {
  it('shows what changed, using the existing comparison', async () => {
    renderPage()
    await screen.findByText('大会前')

    fireEvent.click(screen.getByRole('button', { name: '現在と比較' }))

    // The snapshot held two of this card; the deck now holds four.
    expect(await screen.findByText('赤いカード 2枚 → 4枚')).toBeVisible()
  })

  it('says when nothing differs', async () => {
    renderPage({
      versions: [
        version({
          snapshot: { name: '現在のデッキ', entries: deck().entries },
        }),
      ],
    })
    await screen.findByText('大会前')

    fireEvent.click(screen.getByRole('button', { name: '現在と比較' }))

    expect(
      await screen.findByText('現在のデッキと同じ内容です。'),
    ).toBeVisible()
  })
})

describe('putting a snapshot back', () => {
  const restore = async () => {
    await screen.findByText('大会前')
    fireEvent.click(
      screen.getByRole('button', { name: 'このバージョンを復元' }),
    )
  }

  // Restoring replaces what is in the editor, so it is asked for twice.
  it('asks before doing anything', async () => {
    const { saveDeck } = renderPage()

    await restore()

    expect(
      screen.getByRole('alertdialog', { name: 'バージョン復元の確認' }),
    ).toBeVisible()
    expect(saveDeck).not.toHaveBeenCalled()
  })

  it('can be abandoned', async () => {
    const { saveDeck } = renderPage()
    await restore()

    fireEvent.click(screen.getByRole('button', { name: 'やめる' }))

    expect(saveDeck).not.toHaveBeenCalled()
  })

  it('saves the snapshot into the deck it belongs to', async () => {
    const { saveDeck } = renderPage()
    await restore()

    fireEvent.click(screen.getByRole('button', { name: '復元する' }))

    await waitFor(() => expect(saveDeck).toHaveBeenCalledTimes(1))
    const saved = (saveDeck as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as Deck
    expect(saved.id).toBe('deck-1')
    expect(saved.createdAt).toBe('2026-09-20T00:00:00.000Z')
    expect(saved.name).toBe('大会前のデッキ')
    expect(saved.entries).toEqual(version().snapshot.entries)
    expect(saved.updatedAt).not.toBe('2026-09-24T00:00:00.000Z')
  })

  // Nobody asked for a record of the state being replaced.
  it('keeps no snapshot of what it replaced', async () => {
    const { deckVersions } = renderPage()
    await restore()

    fireEvent.click(screen.getByRole('button', { name: '復元する' }))

    await screen.findByText(/復元しました/)
    expect(deckVersions.createVersion).not.toHaveBeenCalled()
  })

  it('says so when it could not be saved', async () => {
    renderPage({
      saveDeck: vi.fn(async () => {
        throw new Error('quota')
      }),
    })
    await restore()

    fireEvent.click(screen.getByRole('button', { name: '復元する' }))

    expect(
      await screen.findByText('バージョンを復元できませんでした。'),
    ).toBeVisible()
  })
})

describe('removing a snapshot', () => {
  it('asks first, then removes only that one', async () => {
    const { deleteVersion } = renderPage()
    await screen.findByText('大会前')

    fireEvent.click(screen.getByRole('button', { name: '大会前を削除' }))
    expect(
      screen.getByRole('alertdialog', { name: 'バージョン削除の確認' }),
    ).toBeVisible()
    expect(deleteVersion).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '削除する' }))

    await waitFor(() => expect(deleteVersion).toHaveBeenCalledWith('version-1'))
  })

  it('leaves the deck alone', async () => {
    const { saveDeck } = renderPage()
    await screen.findByText('大会前')

    fireEvent.click(screen.getByRole('button', { name: '大会前を削除' }))
    fireEvent.click(screen.getByRole('button', { name: '削除する' }))

    await screen.findByText(/削除しました/)
    expect(saveDeck).not.toHaveBeenCalled()
  })
})
