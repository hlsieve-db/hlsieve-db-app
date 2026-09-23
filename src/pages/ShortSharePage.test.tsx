import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Card, CardsDataFile } from '../domain/cards/types'
import type { Deck } from '../domain/decks/types'
import type { SharedDeckPayloadV1 } from '../domain/share/types'
import type { DeckBackupRepository } from '../repositories/deckRepository'
import type {
  DeckShareSource,
  ShortShareLoadResult,
} from '../share/deckShareSource'
import { ShortSharePage } from './ShortSharePage'

function card(
  cardNumber: string,
  name: string,
  cardType: Card['cardType'],
  overrides: Partial<Card> = {},
): Card {
  return {
    cardNumber,
    name,
    imageUrl: `https://example.test/${cardNumber}.png`,
    cardType,
    colors: ['white'],
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
    searchText: `${cardNumber} ${name}`,
    ...overrides,
  }
}

const cards = [
  card('OSHI-001', '共有推し', 'oshi'),
  card('MAIN-001', '共有メイン', 'support', {
    deckLimit: null,
    supportSearchCategory: 'general',
  }),
  card('CHEER-001', '共有エール', 'cheer'),
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

function payload(
  overrides: Partial<SharedDeckPayloadV1> = {},
): SharedDeckPayloadV1 {
  return {
    v: 1,
    name: '短縮共有デッキ',
    entries: [
      { cardNumber: 'OSHI-001', quantity: 1 },
      { cardNumber: 'MAIN-001', quantity: 50 },
      { cardNumber: 'CHEER-001', quantity: 20 },
    ],
    ...overrides,
  }
}

function repository(
  overrides: Partial<DeckBackupRepository> = {},
): DeckBackupRepository {
  return {
    listDecks: vi.fn(async () => []),
    getDeck: vi.fn(async () => undefined),
    saveDeck: vi.fn(async () => undefined),
    deleteDeck: vi.fn(async () => undefined),
    importDecks: vi.fn(async () => undefined),
    ...overrides,
  }
}

function shareSource(
  loadShare: (id: string) => Promise<ShortShareLoadResult>,
): DeckShareSource {
  return {
    createShare: vi.fn(async () => ({
      ok: true as const,
      shareId: 'AAAAAAAA',
    })),
    loadShare: vi.fn(loadShare),
  }
}

function renderPage({
  path = '/s/Ab3xK9pQ',
  source = shareSource(async () => ({ ok: true, payload: payload() })),
  deckRepository = repository(),
  loadCards = vi.fn(async () => cardsData()),
}: {
  path?: string
  source?: DeckShareSource | null
  deckRepository?: DeckBackupRepository
  loadCards?: () => Promise<CardsDataFile>
} = {}) {
  const result = render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/s/:shareId"
          element={
            <ShortSharePage
              shareSource={source}
              repository={deckRepository}
              loadCards={loadCards}
            />
          }
        />
        <Route path="/decks/:deckId" element={<p>Imported editor</p>} />
        <Route path="/decks" element={<p>Deck list</p>} />
        <Route path="/cards" element={<p>Cards destination</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return { ...result, source, deckRepository, loadCards }
}

afterEach(() => {
  document.title = 'HLSieve DB'
})

describe('short share preview', () => {
  it('fetches the snapshot for the id in the path and previews it', async () => {
    const { source } = renderPage()

    expect(
      await screen.findByRole('heading', { name: '短縮共有デッキ' }),
    ).toBeVisible()
    expect(source?.loadShare).toHaveBeenCalledWith('Ab3xK9pQ')
    expect(await screen.findByText('共有推し')).toBeVisible()
  })

  it('reuses the shared preview, not a second deck viewer', async () => {
    renderPage()

    // The same markup the long share URL renders.
    expect(await screen.findByText('共有デッキのプレビュー')).toBeVisible()
    expect(
      await screen.findByRole('heading', { name: 'カード構成' }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: '自分のデッキに追加' }),
    ).toBeVisible()
  })

  it('imports into a local deck, as the long link does', async () => {
    const saveDeck = vi.fn<(deck: Deck) => Promise<void>>(async () => undefined)
    renderPage({ deckRepository: repository({ saveDeck }) })

    fireEvent.click(
      await screen.findByRole('button', { name: '自分のデッキに追加' }),
    )

    await waitFor(() => expect(saveDeck).toHaveBeenCalledTimes(1))
    const saved = saveDeck.mock.calls[0][0]
    expect(saved.name).toBe('短縮共有デッキ')
    // A fresh local deck, not the shared preview placeholder.
    expect(saved.id).not.toBe('shared-preview')
    expect(await screen.findByText('Imported editor')).toBeVisible()
  })

  it('is noindex and carries the deck name in the title', async () => {
    renderPage()
    await screen.findByRole('heading', { name: '短縮共有デッキ' })

    // The title is what is under test and an effect writes it, so it is what
    // the test waits for. The heading above only proves the render committed.
    await waitFor(() =>
      expect(document.title).toBe('短縮共有デッキ | HLSieve DB'),
    )
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex,follow',
    )
  })

  // User generated content has no original to point at, and each id is its
  // own page.
  it('declares no canonical url', async () => {
    renderPage()
    await screen.findByRole('heading', { name: '短縮共有デッキ' })

    // Waiting for the title first, because an absent canonical link is also
    // what the page looks like before the metadata effect has run at all.
    await waitFor(() =>
      expect(document.title).toBe('短縮共有デッキ | HLSieve DB'),
    )
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull()
  })
})

describe('short share failures', () => {
  it('says the deck was not found for an unknown id', async () => {
    renderPage({
      source: shareSource(async () => ({ ok: false, reason: 'not-found' })),
    })

    expect(await screen.findByText(/共有デッキが見つかりません/)).toBeVisible()
    expect(
      screen.queryByRole('button', { name: '再試行' }),
    ).not.toBeInTheDocument()
  })

  it('says the same for a malformed id, without asking the server', async () => {
    const source = shareSource(async () => ({
      ok: false,
      reason: 'invalid-id',
    }))
    renderPage({ path: '/s/not-an-id', source })

    expect(await screen.findByText(/共有デッキが見つかりません/)).toBeVisible()
  })

  it('says the deck could not be read when the snapshot is malformed', async () => {
    renderPage({
      source: shareSource(async () => ({ ok: false, reason: 'malformed' })),
    })

    expect(
      await screen.findByText('共有デッキを読み込めませんでした。'),
    ).toBeVisible()
    // Retrying cannot repair a broken row.
    expect(
      screen.queryByRole('button', { name: '再試行' }),
    ).not.toBeInTheDocument()
  })

  it('offers a retry after a network failure, and recovers', async () => {
    const loadShare = vi
      .fn<(id: string) => Promise<ShortShareLoadResult>>()
      .mockResolvedValueOnce({ ok: false, reason: 'failed' })
      .mockResolvedValueOnce({ ok: true, payload: payload() })
    renderPage({ source: { createShare: vi.fn(), loadShare } as never })

    fireEvent.click(await screen.findByRole('button', { name: '再試行' }))

    expect(
      await screen.findByRole('heading', { name: '短縮共有デッキ' }),
    ).toBeVisible()
    expect(loadShare).toHaveBeenCalledTimes(2)
  })

  it('says short links are unavailable when Supabase is not configured', async () => {
    renderPage({ source: null })

    expect(
      await screen.findByText(/短い共有リンクは、この環境では利用できません/),
    ).toBeVisible()
  })

  // Nothing the database says should reach the page.
  it('shows no raw database detail in any failure', async () => {
    renderPage({
      source: shareSource(async () => ({ ok: false, reason: 'failed' })),
    })
    await screen.findByText('共有デッキを読み込めませんでした。')

    const text = document.body.textContent ?? ''
    ;['PGRST', 'supabase', 'SQLSTATE', '22023', 'permission denied'].forEach(
      (fragment) => expect(text).not.toContain(fragment),
    )
  })
})
