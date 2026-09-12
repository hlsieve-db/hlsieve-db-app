import { describe, expect, it, vi } from 'vitest'

import type { Card } from '../cards/types'
import { createDefaultTournamentReport } from './report'
import type { TournamentReportImageFile } from './renderImage'
import {
  buildTournamentShareFiles,
  buildTournamentShareText,
  buildTournamentShareTitle,
  buildTournamentXIntentUrl,
  shareTournamentReport,
  TOURNAMENT_REPORT_SHARE_URL,
  X_TWEET_INTENT_URL,
} from './share'
import type { TournamentReport } from './types'

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    cardNumber: 'MARINE-R',
    name: '宝鐘マリン',
    cardType: 'oshi',
    colors: ['red'],
    imageUrl: 'https://example.com/must-not-appear.png',
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
  makeCard({ cardNumber: 'MARINE-B', colors: ['blue'] }),
]

function makeReport(overrides: Partial<TournamentReport> = {}) {
  return { ...createDefaultTournamentReport(), ...overrides }
}

function makeImage(pageNumber = 1, totalPages = 1): TournamentReportImageFile {
  return {
    blob: new Blob(['png'], { type: 'image/png' }),
    fileName: `hlsieve-大会${totalPages > 1 ? `-${pageNumber}` : ''}.png`,
    width: 1080,
    height: 1350,
    page: {
      preset: 'mobile_4_5',
      pageNumber,
      totalPages,
      tournamentName: '大会',
      sections: [],
    },
  }
}

describe('tournament report sharing', () => {
  it('builds concise SNS text with identity and draw-aware summaries', () => {
    const text = buildTournamentShareText(
      makeReport({
        tournamentName: '○○杯',
        placement: '3位',
        selfOshiCardNumber: 'MARINE-R',
        swissRounds: [
          { result: 'win' },
          { result: 'loss' },
          { result: 'draw' },
        ],
        tournamentRounds: [{ result: 'win' }],
      }),
      cards,
    )

    expect(text).toContain('○○杯 3位')
    expect(text).toContain('使用推し：宝鐘マリン 【赤】')
    expect(text).toContain('Swiss 1-1-1')
    expect(text).toContain('Tournament 1-0')
    expect(text).toContain('HLSieve DB')
    expect(text).toContain('#ホロカ #HLSieveDB')
    expect(text).not.toContain('MARINE-R')
    expect(text).not.toContain('https://example.com')
    expect(text).not.toContain('R1')
    expect(text.length).toBeLessThan(280)
  })

  it('distinguishes same-name Oshi colors and omits missing summaries', () => {
    const text = buildTournamentShareText(
      makeReport({ selfOshiCardNumber: 'MARINE-B' }),
      cards,
    )
    expect(text).toContain('使用推し：宝鐘マリン 【青】')
    expect(text).not.toContain('Swiss')
    expect(text).not.toContain('Tournament')
  })

  it('builds a bounded share title with a blank-name fallback', () => {
    expect(buildTournamentShareTitle(makeReport())).toBe(
      '大会戦績 | HLSieve DB',
    )
    expect(
      buildTournamentShareTitle(
        makeReport({ tournamentName: '長'.repeat(100) }),
      ).length,
    ).toBeLessThanOrEqual(80)
  })

  it('builds an encoded X intent with the production report URL', () => {
    const intent = new URL(buildTournamentXIntentUrl('大会 結果\n#ホロカ'))
    expect(`${intent.origin}${intent.pathname}`).toBe(X_TWEET_INTENT_URL)
    expect(intent.searchParams.get('text')).toBe('大会 結果\n#ホロカ')
    expect(intent.searchParams.get('url')).toBe(TOURNAMENT_REPORT_SHARE_URL)
  })

  it('creates PNG Files with the existing generated filenames', () => {
    const files = buildTournamentShareFiles([makeImage()])
    expect(files[0]).toBeInstanceOf(File)
    expect(files[0]?.name).toBe('hlsieve-大会.png')
    expect(files[0]?.type).toBe('image/png')
  })

  it('shares a single PNG with title, text, and URL when supported', async () => {
    const share = vi.fn(async () => undefined)
    const canShare = vi.fn(() => true)
    const result = await shareTournamentReport({
      navigator: { share, canShare },
      title: '大会 | HLSieve DB',
      text: '大会結果',
      images: [makeImage()],
    })

    expect(result).toEqual({
      status: 'shared',
      includedImages: true,
      imageFallback: false,
    })
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '大会 | HLSieve DB',
        text: '大会結果',
        url: TOURNAMENT_REPORT_SHARE_URL,
        files: [expect.objectContaining({ type: 'image/png' })],
      }),
    )
  })

  it('shares every page only when multi-file sharing is supported', async () => {
    const share = vi.fn(async () => undefined)
    await shareTournamentReport({
      navigator: { share, canShare: () => true },
      title: 'title',
      text: 'text',
      images: [makeImage(1, 2), makeImage(2, 2)],
    })
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [
          expect.objectContaining({ name: 'hlsieve-大会-1.png' }),
          expect.objectContaining({ name: 'hlsieve-大会-2.png' }),
        ],
      }),
    )
  })

  it.each([
    ['multi-file unsupported', { canShare: () => false }],
    ['canShare unavailable', {}],
  ])(
    'falls back to text without silently dropping pages: %s',
    async (_name, api) => {
      const share = vi.fn(async () => undefined)
      const result = await shareTournamentReport({
        navigator: { share, ...api },
        title: 'title',
        text: 'text',
        images: [makeImage(1, 2), makeImage(2, 2)],
      })
      expect(result).toEqual({
        status: 'shared',
        includedImages: false,
        imageFallback: true,
      })
      expect(share).toHaveBeenCalledWith(
        expect.not.objectContaining({ files: expect.anything() }),
      )
    },
  )

  it('falls back to text when File construction fails', async () => {
    const share = vi.fn(async () => undefined)
    const result = await shareTournamentReport({
      navigator: { share, canShare: () => true },
      title: 'title',
      text: 'text',
      images: [makeImage()],
      createFile: () => {
        throw new Error('File unavailable')
      },
    })
    expect(result.status).toBe('shared')
    expect(share).toHaveBeenCalledWith(
      expect.not.objectContaining({ files: expect.anything() }),
    )
  })

  it('reports unsupported, cancellation, and non-cancellation errors safely', async () => {
    expect(
      await shareTournamentReport({
        navigator: {},
        title: 'title',
        text: 'text',
      }),
    ).toEqual({ status: 'unsupported' })

    const abortError = Object.assign(new Error('cancelled'), {
      name: 'AbortError',
    })
    expect(
      await shareTournamentReport({
        navigator: { share: vi.fn(async () => Promise.reject(abortError)) },
        title: 'title',
        text: 'text',
      }),
    ).toEqual({ status: 'cancelled' })

    const error = new Error('denied')
    expect(
      await shareTournamentReport({
        navigator: { share: vi.fn(async () => Promise.reject(error)) },
        title: 'title',
        text: 'text',
      }),
    ).toEqual({ status: 'error', error })
  })
})
