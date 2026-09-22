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
    fireEvent.click(
      await screen.findByRole('button', { name: 'クラウドから復元する' }),
    )

    expect(
      await screen.findByText(/デッキ1個を取り込み、1個を削除しました/),
    ).toBeVisible()
    expect(local.saveDeck).toHaveBeenCalledTimes(1)
    expect(local.deleteDeck).toHaveBeenCalledWith('gone')
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

  it('restores on request, deleting only the tombstoned local deck', async () => {
    const { local, cloudDecks } = renderSetup({
      localDecks: [deck('keep'), deck('gone')],
      cloudDecks: cloudRepository(async () => ({
        ok: true,
        value: [cloudRecord('a'), cloudRecord('gone', TOMBSTONED)],
      })),
    })

    fireEvent.click(setup())
    fireEvent.click(
      await screen.findByRole('button', { name: 'クラウドから復元' }),
    )
    await screen.findByText('有効')

    expect(local.saveDeck).toHaveBeenCalledTimes(1)
    expect(local.deleteDeck).toHaveBeenCalledWith('gone')
    // The local-only deck the cloud never knew about is untouched.
    expect(local.deleteDeck).not.toHaveBeenCalledWith('keep')
    expect(cloudDecks?.upsert).not.toHaveBeenCalled()
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
