import { describe, expect, it, vi } from 'vitest'

import type { Deck } from '../domain/decks/types'
import type { DeckBackupRepository } from '../repositories/deckRepository'
import type {
  CloudDeckRecord,
  CloudDeckRepository,
  CloudDeckResult,
} from './cloudDeckRepository'
import {
  withCloudDeckSync,
  type CloudDeckSyncEvent,
} from './cloudSyncedDeckRepository'

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

function localRepository(
  overrides: Partial<DeckBackupRepository> = {},
): DeckBackupRepository {
  return {
    listDecks: vi.fn(async () => []),
    getDeck: vi.fn(async () => undefined),
    saveDeck: vi.fn(async () => undefined),
    deleteDeck: vi.fn(async () => undefined),
    importDecks: vi.fn(async () => undefined),
    ...overrides,
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

/** Resolves once the wrapper reports an outcome, so a test can await the push. */
function build({
  decks = localRepository(),
  cloudDecks = cloudRepository() as CloudDeckRepository | null,
  enabled = true,
}: {
  decks?: DeckBackupRepository
  cloudDecks?: CloudDeckRepository | null
  enabled?: boolean
} = {}) {
  const events: CloudDeckSyncEvent[] = []
  let notify: (() => void) | undefined
  const repository = withCloudDeckSync({
    decks,
    cloudDecks,
    isSyncEnabled: () => enabled,
    onSyncResult: (event) => {
      events.push(event)
      notify?.()
    },
  })
  const nextEvent = () =>
    new Promise<void>((resolve) => {
      notify = resolve
    })
  return { repository, decks, cloudDecks, events, nextEvent }
}

describe('saving a deck', () => {
  it('writes locally first, then sends it', async () => {
    const { repository, decks, cloudDecks, events, nextEvent } = build()
    const pending = nextEvent()

    await repository.saveDeck(deck('a'))

    // Local is done by the time the call returns.
    expect(decks.saveDeck).toHaveBeenCalledWith(deck('a'))
    await pending
    expect(cloudDecks?.upsert).toHaveBeenCalledWith(deck('a'))
    expect(events).toEqual([{ kind: 'saved', deckId: 'a', ok: true }])
  })

  // The local save is what the reporter did; the cloud is a copy of it.
  it('does not wait for the cloud before returning', async () => {
    let releaseCloud: (() => void) | undefined
    const cloudDecks = cloudRepository({
      upsert: vi.fn(
        () =>
          new Promise<CloudDeckResult<CloudDeckRecord>>((resolve) => {
            releaseCloud = () => resolve({ ok: true, value: record('a') })
          }),
      ),
    })
    const { repository } = build({ cloudDecks })

    // Resolves while the cloud call is still outstanding.
    await expect(repository.saveDeck(deck('a'))).resolves.toBeUndefined()
    expect(releaseCloud).toBeDefined()
    releaseCloud?.()
  })

  it('reports a refused push without disturbing the local save', async () => {
    const cloudDecks = cloudRepository({
      upsert: vi.fn(async () => ({
        ok: false as const,
        reason: 'network' as const,
      })),
    })
    const { repository, decks, events, nextEvent } = build({ cloudDecks })
    const pending = nextEvent()

    await expect(repository.saveDeck(deck('a'))).resolves.toBeUndefined()

    await pending
    expect(decks.saveDeck).toHaveBeenCalledTimes(1)
    expect(events).toEqual([
      { kind: 'saved', deckId: 'a', ok: false, reason: 'network' },
    ])
  })

  it('survives a push that rejects outright', async () => {
    const cloudDecks = cloudRepository({
      upsert: vi.fn(async () => {
        throw new Error('offline')
      }),
    })
    const { repository, events, nextEvent } = build({ cloudDecks })
    const pending = nextEvent()

    await expect(repository.saveDeck(deck('a'))).resolves.toBeUndefined()

    await pending
    expect(events).toEqual([
      { kind: 'saved', deckId: 'a', ok: false, reason: 'network' },
    ])
  })

  // A failed local save is a failed save. Sending it would put a deck in the
  // account that this device does not have.
  it('sends nothing when the local save fails', async () => {
    const decks = localRepository({
      saveDeck: vi.fn(async () => {
        throw new Error('quota exceeded')
      }),
    })
    const { repository, cloudDecks } = build({ decks })

    await expect(repository.saveDeck(deck('a'))).rejects.toThrow(
      'quota exceeded',
    )
    expect(cloudDecks?.upsert).not.toHaveBeenCalled()
  })
})

describe('deleting a deck', () => {
  // The account holds no delete privilege, and a tombstone stops another
  // device bringing the deck back by syncing later.
  it('tombstones rather than removing', async () => {
    const { repository, decks, cloudDecks, events, nextEvent } = build()
    const pending = nextEvent()

    await repository.deleteDeck('a')

    expect(decks.deleteDeck).toHaveBeenCalledWith('a')
    await pending
    expect(cloudDecks?.tombstone).toHaveBeenCalledWith('a')
    expect(events).toEqual([{ kind: 'deleted', deckId: 'a', ok: true }])
  })

  it('reports a refused tombstone without disturbing the local delete', async () => {
    const cloudDecks = cloudRepository({
      tombstone: vi.fn(async () => ({
        ok: false as const,
        reason: 'not-found' as const,
      })),
    })
    const { repository, decks, events, nextEvent } = build({ cloudDecks })
    const pending = nextEvent()

    await expect(repository.deleteDeck('a')).resolves.toBeUndefined()

    await pending
    expect(decks.deleteDeck).toHaveBeenCalledTimes(1)
    expect(events).toEqual([
      { kind: 'deleted', deckId: 'a', ok: false, reason: 'not-found' },
    ])
  })

  it('sends nothing when the local delete fails', async () => {
    const decks = localRepository({
      deleteDeck: vi.fn(async () => {
        throw new Error('blocked')
      }),
    })
    const { repository, cloudDecks } = build({ decks })

    await expect(repository.deleteDeck('a')).rejects.toThrow('blocked')
    expect(cloudDecks?.tombstone).not.toHaveBeenCalled()
  })
})

describe('importing decks', () => {
  it('sends each imported deck', async () => {
    const { repository, decks, cloudDecks, nextEvent } = build()
    const imported = [deck('a'), deck('b')]
    const pending = nextEvent()

    await repository.importDecks(imported)

    expect(decks.importDecks).toHaveBeenCalledWith(imported)
    await pending
    expect(cloudDecks?.upsert).toHaveBeenCalledTimes(2)
    imported.forEach((value) =>
      expect(cloudDecks?.upsert).toHaveBeenCalledWith(value),
    )
  })

  it('sends nothing when the local import fails', async () => {
    const decks = localRepository({
      importDecks: vi.fn(async () => {
        throw new Error('invalid')
      }),
    })
    const { repository, cloudDecks } = build({ decks })

    await expect(repository.importDecks([deck('a')])).rejects.toThrow('invalid')
    expect(cloudDecks?.upsert).not.toHaveBeenCalled()
  })
})

describe('when sync is off', () => {
  it('sends nothing while sync is not enabled', async () => {
    const { repository, decks, cloudDecks } = build({ enabled: false })

    await repository.saveDeck(deck('a'))
    await repository.deleteDeck('a')
    await repository.importDecks([deck('b')])

    expect(decks.saveDeck).toHaveBeenCalledTimes(1)
    expect(decks.deleteDeck).toHaveBeenCalledTimes(1)
    expect(decks.importDecks).toHaveBeenCalledTimes(1)
    expect(cloudDecks?.upsert).not.toHaveBeenCalled()
    expect(cloudDecks?.tombstone).not.toHaveBeenCalled()
  })

  // Anonymous, or a deployment with no Supabase. Local must behave exactly as
  // it did before Cloud Sync existed.
  it('keeps working with no cloud repository at all', async () => {
    const { repository, decks } = build({ cloudDecks: null })

    await expect(repository.saveDeck(deck('a'))).resolves.toBeUndefined()
    await expect(repository.deleteDeck('a')).resolves.toBeUndefined()
    await expect(repository.importDecks([deck('b')])).resolves.toBeUndefined()

    expect(decks.saveDeck).toHaveBeenCalledTimes(1)
    expect(decks.deleteDeck).toHaveBeenCalledTimes(1)
    expect(decks.importDecks).toHaveBeenCalledTimes(1)
  })

  // Read per call, so turning sync on or off takes effect immediately rather
  // than when the repository happens to be rebuilt.
  it('follows the setting changing between calls', async () => {
    const decks = localRepository()
    const cloudDecks = cloudRepository()
    let enabled = false
    const repository = withCloudDeckSync({
      decks,
      cloudDecks,
      isSyncEnabled: () => enabled,
    })

    await repository.saveDeck(deck('a'))
    expect(cloudDecks.upsert).not.toHaveBeenCalled()

    enabled = true
    await repository.saveDeck(deck('b'))
    expect(cloudDecks.upsert).toHaveBeenCalledTimes(1)
    expect(cloudDecks.upsert).toHaveBeenCalledWith(deck('b'))

    enabled = false
    await repository.saveDeck(deck('c'))
    expect(cloudDecks.upsert).toHaveBeenCalledTimes(1)
  })
})

describe('reads are untouched', () => {
  it('passes listDecks and getDeck straight through', async () => {
    const decks = localRepository({
      listDecks: vi.fn(async () => [deck('a')]),
      getDeck: vi.fn(async () => deck('a')),
    })
    const { repository, cloudDecks } = build({ decks })

    await expect(repository.listDecks()).resolves.toEqual([deck('a')])
    await expect(repository.getDeck('a')).resolves.toEqual(deck('a'))
    expect(cloudDecks?.listAll).not.toHaveBeenCalled()
    expect(cloudDecks?.listUpdatedSince).not.toHaveBeenCalled()
  })
})
