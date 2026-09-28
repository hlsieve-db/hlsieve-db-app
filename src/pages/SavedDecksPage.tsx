import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppRepositories } from '../repositories/useAppRepositories'
import { Link, useNavigate } from 'react-router-dom'

import { AppNavigation } from '../components/AppNavigation'
import { DeckLocalNavigation } from '../components/DeckLocalNavigation'
import { DeckRegulationBadge } from '../components/decks/DeckRegulationBadge'
import { createDeck, getDeckTotal } from '../domain/decks/deck'
import { duplicateDeck } from '../domain/decks/duplicate'
import {
  ALL_DECKS_FILTER,
  createDeckFolder,
  createDeckTag,
  duplicateDeckOrganization,
  filterDecksByOrganization,
  folderNameForDeck,
  moveDeckFolder,
  normalizeDeckOrganization,
  renameDeckFolder,
  renameDeckTag,
  summarizeDeckFolders,
  tagsForOrganization,
  visibleTagsWithOverflow,
  type DeckFolderFilter,
} from '../domain/deckOrganization/operations'
import { DeckFolderSidebar } from '../components/decks/DeckFolderSidebar'
import { DeckOrganizationDialog } from '../components/decks/DeckOrganizationDialog'
import { DeckOrganizationManager } from '../components/decks/DeckOrganizationManager'
import { DeckTagFilterChips } from '../components/decks/DeckTagFilterChips'
import {
  createDeckBackup,
  createDeckBackupV2,
  DECK_BACKUP_VERSION_V2,
  createDeckBackupFilename,
  MAX_DECK_BACKUP_FILE_SIZE,
  parseDeckBackup,
  planDeckBackupImport,
  serializeDeckBackup,
  type DeckBackup,
  type DeckImportPlan,
} from '../domain/decks/backup'
import type { Deck } from '../domain/decks/types'
import type { CloudSyncedDeckRepository } from '../cloud/cloudSyncedDeckRepository'
import { isAppDatabaseBlockedError } from '../repositories/appDatabase'
import type { DeckFolderRepository } from '../repositories/deckFolderRepository'
import type { DeckOrganizationRepository } from '../repositories/deckOrganizationRepository'
import type { DeckTagRepository } from '../repositories/deckTagRepository'
import { type DeckVersionRepository } from '../repositories/deckVersionRepository'
import {
  planDeckBackupV2Import,
  type DeckBackupV2ImportPlan,
  type DeckBackupV2ImportWarnings,
} from '../domain/decks/backupV2Import'
import type {
  DeckFolder,
  DeckOrganization,
  DeckTag,
} from '../domain/deckOrganization/types'
import { useDocumentMetadata } from '../hooks/useDocumentMetadata'

type DeckListState =
  | { status: 'loading' }
  | { status: 'loaded'; decks: Deck[] }
  /** `blocked`: another tab is holding the old database version open. */
  | { status: 'error'; blocked: boolean }

type SavedDecksPageProps = {
  repository?: CloudSyncedDeckRepository
  /** Supplied by tests; production takes them from the account's repositories. */
  deckFolders?: DeckFolderRepository
  deckTags?: DeckTagRepository
  deckOrganizations?: DeckOrganizationRepository
  /** Supplied by tests; production takes it from the account's repositories. */
  deckVersions?: DeckVersionRepository
  createNewDeck?: () => Deck
  now?: () => Date
  createImportId?: () => string
  downloadFile?: (filename: string, contents: string) => void
}

/**
 * Folders, tags and what each deck is organized by.
 *
 * Not readable and empty are different facts: a collection that could not be
 * read has to stop a backup rather than write one missing every folder, so the
 * state says which of the two it is.
 */
type OrganizationState =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'loaded'
      folders: DeckFolder[]
      tags: DeckTag[]
      organizations: DeckOrganization[]
    }

/**
 * Still reading is worth waiting out; a failed read is not, so the two say
 * different things about what the reporter should do next.
 */
const ORGANIZATION_LOADING_MESSAGE =
  'フォルダー・タグを読み込み中です。少し待ってからもう一度お試しください。'

/** How many tags one deck card shows before the rest become a count. */
const DECK_CARD_TAG_LIMIT = 3

/**
 * What a deck is organized by, and the way to change it.
 *
 * Every tag is rendered; the stylesheet hides the ones past the limit on a
 * narrow screen, where the count beside them says how many that was.
 */
function DeckCardOrganization({
  deck,
  organization,
  folders,
  tags,
  onOrganize,
}: {
  deck: Deck
  organization: DeckOrganization | undefined
  folders: readonly DeckFolder[]
  tags: readonly DeckTag[]
  onOrganize: () => void
}) {
  const assigned = tagsForOrganization(organization, tags)
  const { overflowCount } = visibleTagsWithOverflow(
    assigned,
    DECK_CARD_TAG_LIMIT,
  )
  const folderName = folderNameForDeck(organization, folders)

  return (
    <div className="deck-list__organization">
      <span className="deck-list__folder">
        {folderName ?? 'フォルダーなし'}
      </span>
      {assigned.length > 0 && (
        <span className="deck-list__tags">
          {/* Already in reading order; sorting again here would hide where
              that order is decided. */}
          {assigned.map((tag) => (
            <span className="deck-list__tag" key={tag.id}>
              {tag.name}
            </span>
          ))}
        </span>
      )}
      {overflowCount > 0 && (
        <span className="deck-list__tag-overflow">+{overflowCount}</span>
      )}
      <button
        type="button"
        className="button button--secondary"
        aria-label={`${deck.name}を整理`}
        onClick={onOrganize}
      >
        整理
      </button>
    </div>
  )
}

type ImportPreview = {
  backup: DeckBackup
  filename: string
} & (
  | { version: 1; plan: DeckImportPlan }
  | { version: 2; plan: DeckBackupV2ImportPlan }
)

/** What the import did beyond adding decks, in the order worth reading. */
function warningSentences(warnings: DeckBackupV2ImportWarnings): string[] {
  const lines: string[] = []
  if (warnings.orphanedOrganizationCount > 0) {
    lines.push(
      `デッキが見つからない整理情報 ${warnings.orphanedOrganizationCount}件を取り込みませんでした。`,
    )
  }
  if (warnings.missingFolderIds.length > 0) {
    lines.push(
      `見つからないフォルダー ${warnings.missingFolderIds.length}件の割り当てを外しました。`,
    )
  }
  if (warnings.missingTagIds.length > 0) {
    lines.push(
      `見つからないタグ ${warnings.missingTagIds.length}件の割り当てを外しました。`,
    )
  }
  if (warnings.duplicateTagIdCount > 0) {
    lines.push(`重複したタグ ${warnings.duplicateTagIdCount}件を除きました。`)
  }
  if (warnings.truncatedTagOrganizationCount > 0) {
    lines.push(
      `タグが上限を超えるデッキ ${warnings.truncatedTagOrganizationCount}件で、超過分を外しました。`,
    )
  }
  const renamed = warnings.renamedFolderCount + warnings.renamedTagCount
  if (renamed > 0) {
    lines.push(`名前が重なるフォルダー・タグ ${renamed}件に番号を付けました。`)
  }
  const reused = warnings.reusedFolderCount + warnings.reusedTagCount
  if (reused > 0) {
    lines.push(`既存のフォルダー・タグ ${reused}件をそのまま使いました。`)
  }
  if (warnings.skippedOrganizationCount > 0) {
    lines.push(
      `すでにあるデッキの整理情報 ${warnings.skippedOrganizationCount}件は、この端末の内容を残しました。`,
    )
  }
  return lines
}

function downloadJsonFile(filename: string, contents: string): void {
  const url = URL.createObjectURL(
    new Blob([contents], { type: 'application/json;charset=utf-8' }),
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function SavedDecksPage({
  repository: repositoryProp,
  deckVersions: deckVersionsProp,
  deckFolders: deckFoldersProp,
  deckTags: deckTagsProp,
  deckOrganizations: deckOrganizationsProp,
  createNewDeck = createDeck,
  now = () => new Date(),
  createImportId = () => crypto.randomUUID(),
  downloadFile = downloadJsonFile,
}: SavedDecksPageProps) {
  const repositories = useAppRepositories()
  const repository = repositoryProp ?? repositories.decks
  // Snapshots belong to the deck, so deleting one takes them with it and the
  // confirmation says how many are going.
  const deckVersions = deckVersionsProp ?? repositories.deckVersions
  // Read so a backup can carry folders and tags, and so a copy keeps them.
  // Nothing on this screen shows them yet; that is 7B-2.
  const deckFolders = deckFoldersProp ?? repositories.deckFolders
  const deckTags = deckTagsProp ?? repositories.deckTags
  const deckOrganizations =
    deckOrganizationsProp ?? repositories.deckOrganizations
  const navigate = useNavigate()
  const [state, setState] = useState<DeckListState>({ status: 'loading' })
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [pendingDeleteId, setPendingDeleteId] = useState<string>()
  const [pendingDeleteVersions, setPendingDeleteVersions] = useState<number>()
  const [duplicatingId, setDuplicatingId] = useState<string>()
  const [operationError, setOperationError] = useState<string>()
  const [creating, setCreating] = useState(false)
  const [importPreview, setImportPreview] = useState<ImportPreview>()
  const [backupError, setBackupError] = useState<string>()
  const [backupStatus, setBackupStatus] = useState<string>()
  const [organization, setOrganization] = useState<OrganizationState>({
    status: 'loading',
  })
  const [folderFilter, setFolderFilter] =
    useState<DeckFolderFilter>(ALL_DECKS_FILTER)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [organizingDeckId, setOrganizingDeckId] = useState<string>()
  const [organizationError, setOrganizationError] = useState<string>()
  const [manageError, setManageError] = useState<string>()
  const [savingOrganization, setSavingOrganization] = useState(false)
  const [reorderingFolders, setReorderingFolders] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const deckListRef = useRef<HTMLElement>(null)

  const readOrganization = useCallback(async () => {
    const [nextFolders, nextTags, nextOrganizations] = await Promise.all([
      deckFolders.listFolders(),
      deckTags.listTags(),
      deckOrganizations.listOrganizations(),
    ])
    return {
      status: 'loaded' as const,
      folders: nextFolders,
      tags: nextTags,
      organizations: nextOrganizations,
    }
  }, [deckFolders, deckOrganizations, deckTags])

  useEffect(() => {
    let active = true
    void repository.listDecks().then(
      (decks) => {
        if (active) setState({ status: 'loaded', decks })
      },
      (error) => {
        if (active) {
          setState({
            status: 'error',
            blocked: isAppDatabaseBlockedError(error),
          })
        }
      },
    )
    return () => {
      active = false
    }
  }, [loadAttempt, repository])

  useEffect(() => {
    let active = true
    void readOrganization().then(
      (value) => {
        if (active) setOrganization(value)
      },
      () => {
        if (active) setOrganization({ status: 'error' })
      },
    )
    return () => {
      active = false
    }
  }, [loadAttempt, readOrganization])

  useDocumentMetadata({
    title: '保存デッキ | HLSieve DB',
    canonicalPath: '/decks',
    robots: 'noindex,follow',
  })

  const retryLoad = () => {
    setState({ status: 'loading' })
    setLoadAttempt((attempt) => attempt + 1)
  }

  const handleCreate = async () => {
    setCreating(true)
    setOperationError(undefined)
    try {
      const deck = createNewDeck()
      await repository.saveDeck(deck)
      navigate(`/decks/${encodeURIComponent(deck.id)}`)
    } catch {
      setOperationError('デッキを作成できませんでした。')
      setCreating(false)
    }
  }

  /** Asks, and says what else goes with it. */
  const startDelete = async (id: string) => {
    setPendingDeleteId(id)
    setPendingDeleteVersions(undefined)
    try {
      setPendingDeleteVersions((await deckVersions.listVersions(id)).length)
    } catch {
      // The count is a courtesy; failing to read it must not block deleting.
      setPendingDeleteVersions(undefined)
    }
  }

  const handleDuplicate = async (deck: Deck) => {
    setDuplicatingId(deck.id)
    setOperationError(undefined)
    try {
      const copy = duplicateDeck(deck, {
        existingNames:
          state.status === 'loaded' ? state.decks.map((v) => v.name) : [],
      })
      await repository.duplicateDeck(
        copy,
        organization.status === 'loaded'
          ? duplicateDeckOrganization(
              organization.organizations.find(
                (value) => value.deckId === deck.id,
              ),
              copy.id,
            )
          : undefined,
      )
      navigate(`/decks/${encodeURIComponent(copy.id)}`)
    } catch {
      setOperationError('デッキを複製できませんでした。')
      setDuplicatingId(undefined)
    }
  }

  const handleDelete = async (id: string) => {
    setOperationError(undefined)
    try {
      // Snapshots first, and only this deck's. They restore into this deck and
      // nothing else, so a deck removed while they remain would leave records
      // nobody can reach or clear. Failing here leaves the deck in place, which
      // is the state the reporter can retry from.
      await repository.deleteDeck(id)
      setState((current) =>
        current.status === 'loaded'
          ? {
              status: 'loaded',
              decks: current.decks.filter((deck) => deck.id !== id),
            }
          : current,
      )
      setPendingDeleteId(undefined)
      setPendingDeleteVersions(undefined)
    } catch {
      setOperationError('デッキを削除できませんでした。')
    }
  }

  const loadedOrganization =
    organization.status === 'loaded' ? organization : undefined
  const folders = loadedOrganization?.folders ?? []
  const tags = loadedOrganization?.tags ?? []
  const organizations = loadedOrganization?.organizations ?? []
  const decks = state.status === 'loaded' ? state.decks : []
  const summaries = summarizeDeckFolders(decks, organizations, folders)
  const tagDeckCounts = new Map(
    tags.map((tag) => [
      tag.id,
      organizations.filter(
        (value) =>
          value.tagIds.includes(tag.id) &&
          decks.some((deck) => deck.id === value.deckId),
      ).length,
    ]),
  )
  const visibleDecks = loadedOrganization
    ? filterDecksByOrganization(decks, organizations, {
        folder: folderFilter,
        tagIds: selectedTagIds,
        folders,
      })
    : decks
  const narrowed =
    loadedOrganization !== undefined &&
    (folderFilter.kind !== 'all' || selectedTagIds.length > 0)

  const clearFilters = () => {
    setFolderFilter(ALL_DECKS_FILTER)
    setSelectedTagIds([])
  }

  /**
   * Written locally, then read back, so what the screen shows is what the
   * store holds rather than what the screen hoped it would hold.
   */
  const refreshOrganization = async () => {
    await readOrganization().then(setOrganization, () =>
      setOrganization({ status: 'error' }),
    )
  }

  const runOrganizationChange = async (
    change: () => Promise<void>,
    message: string,
  ) => {
    setManageError(undefined)
    try {
      await change()
      await refreshOrganization()
    } catch {
      setManageError(message)
    }
  }

  const handleCreateFolder = (name: string) =>
    void runOrganizationChange(
      () => deckFolders.saveFolder(createDeckFolder(name, folders)),
      'フォルダーを追加できませんでした。名前が重複していないか確認してください。',
    )

  const handleRenameFolder = (folder: DeckFolder, name: string) =>
    void runOrganizationChange(
      () => deckFolders.saveFolder(renameDeckFolder(folder, name, folders)),
      'フォルダーの名前を変更できませんでした。名前が重複していないか確認してください。',
    )

  const handleMoveFolder = (folder: DeckFolder, direction: 'up' | 'down') => {
    setReorderingFolders(true)
    void runOrganizationChange(
      () =>
        deckFolders.saveFolderOrder(
          moveDeckFolder(folders, folder.id, direction),
        ),
      'フォルダーの順番を変更できませんでした。',
    ).finally(() => setReorderingFolders(false))
  }

  const handleDeleteFolder = (folder: DeckFolder) =>
    void runOrganizationChange(async () => {
      await deckFolders.deleteFolder(folder.id)
      // The folder it named is gone, so keeping it selected would leave the
      // list narrowed by something the reporter can no longer see.
      setFolderFilter((current) =>
        current.kind === 'folder' && current.folderId === folder.id
          ? ALL_DECKS_FILTER
          : current,
      )
    }, 'フォルダーを削除できませんでした。')

  const handleCreateTag = (name: string) =>
    void runOrganizationChange(
      () => deckTags.saveTag(createDeckTag(name, tags)),
      'タグを追加できませんでした。名前が重複していないか確認してください。',
    )

  const handleRenameTag = (tag: DeckTag, name: string) =>
    void runOrganizationChange(
      () => deckTags.saveTag(renameDeckTag(tag, name, tags)),
      'タグの名前を変更できませんでした。名前が重複していないか確認してください。',
    )

  const handleDeleteTag = (tag: DeckTag) =>
    void runOrganizationChange(async () => {
      await deckTags.deleteTag(tag.id)
      setSelectedTagIds((current) => current.filter((id) => id !== tag.id))
    }, 'タグを削除できませんでした。')

  const handleSaveOrganization = async (
    deckId: string,
    value: { folderId?: string; tagIds: string[] },
  ) => {
    setSavingOrganization(true)
    setOrganizationError(undefined)
    try {
      const current = organizations.find((row) => row.deckId === deckId)
      const { organization: next } = normalizeDeckOrganization(
        {
          deckId,
          ...(value.folderId === undefined ? {} : { folderId: value.folderId }),
          tagIds: value.tagIds,
          ...(current === undefined ? {} : { createdAt: current.createdAt }),
        },
        { folders, tags },
        { missing: 'reject' },
      )
      await deckOrganizations.saveOrganization(next)
      await refreshOrganization()
      setOrganizingDeckId(undefined)
    } catch {
      setOrganizationError('デッキの整理情報を保存できませんでした。')
    } finally {
      setSavingOrganization(false)
    }
  }

  const organizingDeck = decks.find((deck) => deck.id === organizingDeckId)

  const resetFileInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const exportBackup = () => {
    if (state.status !== 'loaded' || state.decks.length === 0) return
    setBackupError(undefined)
    // A file written without them cannot be told apart from one written by a
    // collection that has none, so nothing is written at all.
    if (organization.status !== 'loaded') {
      setBackupStatus(undefined)
      setBackupError(
        organization.status === 'loading'
          ? ORGANIZATION_LOADING_MESSAGE
          : 'フォルダー・タグを読み込めないため、書き出しを中止しました。ページを再読み込みしてください。',
      )
      return
    }
    try {
      const date = now()
      const { folders, tags, organizations } = organization
      // Only a collection that uses folders or tags needs the newer format. A
      // file written in the older one can still be read by an older build.
      const organized =
        folders.length > 0 || tags.length > 0 || organizations.length > 0
      const backup = organized
        ? createDeckBackupV2(
            { decks: state.decks, folders, tags, organizations },
            date.toISOString(),
          )
        : createDeckBackup(state.decks, date.toISOString())
      downloadFile(createDeckBackupFilename(date), serializeDeckBackup(backup))
      setBackupStatus('デッキバックアップを書き出しました。')
    } catch {
      setBackupError('デッキバックアップを書き出せませんでした。')
    }
  }

  const selectBackupFile = async (file: File | undefined) => {
    setBackupError(undefined)
    setBackupStatus(undefined)
    setImportPreview(undefined)
    if (!file) return
    if (file.size > MAX_DECK_BACKUP_FILE_SIZE) {
      setBackupError('ファイルサイズが大きすぎます。')
      resetFileInput()
      return
    }
    try {
      const parsed = parseDeckBackup(await file.text())
      if (!parsed.ok) {
        setBackupError(parsed.message)
        resetFileInput()
        return
      }
      if (parsed.backup.version === DECK_BACKUP_VERSION_V2) {
        // Planned against what is already here. Treating an unreadable
        // collection as empty would reuse nothing, and the import would fail
        // partway on ids this device already holds.
        if (organization.status !== 'loaded') {
          setBackupError(
            organization.status === 'loading'
              ? ORGANIZATION_LOADING_MESSAGE
              : 'フォルダー・タグを読み込めないため、読み込みを中止しました。ページを再読み込みしてください。',
          )
          resetFileInput()
          return
        }
        const planned = planDeckBackupV2Import(
          parsed.backup,
          {
            decks: state.status === 'loaded' ? state.decks : [],
            folders: organization.folders,
            tags: organization.tags,
            organizations: organization.organizations,
          },
          { deck: createImportId },
        )
        if (!planned.ok) {
          setBackupError(planned.message)
          resetFileInput()
          return
        }
        setImportPreview({
          backup: parsed.backup,
          version: 2,
          plan: planned.plan,
          filename: file.name,
        })
        return
      }
      setImportPreview({
        backup: parsed.backup,
        version: 1,
        plan: planDeckBackupImport(
          parsed.backup.decks,
          state.status === 'loaded' ? state.decks : [],
          createImportId,
        ),
        filename: file.name,
      })
    } catch {
      setBackupError('バックアップファイルを読み込めませんでした。')
      resetFileInput()
    }
  }

  const cancelImport = () => {
    setImportPreview(undefined)
    resetFileInput()
  }

  const executeImport = async () => {
    if (!importPreview) return
    setBackupError(undefined)
    try {
      if (importPreview.version === 2) {
        const { plan } = importPreview
        await repository.importOrganizationBackup({
          decks: plan.decks,
          folders: plan.folders,
          tags: plan.tags,
          organizations: plan.organizations,
        })
      } else {
        await repository.importDecks(importPreview.plan.decks)
      }
      const decks = await repository.listDecks()
      setState({ status: 'loaded', decks })
      // Re-reading is not part of the import succeeding: the decks are
      // already written. A failure here is remembered instead, so the next
      // backup stops rather than being written without folders and tags.
      await readOrganization().then(setOrganization, () =>
        setOrganization({ status: 'error' }),
      )
      const summary = `バックアップを読み込みました。追加: ${importPreview.plan.newCount}件、同一のためスキップ: ${importPreview.plan.identicalCount}件、ID重複のため別デッキとして追加: ${importPreview.plan.conflictCount}件。`
      setBackupStatus(
        importPreview.version === 2
          ? [summary, ...warningSentences(importPreview.plan.warnings)].join('')
          : summary,
      )
      setImportPreview(undefined)
      resetFileInput()
    } catch {
      setBackupError(
        'バックアップを読み込めませんでした。既存のデッキは変更されていません。',
      )
    }
  }

  return (
    <main id="main-content" className="deck-page">
      <header className="deck-page__header">
        <AppNavigation />
        <DeckLocalNavigation />
        <h1>保存デッキ</h1>
        <p>端末に保存したデッキを管理します。</p>
      </header>

      <div className="deck-page__actions">
        <button
          type="button"
          className="button"
          disabled={creating}
          onClick={() => void handleCreate()}
        >
          {creating ? '作成中…' : '新しいデッキを作成'}
        </button>
        <Link className="button button--secondary" to="/deck-compare">
          デッキ比較
        </Link>
      </div>

      {operationError && (
        <p className="status-message status-message--error" role="alert">
          {operationError}
        </p>
      )}

      {state.status === 'loading' && (
        <p className="status-message" role="status" aria-live="polite">
          デッキを読み込んでいます…
        </p>
      )}

      {state.status === 'error' && (
        <div className="status-message status-message--error" role="alert">
          <p>デッキを読み込めませんでした。</p>
          {state.blocked && (
            <p>
              {
                'ほかのタブで HLSieve DB を開いている場合は、そのタブを閉じてから再試行してください。'
              }
            </p>
          )}
          <button type="button" className="button" onClick={retryLoad}>
            再試行
          </button>
        </div>
      )}

      {state.status === 'loaded' && state.decks.length === 0 && (
        <p className="status-message">デッキがありません</p>
      )}

      {state.status === 'loaded' && state.decks.length > 0 && (
        <div className="deck-organization-layout">
          {loadedOrganization && (
            <DeckFolderSidebar
              summaries={summaries}
              selected={folderFilter}
              onSelect={setFolderFilter}
            />
          )}

          {/* Focusable without being in the tab order: where focus lands when
              the button that opened the organize dialog is gone by the time it
              closes, which the deck's own row can be. */}
          <section aria-label="保存したデッキ" tabIndex={-1} ref={deckListRef}>
            {loadedOrganization && (
              <DeckTagFilterChips
                tags={tags}
                selectedTagIds={selectedTagIds}
                onToggle={(tagId) =>
                  setSelectedTagIds((current) =>
                    current.includes(tagId)
                      ? current.filter((id) => id !== tagId)
                      : [...current, tagId],
                  )
                }
              />
            )}

            {organization.status === 'error' && (
              <p className="status-message status-message--error" role="alert">
                フォルダー・タグを読み込めないため、絞り込みと整理は利用できません。ページを再読み込みしてください。
              </p>
            )}

            {/* Narrowed to nothing is not an empty collection, and the way
                back has to be on screen. */}
            {narrowed && visibleDecks.length === 0 && (
              <div className="status-message">
                <p>絞り込み条件に一致するデッキがありません。</p>
                <button type="button" className="button" onClick={clearFilters}>
                  絞り込みを解除
                </button>
              </div>
            )}

            {narrowed && visibleDecks.length > 0 && (
              <p className="deck-organization-filter-summary">
                <span role="status">
                  {visibleDecks.length}件 / {decks.length}件を表示中
                </span>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={clearFilters}
                >
                  絞り込みを解除
                </button>
              </p>
            )}

            <ul className="deck-list">
              {visibleDecks.map((deck) => (
                <li className="deck-list__item" key={deck.id}>
                  <div>
                    <h2>{deck.name}</h2>
                    {/* Shown, never written: opening the list decides nothing
                      about any of these decks. */}
                    <p>
                      <DeckRegulationBadge regulationId={deck.regulationId} />
                    </p>
                    <p>合計 {getDeckTotal(deck)}枚</p>
                    <p>
                      <time dateTime={deck.updatedAt}>
                        更新 {new Date(deck.updatedAt).toLocaleString('ja-JP')}
                      </time>
                    </p>
                    {loadedOrganization && (
                      <DeckCardOrganization
                        deck={deck}
                        organization={organizations.find(
                          (row) => row.deckId === deck.id,
                        )}
                        folders={folders}
                        tags={tags}
                        onOrganize={() => setOrganizingDeckId(deck.id)}
                      />
                    )}
                  </div>
                  <div className="deck-list__actions">
                    <Link
                      className="button detail-link-button"
                      to={`/decks/${encodeURIComponent(deck.id)}`}
                    >
                      開く
                    </Link>
                    <button
                      type="button"
                      className="button button--secondary"
                      aria-label={`${deck.name}を複製`}
                      disabled={duplicatingId !== undefined}
                      onClick={() => void handleDuplicate(deck)}
                    >
                      複製
                    </button>
                    <Link
                      className="button button--secondary detail-link-button"
                      to={`/decks/${encodeURIComponent(deck.id)}/versions`}
                    >
                      バージョン
                    </Link>
                    <button
                      type="button"
                      className="button button--danger"
                      aria-label={`${deck.name}を削除`}
                      onClick={() => void startDelete(deck.id)}
                    >
                      削除
                    </button>
                  </div>
                  {pendingDeleteId === deck.id && (
                    <div
                      className="delete-confirmation"
                      role="alertdialog"
                      aria-label="デッキ削除の確認"
                    >
                      <p>「{deck.name}」を削除しますか？</p>
                      {pendingDeleteVersions !== undefined &&
                        pendingDeleteVersions > 0 && (
                          <p>
                            このデッキのバージョン{pendingDeleteVersions}
                            件も削除されます。
                          </p>
                        )}
                      <div>
                        <button
                          type="button"
                          className="button button--danger"
                          onClick={() => void handleDelete(deck.id)}
                        >
                          削除する
                        </button>
                        <button
                          type="button"
                          className="button button--secondary"
                          onClick={() => {
                            setPendingDeleteId(undefined)
                            setPendingDeleteVersions(undefined)
                          }}
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {loadedOrganization && state.status === 'loaded' && (
        <DeckOrganizationManager
          summaries={summaries}
          tags={tags}
          tagDeckCounts={tagDeckCounts}
          reordering={reorderingFolders}
          error={manageError}
          onCreateFolder={handleCreateFolder}
          onRenameFolder={handleRenameFolder}
          onMoveFolder={handleMoveFolder}
          onDeleteFolder={handleDeleteFolder}
          onCreateTag={handleCreateTag}
          onRenameTag={handleRenameTag}
          onDeleteTag={handleDeleteTag}
        />
      )}

      {organizingDeck && loadedOrganization && (
        <DeckOrganizationDialog
          deckName={organizingDeck.name}
          organization={organizations.find(
            (row) => row.deckId === organizingDeck.id,
          )}
          folders={folders}
          tags={tags}
          saving={savingOrganization}
          returnFocusFallback={deckListRef}
          error={organizationError}
          onSave={(value) =>
            void handleSaveOrganization(organizingDeck.id, value)
          }
          onClose={() => {
            setOrganizingDeckId(undefined)
            setOrganizationError(undefined)
          }}
        />
      )}

      <section
        className="content-surface deck-backup"
        aria-labelledby="deck-backup-heading"
      >
        <h2 id="deck-backup-heading">バックアップ</h2>
        <p>
          デッキはこの端末のブラウザ内に保存されています。大切なデッキは定期的にバックアップしてください。
        </p>
        <p>
          バックアップファイルにはデッキ名とカード番号・枚数が含まれます。ファイルはこの端末へ保存され、外部へ送信されません。
        </p>
        <p>
          HLSieve DBから書き出したデッキバックアップのみ読み込んでください。
        </p>
        <div className="deck-backup__actions">
          <button
            className="button"
            type="button"
            disabled={state.status !== 'loaded' || state.decks.length === 0}
            onClick={exportBackup}
          >
            バックアップを書き出す
          </button>
          <input
            ref={fileInputRef}
            className="deck-backup__file-input"
            id="deck-backup-file"
            type="file"
            accept=".json,application/json"
            aria-label="デッキバックアップJSONファイル"
            disabled={state.status !== 'loaded'}
            onChange={(event) =>
              void selectBackupFile(event.currentTarget.files?.[0])
            }
          />
          <button
            className="button button--secondary"
            type="button"
            disabled={state.status !== 'loaded'}
            onClick={() => fileInputRef.current?.click()}
          >
            バックアップを読み込む
          </button>
        </div>
        {state.status === 'loaded' && state.decks.length === 0 && (
          <p>書き出せるデッキがありません。</p>
        )}
        {backupStatus && (
          <p className="status-message" role="status" aria-live="polite">
            {backupStatus}
          </p>
        )}
        {backupError && (
          <p className="status-message status-message--error" role="alert">
            {backupError}
          </p>
        )}
        {importPreview && (
          <div
            className="deck-backup__preview"
            role="dialog"
            aria-labelledby="deck-import-preview-heading"
          >
            <h3 id="deck-import-preview-heading">読み込み内容の確認</h3>
            <dl>
              <div>
                <dt>ファイル</dt>
                <dd>{importPreview.filename}</dd>
              </div>
              <div>
                <dt>バックアップ日時</dt>
                <dd>
                  {new Date(importPreview.backup.exportedAt).toLocaleDateString(
                    'ja-JP',
                  )}
                </dd>
              </div>
              <div>
                <dt>デッキ</dt>
                <dd>{importPreview.backup.decks.length}件</dd>
              </div>
              <div>
                <dt>新規追加</dt>
                <dd>{importPreview.plan.newCount}件</dd>
              </div>
              <div>
                <dt>既存と同一</dt>
                <dd>{importPreview.plan.identicalCount}件</dd>
              </div>
              <div>
                <dt>ID重複</dt>
                <dd>{importPreview.plan.conflictCount}件</dd>
              </div>
            </dl>
            {importPreview.plan.conflictCount > 0 && (
              <p>
                IDが重複するデッキは、既存データを保護するため別のデッキとして追加されます。既存データは上書きされません。
              </p>
            )}
            <div className="deck-backup__actions">
              <button
                className="button"
                type="button"
                onClick={() => void executeImport()}
              >
                読み込みを実行
              </button>
              <button
                className="button button--secondary"
                type="button"
                onClick={cancelImport}
              >
                キャンセル
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
