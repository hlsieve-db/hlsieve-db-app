import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { DeckConflict } from '../../cloud/deckReconciliation'
import type { Deck } from '../../domain/decks/types'
import { DeckConflictChooser } from './DeckConflictChooser'

function deck(id: string, overrides: Partial<Deck> = {}): Deck {
  return {
    id,
    name: `デッキ ${id}`,
    entries: [{ cardNumber: 'hBP04-042', quantity: 4 }],
    createdAt: '2026-09-22T00:00:00.000Z',
    updatedAt: '2026-09-22T00:00:00.000Z',
    ...overrides,
  }
}

const activeActive: DeckConflict = {
  deckId: 'a',
  kind: 'active-active',
  localDeck: deck('a'),
  cloudDeck: deck('a', {
    name: 'デッキ a',
    entries: [{ cardNumber: 'hBP04-042', quantity: 2 }],
  }),
}

const tombstone: DeckConflict = {
  deckId: 'b',
  kind: 'local-vs-tombstone',
  localDeck: deck('b'),
}

function renderChooser({
  conflicts = [activeActive],
  resolutions = {},
  busy = false,
}: {
  conflicts?: DeckConflict[]
  resolutions?: Record<string, 'local' | 'cloud'>
  busy?: boolean
} = {}) {
  const onChoose = vi.fn()
  const onApply = vi.fn()
  const onCancel = vi.fn()
  render(
    <DeckConflictChooser
      conflicts={conflicts}
      resolutions={resolutions}
      busy={busy}
      onChoose={onChoose}
      onApply={onApply}
      onCancel={onCancel}
    />,
  )
  return { onChoose, onApply, onCancel }
}

const applyButton = () =>
  screen.getByRole('button', { name: '選んだ内容で反映' })

describe('asking which copy of each deck to keep', () => {
  it('says how many decks differ and names each one', () => {
    renderChooser({ conflicts: [activeActive, tombstone] })

    expect(screen.getByText('2件のデッキで違いがあります。')).toBeVisible()
    expect(screen.getByRole('group', { name: 'デッキ a' })).toBeVisible()
    expect(screen.getByRole('group', { name: 'デッキ b' })).toBeVisible()
  })

  // Enough to tell the two copies apart without a card-by-card diff.
  it('shows each side with its card total', () => {
    renderChooser()

    expect(
      screen.getByText(
        'この端末: デッキ a（合計 4枚） / クラウド: デッキ a（合計 2枚）',
      ),
    ).toBeVisible()
  })

  it('says the account deleted the deck rather than showing a second copy', () => {
    renderChooser({ conflicts: [tombstone] })

    expect(
      screen.getByText('この端末: デッキ b（合計 4枚） / クラウド: 削除済み'),
    ).toBeVisible()
  })

  // The two kinds of disagreement are different questions, so they are not
  // asked with the same words.
  it('words a deletion as a deletion, not as a winner', () => {
    renderChooser({ conflicts: [activeActive, tombstone] })

    const changed = screen.getByRole('group', { name: 'デッキ a' })
    expect(changed).toHaveTextContent('この端末の内容を使う')
    expect(changed).toHaveTextContent('クラウドの内容を使う')

    const deleted = screen.getByRole('group', { name: 'デッキ b' })
    expect(deleted).toHaveTextContent('この端末のデッキを残す')
    expect(deleted).toHaveTextContent('クラウド側の削除を反映')
  })

  it('reports the choice for the deck it was made for', () => {
    const { onChoose } = renderChooser({ conflicts: [activeActive, tombstone] })

    fireEvent.click(screen.getByLabelText('クラウドの内容を使う'))
    fireEvent.click(screen.getByLabelText('この端末のデッキを残す'))

    expect(onChoose).toHaveBeenNthCalledWith(1, 'a', 'cloud')
    expect(onChoose).toHaveBeenNthCalledWith(2, 'b', 'local')
  })

  it('shows the choices already made', () => {
    renderChooser({ conflicts: [activeActive], resolutions: { a: 'local' } })

    expect(screen.getByLabelText('この端末の内容を使う')).toBeChecked()
    expect(screen.getByLabelText('クラウドの内容を使う')).not.toBeChecked()
  })

  // Applying half an answer would leave the other half to whatever the code
  // fell back to.
  it('cannot be applied until every deck is answered for', () => {
    renderChooser({
      conflicts: [activeActive, tombstone],
      resolutions: { a: 'local' },
    })

    expect(applyButton()).toBeDisabled()
    expect(
      screen.getByText('すべてのデッキを選ぶと反映できます。'),
    ).toBeVisible()
  })

  it('can be applied once they all are', () => {
    const { onApply } = renderChooser({
      conflicts: [activeActive, tombstone],
      resolutions: { a: 'local', b: 'cloud' },
    })

    expect(applyButton()).toBeEnabled()
    fireEvent.click(applyButton())
    expect(onApply).toHaveBeenCalledTimes(1)
  })

  it('says nothing is written until the reporter chooses', () => {
    renderChooser()

    expect(
      screen.getByText(/選ぶまで、この端末とクラウドのどちらも変更しません/),
    ).toBeVisible()
  })

  it('can be abandoned without choosing anything', () => {
    const { onCancel, onApply } = renderChooser()

    fireEvent.click(screen.getByRole('button', { name: 'やめる' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onApply).not.toHaveBeenCalled()
  })

  it('cannot be pressed twice while it is being applied', () => {
    renderChooser({
      conflicts: [activeActive],
      resolutions: { a: 'local' },
      busy: true,
    })

    expect(applyButton()).toBeDisabled()
    expect(screen.getByLabelText('この端末の内容を使う')).toBeDisabled()
  })
})
