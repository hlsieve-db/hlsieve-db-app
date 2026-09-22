import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type {
  CloudDeckRecord,
  CloudDeckRepository,
  CloudDeckResult,
} from '../../cloud/cloudDeckRepository'
import { readCloudSyncState } from '../../domain/cloud/cloudSyncState'
import type { Deck } from '../../domain/decks/types'
import { userLocalDataNamespace } from '../../domain/storage/localDataNamespace'
import { AppRepositoriesContext } from '../../repositories/appRepositoriesContext'
import type { AppRepositories } from '../../repositories/appRepositories'
import { CloudSyncSetup } from './CloudSyncSetup'

function deck(id: string): Deck {
  return {
    id,
    name: `デッキ ${id}`,
    entries: [],
    createdAt: '2026-09-22T00:00:00.000Z',
    updatedAt: '2026-09-22T00:00:00.000Z',
  }
}

function cloudRecord(
  id: string,
  deletedAt: string | null = null,
): CloudDeckRecord {
  return {
    id,
    deck: deck(id),
    createdAt: '2026-09-22T04:00:00.000000+00:00',
    updatedAt: '2026-09-22T04:00:00.000000+00:00',
    deletedAt,
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

/** Every mutation is present so a test can prove it was never called. */
function cloudRepository(
  listAll: () => Promise<CloudDeckResult<CloudDeckRecord[]>>,
): CloudDeckRepository {
  return {
    listAll: vi.fn(listAll),
    listUpdatedSince: vi.fn(async () => ({ ok: true as const, value: [] })),
    upsert: vi.fn(async () => ({
      ok: false as const,
      reason: 'failed' as const,
    })),
    tombstone: vi.fn(async () => ({
      ok: false as const,
      reason: 'failed' as const,
    })),
  }
}

function renderSetup({
  localDecks = [deck('a'), deck('b')],
  cloudDecks = cloudRepository(async () => ({ ok: true, value: [] })),
  storage = memoryStorage(),
  userId = 'user-a',
}: {
  localDecks?: Deck[]
  cloudDecks?: CloudDeckRepository | null
  storage?: ReturnType<typeof memoryStorage>
  userId?: string
} = {}) {
  const namespace = userLocalDataNamespace(userId)
  const repositories = {
    namespace,
    decks: { listDecks: vi.fn(async () => localDecks) },
    cloudDecks,
  } as unknown as AppRepositories

  const result = render(
    <AppRepositoriesContext.Provider value={repositories}>
      <CloudSyncSetup storage={storage} />
    </AppRepositoriesContext.Provider>,
  )
  return { ...result, cloudDecks, storage, namespace, repositories }
}

const setupButton = () =>
  screen.getByRole('button', { name: 'クラウド同期を設定' })
const enableButton = () =>
  screen.getByRole('button', { name: 'クラウド同期を有効にする' })

describe('when there is no cloud repository', () => {
  // Anonymous, or a deployment with no Supabase configured.
  it('renders nothing at all', () => {
    const { container } = renderSetup({ cloudDecks: null })
    expect(container).toBeEmptyDOMElement()
  })
})

describe('before setup', () => {
  it('says the account has not set sync up, and offers to start', () => {
    renderSetup()

    expect(screen.getByText('未設定')).toBeVisible()
    expect(setupButton()).toBeVisible()
  })

  // The privacy policy promises signing in alone sends nothing, so the panel
  // must not read the cloud merely by existing.
  it('reads nothing from the cloud until asked', () => {
    const { cloudDecks } = renderSetup()

    expect(cloudDecks?.listAll).not.toHaveBeenCalled()
  })
})

describe('starting setup', () => {
  it('counts the decks on each side', async () => {
    const { cloudDecks } = renderSetup({
      localDecks: [deck('a'), deck('b'), deck('c')],
      cloudDecks: cloudRepository(async () => ({
        ok: true,
        value: [cloudRecord('x'), cloudRecord('y')],
      })),
    })

    fireEvent.click(setupButton())

    expect(await screen.findByText('この端末のデッキ: 3件')).toBeVisible()
    expect(screen.getByText('クラウド上のデッキ: 2件')).toBeVisible()
    expect(cloudDecks?.listAll).toHaveBeenCalledTimes(1)
  })

  // A tombstone is a row, not a deck. Counting them would tell the account it
  // has decks in the cloud that it deleted.
  it('leaves tombstones out of the cloud count', async () => {
    renderSetup({
      localDecks: [],
      cloudDecks: cloudRepository(async () => ({
        ok: true,
        value: [
          cloudRecord('kept'),
          cloudRecord('gone', '2026-09-22T05:00:00.000000+00:00'),
          cloudRecord('also-gone', '2026-09-22T06:00:00.000000+00:00'),
        ],
      })),
    })

    fireEvent.click(setupButton())

    expect(await screen.findByText('クラウド上のデッキ: 1件')).toBeVisible()
  })

  it('does not enable sync merely by looking', async () => {
    const { storage, namespace } = renderSetup()
    fireEvent.click(setupButton())
    await screen.findByText('この端末のデッキ: 2件')

    expect(readCloudSyncState(storage, namespace).status).toBe('not_started')
  })
})

describe('enabling sync', () => {
  it('records the choice for this account', async () => {
    const { storage, namespace } = renderSetup()
    fireEvent.click(setupButton())
    fireEvent.click(
      await screen.findByRole('button', { name: 'クラウド同期を有効にする' }),
    )

    expect(readCloudSyncState(storage, namespace).status).toBe('enabled')
    expect(screen.getByText('有効')).toBeVisible()
  })

  // Enabling prepares; it does not sync. Saying otherwise would be a claim the
  // code cannot back until a later phase.
  it('says it is ready rather than done', async () => {
    renderSetup()
    fireEvent.click(setupButton())
    fireEvent.click(
      await screen.findByRole('button', { name: 'クラウド同期を有効にする' }),
    )

    expect(screen.getByText(/同期の準備ができました/)).toBeVisible()
    const text = document.body.textContent ?? ''
    expect(text).not.toContain('同期完了')
    expect(text).not.toContain('現在同期されています')
  })

  it('shows the enabled state again on a later render', () => {
    const storage = memoryStorage({
      'hlsieve:cloud-sync--user-a': '{"version":1,"status":"enabled"}',
    })
    renderSetup({ storage })

    expect(screen.getByText('有効')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'クラウド同期を設定' }),
    ).not.toBeInTheDocument()
  })
})

describe('accounts stay separate', () => {
  it('does not show account B the choice account A made', () => {
    const storage = memoryStorage({
      'hlsieve:cloud-sync--user-a': '{"version":1,"status":"enabled"}',
    })
    renderSetup({ storage, userId: 'user-b' })

    expect(screen.getByText('未設定')).toBeVisible()
    expect(setupButton()).toBeVisible()
  })
})

describe('when the cloud cannot be read', () => {
  it.each([
    ['network', 'クラウドに接続できませんでした。'],
    ['unauthenticated', 'ログイン状態を確認してください。'],
    ['forbidden', 'クラウドデータへアクセスできません。'],
    ['invalid-data', 'クラウド上のデータを読み込めませんでした。'],
    ['failed', 'クラウド情報の取得に失敗しました。'],
  ])('reports %s in its own words', async (reason, message) => {
    renderSetup({
      cloudDecks: cloudRepository(async () => ({
        ok: false,
        reason: reason as never,
      })),
    })

    fireEvent.click(setupButton())

    expect(await screen.findByText(message)).toBeVisible()
    // Nothing the server said reaches the page.
    const text = document.body.textContent ?? ''
    ;['PGRST', 'supabase', '42501', 'permission denied'].forEach((fragment) =>
      expect(text).not.toContain(fragment),
    )
  })

  it('does not enable sync after a failure', async () => {
    const { storage, namespace } = renderSetup({
      cloudDecks: cloudRepository(async () => ({
        ok: false,
        reason: 'network',
      })),
    })

    fireEvent.click(setupButton())
    await screen.findByText('クラウドに接続できませんでした。')

    expect(readCloudSyncState(storage, namespace).status).toBe('not_started')
    expect(
      screen.queryByRole('button', { name: 'クラウド同期を有効にする' }),
    ).not.toBeInTheDocument()
  })

  it('recovers on retry', async () => {
    const listAll = vi
      .fn<() => Promise<CloudDeckResult<CloudDeckRecord[]>>>()
      .mockResolvedValueOnce({ ok: false, reason: 'network' })
      .mockResolvedValueOnce({ ok: true, value: [cloudRecord('x')] })
    renderSetup({ cloudDecks: cloudRepository(listAll) })

    fireEvent.click(setupButton())
    fireEvent.click(await screen.findByRole('button', { name: '再試行' }))

    expect(await screen.findByText('クラウド上のデッキ: 1件')).toBeVisible()
  })

  it('reports a local read failure without blaming the cloud wrongly', async () => {
    const namespace = userLocalDataNamespace('user-a')
    const repositories = {
      namespace,
      decks: {
        listDecks: vi.fn(async () => {
          throw new Error('indexeddb unavailable')
        }),
      },
      cloudDecks: cloudRepository(async () => ({ ok: true, value: [] })),
    } as unknown as AppRepositories

    render(
      <AppRepositoriesContext.Provider value={repositories}>
        <CloudSyncSetup storage={memoryStorage()} />
      </AppRepositoriesContext.Provider>,
    )
    fireEvent.click(setupButton())

    expect(
      await screen.findByText('クラウド情報の取得に失敗しました。'),
    ).toBeVisible()
  })
})

// The whole point of this phase: the account can decide, and nothing moves.
describe('no cloud deck is written anywhere in this flow', () => {
  it('never upserts or tombstones, through the entire decision', async () => {
    const { cloudDecks, storage, namespace } = renderSetup()

    // Rendering.
    expect(cloudDecks?.upsert).not.toHaveBeenCalled()
    expect(cloudDecks?.tombstone).not.toHaveBeenCalled()

    // Opening setup.
    fireEvent.click(setupButton())
    await screen.findByText('この端末のデッキ: 2件')
    expect(cloudDecks?.upsert).not.toHaveBeenCalled()
    expect(cloudDecks?.tombstone).not.toHaveBeenCalled()

    // Enabling.
    fireEvent.click(enableButton())
    await waitFor(() =>
      expect(readCloudSyncState(storage, namespace).status).toBe('enabled'),
    )
    expect(cloudDecks?.upsert).not.toHaveBeenCalled()
    expect(cloudDecks?.tombstone).not.toHaveBeenCalled()

    // Only the read used to count.
    expect(cloudDecks?.listAll).toHaveBeenCalledTimes(1)
    expect(cloudDecks?.listUpdatedSince).not.toHaveBeenCalled()
  })

  it('writes nothing after an already enabled account renders again', () => {
    const storage = memoryStorage({
      'hlsieve:cloud-sync--user-a': '{"version":1,"status":"enabled"}',
    })
    const { cloudDecks } = renderSetup({ storage })

    expect(cloudDecks?.listAll).not.toHaveBeenCalled()
    expect(cloudDecks?.upsert).not.toHaveBeenCalled()
    expect(cloudDecks?.tombstone).not.toHaveBeenCalled()
  })
})
