import {
  compareUnicodeCodePoints,
  stableStringify,
} from '../hash/stableStringify'
import type { ChangedField, DiffCategory } from './types'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value) as object | null
  return prototype === Object.prototype || prototype === null
}

export function diffValues(
  category: DiffCategory,
  before: unknown,
  after: unknown,
  path = '',
): ChangedField[] {
  if (
    before === undefined
      ? after === undefined
      : after !== undefined &&
        stableStringify(before) === stableStringify(after)
  ) {
    return []
  }

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter((key) => before[key] !== undefined || after[key] !== undefined)
      .sort(compareUnicodeCodePoints)
    return keys.flatMap((key) =>
      diffValues(
        category,
        before[key],
        after[key],
        path ? `${path}.${key}` : key,
      ),
    )
  }

  return [{ category, path, before, after }]
}
