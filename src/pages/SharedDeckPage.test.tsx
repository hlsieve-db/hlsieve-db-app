import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Card, CardsDataFile } from '../domain/cards/types'
import type { Deck } from '../domain/decks/types'
import { encodeDeckSharePayload } from '../domain/share/deckShareCodec'
import type { SharedDeckPayloadV1 } from '../domain/share/types'
import type { DeckRepository } from '../repositories/deckRepository'
import { SavedDecksPage } from './SavedDecksPage'
import { SharedDeckPage } from './SharedDeckPage'

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
  card('MAIN-001', '共有メイン', 'support', { deckLimit: null }),
  card('CHEER-001', '共有エール', 'cheer'),
  card('hBP01-030', 'IRyS', 'support'),
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
    name: '共有テストデッキ',
    entries: [
      { cardNumber: 'OSHI-001', quantity: 1 },
      { cardNumber: 'MAIN-001', quantity: 50 },
      { cardNumber: 'CHEER-001', quantity: 20 },
    ],
    ...overrides,
  }
}

function encode(value: SharedDeckPayloadV1): string {
  return encodeDeckSharePayload({
    id: 'source',
    name: value.name,
    entries: value.entries,
    createdAt: '2026-09-09T00:00:00.000Z',
    updatedAt: '2026-09-09T00:00:00.000Z',
  })
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

function renderPage({
  path = `/deck/share?d=${encode(payload())}`,
  deckRepository = repository(),
  loadCards = vi.fn(async () => cardsData()),
  createLocalDeck,
}: {
  path?: string
  deckRepository?: DeckRepository
  loadCards?: () => Promise<CardsDataFile>
  createLocalDeck?: (value: SharedDeckPayloadV1) => Deck
} = {}) {
  const result = render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/deck/share"
          element={
            <SharedDeckPage
              repository={deckRepository}
              loadCards={loadCards}
              createLocalDeck={createLocalDeck}
            />
          }
        />
        <Route path="/decks/:deckId" element={<p>Imported editor</p>} />
        <Route path="/decks" element={<p>Deck list</p>} />
        <Route path="/cards" element={<p>Cards destination</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return { ...result, deckRepository, loadCards }
}

function encodeRaw(value: object): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
}

afterEach(() => {
  document.title = 'HLSieve DB'
})

describe('SharedDeckPage preview', () => {
  it('loads current cards and renders a valid shared deck preview', async () => {
    const loadCards = vi.fn(async () => cardsData())
    renderPage({
      path: `/deck/share?extra=ignored&d=${encode(payload())}`,
      loadCards,
    })

    expect(
      screen.getByRole('heading', { name: '共有テストデッキ' }),
    ).toBeVisible()
    expect(screen.getByText('カードデータを読み込んでいます…')).toBeVisible()
    expect(await screen.findByText('使用可能')).toBeVisible()
    expect(screen.getByText('1 / 1')).toBeVisible()
    expect(screen.getByText('50 / 50')).toBeVisible()
    expect(screen.getByText('20 / 20')).toBeVisible()
    expect(screen.getByText('71 / 71')).toBeVisible()
    expect(screen.getByText('共有推し')).toBeVisible()
    expect(screen.getByText('共有メイン')).toBeVisible()
    expect(screen.getByText('共有エール')).toBeVisible()
    expect(
      screen.getByRole('heading', { name: '推しホロメン1枚' }),
    ).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'メインデッキ50枚' }),
    ).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'エールデッキ20枚' }),
    ).toBeVisible()
    expect(document.title).toBe('共有テストデッキ | HLSieve DB')
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex,follow',
    )
    expect(loadCards).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('link', { name: 'Cards' })).toHaveAttribute(
      'href',
      '/cards',
    )
  })

  it('does not load cards when d is missing or corrupt', () => {
    const missingLoader = vi.fn(async () => cardsData())
    const missing = renderPage({
      path: '/deck/share',
      loadCards: missingLoader,
    })
    expect(screen.getByText('共有デッキが指定されていません。')).toBeVisible()
    expect(missingLoader).not.toHaveBeenCalled()
    expect(document.title).toBe('共有デッキ | HLSieve DB')
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex,follow',
    )
    missing.unmount()

    const invalidLoader = vi.fn(async () => cardsData())
    renderPage({ path: '/deck/share?d=broken%25', loadCards: invalidLoader })
    expect(screen.getByRole('alert')).toHaveTextContent(
      '壊れた共有データのため開けません。',
    )
    expect(invalidLoader).not.toHaveBeenCalled()
  })

  it('shows unsupported-version and size errors without raw data', () => {
    const unsupported = renderPage({
      path: `/deck/share?d=${encodeRaw({ v: 2, name: 'x', entries: [] })}`,
    })
    expect(screen.getByRole('alert')).toHaveTextContent(
      '対応していないversionの共有デッキです。',
    )
    unsupported.unmount()

    renderPage({ path: `/deck/share?d=${'A'.repeat(16_385)}` })
    expect(screen.getByRole('alert')).toHaveTextContent(
      '共有データがサイズ上限を超えています。',
    )
  })

  it('keeps unknown entries, warns, and marks legality invalid', async () => {
    renderPage({
      path: `/deck/share?d=${encode(
        payload({
          entries: [
            { cardNumber: 'OSHI-001', quantity: 1 },
            { cardNumber: 'MAIN-001', quantity: 49 },
            { cardNumber: 'UNKNOWN-001', quantity: 1 },
            { cardNumber: 'CHEER-001', quantity: 20 },
          ],
        }),
      )}`,
    })

    expect(await screen.findByText('ルール違反あり')).toBeVisible()
    expect(screen.getAllByText('UNKNOWN-001').length).toBeGreaterThanOrEqual(1)
    expect(
      screen.getByText('現在のカードデータに存在しないカードです'),
    ).toBeVisible()
    expect(screen.getByText(/現在のカードデータに存在しません/)).toBeVisible()
  })

  it('applies the current restricted-card rules', async () => {
    renderPage({
      path: `/deck/share?d=${encode(
        payload({
          entries: [
            { cardNumber: 'OSHI-001', quantity: 1 },
            { cardNumber: 'hBP01-030', quantity: 2 },
            { cardNumber: 'MAIN-001', quantity: 48 },
            { cardNumber: 'CHEER-001', quantity: 20 },
          ],
        }),
      )}`,
    })
    expect(await screen.findByText('ルール違反あり')).toBeVisible()
    expect(screen.getByText(/IRySは制限カードのため1枚まで/)).toBeVisible()
  })

  it('shows card loading errors and retries', async () => {
    const loadCards = vi
      .fn<() => Promise<CardsDataFile>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(cardsData())
    renderPage({ loadCards })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('カードデータを読み込めませんでした。')
    fireEvent.click(within(alert).getByRole('button', { name: '再試行' }))
    expect(await screen.findByText('共有メイン')).toBeVisible()
    expect(loadCards).toHaveBeenCalledTimes(2)
  })
})

describe('SharedDeckPage import', () => {
  it('requires an explicit action and presents the import after the preview', async () => {
    const saveDeck = vi.fn(async () => undefined)
    renderPage({ deckRepository: repository({ saveDeck }) })

    const entries = await screen.findByRole('heading', { name: 'カード構成' })
    const importButton = screen.getByRole('button', {
      name: '自分のデッキに追加',
    })
    expect(saveDeck).not.toHaveBeenCalled()
    expect(
      entries.compareDocumentPosition(importButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(importButton).toHaveClass('button')
  })

  it('saves a fresh deck and redirects to its editor', async () => {
    const saveDeck = vi.fn(async () => undefined)
    const createLocalDeck = vi.fn((): Deck => ({
      id: 'new-deck-id',
      name: '共有テストデッキ',
      entries: payload().entries.map((entry) => ({ ...entry })),
      createdAt: '2026-09-09T11:00:00.000Z',
      updatedAt: '2026-09-09T11:00:00.000Z',
    }))
    renderPage({ deckRepository: repository({ saveDeck }), createLocalDeck })

    fireEvent.click(
      await screen.findByRole('button', { name: '自分のデッキに追加' }),
    )
    expect(await screen.findByText('Imported editor')).toBeVisible()
    expect(createLocalDeck).toHaveBeenCalledWith(payload())
    expect(saveDeck).toHaveBeenCalledWith({
      id: 'new-deck-id',
      name: '共有テストデッキ',
      entries: payload().entries,
      createdAt: '2026-09-09T11:00:00.000Z',
      updatedAt: '2026-09-09T11:00:00.000Z',
    })
  })

  it('creates a different local deck for each import of the same URL', async () => {
    let sequence = 0
    const createdIds: string[] = []
    const createLocalDeck = (): Deck => {
      const id = `new-${++sequence}`
      createdIds.push(id)
      return {
        id,
        name: payload().name,
        entries: payload().entries,
        createdAt: '2026-09-09T11:00:00.000Z',
        updatedAt: '2026-09-09T11:00:00.000Z',
      }
    }

    for (let importNumber = 0; importNumber < 2; importNumber += 1) {
      const page = renderPage({ createLocalDeck })
      fireEvent.click(
        await screen.findByRole('button', { name: '自分のデッキに追加' }),
      )
      await screen.findByText('Imported editor')
      page.unmount()
    }
    expect(createdIds).toEqual(['new-1', 'new-2'])
  })

  it('keeps the preview after a save error and retries the same deck', async () => {
    const saveDeck = vi
      .fn<(deck: Deck) => Promise<void>>()
      .mockRejectedValueOnce(new Error('quota'))
      .mockResolvedValueOnce(undefined)
    const created = {
      id: 'retry-id',
      name: payload().name,
      entries: payload().entries,
      createdAt: '2026-09-09T11:00:00.000Z',
      updatedAt: '2026-09-09T11:00:00.000Z',
    }
    const createLocalDeck = vi.fn(() => created)
    renderPage({ deckRepository: repository({ saveDeck }), createLocalDeck })

    const save = await screen.findByRole('button', {
      name: '自分のデッキに追加',
    })
    fireEvent.click(save)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'デッキを保存できませんでした。',
    )
    expect(screen.getByText('共有メイン')).toBeVisible()
    fireEvent.click(save)
    expect(await screen.findByText('Imported editor')).toBeVisible()
    expect(createLocalDeck).toHaveBeenCalledTimes(1)
    expect(saveDeck).toHaveBeenCalledTimes(2)
    expect(saveDeck.mock.calls[0]?.[0]).toBe(saveDeck.mock.calls[1]?.[0])
  })

  it('preserves unknown entries when importing', async () => {
    const saveDeck = vi.fn(async () => undefined)
    const sharedPayload = payload({
      entries: [{ cardNumber: 'UNKNOWN-001', quantity: 3 }],
    })
    renderPage({
      path: `/deck/share?d=${encode(sharedPayload)}`,
      deckRepository: repository({ saveDeck }),
    })

    expect(
      await screen.findByRole('heading', { name: '未確認カード3枚' }),
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '自分のデッキに追加' }))
    await screen.findByText('Imported editor')
    expect(saveDeck).toHaveBeenCalledWith(
      expect.objectContaining({ entries: sharedPayload.entries }),
    )
  })

  it('keeps an existing same-name deck and adds a separately identified deck', async () => {
    const existing = {
      id: 'existing-id',
      name: payload().name,
      entries: [{ cardNumber: 'MAIN-001', quantity: 1 }],
      createdAt: '2026-09-08T00:00:00.000Z',
      updatedAt: '2026-09-08T00:00:00.000Z',
    }
    const records = new Map<string, Deck>([[existing.id, existing]])
    const deckRepository = repository({
      listDecks: vi.fn(async () => [...records.values()]),
      getDeck: vi.fn(async (id) => records.get(id)),
      saveDeck: vi.fn(async (deck) => {
        records.set(deck.id, deck)
      }),
    })
    const imported: Deck = {
      id: 'imported-id',
      name: payload().name,
      entries: payload().entries.map((entry) => ({ ...entry })),
      createdAt: '2026-09-09T11:00:00.000Z',
      updatedAt: '2026-09-09T11:00:00.000Z',
    }
    const page = renderPage({
      deckRepository,
      createLocalDeck: () => imported,
    })

    fireEvent.click(
      await screen.findByRole('button', { name: '自分のデッキに追加' }),
    )
    await screen.findByText('Imported editor')
    page.unmount()

    expect(await deckRepository.listDecks()).toEqual([existing, imported])
    expect(await deckRepository.getDeck(existing.id)).toBe(existing)
    expect(await deckRepository.getDeck(imported.id)).toBe(imported)

    render(
      <MemoryRouter initialEntries={['/decks']}>
        <SavedDecksPage repository={deckRepository} />
      </MemoryRouter>,
    )
    expect(
      await screen.findAllByRole('heading', { name: payload().name }),
    ).toHaveLength(2)
  })
})
