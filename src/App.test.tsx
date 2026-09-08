import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import indexHtml from '../index.html?raw'
import App from './App'

vi.mock('./repositories/loadCardsData', () => ({
  loadCardsData: vi.fn(() => new Promise(() => undefined)),
}))

vi.mock('./repositories/deckRepository', () => ({
  deckRepository: {
    listDecks: vi.fn(async () => []),
    getDeck: vi.fn(async () => undefined),
    saveDeck: vi.fn(async () => undefined),
    deleteDeck: vi.fn(async () => undefined),
  },
}))

describe('App', () => {
  it('正式名称とカード検索画面の見出しを表示する', () => {
    render(
      <MemoryRouter initialEntries={['/cards']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByText('HLSieve DB')).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'カード検索' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('hOCG Card Tool')).not.toBeInTheDocument()
  })

  it('root HTMLのdocument titleに正式名称を設定する', () => {
    const document = new DOMParser().parseFromString(indexHtml, 'text/html')

    expect(document.title).toBe('HLSieve DB')
  })

  it('Decks navigation and canonical deck routes are available', async () => {
    render(
      <MemoryRouter initialEntries={['/decks']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Cards' })).toHaveAttribute(
      'href',
      '/cards',
    )
    expect(screen.getByRole('link', { name: 'Decks' })).toHaveAttribute(
      'href',
      '/decks',
    )
    expect(await screen.findByText('デッキがありません')).toBeVisible()
  })

  it('uses /decks/:deckId for the editor route', async () => {
    render(
      <MemoryRouter initialEntries={['/decks/missing']}>
        <App />
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('heading', { name: 'デッキが見つかりません' }),
    ).toBeVisible()
  })
})
