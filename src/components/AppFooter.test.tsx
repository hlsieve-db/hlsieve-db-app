import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AppFooter } from './AppFooter'

describe('AppFooter', () => {
  it('keeps site information links and the unofficial notice together', () => {
    render(
      <MemoryRouter>
        <AppFooter />
      </MemoryRouter>,
    )

    expect(
      screen.getByText('HLSieve DBは非公式のファンメイドツールです。'),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: '更新履歴' })).toHaveAttribute(
      'href',
      '/updates',
    )
    expect(
      screen.getByRole('link', { name: '免責事項・利用条件' }),
    ).toHaveAttribute('href', '/disclaimer')
  })
})
