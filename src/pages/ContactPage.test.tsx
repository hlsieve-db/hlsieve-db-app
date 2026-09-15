import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { CONTACT_FORM_URL, SITE_ORIGIN } from '../domain/site/constants'
import { ContactPage } from './ContactPage'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/contact']}>
      <ContactPage />
    </MemoryRouter>,
  )
}

describe('ContactPage', () => {
  it('renders contact guidance and an accessible external form link', () => {
    renderPage()
    expect(
      screen.getByRole('heading', { name: 'お問い合わせ', level: 1 }),
    ).toBeVisible()
    expect(screen.getByText(/権利者・関係者の方から/)).toBeVisible()
    const link = screen.getByRole('link', {
      name: /お問い合わせフォームを開く/,
    })
    expect(link).toHaveAttribute('href', CONTACT_FORM_URL)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(
      screen.getByText('お問い合わせフォームは外部サービスを利用しています。'),
    ).toBeVisible()
  })

  it('sets public contact metadata', () => {
    renderPage()
    expect(document.title).toBe('お問い合わせ | HLSieve DB')
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${SITE_ORIGIN}/contact`,
    )
  })
})
