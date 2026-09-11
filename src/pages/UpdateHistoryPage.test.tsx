import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { CardDataUpdateEntry } from '../domain/updates/types'
import type { DeckRepository } from '../repositories/deckRepository'
import { CardSearchPage } from './CardSearchPage'
import { UpdateHistoryPage } from './UpdateHistoryPage'

const additive: CardDataUpdateEntry = {
  id: 'additive',
  publishedAt: '2026-10-18',
  cardsDataVersion: `sha256:${'1'.repeat(64)}`,
  summary: '新弾カードデータを追加しました。',
  addedCards: 42,
  changedCards: 2,
  removedCards: 0,
  addedPrintings: 82,
  removedPrintings: 0,
  notes: ['hBP09を追加', 'カード情報2件を修正'],
}

const correction: CardDataUpdateEntry = {
  id: 'correction',
  publishedAt: '2026-10-19',
  summary: 'カード情報を3件修正しました。',
  addedCards: 0,
  changedCards: 3,
  removedCards: 0,
  addedPrintings: 0,
  removedPrintings: 0,
  notes: ['EffectTagとQ&Aを修正'],
}

function renderHistory(entries: readonly CardDataUpdateEntry[]) {
  return render(
    <MemoryRouter initialEntries={['/updates']}>
      <UpdateHistoryPage entries={entries} />
    </MemoryRouter>,
  )
}

const repository: DeckRepository = {
  listDecks: vi.fn(async () => []),
  getDeck: vi.fn(async () => undefined),
  saveDeck: vi.fn(async () => undefined),
  deleteDeck: vi.fn(async () => undefined),
}

describe('UpdateHistoryPage', () => {
  it('renders the route heading and a deliberate empty state', () => {
    renderHistory([])
    expect(
      screen.getByRole('heading', { name: '更新履歴', level: 1 }),
    ).toBeVisible()
    expect(screen.getByText('公開済みの更新履歴はありません')).toBeVisible()
  })

  it('renders latest-first additive and correction-only entries', () => {
    renderHistory([additive, correction])
    const entries = screen
      .getAllByRole('listitem')
      .filter((item) => item.classList.contains('update-history-entry'))
    expect(within(entries[0]).getByText('2026/10/19')).toBeVisible()
    expect(within(entries[0]).getByText('修正カード 3枚')).toBeVisible()
    expect(within(entries[1]).getByText('新規カード 42枚')).toBeVisible()
    expect(within(entries[1]).getByText('新規版 82種')).toBeVisible()
    expect(screen.queryByText('削除カード 0枚')).not.toBeInTheDocument()
  })

  it('sets indexable update-history metadata', () => {
    renderHistory([])
    expect(document.title).toBe('更新履歴 | HLSieve DB')
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'index,follow',
    )
    expect(
      document.head.querySelector('link[rel="canonical"]'),
    ).toHaveAttribute('href', 'https://hlsieve.com/updates')
  })

  it('places a compact latest notice before the Cards filter panel', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/cards']}>
        <CardSearchPage
          loadCards={() => new Promise(() => undefined)}
          repository={repository}
          updateHistory={[additive]}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('カードデータ更新 2026/10/18')).toBeVisible()
    expect(
      screen.getByRole('link', { name: '更新内容を見る' }),
    ).toHaveAttribute('href', '/updates')
    const notice = container.querySelector('.latest-update-notice')!
    const filters = container.querySelector('.search-panel')!
    expect(
      notice.compareDocumentPosition(filters) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('does not show a Cards notice when no verified history exists', () => {
    render(
      <MemoryRouter initialEntries={['/cards']}>
        <CardSearchPage
          loadCards={() => new Promise(() => undefined)}
          repository={repository}
          updateHistory={[]}
        />
      </MemoryRouter>,
    )
    expect(
      screen.queryByLabelText('最新のカードデータ更新'),
    ).not.toBeInTheDocument()
  })
})
