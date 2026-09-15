import { describe, expect, it, vi } from 'vitest'

import type { Card } from '../cards/types'
import {
  buildTournamentReportImagePages,
  DEFAULT_TOURNAMENT_EXPORT_PRESET,
  TOURNAMENT_EXPORT_PRESETS,
} from './imageReport'
import {
  drawTournamentReportImagePage,
  generateTournamentReportImages,
  type TournamentReportCanvasFactory,
} from './renderImage'
import type { TournamentReport } from './types'

function makeCard(): Card {
  return {
    cardNumber: 'OSHI-001',
    name: '宝鐘マリン',
    cardType: 'oshi',
    colors: ['red'],
    imageUrl: 'https://example.com/remote-card-image.png',
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

const report: TournamentReport = {
  tournamentName: '日本語大会',
  placement: '優勝',
  participantCount: 16,
  eventDate: '2026-09-16',
  selfOshiCardNumber: 'OSHI-001',
  swissRounds: [
    {
      opponentOshiCardNumber: 'OSHI-001',
      playOrder: 'first',
      initiativeChoiceResult: 'won_choice',
      result: 'win',
    },
    { initiativeChoiceResult: 'lost_choice', result: 'draw' },
    { result: 'loss' },
  ],
  tournamentRounds: [],
}

function createCanvasHarness() {
  const text: string[] = []
  const styledText: { value: string; color: string }[] = []
  const operations: string[] = []
  const context = {
    fillStyle: '',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillRect: (x: number, y: number, width: number, height: number) => {
      operations.push(`rect:${x}:${y}:${width}:${height}`)
    },
    fillText: (value: string, x: number, y: number) => {
      text.push(value)
      styledText.push({ value, color: String(context.fillStyle) })
      operations.push(`text:${value}:${x}:${y}`)
    },
    measureText: (value: string) => ({ width: Array.from(value).length * 16 }),
  } as unknown as CanvasRenderingContext2D
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toBlob: vi.fn((callback: BlobCallback, type?: string) => {
      callback(new Blob(['valid-png'], { type: type ?? 'image/png' }))
    }),
  } as unknown as HTMLCanvasElement
  const factory: TournamentReportCanvasFactory = vi.fn(() => canvas)
  return { canvas, context, factory, operations, styledText, text }
}

describe('generateTournamentReportImages', () => {
  it('generates a non-empty default 1080x1350 PNG with Japanese and symbols', async () => {
    const harness = createCanvasHarness()
    const [file] = await generateTournamentReportImages(report, [makeCard()], {
      createCanvas: harness.factory,
    })

    expect(DEFAULT_TOURNAMENT_EXPORT_PRESET).toBe('mobile_4_5')
    expect(harness.factory).toHaveBeenCalledWith(1080, 1350)
    expect(harness.canvas.width).toBe(1080)
    expect(harness.canvas.height).toBe(1350)
    expect(file.blob.type).toBe('image/png')
    expect(file.blob.size).toBeGreaterThan(0)
    expect(file.width).toBe(1080)
    expect(file.height).toBe(1350)
    expect(file.page.preset).toBe('mobile_4_5')
    const renderedText = harness.text.join(' ')
    for (const expected of [
      '大会成績',
      '日本語大会',
      '優勝',
      '参加人数 16人',
      '開催日 2026/09/16',
      '使用推し',
      '宝鐘マリン',
      'RECORD',
      '1-1-1',
      'MATCHES — 全3戦',
      '対戦相手 / 使用推し',
      '先後',
      '手番選択',
      '結果',
      '○',
      '×',
      '○ WIN',
      '△ DRAW',
      '× LOSE',
      'HLSieve DB',
      'hlsieve.com',
    ]) {
      expect(renderedText).toContain(expected)
    }
    expect(renderedText).not.toContain('非公式ファンメイドツール')
    expect(renderedText).not.toContain('TOURNAMENT REPORT')
  })

  it('keeps the explicit landscape preset at 1600x900', async () => {
    const harness = createCanvasHarness()
    const [file] = await generateTournamentReportImages(report, [makeCard()], {
      preset: 'landscape_16_9',
      createCanvas: harness.factory,
    })

    expect(TOURNAMENT_EXPORT_PRESETS.landscape_16_9).toMatchObject({
      width: 1600,
      height: 900,
    })
    expect(harness.factory).toHaveBeenCalledWith(1600, 900)
    expect(file).toMatchObject({
      width: 1600,
      height: 900,
      page: { preset: 'landscape_16_9' },
    })
    expect(harness.text).toContain('TOURNAMENT REPORT')
    expect(harness.text).toContain('非公式ファンメイドツール')
  })

  it('renders the 4:5 header as four readable information levels', async () => {
    const harness = createCanvasHarness()
    await generateTournamentReportImages(report, [makeCard()], {
      createCanvas: harness.factory,
    })

    const yFor = (value: string) => {
      const operation = harness.operations.find((item) =>
        item.startsWith(`text:${value}:`),
      )
      expect(operation).toBeDefined()
      return Number(operation?.split(':').at(-1))
    }

    expect(yFor('大会成績')).toBeLessThan(yFor('日本語大会'))
    expect(yFor('日本語大会')).toBeLessThan(yFor('使用推し'))
    expect(yFor('使用推し')).toBeLessThan(yFor('宝鐘マリン'))
  })

  it('keeps maximum-case rows inside both preset content areas', () => {
    const maximumReport: TournamentReport = {
      ...report,
      swissRounds: Array.from({ length: 10 }, () => ({ result: 'win' })),
      tournamentRounds: Array.from({ length: 4 }, () => ({ result: 'draw' })),
    }
    for (const preset of ['mobile_4_5', 'landscape_16_9'] as const) {
      const rowWidth = preset === 'mobile_4_5' ? 984 : 1472
      const rowHeight = preset === 'mobile_4_5' ? 72 : 50
      const footerTop = preset === 'mobile_4_5' ? 1270 : 840
      const pages = buildTournamentReportImagePages(
        maximumReport,
        [makeCard()],
        preset,
      )
      for (const page of pages) {
        const harness = createCanvasHarness()
        drawTournamentReportImagePage(harness.context, page)
        const rowBottoms = harness.operations
          .filter((operation) =>
            operation.endsWith(`:${rowWidth}:${rowHeight}`),
          )
          .map((operation) => Number(operation.split(':')[2]) + rowHeight)
        expect(rowBottoms).toHaveLength(
          page.sections.reduce(
            (count, section) => count + section.rounds.length,
            0,
          ),
        )
        expect(Math.max(...rowBottoms)).toBeLessThan(footerTop)
      }
    }
  })

  it('uses the fixed 4:5 result colors without changing result text', async () => {
    const harness = createCanvasHarness()
    await generateTournamentReportImages(report, [makeCard()], {
      createCanvas: harness.factory,
    })

    expect(harness.styledText).toEqual(
      expect.arrayContaining([
        { value: '○ WIN', color: '#c62828' },
        { value: '△ DRAW', color: '#222222' },
        { value: '× LOSE', color: '#1565c0' },
      ]),
    )
  })

  it('does not fetch or draw Card.imageUrl', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const harness = createCanvasHarness()
    await generateTournamentReportImages(report, [makeCard()], {
      createCanvas: harness.factory,
    })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(harness.text.join(' ')).not.toContain('https://')
    expect(harness.text.join(' ')).not.toContain('remote-card-image')
    expect('drawImage' in harness.context).toBe(false)
    fetchSpy.mockRestore()
  })

  it('uses the same fixed drawing operations regardless of app theme', async () => {
    document.documentElement.dataset.theme = 'light'
    const light = createCanvasHarness()
    await generateTournamentReportImages(report, [makeCard()], {
      createCanvas: light.factory,
    })
    document.documentElement.dataset.theme = 'dark'
    const dark = createCanvasHarness()
    await generateTournamentReportImages(report, [makeCard()], {
      createCanvas: dark.factory,
    })

    expect(dark.operations).toEqual(light.operations)
  })

  it('wraps a long tournament title without drawing it outside the header', async () => {
    const harness = createCanvasHarness()
    const longTitle = '長い大会名'.repeat(25)
    await generateTournamentReportImages(
      { ...report, tournamentName: longTitle },
      [makeCard()],
      { createCanvas: harness.factory },
    )

    const titleFragments = harness.text.filter((text) =>
      text.includes('長い大会名'),
    )
    expect(titleFragments).toHaveLength(2)
    expect(titleFragments.join('').endsWith('…')).toBe(true)
  })

  it('rejects unavailable contexts and null PNG blobs', async () => {
    const noContext = vi.fn(
      () =>
        ({
          width: 0,
          height: 0,
          getContext: () => null,
        }) as unknown as HTMLCanvasElement,
    )
    await expect(
      generateTournamentReportImages(report, [makeCard()], {
        createCanvas: noContext,
      }),
    ).rejects.toThrow('Canvas 2D context is unavailable.')

    const harness = createCanvasHarness()
    harness.canvas.toBlob = vi.fn((callback: BlobCallback) => callback(null))
    await expect(
      generateTournamentReportImages(report, [makeCard()], {
        createCanvas: harness.factory,
      }),
    ).rejects.toThrow('PNG image generation failed.')
  })
})
