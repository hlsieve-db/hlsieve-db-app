import { describe, expect, it } from 'vitest'

import type { DeckFolder, DeckOrganization, DeckTag } from './types'
import {
  filterDecksByOrganization,
  folderNameForDeck,
  setDeckOrganizationFolder,
  sortTagsForDisplay,
  summarizeDeckFolders,
  tagsForOrganization,
  toggleDeckOrganizationTag,
  visibleTagsWithOverflow,
} from './operations'

const AT = '2026-09-20T00:00:00.000Z'
const LATER = '2026-09-21T00:00:00.000Z'

const deck = (id: string) => ({ id })

const folder = (id: string, name: string, sortOrder = 1): DeckFolder => ({
  id,
  name,
  sortOrder,
  createdAt: AT,
  updatedAt: AT,
})

const tag = (id: string, name: string): DeckTag => ({
  id,
  name,
  createdAt: AT,
  updatedAt: AT,
})

const organization = (
  deckId: string,
  overrides: Partial<DeckOrganization> = {},
): DeckOrganization => ({
  deckId,
  tagIds: [],
  createdAt: AT,
  updatedAt: AT,
  ...overrides,
})

describe('what the folder column counts', () => {
  const folders = [folder('f1', '大会用', 1), folder('f2', '練習用', 2)]

  it('counts every deck, the unfiled ones, and each folder', () => {
    const summaries = summarizeDeckFolders(
      [deck('a'), deck('b'), deck('c')],
      [
        organization('a', { folderId: 'f1' }),
        organization('b', { folderId: 'f1' }),
      ],
      folders,
    )

    expect(summaries.allCount).toBe(3)
    // c has no organization row at all.
    expect(summaries.unfiledCount).toBe(1)
    expect(
      summaries.folders.map((value) => [value.folder.id, value.deckCount]),
    ).toEqual([
      ['f1', 2],
      ['f2', 0],
    ])
  })

  // An explicitly cleared row is unfiled, the same as never having one.
  it('counts a deck whose row names no folder as unfiled', () => {
    const summaries = summarizeDeckFolders(
      [deck('a')],
      [organization('a', { tagIds: [] })],
      folders,
    )

    expect(summaries.unfiledCount).toBe(1)
  })

  // The column has nowhere else to show it, and the deck must stay reachable.
  it('counts a deck pointing at a folder that is gone as unfiled', () => {
    const summaries = summarizeDeckFolders(
      [deck('a')],
      [organization('a', { folderId: 'removed' })],
      folders,
    )

    expect(summaries.unfiledCount).toBe(1)
    expect(summaries.allCount).toBe(1)
  })

  it('lists the folders in the order the reporter arranged', () => {
    const summaries = summarizeDeckFolders(
      [],
      [],
      [folder('b', '二', 5), folder('a', '一', 2), folder('c', '三', 5)],
    )

    expect(summaries.folders.map((value) => value.folder.id)).toEqual([
      'a',
      'b',
      'c',
    ])
  })
})

describe('narrowing the list', () => {
  const decks = [deck('a'), deck('b'), deck('c')]
  const organizations = [
    organization('a', { folderId: 'f1', tagIds: ['t1', 't2'] }),
    organization('b', { folderId: 'f1', tagIds: ['t1'] }),
    organization('c', { tagIds: ['t2'] }),
  ]

  it('shows everything when nothing is selected', () => {
    expect(
      filterDecksByOrganization(decks, organizations, {
        folder: { kind: 'all' },
        tagIds: [],
      }),
    ).toEqual(decks)
  })

  it('shows one folder', () => {
    expect(
      filterDecksByOrganization(decks, organizations, {
        folder: { kind: 'folder', folderId: 'f1' },
        tagIds: [],
      }).map((value) => value.id),
    ).toEqual(['a', 'b'])
  })

  it('shows the decks in no folder', () => {
    expect(
      filterDecksByOrganization(decks, organizations, {
        folder: { kind: 'none' },
        tagIds: [],
      }).map((value) => value.id),
    ).toEqual(['c'])
  })

  // Every selected tag, not any of them.
  it('requires all of the selected tags', () => {
    expect(
      filterDecksByOrganization(decks, organizations, {
        folder: { kind: 'all' },
        tagIds: ['t1', 't2'],
      }).map((value) => value.id),
    ).toEqual(['a'])
  })

  it('combines a folder with the tags', () => {
    expect(
      filterDecksByOrganization(decks, organizations, {
        folder: { kind: 'folder', folderId: 'f1' },
        tagIds: ['t2'],
      }).map((value) => value.id),
    ).toEqual(['a'])
  })

  it('can leave nothing, which is not the same as no narrowing', () => {
    expect(
      filterDecksByOrganization(decks, organizations, {
        folder: { kind: 'none' },
        tagIds: ['t1'],
      }),
    ).toEqual([])
  })

  it('treats a deck pointing at a removed folder as unfiled', () => {
    const result = filterDecksByOrganization(
      [deck('a')],
      [organization('a', { folderId: 'removed' })],
      { folder: { kind: 'none' }, tagIds: [], folders: [folder('f1', '一')] },
    )

    expect(result.map((value) => value.id)).toEqual(['a'])
  })
})

describe('the tags a deck shows', () => {
  const tags = [tag('t2', 'ｂタグ'), tag('t1', 'Aタグ'), tag('t3', 'cタグ')]

  it('reads in name order, whatever order they are stored in', () => {
    expect(sortTagsForDisplay(tags).map((value) => value.id)).toEqual([
      't1',
      't2',
      't3',
    ])
  })

  it('names only the ones this deck carries', () => {
    expect(
      tagsForOrganization(
        organization('a', { tagIds: ['t3', 't1'] }),
        tags,
      ).map((value) => value.id),
    ).toEqual(['t1', 't3'])
  })

  it('names none for a deck with no row', () => {
    expect(tagsForOrganization(undefined, tags)).toEqual([])
  })

  // A narrow card shows a few and says how many it left out.
  it('leaves the rest out and counts them', () => {
    const three = sortTagsForDisplay(tags)

    expect(visibleTagsWithOverflow(three, 3)).toEqual({
      visible: three,
      overflowCount: 0,
    })
    expect(visibleTagsWithOverflow(three, 2)).toEqual({
      visible: three.slice(0, 2),
      overflowCount: 1,
    })
  })

  it('names the folder a deck is in, and nothing for one that is gone', () => {
    const folders = [folder('f1', '大会用')]

    expect(
      folderNameForDeck(organization('a', { folderId: 'f1' }), folders),
    ).toBe('大会用')
    expect(
      folderNameForDeck(organization('a', { folderId: 'gone' }), folders),
    ).toBeUndefined()
    expect(folderNameForDeck(undefined, folders)).toBeUndefined()
  })
})

describe('changing what one deck is organized by', () => {
  const definitions = {
    folders: [folder('f1', '大会用')],
    tags: [tag('t1', '赤'), tag('t2', '青')],
  }

  it('adds a tag to a deck that had none', () => {
    const result = toggleDeckOrganizationTag(
      undefined,
      { deckId: 'a', tagId: 't1' },
      definitions,
      () => LATER,
    )

    expect(result).toEqual({
      deckId: 'a',
      tagIds: ['t1'],
      createdAt: LATER,
      updatedAt: LATER,
    })
  })

  it('removes a tag, and keeps the row once it is empty', () => {
    const result = toggleDeckOrganizationTag(
      organization('a', { tagIds: ['t1'] }),
      { deckId: 'a', tagId: 't1' },
      definitions,
      () => LATER,
    )

    expect(result.tagIds).toEqual([])
    // Cleared by the reporter, which is not the same as never organized.
    expect(result.createdAt).toBe(AT)
    expect(result.updatedAt).toBe(LATER)
  })

  it('keeps the stored order however the tags were added', () => {
    const result = toggleDeckOrganizationTag(
      organization('a', { tagIds: ['t2'] }),
      { deckId: 'a', tagId: 't1' },
      definitions,
      () => LATER,
    )

    expect(result.tagIds).toEqual(['t1', 't2'])
  })

  it('leaves the folder alone', () => {
    const result = toggleDeckOrganizationTag(
      organization('a', { folderId: 'f1' }),
      { deckId: 'a', tagId: 't1' },
      definitions,
      () => LATER,
    )

    expect(result.folderId).toBe('f1')
  })

  it('refuses a tag past the limit rather than dropping one', () => {
    const tags = Array.from({ length: 10 }, (_, index) =>
      tag(`x${index}`, `タグ${index}`),
    )

    expect(() =>
      toggleDeckOrganizationTag(
        organization('a', { tagIds: tags.map(({ id }) => id).sort() }),
        { deckId: 'a', tagId: 't1' },
        { folders: definitions.folders, tags: [...tags, tag('t1', '赤')] },
        () => LATER,
      ),
    ).toThrow()
  })

  it('moves a deck into a folder and back out', () => {
    const inFolder = setDeckOrganizationFolder(
      organization('a', { tagIds: ['t1'] }),
      { deckId: 'a', folderId: 'f1' },
      definitions,
      () => LATER,
    )
    expect(inFolder.folderId).toBe('f1')
    expect(inFolder.tagIds).toEqual(['t1'])

    const cleared = setDeckOrganizationFolder(
      inFolder,
      { deckId: 'a' },
      definitions,
      () => LATER,
    )
    expect(cleared.folderId).toBeUndefined()
    expect('folderId' in cleared).toBe(false)
  })

  it('refuses a folder nothing defines', () => {
    expect(() =>
      setDeckOrganizationFolder(
        undefined,
        { deckId: 'a', folderId: 'gone' },
        definitions,
        () => LATER,
      ),
    ).toThrow()
  })
})
