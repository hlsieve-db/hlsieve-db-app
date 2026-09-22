import { useState } from 'react'

import {
  syncLocalDecksToCloud,
  type CloudDeckSyncFailure,
  type CloudDeckSyncProgress,
} from '../../cloud/cloudDeckSync'
import {
  CLOUD_SYNC_STATE_VERSION,
  readCloudSyncState,
  writeCloudSyncState,
  type CloudSyncStatus,
} from '../../domain/cloud/cloudSyncState'
import { useAppRepositories } from '../../repositories/useAppRepositories'

/**
 * Deciding whether to turn Cloud Sync on, and nothing more.
 *
 * Nothing here uploads, downloads or merges a deck. Opening this panel reads
 * how many decks are on each side so the choice is an informed one, and
 * turning sync on records the choice; moving the decks themselves is a later
 * phase. That is why the finished state says the account is ready to sync
 * rather than that it has synced.
 */

/** One message per failure, none of them carrying anything the server said. */
const FAILURE_MESSAGES: Record<CloudDeckSyncFailure, string> = {
  unavailable: 'この環境ではクラウド同期を利用できません。',
  unauthenticated: 'ログイン状態を確認してください。',
  network: 'クラウドに接続できませんでした。',
  forbidden: 'クラウドデータへアクセスできません。',
  'invalid-data': 'クラウド上のデータを読み込めませんでした。',
  'not-found': 'クラウド情報の取得に失敗しました。',
  failed: 'クラウド情報の取得に失敗しました。',
}

type Counts = { local: number; cloud: number }

type Panel =
  | { step: 'idle' }
  | { step: 'loading' }
  | { step: 'counted'; counts: Counts }
  | { step: 'syncing'; progress: CloudDeckSyncProgress }
  | { step: 'error'; reason: CloudDeckSyncFailure }

export type CloudSyncSetupProps = {
  /** Supplied by tests that render the panel on its own. */
  storage?: Pick<Storage, 'getItem' | 'setItem'>
}

export function CloudSyncSetup({ storage }: CloudSyncSetupProps) {
  const repositories = useAppRepositories()
  const { namespace, decks, cloudDecks } = repositories
  const store = storage ?? window.localStorage

  const [status, setStatus] = useState<CloudSyncStatus>(
    () => readCloudSyncState(store, namespace).status,
  )
  const [panel, setPanel] = useState<Panel>({ step: 'idle' })
  const [uploaded, setUploaded] = useState<number>()

  // Without a repository there is no account or no configured project, and
  // nothing to offer.
  if (!cloudDecks) return null

  const openSetup = async () => {
    setPanel({ step: 'loading' })
    // Read only. Counting is the whole point of this step: the account should
    // see what is on each side before agreeing to anything.
    const cloud = await cloudDecks.listAll()
    if (!cloud.ok) {
      setPanel({ step: 'error', reason: cloud.reason })
      return
    }
    let local: number
    try {
      local = (await decks.listDecks()).length
    } catch {
      setPanel({ step: 'error', reason: 'failed' })
      return
    }
    setPanel({
      step: 'counted',
      counts: {
        local,
        // Tombstones are rows, not decks. Counting them would tell the account
        // it has decks in the cloud that it deleted.
        cloud: cloud.value.filter((record) => record.deletedAt === null).length,
      },
    })
  }

  const enable = async () => {
    setPanel({ step: 'syncing', progress: { completed: 0, total: 0 } })
    const result = await syncLocalDecksToCloud({
      decks,
      cloudDecks,
      onProgress: (progress) => setPanel({ step: 'syncing', progress }),
    })

    if (!result.ok) {
      // The choice is only recorded once every deck is safely in the account,
      // so a partial upload leaves the account able to try again rather than
      // believing it is already syncing.
      setPanel({ step: 'error', reason: result.reason })
      return
    }

    writeCloudSyncState(
      { version: CLOUD_SYNC_STATE_VERSION, status: 'enabled' },
      store,
      namespace,
    )
    setUploaded(result.uploaded)
    setStatus('enabled')
    setPanel({ step: 'idle' })
  }

  return (
    <section
      className="account-cloud-sync"
      aria-labelledby="account-cloud-sync-heading"
    >
      <h2 id="account-cloud-sync-heading">クラウド同期</h2>

      {status === 'enabled' ? (
        <>
          <p>
            <span>状態：</span>
            <strong>有効</strong>
          </p>
          <p>クラウド同期が有効になりました。</p>
          {uploaded !== undefined && <p>デッキ{uploaded}個を保存しました。</p>}
        </>
      ) : (
        <>
          <p>
            <span>状態：</span>
            <strong>未設定</strong>
          </p>

          {panel.step === 'idle' && (
            <>
              <p>
                クラウド同期を設定すると、このアカウントでデッキを同期できるようになります。設定を始めても、その時点でデッキが送信されることはありません。
              </p>
              <button
                className="button"
                type="button"
                onClick={() => void openSetup()}
              >
                クラウド同期を設定
              </button>
            </>
          )}

          {panel.step === 'loading' && (
            <p role="status">デッキの数を確認しています…</p>
          )}

          {panel.step === 'counted' && (
            <>
              <ul className="account-cloud-sync__counts">
                <li>この端末のデッキ: {panel.counts.local}件</li>
                <li>クラウド上のデッキ: {panel.counts.cloud}件</li>
              </ul>
              <p>
                クラウド同期を有効にすると、この端末のデッキをこのアカウントのクラウド領域へ保存します。クラウド上のデッキがこの端末へ取り込まれることはありません。
              </p>
              <button
                className="button"
                type="button"
                onClick={() => void enable()}
              >
                クラウド同期を有効にする
              </button>
            </>
          )}

          {panel.step === 'syncing' && (
            <p role="status">
              同期しています… {panel.progress.completed} /{' '}
              {panel.progress.total}
            </p>
          )}

          {panel.step === 'error' && (
            <div className="status-message status-message--error" role="alert">
              <p>同期できませんでした。</p>
              <p>{FAILURE_MESSAGES[panel.reason]}</p>
              {/* Every upload is an upsert keyed by the deck's own id, so
                  retrying rewrites what already went up rather than
                  duplicating it. */}
              <button
                className="button"
                type="button"
                onClick={() => void openSetup()}
              >
                再試行
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
