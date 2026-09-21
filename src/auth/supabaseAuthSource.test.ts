import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { createSupabaseAuthSource } from './authSource'

type Listener = (
  event: string,
  session: { user: { id: string } } | null,
) => void

/**
 * A stand-in for the Supabase client whose `getUser` throws. Reaching for it
 * would mean the stored session is being verified over the network, which is
 * exactly what must not happen when deciding which local database to open.
 */
function fakeClient(session: { user: { id: string } } | null) {
  const listeners: Listener[] = []
  let unsubscribed = 0
  const getUser = vi.fn(() => {
    throw new Error('getUser reaches the network and must not be used here')
  })
  const getSession = vi.fn(async () => ({ data: { session }, error: null }))

  const client = {
    auth: {
      getUser,
      getSession,
      onAuthStateChange: (listener: Listener) => {
        listeners.push(listener)
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                unsubscribed += 1
              },
            },
          },
        }
      },
      signOut: vi.fn(async () => ({ error: null })),
    },
  }

  return {
    client: client as unknown as SupabaseClient,
    getUser,
    getSession,
    signOut: client.auth.signOut,
    emit: (event: string, next: { user: { id: string } } | null) =>
      listeners.forEach((listener) => listener(event, next)),
    get unsubscribed() {
      return unsubscribed
    },
  }
}

const SESSION_A = { user: { id: 'user-a' } }
const SESSION_B = { user: { id: 'user-b' } }

describe('Supabase auth source', () => {
  it('reads the stored session without calling the server', async () => {
    const fake = fakeClient(SESSION_A)
    const source = createSupabaseAuthSource(fake.client)

    expect(await source?.getSessionUser()).toEqual({ id: 'user-a' })
    expect(fake.getSession).toHaveBeenCalledTimes(1)
    expect(fake.getUser).not.toHaveBeenCalled()
  })

  it('keeps a previously signed-in visitor signed in while the network is down', async () => {
    // getUser would reject here; only getSession is consulted, so a cached
    // session still resolves to its account.
    const fake = fakeClient(SESSION_A)
    const source = createSupabaseAuthSource(fake.client)

    await expect(source?.getSessionUser()).resolves.toEqual({ id: 'user-a' })
    expect(fake.getUser).not.toHaveBeenCalled()
  })

  it('resolves to nobody when there is no stored session', async () => {
    const fake = fakeClient(null)
    const source = createSupabaseAuthSource(fake.client)

    expect(await source?.getSessionUser()).toBeUndefined()
    expect(fake.getUser).not.toHaveBeenCalled()
  })

  it('reports each account change from the auth events', () => {
    const fake = fakeClient(SESSION_A)
    const source = createSupabaseAuthSource(fake.client)
    const seen: (string | undefined)[] = []
    const unsubscribe = source!.subscribe((user) => seen.push(user?.id))

    fake.emit('SIGNED_IN', SESSION_A)
    fake.emit('TOKEN_REFRESHED', SESSION_A)
    fake.emit('USER_UPDATED', SESSION_B)
    fake.emit('SIGNED_OUT', null)

    expect(seen).toEqual(['user-a', 'user-a', 'user-b', undefined])
    unsubscribe()
    expect(fake.unsubscribed).toBe(1)
  })

  it('never reaches for getUser, whichever path is taken', async () => {
    const fake = fakeClient(SESSION_A)
    const source = createSupabaseAuthSource(fake.client)

    await source?.getSessionUser()
    const unsubscribe = source!.subscribe(() => undefined)
    fake.emit('SIGNED_IN', SESSION_A)
    await source?.signOut()
    unsubscribe()

    expect(fake.getUser).not.toHaveBeenCalled()
    expect(fake.signOut).toHaveBeenCalledTimes(1)
  })

  it('is unavailable when there is no client at all', () => {
    expect(createSupabaseAuthSource(null)).toBeNull()
  })
})
