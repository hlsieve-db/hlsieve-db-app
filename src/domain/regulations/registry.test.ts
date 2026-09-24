import { describe, expect, it } from 'vitest'

import {
  normalizeDeckRegulationId,
  sameDeckRegulation,
} from './deckRegulationId'
import {
  getRegulation,
  hasRegulation,
  isRegulationActive,
  listRegulations,
  REGULATIONS,
} from './registry'
import {
  SELECTION_CUP_2026_AUTUMN,
  SELECTION_CUP_2026_AUTUMN_ID,
} from './selectionCup2026Autumn'
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
    expect(hasRegulation(SELECTION_CUP_2026_AUTUMN_ID)).toBe(true)
    expect(hasRegulation('selection-cup-2099')).toBe(false)
  })

  it('gives every format a distinct id', () => {
    const ids = REGULATIONS.map((regulation) => regulation.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // The id outlives the wording, so a rebrand does not invalidate decks.
  it('keeps the stable id apart from the display name', () => {
    expect(SELECTION_CUP_2026_AUTUMN_ID).toBe('selection-cup-2026-autumn')
    expect(getRegulation(SELECTION_CUP_2026_AUTUMN_ID).name).not.toBe(
      SELECTION_CUP_2026_AUTUMN_ID,
    )
  })
})

/**
 * Nothing stops two definitions claiming the same id, or one claiming another's.
 *
 * The registry is a map built from static definitions, so the last one declared
 * would quietly win and every deck naming that id would resolve to whichever
 * definition happened to be listed later. There is no runtime check for that:
 * these tests are the check, so a future clash fails here rather than silently
 * moving decks between formats.
 */
describe('ids across the whole registry', () => {
  const canonical = REGULATIONS.map((regulation) => regulation.id)
  const aliases = REGULATIONS.flatMap((regulation) =>
    (regulation.aliasIds ?? []).map((alias) => ({
      alias,
      owner: regulation.id,
    })),
  )

  it('gives every regulation its own id', () => {
    expect(new Set(canonical).size).toBe(canonical.length)
  })

  it('gives every superseded id to one regulation only', () => {
    const names = aliases.map((entry) => entry.alias)
    expect(new Set(names).size).toBe(names.length)
  })

  // Otherwise a deck would resolve to whichever definition the map happened to
  // be built from last.
  it('never reuses a live id as a superseded one', () => {
    const live = new Set(canonical)
    for (const { alias } of aliases) {
      expect(live.has(alias)).toBe(false)
    }
  })

  it('never lists a regulation own id as superseded', () => {
    for (const { alias, owner } of aliases) {
      expect(alias).not.toBe(owner)
    }
  })

  // Ordinary construction is the one id with a meaning of its own, and folding
  // it into a tournament format would take every unmarked deck with it.
  it('never treats ordinary construction as a superseded id', () => {
    for (const { alias } of aliases) {
      expect(alias).not.toBe(STANDARD_REGULATION_ID)
    }
  })

  it('leaves every declared id resolvable', () => {
    for (const id of [...canonical, ...aliases.map((entry) => entry.alias)]) {
      expect(hasRegulation(id)).toBe(true)
      expect(getRegulation(id)).toBeDefined()
    }
  })
})

describe('an id a definition has superseded', () => {
  const LEGACY = 'selection-cup-2026-osaka'

  it('resolves to the definition that replaced it', () => {
    expect(getRegulation(LEGACY)).toBe(SELECTION_CUP_2026_AUTUMN)
    expect(getRegulation(LEGACY).id).toBe(SELECTION_CUP_2026_AUTUMN_ID)
    expect(getRegulation(LEGACY).name).toBe('セレクションカップ 2026年9-10月')
  })

  it('normalizes to the current id', () => {
    expect(normalizeDeckRegulationId(LEGACY)).toBe('selection-cup-2026-autumn')
  })

  // The alias resolves; anything genuinely unknown still does not.
  it('leaves an id no definition claims alone', () => {
    expect(hasRegulation('future-or-removed-rule')).toBe(false)
    expect(normalizeDeckRegulationId('future-or-removed-rule')).toBe(
      'future-or-removed-rule',
    )
    expect(getRegulation('future-or-removed-rule')).toBe(STANDARD_REGULATION)
  })

  it('counts as a format this build knows', () => {
    expect(hasRegulation(LEGACY)).toBe(true)
  })

  // Otherwise the same deck saved either side of the correction would look like
  // two devices disagreeing about it.
  it('compares equal to the current id', () => {
    expect(normalizeDeckRegulationId(LEGACY)).toBe(SELECTION_CUP_2026_AUTUMN_ID)
    expect(sameDeckRegulation(LEGACY, SELECTION_CUP_2026_AUTUMN_ID)).toBe(true)
  })

  it('is still not ordinary construction', () => {
    expect(sameDeckRegulation(LEGACY, undefined)).toBe(false)
    expect(sameDeckRegulation(LEGACY, STANDARD_REGULATION_ID)).toBe(false)
  })

  // The old id is not something to choose, only something to understand.
  it('is not offered as a choice', () => {
    expect(
      listRegulations('2026-09-25').map((value) => value.id),
    ).not.toContain(LEGACY)
  })
})

describe('which formats are worth offering', () => {
  it('always offers ordinary construction', () => {
    expect(listRegulations('2020-01-01')).toContain(STANDARD_REGULATION)
    expect(listRegulations('2099-01-01')).toContain(STANDARD_REGULATION)
  })

  it('leaves out a format that has not started', () => {
    expect(listRegulations('2026-09-18').map((value) => value.id)).toEqual([
      STANDARD_REGULATION_ID,
    ])
  })

  it('offers it from the day it starts', () => {
    expect(listRegulations('2026-09-19').map((value) => value.id)).toContain(
      SELECTION_CUP_2026_AUTUMN_ID,
    )
  })

  // The event runs in two separate stretches, but the format is offered across
  // the gap: someone building for the October dates in late September needs it.
  it('offers it between the event s two stretches', () => {
    expect(listRegulations('2026-09-25').map((value) => value.id)).toContain(
      SELECTION_CUP_2026_AUTUMN_ID,
    )
  })

  it('offers it on its last day and not after', () => {
    expect(listRegulations('2026-10-31').map((value) => value.id)).toContain(
      SELECTION_CUP_2026_AUTUMN_ID,
    )
    expect(listRegulations('2026-11-01').map((value) => value.id)).toEqual([
      STANDARD_REGULATION_ID,
    ])
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
    expect(listRegulations('2026-09-25').map((value) => value.id)).toEqual(
      REGULATIONS.filter(
        (value) =>
          value.effectiveFrom === undefined ||
          value.effectiveFrom <= '2026-09-25',
      ).map((value) => value.id),
    )
  })

  // A deck built under a format that has ended still resolves; only the list
  // of things worth choosing shrinks.
  it('still finds a format that is no longer offered', () => {
    expect(getRegulation(SELECTION_CUP_2026_AUTUMN_ID).id).toBe(
      SELECTION_CUP_2026_AUTUMN_ID,
    )
  })
})
