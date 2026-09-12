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
import type { TournamentReportImageFile } from '../domain/tournamentReport/renderImage'
import type { SavedTournamentReport } from '../domain/tournamentReport/savedReport'
import type { TournamentReport } from '../domain/tournamentReport/types'
import type { TournamentReportRepository } from '../repositories/tournamentReportRepository'
import { TournamentReportPage } from './TournamentReportPage'

function card(): Card {
  return {
    cardNumber: 'OSHI-001',
    name: 'AZKi',
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
  }
}

const cardData: CardsDataFile = {
  format: 'holocard-cards',
  formatVersion: 1,
  dataVersion: `sha256:${'0'.repeat(64)}`,
  generatedAt: '2026-09-12T00:00:00.000Z',
  cards: [card()],
}

function stored(
  reportOverrides: Partial<TournamentReport> = {},
): SavedTournamentReport {
  return {
    id: 'saved-1',
    schemaVersion: 1,
    createdAt: '2026-09-10T00:00:00.000Z',
    updatedAt: '2026-09-11T00:00:00.000Z',
    report: {
      tournamentName: '保存大会',
      placement: '準優勝',
      participantCount: 32,
      eventDate: '2026-09-10',
      selfOshiCardNumber: 'OSHI-001',
      swissRounds: [
        {
          opponentOshiCardNumber: 'OSHI-001',
          playOrder: 'second',
          initiativeChoiceResult: 'lost_choice',
          result: 'draw',
        },
      ],
      tournamentRounds: [
        {
          result: 'win',
          playOrder: 'first',
          initiativeChoiceResult: 'won_choice',
        },
      ],
      ...reportOverrides,
    },
  }
}

function memoryRepository(
  initial?: SavedTournamentReport,
): TournamentReportRepository {
  let value = initial
  return {
    getReport: vi.fn(async (id) => (value?.id === id ? value : undefined)),
    listReports: vi.fn(async () => (value ? [value] : [])),
    createReport: vi.fn(async (report) => {
      value = { ...stored(), id: 'new-1', report }
      return value
    }),
    updateReport: vi.fn(async (id, report) => {
      if (!value || value.id !== id) throw new Error('missing')
      value = { ...value, report, updatedAt: '2026-09-12T00:00:00.000Z' }
      return value
    }),
    deleteReport: vi.fn(async () => undefined),
  }
}

function renderPage(
  repository: TournamentReportRepository,
  entry = '/tournament-report',
  extras: {
    writeClipboard?: (text: string) => Promise<void>
    generateImages?: () => Promise<TournamentReportImageFile[]>
  } = {},
) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <TournamentReportPage
        repository={repository}
        loadCards={async () => cardData}
        writeClipboard={extras.writeClipboard}
        generateImages={extras.generateImages}
        createObjectUrl={() => 'blob:history'}
        revokeObjectUrl={() => undefined}
      />
    </MemoryRouter>,
  )
}

describe('TournamentReportPage saved history integration', () => {
  it('creates a local saved report and then updates the same ID', async () => {
    const repository = memoryRepository()
    renderPage(repository)
    fireEvent.change(screen.getByLabelText('大会名（必須）'), {
      target: { value: '新規大会' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() =>
      expect(repository.createReport).toHaveBeenCalledTimes(1),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('保存しました')
    const updateButton = await screen.findByRole('button', {
      name: '変更を保存',
    })
    await waitFor(() => expect(updateButton).toBeEnabled())
    fireEvent.change(screen.getByLabelText('順位'), {
      target: { value: '優勝' },
    })
    fireEvent.click(updateButton)
    await waitFor(() =>
      expect(repository.updateReport).toHaveBeenCalledWith(
        'new-1',
        expect.objectContaining({ placement: '優勝' }),
      ),
    )
  })

  it('restores every report field including DRAW and initiative', async () => {
    renderPage(memoryRepository(stored()), '/tournament-report?id=saved-1')
    expect(await screen.findByDisplayValue('保存大会')).toBeVisible()
    expect(screen.getByLabelText('順位')).toHaveValue('準優勝')
    expect(screen.getByLabelText('参加人数（任意）')).toHaveValue(32)
    expect(screen.getByLabelText('開催日（任意）')).toHaveValue('2026-09-10')
    const swissRound = screen.getByRole('group', { name: 'R1' })
    expect(
      within(swissRound).getByRole('radio', { name: 'DRAW' }),
    ).toBeChecked()
    expect(
      within(swissRound).getByRole('radio', { name: '後攻' }),
    ).toBeChecked()
    expect(within(swissRound).getByRole('radio', { name: /⚀×/ })).toBeChecked()
    expect(screen.getByRole('heading', { name: /Swiss.*0-0-1/ })).toBeVisible()
    expect(screen.getByRole('radio', { name: /スマホ向け 4:5/ })).toBeChecked()
  })

  it('reuses text and PNG outputs for a loaded report', async () => {
    const writeClipboard = vi.fn(async () => undefined)
    const generateImages = vi.fn(async () => [
      {
        blob: new Blob(['png'], { type: 'image/png' }),
        fileName: 'saved.png',
        width: 1080,
        height: 1350,
        page: {
          preset: 'mobile_4_5' as const,
          pageNumber: 1,
          totalPages: 1,
          tournamentName: '保存大会',
          sections: [],
        },
      },
    ])
    renderPage(memoryRepository(stored()), '/tournament-report?id=saved-1', {
      writeClipboard,
      generateImages,
    })
    await screen.findByDisplayValue('保存大会')
    fireEvent.click(screen.getByRole('button', { name: 'テキストをコピー' }))
    await waitFor(() =>
      expect(writeClipboard).toHaveBeenCalledWith(
        expect.stringContaining('保存大会'),
      ),
    )
    fireEvent.click(
      screen.getByRole('button', { name: '大会結果を画像にする' }),
    )
    expect(
      await screen.findByRole('dialog', { name: '大会結果画像' }),
    ).toBeVisible()
    expect(generateImages).toHaveBeenCalledWith(
      expect.objectContaining({ tournamentName: '保存大会' }),
      expect.any(Array),
      'mobile_4_5',
    )
  })

  it('does not silently replace a missing saved report', async () => {
    renderPage(memoryRepository(), '/tournament-report?id=missing')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '大会戦績が見つかりません',
    )
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })

  it('reports save failures without crashing', async () => {
    const repository = memoryRepository()
    vi.mocked(repository.createReport).mockRejectedValueOnce(
      new Error('failed'),
    )
    renderPage(repository)
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '保存できませんでした',
    )
  })
})
