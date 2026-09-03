import type { JsonValue } from './types'

export function compareUnicodeCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0) ?? 0)
  const rightPoints = Array.from(right, (value) => value.codePointAt(0) ?? 0)
  const length = Math.min(leftPoints.length, rightPoints.length)

  for (let index = 0; index < length; index += 1) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0)
    if (difference !== 0) return difference
  }
  return leftPoints.length - rightPoints.length
}

function unsupported(path: string, detail: string): never {
  throw new TypeError(`Cannot serialize ${detail} at ${path}`)
}

function serialize(
  value: unknown,
  path: string,
  ancestors: Set<object>,
): string {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) unsupported(path, `non-finite number ${value}`)
    return JSON.stringify(value)
  }
  if (
    typeof value === 'undefined' ||
    typeof value === 'bigint' ||
    typeof value === 'function' ||
    typeof value === 'symbol'
  ) {
    return unsupported(path, typeof value)
  }
  if (typeof value !== 'object') return unsupported(path, typeof value)
  if (ancestors.has(value)) return unsupported(path, 'circular reference')

  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      return `[${value
        .map((entry, index) => serialize(entry, `${path}[${index}]`, ancestors))
        .join(',')}]`
    }

    const prototype = Object.getPrototypeOf(value) as object | null
    if (prototype !== Object.prototype && prototype !== null) {
      return unsupported(path, 'non-plain object')
    }
    const symbols = Object.getOwnPropertySymbols(value).filter((symbol) =>
      Object.prototype.propertyIsEnumerable.call(value, symbol),
    )
    if (symbols.length > 0) return unsupported(path, 'symbol-keyed property')

    const record = value as Record<string, unknown>
    const keys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort(compareUnicodeCodePoints)
    return `{${keys
      .map(
        (key) =>
          `${JSON.stringify(key)}:${serialize(record[key], `${path}.${key}`, ancestors)}`,
      )
      .join(',')}}`
  } finally {
    ancestors.delete(value)
  }
}

export function stableStringify(value: unknown): string {
  return serialize(value, '$', new Set<object>())
}

function convertToJsonValue(
  value: unknown,
  path: string,
): JsonValue | undefined {
  if (value === undefined) return undefined
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) unsupported(path, `non-finite number ${value}`)
    return value
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => {
      const converted = convertToJsonValue(entry, `${path}[${index}]`)
      if (converted === undefined)
        return unsupported(`${path}[${index}]`, 'undefined')
      return converted
    })
  }
  if (typeof value !== 'object' || value === null) {
    return unsupported(path, typeof value)
  }
  const prototype = Object.getPrototypeOf(value) as object | null
  if (prototype !== Object.prototype && prototype !== null) {
    return unsupported(path, 'non-plain object')
  }

  const result: { [key: string]: JsonValue | undefined } = {}
  for (const key of Object.keys(value).sort(compareUnicodeCodePoints)) {
    const converted = convertToJsonValue(
      (value as Record<string, unknown>)[key],
      `${path}.${key}`,
    )
    if (converted !== undefined) result[key] = converted
  }
  return result
}

export function toJsonValue(value: unknown, path = '$'): JsonValue | undefined {
  if (value === undefined) return undefined
  stableStringify(value)
  return convertToJsonValue(value, path)
}
