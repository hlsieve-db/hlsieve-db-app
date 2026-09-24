import { describe, expect, it, vi } from 'vitest'

import type { Deck } from '../domain/decks/types'
import type {
  CloudDeckRecord,
  CloudDeckRepository,
} from './cloudDeckRepository'
import {
  applyDeckReconciliation,
  planDeckReconciliation,
  readCloudDeckPlans,
  type DeckConflictResolutions,
  type DeckReconciliationPlan,
} from './deckReconciliation'

function deck(id: string, overrides: Partial<Deck> = {}): Deck {
  return {
    id,
    name: `デッキ ${id}`,
    entries: [{ cardNumber: 'hBP04-042', quantity: 4 }],
    createdAt: '2026-09-22T00:00:00.000Z',
    updatedAt: '2026-09-22T00:00:00.000Z',
    ...overrides,
  }
}

function row(
  id: string,
  overrides: { deck?: Deck; deletedAt?: string | null } = {},
): CloudDeckRecord {
  return {
    id,
    deck: overrides.deck ?? deck(id),
    createdAt: '2026-09-22T04:00:00.000000+00:00',
    updatedAt: '2026-09-22T04:00:00.000000+00:00',
    deletedAt: overrides.deletedAt ?? null,
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
      value: row(value.id, { deck: value }),
    })),
    tombstone: vi.fn(async (id: string) => ({
      ok: true as const,
      value: row(id, { deletedAt: '2026-09-22T05:00:00.000000+00:00' }),
    })),
    ...overrides,
  }
}

function localStore(
  overrides: {
    saveDeck?: (deck: Deck) => Promise<void>
    deleteDeck?: (id: string) => Promise<void>
  } = {},
) {
  return {
    saveDeck: vi.fn(overrides.saveDeck ?? (async () => undefined)),
    deleteDeck: vi.fn(overrides.deleteDeck ?? (async () => undefined)),
  }
}

const emptyPlan: DeckReconciliationPlan = {
  localOnly: [],
  cloudOnly: [],
  identical: [],
  conflicts: [],
  cloudRowCount: 0,
}

describe('working out where the two sides disagree', () => {
  it('asks nothing about a deck both sides hold identically', () => {
    const plan = planDeckReconciliation({
      localDecks: [deck('a')],
      cloudRows: [row('a')],
    })

    expect(plan.conflicts).toEqual([])
    expect(plan.identical).toEqual([deck('a')])
  })

  it('reports a deck both sides changed as a conflict', () => {
    const cloudDeck = deck('a', { name: 'クラウドで直した名前' })
    const plan = planDeckReconciliation({
      localDecks: [deck('a')],
      cloudRows: [row('a', { deck: cloudDeck })],
    })

    expect(plan.conflicts).toEqual([
      {
        deckId: 'a',
        kind: 'active-active',
        localDeck: deck('a'),
        cloudDeck,
      },
    ])
    expect(plan.identical).toEqual([])
  })

  // The account not holding a deck is not the account saying it is gone.
  it('leaves a deck only this device has alone', () => {
    const plan = planDeckReconciliation({
      localDecks: [deck('a')],
      cloudRows: [],
    })

    expect(plan.localOnly).toEqual([deck('a')])
    expect(plan.conflicts).toEqual([])
  })

  it('reports a deck only the account has as one to bring down', () => {
    const plan = planDeckReconciliation({
      localDecks: [],
      cloudRows: [row('a')],
    })

    expect(plan.cloudOnly).toEqual([deck('a')])
    expect(plan.conflicts).toEqual([])
  })

  // A different kind of disagreement: the account says deleted, this device
  // still has the deck, and only the reporter can say which is right.
  it('reports a deck the account deleted but this device still holds', () => {
    const plan = planDeckReconciliation({
      localDecks: [deck('a')],
      cloudRows: [row('a', { deletedAt: '2026-09-22T05:00:00.000000+00:00' })],
    })

    expect(plan.conflicts).toEqual([
      { deckId: 'a', kind: 'local-vs-tombstone', localDeck: deck('a') },
    ])
    expect(plan.cloudOnly).toEqual([])
  })

  it('does nothing about a deleted deck this device does not have', () => {
    const plan = planDeckReconciliation({
      localDecks: [],
      cloudRows: [row('a', { deletedAt: '2026-09-22T05:00:00.000000+00:00' })],
    })

    expect(plan).toEqual({ ...emptyPlan, cloudRowCount: 1 })
  })

  // Written by whichever device made the change, so a difference there is not
  // something to ask the reporter about.
  it('does not call a difference in timestamps a conflict', () => {
    const plan = planDeckReconciliation({
      localDecks: [deck('a', { updatedAt: '2026-09-24T10:00:00.000Z' })],
      cloudRows: [
        row('a', {
          deck: deck('a', { createdAt: '2020-01-01T00:00:00.000Z' }),
        }),
      ],
    })

    expect(plan.conflicts).toEqual([])
    expect(plan.identical).toHaveLength(1)
  })

  it('counts every row the account holds, tombstones included', () => {
    const plan = planDeckReconciliation({
      localDecks: [],
      cloudRows: [
        row('a'),
        row('b', { deletedAt: '2026-09-22T05:00:00.000000+00:00' }),
      ],
    })

    expect(plan.cloudRowCount).toBe(2)
  })

  it('sorts each deck into exactly one place, in a stable order', () => {
    const plan = planDeckReconciliation({
      localDecks: [deck('local'), deck('same'), deck('changed')],
      cloudRows: [
        row('same'),
        row('changed', { deck: deck('changed', { name: '別の名前' }) }),
        row('cloud'),
      ],
    })

    expect(plan.localOnly.map((value) => value.id)).toEqual(['local'])
    expect(plan.identical.map((value) => value.id)).toEqual(['same'])
    expect(plan.cloudOnly.map((value) => value.id)).toEqual(['cloud'])
    expect(plan.conflicts.map((value) => value.deckId)).toEqual(['changed'])
  })

  it('gives the same plan for the same two sides', () => {
    const input = {
      localDecks: [deck('a'), deck('b', { name: 'こちら' })],
      cloudRows: [row('a'), row('b', { deck: deck('b', { name: 'むこう' }) })],
    }

    expect(planDeckReconciliation(input)).toEqual(planDeckReconciliation(input))
  })
})

describe('reading both sides once', () => {
  it('reports what they disagree about', async () => {
    const cloudDecks = cloudRepository({
      listAll: vi.fn(async () => ({ ok: true as const, value: [row('a')] })),
    })

    const result = await readCloudDeckPlans({
      decks: { listDecks: vi.fn(async () => [deck('a')]) },
      cloudDecks,
    })

    expect(result).toEqual({
      ok: true,
      plans: {
        restore: {
          restore: [deck('a')],
          remove: [],
          localCount: 1,
          cloudRowCount: 1,
        },
        reconciliation: {
          localOnly: [],
          cloudOnly: [],
          identical: [deck('a')],
          conflicts: [],
          cloudRowCount: 1,
        },
      },
    })
  })

  it('says so when Cloud Sync is not configured', async () => {
    const result = await readCloudDeckPlans({
      decks: { listDecks: vi.fn(async () => []) },
      cloudDecks: null,
    })

    expect(result).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('passes the account failure through without inventing one', async () => {
    const result = await readCloudDeckPlans({
      decks: { listDecks: vi.fn(async () => []) },
      cloudDecks: cloudRepository({
        listAll: vi.fn(async () => ({
          ok: false as const,
          reason: 'unauthenticated' as const,
        })),
      }),
    })

    expect(result).toEqual({ ok: false, reason: 'unauthenticated' })
  })

  // The local store is an input here, so its failure is not the cloud's fault.
  it('does not blame the account for a local read failure', async () => {
    const result = await readCloudDeckPlans({
      decks: {
        listDecks: vi.fn(async () => {
          throw new Error('indexeddb unavailable')
        }),
      },
      cloudDecks: cloudRepository(),
    })

    expect(result).toEqual({ ok: false, reason: 'failed' })
  })
})

describe('applying what the reporter chose', () => {
  it('sends this device s copy when they keep it, and leaves the deck here', async () => {
    const cloudDeck = deck('a', { name: 'むこう' })
    const plan = planDeckReconciliation({
      localDecks: [deck('a')],
      cloudRows: [row('a', { deck: cloudDeck })],
    })
    const decks = localStore()
    const cloudDecks = cloudRepository()

    const result = await applyDeckReconciliation(
      plan,
      { a: 'local' },
      {
        decks,
        cloudDecks,
      },
    )

    expect(cloudDecks.upsert).toHaveBeenCalledWith(deck('a'))
    expect(decks.saveDeck).not.toHaveBeenCalled()
    expect(decks.deleteDeck).not.toHaveBeenCalled()
    expect(result.resolved).toEqual(['a'])
    expect(result.unresolved).toEqual([])
  })

  // The deck came from the account, so sending it back would be a round trip.
  it('writes the account s copy here without echoing it back', async () => {
    const cloudDeck = deck('a', { name: 'むこう' })
    const plan = planDeckReconciliation({
      localDecks: [deck('a')],
      cloudRows: [row('a', { deck: cloudDeck })],
    })
    const decks = localStore()
    const cloudDecks = cloudRepository()

    const result = await applyDeckReconciliation(
      plan,
      { a: 'cloud' },
      {
        decks,
        cloudDecks,
      },
    )

    expect(decks.saveDeck).toHaveBeenCalledWith(cloudDeck)
    expect(cloudDecks.upsert).not.toHaveBeenCalled()
    expect(result.restored).toBe(1)
  })

  it('brings a deck back by sending it when they keep this device s copy', async () => {
    const plan = planDeckReconciliation({
      localDecks: [deck('a')],
      cloudRows: [row('a', { deletedAt: '2026-09-22T05:00:00.000000+00:00' })],
    })
    const decks = localStore()
    const cloudDecks = cloudRepository()

    const result = await applyDeckReconciliation(
      plan,
      { a: 'local' },
      {
        decks,
        cloudDecks,
      },
    )

    expect(cloudDecks.upsert).toHaveBeenCalledWith(deck('a'))
    expect(decks.deleteDeck).not.toHaveBeenCalled()
    expect(result.uploaded).toBe(1)
  })

  // The row stays a tombstone, so another device holding the deck cannot bring
  // it back later by syncing.
  it('removes the deck here when they accept the account s deletion', async () => {
    const plan = planDeckReconciliation({
      localDecks: [deck('a')],
      cloudRows: [row('a', { deletedAt: '2026-09-22T05:00:00.000000+00:00' })],
    })
    const decks = localStore()
    const cloudDecks = cloudRepository()

    const result = await applyDeckReconciliation(
      plan,
      { a: 'cloud' },
      {
        decks,
        cloudDecks,
      },
    )

    expect(decks.deleteDeck).toHaveBeenCalledWith('a')
    expect(cloudDecks.upsert).not.toHaveBeenCalled()
    expect(cloudDecks.tombstone).not.toHaveBeenCalled()
    expect(result.removed).toBe(1)
  })

  it('brings down a deck only the account has', async () => {
    const plan = planDeckReconciliation({
      localDecks: [],
      cloudRows: [row('a')],
    })
    const decks = localStore()

    const result = await applyDeckReconciliation(
      plan,
      {},
      {
        decks,
        cloudDecks: cloudRepository(),
      },
    )

    expect(decks.saveDeck).toHaveBeenCalledWith(deck('a'))
    expect(result.restored).toBe(1)
  })

  // Restoring says nothing about this device's own decks going up.
  it('leaves a deck only this device has alone while restoring', async () => {
    const plan = planDeckReconciliation({
      localDecks: [deck('a')],
      cloudRows: [],
    })
    const decks = localStore()
    const cloudDecks = cloudRepository()

    const result = await applyDeckReconciliation(
      plan,
      {},
      { decks, cloudDecks },
    )

    expect(cloudDecks.upsert).not.toHaveBeenCalled()
    expect(decks.deleteDeck).not.toHaveBeenCalled()
    expect(result).toEqual({
      resolved: [],
      unresolved: [],
      restored: 0,
      uploaded: 0,
      removed: 0,
      failure: undefined,
    })
  })

  // Turning sync on is the moment the account should end up with what this
  // device has, and this only ever adds to the account.
  it('sends a deck only this device has when turning sync on', async () => {
    const plan = planDeckReconciliation({
      localDecks: [deck('a')],
      cloudRows: [],
    })
    const decks = localStore()
    const cloudDecks = cloudRepository()

    const result = await applyDeckReconciliation(
      plan,
      {},
      {
        decks,
        cloudDecks,
        uploadLocalOnly: true,
      },
    )

    expect(cloudDecks.upsert).toHaveBeenCalledWith(deck('a'))
    expect(result.uploaded).toBe(1)
  })

  it('touches nothing for a deck both sides hold identically', async () => {
    const plan = planDeckReconciliation({
      localDecks: [deck('a')],
      cloudRows: [row('a')],
    })
    const decks = localStore()
    const cloudDecks = cloudRepository()

    await applyDeckReconciliation(plan, {}, { decks, cloudDecks })

    expect(decks.saveDeck).not.toHaveBeenCalled()
    expect(decks.deleteDeck).not.toHaveBeenCalled()
    expect(cloudDecks.upsert).not.toHaveBeenCalled()
  })

  // Nothing may happen to a deck the reporter has not answered for.
  it('does nothing about a conflict with no choice made', async () => {
    const plan = planDeckReconciliation({
      localDecks: [deck('a'), deck('b')],
      cloudRows: [
        row('a', { deck: deck('a', { name: 'むこう' }) }),
        row('b', { deck: deck('b', { name: 'むこう' }) }),
      ],
    })
    const decks = localStore()
    const cloudDecks = cloudRepository()

    const result = await applyDeckReconciliation(
      plan,
      { a: 'local' },
      {
        decks,
        cloudDecks,
      },
    )

    expect(cloudDecks.upsert).toHaveBeenCalledTimes(1)
    expect(decks.saveDeck).not.toHaveBeenCalled()
    expect(result.resolved).toEqual(['a'])
    expect(result.unresolved).toEqual(['b'])
  })

  it('never removes a row from the account', async () => {
    const plan = planDeckReconciliation({
      localDecks: [deck('a'), deck('b')],
      cloudRows: [
        row('a', { deletedAt: '2026-09-22T05:00:00.000000+00:00' }),
        row('b', { deck: deck('b', { name: 'むこう' }) }),
        row('c'),
      ],
    })
    const cloudDecks = cloudRepository()

    await applyDeckReconciliation(
      plan,
      { a: 'cloud', b: 'cloud' },
      {
        decks: localStore(),
        cloudDecks,
        uploadLocalOnly: true,
      },
    )

    expect(cloudDecks.tombstone).not.toHaveBeenCalled()
  })

  describe('when something is refused part way', () => {
    it('keeps what worked and reports the rest as unresolved', async () => {
      const plan = planDeckReconciliation({
        localDecks: [deck('a'), deck('b')],
        cloudRows: [
          row('a', { deck: deck('a', { name: 'むこう' }) }),
          row('b', { deck: deck('b', { name: 'むこう' }) }),
        ],
      })
      const cloudDecks = cloudRepository({
        upsert: vi.fn(async (value: Deck) =>
          value.id === 'a'
            ? { ok: true as const, value: row('a', { deck: value }) }
            : { ok: false as const, reason: 'network' as const },
        ),
      })

      const result = await applyDeckReconciliation(
        plan,
        { a: 'local', b: 'local' },
        { decks: localStore(), cloudDecks },
      )

      expect(result.resolved).toEqual(['a'])
      expect(result.unresolved).toEqual(['b'])
      expect(result.uploaded).toBe(1)
      expect(result.failure).toBe('network')
    })

    // The reporter said this device's copy wins, so the change is theirs and
    // must not be dropped when the account refuses it.
    it('hands a refused send to the queue that finishes it later', async () => {
      const plan = planDeckReconciliation({
        localDecks: [deck('a')],
        cloudRows: [row('a', { deck: deck('a', { name: 'むこう' }) })],
      })
      const pending = { record: vi.fn(), clear: vi.fn() }

      await applyDeckReconciliation(
        plan,
        { a: 'local' },
        {
          decks: localStore(),
          cloudDecks: cloudRepository({
            upsert: vi.fn(async () => ({
              ok: false as const,
              reason: 'network' as const,
            })),
          }),
          pending,
        },
      )

      expect(pending.record).toHaveBeenCalledWith('a', 'upsert')
    })

    it('carries on when a later deck is refused, without undoing earlier ones', async () => {
      const plan = planDeckReconciliation({
        localDecks: [deck('a'), deck('b')],
        cloudRows: [
          row('a', { deck: deck('a', { name: 'むこう' }) }),
          row('b', { deck: deck('b', { name: 'むこう' }) }),
          row('c'),
        ],
      })
      const decks = localStore()
      const cloudDecks = cloudRepository({
        upsert: vi.fn(async () => ({
          ok: false as const,
          reason: 'network' as const,
        })),
      })

      const result = await applyDeckReconciliation(
        plan,
        { a: 'local', b: 'cloud' },
        { decks, cloudDecks },
      )

      // The cloud-side choice and the cloud-only deck still landed.
      expect(decks.saveDeck).toHaveBeenCalledTimes(2)
      expect(result.resolved).toEqual(['b'])
      expect(result.unresolved).toEqual(['a'])
    })

    it('stops at a local write failure without claiming success', async () => {
      const plan = planDeckReconciliation({
        localDecks: [deck('a')],
        cloudRows: [
          row('a', { deck: deck('a', { name: 'むこう' }) }),
          row('c'),
        ],
      })
      const decks = localStore({
        saveDeck: vi.fn(async () => {
          throw new Error('indexeddb unavailable')
        }),
      })

      const result = await applyDeckReconciliation(
        plan,
        { a: 'cloud' },
        {
          decks,
          cloudDecks: cloudRepository(),
        },
      )

      expect(result.failure).toBe('failed')
      expect(result.restored).toBe(0)
      expect(result.resolved).toEqual([])
    })

    it('reports every conflict as unresolved with no cloud repository', async () => {
      const plan = planDeckReconciliation({
        localDecks: [deck('a')],
        cloudRows: [row('a', { deck: deck('a', { name: 'むこう' }) })],
      })
      const decks = localStore()

      const result = await applyDeckReconciliation(
        plan,
        { a: 'local' },
        {
          decks,
          cloudDecks: null,
        },
      )

      expect(result.unresolved).toEqual(['a'])
      expect(result.failure).toBe('unavailable')
      expect(decks.saveDeck).not.toHaveBeenCalled()
    })

    // Applying again from a fresh plan is the retry, and it converges.
    it('settles the rest on a second run from a fresh plan', async () => {
      const localDecks = [deck('a'), deck('b')]
      const cloudRows = [
        row('a', { deck: deck('a', { name: 'むこう' }) }),
        row('b', { deck: deck('b', { name: 'むこう' }) }),
      ]
      let refuse = true
      const cloudDecks = cloudRepository({
        upsert: vi.fn(async (value: Deck) =>
          refuse
            ? { ok: false as const, reason: 'network' as const }
            : { ok: true as const, value: row(value.id, { deck: value }) },
        ),
      })
      const resolutions: DeckConflictResolutions = { a: 'local', b: 'local' }

      const first = await applyDeckReconciliation(
        planDeckReconciliation({ localDecks, cloudRows }),
        resolutions,
        { decks: localStore(), cloudDecks },
      )
      expect(first.unresolved).toEqual(['a', 'b'])

      refuse = false
      const second = await applyDeckReconciliation(
        planDeckReconciliation({ localDecks, cloudRows }),
        resolutions,
        { decks: localStore(), cloudDecks },
      )

      expect(second.unresolved).toEqual([])
      expect(second.resolved).toEqual(['a', 'b'])
    })
  })

  describe('what counts as having sent something', () => {
    it('reports a send the account accepted', async () => {
      const plan = planDeckReconciliation({
        localDecks: [deck('a')],
        cloudRows: [row('a', { deck: deck('a', { name: 'むこう' }) })],
      })
      const onUploadSuccess = vi.fn()

      await applyDeckReconciliation(
        plan,
        { a: 'local' },
        {
          decks: localStore(),
          cloudDecks: cloudRepository(),
          onUploadSuccess,
        },
      )

      expect(onUploadSuccess).toHaveBeenCalledTimes(1)
    })

    it('reports nothing when the account refused it', async () => {
      const plan = planDeckReconciliation({
        localDecks: [deck('a')],
        cloudRows: [row('a', { deck: deck('a', { name: 'むこう' }) })],
      })
      const onUploadSuccess = vi.fn()

      await applyDeckReconciliation(
        plan,
        { a: 'local' },
        {
          decks: localStore(),
          cloudDecks: cloudRepository({
            upsert: vi.fn(async () => ({
              ok: false as const,
              reason: 'network' as const,
            })),
          }),
          onUploadSuccess,
        },
      )

      expect(onUploadSuccess).not.toHaveBeenCalled()
    })

    // Nothing went up: the deck came down, or was removed from here.
    it('reports nothing for a choice that only wrote to this device', async () => {
      const plan = planDeckReconciliation({
        localDecks: [deck('a'), deck('b')],
        cloudRows: [
          row('a', { deck: deck('a', { name: 'むこう' }) }),
          row('b', { deletedAt: '2026-09-22T05:00:00.000000+00:00' }),
          row('c'),
        ],
      })
      const onUploadSuccess = vi.fn()

      await applyDeckReconciliation(
        plan,
        { a: 'cloud', b: 'cloud' },
        {
          decks: localStore(),
          cloudDecks: cloudRepository(),
          onUploadSuccess,
        },
      )

      expect(onUploadSuccess).not.toHaveBeenCalled()
    })
  })

  it('reports progress over everything it will do', async () => {
    const plan = planDeckReconciliation({
      localDecks: [deck('a'), deck('local')],
      cloudRows: [
        row('a', { deck: deck('a', { name: 'むこう' }) }),
        row('cloud'),
      ],
    })
    const seen: { completed: number; total: number }[] = []

    await applyDeckReconciliation(
      plan,
      { a: 'local' },
      {
        decks: localStore(),
        cloudDecks: cloudRepository(),
        uploadLocalOnly: true,
        onProgress: (progress) => seen.push(progress),
      },
    )

    expect(seen).toEqual([
      { completed: 0, total: 3 },
      { completed: 1, total: 3 },
      { completed: 2, total: 3 },
      { completed: 3, total: 3 },
    ])
  })
})

/**
 * Keeping the queue of unsent changes honest.
 *
 * An entry in it is an older intent for a deck, and a retry will act on it
 * later. Once the reporter has settled that deck, the older intent is not just
 * redundant: replayed, it would undo what they chose. A queued tombstone would
 * delete the copy they kept, and a queued upsert would bring back the deck they
 * agreed to delete.
 */
describe('what resolving a deck does to its queued change', () => {
  function pendingSpy() {
    return { record: vi.fn(), clear: vi.fn() }
  }

  const changedRows = [row('a', { deck: deck('a', { name: 'むこう' }) })]
  const tombstonedRows = [
    row('a', { deletedAt: '2026-09-22T05:00:00.000000+00:00' }),
  ]

  it('clears a queued tombstone when the account s copy is taken', async () => {
    const plan = planDeckReconciliation({
      localDecks: [deck('a')],
      cloudRows: changedRows,
    })
    const pending = pendingSpy()

    await applyDeckReconciliation(
      plan,
      { a: 'cloud' },
      {
        decks: localStore(),
        cloudDecks: cloudRepository(),
        pending,
      },
    )

    // Left in place, a later retry would delete from the account the very deck
    // that was just written to this device.
    expect(pending.clear).toHaveBeenCalledWith('a')
    expect(pending.record).not.toHaveBeenCalled()
  })

  it('clears a queued upsert when the account s deletion is accepted', async () => {
    const plan = planDeckReconciliation({
      localDecks: [deck('a')],
      cloudRows: tombstonedRows,
    })
    const pending = pendingSpy()

    await applyDeckReconciliation(
      plan,
      { a: 'cloud' },
      {
        decks: localStore(),
        cloudDecks: cloudRepository(),
        pending,
      },
    )

    // Left in place, a later retry would bring the deck back.
    expect(pending.clear).toHaveBeenCalledWith('a')
    expect(pending.record).not.toHaveBeenCalled()
  })

  it('clears the queue for a deck the account accepted from here', async () => {
    const plan = planDeckReconciliation({
      localDecks: [deck('a')],
      cloudRows: changedRows,
    })
    const pending = pendingSpy()

    await applyDeckReconciliation(
      plan,
      { a: 'local' },
      {
        decks: localStore(),
        cloudDecks: cloudRepository(),
        pending,
      },
    )

    expect(pending.clear).toHaveBeenCalledWith('a')
    expect(pending.record).not.toHaveBeenCalled()
  })

  // The intent they just chose, whatever was queued before.
  it('queues an upsert when the account refused this device s copy', async () => {
    const plan = planDeckReconciliation({
      localDecks: [deck('a')],
      cloudRows: changedRows,
    })
    const pending = pendingSpy()

    await applyDeckReconciliation(
      plan,
      { a: 'local' },
      {
        decks: localStore(),
        cloudDecks: cloudRepository({
          upsert: vi.fn(async () => ({
            ok: false as const,
            reason: 'network' as const,
          })),
        }),
        pending,
      },
    )

    expect(pending.record).toHaveBeenCalledWith('a', 'upsert')
    expect(pending.clear).not.toHaveBeenCalled()
  })

  it('clears the queue when a deck is brought back by sending it', async () => {
    const plan = planDeckReconciliation({
      localDecks: [deck('a')],
      cloudRows: tombstonedRows,
    })
    const pending = pendingSpy()

    await applyDeckReconciliation(
      plan,
      { a: 'local' },
      {
        decks: localStore(),
        cloudDecks: cloudRepository(),
        pending,
      },
    )

    expect(pending.clear).toHaveBeenCalledWith('a')
  })

  it('queues an upsert when bringing a deck back was refused', async () => {
    const plan = planDeckReconciliation({
      localDecks: [deck('a')],
      cloudRows: tombstonedRows,
    })
    const pending = pendingSpy()

    await applyDeckReconciliation(
      plan,
      { a: 'local' },
      {
        decks: localStore(),
        cloudDecks: cloudRepository({
          upsert: vi.fn(async () => ({
            ok: false as const,
            reason: 'network' as const,
          })),
        }),
        pending,
      },
    )

    expect(pending.record).toHaveBeenCalledWith('a', 'upsert')
  })

  // Taking the account's copy is a decision about that deck too.
  it('clears the queue for a deck brought down from the account', async () => {
    const plan = planDeckReconciliation({
      localDecks: [],
      cloudRows: [row('a')],
    })
    const pending = pendingSpy()

    await applyDeckReconciliation(
      plan,
      {},
      {
        decks: localStore(),
        cloudDecks: cloudRepository(),
        pending,
      },
    )

    expect(pending.clear).toHaveBeenCalledWith('a')
  })

  // Both sides already agree, so a queued tombstone here could destroy that.
  it('clears a stale entry for a deck both sides already agree about', async () => {
    const plan = planDeckReconciliation({
      localDecks: [deck('a')],
      cloudRows: [row('a')],
    })
    const pending = pendingSpy()

    await applyDeckReconciliation(
      plan,
      {},
      {
        decks: localStore(),
        cloudDecks: cloudRepository(),
        pending,
      },
    )

    expect(pending.clear).toHaveBeenCalledWith('a')
  })

  it('clears the queue for a local-only deck the account accepted', async () => {
    const plan = planDeckReconciliation({
      localDecks: [deck('a')],
      cloudRows: [],
    })
    const pending = pendingSpy()

    await applyDeckReconciliation(
      plan,
      {},
      {
        decks: localStore(),
        cloudDecks: cloudRepository(),
        uploadLocalOnly: true,
        pending,
      },
    )

    expect(pending.clear).toHaveBeenCalledWith('a')
  })

  it('queues an upsert when a local-only deck was refused', async () => {
    const plan = planDeckReconciliation({
      localDecks: [deck('a')],
      cloudRows: [],
    })
    const pending = pendingSpy()

    await applyDeckReconciliation(
      plan,
      {},
      {
        decks: localStore(),
        cloudDecks: cloudRepository({
          upsert: vi.fn(async () => ({
            ok: false as const,
            reason: 'network' as const,
          })),
        }),
        uploadLocalOnly: true,
        pending,
      },
    )

    expect(pending.record).toHaveBeenCalledWith('a', 'upsert')
  })

  // Nothing was decided about this deck, so its existing intent stands.
  it('leaves the queue alone for a deck restoring did not touch', async () => {
    const plan = planDeckReconciliation({
      localDecks: [deck('a'), deck('b')],
      cloudRows: [row('b')],
    })
    const pending = pendingSpy()

    await applyDeckReconciliation(
      plan,
      {},
      {
        decks: localStore(),
        cloudDecks: cloudRepository(),
        pending,
      },
    )

    expect(pending.clear).not.toHaveBeenCalledWith('a')
    expect(pending.record).not.toHaveBeenCalled()
  })

  // Clearing an entry is not sending anything.
  it('does not report an upload for a deck it only cleared', async () => {
    const plan = planDeckReconciliation({
      localDecks: [deck('a')],
      cloudRows: [row('a')],
    })
    const onUploadSuccess = vi.fn()

    await applyDeckReconciliation(
      plan,
      {},
      {
        decks: localStore(),
        cloudDecks: cloudRepository(),
        pending: pendingSpy(),
        onUploadSuccess,
      },
    )

    expect(onUploadSuccess).not.toHaveBeenCalled()
  })
})

/**
 * The format a deck is built for, between a device and the account.
 *
 * Two copies of a deck holding the same cards for different tournaments
 * disagree about something the reporter chose, so the two sides are asked
 * rather than one being taken. The two spellings of ordinary construction are
 * not a disagreement, or every device would be asked about every deck.
 */
describe('decks that disagree about their format', () => {
  const selection = 'selection-cup-2026-osaka'

  it('asks nothing when one side spells ordinary construction out', () => {
    const plan = planDeckReconciliation({
      localDecks: [deck('a')],
      cloudRows: [
        row('a', { deck: { ...deck('a'), regulationId: 'standard' } }),
      ],
    })

    expect(plan.conflicts).toEqual([])
    expect(plan.identical).toHaveLength(1)
  })

  it('asks when one side is built for a tournament', () => {
    const cloudDeck = { ...deck('a'), regulationId: selection }
    const plan = planDeckReconciliation({
      localDecks: [deck('a')],
      cloudRows: [row('a', { deck: cloudDeck })],
    })

    expect(plan.conflicts).toEqual([
      {
        deckId: 'a',
        kind: 'active-active',
        localDeck: deck('a'),
        cloudDeck,
      },
    ])
  })

  it('asks nothing when both sides are built for the same tournament', () => {
    const both = { ...deck('a'), regulationId: selection }
    const plan = planDeckReconciliation({
      localDecks: [both],
      cloudRows: [row('a', { deck: both })],
    })

    expect(plan.conflicts).toEqual([])
    expect(plan.identical).toEqual([both])
  })

  it('asks when the two sides name different tournaments', () => {
    const plan = planDeckReconciliation({
      localDecks: [{ ...deck('a'), regulationId: selection }],
      cloudRows: [
        row('a', {
          deck: { ...deck('a'), regulationId: 'selection-cup-2027' },
        }),
      ],
    })

    expect(plan.conflicts).toHaveLength(1)
  })

  // Taking the account's copy takes the format it was built for with it.
  it('writes the account s format here when its copy is chosen', async () => {
    const cloudDeck = { ...deck('a'), regulationId: selection }
    const plan = planDeckReconciliation({
      localDecks: [deck('a')],
      cloudRows: [row('a', { deck: cloudDeck })],
    })
    const decks = localStore()

    await applyDeckReconciliation(
      plan,
      { a: 'cloud' },
      {
        decks,
        cloudDecks: cloudRepository(),
      },
    )

    expect(decks.saveDeck).toHaveBeenCalledWith(cloudDeck)
  })

  it('sends this device s format when its copy is chosen', async () => {
    const localDeck = { ...deck('a'), regulationId: selection }
    const plan = planDeckReconciliation({
      localDecks: [localDeck],
      cloudRows: [row('a')],
    })
    const cloudDecks = cloudRepository()

    await applyDeckReconciliation(
      plan,
      { a: 'local' },
      {
        decks: localStore(),
        cloudDecks,
      },
    )

    expect(cloudDecks.upsert).toHaveBeenCalledWith(localDeck)
  })
})
