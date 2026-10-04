import type { TournamentDistribution } from '../../domain/tournaments/aggregation'

const CENTER = 100
const OUTER_RADIUS = 78
const INNER_RADIUS = 42
const START_ANGLE = -Math.PI / 2

export type DonutSegment = {
  oshiCardNumber: string
  count: number
  startAngle: number
  endAngle: number
  path: string
}

function point(radius: number, angle: number): [number, number] {
  return [CENTER + radius * Math.cos(angle), CENTER + radius * Math.sin(angle)]
}

function donutPath(startAngle: number, endAngle: number): string {
  const span = endAngle - startAngle
  if (Math.abs(span - Math.PI * 2) < 1e-10) {
    const outerTop = point(OUTER_RADIUS, START_ANGLE)
    const outerBottom = point(OUTER_RADIUS, START_ANGLE + Math.PI)
    const innerTop = point(INNER_RADIUS, START_ANGLE)
    const innerBottom = point(INNER_RADIUS, START_ANGLE + Math.PI)
    return [
      `M ${outerTop[0]} ${outerTop[1]}`,
      `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 1 1 ${outerBottom[0]} ${outerBottom[1]}`,
      `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 1 1 ${outerTop[0]} ${outerTop[1]}`,
      `L ${innerTop[0]} ${innerTop[1]}`,
      `A ${INNER_RADIUS} ${INNER_RADIUS} 0 1 0 ${innerBottom[0]} ${innerBottom[1]}`,
      `A ${INNER_RADIUS} ${INNER_RADIUS} 0 1 0 ${innerTop[0]} ${innerTop[1]}`,
      'Z',
    ].join(' ')
  }
  const outerStart = point(OUTER_RADIUS, startAngle)
  const outerEnd = point(OUTER_RADIUS, endAngle)
  const innerEnd = point(INNER_RADIUS, endAngle)
  const innerStart = point(INNER_RADIUS, startAngle)
  const largeArc = span > Math.PI ? 1 : 0
  return [
    `M ${outerStart[0]} ${outerStart[1]}`,
    `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 ${largeArc} 1 ${outerEnd[0]} ${outerEnd[1]}`,
    `L ${innerEnd[0]} ${innerEnd[1]}`,
    `A ${INNER_RADIUS} ${INNER_RADIUS} 0 ${largeArc} 0 ${innerStart[0]} ${innerStart[1]}`,
    'Z',
  ].join(' ')
}

export function buildDonutSegments(
  distribution: TournamentDistribution,
): DonutSegment[] {
  if (distribution.totalResults <= 0) return []
  let consumed = 0
  return distribution.entries.map((entry, index) => {
    const startAngle =
      START_ANGLE + (consumed / distribution.totalResults) * Math.PI * 2
    consumed += entry.count
    const endAngle =
      index === distribution.entries.length - 1
        ? START_ANGLE + Math.PI * 2
        : START_ANGLE + (consumed / distribution.totalResults) * Math.PI * 2
    return {
      oshiCardNumber: entry.oshiCardNumber,
      count: entry.count,
      startAngle,
      endAngle,
      path: donutPath(startAngle, endAngle),
    }
  })
}

export const DONUT_CENTER = CENTER
export const DONUT_INNER_RADIUS = INNER_RADIUS
