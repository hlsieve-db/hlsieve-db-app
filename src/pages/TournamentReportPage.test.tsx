import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { Card, CardsDataFile } from '../domain/cards/types'
import { SITE_ORIGIN } from '../domain/site/constants'
import { TournamentReportPage } from './TournamentReportPage'

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    cardNumber: 'OSHI-001',
    name: 'AZKi',
    nameReading: 'あずき',
    cardType: 'oshi',
    colors: ['green'],
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
    qas: [],
    searchText: '',
    ...overrides,
  }
}

const cards = [
  makeCard(),
  makeCard({ cardNumber: 'MARINE-R', name: '宝鐘マリン', colors: ['red'] }),
  makeCard({ cardNumber: 'MARINE-B', name: '宝鐘マリン', colors: ['blue'] }),
  makeCard({
    cardNumber: 'PEKORA-001',
    name: '兎田ぺこら',
    nameReading: 'うさだぺこら',
  }),
  makeCard({ cardNumber: 'MEM-001', cardType: 'holomem' }),
]

const cardData: CardsDataFile = {
  format: 'holocard-cards',
  formatVersion: 1,
  dataVersion: `sha256:${'0'.repeat(64)}`,
  generatedAt: '2026-09-12T00:00:00.000Z',
  cards,
}

function renderPage(writeClipboard?: (text: string) => Promise<void>) {
  return render(
    <MemoryRouter initialEntries={['/tournament-report']}>
      <TournamentReportPage
        loadCards={vi.fn(async () => cardData)}
        writeClipboard={writeClipboard}
      />
    </MemoryRouter>,
  )
}

async function selectOshi(label: string, query: string, optionName: RegExp) {
  const input = await screen.findByRole('combobox', { name: label })
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: query } })
  fireEvent.click(await screen.findByRole('option', { name: optionName }))
}

describe('TournamentReportPage', () => {
  it('renders editable basic fields and an incomplete live preview', async () => {
    const { container } = renderPage()

    expect(screen.getByLabelText('大会名（必須）')).toBeVisible()
    expect(screen.getByLabelText('順位')).toHaveAttribute('type', 'text')
    expect(screen.getByLabelText('参加人数（任意）')).toHaveAttribute(
      'inputmode',
      'numeric',
    )
    expect(screen.getByLabelText('開催日（任意）')).toHaveAttribute(
      'type',
      'date',
    )
    expect(container.querySelector('.report-preview')).toHaveTextContent(
      '大会名未入力',
    )
    expect(container.querySelector('.report-preview')).toHaveTextContent(
      '未選択',
    )
    expect(await screen.findByText('推しホロメン候補 4件')).toBeVisible()
  })

  it('updates tournament details and self Oshi in the preview', async () => {
    const { container } = renderPage()

    fireEvent.change(screen.getByLabelText('大会名（必須）'), {
      target: { value: 'ホロカ交流会' },
    })
    fireEvent.change(screen.getByLabelText('順位'), {
      target: { value: 'ベスト8' },
    })
    fireEvent.change(screen.getByLabelText('参加人数（任意）'), {
      target: { value: '64' },
    })
    fireEvent.change(screen.getByLabelText('開催日（任意）'), {
      target: { value: '2026-09-12' },
    })
    await selectOshi(
      '自分の推しホロメン（必須）',
      'ぺこら',
      /兎田ぺこら.*PEKORA-001/,
    )

    const preview = container.querySelector('.report-preview')
    expect(preview).toHaveTextContent('ホロカ交流会')
    expect(preview).toHaveTextContent('ベスト8')
    expect(preview).toHaveTextContent('兎田ぺこら')
    expect(preview).toHaveTextContent('64人')
    expect(preview).toHaveTextContent('2026-09-12')
  })

  it('adds, edits, summarizes, and removes a Swiss round', async () => {
    const { container } = renderPage()
    await screen.findByText('推しホロメン候補 4件')
    fireEvent.click(screen.getByRole('button', { name: '＋ 回戦を追加' }))

    const round = screen.getByRole('group', { name: 'R1' })
    await selectOshi(
      'R1 対戦相手の推し',
      'MARINE-R',
      /宝鐘マリン 【赤】.*MARINE-R/,
    )
    fireEvent.click(
      within(
        within(round).getByRole('group', { name: '先攻・後攻' }),
      ).getByRole('radio', { name: '先攻' }),
    )
    fireEvent.click(
      within(
        within(round).getByRole('group', { name: '手番選択権' }),
      ).getByRole('radio', { name: '⚀○ 手番選択権あり' }),
    )
    fireEvent.click(
      within(within(round).getByRole('group', { name: '勝敗' })).getByRole(
        'radio',
        {
          name: 'WIN',
        },
      ),
    )

    const preview = container.querySelector('.report-preview')
    expect(preview).toHaveTextContent('Swiss1-0')
    expect(preview).toHaveTextContent('R1')
    expect(preview).toHaveTextContent('宝鐘マリン 【赤】')
    expect(preview).toHaveTextContent('先攻')
    expect(preview).toHaveTextContent('⚀○')
    expect(preview).toHaveTextContent('○ WIN')

    fireEvent.click(within(round).getByRole('button', { name: 'R1を削除' }))
    expect(screen.queryByRole('group', { name: 'R1' })).not.toBeInTheDocument()
  })

  it('supports optional initiative, losses, and tournament summaries', async () => {
    const { container } = renderPage()
    await screen.findByText('推しホロメン候補 4件')
    fireEvent.click(
      screen.getByRole('button', { name: '＋ トーナメント戦を追加' }),
    )
    const round = screen.getByRole('group', { name: 'T1' })

    expect(
      within(
        within(round).getByRole('group', { name: '手番選択権' }),
      ).getByRole('radio', { name: '未入力' }),
    ).toBeChecked()
    fireEvent.click(
      within(
        within(round).getByRole('group', { name: '先攻・後攻' }),
      ).getByRole('radio', { name: '後攻' }),
    )
    fireEvent.click(
      within(
        within(round).getByRole('group', { name: '手番選択権' }),
      ).getByRole('radio', { name: '⚀× 手番選択権なし' }),
    )
    fireEvent.click(
      within(within(round).getByRole('group', { name: '勝敗' })).getByRole(
        'radio',
        {
          name: 'LOSE',
        },
      ),
    )

    const preview = container.querySelector('.report-preview')
    expect(preview).toHaveTextContent('Tournament0-1')
    expect(preview).toHaveTextContent('後攻')
    expect(preview).toHaveTextContent('⚀×')
    expect(preview).toHaveTextContent('× LOSE')
  })

  it('supports DRAW in Swiss and tournament inputs, previews, and summaries', async () => {
    const { container } = renderPage()
    await screen.findByText('推しホロメン候補 4件')
    fireEvent.click(screen.getByRole('button', { name: '＋ 回戦を追加' }))
    fireEvent.click(
      screen.getByRole('button', { name: '＋ トーナメント戦を追加' }),
    )

    const swiss = screen.getByRole('group', { name: 'R1' })
    const tournament = screen.getByRole('group', { name: 'T1' })
    for (const round of [swiss, tournament]) {
      const resultGroup = within(round).getByRole('group', { name: '勝敗' })
      expect(
        within(resultGroup)
          .getAllByRole('radio')
          .map((radio) => radio.getAttribute('value')),
      ).toEqual(['', 'win', 'draw', 'loss'])
      expect(
        within(resultGroup).getByRole('radio', { name: 'WIN' }),
      ).toBeVisible()
      expect(
        within(resultGroup).getByRole('radio', { name: 'DRAW' }),
      ).toBeVisible()
      expect(
        within(resultGroup).getByRole('radio', { name: 'LOSE' }),
      ).toBeVisible()
      fireEvent.click(within(resultGroup).getByRole('radio', { name: 'DRAW' }))
    }

    const preview = container.querySelector('.report-preview')
    expect(preview).toHaveTextContent('Swiss0-0-1')
    expect(preview).toHaveTextContent('Tournament0-0-1')
    expect(preview).toHaveTextContent('△ DRAW')
  })

  it('enforces Swiss max 10 and tournament max 4 in the UI', async () => {
    renderPage()
    await screen.findByText('推しホロメン候補 4件')
    const addSwiss = screen.getByRole('button', { name: '＋ 回戦を追加' })
    const addTournament = screen.getByRole('button', {
      name: '＋ トーナメント戦を追加',
    })

    for (let index = 0; index < 10; index += 1) fireEvent.click(addSwiss)
    for (let index = 0; index < 4; index += 1) fireEvent.click(addTournament)

    expect(addSwiss).toBeDisabled()
    expect(addTournament).toBeDisabled()
    expect(screen.getByRole('group', { name: 'R10' })).toBeVisible()
    expect(screen.getByRole('group', { name: 'T4' })).toBeVisible()
  })

  it('searches Oshi by cardNumber and distinguishes same-name colors', async () => {
    renderPage()
    const input = await screen.findByRole('combobox', {
      name: '自分の推しホロメン（必須）',
    })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'MARINE' } })

    expect(
      screen.getByRole('option', { name: /宝鐘マリン 【赤】.*MARINE-R/ }),
    ).toBeVisible()
    expect(
      screen.getByRole('option', { name: /宝鐘マリン 【青】.*MARINE-B/ }),
    ).toBeVisible()
  })

  it('validates participant count and exposes indexable metadata', async () => {
    renderPage()
    await waitFor(() =>
      expect(document.title).toBe('大会戦績レポート | HLSieve DB'),
    )
    fireEvent.change(screen.getByLabelText('参加人数（任意）'), {
      target: { value: '1.5' },
    })

    expect(
      screen.getByText('参加人数は1〜100,000の整数で入力してください。'),
    ).toBeVisible()
    expect(
      document.head.querySelector('link[rel="canonical"]'),
    ).toHaveAttribute('href', `${SITE_ORIGIN}/tournament-report`)
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'index,follow',
    )
  })

  it('reports card loading failures without breaking the incomplete preview', async () => {
    const { container } = render(
      <MemoryRouter>
        <TournamentReportPage
          loadCards={vi.fn(async () => Promise.reject(new Error('offline')))}
        />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'カードデータを読み込めませんでした。',
    )
    expect(container.querySelector('.report-preview')).toHaveTextContent(
      '大会名未入力',
    )
  })

  it('copies formatter-compatible plain text and announces success', async () => {
    const writeClipboard = vi.fn(async () => undefined)
    renderPage(writeClipboard)
    const copyButton = screen.getByRole('button', { name: 'テキストをコピー' })
    expect(copyButton).toBeDisabled()

    fireEvent.change(screen.getByLabelText('大会名（必須）'), {
      target: { value: '交流会' },
    })
    expect(copyButton).toBeEnabled()
    fireEvent.click(copyButton)

    await waitFor(() =>
      expect(writeClipboard).toHaveBeenCalledWith('交流会\n\nHLSieve DB'),
    )
    expect(screen.getByRole('status')).toHaveTextContent('コピーしました')
  })

  it('handles Clipboard API rejection without crashing and announces failure', async () => {
    const writeClipboard = vi.fn(async () =>
      Promise.reject(new Error('denied')),
    )
    renderPage(writeClipboard)
    fireEvent.change(screen.getByLabelText('順位'), {
      target: { value: '優勝' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'テキストをコピー' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'コピーできませんでした',
    )
  })
})
