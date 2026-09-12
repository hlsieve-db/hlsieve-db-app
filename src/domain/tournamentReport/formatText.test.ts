import { describe, expect, it } from 'vitest'

import type { Card } from '../cards/types'
import {
  formatTournamentReportText,
  hasTournamentReportTextContent,
} from './formatText'
import { createDefaultTournamentReport } from './report'
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

const marineRed = makeCard()
const marineBlue = makeCard({ cardNumber: 'MARINE-B', colors: ['blue'] })
const azki = makeCard({
  cardNumber: 'AZKI-G',
  name: 'AZKi',
  colors: ['green'],
})
const oshiCards = [marineRed, marineBlue, azki]

function makeReport(
  overrides: Partial<TournamentReport> = {},
): TournamentReport {
  return { ...createDefaultTournamentReport(), ...overrides }
}

describe('formatTournamentReportText', () => {
  it('formats a complete reusable plain-text report', () => {
    const text = formatTournamentReportText(
      makeReport({
        tournamentName: '○○杯',
        placement: '3位',
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
        tournamentRounds: [
          { playOrder: 'second', result: 'win' },
          { result: 'loss' },
        ],
      }),
      oshiCards,
    )

    expect(text).toBe(
      [
        '○○杯\n3位\n参加人数：128人\n開催日：2026/09/12',
        '使用推し：宝鐘マリン 【赤】',
        'Swiss 1-1-1\nR1 宝鐘マリン 【青】 先攻 ⚀○ WIN\nR2 AZKi 後攻 ⚀× DRAW\nR3 LOSE',
        'Tournament 1-1\nT1 後攻 WIN\nT2 LOSE',
        'HLSieve DB',
      ].join('\n\n'),
    )
  })

  it('omits optional and missing fields without undefined placeholders', () => {
    const text = formatTournamentReportText(
      makeReport({
        tournamentName: '交流会',
        swissRounds: [{}, { opponentOshiCardNumber: 'AZKI-G', result: 'win' }],
      }),
      oshiCards,
    )

    expect(text).toBe('交流会\n\nSwiss 1-0\nR2 AZKi WIN\n\nHLSieve DB')
    expect(text).not.toContain('R1')
    expect(text).not.toContain('undefined')
    expect(text).not.toContain('未入力')
  })

  it('keeps draw-free summaries in the existing win-loss form', () => {
    expect(
      formatTournamentReportText(
        makeReport({ swissRounds: [{ result: 'win' }, { result: 'loss' }] }),
        oshiCards,
      ),
    ).toContain('Swiss 1-1')
  })

  it('omits fully empty round sections and returns empty text for an empty report', () => {
    const empty = makeReport({ swissRounds: [{}], tournamentRounds: [{}] })

    expect(hasTournamentReportTextContent(empty)).toBe(false)
    expect(formatTournamentReportText(empty, oshiCards)).toBe('')
  })

  it('never includes card identity, images, or printing data in output', () => {
    const text = formatTournamentReportText(
      makeReport({ selfOshiCardNumber: 'MARINE-R' }),
      oshiCards,
    )

    expect(text).toBe('使用推し：宝鐘マリン 【赤】\n\nHLSieve DB')
    expect(text).not.toContain('MARINE-R')
    expect(text).not.toContain('https://')
    expect(text).not.toContain('image')
  })

  it('normalizes whitespace and has no trailing newline', () => {
    const text = formatTournamentReportText(
      makeReport({ tournamentName: '  大会名  ', placement: '  優勝  ' }),
      oshiCards,
    )

    expect(text).toBe('大会名\n優勝\n\nHLSieve DB')
    expect(text).not.toMatch(/\n{3,}/)
    expect(text.endsWith('\n')).toBe(false)
  })
})
