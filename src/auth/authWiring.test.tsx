import { render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { DB_NAME } from '../domain/decks/constants'
import {
  readSelectedDeckId,
  selectedDeckStorageKey,
  SELECTED_DECK_STORAGE_KEY,
  writeSelectedDeckId,
} from '../domain/decks/selectedDeckPreference'
import {
  ANONYMOUS_LOCAL_DATA_NAMESPACE,
  indexedDbNameForNamespace,
  userLocalDataNamespace,
} from '../domain/storage/localDataNamespace'
import { AppRepositoriesProvider } from '../repositories/AppRepositoriesProvider'
import { useAppRepositories } from '../repositories/useAppRepositories'
import { AuthProvider } from './AuthProvider'
import { AuthGate } from './AuthGate'
import {
  createSupabaseAuthSource,
  type AuthSource,
  type AuthUser,
} from './authSource'
import { namespaceForAuthState, namespaceKey } from './authState'
import { useAuth } from './useAuth'

/** An auth source the test drives directly, so nothing reaches the network. */
function fakeAuthSource(initial?: AuthUser) {
  const listeners = new Set<(user: AuthUser | undefined) => void>()
  let unsubscribeCount = 0
  let resolveInitial: (user: AuthUser | undefined) => void = () => undefined
  const initialUser = new Promise<AuthUser | undefined>((resolve) => {
    resolveInitial = resolve
  })

  const source: AuthSource = {
    getSessionUser: () => initialUser,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        unsubscribeCount += 1
        listeners.delete(listener)
      }
    },
    signOut: vi.fn(async () => undefined),
  }

  return {
    source,
    settleInitial: (user = initial) => resolveInitial(user),
    emit: (user: AuthUser | undefined) =>
      listeners.forEach((listener) => listener(user)),
    get listenerCount() {
      return listeners.size
    },
    get unsubscribeCount() {
      return unsubscribeCount
    },
  }
}

function Probe() {
  const { state } = useAuth()
  const repositories = useAppRepositories()
  return (
    <div>
      <p data-testid="auth">{state.status}</p>
      <p data-testid="database">
        {indexedDbNameForNamespace(repositories.namespace)}
      </p>
      <p data-testid="preference-key">
        {selectedDeckStorageKey(repositories.namespace)}
      </p>
    </div>
  )
}

function renderApp(authSource: AuthSource | null) {
  return render(
    <AuthProvider authSource={authSource}>
      <AuthGate>
        <AppRepositoriesProvider>
          <Probe />
        </AppRepositoriesProvider>
      </AuthGate>
    </AuthProvider>,
  )
}

const USER_A: AuthUser = { id: 'user-a' }
const USER_B: AuthUser = { id: 'user-b' }

describe('auth state to local namespace', () => {
  it('stays anonymous on the original database when Cloud Sync is not configured', () => {
    renderApp(null)

    expect(screen.getByTestId('auth')).toHaveTextContent('anonymous')
    expect(screen.getByTestId('database')).toHaveTextContent(DB_NAME)
    expect(screen.getByTestId('database')).toHaveTextContent('holocard-db')
    expect(screen.getByTestId('preference-key')).toHaveTextContent(
      SELECTED_DECK_STORAGE_KEY,
    )
  })

  it('holds the app back until the session is known', async () => {
    const auth = fakeAuthSource()
    renderApp(auth.source)

    // Showing anything data-driven here would show the wrong account's data.
    expect(screen.queryByTestId('database')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeVisible()

    auth.settleInitial(USER_A)
    expect(await screen.findByTestId('database')).toHaveTextContent(
      'holocard-db--user-a',
    )
  })

  it('resolves to anonymous when there is no session', async () => {
    const auth = fakeAuthSource()
    renderApp(auth.source)
    auth.settleInitial(undefined)

    expect(await screen.findByTestId('auth')).toHaveTextContent('anonymous')
    expect(screen.getByTestId('database')).toHaveTextContent('holocard-db')
  })

  it('keeps reading the original database for a signed-out visitor', async () => {
    const auth = fakeAuthSource()
    renderApp(auth.source)
    auth.settleInitial(undefined)

    const database = await screen.findByTestId('database')
    expect(database.textContent).toBe('holocard-db')
    expect(database.textContent).not.toContain('--')
  })

  it('moves to the account database and back across a sign-in and sign-out', async () => {
    const auth = fakeAuthSource()
    renderApp(auth.source)
    auth.settleInitial(undefined)
    expect(await screen.findByTestId('database')).toHaveTextContent(
      'holocard-db',
    )

    auth.emit(USER_A)
    await waitFor(() =>
      expect(screen.getByTestId('database')).toHaveTextContent(
        'holocard-db--user-a',
      ),
    )

    auth.emit(USER_B)
    await waitFor(() =>
      expect(screen.getByTestId('database')).toHaveTextContent(
        'holocard-db--user-b',
      ),
    )

    auth.emit(undefined)
    await waitFor(() =>
      expect(screen.getByTestId('database').textContent).toBe('holocard-db'),
    )
  })

  it('gives each account its own selected deck preference key', async () => {
    const auth = fakeAuthSource()
    renderApp(auth.source)
    auth.settleInitial(USER_A)

    await waitFor(() =>
      expect(screen.getByTestId('preference-key')).toHaveTextContent(
        'hlsieve:selected-deck--user-a',
      ),
    )

    auth.emit(USER_B)
    await waitFor(() =>
      expect(screen.getByTestId('preference-key')).toHaveTextContent(
        'hlsieve:selected-deck--user-b',
      ),
    )
  })

  it('releases the auth subscription when the provider goes away', async () => {
    const auth = fakeAuthSource()
    const { unmount } = renderApp(auth.source)
    auth.settleInitial(USER_A)
    await screen.findByTestId('database')

    expect(auth.listenerCount).toBe(1)
    unmount()
    expect(auth.unsubscribeCount).toBeGreaterThanOrEqual(1)
    expect(auth.listenerCount).toBe(0)
  })

  it('ignores a session that arrives after the provider is gone', async () => {
    const auth = fakeAuthSource()
    const { unmount } = renderApp(auth.source)
    unmount()

    expect(() => auth.settleInitial(USER_A)).not.toThrow()
    await waitFor(() => expect(auth.listenerCount).toBe(0))
  })
})

describe('repository bundle per account', () => {
  function BundleProbe({ onBundle }: { onBundle: (id: string) => void }) {
    const repositories = useAppRepositories()
    useEffect(() => {
      onBundle(indexedDbNameForNamespace(repositories.namespace))
    }, [onBundle, repositories])
    return <p data-testid="ns">{namespaceKey(repositories.namespace)}</p>
  }

  it('builds a new bundle for each account and reuses it otherwise', async () => {
    const auth = fakeAuthSource()
    const seen: string[] = []
    const { rerender } = render(
      <AuthProvider authSource={auth.source}>
        <AuthGate>
          <AppRepositoriesProvider>
            <BundleProbe onBundle={(id) => seen.push(id)} />
          </AppRepositoriesProvider>
        </AuthGate>
      </AuthProvider>,
    )
    auth.settleInitial(USER_A)
    await screen.findByTestId('ns')

    rerender(
      <AuthProvider authSource={auth.source}>
        <AuthGate>
          <AppRepositoriesProvider>
            <BundleProbe onBundle={(id) => seen.push(id)} />
          </AppRepositoriesProvider>
        </AuthGate>
      </AuthProvider>,
    )

    // A plain re-render must not throw away the open database handles.
    expect(new Set(seen)).toEqual(new Set(['holocard-db--user-a']))

    auth.emit(USER_B)
    await waitFor(() =>
      expect(screen.getByTestId('ns')).toHaveTextContent('user:user-b'),
    )
    expect(seen).toContain('holocard-db--user-b')
  })
})

describe('selected deck preference isolation', () => {
  it('keeps the anonymous key exactly as it was', () => {
    expect(selectedDeckStorageKey()).toBe('hlsieve:selected-deck')
    expect(selectedDeckStorageKey(ANONYMOUS_LOCAL_DATA_NAMESPACE)).toBe(
      'hlsieve:selected-deck',
    )
  })

  it('reads a value written before accounts existed', () => {
    const storage = new Map<string, string>([
      ['hlsieve:selected-deck', 'legacy-deck'],
    ])
    const fake = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    }

    expect(readSelectedDeckId(fake)).toBe('legacy-deck')
    expect(readSelectedDeckId(fake, ANONYMOUS_LOCAL_DATA_NAMESPACE)).toBe(
      'legacy-deck',
    )
  })

  it('does not let one account see another selection, or the anonymous one', () => {
    const storage = new Map<string, string>()
    const fake = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    }
    const userA = userLocalDataNamespace('user-a')
    const userB = userLocalDataNamespace('user-b')

    writeSelectedDeckId('anon-deck', fake)
    writeSelectedDeckId('a-deck', fake, userA)
    writeSelectedDeckId('b-deck', fake, userB)

    expect(readSelectedDeckId(fake)).toBe('anon-deck')
    expect(readSelectedDeckId(fake, userA)).toBe('a-deck')
    expect(readSelectedDeckId(fake, userB)).toBe('b-deck')
  })

  it('keeps the same deck id independent per account', () => {
    const storage = new Map<string, string>()
    const fake = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    }
    const userA = userLocalDataNamespace('user-a')
    const userB = userLocalDataNamespace('user-b')

    writeSelectedDeckId('shared-id', fake, userA)
    expect(readSelectedDeckId(fake, userB)).toBeUndefined()

    writeSelectedDeckId('shared-id', fake, userB)
    expect(readSelectedDeckId(fake, userA)).toBe('shared-id')
    expect(readSelectedDeckId(fake, userB)).toBe('shared-id')
    expect([...storage.keys()]).toEqual([
      'hlsieve:selected-deck--user-a',
      'hlsieve:selected-deck--user-b',
    ])
  })
})

describe('namespace derivation', () => {
  it('maps each auth state to the matching namespace', () => {
    expect(namespaceForAuthState({ status: 'anonymous' })).toEqual(
      ANONYMOUS_LOCAL_DATA_NAMESPACE,
    )
    expect(namespaceForAuthState({ status: 'loading' })).toEqual(
      ANONYMOUS_LOCAL_DATA_NAMESPACE,
    )
    expect(
      namespaceForAuthState({ status: 'authenticated', user: USER_A }),
    ).toEqual(userLocalDataNamespace('user-a'))
  })
})

describe('offline restore of a previously signed-in account', () => {
  /**
   * The situation this guards: the visitor signed in as User A earlier, the
   * session is still stored, and the app now starts with no way to reach the
   * project. Verifying the token over the network would fail and drop them to
   * the anonymous database, hiding their decks.
   */
  function unreachableProjectClient(session: { user: { id: string } } | null) {
    return {
      auth: {
        getUser: () => {
          throw new Error('the project is unreachable')
        },
        getSession: async () => ({ data: { session }, error: null }),
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe: () => undefined } },
        }),
        signOut: async () => ({ error: null }),
      },
    } as unknown as Parameters<typeof createSupabaseAuthSource>[0]
  }

  it('keeps User A on their own database and preference key while offline', async () => {
    const source = createSupabaseAuthSource(
      unreachableProjectClient({ user: { id: 'user-a' } }),
    )
    renderApp(source)

    expect(await screen.findByTestId('auth')).toHaveTextContent('authenticated')
    expect(screen.getByTestId('database')).toHaveTextContent(
      'holocard-db--user-a',
    )
    expect(screen.getByTestId('preference-key')).toHaveTextContent(
      'hlsieve:selected-deck--user-a',
    )
  })

  it('still resolves to anonymous when the stored session is empty', async () => {
    const source = createSupabaseAuthSource(unreachableProjectClient(null))
    renderApp(source)

    expect(await screen.findByTestId('auth')).toHaveTextContent('anonymous')
    expect(screen.getByTestId('database').textContent).toBe('holocard-db')
  })

  it('falls back to anonymous only when the session cannot be read at all', async () => {
    const broken: AuthSource = {
      getSessionUser: () => Promise.reject(new Error('storage unreadable')),
      subscribe: () => () => undefined,
      signOut: async () => undefined,
    }
    renderApp(broken)

    expect(await screen.findByTestId('auth')).toHaveTextContent('anonymous')
    expect(screen.getByTestId('database').textContent).toBe('holocard-db')
  })
})
