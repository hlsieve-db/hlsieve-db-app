import { describe, expect, it } from 'vitest'

import type { DeckFolder, DeckOrganization, DeckTag } from './types'
import {
  assertUniqueOrganizationName,
  canonicalizeTagIds,
  isDeckFolder,
  isDeckOrganization,
  isDeckTag,
  normalizeOrganizationNameForComparison,
  normalizeTagIds,
  organizationNameForStorage,
} from './validation'

const AT = '2026-09-20T00:00:00.000Z'

const folder = (overrides: Partial<DeckFolder> = {}): DeckFolder => ({
  id: 'f1',
  name: '大会用',
  sortOrder: 1,
  createdAt: AT,
  updatedAt: AT,
  ...overrides,
})

const tag = (overrides: Partial<DeckTag> = {}): DeckTag => ({
  id: 't1',
  name: '赤',
  createdAt: AT,
  updatedAt: AT,
  ...overrides,
})

const organization = (
  overrides: Partial<DeckOrganization> = {},
): DeckOrganization => ({
  deckId: 'deck-1',
  tagIds: [],
  createdAt: AT,
  updatedAt: AT,
  ...overrides,
})

describe('what a folder or tag name may be', () => {
  it('is stored without surrounding space', () => {
    expect(organizationNameForStorage('  大会用  ')).toBe('大会用')
  })

  it('refuses a name that is only space, or none at all', () => {
    expect(isDeckFolder(folder({ name: '   ' }))).toBe(false)
    expect(isDeckFolder(folder({ name: '' }))).toBe(false)
  })

  // Stored trimmed, so a value carrying space never reaches the store.
  it('refuses a name that was not trimmed before storing', () => {
    expect(isDeckFolder(folder({ name: ' 大会用' }))).toBe(false)
  })

  it('allows a folder name up to fifty characters and no further', () => {
    expect(isDeckFolder(folder({ name: 'あ'.repeat(50) }))).toBe(true)
    expect(isDeckFolder(folder({ name: 'あ'.repeat(51) }))).toBe(false)
  })

  it('allows a tag name up to thirty characters and no further', () => {
    expect(isDeckTag(tag({ name: 'あ'.repeat(30) }))).toBe(true)
    expect(isDeckTag(tag({ name: 'あ'.repeat(31) }))).toBe(false)
  })
})

describe('when two names count as the same', () => {
  it('ignores case and width', () => {
    expect(normalizeOrganizationNameForComparison('ＡＢＣ')).toBe(
      normalizeOrganizationNameForComparison('abc'),
    )
  })

  it('ignores half-width kana against full-width', () => {
    expect(normalizeOrganizationNameForComparison('ﾀｸﾞ')).toBe(
      normalizeOrganizationNameForComparison('タグ'),
    )
  })

  it('refuses a name already in use', () => {
    expect(() => assertUniqueOrganizationName('大会用', ['大会用'])).toThrow()
    expect(() => assertUniqueOrganizationName('ABC', ['ａｂｃ'])).toThrow()
  })

  it('allows a name nothing else holds', () => {
    expect(() =>
      assertUniqueOrganizationName('大会用', ['練習用']),
    ).not.toThrow()
  })
})

describe('the tags on one deck', () => {
  // Stored in one order so two devices that added the same tags do not look
  // like they disagree. What the reporter sees is sorted by name elsewhere.
  it('are stored in id order, without repeats', () => {
    expect(canonicalizeTagIds(['t3', 't1', 't3', 't2'])).toEqual([
      't1',
      't2',
      't3',
    ])
  })

  it('are refused by the store when out of that order', () => {
    expect(isDeckOrganization(organization({ tagIds: ['t2', 't1'] }))).toBe(
      false,
    )
    expect(isDeckOrganization(organization({ tagIds: ['t1', 't2'] }))).toBe(
      true,
    )
  })

  it('are refused past ten', () => {
    const tagIds = Array.from({ length: 11 }, (_, index) => `t${index + 1}`)
    expect(isDeckOrganization(organization({ tagIds }))).toBe(false)
  })

  it('drop the ones no tag defines when asked to', () => {
    const result = normalizeTagIds(['t1', 'gone'], {
      existingTagIds: new Set(['t1']),
      missing: 'drop',
    })

    expect(result).toEqual({
      ok: true,
      tagIds: ['t1'],
      missingTagIds: ['gone'],
    })
  })

  it('refuse the whole list when a tag is missing and that matters', () => {
    expect(
      normalizeTagIds(['gone'], {
        existingTagIds: new Set(['t1']),
        missing: 'reject',
      }),
    ).toEqual({ ok: false, reason: 'missing-tag' })
  })

  it('refuse a list longer than the limit', () => {
    const tagIds = Array.from({ length: 11 }, (_, index) => `t${index + 1}`)

    expect(
      normalizeTagIds(tagIds, {
        existingTagIds: new Set(tagIds),
        missing: 'drop',
      }),
    ).toEqual({ ok: false, reason: 'too-many-tags' })
  })
})

describe('an organization row', () => {
  // Having none and having an empty one are different facts about a deck.
  it('may exist with no folder and no tags', () => {
    expect(isDeckOrganization(organization())).toBe(true)
  })

  it('refuses an empty folder id rather than treating it as none', () => {
    expect(isDeckOrganization(organization({ folderId: '' }))).toBe(false)
  })
})
