import { useEffect, useMemo, useState } from 'react'
import { useAppRepositories } from '../repositories/useAppRepositories'
import { Link } from 'react-router-dom'

import { AppNavigation } from '../components/AppNavigation'
import { TournamentLocalNavigation } from '../components/TournamentLocalNavigation'
import type { Card, CardsDataFile } from '../domain/cards/types'
import { TOURNAMENT_STATS_METADATA } from '../domain/site/metadata'
import {
  filterTournamentReportsByDate,
  localTodayDateOnly,
  type TournamentStatsDateFilter,
} from '../domain/tournamentReport/dateFilter'
import type { SavedTournamentReport } from '../domain/tournamentReport/savedReport'
import {
  aggregateTournamentStats,
  formatMatchRecord,
  formatWinRate,
  sortOshiMatchStats,
  type MatchStats,
} from '../domain/tournamentReport/stats'
import {
  formatOshiLabel,
  getOshiCandidates,
} from '../domain/tournamentReport/oshi'
import { useDocumentMetadata } from '../hooks/useDocumentMetadata'
import { loadCardsData } from '../repositories/loadCardsData'
import { type TournamentReportRepository } from '../repositories/tournamentReportRepository'

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; reports: SavedTournamentReport[] }
  | { status: 'error' }

type TournamentStatsPageProps = {
  repository?: TournamentReportRepository
  loadCards?: () => Promise<CardsDataFile>
  today?: () => string
}

type DateFilterType = TournamentStatsDateFilter['type']

function StatBlock({ label, stats }: { label: string; stats: MatchStats }) {
  return (
    <article className="tournament-stat-card">
      <h3>{label}</h3>
      <p>{stats.matches}戦</p>
      <p aria-label={`${label} 戦績 ${formatMatchRecord(stats)}`}>
        {formatMatchRecord(stats)}
      </p>
      <p aria-label={`${label} 勝率 ${formatWinRate(stats.winRate)}`}>
        {formatWinRate(stats.winRate)}
      </p>
    </article>
  )
}

export function TournamentStatsPage({
  repository: repositoryProp,
  loadCards = loadCardsData,
  today = localTodayDateOnly,
}: TournamentStatsPageProps) {
  const repositories = useAppRepositories()
  const repository = repositoryProp ?? repositories.tournamentReports
  useDocumentMetadata(TOURNAMENT_STATS_METADATA)
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [oshiCards, setOshiCards] = useState<Card[]>([])
  const [dateFilterType, setDateFilterType] = useState<DateFilterType>('all')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')

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
  const labelFor = (cardNumber: string) => {
    const card = oshiByNumber.get(cardNumber)
    return card ? formatOshiLabel(card, oshiCards) : '不明な推し'
  }
  const filtered = useMemo(() => {
    if (state.status !== 'loaded') return undefined
    const filter: TournamentStatsDateFilter =
      dateFilterType === 'custom'
        ? {
            type: 'custom',
            startDate: customStartDate,
            endDate: customEndDate,
          }
        : { type: dateFilterType }
    return filterTournamentReportsByDate({
      reports: state.reports,
      filter,
      today: today(),
    })
  }, [customEndDate, customStartDate, dateFilterType, state, today])
  const stats = useMemo(
    () =>
      filtered?.error
        ? undefined
        : aggregateTournamentStats(filtered?.reports ?? []),
    [filtered],
  )

  return (
    <main id="main-content" className="content-page tournament-stats-page">
      <AppNavigation />
      <header className="content-page__header">
        <h1>大会戦績統計</h1>
        <p>保存済みの大会戦績を期間で絞り込んで集計します。</p>
      </header>
      <TournamentLocalNavigation />
      <p className="content-surface tournament-stats__notice">
        この統計は、この端末のブラウザ内に保存された大会戦績のみを集計します。ブラウザデータを削除すると履歴・統計元データも削除されます。
      </p>

      {state.status === 'loading' && (
        <p className="status-message" role="status" aria-live="polite">
          大会戦績を読み込んでいます…
        </p>
      )}
      {state.status === 'error' && (
        <p className="status-message status-message--error" role="alert">
          大会戦績を読み込めませんでした。
        </p>
      )}
      {state.status === 'loaded' && state.reports.length === 0 && (
        <section className="content-surface tournament-stats__empty">
          <h2>保存された大会戦績がありません。</h2>
          <Link className="button" to="/tournament-report">
            大会戦績を作成
          </Link>
        </section>
      )}
      {state.status === 'loaded' && state.reports.length > 0 && (
        <section
          className="content-surface tournament-stats-filter"
          aria-labelledby="stats-period"
        >
          <fieldset>
            <legend id="stats-period">期間</legend>
            <div className="tournament-stats-filter__options">
              {(
                [
                  ['all', '全期間'],
                  ['last30', '直近30日'],
                  ['last90', '直近90日'],
                  ['thisYear', '今年'],
                  ['custom', '期間指定'],
                ] as const
              ).map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="tournament-stats-period"
                    value={value}
                    checked={dateFilterType === value}
                    onChange={() => setDateFilterType(value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {dateFilterType === 'custom' && (
            <div className="tournament-stats-filter__dates">
              <label>
                開始日
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(event) => setCustomStartDate(event.target.value)}
                />
              </label>
              <span aria-hidden="true">～</span>
              <label>
                終了日
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(event) => setCustomEndDate(event.target.value)}
                />
              </label>
            </div>
          )}
          <p className="tournament-stats-filter__summary" aria-live="polite">
            集計期間: {filtered?.label}
          </p>
          <p>開催日未入力の大会は期間指定時の集計対象外です。</p>
          {filtered?.missingEventDateCount ? (
            <p>
              開催日未入力の大会 {filtered.missingEventDateCount}
              件は期間集計から除外されています。
            </p>
          ) : null}
          {filtered?.error && (
            <p className="status-message status-message--error" role="alert">
              {filtered.error}
            </p>
          )}
        </section>
      )}
      {filtered &&
        !filtered.error &&
        state.status === 'loaded' &&
        state.reports.length > 0 &&
        filtered.reports.length === 0 && (
          <section className="content-surface tournament-stats__empty">
            <h2>選択した期間に大会戦績がありません。</h2>
            <button
              className="button"
              type="button"
              onClick={() => setDateFilterType('all')}
            >
              全期間を見る
            </button>
          </section>
        )}
      {stats &&
        state.status === 'loaded' &&
        state.reports.length > 0 &&
        filtered?.reports.length !== 0 && (
          <div className="tournament-stats-sections">
            <section
              className="content-surface"
              aria-labelledby="stats-overall"
            >
              <h2 id="stats-overall">概要</h2>
              <div className="tournament-stats-summary">
                <article>
                  <h3>大会数</h3>
                  <p>{stats.tournamentCount}</p>
                </article>
                <article>
                  <h3>総対戦</h3>
                  <p>{stats.overall.matches}</p>
                </article>
                <article>
                  <h3>通算戦績</h3>
                  <p>{formatMatchRecord(stats.overall)}</p>
                </article>
                <article>
                  <h3>勝率</h3>
                  <p>{formatWinRate(stats.overall.winRate)}</p>
                </article>
              </div>
              <p className="tournament-stats__definition">
                勝率 = WIN ÷ 総対戦数（DRAWも分母に含みます）
              </p>
              {stats.overall.matches === 0 && (
                <p>対戦結果が入力された大会がありません。</p>
              )}
            </section>

            <section className="content-surface" aria-labelledby="stats-stage">
              <h2 id="stats-stage">Swiss / Tournament</h2>
              <div className="tournament-stat-grid">
                <StatBlock label="Swiss" stats={stats.swiss} />
                <StatBlock label="Tournament" stats={stats.tournament} />
              </div>
            </section>

            <section className="content-surface" aria-labelledby="stats-order">
              <h2 id="stats-order">先攻 / 後攻</h2>
              <div className="tournament-stat-grid">
                <StatBlock label="先攻" stats={stats.byPlayOrder.first} />
                <StatBlock label="後攻" stats={stats.byPlayOrder.second} />
              </div>
              <p>手番未入力: {stats.missingCounts.playOrderMatches}戦</p>
            </section>

            <section
              className="content-surface"
              aria-labelledby="stats-initiative"
            >
              <h2 id="stats-initiative">手番選択権</h2>
              <p>⚀○ = choiceを取れた / ⚀× = choiceを取れなかった</p>
              <div className="tournament-stat-grid">
                <StatBlock label="⚀○" stats={stats.byInitiative.wonChoice} />
                <StatBlock label="⚀×" stats={stats.byInitiative.lostChoice} />
              </div>
              <p>手番選択権未入力: {stats.missingCounts.initiativeMatches}戦</p>
            </section>

            <section
              className="content-surface"
              aria-labelledby="stats-own-oshi"
            >
              <h2 id="stats-own-oshi">使用推し別</h2>
              {stats.byOwnOshi.length === 0 ? (
                <p>集計できる使用推しがありません。</p>
              ) : (
                <ul className="tournament-oshi-stats-list">
                  {sortOshiMatchStats(stats.byOwnOshi, labelFor).map(
                    (entry) => (
                      <li
                        className="tournament-oshi-stat-card"
                        key={entry.cardNumber}
                      >
                        <h3>{labelFor(entry.cardNumber)}</h3>
                        <p>
                          {entry.tournamentCount}大会 / {entry.matches}戦
                        </p>
                        <p>
                          {formatMatchRecord(entry)} / 勝率{' '}
                          {formatWinRate(entry.winRate)}
                        </p>
                      </li>
                    ),
                  )}
                </ul>
              )}
              <p>
                使用推し未入力: {stats.missingCounts.ownOshiTournaments}大会
              </p>
            </section>

            <section
              className="content-surface"
              aria-labelledby="stats-opponent-oshi"
            >
              <h2 id="stats-opponent-oshi">対推し別</h2>
              {stats.byOpponentOshi.length === 0 ? (
                <p>集計できる対戦相手の推しがありません。</p>
              ) : (
                <ul className="tournament-oshi-stats-list">
                  {sortOshiMatchStats(stats.byOpponentOshi, labelFor).map(
                    (entry) => (
                      <li
                        className="tournament-oshi-stat-card"
                        key={entry.cardNumber}
                      >
                        <h3>{labelFor(entry.cardNumber)}</h3>
                        <p>{entry.matches}戦</p>
                        <p>
                          {formatMatchRecord(entry)} / 勝率{' '}
                          {formatWinRate(entry.winRate)}
                        </p>
                      </li>
                    ),
                  )}
                </ul>
              )}
              <p>
                対戦相手の推し未入力: {stats.missingCounts.opponentOshiMatches}
                戦
              </p>
            </section>
          </div>
        )}
    </main>
  )
}
