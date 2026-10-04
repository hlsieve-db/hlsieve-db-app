import { useState } from 'react'

import type {
  TournamentTrendMetric,
  TournamentTrendPartialReason,
  TournamentWeeklyTrendPoint,
  TournamentWeeklyTrendResult,
} from '../../domain/tournaments/weeklyTrend'
import type { TournamentOshiMasterFile } from '../../domain/tournaments/types'

type Props = {
  trend: TournamentWeeklyTrendResult
  oshiMaster?: TournamentOshiMasterFile
  environmentLabel: string
}

type Series = 'winner' | 'placement'

const PARTIAL_LABELS: Record<TournamentTrendPartialReason, string> = {
  'data-start': '収録開始を含む',
  'filter-start': '指定期間の開始を含む',
  'filter-end': '指定期間の終了を含む',
}

function weekLabel(start: string, end: string): string {
  const [startYear, startMonth, startDay] = start.split('-')
  const [endYear, endMonth, endDay] = end.split('-')
  const startLabel = `${Number(startMonth)}/${Number(startDay)}`
  const endLabel = `${Number(endMonth)}/${Number(endDay)}`
  return startYear === endYear
    ? `${startLabel}〜${endLabel}`
    : `${startYear}/${startLabel}〜${endYear}/${endLabel}`
}

function pointMetric(
  point: TournamentWeeklyTrendPoint,
  cardNumber: string,
  series: Series,
): TournamentTrendMetric {
  const entry = point.entries.find((item) => item.oshiCardNumber === cardNumber)
  return entry?.[series] ?? { count: 0, totalResults: 0, share: null }
}

function coordinates(
  points: readonly TournamentWeeklyTrendPoint[],
  cardNumber: string,
  series: Series,
) {
  return points.map((point, index) => {
    const metric = pointMetric(point, cardNumber, series)
    return {
      point,
      metric,
      x: points.length === 1 ? 320 : 52 + (index / (points.length - 1)) * 568,
      y: metric.share === null ? null : 220 - metric.share * 190,
    }
  })
}

function lineSegments(values: ReturnType<typeof coordinates>): string[] {
  const segments: string[] = []
  let current: string[] = []
  for (const value of values) {
    if (value.y === null) {
      if (current.length > 1) segments.push(current.join(' '))
      current = []
    } else {
      current.push(`${current.length === 0 ? 'M' : 'L'} ${value.x} ${value.y}`)
    }
  }
  if (current.length > 1) segments.push(current.join(' '))
  return segments
}

function MetricText({
  label,
  metric,
}: {
  label: string
  metric: TournamentTrendMetric
}) {
  return (
    <span>
      <strong>{label}</strong> {metric.count}件 / {metric.totalResults}件 ·{' '}
      {metric.share === null
        ? 'データなし'
        : `${(metric.share * 100).toFixed(1)}%`}
    </span>
  )
}

export function TournamentWeeklyTrendChart({
  trend,
  oshiMaster,
  environmentLabel,
}: Props) {
  const [selectedCardNumber, setSelectedCardNumber] = useState(
    () => trend.candidates[0] ?? '',
  )
  const [previousCandidates, setPreviousCandidates] = useState(trend.candidates)
  if (previousCandidates !== trend.candidates) {
    setPreviousCandidates(trend.candidates)
    setSelectedCardNumber((current) =>
      trend.candidates.includes(current)
        ? current
        : (trend.candidates[0] ?? ''),
    )
  }
  const effectiveCardNumber = trend.candidates.includes(selectedCardNumber)
    ? selectedCardNumber
    : (trend.candidates[0] ?? '')

  if (!effectiveCardNumber) {
    return (
      <section
        className="tournament-weekly-trend"
        aria-labelledby={`weekly-${environmentLabel}`}
      >
        <h3 id={`weekly-${environmentLabel}`}>週次推移</h3>
        <p className="status-message">
          週次推移を表示できる推しデータがありません。
        </p>
      </section>
    )
  }

  const winnerValues = coordinates(trend.points, effectiveCardNumber, 'winner')
  const placementValues = coordinates(
    trend.points,
    effectiveCardNumber,
    'placement',
  )
  const hasChartData = [...winnerValues, ...placementValues].some(
    (value) => value.y !== null,
  )
  const label = oshiMaster?.cards[effectiveCardNumber]?.name ?? '名称不明'

  return (
    <section
      className="tournament-weekly-trend"
      aria-labelledby={`weekly-${environmentLabel}`}
    >
      <h3 id={`weekly-${environmentLabel}`}>週次推移</h3>
      <p>
        HLSieveに収録された大会結果内の推移です。週ごとの件数が少ない場合、割合は大きく変動することがあります。
      </p>
      <label className="tournament-weekly-trend__selector">
        推しカード
        <select
          value={effectiveCardNumber}
          onChange={(event) => setSelectedCardNumber(event.currentTarget.value)}
        >
          {trend.candidates.map((cardNumber) => (
            <option key={cardNumber} value={cardNumber}>
              {oshiMaster?.cards[cardNumber]?.name ?? '名称不明'}（{cardNumber}
              ）
            </option>
          ))}
        </select>
      </label>
      <div className="tournament-weekly-trend__legend" aria-label="系列凡例">
        <span>
          <i className="tournament-weekly-trend__key tournament-weekly-trend__key--winner" />
          優勝構成比
        </span>
        <span>
          <i className="tournament-weekly-trend__key tournament-weekly-trend__key--placement" />
          入賞構成比
        </span>
      </div>
      {hasChartData && (
        <figure className="tournament-weekly-trend__chart">
          <svg
            viewBox="0 0 640 260"
            role="img"
            aria-label={`${environmentLabel}の${label}（${effectiveCardNumber}）の週次推移`}
          >
            <title>{environmentLabel}の週次推移</title>
            <desc>
              優勝構成比と入賞構成比を0%から100%の同じ尺度で示します。データなしの週では線が途切れます。完全な数値は直後の週別一覧で確認できます。
            </desc>
            {[0, 0.5, 1].map((value) => {
              const y = 220 - value * 190
              return (
                <g key={value}>
                  <line
                    className="tournament-weekly-trend__grid"
                    x1="52"
                    x2="620"
                    y1={y}
                    y2={y}
                  />
                  <text x="6" y={y + 5}>
                    {value * 100}%
                  </text>
                </g>
              )
            })}
            {(
              [
                ['winner', winnerValues],
                ['placement', placementValues],
              ] as const
            ).map(([series, values]) => (
              <g key={series} data-series={series}>
                {lineSegments(values).map((path, index) => (
                  <path
                    key={index}
                    className={`tournament-weekly-trend__line tournament-weekly-trend__line--${series}`}
                    d={path}
                  />
                ))}
                {values
                  .filter((value) => value.y !== null)
                  .map((value) => (
                    <circle
                      key={value.point.weekStart}
                      className={`tournament-weekly-trend__point tournament-weekly-trend__point--${series}`}
                      data-share={value.metric.share}
                      data-week={value.point.weekStart}
                      cx={value.x}
                      cy={value.y!}
                      r="4"
                    />
                  ))}
              </g>
            ))}
          </svg>
        </figure>
      )}
      <ul
        className="tournament-weekly-trend__weeks"
        aria-label={`${label}の週別数値`}
      >
        {trend.points.map((point) => {
          const winner = pointMetric(point, effectiveCardNumber, 'winner')
          const placement = pointMetric(point, effectiveCardNumber, 'placement')
          return (
            <li key={point.weekStart}>
              <strong>{weekLabel(point.weekStart, point.weekEnd)}</strong>
              {point.isPartial && (
                <span className="tournament-weekly-trend__partial">
                  一部期間（
                  {point.partialReasons
                    .map((reason) => PARTIAL_LABELS[reason])
                    .join('、')}
                  ）
                </span>
              )}
              <span>収録対象大会 {point.summary.totalEvents}件</span>
              <MetricText label="優勝" metric={winner} />
              <MetricText label="入賞" metric={placement} />
            </li>
          )
        })}
      </ul>
    </section>
  )
}
