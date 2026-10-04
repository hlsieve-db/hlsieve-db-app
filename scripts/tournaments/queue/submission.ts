const OFFICIAL_ORIGIN = 'https://www.bushi-navi.com'
const MAX_SAFE_EVENT_ID = BigInt(Number.MAX_SAFE_INTEGER)
const MAX_EVENT_ID_LENGTH = String(Number.MAX_SAFE_INTEGER).length

export class TournamentSubmissionError extends Error {
  readonly code = 'invalid-input'
}

export function parseTournamentSourceEventId(input: string): string {
  const trimmed = input.trim()
  if (/^[0-9]+$/.test(trimmed)) return canonicalEventId(trimmed)
  if (input !== trimmed) {
    throw new TournamentSubmissionError(
      'Tournament Result URL must not contain whitespace.',
    )
  }
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new TournamentSubmissionError(
      'Tournament submission must be an Event ID or official Result URL.',
    )
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'www.bushi-navi.com' ||
    url.host !== 'www.bushi-navi.com' ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new TournamentSubmissionError(
      'Tournament Result URL is not an allowed official URL.',
    )
  }
  const match = url.pathname.match(/^\/event\/result\/([0-9]+)$/)
  if (!match?.[1]) {
    throw new TournamentSubmissionError(
      'Tournament Result URL path is invalid.',
    )
  }
  const sourceEventId = canonicalEventId(match[1])
  if (input !== buildOfficialTournamentResultUrl(sourceEventId)) {
    throw new TournamentSubmissionError(
      'Tournament Result URL is not canonical.',
    )
  }
  return sourceEventId
}

function canonicalEventId(input: string): string {
  if (input.length > MAX_EVENT_ID_LENGTH) {
    throw new TournamentSubmissionError('Tournament Event ID is too long.')
  }
  const value = BigInt(input)
  if (value <= 0n || value > MAX_SAFE_EVENT_ID) {
    throw new TournamentSubmissionError(
      'Tournament Event ID is outside the supported range.',
    )
  }
  return value.toString()
}

export function buildOfficialTournamentResultUrl(
  sourceEventId: string,
): string {
  const canonical = canonicalEventId(sourceEventId)
  if (canonical !== sourceEventId) {
    throw new TournamentSubmissionError(
      'Tournament Event ID must be canonical.',
    )
  }
  return `${OFFICIAL_ORIGIN}/event/result/${canonical}`
}
