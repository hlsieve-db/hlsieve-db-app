import { describe, expect, it } from 'vitest'

import type {
  DeckFolder,
  DeckOrganization,
  DeckTag,
} from '../deckOrganization/types'
import { createDeckBackupV2, type DeckBackupV2 } from './backup'
import {
  planDeckBackupV2Import,
  type DeckBackupV2ImportExisting,
} from './backupV2Import'
import type { Deck } from './types'

const AT = '2026-09-20T00:00:00.000Z'

function deck(id: string, overrides: Partial<Deck> = {}): Deck {
  return {
    id,
    name: `デッキ${id}`,
    entries: [{ cardNumber: 'CARD-001', quantity: 2 }],
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  }
}

function folder(id: string, name: string, sortOrder = 1): DeckFolder {
  return { id, name, sortOrder, createdAt: AT, updatedAt: AT }
}

function tag(id: string, name: string): DeckTag {
  return { id, name, createdAt: AT, updatedAt: AT }
}

function organization(
  deckId: string,
  overrides: Partial<DeckOrganization> = {},
): DeckOrganization {
  return {
    deckId,
    tagIds: [],
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  }
}

// A file can hold things the exporter would refuse to write, so some cases
// build the payload directly rather than through the validating builder.
function rawBackup(
  values: Partial<Omit<DeckBackupV2, 'format' | 'version'>> = {},
): DeckBackupV2 {
  return {
    format: 'hlsieve-deck-backup',
    version: 2,
    exportedAt: values.exportedAt ?? AT,
    decks: values.decks ?? [],
    folders: values.folders ?? [],
    tags: values.tags ?? [],
    organizations: values.organizations ?? [],
  }
}

function backup(
  values: Partial<Omit<DeckBackupV2, 'format' | 'version'>> = {},
) {
  return createDeckBackupV2(
    {
      decks: values.decks ?? [],
      folders: values.folders ?? [],
      tags: values.tags ?? [],
      organizations: values.organizations ?? [],
    },
    values.exportedAt ?? AT,
  )
}

const empty: DeckBackupV2ImportExisting = {
  decks: [],
  folders: [],
  tags: [],
  organizations: [],
}

function plan(
  file: DeckBackupV2,
  existing: Partial<DeckBackupV2ImportExisting> = {},
  ids: { deck?: () => string; folder?: () => string; tag?: () => string } = {},
) {
  const result = planDeckBackupV2Import(file, { ...empty, ...existing }, ids)
  if (!result.ok) throw new Error(`unexpected refusal: ${result.message}`)
  return result.plan
}

describe('importing a backup into an empty collection', () => {
  it('takes everything as it is', () => {
    const file = backup({
      decks: [deck('a')],
      folders: [folder('f1', '大会用')],
      tags: [tag('t1', '赤')],
      organizations: [organization('a', { folderId: 'f1', tagIds: ['t1'] })],
    })

    const result = plan(file)

    expect(result.decks.map((value) => value.id)).toEqual(['a'])
    expect(result.folders.map((value) => value.id)).toEqual(['f1'])
    expect(result.tags.map((value) => value.id)).toEqual(['t1'])
    expect(result.organizations).toEqual([
      organization('a', { folderId: 'f1', tagIds: ['t1'] }),
    ])
  })

  // Placed after what is already here, in the order the file gives.
  it('numbers imported folders after the ones already here', () => {
    const file = backup({
      folders: [folder('f2', '二番目', 5), folder('f1', '一番目', 2)],
    })

    const result = plan(file, { folders: [folder('own', '既存', 7)] })

    expect(result.folders.map((value) => [value.id, value.sortOrder])).toEqual([
      ['f1', 8],
      ['f2', 9],
    ])
  })
})

describe('importing the same file twice', () => {
  const file = backup({
    decks: [deck('a')],
    folders: [folder('f1', '大会用')],
    tags: [tag('t1', '赤')],
    organizations: [organization('a', { folderId: 'f1', tagIds: ['t1'] })],
  })

  const existing = {
    decks: [deck('a')],
    folders: [folder('f1', '大会用')],
    tags: [tag('t1', '赤')],
    organizations: [organization('a', { folderId: 'f1', tagIds: ['t1'] })],
  }

  it('adds nothing at all', () => {
    const result = plan(file, existing)

    expect(result.decks).toEqual([])
    expect(result.folders).toEqual([])
    expect(result.tags).toEqual([])
    expect(result.organizations).toEqual([])
  })

  it('says what it recognised rather than staying silent', () => {
    const result = plan(file, existing)

    expect(result.warnings.skippedDeckCount).toBe(1)
    expect(result.warnings.reusedFolderCount).toBe(1)
    expect(result.warnings.reusedTagCount).toBe(1)
    expect(result.warnings.skippedOrganizationCount).toBe(1)
    expect(result.identicalCount).toBe(1)
  })

  // The deck is already here without organization, so the file's is used.
  it('gives a skipped deck the organization it lacked', () => {
    const result = plan(file, { ...existing, organizations: [] })

    expect(result.organizations).toEqual([
      organization('a', { folderId: 'f1', tagIds: ['t1'] }),
    ])
    expect(result.warnings.skippedOrganizationCount).toBe(0)
  })
})

describe('names that are already taken', () => {
  it('numbers the imported one rather than merging it', () => {
    const file = backup({ folders: [folder('f1', '大会用')] })

    const result = plan(file, { folders: [folder('own', '大会用')] })

    expect(result.folders[0]?.name).toBe('大会用 (2)')
    expect(result.folders[0]?.id).toBe('f1')
    expect(result.warnings.renamedFolderCount).toBe(1)
  })

  it('keeps numbering as more arrive', () => {
    const file = backup({ folders: [folder('f1', '大会用')] })

    const result = plan(file, {
      folders: [folder('own', '大会用'), folder('own2', '大会用 (2)')],
    })

    expect(result.folders[0]?.name).toBe('大会用 (3)')
  })

  // Names are compared the way the rest of the app compares them.
  it('treats width and case as the same name', () => {
    const file = backup({ tags: [tag('t1', 'ABC')] })

    const result = plan(file, { tags: [tag('own', 'ａｂｃ')] })

    expect(result.tags[0]?.name).toBe('ABC (2)')
  })

  // The suffix is what tells them apart, so the name gives way instead.
  it('keeps the numbered name within the length limit', () => {
    const file = backup({ tags: [tag('t1', 'あ'.repeat(30))] })

    const result = plan(file, { tags: [tag('own', 'あ'.repeat(30))] })

    expect(result.tags[0]?.name).toHaveLength(30)
    expect(result.tags[0]?.name.endsWith(' (2)')).toBe(true)
  })

  // Same id, different name: a different record that happens to share an id.
  it('gives a new id to a folder whose id is taken by another name', () => {
    const file = backup({ folders: [folder('f1', '新しい')] })

    const result = plan(
      file,
      { folders: [folder('f1', '古い')] },
      { folder: () => 'generated' },
    )

    expect(result.folders[0]?.id).toBe('generated')
    expect(result.folders[0]?.name).toBe('新しい')
    expect(result.warnings.reusedFolderCount).toBe(0)
  })
})

describe('references that do not resolve', () => {
  it('drops an organization whose deck is not in the file', () => {
    const file = backup({ organizations: [organization('missing')] })

    const result = plan(file)

    expect(result.organizations).toEqual([])
    expect(result.warnings.orphanedOrganizationCount).toBe(1)
  })

  it('drops a folder the file does not define, and says which', () => {
    const file = backup({
      decks: [deck('a')],
      organizations: [organization('a', { folderId: 'gone' })],
    })

    const result = plan(file)

    expect(result.organizations[0]).toEqual(organization('a'))
    expect(result.warnings.missingFolderIds).toEqual(['gone'])
  })

  it('drops tags the file does not define, and says which', () => {
    const file = rawBackup({
      decks: [deck('a')],
      tags: [tag('t1', '赤')],
      organizations: [organization('a', { tagIds: ['t1', 'gone'] })],
    })

    const result = plan(file)

    expect(result.organizations[0]?.tagIds).toEqual(['t1'])
    expect(result.warnings.missingTagIds).toEqual(['gone'])
  })

  it('counts a tag listed twice', () => {
    const file = rawBackup({
      decks: [deck('a')],
      tags: [tag('t1', '赤')],
      organizations: [
        { ...organization('a'), tagIds: ['t1', 't1'] } as DeckOrganization,
      ],
    })

    const result = plan(file)

    expect(result.organizations[0]?.tagIds).toEqual(['t1'])
    expect(result.warnings.duplicateTagIdCount).toBe(1)
  })
})

describe('a deck with too many tags', () => {
  const tags = Array.from({ length: 11 }, (_, index) =>
    tag(`t${index + 1}`, `タグ${index + 1}`),
  )

  it('keeps the first ten by id rather than refusing the file', () => {
    const file = rawBackup({
      decks: [deck('a')],
      tags,
      organizations: [
        {
          ...organization('a'),
          tagIds: [...tags.map((value) => value.id)].sort(),
        } as DeckOrganization,
      ],
    })

    const result = plan(file)

    expect(result.organizations[0]?.tagIds).toEqual(
      [...tags.map((value) => value.id)].sort().slice(0, 10),
    )
    expect(result.warnings.truncatedTagOrganizationCount).toBe(1)
    expect(result.decks).toHaveLength(1)
  })
})

describe('a file that would take the collection over a limit', () => {
  // Refused as a result the screen can show, rather than thrown mid-preview.
  it('refuses too many folders without throwing', () => {
    const existing = Array.from({ length: 49 }, (_, index) =>
      folder(`own${index}`, `既存${index}`),
    )
    const file = backup({
      folders: [folder('f1', '一'), folder('f2', '二')],
    })

    const result = planDeckBackupV2Import(file, { ...empty, folders: existing })

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/フォルダー/)
  })

  it('refuses too many tags without throwing', () => {
    const existing = Array.from({ length: 100 }, (_, index) =>
      tag(`own${index}`, `既存${index}`),
    )
    const file = backup({ tags: [tag('t1', '赤')] })

    const result = planDeckBackupV2Import(file, { ...empty, tags: existing })

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/タグ/)
  })

  // Reuse does not count towards the limit, because nothing is added.
  it('allows a file that only repeats what is already here', () => {
    const existing = Array.from({ length: 50 }, (_, index) =>
      folder(`own${index}`, `既存${index}`),
    )
    const file = backup({ folders: [folder('own0', '既存0')] })

    const result = planDeckBackupV2Import(file, { ...empty, folders: existing })

    expect(result.ok).toBe(true)
  })
})

describe('decks that clash by id', () => {
  it('renames a different deck that holds the id', () => {
    const file = backup({
      decks: [deck('a', { name: 'ファイルの中身' })],
      organizations: [organization('a')],
    })

    const result = plan(
      file,
      { decks: [deck('a', { name: 'こちらの中身' })] },
      { deck: () => 'generated' },
    )

    expect(result.decks.map((value) => value.id)).toEqual(['generated'])
    expect(result.conflictCount).toBe(1)
    // The organization follows the deck it describes.
    expect(result.organizations[0]?.deckId).toBe('generated')
  })
})
