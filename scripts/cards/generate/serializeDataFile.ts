import { stableStringify } from '../hash/stableStringify'
import type { GenerationResult } from './types'

export function serializeDataFile(value: unknown): GenerationResult<string> {
  try {
    stableStringify(value)
    return {
      ok: true,
      value: `${JSON.stringify(value, null, 2)}\n`,
      warnings: [],
    }
  } catch (error) {
    return {
      ok: false,
      errors: [
        {
          code: 'INVALID_JSON_VALUE',
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    }
  }
}
