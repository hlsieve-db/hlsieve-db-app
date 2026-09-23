import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  readPendingDeckSync,
  writePendingDeckSync,
  type PendingDeckSyncQueue,
} from '../domain/cloud/pendingDeckSync'
import type { Deck } from '../domain/decks/types'
import {
  ANONYMOUS_LOCAL_DATA_NAMESPACE,
  userLocalDataNamespace,
  type LocalDataNamespace,
} from '../domain/storage/localDataNamespace'
import type { AppRepositories } from '../repositories/appRepositories'
import { AppRepositoriesContext } from '../repositories/appRepositoriesContext'
import type {
  CloudDeckRecord,
  CloudDeckRepository,
} from './cloudDeckRepository'
import { CloudDeckSyncRetry } from './CloudDeckSyncRetry'

const userA = userLocalDataNamespace('user-a')

function deck(id: string): Deck {
  return {
    id,
    name: `デッキ ${id}`,
    entries: [{ cardNumber: 'hBP04-042', quantity: 4 }],
    createdAt: '2026-09-22T00:00:00.000Z',
    updatedAt: '2026-09-22T00:00:00.000Z',
  }
}

function record(id: string): CloudDeckRecord {
  return {
    id,
    deck: deck(id),
    createdAt: '2026-09-22T04:00:00.000000+00:00',
    updatedAt: '2026-09-22T04:00:00.000000+00:00',
    deletedAt: null,
  }
}

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  }
}

function cloudRepository(
  overrides: Partial<CloudDeckRepository> = {},
): CloudDeckRepository {
  return {
    listAll: vi.fn(async () => ({ ok: true as const, value: [] })),
    listUpdatedSince: vi.fn(async () => ({ ok: true as const, value: [] })),
    upsert: vi.fn(async (value: Deck) => ({
      ok: true as const,
      value: record(value.id),
    })),
    tombstone: vi.fn(async (id: string) => ({
      ok: true as const,
      value: { ...record(id), deletedAt: '2026-09-22T05:00:00.000000+00:00' },
    })),
    ...overrides,
  }
}

const ENABLED = '{"version":1,"status":"enabled"}'

function renderRetry({
  queue = { a: 'upsert' } as PendingDeckSyncQueue,
  namespace = userA as LocalDataNamespace,
  cloudDecks = cloudRepository() as CloudDeckRepository | null,
  enabled = true,
  syncKey = 'hlsieve:cloud-sync--user-a',
}: {
  queue?: PendingDeckSyncQueue
  namespace?: LocalDataNamespace
  cloudDecks?: CloudDeckRepository | null
  enabled?: boolean
  syncKey?: string
} = {}) {
  const storage = memoryStorage(enabled ? { [syncKey]: ENABLED } : {})
  writePendingDeckSync(queue, storage, namespace)
  const onRetried = vi.fn()
  const repositories = {
    namespace,
    localDecks: { getDeck: vi.fn(async (id: string) => deck(id)) },
    cloudDecks,
  } as unknown as AppRepositories

  render(
    <AppRepositoriesContext.Provider value={repositories}>
      <CloudDeckSyncRetry storage={storage} onRetried={onRetried} />
    </AppRepositoriesContext.Provider>,
  )
  return { storage, cloudDecks, onRetried, namespace }
}

describe('finishing unsent changes when the account is ready', () => {
  it('sends the queue once the repositories are available', async () => {
    const { cloudDecks, storage } = renderRetry()

    await waitFor(() =>
      expect(cloudDecks?.upsert).toHaveBeenCalledWith(deck('a')),
    )
    await waitFor(() => expect(readPendingDeckSync(storage, userA)).toEqual({}))
  })

  it('renders nothing', () => {
    const { container } = render(
      <AppRepositoriesContext.Provider
        value={
          {
            namespace: userA,
            localDecks: { getDeck: vi.fn() },
            cloudDecks: null,
          } as unknown as AppRepositories
        }
      >
        <CloudDeckSyncRetry storage={memoryStorage()} />
      </AppRepositoriesContext.Provider>,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('leaves the queue alone when a send fails again', async () => {
    const cloudDecks = cloudRepository({
      upsert: vi.fn(async () => ({
        ok: false as const,
        reason: 'network' as const,
      })),
    })
    const { storage, onRetried } = renderRetry({ cloudDecks })

    await waitFor(() => expect(onRetried).toHaveBeenCalled())
    expect(readPendingDeckSync(storage, userA)).toEqual({ a: 'upsert' })
  })
})

describe('when it must not run', () => {
  // Signing in must never cause an upload. Only changes already attempted and
  // refused are in the queue, and an account that never turned sync on has no
  // business sending anything.
  it('sends nothing while sync has not been enabled', async () => {
    const { cloudDecks, storage } = renderRetry({ enabled: false })

    await Promise.resolve()
    expect(cloudDecks?.upsert).not.toHaveBeenCalled()
    // The queue is kept for when sync is on.
    expect(readPendingDeckSync(storage, userA)).toEqual({ a: 'upsert' })
  })

  it('sends nothing for an anonymous visitor', async () => {
    const { cloudDecks } = renderRetry({
      namespace: ANONYMOUS_LOCAL_DATA_NAMESPACE,
      enabled: false,
    })

    await Promise.resolve()
    expect(cloudDecks?.upsert).not.toHaveBeenCalled()
  })

  it('does nothing without a cloud repository', async () => {
    const { onRetried } = renderRetry({ cloudDecks: null })

    await Promise.resolve()
    expect(onRetried).not.toHaveBeenCalled()
  })
})

describe('coming back online', () => {
  it('tries again when the browser reconnects', async () => {
    const cloudDecks = cloudRepository({
      upsert: vi
        .fn()
        .mockResolvedValueOnce({ ok: false, reason: 'network' })
        .mockResolvedValue({ ok: true, value: record('a') }),
    })
    const { storage } = renderRetry({ cloudDecks })

    await waitFor(() => expect(cloudDecks.upsert).toHaveBeenCalledTimes(1))
    expect(readPendingDeckSync(storage, userA)).toEqual({ a: 'upsert' })

    window.dispatchEvent(new Event('online'))

    await waitFor(() => expect(readPendingDeckSync(storage, userA)).toEqual({}))
    expect(cloudDecks.upsert).toHaveBeenCalledTimes(2)
  })

  // Two attempts at once would read the same queue and send the same decks
  // twice.
  it('does not start a second attempt while one is running', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const cloudDecks = cloudRepository({
      upsert: vi.fn(async (value: Deck) => {
        await gate
        return { ok: true as const, value: record(value.id) }
      }),
    })
    renderRetry({ cloudDecks })

    await waitFor(() => expect(cloudDecks.upsert).toHaveBeenCalledTimes(1))
    window.dispatchEvent(new Event('online'))
    window.dispatchEvent(new Event('online'))
    await Promise.resolve()

    // Still just the one in flight.
    expect(cloudDecks.upsert).toHaveBeenCalledTimes(1)
    release?.()
  })

  it('stops listening once it is unmounted', async () => {
    const storage = memoryStorage({ 'hlsieve:cloud-sync--user-a': ENABLED })
    writePendingDeckSync({ a: 'upsert' }, storage, userA)
    const cloudDecks = cloudRepository()
    const { unmount } = render(
      <AppRepositoriesContext.Provider
        value={
          {
            namespace: userA,
            localDecks: { getDeck: vi.fn(async () => deck('a')) },
            cloudDecks,
          } as unknown as AppRepositories
        }
      >
        <CloudDeckSyncRetry storage={storage} />
      </AppRepositoriesContext.Provider>,
    )

    await waitFor(() => expect(cloudDecks.upsert).toHaveBeenCalledTimes(1))
    unmount()
    window.dispatchEvent(new Event('online'))
    await Promise.resolve()

    expect(cloudDecks.upsert).toHaveBeenCalledTimes(1)
  })
})

describe('more than one of these mounted at once', () => {
  // The app renders one and the account panel renders another, and a
  // development build invokes each effect twice, so the guard has to hold
  // across instances rather than within one.
  it('still sends the queue only once', async () => {
    const storage = memoryStorage({
      'hlsieve:cloud-sync--user-a': ENABLED,
    })
    writePendingDeckSync({ a: 'upsert' }, storage, userA)
    const cloudDecks = cloudRepository()
    const repositories = {
      namespace: userA,
      localDecks: { getDeck: vi.fn(async () => deck('a')) },
      cloudDecks,
    } as unknown as AppRepositories

    render(
      <AppRepositoriesContext.Provider value={repositories}>
        <CloudDeckSyncRetry storage={storage} />
        <CloudDeckSyncRetry storage={storage} />
      </AppRepositoriesContext.Provider>,
    )

    await waitFor(() => expect(readPendingDeckSync(storage, userA)).toEqual({}))
    expect(cloudDecks.upsert).toHaveBeenCalledTimes(1)
  })

  // The second one waits for the first rather than skipping silently, so a
  // panel showing the count still learns the queue has emptied.
  it('tells the second one when the first has finished', async () => {
    const storage = memoryStorage({
      'hlsieve:cloud-sync--user-a': ENABLED,
    })
    writePendingDeckSync({ a: 'upsert' }, storage, userA)
    const onRetried = vi.fn()
    const repositories = {
      namespace: userA,
      localDecks: { getDeck: vi.fn(async () => deck('a')) },
      cloudDecks: cloudRepository(),
    } as unknown as AppRepositories

    render(
      <AppRepositoriesContext.Provider value={repositories}>
        <CloudDeckSyncRetry storage={storage} />
        <CloudDeckSyncRetry storage={storage} onRetried={onRetried} />
      </AppRepositoriesContext.Provider>,
    )

    await waitFor(() => expect(onRetried).toHaveBeenCalled())
  })
})

/**
 * One attempt at a time per account, not one across all of them. A single
 * shared promise would mean a second account arriving mid-attempt waiting on
 * the first account's work and then reporting itself finished, leaving its own
 * queue unsent.
 */
describe('two accounts retrying around each other', () => {
  const userB = userLocalDataNamespace('user-b')

  function gate() {
    let release: (() => void) | undefined
    const promise = new Promise<void>((resolve) => {
      release = resolve
    })
    return { promise, release: () => release?.() }
  }

  function mount(
    namespace: LocalDataNamespace,
    storage: ReturnType<typeof memoryStorage>,
    cloudDecks: CloudDeckRepository,
    onRetried?: () => void,
  ) {
    return (
      <AppRepositoriesContext.Provider
        value={
          {
            namespace,
            localDecks: { getDeck: vi.fn(async (id: string) => deck(id)) },
            cloudDecks,
          } as unknown as AppRepositories
        }
      >
        <CloudDeckSyncRetry storage={storage} onRetried={onRetried} />
      </AppRepositoriesContext.Provider>
    )
  }

  function bothEnabled() {
    const storage = memoryStorage({
      'hlsieve:cloud-sync--user-a': ENABLED,
      'hlsieve:cloud-sync--user-b': ENABLED,
    })
    writePendingDeckSync({ a: 'upsert' }, storage, userA)
    writePendingDeckSync({ b: 'upsert' }, storage, userB)
    return storage
  }

  // Same account: the second caller shares the attempt already running.
  it('sends once when the same account retries twice at once', async () => {
    const storage = bothEnabled()
    const held = gate()
    const cloudDecks = cloudRepository({
      upsert: vi.fn(async (value: Deck) => {
        await held.promise
        return { ok: true as const, value: record(value.id) }
      }),
    })
    const first = vi.fn()
    const second = vi.fn()

    render(
      <>
        {mount(userA, storage, cloudDecks, first)}
        {mount(userA, storage, cloudDecks, second)}
      </>,
    )

    await waitFor(() => expect(cloudDecks.upsert).toHaveBeenCalledTimes(1))
    held.release()

    // Both callers hear about the one attempt.
    await waitFor(() => expect(first).toHaveBeenCalled())
    await waitFor(() => expect(second).toHaveBeenCalled())
    expect(cloudDecks.upsert).toHaveBeenCalledTimes(1)
    expect(readPendingDeckSync(storage, userA)).toEqual({})
  })

  // Different accounts: the second must do its own work, not wait for the
  // first and then claim to be done.
  it('processes the second account while the first is still running', async () => {
    const storage = bothEnabled()
    const held = gate()
    const cloudDecks = cloudRepository({
      upsert: vi.fn(async (value: Deck) => {
        if (value.id === 'a') await held.promise
        return { ok: true as const, value: record(value.id) }
      }),
    })

    render(
      <>
        {mount(userA, storage, cloudDecks)}
        {mount(userB, storage, cloudDecks)}
      </>,
    )

    // B finishes without waiting for A.
    await waitFor(() => expect(readPendingDeckSync(storage, userB)).toEqual({}))
    expect(readPendingDeckSync(storage, userA)).toEqual({ a: 'upsert' })

    held.release()
    await waitFor(() => expect(readPendingDeckSync(storage, userA)).toEqual({}))
  })

  it('does not let a failure for one account hold up another', async () => {
    const storage = bothEnabled()
    const cloudDecks = cloudRepository({
      upsert: vi.fn(async (value: Deck) =>
        value.id === 'a'
          ? { ok: false as const, reason: 'network' as const }
          : { ok: true as const, value: record(value.id) },
      ),
    })

    render(
      <>
        {mount(userA, storage, cloudDecks)}
        {mount(userB, storage, cloudDecks)}
      </>,
    )

    await waitFor(() => expect(readPendingDeckSync(storage, userB)).toEqual({}))
    // A keeps its unsent change for the next attempt.
    expect(readPendingDeckSync(storage, userA)).toEqual({ a: 'upsert' })
  })

  it('keeps the queues apart across a switch and back', async () => {
    const storage = bothEnabled()
    const cloudDecks = cloudRepository({
      upsert: vi.fn(async (value: Deck) =>
        value.id === 'a'
          ? { ok: false as const, reason: 'network' as const }
          : { ok: true as const, value: record(value.id) },
      ),
    })

    const a = render(mount(userA, storage, cloudDecks))
    await waitFor(() => expect(cloudDecks.upsert).toHaveBeenCalledTimes(1))
    a.unmount()

    const b = render(mount(userB, storage, cloudDecks))
    await waitFor(() => expect(readPendingDeckSync(storage, userB)).toEqual({}))
    b.unmount()

    render(mount(userA, storage, cloudDecks))
    await waitFor(() => expect(cloudDecks.upsert).toHaveBeenCalledTimes(3))
    // A's change is still its own, and still unsent.
    expect(readPendingDeckSync(storage, userA)).toEqual({ a: 'upsert' })
    expect(readPendingDeckSync(storage, userB)).toEqual({})
  })

  // A stale attempt must not report a count for the account now on screen.
  it('reports nothing to a listener whose account has gone', async () => {
    const storage = bothEnabled()
    const held = gate()
    const cloudDecks = cloudRepository({
      upsert: vi.fn(async (value: Deck) => {
        await held.promise
        return { ok: true as const, value: record(value.id) }
      }),
    })
    const onRetried = vi.fn()

    const a = render(mount(userA, storage, cloudDecks, onRetried))
    await waitFor(() => expect(cloudDecks.upsert).toHaveBeenCalledTimes(1))
    a.unmount()
    held.release()
    await waitFor(() => expect(readPendingDeckSync(storage, userA)).toEqual({}))

    expect(onRetried).not.toHaveBeenCalled()
  })
})

// A retry is work nobody asked for, so a store that will not open must not
// take the attempt down with it, and must not lose the queued change.
describe('when the device store itself fails', () => {
  it('keeps the queue and stays quiet', async () => {
    const storage = memoryStorage({ 'hlsieve:cloud-sync--user-a': ENABLED })
    writePendingDeckSync({ a: 'upsert' }, storage, userA)
    const cloudDecks = cloudRepository()
    const first = vi.fn()
    const second = vi.fn()
    const repositories = {
      namespace: userA,
      localDecks: {
        getDeck: vi.fn(async () => {
          throw new Error('indexeddb unavailable')
        }),
      },
      cloudDecks,
    } as unknown as AppRepositories

    render(
      <AppRepositoriesContext.Provider value={repositories}>
        <CloudDeckSyncRetry storage={storage} onRetried={first} />
        <CloudDeckSyncRetry storage={storage} onRetried={second} />
      </AppRepositoriesContext.Provider>,
    )

    // Both finish rather than rejecting: the one sharing the attempt must not
    // fail with it either.
    await waitFor(() => expect(first).toHaveBeenCalled())
    await waitFor(() => expect(second).toHaveBeenCalled())
    expect(cloudDecks.upsert).not.toHaveBeenCalled()
    // The change is still waiting for a later attempt.
    expect(readPendingDeckSync(storage, userA)).toEqual({ a: 'upsert' })
  })
})

/**
 * The account panel shows when this device last got something up, and whether
 * an attempt is under way. Both come from here, because this is the only place
 * that knows an attempt happened at all.
 */
describe('what it tells the panel', () => {
  const statusKeyA = 'hlsieve:cloud-sync-status--user-a'

  function mount(
    storage: ReturnType<typeof memoryStorage>,
    cloudDecks: CloudDeckRepository,
    props: {
      namespace?: LocalDataNamespace
      onRetried?: (outcome: 'ok' | 'failed') => void
      onRetryingChange?: (retrying: boolean) => void
    } = {},
  ) {
    const { namespace = userA, ...rest } = props
    return (
      <AppRepositoriesContext.Provider
        value={
          {
            namespace,
            localDecks: { getDeck: vi.fn(async (id: string) => deck(id)) },
            cloudDecks,
          } as unknown as AppRepositories
        }
      >
        <CloudDeckSyncRetry storage={storage} {...rest} />
      </AppRepositoriesContext.Provider>
    )
  }

  function enabledWithPending() {
    const storage = memoryStorage({ 'hlsieve:cloud-sync--user-a': ENABLED })
    writePendingDeckSync({ a: 'upsert' }, storage, userA)
    return storage
  }

  it('records the time a queued change finally got up', async () => {
    const storage = enabledWithPending()

    render(mount(storage, cloudRepository()))

    await waitFor(() => expect(storage.values.get(statusKeyA)).toBeDefined())
    const stored: unknown = JSON.parse(storage.values.get(statusKeyA) ?? '')
    expect(stored).toEqual({
      version: 1,
      lastUploadSuccessAt: expect.any(String),
    })
  })

  it('records nothing when the send was refused', async () => {
    const storage = enabledWithPending()
    const onRetried = vi.fn()
    const cloudDecks = cloudRepository({
      upsert: vi.fn(async () => ({
        ok: false as const,
        reason: 'network' as const,
      })),
    })

    render(mount(storage, cloudDecks, { onRetried }))

    await waitFor(() => expect(onRetried).toHaveBeenCalledWith('failed'))
    expect(storage.values.get(statusKeyA)).toBeUndefined()
  })

  it('says an attempt started and then finished', async () => {
    const storage = enabledWithPending()
    const seen: boolean[] = []

    render(
      mount(storage, cloudRepository(), {
        onRetryingChange: (retrying) => seen.push(retrying),
      }),
    )

    await waitFor(() => expect(seen).toEqual([true, false]))
  })

  it('reports a finished attempt as done', async () => {
    const storage = enabledWithPending()
    const onRetried = vi.fn()

    render(mount(storage, cloudRepository(), { onRetried }))

    await waitFor(() => expect(onRetried).toHaveBeenCalledWith('ok'))
  })

  // A store that will not open leaves the change queued, which is the same
  // thing for the reporter as a refused send.
  it('reports a store failure as not sent', async () => {
    const storage = enabledWithPending()
    const onRetried = vi.fn()

    render(
      <AppRepositoriesContext.Provider
        value={
          {
            namespace: userA,
            localDecks: {
              getDeck: vi.fn(async () => {
                throw new Error('indexeddb unavailable')
              }),
            },
            cloudDecks: cloudRepository(),
          } as unknown as AppRepositories
        }
      >
        <CloudDeckSyncRetry storage={storage} onRetried={onRetried} />
      </AppRepositoriesContext.Provider>,
    )

    await waitFor(() => expect(onRetried).toHaveBeenCalledWith('failed'))
  })

  // An attempt for the account that has just been left must not make the
  // account now on screen look busy.
  it('says nothing about an account that has gone', async () => {
    const storage = enabledWithPending()
    let release: (() => void) | undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const cloudDecks = cloudRepository({
      upsert: vi.fn(async (value: Deck) => {
        await held
        return { ok: true as const, value: record(value.id) }
      }),
    })
    const onRetryingChange = vi.fn()
    const onRetried = vi.fn()

    const a = render(
      mount(storage, cloudDecks, { onRetryingChange, onRetried }),
    )
    await waitFor(() => expect(onRetryingChange).toHaveBeenCalledWith(true))
    a.unmount()
    release?.()
    await waitFor(() => expect(readPendingDeckSync(storage, userA)).toEqual({}))

    expect(onRetryingChange).not.toHaveBeenCalledWith(false)
    expect(onRetried).not.toHaveBeenCalled()
  })

  // The time belongs to the account whose change went up.
  it('records the time under the account that sent it', async () => {
    const storage = memoryStorage({
      'hlsieve:cloud-sync--user-b': ENABLED,
    })
    const userB = userLocalDataNamespace('user-b')
    writePendingDeckSync({ b: 'upsert' }, storage, userB)

    render(mount(storage, cloudRepository(), { namespace: userB }))

    await waitFor(() =>
      expect(
        storage.values.get('hlsieve:cloud-sync-status--user-b'),
      ).toBeDefined(),
    )
    expect(storage.values.get(statusKeyA)).toBeUndefined()
  })
})
