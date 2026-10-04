import { useId, useState } from 'react'

import type { TournamentDistribution } from '../../domain/tournaments/aggregation'
import type { TournamentOshiMasterFile } from '../../domain/tournaments/types'
import {
  buildDonutSegments,
  DONUT_CENTER,
  DONUT_INNER_RADIUS,
} from './chartGeometry'

type TournamentDistributionDonutProps = {
  distribution: TournamentDistribution
  oshiMaster?: TournamentOshiMasterFile
  title: string
  ariaLabel: string
}

export function TournamentDistributionDonut({
  distribution,
  oshiMaster,
  title,
  ariaLabel,
}: TournamentDistributionDonutProps) {
  const [failedImages, setFailedImages] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const reactId = useId()
  const segments = buildDonutSegments(distribution)
  if (segments.length === 0) return null
  const idPrefix = `tournament-donut-${reactId.replace(/[^a-zA-Z0-9_-]/g, '-')}`

  return (
    <figure className="tournament-distribution-chart" data-layout="responsive">
      <svg
        viewBox="0 0 200 200"
        role="img"
        aria-label={ariaLabel}
        aria-describedby={`${idPrefix}-description`}
        data-testid="tournament-distribution-donut"
      >
        <title>{ariaLabel}</title>
        <desc id={`${idPrefix}-description`}>
          {title}
          を件数比で示す補助図です。完全な内訳は直後のランキングで確認できます。
        </desc>
        <defs>
          {segments.map((segment, index) => (
            <clipPath
              id={`${idPrefix}-clip-${index}`}
              key={segment.oshiCardNumber}
            >
              <path d={segment.path} />
            </clipPath>
          ))}
        </defs>
        {segments.map((segment, index) => {
          const card = oshiMaster?.cards[segment.oshiCardNumber]
          const imageUrl = card?.representativeImageUrl
          const failed = failedImages.has(segment.oshiCardNumber)
          return (
            <g
              key={segment.oshiCardNumber}
              data-card-number={segment.oshiCardNumber}
              data-count={segment.count}
              data-image-state={
                !imageUrl ? 'missing' : failed ? 'failed' : 'available'
              }
            >
              <path
                className="tournament-distribution-chart__fallback"
                d={segment.path}
              />
              {imageUrl && !failed && (
                <image
                  href={imageUrl}
                  x="0"
                  y="0"
                  width="200"
                  height="200"
                  preserveAspectRatio="xMidYMid slice"
                  clipPath={`url(#${idPrefix}-clip-${index})`}
                  aria-hidden="true"
                  onError={() =>
                    setFailedImages((current) => {
                      const next = new Set(current)
                      next.add(segment.oshiCardNumber)
                      return next
                    })
                  }
                />
              )}
              <path
                className="tournament-distribution-chart__boundary"
                d={segment.path}
              />
            </g>
          )
        })}
        <circle
          className="tournament-distribution-chart__center"
          cx={DONUT_CENTER}
          cy={DONUT_CENTER}
          r={DONUT_INNER_RADIUS - 1}
        />
        <text
          className="tournament-distribution-chart__center-label"
          x={DONUT_CENTER}
          y={DONUT_CENTER - 4}
          textAnchor="middle"
        >
          {title}
        </text>
        <text
          className="tournament-distribution-chart__center-count"
          x={DONUT_CENTER}
          y={DONUT_CENTER + 15}
          textAnchor="middle"
        >
          {distribution.totalResults}件
        </text>
      </svg>
    </figure>
  )
}
