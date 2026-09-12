import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { Card, CardsDataFile } from '../domain/cards/types'
import type { SavedTournamentReport } from '../domain/tournamentReport/savedReport'
import type { TournamentReportRepository } from '../repositories/tournamentReportRepository'
import { TournamentHistoryPage } from './TournamentHistoryPage'

function card(overrides: Partial<Card> = {}): Card {
  return {
    cardNumber: 'OSHI-R',
    name: '宝鐘マリン',
    cardType: 'oshi',
    colors: ['red'],
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

const cards: CardsDataFile = {
  format: 'holocard-cards',
  formatVersion: 1,
  dataVersion: `sha256:${'0'.repeat(64)}`,
  generatedAt: '2026-09-12T00:00:00.000Z',
  cards: [card(), card({ cardNumber: 'OSHI-B', colors: ['blue'] })],
}

function saved(id = 'report-1'): SavedTournamentReport {
  return {
    id,
    schemaVersion: 1,
    createdAt: '2026-09-12T00:00:00.000Z',
    updatedAt: '2026-09-12T01:00:00.000Z',
    report: {
      tournamentName: 'ホロカ杯',
      placement: '3位',
      participantCount: 64,
      eventDate: '2026-09-12',
      selfOshiCardNumber: 'OSHI-R',
      swissRounds: [{ result: 'win' }, { result: 'draw' }],
      tournamentRounds: [{ result: 'loss' }],
    },
  }
}

function repository(
  reports: SavedTournamentReport[],
): TournamentReportRepository {
  return {
    listReports: vi.fn(async () => reports),
    getReport: vi.fn(async () => undefined),
    createReport: vi.fn(),
    updateReport: vi.fn(),
    deleteReport: vi.fn(async () => undefined),
  }
}

function renderPage(repo: TournamentReportRepository) {
  return render(
    <MemoryRouter initialEntries={['/tournament-history']}>
      <TournamentHistoryPage repository={repo} loadCards={async () => cards} />
    </MemoryRouter>,
  )
}

describe('TournamentHistoryPage', () => {
  it('shows an empty state, local-only notice, and creation route', async () => {
    renderPage(repository([]))
    expect(
      await screen.findByText('保存された大会戦績はありません。'),
    ).toBeVisible()
    expect(screen.getByText(/この端末のブラウザ内に保存/)).toBeVisible()
    expect(
      screen.getByRole('link', { name: '大会戦績を作成' }),
    ).toHaveAttribute('href', '/tournament-report')
  })

  it('renders report facts, shared Oshi formatting, summaries, and open link', async () => {
    renderPage(repository([saved()]))
    expect(
      await screen.findByRole('heading', { name: 'ホロカ杯' }),
    ).toBeVisible()
    expect(screen.getByText('2026/09/12')).toBeVisible()
    expect(screen.getByText('3位')).toBeVisible()
    expect(screen.getByText(/宝鐘マリン 【赤】/)).toBeVisible()
    expect(screen.getByText('Swiss 1-0-1')).toBeVisible()
    expect(screen.getByText('Tournament 0-1')).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'ホロカ杯を開く' }),
    ).toHaveAttribute('href', '/tournament-report?id=report-1')
  })

  it('keeps an unknown Oshi record and shows a safe fallback', async () => {
    const value = saved()
    value.report.selfOshiCardNumber = 'REMOVED-OSHI'
    renderPage(repository([value]))
    expect(
      await screen.findByText(/現在のカードデータでは確認できません/),
    ).toBeVisible()
    expect(screen.queryByText('REMOVED-OSHI')).not.toBeInTheDocument()
  })

  it('requires confirmation, supports cancel, and deletes successfully', async () => {
    const repo = repository([saved()])
    renderPage(repo)
    fireEvent.click(
      await screen.findByRole('button', { name: 'ホロカ杯を削除' }),
    )
    const dialog = screen.getByRole('alertdialog', {
      name: '大会戦績削除の確認',
    })
    expect(dialog).toHaveTextContent('この大会戦績を削除しますか？')
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'ホロカ杯を削除' }))
    fireEvent.click(screen.getByRole('button', { name: '削除する' }))
    await waitFor(() =>
      expect(repo.deleteReport).toHaveBeenCalledWith('report-1'),
    )
    expect(
      screen.queryByRole('heading', { name: 'ホロカ杯' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('削除しました')
  })

  it('does not crash when the repository has skipped corrupt records', async () => {
    renderPage(repository([]))
    expect(
      await screen.findByText('保存された大会戦績はありません。'),
    ).toBeVisible()
  })
})
