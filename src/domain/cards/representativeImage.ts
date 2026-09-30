import type { Card } from './types'

type ProductWithReleaseDate = {
  releaseDate?: string
}

export type RepresentativePrintingCandidate = {
  officialId: string
  isParallel?: boolean
  imageUrl?: string
  products: readonly ProductWithReleaseDate[]
}

export type RepresentativePrintingSelection<
  T extends RepresentativePrintingCandidate,
> = {
  printing?: T
  hasUnknownReleaseDateAmbiguity: boolean
}

function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  )
}

function earliestProductReleaseDate(
  printing: RepresentativePrintingCandidate,
): string | undefined {
  return printing.products
    .map((product) => product.releaseDate)
    .filter(
      (releaseDate): releaseDate is string =>
        releaseDate !== undefined && isValidIsoDate(releaseDate),
    )
    .sort()[0]
}

function compareOfficialIds(left: string, right: string): number {
  if (/^\d+$/.test(left) && /^\d+$/.test(right)) {
    const leftNumber = BigInt(left)
    const rightNumber = BigInt(right)
    return leftNumber < rightNumber ? -1 : leftNumber > rightNumber ? 1 : 0
  }
  return left < right ? -1 : left > right ? 1 : 0
}

export function selectOldestRepresentativePrinting<
  T extends RepresentativePrintingCandidate,
>(printings: readonly T[]): RepresentativePrintingSelection<T> {
  const candidates = printings
    .filter(
      (printing): printing is T & { imageUrl: string } =>
        typeof printing.imageUrl === 'string' && printing.imageUrl.length > 0,
    )
    .map((printing) => ({
      printing,
      releaseDate: earliestProductReleaseDate(printing),
    }))

  candidates.sort((left, right) => {
    if (left.releaseDate !== right.releaseDate) {
      if (left.releaseDate === undefined) return 1
      if (right.releaseDate === undefined) return -1
      return left.releaseDate < right.releaseDate ? -1 : 1
    }
    return compareOfficialIds(
      left.printing.officialId,
      right.printing.officialId,
    )
  })

  return {
    ...(candidates[0] ? { printing: candidates[0].printing } : {}),
    hasUnknownReleaseDateAmbiguity:
      candidates.length > 1 &&
      candidates.some((candidate) => candidate.releaseDate === undefined),
  }
}

export function getRepresentativeCardImageUrl(
  card: Pick<Card, 'representativeImageUrl' | 'imageUrl'>,
): string | undefined {
  return card.representativeImageUrl ?? card.imageUrl
}
