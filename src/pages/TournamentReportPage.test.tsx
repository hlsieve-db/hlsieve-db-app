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
import type { TournamentReportImageFile } from '../domain/tournamentReport/renderImage'
import type { TournamentExportPreset } from '../domain/tournamentReport/imageReport'
import type { TournamentReport } from '../domain/tournamentReport/types'
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

type ImageTestOptions = {
  generateImages?: (
    report: TournamentReport,
    oshiCards: readonly Card[],
    preset: TournamentExportPreset,
  ) => Promise<TournamentReportImageFile[]>
  createObjectUrl?: (blob: Blob) => string
  revokeObjectUrl?: (url: string) => void
  downloadFile?: (url: string, fileName: string) => void
}

function renderPage(
  writeClipboard?: (text: string) => Promise<void>,
  imageOptions: ImageTestOptions = {},
) {
  return render(
    <MemoryRouter initialEntries={['/tournament-report']}>
      <TournamentReportPage
        loadCards={vi.fn(async () => cardData)}
        writeClipboard={writeClipboard}
        {...imageOptions}
      />
    </MemoryRouter>,
  )
}

function makeImageFile(
  pageNumber = 1,
  totalPages = 1,
  preset: TournamentExportPreset = 'mobile_4_5',
): TournamentReportImageFile {
  const isMobile = preset === 'mobile_4_5'
  return {
    blob: new Blob(['png'], { type: 'image/png' }),
    fileName: `hlsieve-大会${totalPages > 1 ? `-${pageNumber}` : ''}.png`,
    width: isMobile ? 1080 : 1600,
    height: isMobile ? 1350 : 900,
    page: {
      preset,
      pageNumber,
      totalPages,
      tournamentName: '大会',
      sections: [],
    },
  }
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

  it('shows the image export control and card-image exclusion notice', () => {
    renderPage()

    expect(screen.getByRole('radio', { name: /スマホ向け 4:5/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /横長 16:9/ })).not.toBeChecked()
    expect(screen.getByText('1080×1350')).toBeVisible()
    expect(screen.getByText('1600×900')).toBeVisible()
    expect(
      screen.getByRole('button', { name: '大会結果を画像にする' }),
    ).toBeDisabled()
    expect(
      screen.getByText(/現在、カード画像は出力画像に含まれません/),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'テキストをコピー' }),
    ).toBeVisible()
  })

  it('generates a preview, saves it, closes it, and revokes its object URL', async () => {
    const generateImages = vi.fn(async () => [makeImageFile()])
    const createObjectUrl = vi.fn(() => 'blob:report-page-1')
    const revokeObjectUrl = vi.fn()
    const downloadFile = vi.fn()
    renderPage(undefined, {
      generateImages,
      createObjectUrl,
      revokeObjectUrl,
      downloadFile,
    })
    fireEvent.change(screen.getByLabelText('大会名（必須）'), {
      target: { value: '大会' },
    })
    const exportButton = screen.getByRole('button', {
      name: '大会結果を画像にする',
    })
    expect(exportButton).toBeEnabled()
    fireEvent.click(exportButton)

    const dialog = await screen.findByRole('dialog', { name: '大会結果画像' })
    expect(generateImages).toHaveBeenCalledWith(
      expect.objectContaining({ tournamentName: '大会' }),
      expect.any(Array),
      'mobile_4_5',
    )
    expect(createObjectUrl).toHaveBeenCalledTimes(1)
    expect(
      within(dialog).getByRole('img', { name: '大会結果画像 1 / 1' }),
    ).toHaveAttribute('src', 'blob:report-page-1')
    expect(
      within(dialog).getByRole('img', { name: '大会結果画像 1 / 1' }),
    ).toHaveAttribute('width', '1080')
    expect(
      within(dialog).getByRole('img', { name: '大会結果画像 1 / 1' }),
    ).toHaveAttribute('height', '1350')
    expect(
      within(dialog).getByRole('button', {
        name: '1ページ目の大会結果画像を保存',
      }),
    ).toBeVisible()
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: '1ページ目の大会結果画像を保存',
      }),
    )
    expect(downloadFile).toHaveBeenCalledWith(
      'blob:report-page-1',
      'hlsieve-大会.png',
    )
    fireEvent.click(
      within(dialog).getByRole('button', { name: '画像プレビューを閉じる' }),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(revokeObjectUrl).toHaveBeenCalledWith('blob:report-page-1'),
    )
  })

  it('switches to 16:9 for one export and returns to 4:5 on remount', async () => {
    const generateImages = vi.fn(async () => [
      makeImageFile(1, 1, 'landscape_16_9'),
    ])
    const { unmount } = renderPage(undefined, {
      generateImages,
      createObjectUrl: vi.fn(() => 'blob:landscape'),
      revokeObjectUrl: vi.fn(),
    })
    fireEvent.click(screen.getByRole('radio', { name: /横長 16:9/ }))
    fireEvent.change(screen.getByLabelText('大会名（必須）'), {
      target: { value: '横長大会' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: '大会結果を画像にする' }),
    )

    const image = await screen.findByRole('img', { name: '大会結果画像 1 / 1' })
    expect(generateImages).toHaveBeenCalledWith(
      expect.objectContaining({ tournamentName: '横長大会' }),
      expect.any(Array),
      'landscape_16_9',
    )
    expect(image).toHaveAttribute('width', '1600')
    expect(image).toHaveAttribute('height', '900')

    unmount()
    renderPage()
    expect(screen.getByRole('radio', { name: /スマホ向け 4:5/ })).toBeChecked()
  })

  it('navigates and saves individual pages in a multi-page preview', async () => {
    const downloadFile = vi.fn()
    renderPage(undefined, {
      generateImages: vi.fn(async () => [
        makeImageFile(1, 2),
        makeImageFile(2, 2),
      ]),
      createObjectUrl: vi
        .fn()
        .mockReturnValueOnce('blob:page-1')
        .mockReturnValueOnce('blob:page-2'),
      revokeObjectUrl: vi.fn(),
      downloadFile,
    })
    fireEvent.change(screen.getByLabelText('順位'), {
      target: { value: '優勝' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: '大会結果を画像にする' }),
    )

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('1 / 2')).toBeVisible()
    expect(
      within(dialog).getByRole('button', { name: '前の画像' }),
    ).toBeDisabled()
    fireEvent.click(within(dialog).getByRole('button', { name: '次の画像' }))
    expect(within(dialog).getByText('2 / 2')).toBeVisible()
    expect(
      within(dialog).getByRole('img', { name: '大会結果画像 2 / 2' }),
    ).toHaveAttribute('src', 'blob:page-2')
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: '2ページ目の大会結果画像を保存',
      }),
    )
    expect(downloadFile).toHaveBeenCalledWith(
      'blob:page-2',
      'hlsieve-大会-2.png',
    )
  })

  it('announces image generation failures without opening an empty preview', async () => {
    renderPage(undefined, {
      generateImages: vi.fn(async () => Promise.reject(new Error('failed'))),
    })
    fireEvent.change(screen.getByLabelText('大会名（必須）'), {
      target: { value: '大会' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: '大会結果を画像にする' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '画像を作成できませんでした',
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes the image preview with Escape and restores focus', async () => {
    renderPage(undefined, {
      generateImages: vi.fn(async () => [makeImageFile()]),
      createObjectUrl: vi.fn(() => 'blob:page-1'),
      revokeObjectUrl: vi.fn(),
    })
    fireEvent.change(screen.getByLabelText('大会名（必須）'), {
      target: { value: '大会' },
    })
    const exportButton = screen.getByRole('button', {
      name: '大会結果を画像にする',
    })
    exportButton.focus()
    fireEvent.click(exportButton)
    expect(await screen.findByRole('dialog')).toBeVisible()
    expect(
      screen.getByRole('button', { name: '画像プレビューを閉じる' }),
    ).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(
      screen.getByRole('button', {
        name: '1ページ目の大会結果画像を保存',
      }),
    ).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(
      screen.getByRole('button', { name: '画像プレビューを閉じる' }),
    ).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(exportButton).toHaveFocus()
  })
})
