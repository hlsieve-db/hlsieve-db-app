import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { AppNavigation } from '../components/AppNavigation'
import { TournamentLocalNavigation } from '../components/TournamentLocalNavigation'
import type { Card, CardsDataFile } from '../domain/cards/types'
import { TOURNAMENT_HISTORY_METADATA } from '../domain/site/metadata'
import {
  formatTournamentResultSummary,
  summarizeTournamentRounds,
} from '../domain/tournamentReport/report'
import type { SavedTournamentReport } from '../domain/tournamentReport/savedReport'
import {
  createTournamentBackup,
  createTournamentBackupFilename,
  MAX_TOURNAMENT_BACKUP_FILE_SIZE,
  parseTournamentBackup,
  planTournamentBackupImport,
  serializeTournamentBackup,
  type TournamentBackup,
  type TournamentImportPlan,
} from '../domain/tournamentReport/backup'
import {
  formatOshiLabel,
  getOshiCandidates,
} from '../domain/tournamentReport/oshi'
import { useDocumentMetadata } from '../hooks/useDocumentMetadata'
import { loadCardsData } from '../repositories/loadCardsData'
import {
  tournamentReportRepository,
  type TournamentReportRepository,
} from '../repositories/tournamentReportRepository'

type HistoryState =
  | { status: 'loading' }
  | { status: 'loaded'; reports: SavedTournamentReport[] }
  | { status: 'error' }

type TournamentHistoryPageProps = {
  repository?: TournamentReportRepository
  loadCards?: () => Promise<CardsDataFile>
  now?: () => Date
  createImportId?: () => string
  downloadFile?: (filename: string, contents: string) => void
}

type ImportPreview = {
  backup: TournamentBackup
  plan: TournamentImportPlan
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

function formatEventDate(value: string): string {
  return value.replaceAll('-', '/')
}

export function TournamentHistoryPage({
  repository = tournamentReportRepository,
  loadCards = loadCardsData,
  now = () => new Date(),
  createImportId = () => crypto.randomUUID(),
  downloadFile = downloadJsonFile,
}: TournamentHistoryPageProps) {
  useDocumentMetadata(TOURNAMENT_HISTORY_METADATA)
  const [state, setState] = useState<HistoryState>({ status: 'loading' })
  const [oshiCards, setOshiCards] = useState<Card[]>([])
  const [pendingDeleteId, setPendingDeleteId] = useState<string>()
  const [feedback, setFeedback] = useState<'idle' | 'deleted' | 'error'>('idle')
  const [importPreview, setImportPreview] = useState<ImportPreview>()
  const [backupError, setBackupError] = useState<string>()
  const [backupStatus, setBackupStatus] = useState<string>()
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    void repository.listReports().then(
      (reports) => active && setState({ status: 'loaded', reports }),
      () => active && setState({ status: 'error' }),
    )
    void loadCards().then(
      (data) => active && setOshiCards(getOshiCandidates(data.cards)),
      () => undefined,
    )
    return () => {
      active = false
    }
  }, [loadCards, repository])

  const oshiByNumber = useMemo(
    () => new Map(oshiCards.map((card) => [card.cardNumber, card])),
    [oshiCards],
  )

  const deleteReport = async (id: string) => {
    setFeedback('idle')
    try {
      await repository.deleteReport(id)
      setState((current) =>
        current.status === 'loaded'
          ? {
              status: 'loaded',
              reports: current.reports.filter((report) => report.id !== id),
            }
          : current,
      )
      setPendingDeleteId(undefined)
      setFeedback('deleted')
    } catch {
      setFeedback('error')
    }
  }

  const resetFileInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const exportBackup = () => {
    if (state.status !== 'loaded' || state.reports.length === 0) return
    setBackupError(undefined)
    try {
      const date = now()
      const backup = createTournamentBackup(state.reports, date.toISOString())
      downloadFile(
        createTournamentBackupFilename(date),
        serializeTournamentBackup(backup),
      )
      setBackupStatus('大会戦績バックアップを書き出しました。')
    } catch {
      setBackupError('大会戦績バックアップを書き出せませんでした。')
    }
  }

  const selectBackupFile = async (file: File | undefined) => {
    setBackupError(undefined)
    setBackupStatus(undefined)
    setImportPreview(undefined)
    if (!file) return
    if (file.size > MAX_TOURNAMENT_BACKUP_FILE_SIZE) {
      setBackupError('ファイルサイズが大きすぎます。')
      resetFileInput()
      return
    }
    try {
      const parsed = parseTournamentBackup(await file.text())
      if (!parsed.ok) {
        setBackupError(parsed.message)
        resetFileInput()
        return
      }
      const existing = state.status === 'loaded' ? state.reports : []
      setImportPreview({
        backup: parsed.backup,
        plan: planTournamentBackupImport(
          parsed.backup.reports,
          existing,
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
      await repository.importReports(importPreview.plan.records)
      const reports = await repository.listReports()
      setState({ status: 'loaded', reports })
      setBackupStatus(
        `バックアップを読み込みました。追加: ${importPreview.plan.newCount}件、同一のためスキップ: ${importPreview.plan.identicalCount}件、ID重複のため別履歴として追加: ${importPreview.plan.conflictCount}件。`,
      )
      setImportPreview(undefined)
      resetFileInput()
    } catch {
      setBackupError(
        'バックアップを読み込めませんでした。既存の大会戦績は変更されていません。',
      )
    }
  }

  return (
    <main id="main-content" className="content-page tournament-history-page">
      <AppNavigation />
      <header className="content-page__header">
        <h1>大会戦績履歴</h1>
        <p>この端末に保存した大会戦績を開き、編集や再出力ができます。</p>
      </header>
      <TournamentLocalNavigation />

      <div className="tournament-history__actions">
        <Link className="button" to="/tournament-report">
          新しい大会戦績を作成
        </Link>
      </div>
      <p className="content-surface tournament-history__notice">
        大会戦績はこの端末のブラウザ内に保存されます。ブラウザのデータを削除すると履歴も削除されます。
      </p>

      <section
        className="content-surface tournament-backup"
        aria-labelledby="tournament-backup-heading"
      >
        <h2 id="tournament-backup-heading">バックアップ</h2>
        <p>
          大会戦績はブラウザ内に保存されています。大切な戦績は定期的にバックアップしてください。
        </p>
        <p>
          バックアップには大会名、順位、使用推し、対戦相手の推し、対戦結果などが含まれます。ファイルはこの端末へ保存され、外部へ送信されません。
        </p>
        <p>
          HLSieve DBから書き出した大会戦績バックアップのみ読み込んでください。
        </p>
        <div className="tournament-backup__actions">
          <button
            className="button"
            type="button"
            disabled={state.status !== 'loaded' || state.reports.length === 0}
            onClick={exportBackup}
          >
            バックアップを書き出す
          </button>
          <input
            ref={fileInputRef}
            className="tournament-backup__file-input"
            id="tournament-backup-file"
            type="file"
            accept=".json,application/json"
            aria-label="大会戦績バックアップJSONファイル"
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
        {state.status === 'loaded' && state.reports.length === 0 && (
          <p>書き出せる大会戦績がありません。</p>
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
            className="tournament-backup__preview"
            role="dialog"
            aria-labelledby="tournament-import-preview-heading"
          >
            <h3 id="tournament-import-preview-heading">読み込み内容の確認</h3>
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
                <dt>大会戦績</dt>
                <dd>{importPreview.backup.reports.length}件</dd>
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
                IDが重複する大会戦績は、既存データを保護するため別の履歴として追加されます。既存データは上書きされません。
              </p>
            )}
            <div className="tournament-backup__actions">
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

      {feedback === 'deleted' && (
        <p className="status-message" role="status" aria-live="polite">
          大会戦績を削除しました。
        </p>
      )}
      {feedback === 'error' && (
        <p className="status-message status-message--error" role="alert">
          大会戦績を削除できませんでした。
        </p>
      )}
      {state.status === 'loading' && (
        <p className="status-message" role="status">
          大会戦績を読み込んでいます…
        </p>
      )}
      {state.status === 'error' && (
        <p className="status-message status-message--error" role="alert">
          大会戦績履歴を読み込めませんでした。
        </p>
      )}
      {state.status === 'loaded' && state.reports.length === 0 && (
        <section className="content-surface tournament-history__empty">
          <h2>保存された大会戦績はありません。</h2>
          <Link className="button" to="/tournament-report">
            大会戦績を作成
          </Link>
        </section>
      )}
      {state.status === 'loaded' && state.reports.length > 0 && (
        <section aria-label="保存した大会戦績">
          <ul className="tournament-history-list">
            {state.reports.map((saved) => {
              const { report } = saved
              const selfOshi = report.selfOshiCardNumber
                ? oshiByNumber.get(report.selfOshiCardNumber)
                : undefined
              const swiss = summarizeTournamentRounds(report.swissRounds)
              const tournament = summarizeTournamentRounds(
                report.tournamentRounds,
              )
              return (
                <li
                  className="content-surface tournament-history-card"
                  key={saved.id}
                >
                  <div className="tournament-history-card__body">
                    {report.eventDate && (
                      <time dateTime={report.eventDate}>
                        {formatEventDate(report.eventDate)}
                      </time>
                    )}
                    <h2>{report.tournamentName.trim() || '大会名未入力'}</h2>
                    {report.placement.trim() && <p>{report.placement}</p>}
                    {report.selfOshiCardNumber && (
                      <p>
                        使用推し:{' '}
                        {selfOshi
                          ? formatOshiLabel(selfOshi, oshiCards)
                          : '現在のカードデータでは確認できません'}
                      </p>
                    )}
                    <div className="tournament-history-card__results">
                      {swiss.completedRounds > 0 && (
                        <span>
                          Swiss {formatTournamentResultSummary(swiss)}
                        </span>
                      )}
                      {tournament.completedRounds > 0 && (
                        <span>
                          Tournament {formatTournamentResultSummary(tournament)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="tournament-history-card__actions">
                    <Link
                      className="button"
                      to={`/tournament-report?id=${encodeURIComponent(saved.id)}`}
                      aria-label={`${report.tournamentName.trim() || '大会名未入力'}を開く`}
                    >
                      開く
                    </Link>
                    <button
                      className="button button--danger"
                      type="button"
                      aria-label={`${report.tournamentName.trim() || '大会名未入力'}を削除`}
                      onClick={() => setPendingDeleteId(saved.id)}
                    >
                      削除
                    </button>
                  </div>
                  {pendingDeleteId === saved.id && (
                    <div
                      className="delete-confirmation"
                      role="alertdialog"
                      aria-label="大会戦績削除の確認"
                    >
                      <p>この大会戦績を削除しますか？</p>
                      <div>
                        <button
                          className="button button--danger"
                          type="button"
                          onClick={() => void deleteReport(saved.id)}
                        >
                          削除する
                        </button>
                        <button
                          className="button button--secondary"
                          type="button"
                          onClick={() => setPendingDeleteId(undefined)}
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </main>
  )
}
