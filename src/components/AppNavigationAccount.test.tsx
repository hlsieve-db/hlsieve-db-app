import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AuthProvider } from '../auth/AuthProvider'
import type { AuthSource } from '../auth/authSource'
import { AccountPage } from '../pages/AccountPage'
import { AppNavigation } from './AppNavigation'

const configuredAuthSource: AuthSource = {
  getSessionUser: async () => undefined,
  subscribe: () => () => undefined,
  signInWithGoogle: async () => ({ ok: true }),
  sendMagicLink: async () => ({ ok: true }),
  signOut: async () => ({ ok: true }),
}

function renderNavigation(authSource: AuthSource | null) {
  return render(
    <MemoryRouter initialEntries={['/cards']}>
      <AuthProvider authSource={authSource}>
        <AppNavigation />
      </AuthProvider>
    </MemoryRouter>,
  )
}

const accountLinks = () => screen.queryAllByRole('link', { name: 'アカウント' })

function openMobileMenu() {
  fireEvent.click(screen.getByRole('button', { name: /メニュー/ }))
}

describe('account link while Cloud Sync is not configured', () => {
  // Phase 4A ships before any deployment has Supabase keys, so the link would
  // only lead to a page saying the feature is unavailable.
  it('is absent from the desktop navigation', () => {
    renderNavigation(null)
    expect(accountLinks()).toHaveLength(0)
  })

  it('is absent from the mobile menu', () => {
    renderNavigation(null)
    openMobileMenu()

    expect(accountLinks()).toHaveLength(0)
    // The rest of the menu is untouched.
    expect(
      screen.getAllByRole('link', { name: '更新履歴' }).length,
    ).toBeGreaterThan(0)
  })
})

describe('account link once Cloud Sync is configured', () => {
  it('appears in the desktop navigation and points at /account', () => {
    renderNavigation(configuredAuthSource)

    const links = accountLinks()
    expect(links.length).toBeGreaterThan(0)
    links.forEach((link) => expect(link).toHaveAttribute('href', '/account'))
  })

  it('appears in the mobile menu as well', () => {
    renderNavigation(configuredAuthSource)
    const beforeOpening = accountLinks().length
    openMobileMenu()

    expect(accountLinks().length).toBeGreaterThan(beforeOpening)
  })
})

describe('reaching /account directly', () => {
  it('still renders, and says the feature is unavailable', async () => {
    render(
      <MemoryRouter initialEntries={['/account']}>
        <AuthProvider authSource={null}>
          <AccountPage />
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('heading', {
        name: 'アカウント機能は利用できません',
      }),
    ).toBeVisible()
    // Navigation is rendered by the page, and still hides the link.
    expect(accountLinks()).toHaveLength(0)
  })
})
