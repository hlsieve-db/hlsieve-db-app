import { describe, expect, it } from 'vitest'

import {
  getRegulation,
  hasRegulation,
  isRegulationActive,
  listRegulations,
  REGULATIONS,
} from './registry'
import { SELECTION_CUP_2026_OSAKA_ID } from './selectionCup2026Osaka'
import { STANDARD_REGULATION, STANDARD_REGULATION_ID } from './standard'

describe('finding a format by id', () => {
  it('finds each one the app knows about', () => {
    for (const regulation of REGULATIONS) {
      expect(getRegulation(regulation.id)).toBe(regulation)
    }
  })

  // A deck that says nothing about its format is an ordinary deck, which is
  // what every deck made before formats existed says.
  it('treats saying nothing as ordinary construction', () => {
    expect(getRegulation()).toBe(STANDARD_REGULATION)
    expect(getRegulation(undefined)).toBe(STANDARD_REGULATION)
    expect(getRegulation(STANDARD_REGULATION_ID)).toBe(STANDARD_REGULATION)
  })

  // A definition this build does not have would otherwise make every card in
  // the deck look illegal, which is a broken deck rather than a missing rule.
  it('falls back to ordinary construction for a format it does not know', () => {
    expect(getRegulation('selection-cup-2099')).toBe(STANDARD_REGULATION)
    expect(getRegulation('')).toBe(STANDARD_REGULATION)
  })

  // The fallback is safe but silent, so a screen can tell the two apart.
  it('says whether the fallback was a real match', () => {
    expect(hasRegulation()).toBe(true)
    expect(hasRegulation(STANDARD_REGULATION_ID)).toBe(true)
    expect(hasRegulation(SELECTION_CUP_2026_OSAKA_ID)).toBe(true)
    expect(hasRegulation('selection-cup-2099')).toBe(false)
  })

  it('gives every format a distinct id', () => {
    const ids = REGULATIONS.map((regulation) => regulation.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // The id outlives the wording, so a rebrand does not invalidate decks.
  it('keeps the stable id apart from the display name', () => {
    expect(SELECTION_CUP_2026_OSAKA_ID).toBe('selection-cup-2026-osaka')
    expect(getRegulation(SELECTION_CUP_2026_OSAKA_ID).name).not.toBe(
      SELECTION_CUP_2026_OSAKA_ID,
    )
  })
})

describe('which formats are worth offering', () => {
  it('always offers ordinary construction', () => {
    expect(listRegulations('2020-01-01')).toContain(STANDARD_REGULATION)
    expect(listRegulations('2099-01-01')).toContain(STANDARD_REGULATION)
  })

  it('leaves out a format that has not started', () => {
    expect(listRegulations('2026-08-28').map((value) => value.id)).toEqual([
      STANDARD_REGULATION_ID,
    ])
  })

  it('offers it from the day it starts', () => {
    expect(listRegulations('2026-08-29').map((value) => value.id)).toContain(
      SELECTION_CUP_2026_OSAKA_ID,
    )
  })

  // Both bounds count as inside, so a format is offered on its last day and
  // not on the day after.
  it('runs from its first day to its last, inclusive', () => {
    const limited = {
      id: 'limited',
      name: '期間限定',
      effectiveFrom: '2026-01-10',
      effectiveTo: '2026-01-31',
    }

    expect(isRegulationActive(limited, '2026-01-09')).toBe(false)
    expect(isRegulationActive(limited, '2026-01-10')).toBe(true)
    expect(isRegulationActive(limited, '2026-01-31')).toBe(true)
    expect(isRegulationActive(limited, '2026-02-01')).toBe(false)
  })

  it('always applies when it names no dates', () => {
    const always = { id: 'always', name: 'いつでも' }

    expect(isRegulationActive(always, '1999-01-01')).toBe(true)
    expect(isRegulationActive(always, '2099-01-01')).toBe(true)
  })

  it('keeps the declared order', () => {
    expect(listRegulations('2026-09-24').map((value) => value.id)).toEqual(
      REGULATIONS.filter(
        (value) =>
          value.effectiveFrom === undefined ||
          value.effectiveFrom <= '2026-09-24',
      ).map((value) => value.id),
    )
  })

  // A deck built under a format that has ended still resolves; only the list
  // of things worth choosing shrinks.
  it('still finds a format that is no longer offered', () => {
    expect(getRegulation(SELECTION_CUP_2026_OSAKA_ID).id).toBe(
      SELECTION_CUP_2026_OSAKA_ID,
    )
  })
})
