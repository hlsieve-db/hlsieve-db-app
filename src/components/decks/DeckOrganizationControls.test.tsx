import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { summarizeDeckFolders } from '../../domain/deckOrganization/operations'
import type {
  DeckFolder,
  DeckOrganization,
  DeckTag,
} from '../../domain/deckOrganization/types'
import { DeckFolderSidebar } from './DeckFolderSidebar'
import { DeckOrganizationDialog } from './DeckOrganizationDialog'
import { DeckOrganizationManager } from './DeckOrganizationManager'
import { DeckTagFilterChips } from './DeckTagFilterChips'

const AT = '2026-09-20T00:00:00.000Z'

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

describe('the folder control', () => {
  const summaries = summarizeDeckFolders(
    [{ id: 'a' }, { id: 'b' }],
    [organization('a', { folderId: 'f1' })],
    [folder('f1', '大会用'), folder('f2', '練習用', 2)],
  )

  it('offers everything, the unfiled decks, and each folder with its count', () => {
    render(
      <DeckFolderSidebar
        summaries={summaries}
        selected={{ kind: 'all' }}
        onSelect={vi.fn()}
      />,
    )

    const column = screen.getByRole('navigation', {
      name: 'フォルダーで絞り込む',
    })
    expect(
      within(column).getByRole('button', { name: 'すべて 2件' }),
    ).toBeVisible()
    expect(
      within(column).getByRole('button', { name: 'フォルダーなし 1件' }),
    ).toBeVisible()
    expect(
      within(column).getByRole('button', { name: '大会用 1件' }),
    ).toBeVisible()
    expect(
      within(column).getByRole('button', { name: '練習用 0件' }),
    ).toBeVisible()
  })

  it('marks the one in use', () => {
    render(
      <DeckFolderSidebar
        summaries={summaries}
        selected={{ kind: 'folder', folderId: 'f1' }}
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: '大会用 1件' })).toHaveAttribute(
      'aria-current',
      'true',
    )
    expect(
      screen.getByRole('button', { name: 'すべて 2件' }),
    ).not.toHaveAttribute('aria-current')
  })

  it('reports the folder that was chosen', () => {
    const onSelect = vi.fn()
    render(
      <DeckFolderSidebar
        summaries={summaries}
        selected={{ kind: 'all' }}
        onSelect={onSelect}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '大会用 1件' }))
    expect(onSelect).toHaveBeenCalledWith({ kind: 'folder', folderId: 'f1' })

    fireEvent.click(screen.getByRole('button', { name: 'フォルダーなし 1件' }))
    expect(onSelect).toHaveBeenLastCalledWith({ kind: 'none' })
  })

  /**
   * The same choice is offered twice, as a column and as a select, and the
   * stylesheet shows one of them. A script that measured the width instead
   * would have to guess before the first paint.
   */
  it('offers the same choice as a select for narrow screens', () => {
    const onSelect = vi.fn()
    render(
      <DeckFolderSidebar
        summaries={summaries}
        selected={{ kind: 'all' }}
        onSelect={onSelect}
      />,
    )

    const select = screen.getByLabelText('フォルダー')
    fireEvent.change(select, { target: { value: 'f2' } })

    expect(onSelect).toHaveBeenCalledWith({ kind: 'folder', folderId: 'f2' })
    expect(select).toHaveTextContent('練習用（0）')
  })
})

describe('the tag chips above the list', () => {
  it('reads in name order and reports what was toggled', () => {
    const onToggle = vi.fn()
    render(
      <DeckTagFilterChips
        tags={[tag('t2', 'ｂタグ'), tag('t1', 'Aタグ')]}
        selectedTagIds={['t1']}
        onToggle={onToggle}
      />,
    )

    const boxes = screen.getAllByRole('checkbox')
    expect(boxes.map((box) => box.closest('label')?.textContent)).toEqual([
      'Aタグ',
      'ｂタグ',
    ])
    expect(boxes[0]).toBeChecked()

    fireEvent.click(boxes[1] as HTMLElement)
    expect(onToggle).toHaveBeenCalledWith('t2')
  })

  it('shows nothing at all when no tag exists', () => {
    const { container } = render(
      <DeckTagFilterChips tags={[]} selectedTagIds={[]} onToggle={vi.fn()} />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})

describe('the dialog one deck is organized in', () => {
  function renderDialog(overrides: Record<string, unknown> = {}) {
    const onSave = vi.fn()
    const onClose = vi.fn()
    render(
      <DeckOrganizationDialog
        deckName="テストデッキ"
        organization={organization('deck-1', {
          folderId: 'f1',
          tagIds: ['t1'],
        })}
        folders={[folder('f1', '大会用'), folder('f2', '練習用', 2)]}
        tags={[tag('t1', '赤'), tag('t2', '青')]}
        onSave={onSave}
        onClose={onClose}
        {...overrides}
      />,
    )
    return { onSave, onClose }
  }

  it('opens on what the deck is organized by now', () => {
    renderDialog()

    expect(screen.getByLabelText('フォルダー')).toHaveValue('f1')
    expect(screen.getByRole('checkbox', { name: '赤' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: '青' })).not.toBeChecked()
  })

  // Folders and tags stay on this device, which nothing else on screen says.
  it('says that folders and tags are not synced', () => {
    renderDialog()

    expect(
      screen.getByText(
        'フォルダーとタグはこの端末にのみ保存されます。ほかの端末には同期されません。',
      ),
    ).toBeVisible()
  })

  it('reports the folder and tags that were chosen', () => {
    const { onSave } = renderDialog()

    fireEvent.change(screen.getByLabelText('フォルダー'), {
      target: { value: 'f2' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: '青' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(onSave).toHaveBeenCalledWith({
      folderId: 'f2',
      tagIds: ['t1', 't2'],
    })
  })

  it('reports no folder at all when that is what was chosen', () => {
    const { onSave } = renderDialog()

    fireEvent.change(screen.getByLabelText('フォルダー'), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(onSave).toHaveBeenCalledWith({ tagIds: ['t1'] })
  })

  // Nothing is written until the reporter saves.
  it('writes nothing when it is closed', () => {
    const { onSave, onClose } = renderDialog()

    fireEvent.click(screen.getByRole('checkbox', { name: '青' }))
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(onSave).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape, like the other sheets', () => {
    const { onClose } = renderDialog()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalled()
  })

  it('keeps the page behind it from scrolling while it is open', () => {
    renderDialog()
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('stops at the tag limit rather than dropping one on save', () => {
    const tags = Array.from({ length: 11 }, (_, index) =>
      tag(`t${index}`, `タグ${index}`),
    )
    renderDialog({
      tags,
      organization: organization('deck-1', {
        tagIds: tags.slice(0, 10).map(({ id }) => id),
      }),
    })

    expect(screen.getByRole('checkbox', { name: 'タグ10' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'タグ0' })).toBeEnabled()
  })
})

describe('the folder and tag manager', () => {
  const summaries = summarizeDeckFolders(
    [{ id: 'a' }],
    [organization('a', { folderId: 'f1', tagIds: ['t1'] })],
    [folder('f1', '大会用'), folder('f2', '練習用', 2)],
  )

  function renderManager(overrides: Record<string, unknown> = {}) {
    const handlers = {
      onCreateFolder: vi.fn(),
      onRenameFolder: vi.fn(),
      onMoveFolder: vi.fn(),
      onDeleteFolder: vi.fn(),
      onCreateTag: vi.fn(),
      onRenameTag: vi.fn(),
      onDeleteTag: vi.fn(),
    }
    render(
      <DeckOrganizationManager
        summaries={summaries}
        tags={[tag('t1', '赤')]}
        tagDeckCounts={new Map([['t1', 1]])}
        {...handlers}
        {...overrides}
      />,
    )
    return handlers
  }

  it('says that folders and tags stay on this device', () => {
    renderManager()

    expect(
      screen.getByText(
        'フォルダーとタグはこの端末にのみ保存されます。ほかの端末には同期されません。',
      ),
    ).toBeVisible()
  })

  it('creates a folder and a tag by name', () => {
    const handlers = renderManager()

    fireEvent.change(screen.getByLabelText('新しいフォルダー名'), {
      target: { value: '新フォルダー' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'フォルダーを追加' }))
    expect(handlers.onCreateFolder).toHaveBeenCalledWith('新フォルダー')

    fireEvent.change(screen.getByLabelText('新しいタグ名'), {
      target: { value: '青' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'タグを追加' }))
    expect(handlers.onCreateTag).toHaveBeenCalledWith('青')
  })

  it('will not create one with no name', () => {
    renderManager()

    expect(
      screen.getByRole('button', { name: 'フォルダーを追加' }),
    ).toBeDisabled()
  })

  it('renames a folder', () => {
    const handlers = renderManager()

    fireEvent.click(screen.getByRole('button', { name: '大会用の名前を変更' }))
    fireEvent.change(screen.getByLabelText('大会用の新しい名前'), {
      target: { value: '本番用' },
    })
    fireEvent.click(screen.getByRole('button', { name: '名前を保存' }))

    expect(handlers.onRenameFolder).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'f1' }),
      '本番用',
    )
  })

  it('moves a folder, and offers no move past either end', () => {
    const handlers = renderManager()

    expect(
      screen.getByRole('button', { name: '大会用を上へ移動' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: '練習用を下へ移動' }),
    ).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '大会用を下へ移動' }))
    expect(handlers.onMoveFolder).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'f1' }),
      'down',
    )
  })

  // One reorder writes every folder, so a second one mid-write would race it.
  it('offers no move at all while a reorder is being written', () => {
    renderManager({
      reordering: true,
      summaries: summarizeDeckFolders(
        [],
        [],
        [folder('f1', '一', 1), folder('f2', '二', 2), folder('f3', '三', 3)],
      ),
    })

    expect(screen.getByRole('button', { name: '二を上へ移動' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '二を下へ移動' })).toBeDisabled()
  })

  it('asks before deleting a folder, and says the decks stay', () => {
    const handlers = renderManager()

    fireEvent.click(screen.getByRole('button', { name: '大会用を削除' }))
    const confirmation = screen.getByRole('alertdialog', {
      name: 'フォルダー削除の確認',
    })
    expect(confirmation).toHaveTextContent(
      'このフォルダーの1件のデッキからフォルダーが外れます。デッキは削除されません。',
    )

    fireEvent.click(
      within(confirmation).getByRole('button', { name: 'キャンセル' }),
    )
    expect(handlers.onDeleteFolder).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '大会用を削除' }))
    fireEvent.click(screen.getByRole('button', { name: '削除する' }))
    expect(handlers.onDeleteFolder).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'f1' }),
    )
  })

  it('asks before deleting a tag, and says how many decks carry it', () => {
    const handlers = renderManager()

    fireEvent.click(screen.getByRole('button', { name: '赤を削除' }))
    const confirmation = screen.getByRole('alertdialog', {
      name: 'タグ削除の確認',
    })
    expect(confirmation).toHaveTextContent(
      'このタグが付いた1件のデッキからタグが外れます。デッキは削除されません。',
    )

    fireEvent.click(
      within(confirmation).getByRole('button', { name: '削除する' }),
    )
    expect(handlers.onDeleteTag).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1' }),
    )
  })

  it('stops offering new folders at the limit', () => {
    const many = Array.from({ length: 50 }, (_, index) =>
      folder(`f${index}`, `フォルダー${index}`, index),
    )
    renderManager({ summaries: summarizeDeckFolders([], [], many) })

    fireEvent.change(screen.getByLabelText('新しいフォルダー名'), {
      target: { value: 'もう一つ' },
    })
    expect(
      screen.getByRole('button', { name: 'フォルダーを追加' }),
    ).toBeDisabled()
    expect(screen.getByText('フォルダーは50個までです。')).toBeVisible()
  })
})
