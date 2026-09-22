/**
 * The short form of a deck share link: /s/<shareId>.
 *
 * The long /deck/share?d=... URL carries the deck in the link itself and keeps
 * working with no server at all. A short link instead names a snapshot the
 * server holds, so it stays readable when pasted into places that mangle or
 * truncate long URLs.
 */

/**
 * Eight base62 characters. Case sensitive, so a link that arrives lowercased
 * is a different id rather than a near miss, and is reported as not found.
 */
export const SHORT_SHARE_ID_PATTERN = /^[A-Za-z0-9]{8}$/u

export const SHORT_SHARE_ID_LENGTH = 8

export function isShortShareId(value: string): boolean {
  return SHORT_SHARE_ID_PATTERN.test(value)
}

export function buildShortShareUrl(shareId: string, origin: string): string {
  if (!isShortShareId(shareId)) {
    throw new Error('Share id is not a short share id.')
  }
  // Built from origin rather than concatenated, so a caller cannot turn this
  // into a link to somewhere else.
  return new URL(`/s/${shareId}`, origin).toString()
}
