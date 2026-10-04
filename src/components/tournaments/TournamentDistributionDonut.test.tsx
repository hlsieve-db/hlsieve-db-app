import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { TournamentDistribution } from '../../domain/tournaments/aggregation'
import type { TournamentOshiMasterFile } from '../../domain/tournaments/types'
import { TournamentDistributionDonut } from './TournamentDistributionDonut'
import { buildDonutSegments } from './chartGeometry'

function distribution(counts: Array<[string, number]>): TournamentDistribution {
  const totalResults = counts.reduce((total, [, count]) => total + count, 0)
  return {
    totalResults,
    entries: counts.map(([oshiCardNumber, count]) => ({
      oshiCardNumber,
      count,
      percentage: totalResults === 0 ? 0 : (count / totalResults) * 100,
    })),
  }
}

const master = {
  format: 'hlsieve-tournament-oshi-master',
  formatVersion: 1,
  cardsDataVersion: 'test',
  cards: {
    A: { name: 'A', representativeImageUrl: 'https://example.com/a.webp' },
    B: { name: 'B', representativeImageUrl: 'https://example.com/b.webp' },
    C: { name: 'C', imageUrl: 'https://example.com/forbidden.webp' },
  },
} as unknown as TournamentOshiMasterFile

describe('TournamentDistributionDonut geometry', () => {
  it('renders a non-empty full ring for one 100% category', () => {
    const segments = buildDonutSegments(distribution([['A', 1]]))
    expect(segments).toHaveLength(1)
    expect(segments[0].endAngle - segments[0].startAngle).toBeCloseTo(
      Math.PI * 2,
    )
    expect(segments[0].path).toContain('A 78 78 0 1 1')
    expect(segments[0].path.match(/A 78 78/g)).toHaveLength(2)
    expect(segments[0].path).not.toContain('NaN')
  })

  it('uses count ratios for two halves, three thirds, and a tiny segment', () => {
    const halves = buildDonutSegments(
      distribution([
        ['A', 1],
        ['B', 1],
      ]),
    )
    expect(halves[0].endAngle - halves[0].startAngle).toBeCloseTo(Math.PI)
    expect(halves[1].endAngle - halves[1].startAngle).toBeCloseTo(Math.PI)

    const thirds = buildDonutSegments(
      distribution([
        ['A', 1],
        ['B', 1],
        ['C', 1],
      ]),
    )
    expect(thirds).toHaveLength(3)
    expect(thirds.every((segment) => !segment.path.includes('NaN'))).toBe(true)
    expect(thirds.at(-1)!.endAngle - thirds[0].startAngle).toBeCloseTo(
      Math.PI * 2,
    )

    const tiny = buildDonutSegments(
      distribution([
        ['A', 999],
        ['B', 1],
      ]),
    )
    expect(tiny[1].endAngle - tiny[1].startAngle).toBeCloseTo(
      (Math.PI * 2) / 1000,
    )
  })

  it('uses raw counts rather than rounded presentation percentages', () => {
    const source: TournamentDistribution = {
      totalResults: 3,
      entries: ['A', 'B', 'C'].map((oshiCardNumber) => ({
        oshiCardNumber,
        count: 1,
        percentage: 33,
      })),
    }
    const segments = buildDonutSegments(source)
    expect(segments[0].endAngle - segments[0].startAngle).toBeCloseTo(
      (Math.PI * 2) / 3,
    )
    expect(segments.at(-1)!.endAngle - segments[0].startAngle).toBeCloseTo(
      Math.PI * 2,
    )
  })
})

describe('TournamentDistributionDonut rendering', () => {
  it('keeps a responsive width and theme-variable segment boundaries', () => {
    const { container } = render(
      <TournamentDistributionDonut
        distribution={distribution([['A', 1]])}
        oshiMaster={master}
        title="優勝データ"
        ariaLabel="収録済み大会の優勝分布"
      />,
    )
    expect(container.querySelector('figure')).toHaveAttribute(
      'data-layout',
      'responsive',
    )
    expect(
      container.querySelector('.tournament-distribution-chart__boundary'),
    ).toBeInTheDocument()
  })

  it('keeps stable entry order and uses representativeImageUrl only', () => {
    render(
      <TournamentDistributionDonut
        distribution={distribution([
          ['B', 2],
          ['A', 1],
          ['C', 1],
        ])}
        oshiMaster={master}
        title="優勝データ"
        ariaLabel="収録済み大会の優勝分布"
      />,
    )
    expect(
      screen.getByRole('img', { name: '収録済み大会の優勝分布' }),
    ).toBeVisible()
    expect(
      [...document.querySelectorAll('[data-card-number]')].map((node) =>
        node.getAttribute('data-card-number'),
      ),
    ).toEqual(['B', 'A', 'C'])
    expect(
      [...document.querySelectorAll('image')].map((node) =>
        node.getAttribute('href'),
      ),
    ).toEqual(['https://example.com/b.webp', 'https://example.com/a.webp'])
    expect(document.querySelector('[data-card-number="C"]')).toHaveAttribute(
      'data-image-state',
      'missing',
    )
    expect(screen.getByText('4件')).toBeVisible()
  })

  it('preserves the segment and fallback when an image fails', () => {
    render(
      <TournamentDistributionDonut
        distribution={distribution([['A', 1]])}
        oshiMaster={master}
        title="入賞データ"
        ariaLabel="収録済み大会の入賞分布"
      />,
    )
    const image = document.querySelector('image')!
    fireEvent.error(image)
    expect(document.querySelector('image')).toBeNull()
    expect(document.querySelector('[data-card-number="A"]')).toHaveAttribute(
      'data-image-state',
      'failed',
    )
    expect(
      document.querySelectorAll('.tournament-distribution-chart__fallback'),
    ).toHaveLength(1)
  })

  it('does not render an empty donut', () => {
    const { container } = render(
      <TournamentDistributionDonut
        distribution={distribution([])}
        oshiMaster={master}
        title="優勝データ"
        ariaLabel="収録済み大会の優勝分布"
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
