import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { Card, CardsDataFile } from '../domain/cards/types'
import { QaSearchPage } from './QaSearchPage'

function cardsData(count = 1): CardsDataFile {
  const cards: Card[] = [
    {
      cardNumber: 'hBP03-050',
      name: 'FUWAMOCO',
      cardType: 'holomem',
      colors: ['blue'],
      isBuzz: false,
      tags: [],
      abilities: [],
      arts: [],
      batonPass: [],
      effectTags: [],
      criticalColors: [],
      rarities: [],
      products: [],
      illustrators: [],
      qas: Array.from({ length: count }, (_, index) => ({
        id: `Q${617 + index}`,
        question: `共通の質問 ${index + 1}`,
        answer:
          index === 0
            ? 'エールを手札に加えられます。'
            : `共通の回答 ${index + 1}`,
        officialUrl: `https://example.com/q${617 + index}`,
        publishedAt: '2026-03-02',
        relatedCardNumbers: ['hBP03-050'],
      })),
      searchText: '',
    },
  ]
  return {
    format: 'holocard-cards',
    formatVersion: 1,
    dataVersion: 'test',
    generatedAt: '2026-09-13T00:00:00.000Z',
    cards,
  }
}

function LocationProbe() {
  const location = useLocation()
  return (
    <output aria-label="current location">{`${location.pathname}${location.search}`}</output>
  )
}

function renderPage(initialEntry = '/qa', count = 1) {
  const loadCards = vi.fn(async () => cardsData(count))
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QaSearchPage loadCards={loadCards} />
      <LocationProbe />
    </MemoryRouter>,
  )
  return loadCards
}

describe('QaSearchPage', () => {
  it('shows an accessible empty prompt and freshness notice without rendering all Q&As', async () => {
    renderPage()
    expect(screen.getByRole('heading', { name: '公式Q&A検索' })).toBeVisible()
    expect(screen.getByLabelText('検索キーワード')).toHaveAttribute(
      'placeholder',
      'Q番号・質問・回答・カード名で検索',
    )
    expect(
      await screen.findByText('Q番号・質問・回答などを入力してください。'),
    ).toBeVisible()
    expect(
      screen.getByText('実際の裁定は公式サイトの最新情報をご確認ください。'),
    ).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: 'Q617' }),
    ).not.toBeInTheDocument()
    expect(document.title).toBe('公式Q&A検索 | HLSieve DB')
    expect(
      document.head.querySelector('link[rel="canonical"]'),
    ).toHaveAttribute('href', 'https://hlsieve.com/qa')
  })

  it('restores URL query and displays full Q&A, related card, and official link', async () => {
    renderPage('/qa?q=617')
    expect(await screen.findByRole('heading', { name: 'Q617' })).toBeVisible()
    expect(screen.getByText('共通の質問 1')).toBeVisible()
    expect(screen.getByText('エールを手札に加えられます。')).toBeVisible()
    expect(screen.getByText('1件')).toBeVisible()
    expect(screen.getByRole('link', { name: /FUWAMOCO/ })).toHaveAttribute(
      'href',
      '/cards/hBP03-050',
    )
    expect(screen.getByRole('link', { name: '公式Q&Aを見る' })).toHaveAttribute(
      'target',
      '_blank',
    )
    expect(screen.getByRole('link', { name: '公式Q&Aを見る' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    )
  })

  it('keeps an unresolved related card visible without creating a broken link', async () => {
    const data = cardsData()
    data.cards[0]!.qas[0]!.relatedCardNumbers.push('UNKNOWN-001')
    render(
      <MemoryRouter initialEntries={['/qa?q=Q617']}>
        <QaSearchPage loadCards={async () => data} />
      </MemoryRouter>,
    )

    expect(
      await screen.findByText('UNKNOWN-001（現在のカード一覧では未解決）'),
    ).toBeVisible()
    expect(
      screen.queryByRole('link', { name: /UNKNOWN-001/ }),
    ).not.toBeInTheDocument()
  })

  it('updates and encodes the URL immediately, resets page, and shows zero state', async () => {
    renderPage('/qa?q=%E5%85%B1%E9%80%9A&page=2', 25)
    const pagination = await screen.findByRole('navigation', {
      name: 'Q&A検索結果のページ',
    })
    expect(within(pagination).getByText('2 / 2')).toBeVisible()
    fireEvent.change(screen.getByLabelText('検索キーワード'), {
      target: { value: '存在しない' },
    })
    await waitFor(() =>
      expect(screen.getByLabelText('current location')).toHaveTextContent(
        '/qa?q=%E5%AD%98%E5%9C%A8%E3%81%97%E3%81%AA%E3%81%84',
      ),
    )
    expect(screen.getByText('該当する公式Q&Aはありません。')).toBeVisible()
    expect(screen.getByText('0件')).toBeVisible()
  })

  it('paginates 20 results and keeps query in URL', async () => {
    renderPage('/qa?q=%E5%85%B1%E9%80%9A', 25)
    const pagination = await screen.findByRole('navigation', {
      name: 'Q&A検索結果のページ',
    })
    expect(within(pagination).getByText('1 / 2')).toBeVisible()
    expect(screen.getAllByRole('article')).toHaveLength(20)
    expect(
      within(pagination).getByRole('button', { name: '前へ' }),
    ).toBeDisabled()
    fireEvent.click(within(pagination).getByRole('button', { name: '次へ' }))
    await waitFor(() =>
      expect(screen.getByLabelText('current location')).toHaveTextContent(
        '/qa?q=%E5%85%B1%E9%80%9A&page=2',
      ),
    )
    expect(screen.getByRole('heading', { name: 'Q637' })).toBeVisible()
  })

  it('offers recovery when the card snapshot cannot be loaded', async () => {
    const loadCards = vi
      .fn<() => Promise<CardsDataFile>>()
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValueOnce(cardsData())
    render(
      <MemoryRouter initialEntries={['/qa?q=Q617']}>
        <QaSearchPage loadCards={loadCards} />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Q&Aを読み込めませんでした。',
    )
    fireEvent.click(screen.getByRole('button', { name: '再試行' }))
    expect(await screen.findByRole('heading', { name: 'Q617' })).toBeVisible()
    expect(loadCards).toHaveBeenCalledTimes(2)
  })
})
