import { useState } from 'react'

import {
  applyCloudDeckRestore,
  readCloudDeckRestorePlan,
  type CloudDeckRestorePlan,
} from '../../cloud/cloudDeckRestore'
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
 * Turning Cloud Sync on, and bringing an account's decks back down later.
 *
 * The first time matters most, because the account and the device can each
 * already hold decks and the wrong default destroys one of them. Sync being off
 * is a fact about this device, not about the account: a second device signing
 * into an account that already syncs starts here too, so setting up cannot
 * assume the cloud is empty.
 *
 * So it reads both sides first and decides nothing on its own when both hold
 * data. Nothing is written until the reporter picks a direction.
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

/**
 * What setting up found, and therefore what it may do.
 *
 * upload   the account holds no rows at all, so this device's decks become its
 *          starting point
 * restore  the account holds rows and this device has no decks, so there is
 *          nothing here to lose
 * choose   both sides hold data, and only the reporter can say which wins
 */
type Decision = {
  kind: 'upload' | 'restore' | 'choose'
  plan: CloudDeckRestorePlan
}

type Activation =
  | { step: 'idle' }
  | { step: 'reading' }
  | { step: 'ready'; decision: Decision }
  | { step: 'working'; progress: CloudDeckSyncProgress }
  | { step: 'error'; reason: CloudDeckSyncFailure }

type Restore =
  | { step: 'idle' }
  | { step: 'reading' }
  | { step: 'confirming'; plan: CloudDeckRestorePlan }
  | { step: 'applying'; progress: CloudDeckSyncProgress }
  | { step: 'done'; restored: number; removed: number }
  | { step: 'error'; reason: CloudDeckSyncFailure }

export type CloudSyncSetupProps = {
  /** Supplied by tests that render the panel on its own. */
  storage?: Pick<Storage, 'getItem' | 'setItem'>
}

export function CloudSyncSetup({ storage }: CloudSyncSetupProps) {
  const repositories = useAppRepositories()
  const { namespace, decks, localDecks, cloudDecks } = repositories
  const store = storage ?? window.localStorage

  const [status, setStatus] = useState<CloudSyncStatus>(
    () => readCloudSyncState(store, namespace).status,
  )
  const [activation, setActivation] = useState<Activation>({ step: 'idle' })
  const [outcome, setOutcome] = useState<string>()
  const [restore, setRestore] = useState<Restore>({ step: 'idle' })

  // Without a repository there is no account or no configured project, and
  // nothing to offer.
  if (!cloudDecks) return null

  const markEnabled = (summary: string) => {
    // Only ever once the decks are where they belong. A partial run leaves the
    // account able to try again rather than believing it is already syncing.
    writeCloudSyncState(
      { version: CLOUD_SYNC_STATE_VERSION, status: 'enabled' },
      store,
      namespace,
    )
    setOutcome(summary)
    setStatus('enabled')
    setActivation({ step: 'idle' })
  }

  /** Reads both sides and works out which of the three cases this is. */
  const openSetup = async () => {
    setActivation({ step: 'reading' })
    const result = await readCloudDeckRestorePlan({
      decks: localDecks,
      cloudDecks,
    })
    if (!result.ok) {
      setActivation({ step: 'error', reason: result.reason })
      return
    }
    const { plan } = result
    // Rows rather than active decks: an account whose decks were all deleted
    // still holds tombstones, and uploading over them would resurrect them.
    const kind =
      plan.cloudRowCount === 0
        ? 'upload'
        : plan.localCount === 0
          ? 'restore'
          : 'choose'
    setActivation({ step: 'ready', decision: { kind, plan } })
  }

  const runUpload = async () => {
    setActivation({ step: 'working', progress: { completed: 0, total: 0 } })
    const result = await syncLocalDecksToCloud({
      decks,
      cloudDecks,
      onProgress: (progress) => setActivation({ step: 'working', progress }),
    })
    if (!result.ok) {
      setActivation({ step: 'error', reason: result.reason })
      return
    }
    markEnabled(`デッキ${result.uploaded}個を保存しました。`)
  }

  const runRestore = async (plan: CloudDeckRestorePlan) => {
    setActivation({ step: 'working', progress: { completed: 0, total: 0 } })
    // Through the unwrapped store: these decks came from the account, so
    // sending them back would be a pointless round trip.
    const result = await applyCloudDeckRestore(plan, {
      decks: localDecks,
      onProgress: (progress) => setActivation({ step: 'working', progress }),
    })
    if (!result.ok) {
      setActivation({ step: 'error', reason: result.reason })
      return
    }
    markEnabled(
      `デッキ${result.restored}個を取り込み、${result.removed}個を削除しました。`,
    )
  }

  const applyRestore = async (plan: CloudDeckRestorePlan) => {
    setRestore({ step: 'applying', progress: { completed: 0, total: 0 } })
    const result = await applyCloudDeckRestore(plan, {
      decks: localDecks,
      onProgress: (progress) => setRestore({ step: 'applying', progress }),
    })
    setRestore(
      result.ok
        ? { step: 'done', restored: result.restored, removed: result.removed }
        : { step: 'error', reason: result.reason },
    )
  }

  const startRestore = async () => {
    setRestore({ step: 'reading' })
    const result = await readCloudDeckRestorePlan({
      decks: localDecks,
      cloudDecks,
    })
    if (!result.ok) {
      setRestore({ step: 'error', reason: result.reason })
      return
    }
    // Nothing here to overwrite, so there is nothing to ask about.
    if (result.plan.localCount === 0) {
      await applyRestore(result.plan)
      return
    }
    setRestore({ step: 'confirming', plan: result.plan })
  }

  const counts = (plan: CloudDeckRestorePlan) => (
    <ul className="account-cloud-sync__counts">
      <li>この端末のデッキ: {plan.localCount}件</li>
      <li>クラウド上のデッキ: {plan.restore.length}件</li>
    </ul>
  )

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
          {outcome !== undefined && <p>{outcome}</p>}

          <div className="account-cloud-sync__restore">
            <h3>クラウドから復元</h3>
            {restore.step === 'idle' && (
              <>
                <p>
                  このアカウントのクラウド上のデッキを、この端末へ取り込みます。
                </p>
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => void startRestore()}
                >
                  クラウドから復元
                </button>
              </>
            )}

            {restore.step === 'reading' && (
              <p role="status">クラウドのデッキを確認しています…</p>
            )}

            {restore.step === 'confirming' && (
              <>
                <ul className="account-cloud-sync__counts">
                  <li>この端末のデッキ: {restore.plan.localCount}件</li>
                  <li>取り込むデッキ: {restore.plan.restore.length}件</li>
                  <li>削除するデッキ: {restore.plan.remove.length}件</li>
                </ul>
                <p>
                  同じIDのデッキはクラウドの内容で置き換わります。クラウドにないこの端末のデッキは、そのまま残ります。
                </p>
                <button
                  className="button"
                  type="button"
                  onClick={() => void applyRestore(restore.plan)}
                >
                  クラウドから復元する
                </button>
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => setRestore({ step: 'idle' })}
                >
                  この端末を維持する
                </button>
              </>
            )}

            {restore.step === 'applying' && (
              <p role="status">
                復元しています… {restore.progress.completed} /{' '}
                {restore.progress.total}
              </p>
            )}

            {restore.step === 'done' && (
              <p>
                デッキ{restore.restored}個を取り込み、{restore.removed}
                個を削除しました。
              </p>
            )}

            {restore.step === 'error' && (
              <div
                className="status-message status-message--error"
                role="alert"
              >
                <p>クラウドから復元できませんでした。</p>
                <p>{FAILURE_MESSAGES[restore.reason]}</p>
                <button
                  className="button"
                  type="button"
                  onClick={() => void startRestore()}
                >
                  再試行
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <p>
            <span>状態：</span>
            <strong>未設定</strong>
          </p>

          {activation.step === 'idle' && (
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

          {activation.step === 'reading' && (
            <p role="status">デッキの数を確認しています…</p>
          )}

          {activation.step === 'ready' &&
            activation.decision.kind === 'upload' && (
              <>
                {counts(activation.decision.plan)}
                <p>
                  クラウドにはまだデッキがありません。この端末のデッキをクラウドへ保存します。
                </p>
                <button
                  className="button"
                  type="button"
                  onClick={() => void runUpload()}
                >
                  この端末のデッキをクラウドへ保存
                </button>
              </>
            )}

          {activation.step === 'ready' &&
            activation.decision.kind === 'restore' && (
              <>
                {counts(activation.decision.plan)}
                <p>
                  この端末にはデッキがありません。クラウドのデッキをこの端末へ取り込みます。
                </p>
                <button
                  className="button"
                  type="button"
                  onClick={() => void runRestore(activation.decision.plan)}
                >
                  クラウドのデッキをこの端末へ取り込む
                </button>
              </>
            )}

          {/* Both sides hold decks, so neither direction is safe to assume.
              The labels say what each one does rather than which side wins. */}
          {activation.step === 'ready' &&
            activation.decision.kind === 'choose' && (
              <>
                {counts(activation.decision.plan)}
                <p>
                  この端末とクラウドの両方にデッキがあります。どちらの内容を使うか選んでください。同じIDのデッキは、選んだ側の内容で置き換わります。
                </p>
                <button
                  className="button"
                  type="button"
                  onClick={() => void runRestore(activation.decision.plan)}
                >
                  クラウドから復元
                </button>
                <button
                  className="button"
                  type="button"
                  onClick={() => void runUpload()}
                >
                  この端末のデッキをクラウドへ反映
                </button>
                <p>
                  どちらを選んでも、もう一方にしかないデッキが削除されることはありません。
                </p>
              </>
            )}

          {activation.step === 'working' && (
            <p role="status">
              同期しています… {activation.progress.completed} /{' '}
              {activation.progress.total}
            </p>
          )}

          {activation.step === 'error' && (
            <div className="status-message status-message--error" role="alert">
              <p>同期できませんでした。</p>
              <p>{FAILURE_MESSAGES[activation.reason]}</p>
              {/* Every upload is an upsert and every restore writes the cloud's
                  own copy, so retrying repeats work rather than duplicating. */}
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
