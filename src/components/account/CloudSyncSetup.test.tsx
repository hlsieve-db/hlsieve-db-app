import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
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
import {
  UNSENT_CHANGE_MESSAGES,
  unsentChangeMessage,
} from './unsentChangeMessage'

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

function cloudRepository(
  listAll: () => Promise<CloudDeckResult<CloudDeckRecord[]>>,
  upsert: (deck: Deck) => Promise<CloudDeckResult<CloudDeckRecord>> = async (
    deck,
  ) => ({ ok: true as const, value: cloudRecord(deck.id) }),
): CloudDeckRepository {
  return {
    listAll: vi.fn(listAll),
    listUpdatedSince: vi.fn(async () => ({ ok: true as const, value: [] })),
    upsert: vi.fn(upsert),
    // Present so a test can prove the first sync never deletes anything.
    tombstone: vi.fn(async () => ({
      ok: false as const,
      reason: 'not-found' as const,
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
  // The wrapped and unwrapped stores are distinct objects, so a test can prove
  // a restore writes through the one that does not upload.
  const local = {
    listDecks: vi.fn(async () => localDecks),
    getDeck: vi.fn(async (id: string) => localDecks.find((d) => d.id === id)),
    saveDeck: vi.fn(async () => undefined),
    deleteDeck: vi.fn(async () => undefined),
  }
  const repositories = {
    namespace,
    decks: { listDecks: vi.fn(async () => localDecks) },
    localDecks: local,
    cloudDecks,
  } as unknown as AppRepositories

  const result = render(
    <AppRepositoriesContext.Provider value={repositories}>
      <CloudSyncSetup storage={storage} />
    </AppRepositoriesContext.Provider>,
  )
  return { ...result, cloudDecks, storage, namespace, repositories, local }
}

const setupButton = () =>
  screen.getByRole('button', { name: 'クラウド同期を設定' })
const enableButton = () =>
  screen.getByRole('button', { name: 'この端末のデッキをクラウドへ保存' })

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
  it('uploads the local decks and then records the choice', async () => {
    const { storage, namespace, cloudDecks } = renderSetup()
    fireEvent.click(setupButton())
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'この端末のデッキをクラウドへ保存',
      }),
    )

    expect(await screen.findByText('有効')).toBeVisible()
    expect(readCloudSyncState(storage, namespace).status).toBe('enabled')
    expect(cloudDecks?.upsert).toHaveBeenCalledTimes(2)
    expect(screen.getByText('デッキ2個を保存しました。')).toBeVisible()
  })

  it('says what it actually did, without overclaiming', async () => {
    renderSetup()
    fireEvent.click(setupButton())
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'この端末のデッキをクラウドへ保存',
      }),
    )
    await screen.findByText('有効')

    expect(screen.getByText('クラウド同期が有効になりました。')).toBeVisible()
    // Nothing is downloaded, so it must not suggest the two sides now match.
    const text = document.body.textContent ?? ''
    expect(text).not.toContain('同期が完了')
    expect(text).not.toContain('最新の状態')
  })

  it('shows progress while the decks are going up', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const cloudDecks = cloudRepository(
      async () => ({ ok: true, value: [] }),
      async (value) => {
        await gate
        return { ok: true as const, value: cloudRecord(value.id) }
      },
    )
    renderSetup({ cloudDecks, localDecks: [deck('a'), deck('b'), deck('c')] })

    fireEvent.click(setupButton())
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'この端末のデッキをクラウドへ保存',
      }),
    )

    expect(await screen.findByText(/同期しています/)).toBeVisible()
    expect(screen.getByText(/0 . 3/)).toBeVisible()

    release?.()
    expect(await screen.findByText('有効')).toBeVisible()
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

describe('when an upload fails', () => {
  const failingUpload = (reason: string) =>
    cloudRepository(
      async () => ({ ok: true, value: [] }),
      async () => ({ ok: false as const, reason: reason as never }),
    )

  // A partial upload must not leave the account believing it is syncing.
  it('does not enable sync, and offers a retry', async () => {
    const { storage, namespace } = renderSetup({
      cloudDecks: failingUpload('network'),
    })
    fireEvent.click(setupButton())
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'この端末のデッキをクラウドへ保存',
      }),
    )

    expect(await screen.findByText('同期できませんでした。')).toBeVisible()
    expect(screen.getByText('クラウドに接続できませんでした。')).toBeVisible()
    expect(readCloudSyncState(storage, namespace).status).toBe('not_started')
    expect(screen.getByText('未設定')).toBeVisible()
    expect(screen.getByRole('button', { name: '再試行' })).toBeVisible()
  })

  it('keeps the decks that did go up, and can be retried', async () => {
    let failing = true
    const cloudDecks = cloudRepository(
      async () => ({ ok: true, value: [] }),
      async (value) =>
        failing && value.id === 'b'
          ? { ok: false as const, reason: 'network' as const }
          : { ok: true as const, value: cloudRecord(value.id) },
    )
    const { storage, namespace } = renderSetup({
      cloudDecks,
      localDecks: [deck('a'), deck('b')],
    })

    fireEvent.click(setupButton())
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'この端末のデッキをクラウドへ保存',
      }),
    )
    await screen.findByText('同期できませんでした。')
    expect(readCloudSyncState(storage, namespace).status).toBe('not_started')

    failing = false
    fireEvent.click(screen.getByRole('button', { name: '再試行' }))
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'この端末のデッキをクラウドへ保存',
      }),
    )

    expect(await screen.findByText('有効')).toBeVisible()
    expect(readCloudSyncState(storage, namespace).status).toBe('enabled')
    // a is written twice across the two runs, which an upsert makes harmless.
    expect(cloudDecks.upsert).toHaveBeenCalledTimes(4)
  })

  it('shows no raw database detail', async () => {
    renderSetup({ cloudDecks: failingUpload('forbidden') })
    fireEvent.click(setupButton())
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'この端末のデッキをクラウドへ保存',
      }),
    )
    await screen.findByText('同期できませんでした。')

    const text = document.body.textContent ?? ''
    ;['PGRST', 'supabase', '42501', 'permission denied'].forEach((fragment) =>
      expect(text).not.toContain(fragment),
    )
  })
})

// The first sync happens once. An account that already enabled it is not
// asked again, and nothing is re-uploaded on a later visit.
describe('an account that already enabled sync', () => {
  it('is not offered the first sync again, and uploads nothing', () => {
    const storage = memoryStorage({
      'hlsieve:cloud-sync--user-a': '{"version":1,"status":"enabled"}',
    })
    const { cloudDecks } = renderSetup({ storage })

    expect(screen.getByText('有効')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'クラウド同期を設定' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: 'この端末のデッキをクラウドへ保存',
      }),
    ).not.toBeInTheDocument()
    expect(cloudDecks?.upsert).not.toHaveBeenCalled()
    expect(cloudDecks?.listAll).not.toHaveBeenCalled()
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
      screen.queryByRole('button', {
        name: 'この端末のデッキをクラウドへ保存',
      }),
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

// Decks move only when the reporter says so, and only upwards.
describe('nothing is sent before the reporter agrees', () => {
  it('writes nothing until the enable button is pressed', async () => {
    const { cloudDecks, storage, namespace } = renderSetup()

    expect(cloudDecks?.upsert).not.toHaveBeenCalled()

    // Counting reads; it does not write.
    fireEvent.click(setupButton())
    await screen.findByText('この端末のデッキ: 2件')
    expect(cloudDecks?.upsert).not.toHaveBeenCalled()

    // Enabling is the first thing that sends anything.
    fireEvent.click(enableButton())
    await waitFor(() =>
      expect(readCloudSyncState(storage, namespace).status).toBe('enabled'),
    )
    expect(cloudDecks?.upsert).toHaveBeenCalledTimes(2)
  })

  // The first sync only uploads. Nothing is deleted and nothing is pulled
  // down, which is what keeps it safe to run without asking anyone to resolve
  // a conflict.
  it('never deletes or downloads', async () => {
    const { cloudDecks } = renderSetup()
    fireEvent.click(setupButton())
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'この端末のデッキをクラウドへ保存',
      }),
    )
    await screen.findByText('有効')

    expect(cloudDecks?.tombstone).not.toHaveBeenCalled()
    expect(cloudDecks?.listUpdatedSince).not.toHaveBeenCalled()
    expect(cloudDecks?.listAll).toHaveBeenCalledTimes(1)
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

describe('restoring from the cloud', () => {
  const enabledStorage = () =>
    memoryStorage({
      'hlsieve:cloud-sync--user-a': '{"version":1,"status":"enabled"}',
    })

  const restoreButton = () =>
    screen.getByRole('button', { name: 'クラウドから復元' })

  // Only an account that has turned sync on is offered it.
  it('is not offered before sync is enabled', () => {
    renderSetup()

    expect(
      screen.queryByRole('button', { name: 'クラウドから復元' }),
    ).not.toBeInTheDocument()
  })

  it('reads nothing until it is asked to', () => {
    const { cloudDecks } = renderSetup({ storage: enabledStorage() })

    expect(restoreButton()).toBeVisible()
    expect(cloudDecks?.listAll).not.toHaveBeenCalled()
  })

  // Nothing here to overwrite, so there is nothing to ask about.
  it('restores straight away when this device has no decks', async () => {
    const { local } = renderSetup({
      storage: enabledStorage(),
      localDecks: [],
      cloudDecks: cloudRepository(async () => ({
        ok: true,
        value: [cloudRecord('a'), cloudRecord('b')],
      })),
    })

    fireEvent.click(restoreButton())

    expect(
      await screen.findByText(/デッキ2個を取り込み、0個を削除しました/),
    ).toBeVisible()
    expect(local.saveDeck).toHaveBeenCalledTimes(2)
  })

  // Taking the cloud copy overwrites what is here, so it asks first.
  it('asks before overwriting decks that are already here', async () => {
    const { local } = renderSetup({
      storage: enabledStorage(),
      localDecks: [deck('a')],
      cloudDecks: cloudRepository(async () => ({
        ok: true,
        value: [cloudRecord('a')],
      })),
    })

    fireEvent.click(restoreButton())

    expect(await screen.findByText('この端末のデッキ: 1件')).toBeVisible()
    expect(screen.getByText('取り込むデッキ: 1件')).toBeVisible()
    expect(screen.getByText('削除するデッキ: 0件')).toBeVisible()
    // Nothing is written while the question is on screen.
    expect(local.saveDeck).not.toHaveBeenCalled()
  })

  it('writes nothing when the reporter keeps this device', async () => {
    const { local } = renderSetup({
      storage: enabledStorage(),
      localDecks: [deck('a')],
      cloudDecks: cloudRepository(async () => ({
        ok: true,
        value: [cloudRecord('a')],
      })),
    })
    fireEvent.click(restoreButton())
    fireEvent.click(
      await screen.findByRole('button', { name: 'この端末を維持する' }),
    )

    expect(local.saveDeck).not.toHaveBeenCalled()
    expect(local.deleteDeck).not.toHaveBeenCalled()
    expect(restoreButton()).toBeVisible()
  })

  it('applies the plan once the reporter confirms', async () => {
    const { local } = renderSetup({
      storage: enabledStorage(),
      localDecks: [deck('a')],
      cloudDecks: cloudRepository(async () => ({
        ok: true,
        value: [cloudRecord('a'), cloudRecord('cloud-only')],
      })),
    })
    fireEvent.click(restoreButton())
    fireEvent.click(
      await screen.findByRole('button', { name: 'クラウドから復元する' }),
    )

    expect(
      await screen.findByText(/デッキ2個を取り込み、0個を削除しました/),
    ).toBeVisible()
    expect(local.saveDeck).toHaveBeenCalledTimes(2)
    expect(local.deleteDeck).not.toHaveBeenCalled()
  })

  // The account saying a deck was deleted disagrees with this device still
  // holding it, and that is asked about rather than applied.
  it('asks about a deck the account deleted instead of removing it', async () => {
    const { local } = renderSetup({
      storage: enabledStorage(),
      localDecks: [deck('a'), deck('gone')],
      cloudDecks: cloudRepository(async () => ({
        ok: true,
        value: [
          cloudRecord('a'),
          cloudRecord('gone', '2026-09-22T05:00:00.000000+00:00'),
        ],
      })),
    })
    fireEvent.click(restoreButton())

    expect(
      await screen.findByText('1件のデッキで違いがあります。'),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'クラウドから復元する' }),
    ).not.toBeInTheDocument()
    expect(local.deleteDeck).not.toHaveBeenCalled()
    expect(local.saveDeck).not.toHaveBeenCalled()
  })

  // Restored decks came from the account, so sending them back would be a
  // pointless round trip.
  it('writes through the store that does not upload', async () => {
    const { local, cloudDecks } = renderSetup({
      storage: enabledStorage(),
      localDecks: [],
      cloudDecks: cloudRepository(async () => ({
        ok: true,
        value: [cloudRecord('a')],
      })),
    })

    fireEvent.click(restoreButton())
    await screen.findByText(/デッキ1個を取り込み/)

    expect(local.saveDeck).toHaveBeenCalledTimes(1)
    expect(cloudDecks?.upsert).not.toHaveBeenCalled()
    expect(cloudDecks?.tombstone).not.toHaveBeenCalled()
  })

  it('reports a cloud failure and offers a retry', async () => {
    const { local } = renderSetup({
      storage: enabledStorage(),
      cloudDecks: cloudRepository(async () => ({
        ok: false,
        reason: 'network',
      })),
    })

    fireEvent.click(restoreButton())

    expect(
      await screen.findByText('クラウドから復元できませんでした。'),
    ).toBeVisible()
    expect(screen.getByText('クラウドに接続できませんでした。')).toBeVisible()
    expect(screen.getByRole('button', { name: '再試行' })).toBeVisible()
    expect(local.saveDeck).not.toHaveBeenCalled()
  })
})

/**
 * Sync being off is a fact about this device, not the account. A second device
 * signing into an account that already syncs starts at 未設定 too, so setting
 * up must look at the cloud before deciding anything.
 */
describe('first activation on a device', () => {
  const setup = () => screen.getByRole('button', { name: 'クラウド同期を設定' })
  const TOMBSTONED = '2026-09-22T05:00:00.000000+00:00'

  // CASE A: the account has never synced, so this device seeds it.
  it('uploads when the account holds no rows at all', async () => {
    const { cloudDecks, local, storage, namespace } = renderSetup({
      localDecks: [deck('a'), deck('b')],
      cloudDecks: cloudRepository(async () => ({ ok: true, value: [] })),
    })

    fireEvent.click(setup())
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'この端末のデッキをクラウドへ保存',
      }),
    )

    expect(await screen.findByText('有効')).toBeVisible()
    expect(cloudDecks?.upsert).toHaveBeenCalledTimes(2)
    expect(local.saveDeck).not.toHaveBeenCalled()
    expect(readCloudSyncState(storage, namespace).status).toBe('enabled')
  })

  // CASE B: the account has decks and this device has none, so nothing here
  // can be lost.
  it('restores when this device has no decks', async () => {
    const { cloudDecks, local, storage, namespace } = renderSetup({
      localDecks: [],
      cloudDecks: cloudRepository(async () => ({
        ok: true,
        value: [cloudRecord('a'), cloudRecord('b')],
      })),
    })

    fireEvent.click(setup())
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'クラウドのデッキをこの端末へ取り込む',
      }),
    )

    expect(await screen.findByText('有効')).toBeVisible()
    expect(local.saveDeck).toHaveBeenCalledTimes(2)
    expect(cloudDecks?.upsert).not.toHaveBeenCalled()
    expect(readCloudSyncState(storage, namespace).status).toBe('enabled')
  })

  // CASE C: both sides hold data, so neither direction may be assumed.
  it('asks which side wins when both hold decks', async () => {
    renderSetup({
      localDecks: [deck('a')],
      cloudDecks: cloudRepository(async () => ({
        ok: true,
        value: [cloudRecord('b')],
      })),
    })

    fireEvent.click(setup())

    expect(
      await screen.findByRole('button', { name: 'クラウドから復元' }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'この端末のデッキをクラウドへ反映' }),
    ).toBeVisible()
    expect(screen.getByText('この端末のデッキ: 1件')).toBeVisible()
    expect(screen.getByText('クラウド上のデッキ: 1件')).toBeVisible()
  })

  // The heart of the fix: reading is allowed, writing is not, until the
  // reporter picks a side.
  it('writes nothing on either side before the choice', async () => {
    const { cloudDecks, local, storage, namespace } = renderSetup({
      localDecks: [deck('a')],
      cloudDecks: cloudRepository(async () => ({
        ok: true,
        value: [cloudRecord('b')],
      })),
    })

    fireEvent.click(setup())
    await screen.findByRole('button', { name: 'クラウドから復元' })

    expect(cloudDecks?.upsert).not.toHaveBeenCalled()
    expect(cloudDecks?.tombstone).not.toHaveBeenCalled()
    expect(local.saveDeck).not.toHaveBeenCalled()
    expect(local.deleteDeck).not.toHaveBeenCalled()
    // Reading is what it is allowed to do.
    expect(cloudDecks?.listAll).toHaveBeenCalledTimes(1)
    expect(local.listDecks).toHaveBeenCalled()
    expect(readCloudSyncState(storage, namespace).status).toBe('not_started')
  })

  // An account whose decks were all deleted still holds rows, and uploading
  // over them would resurrect them, so it is not treated as never synced.
  it('asks even when every cloud row is a tombstone', async () => {
    renderSetup({
      localDecks: [deck('a')],
      cloudDecks: cloudRepository(async () => ({
        ok: true,
        value: [cloudRecord('gone', TOMBSTONED)],
      })),
    })

    fireEvent.click(setup())

    expect(
      await screen.findByRole('button', { name: 'クラウドから復元' }),
    ).toBeVisible()
  })

  it('restores on request, leaving local-only decks in place', async () => {
    const { local, cloudDecks } = renderSetup({
      localDecks: [deck('keep')],
      cloudDecks: cloudRepository(async () => ({
        ok: true,
        value: [cloudRecord('a')],
      })),
    })

    fireEvent.click(setup())
    fireEvent.click(
      await screen.findByRole('button', { name: 'クラウドから復元' }),
    )
    await screen.findByText('有効')

    expect(local.saveDeck).toHaveBeenCalledTimes(1)
    // The local-only deck the cloud never knew about is untouched.
    expect(local.deleteDeck).not.toHaveBeenCalled()
    expect(cloudDecks?.upsert).not.toHaveBeenCalled()
  })

  // Turning sync on cannot settle a deletion the reporter has not seen.
  it('asks about a deck the account deleted before enabling', async () => {
    const { local, storage, namespace } = renderSetup({
      localDecks: [deck('gone')],
      cloudDecks: cloudRepository(async () => ({
        ok: true,
        value: [cloudRecord('a'), cloudRecord('gone', TOMBSTONED)],
      })),
    })

    fireEvent.click(setup())

    expect(
      await screen.findByText('1件のデッキで違いがあります。'),
    ).toBeVisible()
    expect(local.deleteDeck).not.toHaveBeenCalled()
    expect(readCloudSyncState(storage, namespace).status).toBe('not_started')
  })

  it('uploads on request, leaving cloud-only rows in place', async () => {
    const { local, cloudDecks } = renderSetup({
      localDecks: [deck('a')],
      cloudDecks: cloudRepository(async () => ({
        ok: true,
        value: [cloudRecord('cloud-only')],
      })),
    })

    fireEvent.click(setup())
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'この端末のデッキをクラウドへ反映',
      }),
    )
    await screen.findByText('有効')

    expect(cloudDecks?.upsert).toHaveBeenCalledTimes(1)
    // Absence is never read as deletion, in either direction.
    expect(cloudDecks?.tombstone).not.toHaveBeenCalled()
    expect(local.deleteDeck).not.toHaveBeenCalled()
  })

  it('does not enable sync when the upload fails part way', async () => {
    const { storage, namespace } = renderSetup({
      localDecks: [deck('a')],
      cloudDecks: cloudRepository(
        async () => ({ ok: true, value: [] }),
        async () => ({ ok: false as const, reason: 'network' as const }),
      ),
    })

    fireEvent.click(setup())
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'この端末のデッキをクラウドへ保存',
      }),
    )

    expect(await screen.findByText('同期できませんでした。')).toBeVisible()
    expect(readCloudSyncState(storage, namespace).status).toBe('not_started')
    expect(screen.getByText('未設定')).toBeVisible()
  })

  it('reports a failure to read the cloud, and offers a retry', async () => {
    const { cloudDecks, local } = renderSetup({
      cloudDecks: cloudRepository(async () => ({
        ok: false,
        reason: 'network',
      })),
    })

    fireEvent.click(setup())

    expect(await screen.findByText('同期できませんでした。')).toBeVisible()
    expect(screen.getByRole('button', { name: '再試行' })).toBeVisible()
    expect(cloudDecks?.upsert).not.toHaveBeenCalled()
    expect(local.saveDeck).not.toHaveBeenCalled()
  })
})

describe('unsent changes in the account panel', () => {
  const enabledStorage = (extra: Record<string, string> = {}) =>
    memoryStorage({
      'hlsieve:cloud-sync--user-a': '{"version":1,"status":"enabled"}',
      ...extra,
    })

  const pendingFor = (operations: Record<string, string>) =>
    JSON.stringify({ version: 1, operations })

  it('says how many changes are waiting', () => {
    renderSetup({
      storage: enabledStorage({
        'hlsieve:cloud-sync-pending--user-a': pendingFor({
          a: 'upsert',
          b: 'tombstone',
        }),
      }),
    })

    expect(screen.getByText(/未送信の変更 2件/)).toBeVisible()
  })

  it('says so plainly when everything has gone up', () => {
    renderSetup({ storage: enabledStorage() })

    expect(
      screen.getByText('この端末からの未送信の変更はありません'),
    ).toBeVisible()
    expect(screen.queryByText(/未送信の変更 \d+件/)).not.toBeInTheDocument()
  })

  // The count belongs to the account, like the queue behind it.
  it('does not show another account s unsent changes', () => {
    renderSetup({
      userId: 'user-b',
      storage: memoryStorage({
        'hlsieve:cloud-sync--user-b': '{"version":1,"status":"enabled"}',
        'hlsieve:cloud-sync-pending--user-a': pendingFor({ a: 'upsert' }),
      }),
    })

    expect(screen.queryByText(/未送信の変更 \d+件/)).not.toBeInTheDocument()
    expect(
      screen.getByText('この端末からの未送信の変更はありません'),
    ).toBeVisible()
  })

  // Only a signed in account that turned sync on has a queue to report.
  it('says nothing before sync is enabled', () => {
    renderSetup({
      storage: memoryStorage({
        'hlsieve:cloud-sync-pending--user-a': pendingFor({ a: 'upsert' }),
      }),
    })

    expect(screen.queryByText(/未送信の変更/)).not.toBeInTheDocument()
  })

  it('shows no raw database detail alongside the count', () => {
    renderSetup({
      storage: enabledStorage({
        'hlsieve:cloud-sync-pending--user-a': pendingFor({ a: 'upsert' }),
      }),
    })

    const text = document.body.textContent ?? ''
    expect(text).toContain('未送信の変更 1件')
    ;['PGRST', 'supabase', '42501', 'permission denied'].forEach((fragment) =>
      expect(text).not.toContain(fragment),
    )
  })
})

describe('restoring never queues anything', () => {
  // Restored decks come from the account, so there is nothing to send back and
  // nothing that could have failed to send.
  it('leaves the queue empty after a restore', async () => {
    const storage = memoryStorage({
      'hlsieve:cloud-sync--user-a': '{"version":1,"status":"enabled"}',
    })
    const { local } = renderSetup({
      storage,
      localDecks: [],
      cloudDecks: cloudRepository(async () => ({
        ok: true,
        value: [cloudRecord('a')],
      })),
    })

    fireEvent.click(screen.getByRole('button', { name: 'クラウドから復元' }))
    await screen.findByText(/デッキ1個を取り込み/)

    expect(local.saveDeck).toHaveBeenCalledTimes(1)
    expect(
      storage.values.get('hlsieve:cloud-sync-pending--user-a'),
    ).toBeUndefined()
    expect(screen.queryByText(/未送信の変更 \d+件/)).not.toBeInTheDocument()
  })
})

/**
 * What this device still owes the account, and when it last managed to send.
 *
 * Deliberately never phrased as being in sync: nothing is pulled down on its
 * own, so the account can hold changes this device has never seen, and an "up
 * to date" reading would be a promise the app cannot keep.
 */
describe('the state of this device s changes', () => {
  const ENABLED_A = '{"version":1,"status":"enabled"}'
  const statusKeyA = 'hlsieve:cloud-sync-status--user-a'
  const pendingKeyA = 'hlsieve:cloud-sync-pending--user-a'
  const AT = '2026-09-23T00:15:00.000Z'

  const pendingFor = (operations: Record<string, string>) =>
    JSON.stringify({ version: 1, operations })

  const statusFor = (lastUploadSuccessAt: string | null) =>
    JSON.stringify({ version: 1, lastUploadSuccessAt })

  /** The panel on its own, so a test can hand it a second account. */
  function panel({
    userId = 'user-a',
    storage,
    cloudDecks = cloudRepository(async () => ({ ok: true, value: [] })),
    localDecks = [deck('a')],
  }: {
    userId?: string
    storage: ReturnType<typeof memoryStorage>
    cloudDecks?: CloudDeckRepository
    localDecks?: Deck[]
  }) {
    const namespace = userLocalDataNamespace(userId)
    const local = {
      listDecks: vi.fn(async () => localDecks),
      getDeck: vi.fn(async (id: string) => localDecks.find((d) => d.id === id)),
      saveDeck: vi.fn(async () => undefined),
      deleteDeck: vi.fn(async () => undefined),
    }
    return (
      <AppRepositoriesContext.Provider
        value={
          {
            namespace,
            decks: { listDecks: vi.fn(async () => localDecks) },
            localDecks: local,
            cloudDecks,
          } as unknown as AppRepositories
        }
      >
        <CloudSyncSetup storage={storage} />
      </AppRepositoriesContext.Provider>
    )
  }

  /** An upload that finishes when the test says so. */
  function held() {
    let release: ((value: CloudDeckResult<CloudDeckRecord>) => void) | undefined
    const promise = new Promise<CloudDeckResult<CloudDeckRecord>>((resolve) => {
      release = resolve
    })
    return {
      promise,
      succeed: () => release?.({ ok: true, value: cloudRecord('a') }),
    }
  }

  it('says there is nothing waiting when the queue is empty', () => {
    render(
      panel({
        storage: memoryStorage({ 'hlsieve:cloud-sync--user-a': ENABLED_A }),
      }),
    )

    expect(
      screen.getByText('この端末からの未送信の変更はありません'),
    ).toBeVisible()
  })

  it('counts what is waiting', async () => {
    const attempt = held()
    const storage = memoryStorage({
      'hlsieve:cloud-sync--user-a': ENABLED_A,
      [pendingKeyA]: pendingFor({ a: 'upsert', b: 'tombstone' }),
    })

    render(
      panel({
        storage,
        cloudDecks: cloudRepository(
          async () => ({ ok: true, value: [] }),
          () => attempt.promise,
        ),
      }),
    )

    expect(screen.getByText('未送信の変更 2件')).toBeVisible()
    attempt.succeed()
  })

  /**
   * Which line goes with the count. Pinned as a rule rather than through the
   * panel, because a mounted panel starts an attempt at once: the waiting line
   * is what it shows before that attempt, and after an account switch, and
   * neither state can be held still in the DOM.
   */
  describe('choosing the line that goes with the count', () => {
    it('says an attempt is under way while one is', () => {
      expect(unsentChangeMessage({ retrying: true, retryFailed: false })).toBe(
        UNSENT_CHANGE_MESSAGES.retrying,
      )
      // A previous failure does not change what is happening now.
      expect(unsentChangeMessage({ retrying: true, retryFailed: true })).toBe(
        UNSENT_CHANGE_MESSAGES.retrying,
      )
    })

    it('says it will go on its own when nothing has failed yet', () => {
      expect(unsentChangeMessage({ retrying: false, retryFailed: false })).toBe(
        UNSENT_CHANGE_MESSAGES.waiting,
      )
    })

    it('says it will be tried again after a failure', () => {
      expect(unsentChangeMessage({ retrying: false, retryFailed: true })).toBe(
        UNSENT_CHANGE_MESSAGES.failed,
      )
    })

    // None of them may suggest the account and this device agree.
    it('never claims either side is up to date', () => {
      for (const message of Object.values(UNSENT_CHANGE_MESSAGES)) {
        for (const claim of ['同期済み', '最新', 'すべて同期', '一致']) {
          expect(message).not.toContain(claim)
        }
      }
    })
  })

  it('says so while an attempt is under way', async () => {
    const attempt = held()
    const storage = memoryStorage({
      'hlsieve:cloud-sync--user-a': ENABLED_A,
      [pendingKeyA]: pendingFor({ a: 'upsert' }),
    })

    render(
      panel({
        storage,
        cloudDecks: cloudRepository(
          async () => ({ ok: true, value: [] }),
          () => attempt.promise,
        ),
      }),
    )

    expect(await screen.findByText('再送しています…')).toBeVisible()
    attempt.succeed()
    await waitFor(() =>
      expect(
        screen.getByText('この端末からの未送信の変更はありません'),
      ).toBeVisible(),
    )
  })

  it('keeps the change and says it will try again after a failure', async () => {
    const storage = memoryStorage({
      'hlsieve:cloud-sync--user-b': ENABLED_A,
      'hlsieve:cloud-sync-pending--user-b': pendingFor({ a: 'upsert' }),
    })

    render(
      panel({
        userId: 'user-b',
        storage,
        cloudDecks: cloudRepository(
          async () => ({ ok: true, value: [] }),
          async () => ({ ok: false, reason: 'network' }),
        ),
      }),
    )

    expect(
      await screen.findByText(
        'まだ送信できていない変更があります。通信が回復すると再試行します。',
      ),
    ).toBeVisible()
    expect(screen.getByText('未送信の変更 1件')).toBeVisible()
    // Still queued for the next attempt.
    expect(
      JSON.parse(
        storage.values.get('hlsieve:cloud-sync-pending--user-b') ?? '',
      ),
    ).toEqual({ version: 1, operations: { a: 'upsert' } })
  })

  it('shows when this device last got something up', () => {
    const storage = memoryStorage({
      'hlsieve:cloud-sync--user-a': ENABLED_A,
      [statusKeyA]: statusFor(AT),
    })

    render(panel({ storage }))

    expect(screen.getByText(/最終送信: 2026\/09\/23/)).toBeVisible()
  })

  it('still shows it after a reload', () => {
    const storage = memoryStorage({
      'hlsieve:cloud-sync--user-a': ENABLED_A,
      [statusKeyA]: statusFor(AT),
    })
    const first = render(panel({ storage }))
    first.unmount()

    render(
      panel({ storage: memoryStorage(Object.fromEntries(storage.values)) }),
    )

    expect(screen.getByText(/最終送信: 2026\/09\/23/)).toBeVisible()
  })

  // A run that sends some and then fails has both facts to report, and the
  // unsent ones matter more.
  it('leads with what is still waiting even after something went up', async () => {
    const storage = memoryStorage({
      'hlsieve:cloud-sync--user-a': ENABLED_A,
      [pendingKeyA]: pendingFor({ a: 'upsert', b: 'upsert' }),
    })

    render(
      panel({
        storage,
        localDecks: [deck('a'), deck('b')],
        cloudDecks: cloudRepository(
          async () => ({ ok: true, value: [] }),
          async (value: Deck) =>
            value.id === 'a'
              ? { ok: true, value: cloudRecord('a') }
              : { ok: false, reason: 'network' },
        ),
      }),
    )

    expect(await screen.findByText('未送信の変更 1件')).toBeVisible()
    expect(screen.getByText(/最終送信: /)).toBeVisible()
    expect(
      screen.queryByText('この端末からの未送信の変更はありません'),
    ).not.toBeInTheDocument()
  })

  it('shows nothing rather than a bad date when the stored value is damaged', () => {
    const storage = memoryStorage({
      'hlsieve:cloud-sync--user-a': ENABLED_A,
      [statusKeyA]: '{"version":1,"lastUploadSuccessAt":"yesterday"}',
    })

    render(panel({ storage }))

    expect(screen.queryByText(/最終送信/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument()
  })

  // The time belongs to the account, like the queue behind it.
  it('does not show another account s upload time', () => {
    const storage = memoryStorage({
      'hlsieve:cloud-sync--user-b': ENABLED_A,
      [statusKeyA]: statusFor(AT),
    })

    render(panel({ userId: 'user-b', storage }))

    expect(screen.queryByText(/最終送信/)).not.toBeInTheDocument()
  })

  // An attempt running for the account just left must not make the account now
  // on screen look busy.
  it('does not carry a running attempt across an account switch', async () => {
    const attempt = held()
    const storage = memoryStorage({
      'hlsieve:cloud-sync--user-a': ENABLED_A,
      'hlsieve:cloud-sync--user-b': ENABLED_A,
      [pendingKeyA]: pendingFor({ a: 'upsert' }),
    })
    const cloudDecks = cloudRepository(
      async () => ({ ok: true, value: [] }),
      () => attempt.promise,
    )

    const view = render(panel({ storage, cloudDecks }))
    await screen.findByText('再送しています…')

    view.rerender(panel({ userId: 'user-b', storage, cloudDecks }))

    expect(screen.queryByText('再送しています…')).not.toBeInTheDocument()
    expect(
      screen.getByText('この端末からの未送信の変更はありません'),
    ).toBeVisible()
    attempt.succeed()
  })

  it('records the time when setting up sends this device s decks', async () => {
    const storage = memoryStorage()

    render(panel({ storage }))
    fireEvent.click(screen.getByRole('button', { name: 'クラウド同期を設定' }))
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'この端末のデッキをクラウドへ保存',
      }),
    )

    expect(await screen.findByText(/最終送信: /)).toBeVisible()
    expect(storage.values.get(statusKeyA)).toBeDefined()
  })

  // Reading both sides sends nothing, so there is nothing to record.
  it('records nothing from opening the setup screen', async () => {
    const storage = memoryStorage()

    render(panel({ storage }))
    fireEvent.click(screen.getByRole('button', { name: 'クラウド同期を設定' }))
    await screen.findByText('この端末のデッキ: 1件')

    expect(storage.values.get(statusKeyA)).toBeUndefined()
  })

  // A restore came down rather than going up.
  it('records nothing from a restore', async () => {
    const storage = memoryStorage({ 'hlsieve:cloud-sync--user-a': ENABLED_A })

    render(
      panel({
        storage,
        localDecks: [],
        cloudDecks: cloudRepository(async () => ({
          ok: true,
          value: [cloudRecord('a')],
        })),
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'クラウドから復元' }))
    await screen.findByText(/デッキ1個を取り込み/)

    expect(storage.values.get(statusKeyA)).toBeUndefined()
    expect(screen.queryByText(/最終送信/)).not.toBeInTheDocument()
  })

  it('says none of this before sync is enabled', () => {
    render(panel({ storage: memoryStorage({ [statusKeyA]: statusFor(AT) }) }))

    expect(screen.queryByText(/最終送信/)).not.toBeInTheDocument()
    expect(
      screen.queryByText('この端末からの未送信の変更はありません'),
    ).not.toBeInTheDocument()
  })

  it('says nothing at all with no cloud repository', () => {
    const storage = memoryStorage({
      'hlsieve:cloud-sync--user-a': ENABLED_A,
      [statusKeyA]: statusFor(AT),
    })

    render(
      <AppRepositoriesContext.Provider
        value={
          {
            namespace: userLocalDataNamespace('user-a'),
            decks: { listDecks: vi.fn(async () => []) },
            localDecks: { listDecks: vi.fn(async () => []) },
            cloudDecks: null,
          } as unknown as AppRepositories
        }
      >
        <CloudSyncSetup storage={storage} />
      </AppRepositoriesContext.Provider>,
    )

    expect(screen.queryByText(/最終送信/)).not.toBeInTheDocument()
    expect(screen.queryByText('クラウド同期')).not.toBeInTheDocument()
  })

  // Only the queue knows how much is waiting. A second copy of the number
  // could disagree with the work it describes.
  it('keeps no count of its own beside the queue', async () => {
    const storage = memoryStorage({
      'hlsieve:cloud-sync--user-a': ENABLED_A,
      [pendingKeyA]: pendingFor({ a: 'upsert' }),
    })

    render(panel({ storage }))
    await waitFor(() =>
      expect(
        screen.getByText('この端末からの未送信の変更はありません'),
      ).toBeVisible(),
    )

    expect([...storage.values.keys()].sort()).toEqual([
      'hlsieve:cloud-sync--user-a',
      pendingKeyA,
      statusKeyA,
    ])
    expect(JSON.parse(storage.values.get(statusKeyA) ?? '')).toEqual({
      version: 1,
      lastUploadSuccessAt: expect.any(String),
    })
  })

  // Nothing is pulled down automatically, so the panel must not suggest the
  // two sides agree.
  it('never claims this device is up to date with the account', async () => {
    const storage = memoryStorage({
      'hlsieve:cloud-sync--user-a': ENABLED_A,
      [statusKeyA]: statusFor(AT),
      [pendingKeyA]: pendingFor({ a: 'upsert' }),
    })

    render(
      panel({
        storage,
        cloudDecks: cloudRepository(
          async () => ({ ok: true, value: [] }),
          async () => ({ ok: false, reason: 'network' }),
        ),
      }),
    )
    await screen.findByText(
      'まだ送信できていない変更があります。通信が回復すると再試行します。',
    )

    const text = document.body.textContent ?? ''
    for (const claim of [
      '同期済み',
      '最新です',
      '最新の状態',
      'すべて同期',
      'クラウドと一致',
      '最終同期',
    ]) {
      expect(text).not.toContain(claim)
    }
  })
})

/**
 * A deck held by both sides with different contents, asked about deck by deck.
 *
 * The whole-set choice this sits in front of is still there for the cases it
 * can answer. These tests are about the cases it cannot: keeping one edit must
 * not mean discarding another nobody was asked about.
 */
describe('decks the two sides disagree about', () => {
  const ENABLED_A = '{"version":1,"status":"enabled"}'
  const statusKeyA = 'hlsieve:cloud-sync-status--user-a'
  const pendingKeyA = 'hlsieve:cloud-sync-pending--user-a'
  const DELETED_AT = '2026-09-22T05:00:00.000000+00:00'

  const changed = (id: string, name: string): Deck => ({
    ...deck(id),
    name,
  })

  const enabled = (extra: Record<string, string> = {}) =>
    memoryStorage({ 'hlsieve:cloud-sync--user-a': ENABLED_A, ...extra })

  /** The panel on its own, so a test can hand it a second account. */
  function panel({
    userId = 'user-a',
    storage,
    localDecks = [deck('a')],
    cloudDecks,
  }: {
    userId?: string
    storage: ReturnType<typeof memoryStorage>
    localDecks?: Deck[]
    cloudDecks: CloudDeckRepository
  }) {
    const local = {
      listDecks: vi.fn(async () => localDecks),
      getDeck: vi.fn(async (id: string) => localDecks.find((d) => d.id === id)),
      saveDeck: vi.fn(async () => undefined),
      deleteDeck: vi.fn(async () => undefined),
    }
    return {
      local,
      element: (
        <AppRepositoriesContext.Provider
          value={
            {
              namespace: userLocalDataNamespace(userId),
              decks: { listDecks: vi.fn(async () => localDecks) },
              localDecks: local,
              cloudDecks,
            } as unknown as AppRepositories
          }
        >
          <CloudSyncSetup storage={storage} />
        </AppRepositoriesContext.Provider>
      ),
    }
  }

  const chooserButton = () =>
    screen.getByRole('button', { name: '選んだ内容で反映' })

  it('asks nothing when the two sides agree', async () => {
    const { element } = panel({
      storage: memoryStorage(),
      localDecks: [deck('a')],
      cloudDecks: cloudRepository(async () => ({
        ok: true,
        value: [cloudRecord('a')],
      })),
    })
    render(element)

    fireEvent.click(screen.getByRole('button', { name: 'クラウド同期を設定' }))

    // The existing whole-set screen, not the per-deck questions.
    expect(await screen.findByText('この端末のデッキ: 1件')).toBeVisible()
    expect(screen.queryByText(/違いがあります/)).not.toBeInTheDocument()
  })

  it('asks about the one deck that differs', async () => {
    const { element } = panel({
      storage: memoryStorage(),
      localDecks: [deck('a'), deck('b')],
      cloudDecks: cloudRepository(async () => ({
        ok: true,
        value: [
          cloudRecord('a'),
          { ...cloudRecord('b'), deck: changed('b', 'クラウドの名前') },
        ],
      })),
    })
    render(element)

    fireEvent.click(screen.getByRole('button', { name: 'クラウド同期を設定' }))

    expect(
      await screen.findByText('1件のデッキで違いがあります。'),
    ).toBeVisible()
    expect(screen.getByRole('group', { name: 'デッキ b' })).toBeVisible()
    expect(screen.queryByRole('group', { name: 'デッキ a' })).toBeNull()
  })

  it('waits for every deck to be answered for', async () => {
    const { element, local } = panel({
      storage: memoryStorage(),
      localDecks: [deck('a'), deck('b')],
      cloudDecks: cloudRepository(async () => ({
        ok: true,
        value: [
          { ...cloudRecord('a'), deck: changed('a', 'むこう a') },
          { ...cloudRecord('b'), deck: changed('b', 'むこう b') },
        ],
      })),
    })
    render(element)

    fireEvent.click(screen.getByRole('button', { name: 'クラウド同期を設定' }))
    await screen.findByText('2件のデッキで違いがあります。')

    expect(chooserButton()).toBeDisabled()
    fireEvent.click(
      within(screen.getByRole('group', { name: 'デッキ a' })).getByLabelText(
        'この端末の内容を使う',
      ),
    )
    expect(chooserButton()).toBeDisabled()

    fireEvent.click(
      within(screen.getByRole('group', { name: 'デッキ b' })).getByLabelText(
        'クラウドの内容を使う',
      ),
    )
    expect(chooserButton()).toBeEnabled()
    // Still nothing written, on either side.
    expect(local.saveDeck).not.toHaveBeenCalled()
    expect(local.deleteDeck).not.toHaveBeenCalled()
  })

  it('sends this device s copy for a deck kept here, and enables sync', async () => {
    const storage = memoryStorage()
    const cloudDecks = cloudRepository(async () => ({
      ok: true,
      value: [{ ...cloudRecord('a'), deck: changed('a', 'むこう') }],
    }))
    const { element, local } = panel({ storage, cloudDecks })
    render(element)

    fireEvent.click(screen.getByRole('button', { name: 'クラウド同期を設定' }))
    fireEvent.click(await screen.findByLabelText('この端末の内容を使う'))
    fireEvent.click(chooserButton())

    expect(await screen.findByText('有効')).toBeVisible()
    expect(cloudDecks.upsert).toHaveBeenCalledWith(deck('a'))
    expect(local.saveDeck).not.toHaveBeenCalled()
    expect(
      readCloudSyncState(storage, userLocalDataNamespace('user-a')).status,
    ).toBe('enabled')
  })

  // The deck came from the account, so sending it back would be a round trip.
  it('writes the account s copy here without echoing it back', async () => {
    const cloudDeck = changed('a', 'むこう')
    const cloudDecks = cloudRepository(async () => ({
      ok: true,
      value: [{ ...cloudRecord('a'), deck: cloudDeck }],
    }))
    const { element, local } = panel({ storage: memoryStorage(), cloudDecks })
    render(element)

    fireEvent.click(screen.getByRole('button', { name: 'クラウド同期を設定' }))
    fireEvent.click(await screen.findByLabelText('クラウドの内容を使う'))
    fireEvent.click(chooserButton())

    await screen.findByText('有効')
    expect(local.saveDeck).toHaveBeenCalledWith(cloudDeck)
    expect(cloudDecks.upsert).not.toHaveBeenCalled()
  })

  it('brings a deleted deck back when this device s copy is kept', async () => {
    const cloudDecks = cloudRepository(async () => ({
      ok: true,
      value: [cloudRecord('a', DELETED_AT)],
    }))
    const { element, local } = panel({ storage: memoryStorage(), cloudDecks })
    render(element)

    fireEvent.click(screen.getByRole('button', { name: 'クラウド同期を設定' }))
    fireEvent.click(await screen.findByLabelText('この端末のデッキを残す'))
    fireEvent.click(chooserButton())

    await screen.findByText('有効')
    expect(cloudDecks.upsert).toHaveBeenCalledWith(deck('a'))
    expect(local.deleteDeck).not.toHaveBeenCalled()
  })

  // The row stays a tombstone, so another device still holding the deck cannot
  // bring it back later by syncing.
  it('removes the deck here when the account s deletion is accepted', async () => {
    const cloudDecks = cloudRepository(async () => ({
      ok: true,
      value: [cloudRecord('a', DELETED_AT)],
    }))
    const { element, local } = panel({ storage: memoryStorage(), cloudDecks })
    render(element)

    fireEvent.click(screen.getByRole('button', { name: 'クラウド同期を設定' }))
    fireEvent.click(await screen.findByLabelText('クラウド側の削除を反映'))
    fireEvent.click(chooserButton())

    await screen.findByText('有効')
    expect(local.deleteDeck).toHaveBeenCalledWith('a')
    expect(cloudDecks.upsert).not.toHaveBeenCalled()
    expect(cloudDecks.tombstone).not.toHaveBeenCalled()
  })

  it('brings down a deck only the account has while resolving', async () => {
    const cloudDecks = cloudRepository(async () => ({
      ok: true,
      value: [
        { ...cloudRecord('a'), deck: changed('a', 'むこう') },
        cloudRecord('cloud-only'),
      ],
    }))
    const { element, local } = panel({ storage: memoryStorage(), cloudDecks })
    render(element)

    fireEvent.click(screen.getByRole('button', { name: 'クラウド同期を設定' }))
    fireEvent.click(await screen.findByLabelText('この端末の内容を使う'))
    fireEvent.click(chooserButton())

    await screen.findByText('有効')
    expect(local.saveDeck).toHaveBeenCalledWith(deck('cloud-only'))
  })

  // Turning sync on is the moment the account should end up with what this
  // device has; restoring is not.
  it('sends a local-only deck when enabling, but not when restoring', async () => {
    const rows = [{ ...cloudRecord('a'), deck: changed('a', 'むこう') }]
    const activation = cloudRepository(async () => ({ ok: true, value: rows }))
    const first = panel({
      storage: memoryStorage(),
      localDecks: [deck('a'), deck('mine')],
      cloudDecks: activation,
    })
    const view = render(first.element)

    fireEvent.click(screen.getByRole('button', { name: 'クラウド同期を設定' }))
    fireEvent.click(await screen.findByLabelText('この端末の内容を使う'))
    fireEvent.click(chooserButton())
    await screen.findByText('有効')
    expect(activation.upsert).toHaveBeenCalledWith(deck('mine'))
    view.unmount()

    const restoring = cloudRepository(async () => ({ ok: true, value: rows }))
    const second = panel({
      storage: enabled(),
      localDecks: [deck('a'), deck('mine')],
      cloudDecks: restoring,
    })
    render(second.element)

    fireEvent.click(screen.getByRole('button', { name: 'クラウドから復元' }))
    fireEvent.click(await screen.findByLabelText('クラウドの内容を使う'))
    fireEvent.click(chooserButton())

    await screen.findByText(/デッキ1個を取り込み/)
    expect(restoring.upsert).not.toHaveBeenCalled()
    // The local-only deck is still here either way.
    expect(second.local.deleteDeck).not.toHaveBeenCalled()
  })

  it('records the time only when the account accepted something', async () => {
    const storage = memoryStorage()
    const cloudDecks = cloudRepository(async () => ({
      ok: true,
      value: [{ ...cloudRecord('a'), deck: changed('a', 'むこう') }],
    }))
    const { element } = panel({ storage, cloudDecks })
    render(element)

    fireEvent.click(screen.getByRole('button', { name: 'クラウド同期を設定' }))
    fireEvent.click(await screen.findByLabelText('クラウドの内容を使う'))
    fireEvent.click(chooserButton())
    await screen.findByText('有効')

    // Only this device was written to, so nothing went up.
    expect(storage.values.get(statusKeyA)).toBeUndefined()
  })

  it('records the time when this device s copy was accepted', async () => {
    const storage = memoryStorage()
    const cloudDecks = cloudRepository(async () => ({
      ok: true,
      value: [{ ...cloudRecord('a'), deck: changed('a', 'むこう') }],
    }))
    const { element } = panel({ storage, cloudDecks })
    render(element)

    fireEvent.click(screen.getByRole('button', { name: 'クラウド同期を設定' }))
    fireEvent.click(await screen.findByLabelText('この端末の内容を使う'))
    fireEvent.click(chooserButton())
    await screen.findByText('有効')

    expect(storage.values.get(statusKeyA)).toBeDefined()
  })

  describe('when the account refuses part of it', () => {
    const refusing = () =>
      cloudRepository(
        async () => ({
          ok: true,
          value: [{ ...cloudRecord('a'), deck: changed('a', 'むこう') }],
        }),
        async () => ({ ok: false, reason: 'network' }),
      )

    it('says what is left and offers another attempt', async () => {
      const { element } = panel({
        storage: memoryStorage(),
        cloudDecks: refusing(),
      })
      render(element)

      fireEvent.click(
        screen.getByRole('button', { name: 'クラウド同期を設定' }),
      )
      fireEvent.click(await screen.findByLabelText('この端末の内容を使う'))
      fireEvent.click(chooserButton())

      expect(
        await screen.findByText('まだ反映できていないデッキが1件あります。'),
      ).toBeVisible()
      expect(screen.getByRole('button', { name: '再試行' })).toBeVisible()
      // Not reported as finished: sync stays off until everything chosen landed.
      expect(screen.queryByText('有効')).not.toBeInTheDocument()
    })

    it('shows no raw database detail when it says so', async () => {
      const { element } = panel({
        storage: memoryStorage(),
        cloudDecks: refusing(),
      })
      render(element)

      fireEvent.click(
        screen.getByRole('button', { name: 'クラウド同期を設定' }),
      )
      fireEvent.click(await screen.findByLabelText('この端末の内容を使う'))
      fireEvent.click(chooserButton())
      await screen.findByText('まだ反映できていないデッキが1件あります。')

      const text = document.body.textContent ?? ''
      for (const fragment of [
        'PGRST',
        'supabase',
        '42501',
        'permission denied',
      ]) {
        expect(text).not.toContain(fragment)
      }
    })

    // The reporter said this device's copy wins, so the change is theirs and is
    // finished later rather than dropped.
    it('queues the refused deck for the retry that already exists', async () => {
      const storage = memoryStorage()
      const { element } = panel({ storage, cloudDecks: refusing() })
      render(element)

      fireEvent.click(
        screen.getByRole('button', { name: 'クラウド同期を設定' }),
      )
      fireEvent.click(await screen.findByLabelText('この端末の内容を使う'))
      fireEvent.click(chooserButton())
      await screen.findByText('まだ反映できていないデッキが1件あります。')

      expect(JSON.parse(storage.values.get(pendingKeyA) ?? '')).toEqual({
        version: 1,
        operations: { a: 'upsert' },
      })
      expect(storage.values.get(statusKeyA)).toBeUndefined()
    })

    it('reads both sides again when asked to try once more', async () => {
      const cloudDecks = refusing()
      const { element } = panel({ storage: memoryStorage(), cloudDecks })
      render(element)

      fireEvent.click(
        screen.getByRole('button', { name: 'クラウド同期を設定' }),
      )
      fireEvent.click(await screen.findByLabelText('この端末の内容を使う'))
      fireEvent.click(chooserButton())
      await screen.findByText('まだ反映できていないデッキが1件あります。')

      fireEvent.click(screen.getByRole('button', { name: '再試行' }))

      // A fresh plan, so the questions come from what the two sides hold now.
      await waitFor(() => expect(cloudDecks.listAll).toHaveBeenCalledTimes(2))
      expect(
        await screen.findByText('1件のデッキで違いがあります。'),
      ).toBeVisible()
    })
  })

  // The questions belong to one account, like everything else in this panel.
  it('does not carry choices across an account switch', async () => {
    const storage = memoryStorage({
      'hlsieve:cloud-sync--user-b': ENABLED_A,
    })
    const cloudDecks = cloudRepository(async () => ({
      ok: true,
      value: [{ ...cloudRecord('a'), deck: changed('a', 'むこう') }],
    }))
    const first = panel({ storage, cloudDecks })
    const view = render(first.element)

    fireEvent.click(screen.getByRole('button', { name: 'クラウド同期を設定' }))
    fireEvent.click(await screen.findByLabelText('この端末の内容を使う'))

    const second = panel({ userId: 'user-b', storage, cloudDecks })
    view.rerender(second.element)

    // The other account is not mid-question, so nothing of this one is shown.
    expect(screen.queryByText(/違いがあります/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '選んだ内容で反映' }),
    ).not.toBeInTheDocument()
  })

  it('touches nothing on either side if the questions are abandoned', async () => {
    const storage = memoryStorage()
    const cloudDecks = cloudRepository(async () => ({
      ok: true,
      value: [cloudRecord('a', DELETED_AT)],
    }))
    const { element, local } = panel({ storage, cloudDecks })
    render(element)

    fireEvent.click(screen.getByRole('button', { name: 'クラウド同期を設定' }))
    fireEvent.click(await screen.findByLabelText('クラウド側の削除を反映'))
    fireEvent.click(screen.getByRole('button', { name: 'やめる' }))

    expect(local.deleteDeck).not.toHaveBeenCalled()
    expect(local.saveDeck).not.toHaveBeenCalled()
    expect(cloudDecks.upsert).not.toHaveBeenCalled()
    expect(storage.values.size).toBe(0)
    expect(
      screen.getByRole('button', { name: 'クラウド同期を設定' }),
    ).toBeVisible()
  })
})

/**
 * A choice made here must survive the retry that runs later.
 *
 * The queue of unsent changes is acted on the next time the app starts or the
 * connection comes back. An entry left over from before the reporter answered
 * is an older intent for the same deck, and replaying it would undo the answer.
 */
describe('resolving a conflict against the queue of unsent changes', () => {
  const ENABLED_A = '{"version":1,"status":"enabled"}'
  const pendingKeyA = 'hlsieve:cloud-sync-pending--user-a'
  const DELETED_AT = '2026-09-22T05:00:00.000000+00:00'

  const queued = (operations: Record<string, string>) =>
    JSON.stringify({ version: 1, operations })

  function panel({
    storage,
    localDecks = [deck('a')],
    cloudDecks,
  }: {
    storage: ReturnType<typeof memoryStorage>
    localDecks?: Deck[]
    cloudDecks: CloudDeckRepository
  }) {
    const local = {
      listDecks: vi.fn(async () => localDecks),
      getDeck: vi.fn(async (id: string) => localDecks.find((d) => d.id === id)),
      saveDeck: vi.fn(async () => undefined),
      deleteDeck: vi.fn(async () => undefined),
    }
    return {
      local,
      element: (
        <AppRepositoriesContext.Provider
          value={
            {
              namespace: userLocalDataNamespace('user-a'),
              decks: { listDecks: vi.fn(async () => localDecks) },
              localDecks: local,
              cloudDecks,
            } as unknown as AppRepositories
          }
        >
          <CloudSyncSetup storage={storage} />
        </AppRepositoriesContext.Provider>
      ),
    }
  }

  const apply = () => screen.getByRole('button', { name: '選んだ内容で反映' })

  /**
   * An account that reads back fine but refuses everything sent to it.
   *
   * The retry that runs when the panel mounts would otherwise empty the queue
   * by itself, which would make these pass whatever the resolution did.
   */
  const refusingSends = (rows: CloudDeckRecord[]) => ({
    ...cloudRepository(async () => ({ ok: true as const, value: rows })),
    upsert: vi.fn(async () => ({
      ok: false as const,
      reason: 'network' as const,
    })),
    tombstone: vi.fn(async () => ({
      ok: false as const,
      reason: 'network' as const,
    })),
  })

  const readQueue = (storage: ReturnType<typeof memoryStorage>) => {
    const raw = storage.values.get(pendingKeyA)
    return raw === undefined
      ? undefined
      : (JSON.parse(raw) as { operations: Record<string, string> }).operations
  }

  // Left queued, the retry would delete from the account the deck that was
  // just written to this device.
  it('drops a queued deletion when the account s copy is taken', async () => {
    const storage = memoryStorage({
      'hlsieve:cloud-sync--user-a': ENABLED_A,
      [pendingKeyA]: queued({ a: 'tombstone' }),
    })
    const { element } = panel({
      storage,
      cloudDecks: refusingSends([
        { ...cloudRecord('a'), deck: { ...deck('a'), name: 'むこう' } },
      ]),
    })
    render(element)

    fireEvent.click(screen.getByRole('button', { name: 'クラウドから復元' }))
    fireEvent.click(await screen.findByLabelText('クラウドの内容を使う'))
    fireEvent.click(apply())
    await screen.findByText(/デッキ1個を取り込み/)

    expect(readQueue(storage)).toEqual({})
  })

  // Left queued, the retry would bring back the deck just agreed to be gone.
  it('drops a queued save when the account s deletion is accepted', async () => {
    const storage = memoryStorage({
      'hlsieve:cloud-sync--user-a': ENABLED_A,
      [pendingKeyA]: queued({ a: 'upsert' }),
    })
    const { element } = panel({
      storage,
      cloudDecks: refusingSends([cloudRecord('a', DELETED_AT)]),
    })
    render(element)

    fireEvent.click(screen.getByRole('button', { name: 'クラウドから復元' }))
    fireEvent.click(await screen.findByLabelText('クラウド側の削除を反映'))
    fireEvent.click(apply())
    await screen.findByText(/0個を取り込み/)

    expect(readQueue(storage)).toEqual({})
  })

  it('drops a queued change once the account has accepted this device s copy', async () => {
    const storage = memoryStorage({
      'hlsieve:cloud-sync--user-a': ENABLED_A,
      [pendingKeyA]: queued({ a: 'tombstone' }),
    })
    const { element } = panel({
      storage,
      cloudDecks: {
        ...cloudRepository(async () => ({
          ok: true,
          value: [
            { ...cloudRecord('a'), deck: { ...deck('a'), name: 'むこう' } },
          ],
        })),
        // Refused, so the retry leaves the queued deletion where it is and the
        // resolution is the only thing that can clear it.
        tombstone: vi.fn(async () => ({
          ok: false as const,
          reason: 'network' as const,
        })),
      },
    })
    render(element)

    fireEvent.click(screen.getByRole('button', { name: 'クラウドから復元' }))
    fireEvent.click(await screen.findByLabelText('この端末の内容を使う'))
    fireEvent.click(apply())
    await screen.findByText(/0個を取り込み/)

    expect(readQueue(storage)).toEqual({})
  })

  // Not touched by this restore, so the reporter's earlier intent stands.
  it('leaves a queued change for a deck it did not settle', async () => {
    const storage = memoryStorage({
      'hlsieve:cloud-sync--user-a': ENABLED_A,
      [pendingKeyA]: queued({ mine: 'upsert' }),
    })
    const { element } = panel({
      storage,
      localDecks: [deck('a'), deck('mine')],
      // The account refuses every send here, so the retry that runs on mount
      // cannot be what empties the queue: only the resolution could.
      cloudDecks: cloudRepository(
        async () => ({
          ok: true,
          value: [
            { ...cloudRecord('a'), deck: { ...deck('a'), name: 'むこう' } },
          ],
        }),
        async () => ({ ok: false, reason: 'network' }),
      ),
    })
    render(element)

    fireEvent.click(screen.getByRole('button', { name: 'クラウドから復元' }))
    fireEvent.click(await screen.findByLabelText('クラウドの内容を使う'))
    fireEvent.click(apply())
    await screen.findByText(/デッキ1個を取り込み/)

    expect(readQueue(storage)).toEqual({ mine: 'upsert' })
  })
})
