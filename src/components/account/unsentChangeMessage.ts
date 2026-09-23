/**
 * What to say about changes this device has not managed to send.
 *
 * Three lines rather than one, because the states call for different things
 * from the reporter: an attempt under way needs nothing, an attempt that has
 * not happened yet will happen by itself, and one that failed will be tried
 * again rather than being lost.
 *
 * None of them says the two sides agree. Nothing is pulled down on its own, so
 * the account can hold changes this device has never seen, and "in sync" or
 * "up to date" would be a promise the app cannot keep.
 */
export const UNSENT_CHANGE_MESSAGES = {
  retrying: '再送しています…',
  waiting: '通信が回復すると自動で再送します',
  failed: 'まだ送信できていない変更があります。通信が回復すると再試行します。',
} as const

export function unsentChangeMessage({
  retrying,
  retryFailed,
}: {
  retrying: boolean
  retryFailed: boolean
}): string {
  if (retrying) return UNSENT_CHANGE_MESSAGES.retrying
  return retryFailed
    ? UNSENT_CHANGE_MESSAGES.failed
    : UNSENT_CHANGE_MESSAGES.waiting
}
