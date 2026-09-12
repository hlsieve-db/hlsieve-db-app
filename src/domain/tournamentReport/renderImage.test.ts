import { describe, expect, it, vi } from 'vitest'

import type { Card } from '../cards/types'
import {
  TOURNAMENT_REPORT_IMAGE_HEIGHT,
  TOURNAMENT_REPORT_IMAGE_WIDTH,
} from './imageReport'
import {
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
  return { canvas, context, factory, operations, text }
}

describe('generateTournamentReportImages', () => {
  it('generates a non-empty 1600x900 PNG with Japanese and result symbols', async () => {
    const harness = createCanvasHarness()
    const [file] = await generateTournamentReportImages(
      report,
      [makeCard()],
      harness.factory,
    )

    expect(harness.factory).toHaveBeenCalledWith(1600, 900)
    expect(harness.canvas.width).toBe(TOURNAMENT_REPORT_IMAGE_WIDTH)
    expect(harness.canvas.height).toBe(TOURNAMENT_REPORT_IMAGE_HEIGHT)
    expect(file.blob.type).toBe('image/png')
    expect(file.blob.size).toBeGreaterThan(0)
    expect(file.width).toBe(1600)
    expect(file.height).toBe(900)
    const renderedText = harness.text.join(' ')
    for (const expected of [
      '日本語大会',
      '優勝',
      '使用推し：宝鐘マリン',
      '⚀○',
      '⚀×',
      '○ WIN',
      '△ DRAW',
      '× LOSE',
      'HLSieve DB',
      'hlsieve.com',
    ]) {
      expect(renderedText).toContain(expected)
    }
  })

  it('does not fetch or draw Card.imageUrl', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const harness = createCanvasHarness()
    await generateTournamentReportImages(report, [makeCard()], harness.factory)

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(harness.text.join(' ')).not.toContain('https://')
    expect(harness.text.join(' ')).not.toContain('remote-card-image')
    expect('drawImage' in harness.context).toBe(false)
    fetchSpy.mockRestore()
  })

  it('uses the same fixed drawing operations regardless of app theme', async () => {
    document.documentElement.dataset.theme = 'light'
    const light = createCanvasHarness()
    await generateTournamentReportImages(report, [makeCard()], light.factory)
    document.documentElement.dataset.theme = 'dark'
    const dark = createCanvasHarness()
    await generateTournamentReportImages(report, [makeCard()], dark.factory)

    expect(dark.operations).toEqual(light.operations)
  })

  it('wraps a long tournament title without drawing it outside the header', async () => {
    const harness = createCanvasHarness()
    const longTitle = '長い大会名'.repeat(25)
    await generateTournamentReportImages(
      { ...report, tournamentName: longTitle },
      [makeCard()],
      harness.factory,
    )

    const titleFragments = harness.text.filter((text) =>
      text.includes('長い大会名'),
    )
    expect(titleFragments).toHaveLength(2)
    expect(titleFragments.join('')).toBe(longTitle)
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
      generateTournamentReportImages(report, [makeCard()], noContext),
    ).rejects.toThrow('Canvas 2D context is unavailable.')

    const harness = createCanvasHarness()
    harness.canvas.toBlob = vi.fn((callback: BlobCallback) => callback(null))
    await expect(
      generateTournamentReportImages(report, [makeCard()], harness.factory),
    ).rejects.toThrow('PNG image generation failed.')
  })
})
