import { describe, expect, it } from 'vitest'

import {
  normalizeDeckRegulationId,
  sameDeckRegulation,
} from './deckRegulationId'

describe('reading the format a deck says it is built for', () => {
  // The two spellings of ordinary construction: nothing chose a format, and a
  // screen named the one that means no restriction.
  it('reads saying nothing as ordinary construction', () => {
    expect(normalizeDeckRegulationId()).toBe('standard')
    expect(normalizeDeckRegulationId(undefined)).toBe('standard')
    expect(normalizeDeckRegulationId('standard')).toBe('standard')
  })

  it('keeps a format it knows about', () => {
    expect(normalizeDeckRegulationId('selection-cup-2026-osaka')).toBe(
      'selection-cup-2026-osaka',
    )
  })

  // Folding this into ordinary construction would make a deck built for a
  // removed format compare equal to an unrestricted one, and syncing would
  // then discard the format it was built for.
  it('keeps an id this build does not define', () => {
    expect(normalizeDeckRegulationId('future-or-removed-rule')).toBe(
      'future-or-removed-rule',
    )
  })

  it('keeps an empty string apart from saying nothing', () => {
    expect(normalizeDeckRegulationId('')).toBe('')
  })
})

describe('whether two decks are built for the same format', () => {
  it('treats saying nothing and ordinary construction as the same', () => {
    expect(sameDeckRegulation(undefined, 'standard')).toBe(true)
    expect(sameDeckRegulation('standard', undefined)).toBe(true)
    expect(sameDeckRegulation(undefined, undefined)).toBe(true)
  })

  it('tells ordinary construction from a tournament format', () => {
    expect(sameDeckRegulation(undefined, 'selection-cup-2026-osaka')).toBe(
      false,
    )
    expect(sameDeckRegulation('standard', 'selection-cup-2026-osaka')).toBe(
      false,
    )
  })

  it('treats the same tournament format as the same', () => {
    expect(
      sameDeckRegulation(
        'selection-cup-2026-osaka',
        'selection-cup-2026-osaka',
      ),
    ).toBe(true)
  })

  it('tells two tournament formats apart', () => {
    expect(
      sameDeckRegulation('selection-cup-2026-osaka', 'selection-cup-2027'),
    ).toBe(false)
  })

  it('tells an unknown format from ordinary construction', () => {
    expect(sameDeckRegulation('future-or-removed-rule', undefined)).toBe(false)
    expect(sameDeckRegulation('future-or-removed-rule', 'standard')).toBe(false)
  })
})
