import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { AppNavigation } from '../components/AppNavigation'
import { TournamentDistributionDonut } from '../components/tournaments/TournamentDistributionDonut'
import { TournamentWeeklyTrendChart } from '../components/tournaments/TournamentWeeklyTrendChart'
import {
  hasInvalidTournamentAnalysisDateRange,
  parseTournamentAnalysisUrlState,
  serializeTournamentAnalysisUrlState,
  type TournamentAnalysisUrlState,
} from '../domain/tournaments/analysisUrlState'
import {
  aggregateTournamentIndex,
  type TournamentDistribution,
  type TournamentEnvironmentAggregation,
} from '../domain/tournaments/aggregation'
import {
  evaluateTournamentTier,
  type TournamentTier,
  type TournamentTierResult,
  type TournamentTierUnavailableReason,
} from '../domain/tournaments/tier'
import type {
  TournamentIndexFile,
  TournamentOshiMasterFile,
} from '../domain/tournaments/types'
import {
  aggregateTournamentWeeklyTrends,
  type TournamentWeeklyTrendResult,
} from '../domain/tournaments/weeklyTrend'
import { tournamentTypeLabel } from '../domain/tournaments/ui'
import { useDocumentMetadata } from '../hooks/useDocumentMetadata'
import {
  loadTournamentIndex,
  loadTournamentOshiMaster,
} from '../repositories/loadTournamentData'

type IndexState =
  | { status: 'loading' }
  | { status: 'loaded'; data?: TournamentIndexFile }
  | { status: 'error' }

type OshiState =
  | { status: 'loading' }
  | { status: 'loaded'; data: TournamentOshiMasterFile }
  | { status: 'error' }

type TournamentAnalysisPageProps = {
  loadIndex?: () => Promise<TournamentIndexFile | undefined>
  loadOshiMaster?: () => Promise<TournamentOshiMasterFile>
}

function searchString(params: URLSearchParams): string {
  const value = params.toString()
  return value ? `?${value}` : ''
}

function roundValue(round: string | null | undefined): string {
  if (round === null) return 'none'
  return round ?? ''
}

function Ranking({
  distribution,
  master,
}: {
  distribution: TournamentDistribution
  master?: TournamentOshiMasterFile
}) {
  if (distribution.entries.length === 0) {
    return <p className="status-message">対象データがありません。</p>
  }
  return (
    <ol className="tournament-analysis-ranking">
      {distribution.entries.map((entry, index) => (
        <li key={entry.oshiCardNumber}>
          <span className="tournament-analysis-ranking__position">
            {index + 1}位
          </span>
          <span className="tournament-analysis-ranking__identity">
            <strong>
              {master?.cards[entry.oshiCardNumber]?.name ?? '名称不明'}
            </strong>
            <code>{entry.oshiCardNumber}</code>
          </span>
          <span>{entry.count}件</span>
          <span>{entry.percentage.toFixed(1)}%</span>
        </li>
      ))}
    </ol>
  )
}

const TIER_LABELS: readonly TournamentTier[] = ['S', 'A', 'B', 'C']

const TIER_REASON_LABELS: Record<TournamentTierUnavailableReason, string> = {
  'missing-winner-data': '優勝データがありません',
  'missing-placement-data': '入賞データがありません',
  'too-few-winner-results': '優勝データがまだ少ないです',
  'too-few-placement-events': '入賞集計対象の大会数がまだ少ないです',
  'too-few-placement-results': '入賞データがまだ少ないです',
}

function TierPanel({
  result,
  master,
}: {
  result: TournamentTierResult
  master?: TournamentOshiMasterFile
}) {
  return (
    <section
      className="tournament-tier"
      aria-labelledby={`tier-${encodeURIComponent(result.environment.tournamentType)}-${encodeURIComponent(result.environment.round ?? 'none')}`}
    >
      <h3
        id={`tier-${encodeURIComponent(result.environment.tournamentType)}-${encodeURIComponent(result.environment.round ?? 'none')}`}
      >
        収録大会実績Tier
      </h3>
      <p className="tournament-tier__description">
        HLSieveに収録された大会結果における、優勝・上位入賞実績の相対評価です。デッキの絶対的な強さや勝率を示すものではなく、収録範囲内の参考情報です。
      </p>
      <p className="tournament-tier__method">
        優勝構成比と入賞構成比を50:50で評価し、同じ大会環境内の首位実績に対する相対値からTierを決定します。
      </p>
      {result.entries.length === 0 ? (
        <p className="status-message">対象データがありません。</p>
      ) : result.sample.status === 'limited' ? (
        <div className="tournament-tier__limited" role="status">
          <p>収録結果が少ないため、実績Tierはまだ判定していません。</p>
          <dl className="tournament-tier__sample">
            <div>
              <dt>優勝データ</dt>
              <dd>{result.sample.winnerResultCount}件</dd>
            </div>
            <div>
              <dt>入賞対象大会</dt>
              <dd>{result.sample.eligiblePlacementEvents}件</dd>
            </div>
            <div>
              <dt>入賞データ</dt>
              <dd>{result.sample.placementResultCount}件</dd>
            </div>
          </dl>
          <ul className="tournament-tier__reasons">
            {result.sample.reasons.map((reason) => (
              <li key={reason}>{TIER_REASON_LABELS[reason]}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="tournament-tier__groups">
          {TIER_LABELS.map((tier) => {
            const entries = result.entries.filter(
              (entry) => entry.tier === tier,
            )
            if (entries.length === 0) return null
            return (
              <section className="tournament-tier__group" key={tier}>
                <h4>
                  <span className="tournament-tier__badge" aria-hidden="true">
                    {tier}
                  </span>
                  <span>Tier {tier}</span>
                </h4>
                <ul>
                  {entries.map((entry) => (
                    <li key={entry.oshiCardNumber}>
                      <span className="tournament-tier__entry-tier">
                        Tier {tier}
                      </span>
                      <span className="tournament-tier__identity">
                        <strong>
                          {master?.cards[entry.oshiCardNumber]?.name ??
                            '名称不明'}
                        </strong>
                        <code>{entry.oshiCardNumber}</code>
                      </span>
                      <span>
                        優勝 {entry.winnerCount}件 /{' '}
                        {(entry.winnerShare * 100).toFixed(1)}%
                      </span>
                      <span>
                        入賞 {entry.placementCount}件 /{' '}
                        {(entry.placementShare * 100).toFixed(1)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </section>
  )
}

function EnvironmentSection({
  group,
  weeklyTrend,
  master,
}: {
  group: TournamentEnvironmentAggregation
  weeklyTrend?: TournamentWeeklyTrendResult
  master?: TournamentOshiMasterFile
}) {
  const heading = `${tournamentTypeLabel(group.environment.tournamentType)}／${group.environment.round ?? 'ラウンドなし'}`
  const tierResult = evaluateTournamentTier(group)
  return (
    <section
      className="tournament-analysis-environment"
      aria-labelledby={`environment-${encodeURIComponent(group.environment.tournamentType)}-${encodeURIComponent(group.environment.round ?? 'none')}`}
    >
      <h2
        id={`environment-${encodeURIComponent(group.environment.tournamentType)}-${encodeURIComponent(group.environment.round ?? 'none')}`}
      >
        {heading}
      </h2>
      <dl className="tournament-analysis-summary">
        <div>
          <dt>対象大会数</dt>
          <dd>{group.summary.totalEvents}件</dd>
        </div>
        <div>
          <dt>優勝データ件数</dt>
          <dd>{group.summary.winnerResultCount}件</dd>
        </div>
        <div>
          <dt>入賞データ件数</dt>
          <dd>{group.summary.placementResultCount}件</dd>
        </div>
      </dl>
      <TierPanel result={tierResult} master={master} />
      <div className="tournament-analysis-distributions">
        <section>
          <h3>優勝分布</h3>
          <TournamentDistributionDonut
            distribution={group.winners}
            oshiMaster={master}
            title="優勝データ"
            ariaLabel={`${heading}の収録済み大会の優勝分布`}
          />
          <Ranking distribution={group.winners} master={master} />
        </section>
        <section>
          <h3>入賞分布</h3>
          <TournamentDistributionDonut
            distribution={group.placements}
            oshiMaster={master}
            title="入賞データ"
            ariaLabel={`${heading}の収録済み大会の入賞分布`}
          />
          <Ranking distribution={group.placements} master={master} />
        </section>
      </div>
      {weeklyTrend && (
        <TournamentWeeklyTrendChart
          trend={weeklyTrend}
          oshiMaster={master}
          environmentLabel={heading}
        />
      )}
    </section>
  )
}

export function TournamentAnalysisPage({
  loadIndex = loadTournamentIndex,
  loadOshiMaster: loadOshi = loadTournamentOshiMaster,
}: TournamentAnalysisPageProps) {
  useDocumentMetadata({
    title: '大会環境分析 | HLSieve DB',
    description:
      'HLSieveに収録済みの大会結果から推しカードの優勝・入賞分布を確認できます。',
    canonicalPath: '/tournaments/analysis',
  })
  const location = useLocation()
  const navigate = useNavigate()
  const [indexState, setIndexState] = useState<IndexState>({
    status: 'loading',
  })
  const [oshiState, setOshiState] = useState<OshiState>({ status: 'loading' })
  const [loadAttempt, setLoadAttempt] = useState(0)
  const urlState = useMemo(
    () => parseTournamentAnalysisUrlState(location.search),
    [location.search],
  )
  const canonicalSearch = useMemo(
    () => searchString(serializeTournamentAnalysisUrlState(urlState)),
    [urlState],
  )

  useEffect(() => {
    if (location.search !== canonicalSearch) {
      navigate(
        { pathname: '/tournaments/analysis', search: canonicalSearch },
        { replace: true },
      )
    }
  }, [canonicalSearch, location.search, navigate])

  useEffect(() => {
    let active = true
    void loadIndex().then(
      (data) => active && setIndexState({ status: 'loaded', data }),
      () => active && setIndexState({ status: 'error' }),
    )
    void loadOshi().then(
      (data) => active && setOshiState({ status: 'loaded', data }),
      () => active && setOshiState({ status: 'error' }),
    )
    return () => {
      active = false
    }
  }, [loadAttempt, loadIndex, loadOshi])

  const events = useMemo(
    () =>
      indexState.status === 'loaded' ? (indexState.data?.events ?? []) : [],
    [indexState],
  )
  const types = [
    ...new Set(events.map((event) => event.tournament.type)),
  ].sort()
  const rounds = useMemo(
    () =>
      urlState.type
        ? [
            ...new Set(
              events
                .filter((event) => event.tournament.type === urlState.type)
                .map((event) => event.tournament.round),
            ),
          ]
        : [],
    [events, urlState.type],
  )
  const invalidRange = hasInvalidTournamentAnalysisDateRange(urlState)
  const aggregation = useMemo(() => {
    if (indexState.status !== 'loaded' || !indexState.data || invalidRange)
      return undefined
    try {
      return {
        status: 'loaded' as const,
        data: aggregateTournamentIndex(indexState.data, {
          tournamentType: urlState.type,
          round: urlState.round,
          from: urlState.from,
          to: urlState.to,
        }),
      }
    } catch {
      return { status: 'error' as const }
    }
  }, [indexState, invalidRange, urlState])
  const weeklyAggregation = useMemo(() => {
    if (indexState.status !== 'loaded' || !indexState.data || invalidRange)
      return undefined
    try {
      return {
        status: 'loaded' as const,
        data: aggregateTournamentWeeklyTrends(indexState.data, {
          tournamentType: urlState.type,
          round: urlState.round,
          from: urlState.from,
          to: urlState.to,
        }),
      }
    } catch {
      return { status: 'error' as const }
    }
  }, [indexState, invalidRange, urlState])

  useEffect(() => {
    if (
      !urlState.type ||
      urlState.round === undefined ||
      indexState.status !== 'loaded'
    )
      return
    const valid = rounds.some((round) => round === urlState.round)
    if (!valid) {
      const next = { ...urlState, round: undefined }
      navigate(
        {
          pathname: '/tournaments/analysis',
          search: searchString(serializeTournamentAnalysisUrlState(next)),
        },
        { replace: true },
      )
    }
  }, [indexState.status, navigate, rounds, urlState])

  const update = (patch: Partial<TournamentAnalysisUrlState>) => {
    const next = { ...urlState, ...patch }
    navigate({
      pathname: '/tournaments/analysis',
      search: searchString(serializeTournamentAnalysisUrlState(next)),
    })
  }
  const retry = () => {
    setIndexState({ status: 'loading' })
    setOshiState({ status: 'loading' })
    setLoadAttempt((value) => value + 1)
  }

  return (
    <main id="main-content" className="deck-page tournament-analysis-page">
      <AppNavigation />
      <header className="tournament-analysis-page__heading">
        <p className="tournament-list-page__eyebrow">
          収録済み大会データを集計
        </p>
        <h1>大会環境分析</h1>
        <p>この集計はHLSieveに収録済みの大会結果を対象としています。</p>
        <p>データ件数が少ない場合、割合は大きく変動することがあります。</p>
      </header>

      <section
        className="tournament-filters"
        aria-labelledby="analysis-filter-heading"
      >
        <h2 id="analysis-filter-heading">集計条件</h2>
        <div className="tournament-filters__grid">
          <label>
            大会種別
            <select
              value={urlState.type ?? ''}
              onChange={(event) => {
                const type = event.currentTarget.value || undefined
                const keepsRound =
                  type !== undefined &&
                  urlState.round !== undefined &&
                  events.some(
                    (item) =>
                      item.tournament.type === type &&
                      (item.tournament.round ?? null) === urlState.round,
                  )
                update({
                  type,
                  round: keepsRound ? urlState.round : undefined,
                })
              }}
            >
              <option value="">すべて（環境別に表示）</option>
              {types.map((type) => (
                <option key={type} value={type}>
                  {tournamentTypeLabel(type)}
                </option>
              ))}
            </select>
          </label>
          <label>
            ラウンド
            <select
              disabled={!urlState.type}
              value={roundValue(urlState.round)}
              onChange={(event) =>
                update({
                  round:
                    event.currentTarget.value === ''
                      ? undefined
                      : event.currentTarget.value === 'none'
                        ? null
                        : event.currentTarget.value,
                })
              }
            >
              <option value="">すべて</option>
              {rounds.includes(undefined) && (
                <option value="none">ラウンドなし</option>
              )}
              {rounds
                .filter((round): round is string => round !== undefined)
                .sort()
                .map((round) => (
                  <option key={round} value={round}>
                    {round}
                  </option>
                ))}
            </select>
          </label>
          <label>
            開始日
            <input
              type="date"
              min={
                indexState.status === 'loaded'
                  ? indexState.data?.startDate
                  : undefined
              }
              value={urlState.from ?? ''}
              onChange={(event) =>
                update({ from: event.currentTarget.value || undefined })
              }
            />
          </label>
          <label>
            終了日
            <input
              type="date"
              min={
                indexState.status === 'loaded'
                  ? indexState.data?.startDate
                  : undefined
              }
              value={urlState.to ?? ''}
              onChange={(event) =>
                update({ to: event.currentTarget.value || undefined })
              }
            />
          </label>
        </div>
        {invalidRange && (
          <p className="status-message status-message--error" role="alert">
            開始日は終了日以前にしてください。
          </p>
        )}
      </section>

      {indexState.status === 'loading' && (
        <p className="status-message" role="status">
          大会データを読み込んでいます…
        </p>
      )}
      {indexState.status === 'error' && (
        <div className="status-message status-message--error" role="alert">
          <p>大会データを読み込めませんでした。</p>
          <button type="button" className="button" onClick={retry}>
            再試行
          </button>
        </div>
      )}
      {aggregation?.status === 'error' && (
        <p className="status-message status-message--error" role="alert">
          大会データの集計に失敗しました。データの内容を確認してください。
        </p>
      )}
      {weeklyAggregation?.status === 'error' &&
        aggregation?.status !== 'error' && (
          <p className="status-message status-message--error" role="alert">
            週次推移の集計に失敗しました。データの内容を確認してください。
          </p>
        )}
      {oshiState.status === 'error' && indexState.status === 'loaded' && (
        <p className="status-message" role="status">
          推し名称を読み込めませんでした。カード番号で集計を表示します。
        </p>
      )}
      {aggregation?.status === 'loaded' &&
        aggregation.data.summary.totalEvents === 0 &&
        !invalidRange && (
          <p className="status-message">集計可能な大会データがありません。</p>
        )}
      {indexState.status === 'loaded' && !indexState.data && !invalidRange && (
        <p className="status-message">集計可能な大会データがありません。</p>
      )}
      {aggregation?.status === 'loaded' &&
        aggregation.data.groups.length > 0 && (
          <div className="tournament-analysis-results">
            {aggregation.data.groups.map((group) => (
              <EnvironmentSection
                key={`${group.environment.tournamentType}:${group.environment.round ?? 'none'}`}
                group={group}
                weeklyTrend={
                  weeklyAggregation?.status === 'loaded'
                    ? weeklyAggregation.data.groups.find(
                        (weeklyGroup) =>
                          weeklyGroup.environment.tournamentType ===
                            group.environment.tournamentType &&
                          weeklyGroup.environment.round ===
                            group.environment.round,
                      )
                    : undefined
                }
                master={
                  oshiState.status === 'loaded' ? oshiState.data : undefined
                }
              />
            ))}
            <p className="tournament-analysis-coverage-note">
              入賞分布は、複数順位の結果を収録している大会のみを対象にしています。
            </p>
          </div>
        )}
    </main>
  )
}
