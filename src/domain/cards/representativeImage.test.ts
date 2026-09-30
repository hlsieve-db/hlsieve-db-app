import { describe, expect, it } from 'vitest'

import {
  getRepresentativeCardImageUrl,
  selectOldestRepresentativePrinting,
  type RepresentativePrintingCandidate,
} from './representativeImage'

type TestPrinting = RepresentativePrintingCandidate & {
  isParallel?: boolean
}

function printing(
  officialId: string,
  releaseDates: (string | undefined)[],
  overrides: Partial<TestPrinting> = {},
): TestPrinting {
  return {
    officialId,
    imageUrl: `https://img.example/${officialId}.png`,
    products: releaseDates.map((releaseDate) =>
      releaseDate === undefined ? {} : { releaseDate },
    ),
    ...overrides,
  }
}

function selected(
  printings: readonly RepresentativePrintingCandidate[],
): RepresentativePrintingCandidate | undefined {
  return selectOldestRepresentativePrinting(printings).printing
}

describe('selectOldestRepresentativePrinting', () => {
  it('returns the only image printing and handles no printings', () => {
    const only = printing('10', ['2025-01-01'])
    expect(selected([only])).toBe(only)
    expect(selected([])).toBeUndefined()
  })

  it('selects the earliest release date without excluding a parallel', () => {
    const newer = printing('10', ['2026-01-01'])
    const oldestParallel = printing('20', ['2025-01-01'], {
      isParallel: true,
    })
    expect(selected([newer, oldestParallel])).toBe(oldestParallel)
  })

  it('uses numeric officialId ascending for same-day normal, parallel, and SEC printings', () => {
    const normal = printing('9', ['2025-01-01'])
    const parallel = printing('10', ['2025-01-01'], { isParallel: true })
    const sec = printing('11', ['2025-01-01'], { isParallel: true })
    expect(selected([sec, parallel, normal])).toBe(normal)
  })

  it('is independent of input order', () => {
    const input = [
      printing('30', ['2027-01-01']),
      printing('20', ['2025-01-01']),
      printing('10', ['2025-01-01']),
    ]
    expect(selected(input)?.officialId).toBe('10')
    expect(selected([...input].reverse())?.officialId).toBe('10')
  })

  it('ignores image-less printings including the chronologically oldest one', () => {
    const oldestWithoutImage = printing('1', ['2024-01-01'], {
      imageUrl: undefined,
    })
    const nextWithImage = printing('2', ['2025-01-01'])
    expect(selected([oldestWithoutImage, nextWithImage])).toBe(nextWithImage)
    expect(selected([oldestWithoutImage])).toBeUndefined()
  })

  it('uses numeric officialId ascending for multiple unknown dates and reports ambiguity', () => {
    const result = selectOldestRepresentativePrinting([
      printing('10', [undefined]),
      printing('2', []),
    ])
    expect(result.printing?.officialId).toBe('2')
    expect(result.hasUnknownReleaseDateAmbiguity).toBe(true)
  })

  it('accepts one unknown-date printing without reporting ambiguity', () => {
    const result = selectOldestRepresentativePrinting([
      printing('10', [undefined]),
    ])
    expect(result.printing?.officialId).toBe('10')
    expect(result.hasUnknownReleaseDateAmbiguity).toBe(false)
  })

  it('places unknown dates after known dates', () => {
    expect(
      selected([printing('1', [undefined]), printing('99', ['2025-01-01'])])
        ?.officialId,
    ).toBe('99')
  })

  it('uses the earliest valid date across a printing products', () => {
    expect(
      selected([
        printing('1', ['2027-01-01', '2024-01-01']),
        printing('2', ['2025-01-01']),
      ])?.officialId,
    ).toBe('1')
  })
})

describe('getRepresentativeCardImageUrl', () => {
  it('prefers the representative image and falls back to the legacy image', () => {
    expect(
      getRepresentativeCardImageUrl({
        imageUrl: 'https://img.example/default.png',
        representativeImageUrl: 'https://img.example/oldest.png',
      }),
    ).toBe('https://img.example/oldest.png')
    expect(
      getRepresentativeCardImageUrl({
        imageUrl: 'https://img.example/default.png',
      }),
    ).toBe('https://img.example/default.png')
  })
})
