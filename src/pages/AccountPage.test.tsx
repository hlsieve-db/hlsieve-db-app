import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider } from '../auth/AuthProvider'
import type { AuthActionResult, AuthSource, AuthUser } from '../auth/authSource'
import { AccountPage } from './AccountPage'

function fakeAuthSource(
  initial: AuthUser | undefined,
  overrides: Partial<AuthSource> = {},
) {
  const listeners = new Set<(user: AuthUser | undefined) => void>()
  const source: AuthSource = {
    getSessionUser: async () => initial,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    signInWithGoogle: vi.fn(async () => ({ ok: true }) as AuthActionResult),
    sendMagicLink: vi.fn(async () => ({ ok: true }) as AuthActionResult),
    signOut: vi.fn(async () => ({ ok: true }) as AuthActionResult),
    ...overrides,
  }
  return {
    source,
    emit: (user: AuthUser | undefined) =>
      listeners.forEach((listener) => listener(user)),
  }
}

function renderAccount(authSource: AuthSource | null) {
  return render(
    <MemoryRouter initialEntries={['/account']}>
      <AuthProvider authSource={authSource}>
        <AccountPage />
      </AuthProvider>
    </MemoryRouter>,
  )
}

// The email link is only offered where a deployment has its own SMTP, so the
// tests that exercise it opt in the same way a deployment would.
function enableEmailSignIn() {
  vi.stubEnv('VITE_SUPABASE_EMAIL_SIGN_IN', 'true')
}

afterEach(() => vi.unstubAllEnvs())

const signInButton = () =>
  screen.getByRole('button', { name: 'Googleでログイン' })
const sendButton = () =>
  screen.getByRole('button', { name: 'ログインリンクをメールで送信' })

describe('account page without Cloud Sync configured', () => {
  it('explains the situation and offers nothing to press', async () => {
    renderAccount(null)

    expect(
      await screen.findByRole('heading', {
        name: 'アカウント機能は利用できません',
      }),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Googleでログイン' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText('メールアドレス')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'ログアウト' }),
    ).not.toBeInTheDocument()
  })
})

describe('account page while signed out', () => {
  beforeEach(enableEmailSignIn)

  it('does not claim that decks will be synced', async () => {
    const auth = fakeAuthSource(undefined)
    renderAccount(auth.source)

    await screen.findByRole('heading', { name: 'ログイン' })
    expect(
      screen.getByText(/この端末のデッキがそのまま送信されることはありません/),
    ).toBeVisible()
    expect(screen.getByText(/クラウド同期は今後対応予定/)).toBeVisible()
  })

  it('starts the Google flow once per click', async () => {
    const auth = fakeAuthSource(undefined)
    renderAccount(auth.source)
    await screen.findByRole('heading', { name: 'ログイン' })

    // The label changes while it is running, so hold on to the element.
    const button = signInButton()
    fireEvent.click(button)
    fireEvent.click(button)

    await waitFor(() =>
      expect(auth.source.signInWithGoogle).toHaveBeenCalledTimes(1),
    )
  })

  it('sends a magic link to the typed address and says so', async () => {
    const auth = fakeAuthSource(undefined)
    renderAccount(auth.source)
    await screen.findByRole('heading', { name: 'ログイン' })

    fireEvent.change(screen.getByLabelText('メールアドレス'), {
      target: { value: '  Player@Example.com  ' },
    })
    fireEvent.click(sendButton())

    // Trimmed, but the local part keeps its case: that is significant per spec.
    await waitFor(() =>
      expect(auth.source.sendMagicLink).toHaveBeenCalledWith(
        'Player@Example.com',
      ),
    )
    expect(
      await screen.findByText(
        /Player@Example\.com にログインリンクを送信しました/,
      ),
    ).toBeVisible()
  })

  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
    ['malformed', 'player.example.com'],
    ['missing a domain dot', 'player@example'],
  ])('never sends for an address that is %s', async (_label, value) => {
    const auth = fakeAuthSource(undefined)
    renderAccount(auth.source)
    await screen.findByRole('heading', { name: 'ログイン' })

    fireEvent.change(screen.getByLabelText('メールアドレス'), {
      target: { value },
    })
    fireEvent.click(sendButton())

    // Some of these the browser refuses to submit at all through
    // type="email"; the rest our own check stops. Either way nothing is sent.
    await waitFor(() =>
      expect(auth.source.sendMagicLink).not.toHaveBeenCalled(),
    )
  })

  it('explains an address our own check rejects', async () => {
    const auth = fakeAuthSource(undefined)
    renderAccount(auth.source)
    await screen.findByRole('heading', { name: 'ログイン' })

    // Accepted by the browser, rejected by us for having no domain dot.
    fireEvent.change(screen.getByLabelText('メールアドレス'), {
      target: { value: 'player@example' },
    })
    fireEvent.click(sendButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'メールアドレスを確認してください。',
    )
    expect(auth.source.sendMagicLink).not.toHaveBeenCalled()
  })

  it('does not submit twice while the first send is in flight', async () => {
    let release: (() => void) | undefined
    const auth = fakeAuthSource(undefined, {
      sendMagicLink: vi.fn(
        () =>
          new Promise<AuthActionResult>((resolve) => {
            release = () => resolve({ ok: true })
          }),
      ),
    })
    renderAccount(auth.source)
    await screen.findByRole('heading', { name: 'ログイン' })

    fireEvent.change(screen.getByLabelText('メールアドレス'), {
      target: { value: 'player@example.com' },
    })
    const button = sendButton()
    fireEvent.click(button)
    await waitFor(() => expect(button).toBeDisabled())
    fireEvent.click(button)

    expect(auth.source.sendMagicLink).toHaveBeenCalledTimes(1)
    release?.()
    await waitFor(() => expect(button).toBeEnabled())
  })

  it('tells the visitor to wait when the provider rate limits them', async () => {
    const auth = fakeAuthSource(undefined, {
      sendMagicLink: vi.fn(async () => ({
        ok: false as const,
        reason: 'rate-limited' as const,
      })),
    })
    renderAccount(auth.source)
    await screen.findByRole('heading', { name: 'ログイン' })

    fireEvent.change(screen.getByLabelText('メールアドレス'), {
      target: { value: 'player@example.com' },
    })
    fireEvent.click(sendButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '少し時間をおいてから再度お試しください',
    )
  })

  it('reports a generic failure without exposing provider detail', async () => {
    const auth = fakeAuthSource(undefined, {
      signInWithGoogle: vi.fn(async () => ({
        ok: false as const,
        reason: 'failed' as const,
      })),
    })
    renderAccount(auth.source)
    await screen.findByRole('heading', { name: 'ログイン' })

    fireEvent.click(signInButton())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('うまくいきませんでした')
    expect(alert.textContent).not.toMatch(/supabase|oauth|http|token/i)
  })

  it('labels the email field and keeps it reachable by keyboard', async () => {
    const auth = fakeAuthSource(undefined)
    renderAccount(auth.source)
    await screen.findByRole('heading', { name: 'ログイン' })

    const input = screen.getByLabelText('メールアドレス')
    expect(input).toHaveAttribute('type', 'email')
    expect(input).toHaveAttribute('autocomplete', 'email')
    expect(input).toHaveAttribute('inputmode', 'email')
    input.focus()
    expect(input).toHaveFocus()
  })
})

describe('account page while signed in', () => {
  it('shows the address and that nothing has been uploaded', async () => {
    const auth = fakeAuthSource({ id: 'user-a', email: 'player@example.com' })
    renderAccount(auth.source)

    expect(
      await screen.findByRole('heading', { name: 'ログイン中' }),
    ).toBeVisible()
    expect(screen.getByText('player@example.com')).toBeVisible()
    expect(screen.getByText(/まだクラウドへ送信されていません/)).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Googleでログイン' }),
    ).not.toBeInTheDocument()
  })

  it('copes with a session that carries no address', async () => {
    const auth = fakeAuthSource({ id: 'user-a' })
    renderAccount(auth.source)

    expect(
      await screen.findByRole('heading', { name: 'ログイン中' }),
    ).toBeVisible()
    expect(screen.getByText('アカウントにログインしています。')).toBeVisible()
  })

  it('signs out once and returns to the signed-out view', async () => {
    const auth = fakeAuthSource({ id: 'user-a', email: 'player@example.com' })
    renderAccount(auth.source)
    await screen.findByRole('heading', { name: 'ログイン中' })

    const button = screen.getByRole('button', { name: 'ログアウト' })
    fireEvent.click(button)
    fireEvent.click(button)

    await waitFor(() => expect(auth.source.signOut).toHaveBeenCalledTimes(1))

    // The provider learns about it through the auth event, as in production.
    auth.emit(undefined)
    expect(
      await screen.findByRole('heading', { name: 'ログイン' }),
    ).toBeVisible()
  })

  it('keeps the visitor signed in when signing out fails', async () => {
    const auth = fakeAuthSource(
      { id: 'user-a' },
      {
        signOut: vi.fn(async () => ({
          ok: false as const,
          reason: 'failed' as const,
        })),
      },
    )
    renderAccount(auth.source)
    await screen.findByRole('heading', { name: 'ログイン中' })

    fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'うまくいきませんでした',
    )
    expect(screen.getByRole('heading', { name: 'ログイン中' })).toBeVisible()
  })
})

describe('email sign-in before a deployment has its own SMTP', () => {
  // Supabase's built-in mail only reaches project members and is heavily rate
  // limited, so offering the field would be offering something that does not
  // work. Google stays available on its own.
  it('hides the email form until it is switched on', async () => {
    const auth = fakeAuthSource(undefined)
    renderAccount(auth.source)

    await screen.findByRole('heading', { name: 'ログイン' })
    expect(
      screen.getByRole('button', { name: 'Googleでログイン' }),
    ).toBeVisible()
    expect(screen.queryByLabelText('メールアドレス')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'ログインリンクをメールで送信' }),
    ).not.toBeInTheDocument()
  })

  it('shows it once the deployment switches it on', async () => {
    enableEmailSignIn()
    const auth = fakeAuthSource(undefined)
    renderAccount(auth.source)

    await screen.findByRole('heading', { name: 'ログイン' })
    expect(screen.getByLabelText('メールアドレス')).toBeVisible()
  })

  it.each([
    ['unset', undefined],
    ['false', 'false'],
    ['empty', ''],
    ['not the literal true', '1'],
  ])('stays hidden when the flag is %s', async (_label, value) => {
    if (value !== undefined) vi.stubEnv('VITE_SUPABASE_EMAIL_SIGN_IN', value)
    const auth = fakeAuthSource(undefined)
    renderAccount(auth.source)

    await screen.findByRole('heading', { name: 'ログイン' })
    expect(screen.queryByLabelText('メールアドレス')).not.toBeInTheDocument()
  })
})
