import { sortTagsForDisplay } from '../../domain/deckOrganization/operations'
import type { DeckTag, DeckTagId } from '../../domain/deckOrganization/types'

/**
 * The tag chips above the list.
 *
 * Selecting more than one narrows to the decks carrying all of them, so the
 * chips are checkboxes rather than a single choice.
 */
export function DeckTagFilterChips({
  tags,
  selectedTagIds,
  onToggle,
}: {
  tags: readonly DeckTag[]
  selectedTagIds: readonly DeckTagId[]
  onToggle: (tagId: DeckTagId) => void
}) {
  if (tags.length === 0) return null
  const selected = new Set(selectedTagIds)

  return (
    <fieldset className="deck-tag-filter">
      <legend>タグで絞り込む（すべて含むデッキ）</legend>
      <div className="deck-tag-filter__chips">
        {sortTagsForDisplay(tags).map((tag) => (
          <label className="filter-option" key={tag.id}>
            <input
              type="checkbox"
              checked={selected.has(tag.id)}
              onChange={() => onToggle(tag.id)}
            />
            <span>{tag.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
