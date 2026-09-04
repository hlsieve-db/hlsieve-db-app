import { deepEqual } from './deepEqual'

export function canonicalizeForSemanticComparison(value: unknown): unknown {
  if (typeof value === 'string') return value.normalize('NFKC')
  if (Array.isArray(value)) {
    return value.map(canonicalizeForSemanticComparison)
  }
  if (value === null || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      canonicalizeForSemanticComparison(child),
    ]),
  )
}

export function semanticEqual(left: unknown, right: unknown): boolean {
  return deepEqual(
    canonicalizeForSemanticComparison(left),
    canonicalizeForSemanticComparison(right),
  )
}
