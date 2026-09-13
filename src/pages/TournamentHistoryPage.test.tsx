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
import type { SavedTournamentReport } from '../domain/tournamentReport/savedReport'
import {
  createTournamentBackup,
  MAX_TOURNAMENT_BACKUP_FILE_SIZE,
  serializeTournamentBackup,
} from '../domain/tournamentReport/backup'
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

function saved(
  id = 'report-1',
  tournamentName = 'ホロカ杯',
): SavedTournamentReport {
  return {
    id,
    schemaVersion: 1,
    createdAt: '2026-09-12T00:00:00.000Z',
    updatedAt: '2026-09-12T01:00:00.000Z',
    report: {
      tournamentName,
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
  let stored = [...reports]
  return {
    listReports: vi.fn(async () => [...stored]),
    getReport: vi.fn(async (id) => stored.find((report) => report.id === id)),
    createReport: vi.fn(),
    updateReport: vi.fn(),
    deleteReport: vi.fn(async (id) => {
      stored = stored.filter((report) => report.id !== id)
    }),
    importReports: vi.fn(async (values) => {
      stored.push(...values)
    }),
  }
}

function renderPage(
  repo: TournamentReportRepository,
  extras: {
    downloadFile?: (filename: string, contents: string) => void
    createImportId?: () => string
  } = {},
) {
  return render(
    <MemoryRouter initialEntries={['/tournament-history']}>
      <TournamentHistoryPage
        repository={repo}
        loadCards={async () => cards}
        now={() => new Date(2026, 8, 13)}
        downloadFile={extras.downloadFile}
        createImportId={extras.createImportId}
      />
    </MemoryRouter>,
  )
}

function backupFile(contents: string, size?: number): File {
  const file = new File([contents], 'backup.json', {
    type: 'application/json',
  })
  Object.defineProperty(file, 'text', { value: async () => contents })
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size })
  return file
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
    expect(
      screen.getByRole('button', { name: 'バックアップを書き出す' }),
    ).toBeDisabled()
    expect(screen.getByText(/定期的にバックアップ/)).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'バックアップを読み込む' }),
    ).toBeEnabled()
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

  it('exports all reports with the local-date filename and privacy notice', async () => {
    const downloadFile = vi.fn()
    renderPage(repository([saved()]), { downloadFile })
    fireEvent.click(
      await screen.findByRole('button', { name: 'バックアップを書き出す' }),
    )
    expect(downloadFile).toHaveBeenCalledTimes(1)
    expect(downloadFile.mock.calls[0][0]).toBe(
      'hlsieve-tournament-backup-2026-09-13.json',
    )
    const exported = JSON.parse(downloadFile.mock.calls[0][1])
    expect(exported).toMatchObject({
      format: 'hlsieve-tournament-backup',
      version: 1,
      reports: [{ id: 'report-1', schemaVersion: 1 }],
    })
    expect(downloadFile.mock.calls[0][1]).not.toContain('theme')
    expect(downloadFile.mock.calls[0][1]).not.toContain('deck')
    expect(screen.getByText(/大会名、順位、使用推し/)).toBeVisible()
    expect(screen.getByText(/外部へ送信されません/)).toBeVisible()
  })

  it('previews counts, cancels without writing, and accepts the same file again', async () => {
    const repo = repository([])
    renderPage(repo)
    const incoming = saved('new-report')
    const file = backupFile(
      serializeTournamentBackup(
        createTournamentBackup([incoming], '2026-09-13T00:00:00.000Z'),
      ),
    )
    const input = screen.getByLabelText('大会戦績バックアップJSONファイル')
    fireEvent.change(input, { target: { files: [file] } })
    const preview = await screen.findByRole('dialog', {
      name: '読み込み内容の確認',
    })
    expect(
      within(preview).getByText('新規追加').parentElement,
    ).toHaveTextContent('新規追加1件')
    fireEvent.click(within(preview).getByRole('button', { name: 'キャンセル' }))
    expect(repo.importReports).not.toHaveBeenCalled()
    expect(input).toHaveValue('')

    fireEvent.change(input, { target: { files: [file] } })
    expect(
      await screen.findByRole('dialog', { name: '読み込み内容の確認' }),
    ).toBeVisible()
  })

  it('imports after confirmation and refreshes the history immediately', async () => {
    const repo = repository([])
    renderPage(repo)
    const incoming = saved('restored', '復元大会')
    const file = backupFile(
      serializeTournamentBackup(
        createTournamentBackup([incoming], '2026-09-13T00:00:00.000Z'),
      ),
    )
    fireEvent.change(
      screen.getByLabelText('大会戦績バックアップJSONファイル'),
      {
        target: { files: [file] },
      },
    )
    fireEvent.click(
      await screen.findByRole('button', { name: '読み込みを実行' }),
    )
    await waitFor(() =>
      expect(repo.importReports).toHaveBeenCalledWith([incoming]),
    )
    expect(
      await screen.findByRole('heading', { name: '復元大会' }),
    ).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent(
      '追加: 1件、同一のためスキップ: 0件',
    )

    const input = screen.getByLabelText('大会戦績バックアップJSONファイル')
    fireEvent.change(input, { target: { files: [file] } })
    const secondPreview = await screen.findByRole('dialog')
    expect(
      within(secondPreview).getByText('既存と同一').parentElement,
    ).toHaveTextContent('既存と同一1件')
    fireEvent.click(
      within(secondPreview).getByRole('button', { name: '読み込みを実行' }),
    )
    await waitFor(() => expect(repo.importReports).toHaveBeenLastCalledWith([]))
    expect(screen.getAllByRole('heading', { name: '復元大会' })).toHaveLength(1)
  })

  it('shows identical/conflict preview and never overwrites the existing record', async () => {
    const existing = saved('report-1', '既存大会')
    const incoming = saved('report-1', '復元大会')
    const repo = repository([existing])
    renderPage(repo, { createImportId: () => 'generated-id' })
    await screen.findByRole('heading', { name: '既存大会' })
    const file = backupFile(
      serializeTournamentBackup(
        createTournamentBackup([incoming], '2026-09-13T00:00:00.000Z'),
      ),
    )
    fireEvent.change(
      screen.getByLabelText('大会戦績バックアップJSONファイル'),
      {
        target: { files: [file] },
      },
    )
    const preview = await screen.findByRole('dialog')
    expect(
      within(preview).getByText(/既存データは上書きされません/),
    ).toBeVisible()
    expect(within(preview).getByText('ID重複').parentElement).toHaveTextContent(
      'ID重複1件',
    )
    fireEvent.click(
      within(preview).getByRole('button', { name: '読み込みを実行' }),
    )
    await waitFor(() =>
      expect(repo.importReports).toHaveBeenCalledWith([
        { ...incoming, id: 'generated-id' },
      ]),
    )
    expect(screen.getByRole('heading', { name: '既存大会' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '復元大会' })).toBeVisible()
  })

  it('rejects invalid and oversized files without mutating history', async () => {
    const repo = repository([saved()])
    renderPage(repo)
    const input = screen.getByLabelText('大会戦績バックアップJSONファイル')
    fireEvent.change(input, { target: { files: [backupFile('{')] } })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'バックアップファイルを読み込めませんでした',
    )
    expect(repo.importReports).not.toHaveBeenCalled()

    fireEvent.change(input, {
      target: {
        files: [backupFile('{}', MAX_TOURNAMENT_BACKUP_FILE_SIZE + 1)],
      },
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ファイルサイズが大きすぎます',
    )
    expect(screen.getByRole('heading', { name: 'ホロカ杯' })).toBeVisible()
  })
})
