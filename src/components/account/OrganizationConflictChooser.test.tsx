import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type {
  DeckOrganizationConflict,
  DeckOrganizationReconciliationPlan,
} from '../../cloud/deckOrganizationReconciliation'
import type { DeckFolder, DeckTag } from '../../domain/deckOrganization/types'
import { OrganizationConflictChooser } from './OrganizationConflictChooser'

const AT = '2026-09-27T00:00:00.000Z'

const folder = (id: string, name: string, sortOrder = 0): DeckFolder => ({
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
  overrides: Partial<{ folderId: string; tagIds: string[] }> = {},
) => ({
  deckId,
  tagIds: overrides.tagIds ?? [],
  ...(overrides.folderId === undefined ? {} : { folderId: overrides.folderId }),
  createdAt: AT,
  updatedAt: AT,
})

function planWith(
  conflicts: DeckOrganizationConflict[],
  extras: Partial<DeckOrganizationReconciliationPlan> = {},
): DeckOrganizationReconciliationPlan {
  return {
    folders: {
      localOnly: [],
      cloudOnly: [],
      identical: [],
      reordered: [],
      tombstoned: [],
      ...extras.folders,
    },
    tags: {
      localOnly: [],
      cloudOnly: [],
      identical: [],
      tombstoned: [],
      ...extras.tags,
    },
    organizations: {
      localOnly: [],
      cloudOnly: [],
      identical: [],
      tombstoned: [],
      orphaned: [],
      normalizations: [],
      ...extras.organizations,
    },
    conflicts,
    cloudRowCount: extras.cloudRowCount ?? conflicts.length,
  }
}

const folderConflict: DeckOrganizationConflict = {
  kind: 'folder-name',
  id: 'f1',
  localFolder: folder('f1', '大会用'),
  cloudFolder: folder('f1', '本番用'),
  localDeckCount: 5,
  cloudDeckCount: 3,
}

const tagConflict: DeckOrganizationConflict = {
  kind: 'tag-name',
  id: 't1',
  localTag: tag('t1', '赤'),
  cloudTag: tag('t1', 'レッド'),
  localDeckCount: 2,
  cloudDeckCount: 0,
}

const assignmentConflict: DeckOrganizationConflict = {
  kind: 'organization-assignment',
  id: 'deck-1',
  localOrganization: organization('deck-1', {
    folderId: 'f1',
    tagIds: ['t1', 't2'],
  }),
  cloudOrganization: organization('deck-1', { folderId: 'f2' }),
}

const tombstoneConflict: DeckOrganizationConflict = {
  kind: 'organization-tombstone',
  id: 'deck-2',
  localOrganization: organization('deck-2', { tagIds: ['t1'] }),
}

function renderChooser(
  plan: DeckOrganizationReconciliationPlan,
  overrides: Partial<Parameters<typeof OrganizationConflictChooser>[0]> = {},
) {
  const onChoose = vi.fn()
  const onApply = vi.fn()
  const onCancel = vi.fn()
  render(
    <OrganizationConflictChooser
      plan={plan}
      resolutions={{}}
      folders={[folder('f1', '大会用'), folder('f2', '練習用', 1)]}
      tags={[tag('t1', '赤'), tag('t2', 'ｚ青')]}
      onChoose={onChoose}
      onApply={onApply}
      onCancel={onCancel}
      {...overrides}
    />,
  )
  return { onChoose, onApply, onCancel }
}

describe('how the differences are laid out', () => {
  it('says how many there are in total, and how many are answered', () => {
    renderChooser(planWith([folderConflict, tagConflict]), {
      resolutions: { 'folder-name:f1': 'local' },
    })

    expect(
      screen.getByText(/内容が異なる項目が2件あります（1件を選択済み）/),
    ).toBeVisible()
  })

  // Definitions first: the name chosen for a folder is what the assignments
  // below are then described with.
  it('groups them by kind with a count, definitions first', () => {
    renderChooser(
      planWith([
        assignmentConflict,
        tagConflict,
        folderConflict,
        tombstoneConflict,
      ]),
    )

    expect(
      screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent),
    ).toEqual([
      'フォルダー名（1件）',
      'タグ名（1件）',
      'デッキの整理（1件）',
      'クラウドで削除された整理情報（1件）',
    ])
  })

  it('leaves out a kind with nothing in it', () => {
    renderChooser(planWith([folderConflict]))

    expect(screen.queryByText(/タグ名/)).toBeNull()
  })
})

/**
 * A folder or a tag offers nothing to compare but its name, so each side is
 * shown with how many decks it affects: without that, the choice is between two
 * words.
 */
describe('what each side of a folder or tag says', () => {
  it('names both sides with the decks they affect', () => {
    renderChooser(planWith([folderConflict]))

    expect(
      screen.getByText(
        'この端末: 大会用（5件のデッキ） / クラウド: 本番用（3件のデッキ）',
      ),
    ).toBeVisible()
  })

  it('does the same for a tag', () => {
    renderChooser(planWith([tagConflict]))

    expect(
      screen.getByText(
        'この端末: 赤（2件のデッキ） / クラウド: レッド（0件のデッキ）',
      ),
    ).toBeVisible()
  })
})

describe('what an assignment difference says', () => {
  it('describes both sides by name, with the tags in reading order', () => {
    renderChooser(planWith([assignmentConflict]))

    expect(
      // Read in name order, which puts a latin-initial tag before a kanji one.
      screen.getByText('この端末: 大会用 ・ ｚ青、赤 / クラウド: 練習用'),
    ).toBeVisible()
  })

  it('says when a deck is in no folder at all', () => {
    renderChooser(
      planWith([
        {
          ...assignmentConflict,
          localOrganization: organization('deck-1', { tagIds: [] }),
        },
      ]),
    )

    expect(
      screen.getByText('この端末: フォルダーなし / クラウド: 練習用'),
    ).toBeVisible()
  })

  it('says plainly that the account deleted one', () => {
    renderChooser(planWith([tombstoneConflict]))

    expect(
      screen.getByText('この端末: フォルダーなし ・ 赤 / クラウド: 削除済み'),
    ).toBeVisible()
  })
})

describe('choosing', () => {
  it('reports the choice under a key naming the kind and the id', () => {
    const { onChoose } = renderChooser(planWith([folderConflict]))

    fireEvent.click(screen.getByRole('radio', { name: 'クラウドの名前を使う' }))

    expect(onChoose).toHaveBeenCalledWith('folder-name:f1', 'cloud')
  })

  it('offers the wording each kind needs', () => {
    renderChooser(planWith([tombstoneConflict]))

    expect(
      screen.getByRole('radio', { name: 'この端末の整理情報を残す' }),
    ).toBeVisible()
    expect(
      screen.getByRole('radio', { name: 'クラウド側の削除を反映' }),
    ).toBeVisible()
  })

  // Unlike the deck chooser, an unanswered item is simply left alone, so there
  // is nothing to block.
  it('can be applied with some left unanswered', () => {
    const { onApply } = renderChooser(planWith([folderConflict, tagConflict]))

    fireEvent.click(screen.getByRole('button', { name: '選択した内容で続行' }))

    expect(onApply).toHaveBeenCalled()
    expect(screen.getByText(/選ばなかった項目は変更されません/)).toBeVisible()
  })

  it('changes nothing while it is being applied', () => {
    renderChooser(planWith([folderConflict]), { applying: true })

    expect(
      screen.getByRole('radio', { name: 'この端末の名前を使う' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: '適用中…' })).toBeDisabled()
  })

  it('can be put off', () => {
    const { onCancel } = renderChooser(planWith([folderConflict]))

    fireEvent.click(screen.getByRole('button', { name: 'あとで' }))

    expect(onCancel).toHaveBeenCalled()
  })
})

/**
 * Neither of these is a choice. A deleted folder stays deleted, and a reference
 * that cannot resolve cannot be stored, so both are stated rather than asked.
 */
describe('what is told rather than asked', () => {
  it('says how many folders and tags the account deleted', () => {
    renderChooser(
      planWith([folderConflict], {
        folders: {
          localOnly: [],
          cloudOnly: [],
          identical: [],
          reordered: [],
          tombstoned: ['f9'],
        },
        tags: {
          localOnly: [],
          cloudOnly: [],
          identical: [],
          tombstoned: ['t9'],
        },
      }),
    )

    expect(
      screen.getByText(
        /クラウドで削除されたフォルダー・タグ2件を、この端末からも外します/,
      ),
    ).toBeVisible()
  })

  it('says how many assignments it had to trim', () => {
    renderChooser(
      planWith([folderConflict], {
        organizations: {
          localOnly: [],
          cloudOnly: [],
          identical: [],
          tombstoned: [],
          orphaned: [],
          normalizations: [{ deckId: 'deck-1', droppedTagIds: ['gone'] }],
        },
      }),
    )

    expect(
      screen.getByText(/見つからないフォルダー・タグの割り当て1件を外します/),
    ).toBeVisible()
  })

  it('says neither when there is nothing to say', () => {
    renderChooser(planWith([folderConflict]))

    expect(screen.queryByText(/この端末からも外します/)).toBeNull()
    expect(screen.queryByText(/割り当て/)).toBeNull()
  })

  it('keeps each item in its own group', () => {
    renderChooser(planWith([folderConflict, tagConflict]))

    const folderGroup = screen
      .getByRole('heading', { level: 4, name: 'フォルダー名（1件）' })
      .closest('section') as HTMLElement

    expect(within(folderGroup).getAllByText(/大会用/).length).toBeGreaterThan(0)
    expect(within(folderGroup).queryByText(/レッド/)).toBeNull()
  })
})
