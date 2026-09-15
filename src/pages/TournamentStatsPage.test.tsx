import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { Card, CardsDataFile } from '../domain/cards/types'
import type { SavedTournamentReport } from '../domain/tournamentReport/savedReport'
import type { TournamentReportRepository } from '../repositories/tournamentReportRepository'
import { TournamentStatsPage } from './TournamentStatsPage'

function card(cardNumber: string, name: string, colors: Card['colors']): Card {
  return {
    cardNumber,
    name,
    cardType: 'oshi',
    colors,
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
  }
}

const cards: CardsDataFile = {
  format: 'holocard-cards',
  formatVersion: 1,
  dataVersion: `sha256:${'0'.repeat(64)}`,
  generatedAt: '2026-09-13T00:00:00.000Z',
  cards: [card('OWN', 'AZKi', ['green']), card('OPP', '宝鐘マリン', ['red'])],
}

function saved(): SavedTournamentReport {
  return {
    id: 'saved-1',
    schemaVersion: 1,
    createdAt: '2026-09-13T00:00:00.000Z',
    updatedAt: '2026-09-13T00:00:00.000Z',
    report: {
      tournamentName: 'ホロカ杯',
      placement: '',
      selfOshiCardNumber: 'OWN',
      swissRounds: [
        {
          result: 'win',
          playOrder: 'first',
          initiativeChoiceResult: 'won_choice',
          opponentOshiCardNumber: 'OPP',
        },
        {
          result: 'draw',
          playOrder: 'second',
          initiativeChoiceResult: 'lost_choice',
        },
      ],
      tournamentRounds: [{ result: 'loss' }],
    },
  }
}

function repository(
  result: SavedTournamentReport[] | Error,
): TournamentReportRepository {
  return {
    listReports: vi.fn(async () => {
      if (result instanceof Error) throw result
      return result
    }),
    getReport: vi.fn(),
    createReport: vi.fn(),
    updateReport: vi.fn(),
    deleteReport: vi.fn(),
    importReports: vi.fn(),
  }
}

function renderPage(
  result: SavedTournamentReport[] | Error,
  loadCards = async () => cards,
) {
  return render(
    <MemoryRouter initialEntries={['/tournament-stats']}>
      <TournamentStatsPage
        repository={repository(result)}
        loadCards={loadCards}
        today={() => '2026-09-13'}
      />
    </MemoryRouter>,
  )
}

describe('TournamentStatsPage', () => {
  it('shows loading then the local empty state and local navigation', async () => {
    let resolve!: (value: SavedTournamentReport[]) => void
    const pending = new Promise<SavedTournamentReport[]>((done) => {
      resolve = done
    })
    const repo = repository([])
    repo.listReports = vi.fn(() => pending)
    render(
      <MemoryRouter>
        <TournamentStatsPage repository={repo} loadCards={async () => cards} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('読み込んでいます')
    resolve([])
    expect(
      await screen.findByText('保存された大会戦績がありません。'),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: '戦績を作成' })).toHaveAttribute(
      'href',
      '/tournament-report',
    )
    expect(screen.getByRole('link', { name: '履歴' })).toHaveAttribute(
      'href',
      '/tournament-history',
    )
    expect(screen.getByRole('link', { name: '統計' })).toHaveAttribute(
      'href',
      '/tournament-stats',
    )
  })

  it('renders all summaries, missing counts and Oshi sections', async () => {
    renderPage([saved()])
    expect(await screen.findByRole('heading', { name: '概要' })).toBeVisible()
    expect(
      screen.getByText('勝率 = WIN ÷ 総対戦数（DRAWも分母に含みます）'),
    ).toBeVisible()
    expect(
      screen.getByText('1', { selector: '.tournament-stats-summary p' }),
    ).toBeVisible()
    expect(
      screen.getByText('3', { selector: '.tournament-stats-summary p' }),
    ).toBeVisible()
    expect(screen.getByText('1-1-1')).toBeVisible()
    expect(screen.getByText('33.3%')).toBeVisible()
    expect(screen.getByLabelText('Swiss 戦績 1-0-1')).toBeVisible()
    expect(screen.getByLabelText('Tournament 戦績 0-1')).toBeVisible()
    expect(screen.getByLabelText('先攻 勝率 100.0%')).toBeVisible()
    expect(screen.getByLabelText('後攻 勝率 0.0%')).toBeVisible()
    expect(screen.getByLabelText('⚀○ 勝率 100.0%')).toBeVisible()
    expect(screen.getByLabelText('⚀× 勝率 0.0%')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'AZKi' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '宝鐘マリン' })).toBeVisible()
    expect(screen.getByText('手番未入力: 1戦')).toBeVisible()
    expect(screen.getByText('対戦相手の推し未入力: 2戦')).toBeVisible()
    expect(screen.getByText(/この端末のブラウザ内に保存/)).toBeVisible()
    expect(screen.getByRole('radio', { name: '全期間' })).toBeChecked()
    expect(screen.getByText('集計期間: 全期間')).toBeVisible()
  })

  it('shows dashes for a saved zero-round report and safely labels unknown Oshi', async () => {
    const value = saved()
    value.report.selfOshiCardNumber = 'REMOVED'
    value.report.swissRounds = []
    value.report.tournamentRounds = []
    renderPage([value])
    expect(
      await screen.findByText('対戦結果が入力された大会がありません。'),
    ).toBeVisible()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: '不明な推し' })).toBeVisible()
    expect(screen.queryByText('REMOVED')).not.toBeInTheDocument()
  })

  it('does not crash when card data fails to load', async () => {
    renderPage([saved()], async () => {
      throw new Error('cards')
    })
    expect(
      await screen.findAllByRole('heading', { name: '不明な推し' }),
    ).toHaveLength(2)
  })

  it('shows a repository load failure as an alert', async () => {
    renderPage(new Error('db'))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '読み込めませんでした',
    )
  })

  it('filters every statistic by recent periods and reports missing event dates', async () => {
    const recent = saved()
    recent.id = 'recent'
    recent.report.eventDate = '2026-09-13'
    const old = saved()
    old.id = 'old'
    old.report.eventDate = '2026-08-13'
    const missing = saved()
    missing.id = 'missing'

    renderPage([recent, old, missing])
    await screen.findByRole('heading', { name: '概要' })

    fireEvent.click(screen.getByRole('radio', { name: '直近30日' }))
    expect(screen.getByText('集計期間: 直近30日')).toBeVisible()
    expect(screen.getByText(/開催日未入力の大会 1件/)).toBeVisible()
    expect(
      screen.getByText('1', { selector: '.tournament-stats-summary p' }),
    ).toBeVisible()
    expect(screen.getByLabelText('Swiss 戦績 1-0-1')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'AZKi' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '宝鐘マリン' })).toBeVisible()

    fireEvent.click(screen.getByRole('radio', { name: '直近90日' }))
    expect(screen.getByText('集計期間: 直近90日')).toBeVisible()
    expect(
      screen.getByText('2', { selector: '.tournament-stats-summary p' }),
    ).toBeVisible()

    fireEvent.click(screen.getByRole('radio', { name: '今年' }))
    expect(screen.getByText('集計期間: 今年')).toBeVisible()
    expect(
      screen.getByText('2', { selector: '.tournament-stats-summary p' }),
    ).toBeVisible()
  })

  it('requires a valid custom range, applies inclusive dates, and resets from no match', async () => {
    const report = saved()
    report.report.eventDate = '2026-09-13'
    renderPage([report])
    await screen.findByRole('heading', { name: '概要' })

    fireEvent.click(screen.getByRole('radio', { name: '期間指定' }))
    expect(screen.getByLabelText('開始日')).toBeVisible()
    expect(screen.getByLabelText('終了日')).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent(
      '開始日と終了日を入力してください。',
    )
    expect(
      screen.queryByRole('heading', { name: '概要' }),
    ).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('開始日'), {
      target: { value: '2026-09-14' },
    })
    fireEvent.change(screen.getByLabelText('終了日'), {
      target: { value: '2026-09-13' },
    })
    expect(screen.getByRole('alert')).toHaveTextContent(
      '開始日は終了日以前の日付を指定してください。',
    )

    fireEvent.change(screen.getByLabelText('開始日'), {
      target: { value: '2026-09-13' },
    })
    expect(screen.getByText('集計期間: 2026/09/13 ～ 2026/09/13')).toBeVisible()
    expect(screen.getByRole('heading', { name: '概要' })).toBeVisible()

    fireEvent.change(screen.getByLabelText('開始日'), {
      target: { value: '2026-09-14' },
    })
    fireEvent.change(screen.getByLabelText('終了日'), {
      target: { value: '2026-09-14' },
    })
    expect(
      screen.getByText('選択した期間に大会戦績がありません。'),
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '全期間を見る' }))
    expect(screen.getByRole('radio', { name: '全期間' })).toBeChecked()
    expect(screen.getByRole('heading', { name: '概要' })).toBeVisible()
  })
})
