import type { RawProductBlock } from '../parser/types'
import type { NormalizeIssue, NormalizedProduct } from './types'
import { normalizeDisplayText, normalizeOptionalText } from './normalizeValues'

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
    return leap ? 29 : 28
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

export function normalizeJapaneseReleaseDate(
  value: string | undefined,
): string | undefined {
  const normalized = normalizeOptionalText(value)
  const match = normalized?.match(/^(\d{4})年(\d{2})月(\d{2})日\([^)]+\)$/)
  if (!match) {
    return undefined
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return undefined
  }

  return `${match[1]}-${match[2]}-${match[3]}`
}

export function normalizeProducts(blocks: RawProductBlock[]): {
  value: NormalizedProduct[]
  warnings: NormalizeIssue[]
} {
  const products: NormalizedProduct[] = []
  const warnings: NormalizeIssue[] = []
  const seen = new Set<string>()

  blocks.forEach((block, index) => {
    const name = normalizeDisplayText(block.productNameRaw)
    if (!name) {
      warnings.push({
        code: 'MISSING_PRODUCT_NAME',
        message: `Product block ${index} has no name and was skipped.`,
      })
      return
    }

    const category = normalizeOptionalText(block.categoryRaw)
    const detailUrl = normalizeOptionalText(block.detailUrl)
    const releaseDate = normalizeJapaneseReleaseDate(block.releaseDateRaw)
    if (block.releaseDateRaw && !releaseDate) {
      warnings.push({
        code: 'INVALID_RELEASE_DATE',
        message: `Product block ${index} has an invalid release date: ${block.releaseDateRaw}`,
      })
    }

    const product: NormalizedProduct = {
      name,
      ...(category ? { category } : {}),
      ...(releaseDate ? { releaseDate } : {}),
      ...(detailUrl ? { detailUrl } : {}),
    }
    const key = JSON.stringify(product)
    if (!seen.has(key)) {
      seen.add(key)
      products.push(product)
    }
  })

  return { value: products, warnings }
}
