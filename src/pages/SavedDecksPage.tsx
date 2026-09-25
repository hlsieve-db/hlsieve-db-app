import { useEffect, useRef, useState } from 'react'
import { useAppRepositories } from '../repositories/useAppRepositories'
import { Link, useNavigate } from 'react-router-dom'

import { AppNavigation } from '../components/AppNavigation'
import { DeckLocalNavigation } from '../components/DeckLocalNavigation'
import { DeckRegulationBadge } from '../components/decks/DeckRegulationBadge'
import { createDeck, getDeckTotal } from '../domain/decks/deck'
import { duplicateDeck } from '../domain/decks/duplicate'
import {
  createDeckBackup,
  createDeckBackupFilename,
  MAX_DECK_BACKUP_FILE_SIZE,
  parseDeckBackup,
  planDeckBackupImport,
  serializeDeckBackup,
  type DeckBackup,
  type DeckImportPlan,
} from '../domain/decks/backup'
import type { Deck } from '../domain/decks/types'
import { type DeckBackupRepository } from '../repositories/deckRepository'
import { type DeckVersionRepository } from '../repositories/deckVersionRepository'
import { useDocumentMetadata } from '../hooks/useDocumentMetadata'

type DeckListState =
  | { status: 'loading' }
  | { status: 'loaded'; decks: Deck[] }
  | { status: 'error' }

type SavedDecksPageProps = {
  repository?: DeckBackupRepository
  /** Supplied by tests; production takes it from the account's repositories. */
  deckVersions?: DeckVersionRepository
  createNewDeck?: () => Deck
  now?: () => Date
  createImportId?: () => string
  downloadFile?: (filename: string, contents: string) => void
}

type ImportPreview = {
  backup: DeckBackup
  plan: DeckImportPlan
  filename: string
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
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    void repository.listDecks().then(
      (decks) => {
        if (active) setState({ status: 'loaded', decks })
      },
      () => {
        if (active) setState({ status: 'error' })
      },
    )
    return () => {
      active = false
    }
  }, [loadAttempt, repository])

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
      await repository.saveDeck(copy)
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

  const resetFileInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const exportBackup = () => {
    if (state.status !== 'loaded' || state.decks.length === 0) return
    setBackupError(undefined)
    try {
      const date = now()
      const backup = createDeckBackup(state.decks, date.toISOString())
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
      setImportPreview({
        backup: parsed.backup,
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
      await repository.importDecks(importPreview.plan.decks)
      const decks = await repository.listDecks()
      setState({ status: 'loaded', decks })
      setBackupStatus(
        `バックアップを読み込みました。追加: ${importPreview.plan.newCount}件、同一のためスキップ: ${importPreview.plan.identicalCount}件、ID重複のため別デッキとして追加: ${importPreview.plan.conflictCount}件。`,
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
          <button type="button" className="button" onClick={retryLoad}>
            再試行
          </button>
        </div>
      )}

      {state.status === 'loaded' && state.decks.length === 0 && (
        <p className="status-message">デッキがありません</p>
      )}

      {state.status === 'loaded' && state.decks.length > 0 && (
        <section aria-label="保存したデッキ">
          <ul className="deck-list">
            {state.decks.map((deck) => (
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
