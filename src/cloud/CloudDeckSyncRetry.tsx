import { useEffect, useRef } from 'react'

import { namespaceKey } from '../auth/authState'
import { isCloudSyncEnabled } from '../domain/cloud/cloudSyncState'
import { recordCloudUploadSuccess } from '../domain/cloud/cloudUploadStatus'
import { useAppRepositories } from '../repositories/useAppRepositories'
import {
  retryPendingDeckSync,
  type PendingDeckSyncRetryResult,
} from './retryPendingDeckSync'

/**
 * Finishes sending deck changes that could not reach the account when they were
 * made. Renders nothing.
 *
 * It runs once when an account's repositories are ready, and again when the
 * browser comes back online, which are the two moments something that failed
 * has a new chance of working. There is no polling: a timer would spend an
 * offline visitor's battery re-failing, and every other retry opportunity is an
 * ordinary save, which sends itself.
 *
 * Nothing here uploads a deck the reporter did not change. The queue holds only
 * changes that were already attempted and refused, so signing in on a new
 * device cannot cause an upload.
 */

/**
 * Whether the last attempt got everything up. A store that could not be read
 * counts as not sent, since the entries are still queued either way.
 */
export type CloudDeckSyncRetryOutcome = 'ok' | 'failed'

export type CloudDeckSyncRetryProps = {
  /** Supplied by tests; production reads the browser's own store. */
  storage?: Pick<Storage, 'getItem' | 'setItem'>
  /** Called after each attempt, so the account panel can update its count. */
  onRetried?: (outcome: CloudDeckSyncRetryOutcome) => void
  /**
   * Called as an attempt starts and finishes, so the panel can say a send is
   * under way. Never persisted: a reload has no attempt running, and showing
   * one would be a lie the reporter cannot clear.
   */
  onRetryingChange?: (retrying: boolean) => void
}

/**
 * One attempt at a time per account, across every mount.
 *
 * The app renders one of these and the account panel renders another, and a
 * development build invokes each effect twice, so a per-instance guard would
 * still let two attempts read the same queue and send the same decks at once.
 *
 * Keyed by account rather than shared by all of them. A single promise would
 * mean a second account arriving mid-attempt waiting on the first account's
 * work and then reporting itself finished, leaving its own queue unsent.
 * Different accounts have different queues, so they retry independently, and a
 * failure for one cannot hold up another.
 */
const inFlight = new Map<
  string,
  Promise<PendingDeckSyncRetryResult | undefined>
>()

export function CloudDeckSyncRetry({
  storage,
  onRetried,
  onRetryingChange,
}: CloudDeckSyncRetryProps) {
  const { namespace, localDecks, cloudDecks } = useAppRepositories()
  // Held in refs so a caller passing fresh functions each render does not
  // re-arm the listener, and assigned in an effect rather than during render.
  const notify = useRef(onRetried)
  const notifyRetrying = useRef(onRetryingChange)
  useEffect(() => {
    notify.current = onRetried
    notifyRetrying.current = onRetryingChange
  }, [onRetried, onRetryingChange])

  useEffect(() => {
    if (!cloudDecks) return

    let cancelled = false

    const key = namespaceKey(namespace)

    const attempt = async () => {
      // Checked here rather than once outside, so an account that turns sync
      // off is not retried by an already-armed listener.
      if (!isCloudSyncEnabled(namespace, storage)) return

      // Reported only to this account's listener, and only while it is still
      // mounted, so an attempt left over from a previous account cannot make
      // the current one look busy.
      const report = (result: PendingDeckSyncRetryResult | undefined) => {
        if (cancelled) return
        notifyRetrying.current?.(false)
        notify.current?.(result?.ok ? 'ok' : 'failed')
      }

      const running = inFlight.get(key)
      if (running) {
        // Same account, so the attempt already running is doing this caller's
        // work too. Waiting for it and then reporting keeps a panel's count
        // correct without sending anything twice.
        if (!cancelled) notifyRetrying.current?.(true)
        report(await running)
        return
      }

      if (!cancelled) notifyRetrying.current?.(true)

      const attemptPromise = retryPendingDeckSync({
        decks: localDecks,
        cloudDecks,
        isSyncEnabled: () => isCloudSyncEnabled(namespace, storage),
        namespace,
        storage,
        // Per entry rather than per attempt, so a run that sends some and then
        // fails still records that this device got something up.
        onUploadSuccess: () =>
          recordCloudUploadSuccess(undefined, storage, namespace),
      }).catch(() => {
        // A throw here means the device's own store could not be read, which
        // a cloud failure result cannot express. The entries stay queued for
        // the next attempt and nothing is shown: the reporter's decks are
        // already saved on the device, and this is work they did not ask for.
        // Swallowed rather than left to reject, so an attempt this one is
        // shared with does not fail with it.
        return undefined
      })
      inFlight.set(key, attemptPromise)
      let result: PendingDeckSyncRetryResult | undefined
      try {
        result = await attemptPromise
      } finally {
        // Only if this attempt is still the current one, so a later attempt
        // for the same account is not cleared by an earlier one finishing.
        if (inFlight.get(key) === attemptPromise) inFlight.delete(key)
      }
      report(result)
    }

    void attempt()
    window.addEventListener('online', attempt)
    return () => {
      cancelled = true
      window.removeEventListener('online', attempt)
    }
  }, [cloudDecks, localDecks, namespace, storage])

  return null
}
