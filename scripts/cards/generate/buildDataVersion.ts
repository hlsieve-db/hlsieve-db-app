import { createHash } from 'node:crypto'

import { stableStringify } from '../hash/stableStringify'

export function buildDataVersion(payload: unknown): string {
  const digest = createHash('sha256')
    .update(stableStringify(payload), 'utf8')
    .digest('hex')
  return `sha256:${digest}`
}
