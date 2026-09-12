import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { AppNavigation } from '../components/AppNavigation'
import type { Card, CardsDataFile } from '../domain/cards/types'
import { TOURNAMENT_HISTORY_METADATA } from '../domain/site/metadata'
import {
  formatTournamentResultSummary,
  summarizeTournamentRounds,
} from '../domain/tournamentReport/report'
import type { SavedTournamentReport } from '../domain/tournamentReport/savedReport'
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
}

function formatEventDate(value: string): string {
  return value.replaceAll('-', '/')
}

export function TournamentHistoryPage({
  repository = tournamentReportRepository,
  loadCards = loadCardsData,
}: TournamentHistoryPageProps) {
  useDocumentMetadata(TOURNAMENT_HISTORY_METADATA)
  const [state, setState] = useState<HistoryState>({ status: 'loading' })
  const [oshiCards, setOshiCards] = useState<Card[]>([])
  const [pendingDeleteId, setPendingDeleteId] = useState<string>()
  const [feedback, setFeedback] = useState<'idle' | 'deleted' | 'error'>('idle')

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

  return (
    <main className="content-page tournament-history-page">
      <AppNavigation />
      <header className="content-page__header">
        <h1>大会戦績履歴</h1>
        <p>この端末に保存した大会戦績を開き、編集や再出力ができます。</p>
      </header>

      <div className="tournament-history__actions">
        <Link className="button" to="/tournament-report">
          新しい大会戦績を作成
        </Link>
      </div>
      <p className="content-surface tournament-history__notice">
        大会戦績はこの端末のブラウザ内に保存されます。ブラウザのデータを削除すると履歴も削除されます。
      </p>

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
