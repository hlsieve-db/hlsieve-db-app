import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./repositories/loadCardsData', () => ({
  loadCardsData: vi.fn(() => new Promise(() => undefined)),
}))

describe('App', () => {
  it('カード検索画面の見出しを表示する', () => {
    render(
      <MemoryRouter initialEntries={['/cards']}>
        <App />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('heading', { name: 'カード検索' }),
    ).toBeInTheDocument()
  })
})
