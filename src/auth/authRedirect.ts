/**
 * Where a provider sends the visitor back to. Always built from the current
 * origin, never from anything the visitor can influence, so this cannot turn
 * into an open redirect. Works unchanged on localhost, a Pages preview and
 * production.
 */
export const AUTH_REDIRECT_PATH = '/account'

export function authRedirectUrl(
  origin: string = window.location.origin,
): string {
  return new URL(AUTH_REDIRECT_PATH, origin).toString()
}
