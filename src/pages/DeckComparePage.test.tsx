import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { Card, CardsDataFile } from '../domain/cards/types'
import type { Deck } from '../domain/decks/types'
import type { DeckRepository } from '../repositories/deckRepository'
import { DeckComparePage } from './DeckComparePage'

function card(cardNumber: string, overrides: Partial<Card> = {}): Card {
  return {
    cardNumber,
    name: cardNumber,
    cardType: 'holomem',
    colors: ['red'],
    bloomLevel: 'debut',
    debutType: 'normal',
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
    searchText: cardNumber.toLowerCase(),
    ...overrides,
  }
}

const cards = [
  card('OSHI-A', { cardType: 'oshi', name: '推しA' }),
  card('OSHI-B', { cardType: 'oshi', name: '推しB', colors: ['blue'] }),
  card('MAIN-A', { name: '共通カード' }),
  card('MAIN-B', { name: '追加カード', colors: ['red', 'blue'] }),
  card('BUZZ', { name: 'Buzzカード', isBuzz: true, bloomLevel: 'first' }),
  card('CHEER-R', { cardType: 'cheer', colors: ['red'] }),
  card('CHEER-B', { cardType: 'cheer', colors: ['blue'] }),
  card('hBP01-030', { name: 'IRyS', bloomLevel: 'first' }),
]

function cardsData(): CardsDataFile {
  return {
    format: 'holocard-cards',
    formatVersion: 1,
    dataVersion: `sha256:${'0'.repeat(64)}`,
    generatedAt: '2026-09-14T00:00:00.000Z',
    cards,
  }
}

function deck(id: string, name: string, entries: Deck['entries'] = []): Deck {
  return {
    id,
    name,
    entries,
    createdAt: '2026-09-14T00:00:00.000Z',
    updatedAt: '2026-09-14T00:00:00.000Z',
  }
}

function repository(decks: Deck[] | Promise<Deck[]>): DeckRepository {
  return {
    listDecks: vi.fn(async () => await decks),
    getDeck: vi.fn(async () => undefined),
    saveDeck: vi.fn(async () => undefined),
    deleteDeck: vi.fn(async () => undefined),
  }
}

function renderPage({
  decks = [],
  loadCards = async () => cardsData(),
}: {
  decks?: Deck[] | Promise<Deck[]>
  loadCards?: () => Promise<CardsDataFile>
} = {}) {
  render(
    <MemoryRouter initialEntries={['/deck-compare']}>
      <DeckComparePage repository={repository(decks)} loadCards={loadCards} />
    </MemoryRouter>,
  )
}

const before = deck('A', 'Deck A 長い名前', [
  { cardNumber: 'OSHI-A', quantity: 1 },
  { cardNumber: 'MAIN-A', quantity: 2 },
  { cardNumber: 'BUZZ', quantity: 1 },
  { cardNumber: 'hBP01-030', quantity: 1 },
  { cardNumber: 'CHEER-R', quantity: 2 },
  { cardNumber: 'UNKNOWN', quantity: 1 },
])
const after = deck('B', 'Deck B 長い名前', [
  { cardNumber: 'OSHI-B', quantity: 1 },
  { cardNumber: 'MAIN-A', quantity: 4 },
  { cardNumber: 'MAIN-B', quantity: 3 },
  { cardNumber: 'hBP01-030', quantity: 2 },
  { cardNumber: 'CHEER-B', quantity: 2 },
])

describe('DeckComparePage', () => {
  it('shows loading and zero Deck states distinctly', async () => {
    let resolveDecks!: (decks: Deck[]) => void
    const decks = new Promise<Deck[]>((resolve) => {
      resolveDecks = resolve
    })
    renderPage({ decks })
    expect(screen.getByText('デッキを読み込んでいます…')).toBeVisible()
    resolveDecks([])
    expect(
      await screen.findByRole('heading', {
        name: '保存されたデッキがありません。',
      }),
    ).toBeVisible()
  })

  it('explains that one saved Deck is insufficient', async () => {
    renderPage({ decks: [before] })
    expect(
      await screen.findByRole('heading', {
        name: '比較には2つのデッキが必要です。',
      }),
    ).toBeVisible()
  })

  it('loads with explicit A/B placeholders and accessible labels', async () => {
    renderPage({ decks: [before, after] })
    const beforeSelect = await screen.findByLabelText('比較元デッキ（Deck A）')
    const afterSelect = screen.getByLabelText('比較先デッキ（Deck B）')
    expect(beforeSelect).toHaveValue('')
    expect(afterSelect).toHaveValue('')
    expect(screen.getByText('Deck AとDeck Bを選択してください。')).toBeVisible()
  })

  it('renders A to B changes and all analysis sections', async () => {
    renderPage({ decks: [before, after] })
    fireEvent.change(await screen.findByLabelText('比較元デッキ（Deck A）'), {
      target: { value: 'A' },
    })
    fireEvent.change(screen.getByLabelText('比較先デッキ（Deck B）'), {
      target: { value: 'B' },
    })

    expect(
      screen.getByLabelText('Deck A 長い名前からDeck B 長い名前への比較'),
    ).toBeVisible()
    expect(screen.getAllByText('推しA')).not.toHaveLength(0)
    expect(screen.getAllByText('推しB')).not.toHaveLength(0)
    expect(screen.getByText('追加カード')).toBeVisible()
    expect(
      screen.getByLabelText(/共通カード MAIN-A、2枚から4枚へ、2枚増加/),
    ).toBeVisible()
    expect(
      screen.getByLabelText(/Buzzカード BUZZ、1枚から0枚へ、1枚減少/),
    ).toBeVisible()
    expect(screen.getByText('不明なカード')).toBeVisible()
    for (const heading of [
      '概要',
      'カード差分',
      'メインデッキ 色構成',
      'カードタイプ',
      'Bloom構成',
      'Buzz',
      'エール色構成',
      '制限カード',
    ]) {
      expect(screen.getByRole('heading', { name: heading })).toBeVisible()
    }
    expect(screen.getByText('赤/青')).toBeVisible()
    expect(screen.getByText('Deck A: 上限内 / Deck B: 上限超過')).toBeVisible()
  })

  it('allows selecting the same Deck and reports no difference', async () => {
    renderPage({ decks: [before, after] })
    const beforeSelect = await screen.findByLabelText('比較元デッキ（Deck A）')
    const afterSelect = screen.getByLabelText('比較先デッキ（Deck B）')
    fireEvent.change(beforeSelect, { target: { value: 'A' } })
    fireEvent.change(afterSelect, { target: { value: 'A' } })
    expect(screen.getByText('2つのデッキに差分はありません。')).toBeVisible()
    expect(screen.getByText('カード差分はありません。')).toBeVisible()
  })

  it('shows a role alert when saved Deck loading fails', async () => {
    renderPage({ decks: Promise.reject(new Error('IndexedDB unavailable')) })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'デッキを読み込めませんでした。',
    )
  })

  it('uses canonical noindex metadata', async () => {
    renderPage({ decks: [before, after] })
    await screen.findByLabelText('比較元デッキ（Deck A）')
    expect(document.title).toBe('デッキ比較 | HLSieve DB')
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex,follow',
    )
    expect(
      document.head.querySelector('link[rel="canonical"]'),
    ).toHaveAttribute('href', 'https://hlsieve.com/deck-compare')
  })

  it('keeps card change sections structurally separate', async () => {
    renderPage({ decks: [before, after] })
    fireEvent.change(await screen.findByLabelText('比較元デッキ（Deck A）'), {
      target: { value: 'A' },
    })
    fireEvent.change(screen.getByLabelText('比較先デッキ（Deck B）'), {
      target: { value: 'B' },
    })
    const added = screen
      .getByRole('heading', { name: '追加' })
      .closest('section')!
    expect(within(added).getByText('追加カード')).toBeVisible()
    expect(within(added).queryByText('共通カード')).not.toBeInTheDocument()
  })
})

// Two decks can be compared across formats, so which format each one is built
// for is worth seeing beside its name.
describe('the format each compared deck is built for', () => {
  it('names both decks formats once they are chosen', async () => {
    renderPage({
      decks: [before, { ...after, regulationId: 'selection-cup-2026-osaka' }],
    })

    fireEvent.change(await screen.findByLabelText('比較元デッキ（Deck A）'), {
      target: { value: 'A' },
    })
    fireEvent.change(screen.getByLabelText('比較先デッキ（Deck B）'), {
      target: { value: 'B' },
    })

    expect(await screen.findByText('通常構築')).toBeVisible()
    expect(screen.getByText(/hGS 2026 大阪 セレクションロード/)).toBeVisible()
  })

  it('says when it does not recognise a deck s format', async () => {
    renderPage({
      decks: [{ ...before, regulationId: 'future-or-removed-rule' }, after],
    })

    fireEvent.change(await screen.findByLabelText('比較元デッキ（Deck A）'), {
      target: { value: 'A' },
    })
    fireEvent.change(screen.getByLabelText('比較先デッキ（Deck B）'), {
      target: { value: 'B' },
    })

    expect(await screen.findByText('不明なレギュレーション')).toBeVisible()
  })
})
