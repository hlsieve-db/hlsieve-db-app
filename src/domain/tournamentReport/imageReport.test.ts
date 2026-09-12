import { describe, expect, it } from 'vitest'

import type { Card } from '../cards/types'
import {
  buildTournamentReportImageFileName,
  buildTournamentReportImagePages,
  sanitizeTournamentReportFileName,
  TOURNAMENT_REPORT_ROWS_PER_PAGE,
} from './imageReport'
import { createDefaultTournamentReport } from './report'
import type { TournamentReport, TournamentRound } from './types'

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    cardNumber: 'MARINE-R',
    name: '宝鐘マリン',
    cardType: 'oshi',
    colors: ['red'],
    imageUrl: 'https://example.com/never-render.png',
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
  makeCard({ cardNumber: 'AZKI-G', name: 'AZKi', colors: ['green'] }),
]

function makeReport(
  overrides: Partial<TournamentReport> = {},
): TournamentReport {
  return { ...createDefaultTournamentReport(), ...overrides }
}

function rounds(count: number, result: TournamentRound['result'] = 'win') {
  return Array.from({ length: count }, (_, index): TournamentRound => ({
    opponentOshiCardNumber: index % 2 === 0 ? 'MARINE-B' : 'AZKI-G',
    playOrder: index % 2 === 0 ? 'first' : 'second',
    initiativeChoiceResult: index % 2 === 0 ? 'won_choice' : 'lost_choice',
    result,
  }))
}

describe('buildTournamentReportImagePages', () => {
  it('builds header, summaries, same-name Oshi colors, and all round fields', () => {
    const pages = buildTournamentReportImagePages(
      makeReport({
        tournamentName: 'ホロカ大会',
        placement: '優勝',
        participantCount: 128,
        eventDate: '2026-09-12',
        selfOshiCardNumber: 'MARINE-R',
        swissRounds: [
          {
            opponentOshiCardNumber: 'MARINE-B',
            playOrder: 'first',
            initiativeChoiceResult: 'won_choice',
            result: 'win',
          },
          {
            opponentOshiCardNumber: 'AZKI-G',
            playOrder: 'second',
            initiativeChoiceResult: 'lost_choice',
            result: 'draw',
          },
          { result: 'loss' },
        ],
        tournamentRounds: [{ result: 'win' }],
      }),
      cards,
    )

    expect(pages).toHaveLength(1)
    expect(pages[0]).toMatchObject({
      tournamentName: 'ホロカ大会',
      placement: '優勝',
      selfOshi: '宝鐘マリン 【赤】',
      participantCount: '128人',
      eventDate: '2026/09/12',
      pageNumber: 1,
      totalPages: 1,
    })
    expect(pages[0].sections[0]).toMatchObject({
      heading: 'Swiss',
      summary: '1-1-1',
    })
    expect(pages[0].sections[0].rounds).toEqual([
      {
        label: 'R1',
        opponent: '宝鐘マリン 【青】',
        playOrder: '先攻',
        initiative: '⚀○',
        result: '○ WIN',
      },
      {
        label: 'R2',
        opponent: 'AZKi',
        playOrder: '後攻',
        initiative: '⚀×',
        result: '△ DRAW',
      },
      {
        label: 'R3',
        opponent: '',
        playOrder: '',
        initiative: '',
        result: '× LOSE',
      },
    ])
    expect(pages[0].sections[1]).toMatchObject({
      heading: 'Tournament',
      summary: '1-0',
    })
  })

  it('keeps five Swiss rounds on one page', () => {
    expect(
      buildTournamentReportImagePages(
        makeReport({ tournamentName: '大会', swissRounds: rounds(5) }),
        cards,
      ),
    ).toHaveLength(1)
  })

  it('keeps five Swiss and four tournament rounds on one page', () => {
    expect(
      buildTournamentReportImagePages(
        makeReport({
          tournamentName: '大会',
          swissRounds: rounds(5),
          tournamentRounds: rounds(4, 'loss'),
        }),
        cards,
      ),
    ).toHaveLength(1)
  })

  it('paginates the maximum 14 rounds without dropping rows', () => {
    const pages = buildTournamentReportImagePages(
      makeReport({
        tournamentName: '最大大会',
        selfOshiCardNumber: 'MARINE-R',
        swissRounds: rounds(10),
        tournamentRounds: rounds(4, 'draw'),
      }),
      cards,
    )

    expect(pages).toHaveLength(2)
    expect(pages.map((page) => page.pageNumber)).toEqual([1, 2])
    expect(pages.every((page) => page.totalPages === 2)).toBe(true)
    expect(
      pages.flatMap((page) =>
        page.sections.flatMap((section) => section.rounds),
      ),
    ).toHaveLength(14)
    expect(
      pages.every(
        (page) =>
          page.sections.reduce(
            (count, section) => count + section.rounds.length,
            0,
          ) <= TOURNAMENT_REPORT_ROWS_PER_PAGE,
      ),
    ).toBe(true)
    expect(pages[1]).toMatchObject({
      tournamentName: '最大大会',
      selfOshi: '宝鐘マリン 【赤】',
      pageNumber: 2,
      totalPages: 2,
    })
    expect(pages[1].sections.map((section) => section.heading)).toEqual([
      'Swiss',
      'Tournament',
    ])
  })

  it('omits empty rounds but retains partially populated rounds and numbering', () => {
    const [page] = buildTournamentReportImagePages(
      makeReport({
        tournamentName: '大会',
        swissRounds: [{}, { playOrder: 'second' }, {}],
      }),
      cards,
    )

    expect(page.sections[0].rounds).toEqual([
      {
        label: 'R2',
        opponent: '',
        playOrder: '後攻',
        initiative: '',
        result: '',
      },
    ])
    expect(page.sections[0].summary).toBeUndefined()
  })

  it('returns no pages for an empty report and omits missing fields', () => {
    expect(
      buildTournamentReportImagePages(createDefaultTournamentReport(), cards),
    ).toEqual([])
    const [page] = buildTournamentReportImagePages(
      makeReport({ placement: '3位' }),
      cards,
    )
    expect(page).toMatchObject({
      tournamentName: '大会戦績レポート',
      placement: '3位',
    })
    expect(page.selfOshi).toBeUndefined()
    expect(page.participantCount).toBeUndefined()
    expect(page.eventDate).toBeUndefined()
  })
})

describe('tournament report image filenames', () => {
  it('sanitizes filesystem-unsafe characters', () => {
    expect(
      sanitizeTournamentReportFileName(' 大会 / \\ : * ? " < > | ... '),
    ).toBe('大会 - - - - - - - - -')
  })

  it('uses single and multi-page filenames with an empty-name fallback', () => {
    expect(buildTournamentReportImageFileName('○○杯', 1, 1)).toBe(
      'hlsieve-○○杯.png',
    )
    expect(buildTournamentReportImageFileName('○○杯', 2, 3)).toBe(
      'hlsieve-○○杯-2.png',
    )
    expect(buildTournamentReportImageFileName('', 1, 1)).toBe(
      'hlsieve-tournament-report.png',
    )
  })
})
