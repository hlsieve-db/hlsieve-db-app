import type { NormalizedQaEntry } from './types'

export const OFFICIAL_QA_HOST = 'hololive-official-cardgame.com'

export function buildOfficialQaId(qa: NormalizedQaEntry): string | undefined {
  return qa.qNumber === undefined ? undefined : `Q${qa.qNumber}`
}

export function buildOfficialQaUrl(
  cardOfficialUrl: string,
): string | undefined {
  try {
    const url = new URL(cardOfficialUrl)
    if (url.protocol !== 'https:' || url.host !== OFFICIAL_QA_HOST) {
      return undefined
    }
    url.hash = 'faq'
    return url.toString()
  } catch {
    return undefined
  }
}
