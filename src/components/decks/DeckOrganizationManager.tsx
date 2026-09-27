import { useState } from 'react'

import {
  sortFoldersForDisplay,
  sortTagsForDisplay,
  type DeckFolderSummaries,
} from '../../domain/deckOrganization/operations'
import type { DeckFolder, DeckTag } from '../../domain/deckOrganization/types'
import {
  DECK_FOLDER_MAX_COUNT,
  DECK_FOLDER_NAME_MAX_LENGTH,
  DECK_TAG_MAX_COUNT,
  DECK_TAG_NAME_MAX_LENGTH,
} from '../../domain/deckOrganization/validation'
import { DECK_ORGANIZATION_LOCAL_ONLY_NOTICE } from './deckOrganizationMessages'

export type DeckOrganizationManagerProps = {
  summaries: DeckFolderSummaries
  tags: readonly DeckTag[]
  /** How many decks carry each tag, so deleting one can say what it affects. */
  tagDeckCounts: ReadonlyMap<string, number>
  /** True while a reorder is being written, so the arrows cannot race it. */
  reordering?: boolean
  error?: string
  onCreateFolder: (name: string) => void
  onRenameFolder: (folder: DeckFolder, name: string) => void
  onMoveFolder: (folder: DeckFolder, direction: 'up' | 'down') => void
  onDeleteFolder: (folder: DeckFolder) => void
  onCreateTag: (name: string) => void
  onRenameTag: (tag: DeckTag, name: string) => void
  onDeleteTag: (tag: DeckTag) => void
}

type Editing = { kind: 'folder' | 'tag'; id: string; name: string }
type Pending = { kind: 'folder' | 'tag'; id: string }

/**
 * Creating, renaming, reordering and removing folders and tags.
 *
 * Kept on /decks rather than behind a route of its own: it is only useful next
 * to the list it organizes.
 */
export function DeckOrganizationManager({
  summaries,
  tags,
  tagDeckCounts,
  reordering = false,
  error,
  onCreateFolder,
  onRenameFolder,
  onMoveFolder,
  onDeleteFolder,
  onCreateTag,
  onRenameTag,
  onDeleteTag,
}: DeckOrganizationManagerProps) {
  const [folderName, setFolderName] = useState('')
  const [tagName, setTagName] = useState('')
  const [editing, setEditing] = useState<Editing>()
  const [pendingDelete, setPendingDelete] = useState<Pending>()

  const folders = sortFoldersForDisplay(
    summaries.folders.map((summary) => summary.folder),
  )
  const deckCountFor = new Map(
    summaries.folders.map((summary) => [summary.folder.id, summary.deckCount]),
  )
  const orderedTags = sortTagsForDisplay(tags)
  const folderLimitReached = folders.length >= DECK_FOLDER_MAX_COUNT
  const tagLimitReached = orderedTags.length >= DECK_TAG_MAX_COUNT

  const isEditing = (kind: Editing['kind'], id: string) =>
    editing?.kind === kind && editing.id === id
  const isDeleting = (kind: Pending['kind'], id: string) =>
    pendingDelete?.kind === kind && pendingDelete.id === id

  return (
    <section
      className="content-surface deck-organization-manager"
      aria-labelledby="deck-organization-manager-heading"
    >
      <h2 id="deck-organization-manager-heading">フォルダーとタグ</h2>
      <p>{DECK_ORGANIZATION_LOCAL_ONLY_NOTICE}</p>
      {error && (
        <p className="status-message status-message--error" role="alert">
          {error}
        </p>
      )}

      <div className="deck-organization-manager__group">
        <h3>フォルダー</h3>
        <form
          className="deck-organization-manager__form"
          onSubmit={(event) => {
            event.preventDefault()
            onCreateFolder(folderName)
            setFolderName('')
          }}
        >
          <label htmlFor="deck-folder-name">新しいフォルダー名</label>
          <input
            id="deck-folder-name"
            type="text"
            inputMode="text"
            maxLength={DECK_FOLDER_NAME_MAX_LENGTH}
            value={folderName}
            onChange={(event) => setFolderName(event.currentTarget.value)}
          />
          <button
            type="submit"
            className="button"
            disabled={folderName.trim() === '' || folderLimitReached}
          >
            フォルダーを追加
          </button>
        </form>
        {folderLimitReached && (
          <p>フォルダーは{DECK_FOLDER_MAX_COUNT}個までです。</p>
        )}

        {folders.length === 0 ? (
          <p>フォルダーがありません。</p>
        ) : (
          <ul className="deck-organization-manager__list">
            {folders.map((folder, index) => (
              <li key={folder.id}>
                {isEditing('folder', folder.id) ? (
                  <form
                    className="deck-organization-manager__form"
                    onSubmit={(event) => {
                      event.preventDefault()
                      onRenameFolder(folder, editing?.name ?? folder.name)
                      setEditing(undefined)
                    }}
                  >
                    <label htmlFor={`deck-folder-rename-${folder.id}`}>
                      {folder.name}の新しい名前
                    </label>
                    <input
                      id={`deck-folder-rename-${folder.id}`}
                      type="text"
                      inputMode="text"
                      maxLength={DECK_FOLDER_NAME_MAX_LENGTH}
                      value={editing?.name ?? ''}
                      onChange={(event) =>
                        setEditing({
                          kind: 'folder',
                          id: folder.id,
                          name: event.currentTarget.value,
                        })
                      }
                    />
                    <button type="submit" className="button">
                      名前を保存
                    </button>
                    <button
                      type="button"
                      className="button button--secondary"
                      onClick={() => setEditing(undefined)}
                    >
                      キャンセル
                    </button>
                  </form>
                ) : (
                  <div className="deck-organization-manager__row">
                    <span>
                      {folder.name}（{deckCountFor.get(folder.id) ?? 0}）
                    </span>
                    <button
                      type="button"
                      className="button button--secondary"
                      aria-label={`${folder.name}を上へ移動`}
                      disabled={reordering || index === 0}
                      onClick={() => onMoveFolder(folder, 'up')}
                    >
                      上へ
                    </button>
                    <button
                      type="button"
                      className="button button--secondary"
                      aria-label={`${folder.name}を下へ移動`}
                      disabled={reordering || index === folders.length - 1}
                      onClick={() => onMoveFolder(folder, 'down')}
                    >
                      下へ
                    </button>
                    <button
                      type="button"
                      className="button button--secondary"
                      aria-label={`${folder.name}の名前を変更`}
                      onClick={() =>
                        setEditing({
                          kind: 'folder',
                          id: folder.id,
                          name: folder.name,
                        })
                      }
                    >
                      名前を変更
                    </button>
                    <button
                      type="button"
                      className="button button--danger"
                      aria-label={`${folder.name}を削除`}
                      onClick={() =>
                        setPendingDelete({ kind: 'folder', id: folder.id })
                      }
                    >
                      削除
                    </button>
                  </div>
                )}

                {isDeleting('folder', folder.id) && (
                  <div
                    className="delete-confirmation"
                    role="alertdialog"
                    aria-label="フォルダー削除の確認"
                  >
                    <p>「{folder.name}」を削除しますか？</p>
                    {/* The decks stay; only this folder comes off them. */}
                    <p>
                      このフォルダーの{deckCountFor.get(folder.id) ?? 0}
                      件のデッキからフォルダーが外れます。デッキは削除されません。
                    </p>
                    <div>
                      <button
                        type="button"
                        className="button button--danger"
                        onClick={() => {
                          setPendingDelete(undefined)
                          onDeleteFolder(folder)
                        }}
                      >
                        削除する
                      </button>
                      <button
                        type="button"
                        className="button button--secondary"
                        onClick={() => setPendingDelete(undefined)}
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="deck-organization-manager__group">
        <h3>タグ</h3>
        <form
          className="deck-organization-manager__form"
          onSubmit={(event) => {
            event.preventDefault()
            onCreateTag(tagName)
            setTagName('')
          }}
        >
          <label htmlFor="deck-tag-name">新しいタグ名</label>
          <input
            id="deck-tag-name"
            type="text"
            inputMode="text"
            maxLength={DECK_TAG_NAME_MAX_LENGTH}
            value={tagName}
            onChange={(event) => setTagName(event.currentTarget.value)}
          />
          <button
            type="submit"
            className="button"
            disabled={tagName.trim() === '' || tagLimitReached}
          >
            タグを追加
          </button>
        </form>
        {tagLimitReached && <p>タグは{DECK_TAG_MAX_COUNT}個までです。</p>}

        {orderedTags.length === 0 ? (
          <p>タグがありません。</p>
        ) : (
          <ul className="deck-organization-manager__list">
            {orderedTags.map((tag) => (
              <li key={tag.id}>
                {isEditing('tag', tag.id) ? (
                  <form
                    className="deck-organization-manager__form"
                    onSubmit={(event) => {
                      event.preventDefault()
                      onRenameTag(tag, editing?.name ?? tag.name)
                      setEditing(undefined)
                    }}
                  >
                    <label htmlFor={`deck-tag-rename-${tag.id}`}>
                      {tag.name}の新しい名前
                    </label>
                    <input
                      id={`deck-tag-rename-${tag.id}`}
                      type="text"
                      inputMode="text"
                      maxLength={DECK_TAG_NAME_MAX_LENGTH}
                      value={editing?.name ?? ''}
                      onChange={(event) =>
                        setEditing({
                          kind: 'tag',
                          id: tag.id,
                          name: event.currentTarget.value,
                        })
                      }
                    />
                    <button type="submit" className="button">
                      名前を保存
                    </button>
                    <button
                      type="button"
                      className="button button--secondary"
                      onClick={() => setEditing(undefined)}
                    >
                      キャンセル
                    </button>
                  </form>
                ) : (
                  <div className="deck-organization-manager__row">
                    <span>
                      {tag.name}（{tagDeckCounts.get(tag.id) ?? 0}）
                    </span>
                    <button
                      type="button"
                      className="button button--secondary"
                      aria-label={`${tag.name}の名前を変更`}
                      onClick={() =>
                        setEditing({ kind: 'tag', id: tag.id, name: tag.name })
                      }
                    >
                      名前を変更
                    </button>
                    <button
                      type="button"
                      className="button button--danger"
                      aria-label={`${tag.name}を削除`}
                      onClick={() =>
                        setPendingDelete({ kind: 'tag', id: tag.id })
                      }
                    >
                      削除
                    </button>
                  </div>
                )}

                {isDeleting('tag', tag.id) && (
                  <div
                    className="delete-confirmation"
                    role="alertdialog"
                    aria-label="タグ削除の確認"
                  >
                    <p>「{tag.name}」を削除しますか？</p>
                    <p>
                      このタグが付いた{tagDeckCounts.get(tag.id) ?? 0}
                      件のデッキからタグが外れます。デッキは削除されません。
                    </p>
                    <div>
                      <button
                        type="button"
                        className="button button--danger"
                        onClick={() => {
                          setPendingDelete(undefined)
                          onDeleteTag(tag)
                        }}
                      >
                        削除する
                      </button>
                      <button
                        type="button"
                        className="button button--secondary"
                        onClick={() => setPendingDelete(undefined)}
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
