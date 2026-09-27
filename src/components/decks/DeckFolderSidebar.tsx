import type {
  DeckFolderFilter,
  DeckFolderSummaries,
} from '../../domain/deckOrganization/operations'

const ALL_VALUE = 'all'
const NONE_VALUE = 'none'

function valueOf(filter: DeckFolderFilter): string {
  return filter.kind === 'folder' ? filter.folderId : filter.kind
}

function filterOf(value: string): DeckFolderFilter {
  if (value === ALL_VALUE) return { kind: 'all' }
  if (value === NONE_VALUE) return { kind: 'none' }
  return { kind: 'folder', folderId: value }
}

/**
 * The folder column, and the same choice as a select for narrow screens.
 *
 * Both are rendered and the stylesheet shows one of them, so the choice never
 * depends on a width this component measured for itself.
 */
export function DeckFolderSidebar({
  summaries,
  selected,
  onSelect,
}: {
  summaries: DeckFolderSummaries
  selected: DeckFolderFilter
  onSelect: (filter: DeckFolderFilter) => void
}) {
  const current = valueOf(selected)
  const entries = [
    { value: ALL_VALUE, label: 'すべて', count: summaries.allCount },
    {
      value: NONE_VALUE,
      label: 'フォルダーなし',
      count: summaries.unfiledCount,
    },
    ...summaries.folders.map((summary) => ({
      value: summary.folder.id,
      label: summary.folder.name,
      count: summary.deckCount,
    })),
  ]

  return (
    <>
      <nav className="deck-folder-column" aria-label="フォルダーで絞り込む">
        <h2 className="deck-folder-column__heading">フォルダー</h2>
        {/* Buttons in a plain container rather than a list: the saved-deck
            list is the only list on this screen, and tests read it by role. */}
        <div className="deck-folder-column__list">
          {entries.map((entry) => (
            <button
              key={entry.value}
              type="button"
              className="deck-folder-column__item"
              // Named with the count, so it is read as one label rather than
              // a name running into a number.
              aria-label={`${entry.label} ${entry.count}件`}
              aria-current={current === entry.value ? 'true' : undefined}
              onClick={() => onSelect(filterOf(entry.value))}
            >
              <span>{entry.label}</span>
              <span className="deck-folder-column__count">{entry.count}</span>
            </button>
          ))}
        </div>
      </nav>

      <div className="deck-folder-select">
        <label htmlFor="deck-folder-filter">フォルダー</label>
        <select
          id="deck-folder-filter"
          value={current}
          onChange={(event) => onSelect(filterOf(event.currentTarget.value))}
        >
          {entries.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}（{entry.count}）
            </option>
          ))}
        </select>
      </div>
    </>
  )
}
