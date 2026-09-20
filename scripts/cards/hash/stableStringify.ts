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

/**
 * Rejects anything that is not a plain object, so Date, Map, Set and class
 * instances cannot reach a snapshot through JSON.stringify's coercions.
 */
function assertPlainObject(value: object, path: string): void {
  const prototype = Object.getPrototypeOf(value) as object | null
  if (prototype !== Object.prototype && prototype !== null) {
    unsupported(path, 'non-plain object')
  }
  const symbols = Object.getOwnPropertySymbols(value).filter((symbol) =>
    Object.prototype.propertyIsEnumerable.call(value, symbol),
  )
  if (symbols.length > 0) unsupported(path, 'symbol-keyed property')
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

    assertPlainObject(value, path)

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

function assertSerializable(
  value: unknown,
  path: string,
  ancestors: Set<object>,
): void {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) unsupported(path, `non-finite number ${value}`)
    return
  }
  if (
    typeof value === 'undefined' ||
    typeof value === 'bigint' ||
    typeof value === 'function' ||
    typeof value === 'symbol'
  ) {
    unsupported(path, typeof value)
  }
  if (typeof value !== 'object') unsupported(path, typeof value)
  const container = value as object
  if (ancestors.has(container)) unsupported(path, 'circular reference')

  ancestors.add(container)
  try {
    if (Array.isArray(container)) {
      container.forEach((entry, index) =>
        assertSerializable(entry, `${path}[${index}]`, ancestors),
      )
      return
    }

    assertPlainObject(container, path)

    const record = container as Record<string, unknown>
    for (const key of Object.keys(record)) {
      if (record[key] === undefined) continue
      assertSerializable(record[key], `${path}.${key}`, ancestors)
    }
  } finally {
    ancestors.delete(container)
  }
}

/**
 * Applies exactly the rules stableStringify enforces, without building the
 * serialized string. Callers that only need the safety gate should use this;
 * the traversal is an order of magnitude cheaper on large snapshots.
 */
export function assertJsonSerializable(value: unknown, path = '$'): void {
  assertSerializable(value, path, new Set<object>())
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
