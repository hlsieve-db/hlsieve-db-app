import type {
  DeckConflict,
  DeckConflictChoice,
  DeckConflictResolutions,
} from '../../cloud/deckReconciliation'
import { getDeckTotal } from '../../domain/decks/deck'
import type { DeckId } from '../../domain/decks/types'

/**
 * Asking which copy of each deck to keep.
 *
 * One question per deck rather than one for the whole set, because the two
 * sides can disagree about one deck and agree about the rest, and a single
 * answer would throw away work nobody was asked about.
 *
 * The two kinds of disagreement read differently and are worded differently.
 * Two copies that both exist is a choice between contents. A deck the account
 * says was deleted, still held here, is a choice between keeping it and
 * accepting the deletion, so the labels say that rather than naming a winner.
 *
 * Nothing is applied until every deck has an answer: a partial answer would
 * leave the rest to be decided by whatever the code happened to default to.
 */

export type DeckConflictChooserProps = {
  conflicts: readonly DeckConflict[]
  resolutions: DeckConflictResolutions
  onChoose: (deckId: DeckId, choice: DeckConflictChoice) => void
  onApply: () => void
  onCancel: () => void
  /** True while applying, so the buttons cannot be pressed twice. */
  busy?: boolean
}

const CHOICE_LABELS: Record<
  DeckConflict['kind'],
  Record<DeckConflictChoice, string>
> = {
  'active-active': {
    local: 'この端末の内容を使う',
    cloud: 'クラウドの内容を使う',
  },
  'local-vs-tombstone': {
    local: 'この端末のデッキを残す',
    cloud: 'クラウド側の削除を反映',
  },
}

/** Enough to tell the two copies apart without showing a card-by-card diff. */
function summary(conflict: DeckConflict): string {
  if (conflict.kind === 'local-vs-tombstone') {
    return `この端末: ${conflict.localDeck.name}（合計 ${getDeckTotal(
      conflict.localDeck,
    )}枚） / クラウド: 削除済み`
  }
  return `この端末: ${conflict.localDeck.name}（合計 ${getDeckTotal(
    conflict.localDeck,
  )}枚） / クラウド: ${conflict.cloudDeck.name}（合計 ${getDeckTotal(
    conflict.cloudDeck,
  )}枚）`
}

export function DeckConflictChooser({
  conflicts,
  resolutions,
  onChoose,
  onApply,
  onCancel,
  busy = false,
}: DeckConflictChooserProps) {
  const answered = conflicts.every(
    (conflict) => resolutions[conflict.deckId] !== undefined,
  )

  return (
    <div className="account-cloud-sync__conflicts">
      <p>{conflicts.length}件のデッキで違いがあります。</p>
      <p>
        デッキごとに、どちらの内容を使うか選んでください。選ぶまで、この端末とクラウドのどちらも変更しません。
      </p>

      {conflicts.map((conflict) => {
        const chosen = resolutions[conflict.deckId]
        return (
          <fieldset
            className="account-cloud-sync__conflict"
            key={conflict.deckId}
          >
            <legend>{conflict.localDeck.name}</legend>
            <p>{summary(conflict)}</p>
            {(['local', 'cloud'] as const).map((choice) => (
              <label key={choice}>
                <input
                  type="radio"
                  name={`conflict-${conflict.deckId}`}
                  value={choice}
                  checked={chosen === choice}
                  disabled={busy}
                  onChange={() => onChoose(conflict.deckId, choice)}
                />
                {CHOICE_LABELS[conflict.kind][choice]}
              </label>
            ))}
          </fieldset>
        )
      })}

      <button
        className="button"
        type="button"
        // Every deck must be answered for: applying half an answer would leave
        // the rest to whatever the code fell back to.
        disabled={!answered || busy}
        onClick={onApply}
      >
        選んだ内容で反映
      </button>
      <button
        className="button button--secondary"
        type="button"
        disabled={busy}
        onClick={onCancel}
      >
        やめる
      </button>
      {!answered && <p>すべてのデッキを選ぶと反映できます。</p>}
    </div>
  )
}
