import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_DOCUMENT_TITLE, SITE_ORIGIN } from '../domain/site/constants'
import { useDocumentMetadata } from './useDocumentMetadata'

function metaContent(selector: string): string | null | undefined {
  return document.head.querySelector<HTMLMetaElement>(selector)?.content
}

function CardsMetadata() {
  useDocumentMetadata({
    title: DEFAULT_DOCUMENT_TITLE,
    canonicalPath: '/cards',
  })
  return <Link to="/decks">Decksへ</Link>
}

function DecksMetadata() {
  useDocumentMetadata({
    title: '保存デッキ | HLSieve DB',
    canonicalPath: '/decks',
    robots: 'noindex,follow',
  })
  return <Link to="/cards">Cardsへ</Link>
}

function CardMetadata() {
  const { cardNumber = '' } = useParams<'cardNumber'>()
  const name = cardNumber === 'CARD-A' ? 'カードA' : 'カードB'
  const title = `${name} (${cardNumber}) | HLSieve DB`
  const description = `${name}の説明`
  useDocumentMetadata({
    title,
    description,
    canonicalPath: `/cards/${cardNumber}`,
  })
  return (
    <Link to={cardNumber === 'CARD-A' ? '/cards/CARD-B' : '/cards'}>次へ</Link>
  )
}

function TestRoutes({ initialPath }: { initialPath: string }) {
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/cards" element={<CardsMetadata />} />
        <Route path="/cards/:cardNumber" element={<CardMetadata />} />
        <Route path="/decks" element={<DecksMetadata />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  document.title = 'initial'
  document.head
    .querySelectorAll('meta:not([name="theme-color"]), link[rel="canonical"]')
    .forEach((element) => element.remove())
})

describe('useDocumentMetadata', () => {
  it('keeps default SEO, Open Graph, and Twitter metadata aligned', () => {
    render(<TestRoutes initialPath="/cards" />)

    expect(document.title).toBe(DEFAULT_DOCUMENT_TITLE)
    expect(metaContent('meta[name="description"]')).toContain('非公式')
    expect(metaContent('meta[name="robots"]')).toBe('index,follow')
    expect(metaContent('meta[property="og:type"]')).toBe('website')
    expect(metaContent('meta[property="og:site_name"]')).toBe('HLSieve DB')
    expect(metaContent('meta[property="og:title"]')).toBe(
      DEFAULT_DOCUMENT_TITLE,
    )
    expect(metaContent('meta[property="og:url"]')).toBe(`${SITE_ORIGIN}/cards`)
    expect(metaContent('meta[property="og:image"]')).toBe(
      `${SITE_ORIGIN}/og-image.png`,
    )
    expect(metaContent('meta[name="twitter:card"]')).toBe('summary_large_image')
    expect(metaContent('meta[name="twitter:title"]')).toBe(
      DEFAULT_DOCUMENT_TITLE,
    )
    expect(
      document.head.querySelector('link[rel="canonical"]'),
    ).toHaveAttribute('href', `${SITE_ORIGIN}/cards`)
  })

  it('updates Card A metadata to Card B and restores Cards defaults', async () => {
    render(<TestRoutes initialPath="/cards/CARD-A?printing=10" />)

    expect(document.title).toBe('カードA (CARD-A) | HLSieve DB')
    expect(metaContent('meta[name="description"]')).toBe('カードAの説明')
    expect(
      document.head.querySelector('link[rel="canonical"]'),
    ).toHaveAttribute('href', `${SITE_ORIGIN}/cards/CARD-A`)

    fireEvent.click(screen.getByRole('link', { name: '次へ' }))
    await waitFor(() =>
      expect(document.title).toBe('カードB (CARD-B) | HLSieve DB'),
    )
    expect(metaContent('meta[property="og:url"]')).toBe(
      `${SITE_ORIGIN}/cards/CARD-B`,
    )

    fireEvent.click(screen.getByRole('link', { name: '次へ' }))
    await waitFor(() => expect(document.title).toBe(DEFAULT_DOCUMENT_TITLE))
    expect(metaContent('meta[name="description"]')).toContain('非公式')
    expect(metaContent('meta[name="robots"]')).toBe('index,follow')
  })

  it('removes Deck noindex metadata after navigating back to Cards', async () => {
    render(<TestRoutes initialPath="/decks" />)
    expect(metaContent('meta[name="robots"]')).toBe('noindex,follow')

    fireEvent.click(screen.getByRole('link', { name: 'Cardsへ' }))
    await waitFor(() =>
      expect(metaContent('meta[name="robots"]')).toBe('index,follow'),
    )
    expect(document.title).toBe(DEFAULT_DOCUMENT_TITLE)
  })
})
