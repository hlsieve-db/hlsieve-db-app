import { useState, type FormEvent } from 'react'

import { useAuth } from '../auth/useAuth'
import type { AuthFailureReason } from '../auth/authSource'
import { AppNavigation } from '../components/AppNavigation'
import { ACCOUNT_METADATA } from '../domain/site/metadata'
import { useDocumentMetadata } from '../hooks/useDocumentMetadata'

const FAILURE_MESSAGES: Record<AuthFailureReason, string> = {
  unavailable: 'この環境ではアカウント機能を利用できません。',
  'invalid-email': 'メールアドレスを確認してください。',
  'rate-limited': '回数が多すぎます。少し時間をおいてから再度お試しください。',
  failed: 'うまくいきませんでした。時間をおいて再度お試しください。',
}

/** Enough to catch a typo without pretending to implement RFC 5322. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

type Pending = 'google' | 'magic-link' | 'sign-out' | undefined

export function AccountPage() {
  useDocumentMetadata(ACCOUNT_METADATA)
  const {
    state,
    isCloudSyncAvailable,
    isEmailSignInAvailable,
    signInWithGoogle,
    sendMagicLink,
    signOut,
  } = useAuth()

  const [email, setEmail] = useState('')
  const [pending, setPending] = useState<Pending>()
  const [error, setError] = useState<string>()
  const [sentTo, setSentTo] = useState<string>()

  const run = async (
    action: Pending,
    perform: () => Promise<{ ok: boolean; reason?: AuthFailureReason }>,
  ) => {
    if (pending) return
    setPending(action)
    setError(undefined)
    const result = await perform()
    setPending(undefined)
    if (!result.ok) {
      setSentTo(undefined)
      setError(FAILURE_MESSAGES[result.reason ?? 'failed'])
    }
    return result
  }

  const submitMagicLink = async (event: FormEvent) => {
    event.preventDefault()
    // Only the surrounding whitespace is removed: the part before @ is
    // case-sensitive by the spec, so the address is sent as it was typed.
    const address = email.trim()
    if (!address || !looksLikeEmail(address)) {
      setSentTo(undefined)
      setError(FAILURE_MESSAGES['invalid-email'])
      return
    }
    const result = await run('magic-link', () => sendMagicLink(address))
    if (result?.ok) setSentTo(address)
  }

  return (
    <main id="main-content" className="content-page account-page">
      <AppNavigation />
      <header className="content-page__header">
        <h1>アカウント</h1>
        <p>
          デッキはこれまでどおりこの端末に保存されます。デッキのクラウド同期は今後対応予定です。
        </p>
      </header>

      <div className="content-surface account-page__content">
        {error && (
          <p className="account-page__error" role="alert">
            {error}
          </p>
        )}

        {!isCloudSyncAvailable && (
          <section aria-labelledby="account-unavailable-heading">
            <h2 id="account-unavailable-heading">
              アカウント機能は利用できません
            </h2>
            <p>この環境ではアカウント機能が設定されていません。</p>
            <p>
              カード検索・デッキ作成・大会戦績など、これまでの機能はすべてそのままご利用いただけます。
            </p>
          </section>
        )}

        {isCloudSyncAvailable && state.status === 'authenticated' && (
          <section aria-labelledby="account-signed-in-heading">
            <h2 id="account-signed-in-heading">ログイン中</h2>
            {state.user.email ? (
              <p>
                <span>メールアドレス：</span>
                <strong>{state.user.email}</strong>
              </p>
            ) : (
              <p>アカウントにログインしています。</p>
            )}
            <p>
              このアカウント用の保存領域を使用しています。ログアウトすると、ログイン前のデッキに戻ります。
            </p>
            <p>デッキはまだクラウドへ送信されていません。</p>
            <button
              className="button"
              type="button"
              disabled={pending !== undefined}
              onClick={() => void run('sign-out', signOut)}
            >
              {pending === 'sign-out' ? 'ログアウトしています…' : 'ログアウト'}
            </button>
          </section>
        )}

        {isCloudSyncAvailable && state.status !== 'authenticated' && (
          <section aria-labelledby="account-sign-in-heading">
            <h2 id="account-sign-in-heading">ログイン</h2>
            <p>
              ログインしても、この端末のデッキがそのまま送信されることはありません。
            </p>

            <button
              className="button account-page__google"
              type="button"
              disabled={pending !== undefined}
              onClick={() => void run('google', signInWithGoogle)}
            >
              {pending === 'google'
                ? 'Googleへ移動しています…'
                : 'Googleでログイン'}
            </button>

            {isEmailSignInAvailable && (
              <form
                className="account-page__magic-link"
                onSubmit={submitMagicLink}
              >
                <label htmlFor="account-email">メールアドレス</label>
                <input
                  id="account-email"
                  type="email"
                  inputMode="email"
                  lang="ja"
                  autoComplete="email"
                  autoCapitalize="none"
                  value={email}
                  placeholder="you@example.com"
                  onChange={(event) => setEmail(event.currentTarget.value)}
                />
                <button
                  className="button button--secondary"
                  type="submit"
                  disabled={pending !== undefined}
                >
                  {pending === 'magic-link'
                    ? '送信しています…'
                    : 'ログインリンクをメールで送信'}
                </button>
              </form>
            )}

            {isEmailSignInAvailable && (
              <p aria-live="polite" className="account-page__status">
                {sentTo
                  ? `${sentTo} にログインリンクを送信しました。メールを確認してください。`
                  : ''}
              </p>
            )}
          </section>
        )}
      </div>
    </main>
  )
}
