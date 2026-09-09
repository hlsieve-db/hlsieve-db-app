import { Link } from 'react-router-dom'

import type { Deck } from '../../domain/decks/types'
import type { DeckSaveState } from '../../hooks/useDeckSaveQueue'
import type { SavedDecksState } from '../../hooks/useSavedDeckQuickEdit'

type DeckTargetSelectorProps = {
  state: SavedDecksState
  decks: readonly Deck[]
  selectedDeckId: string | undefined
  saveState: DeckSaveState
  onSelect: (deckId: string) => void
  onRetry: () => void
}

export function DeckTargetSelector({
  state,
  decks,
  selectedDeckId,
  saveState,
  onSelect,
  onRetry,
}: DeckTargetSelectorProps) {
  if (state.status === 'loading') {
    return (
      <p role="status" aria-live="polite">
        保存デッキを読み込んでいます…
      </p>
    )
  }
  if (state.status === 'error') {
    return (
      <div className="deck-quick-add__error" role="alert">
        <p>保存デッキを読み込めませんでした。</p>
        <button type="button" className="button" onClick={onRetry}>
          再試行
        </button>
      </div>
    )
  }
  if (decks.length === 0) {
    return (
      <p className="deck-quick-add__empty">
        デッキがありません。<Link to="/decks">デッキを作成</Link>
      </p>
    )
  }
  return (
    <>
      <label className="deck-target-selector">
        <span>追加先デッキ</span>
        <select
          value={selectedDeckId ?? ''}
          onChange={(event) => onSelect(event.currentTarget.value)}
        >
          {decks.map((deck) => (
            <option value={deck.id} key={deck.id}>
              {deck.name}
            </option>
          ))}
        </select>
      </label>
      <p
        className={`save-state save-state--${saveState}`}
        role="status"
        aria-live="polite"
      >
        {saveState === 'saving' && '保存中…'}
        {saveState === 'saved' && '保存しました'}
        {saveState === 'error' &&
          'デッキを保存できませんでした。もう一度操作すると再試行します。'}
      </p>
    </>
  )
}
