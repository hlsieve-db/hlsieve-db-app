import { useEffect, useRef, useState } from 'react'

import {
  sortFoldersForDisplay,
  sortTagsForDisplay,
} from '../../domain/deckOrganization/operations'
import type {
  DeckFolder,
  DeckFolderId,
  DeckOrganization,
  DeckTag,
  DeckTagId,
} from '../../domain/deckOrganization/types'
import { DECK_ORGANIZATION_TAG_MAX_COUNT } from '../../domain/deckOrganization/validation'
import { DECK_ORGANIZATION_LOCAL_ONLY_NOTICE } from './deckOrganizationMessages'

const NO_FOLDER = ''

/**
 * Where one deck's folder and tags are chosen.
 *
 * Nothing is written until the reporter saves, so closing leaves the deck as
 * it was. The stylesheet turns this into a sheet on a narrow screen; the
 * markup and the keyboard handling are the same either way.
 */
export function DeckOrganizationDialog({
  deckName,
  organization,
  folders,
  tags,
  saving = false,
  error,
  onSave,
  onClose,
}: {
  deckName: string
  organization: DeckOrganization | undefined
  folders: readonly DeckFolder[]
  tags: readonly DeckTag[]
  saving?: boolean
  error?: string
  onSave: (value: { folderId?: DeckFolderId; tagIds: DeckTagId[] }) => void
  onClose: () => void
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const [folderId, setFolderId] = useState(organization?.folderId ?? NO_FOLDER)
  const [tagIds, setTagIds] = useState<DeckTagId[]>(() => [
    ...(organization?.tagIds ?? []),
  ])

  useEffect(() => {
    headingRef.current?.focus()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => element.getAttribute('aria-hidden') !== 'true')
      if (focusable.length === 0) {
        event.preventDefault()
        headingRef.current?.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === headingRef.current)
      ) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const selected = new Set(tagIds)
  const atTagLimit = tagIds.length >= DECK_ORGANIZATION_TAG_MAX_COUNT

  return (
    <div className="deck-organization-dialog__scrim" onClick={onClose}>
      <section
        ref={dialogRef}
        className="deck-organization-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="deck-organization-heading"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="deck-organization-dialog__header">
          <h2 id="deck-organization-heading" tabIndex={-1} ref={headingRef}>
            「{deckName}」を整理
          </h2>
          <button
            type="button"
            className="button button--secondary"
            onClick={onClose}
          >
            閉じる
          </button>
        </div>

        <p className="deck-organization-dialog__notice">
          {DECK_ORGANIZATION_LOCAL_ONLY_NOTICE}
        </p>

        <div className="deck-organization-dialog__field">
          <label htmlFor="deck-organization-folder">フォルダー</label>
          <select
            id="deck-organization-folder"
            value={folderId}
            onChange={(event) => setFolderId(event.currentTarget.value)}
          >
            <option value={NO_FOLDER}>フォルダーなし</option>
            {sortFoldersForDisplay(folders).map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="deck-organization-dialog__field">
          <legend>タグ（最大{DECK_ORGANIZATION_TAG_MAX_COUNT}個）</legend>
          {tags.length === 0 ? (
            <p>タグがまだありません。</p>
          ) : (
            <div className="deck-organization-dialog__tags">
              {sortTagsForDisplay(tags).map((tag) => {
                const checked = selected.has(tag.id)
                return (
                  <label className="filter-option" key={tag.id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      // Kept from the limit rather than silently dropped on save.
                      disabled={!checked && atTagLimit}
                      onChange={() =>
                        setTagIds((current) =>
                          current.includes(tag.id)
                            ? current.filter((id) => id !== tag.id)
                            : [...current, tag.id],
                        )
                      }
                    />
                    <span>{tag.name}</span>
                  </label>
                )
              })}
            </div>
          )}
          {atTagLimit && (
            <p>
              タグは1つのデッキに{DECK_ORGANIZATION_TAG_MAX_COUNT}
              個までです。外すと別のタグを選べます。
            </p>
          )}
        </fieldset>

        {error && (
          <p className="status-message status-message--error" role="alert">
            {error}
          </p>
        )}

        <div className="deck-organization-dialog__actions">
          <button
            type="button"
            className="button"
            disabled={saving}
            onClick={() =>
              onSave({
                ...(folderId === NO_FOLDER ? {} : { folderId }),
                tagIds: [...tagIds],
              })
            }
          >
            {saving ? '保存中…' : '保存'}
          </button>
          <button
            type="button"
            className="button button--secondary"
            onClick={onClose}
          >
            キャンセル
          </button>
        </div>
      </section>
    </div>
  )
}
