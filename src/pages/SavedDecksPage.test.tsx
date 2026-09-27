import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { Deck } from '../domain/decks/types'
import {
  createDeckBackup,
  MAX_DECK_BACKUP_FILE_SIZE,
  serializeDeckBackup,
} from '../domain/decks/backup'
import { createDeckBackupV2 } from '../domain/decks/backup'
import type {
  DeckFolder,
  DeckOrganization,
  DeckTag,
} from '../domain/deckOrganization/types'
import type { DeckFolderRepository } from '../repositories/deckFolderRepository'
import type { DeckOrganizationRepository } from '../repositories/deckOrganizationRepository'
import type { DeckTagRepository } from '../repositories/deckTagRepository'
import type { CloudSyncedDeckRepository } from '../cloud/cloudSyncedDeckRepository'
import { AppDatabaseBlockedError } from '../repositories/appDatabase'
import type { DeckVersionRepository } from '../repositories/deckVersionRepository'
import { withDeckVersionCascade } from '../repositories/deckVersionCascade'
import { SavedDecksPage } from './SavedDecksPage'

function deck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: 'deck-1',
    name: 'テストデッキ',
    entries: [{ cardNumber: 'CARD-001', quantity: 3 }],
    createdAt: '2026-09-08T00:00:00.000Z',
    updatedAt: '2026-09-08T01:00:00.000Z',
    ...overrides,
  }
}

function repository(
  overrides: Partial<CloudSyncedDeckRepository> = {},
): CloudSyncedDeckRepository {
  return {
    listDecks: vi.fn(async () => []),
    getDeck: vi.fn(async () => undefined),
    saveDeck: vi.fn(async () => undefined),
    deleteDeck: vi.fn(async () => undefined),
    importDecks: vi.fn(async () => undefined),
    duplicateDeck: vi.fn(async () => undefined),
    importOrganizationBackup: vi.fn(async () => undefined),
    ...overrides,
  }
}

function Location() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}</output>
}

function emptyVersionRepository(
  overrides: Partial<DeckVersionRepository> = {},
): DeckVersionRepository {
  return {
    listAllVersions: vi.fn(async () => []),
    listVersions: vi.fn(async () => []),
    getVersion: vi.fn(async () => undefined),
    saveVersion: vi.fn(async () => undefined),
    createVersion: vi.fn(async () => {
      throw new Error('not used')
    }),
    deleteVersion: vi.fn(async () => undefined),
    deleteVersionsForDeck: vi.fn(async () => undefined),
    ...overrides,
  }
}

const ORGANIZED_AT = '2026-09-13T00:00:00.000Z'

function folder(id: string, name: string, sortOrder = 1): DeckFolder {
  return {
    id,
    name,
    sortOrder,
    createdAt: ORGANIZED_AT,
    updatedAt: ORGANIZED_AT,
  }
}

function tag(id: string, name: string): DeckTag {
  return { id, name, createdAt: ORGANIZED_AT, updatedAt: ORGANIZED_AT }
}

function organization(
  deckId: string,
  overrides: Partial<DeckOrganization> = {},
): DeckOrganization {
  return {
    deckId,
    tagIds: [],
    createdAt: ORGANIZED_AT,
    updatedAt: ORGANIZED_AT,
    ...overrides,
  }
}

/** Folder, tag and organization stores this screen can read and write. */
function organizationRepositories(
  seed: {
    folders?: DeckFolder[]
    tags?: DeckTag[]
    organizations?: DeckOrganization[]
  } = {},
) {
  const folders = [...(seed.folders ?? [])]
  const tags = [...(seed.tags ?? [])]
  const organizations = [...(seed.organizations ?? [])]
  return {
    folders,
    tags,
    organizations,
    deckFolders: {
      listFolders: vi.fn(async () => [...folders]),
      getFolder: vi.fn(async () => undefined),
      saveFolder: vi.fn(async () => undefined),
      deleteFolder: vi.fn(async () => 0),
      saveFolderOrder: vi.fn(async () => undefined),
    } as DeckFolderRepository,
    deckTags: {
      listTags: vi.fn(async () => [...tags]),
      getTag: vi.fn(async () => undefined),
      saveTag: vi.fn(async () => undefined),
      deleteTag: vi.fn(async () => 0),
    } as DeckTagRepository,
    deckOrganizations: {
      listOrganizations: vi.fn(async () => [...organizations]),
      getOrganization: vi.fn(async () => undefined),
      saveOrganization: vi.fn(async () => undefined),
      deleteOrganization: vi.fn(async () => undefined),
    } as DeckOrganizationRepository,
  }
}

/**
 * The screen reads its folders and tags after mounting, and refuses to write a
 * backup until it has them, so a test that exports waits for that read.
 */
async function organizationLoaded(stores: {
  deckOrganizations: DeckOrganizationRepository
}) {
  await waitFor(() =>
    expect(stores.deckOrganizations.listOrganizations).toHaveBeenCalled(),
  )
}

function renderPage(
  deckRepository: CloudSyncedDeckRepository,
  createNewDeck = () => deck({ id: 'new-deck', entries: [] }),
  extras: {
    downloadFile?: (filename: string, contents: string) => void
    createImportId?: () => string
    deckVersions?: DeckVersionRepository
    deckFolders?: DeckFolderRepository
    deckTags?: DeckTagRepository
    deckOrganizations?: DeckOrganizationRepository
  } = {},
) {
  const deckVersions = extras.deckVersions ?? emptyVersionRepository()
  const fallback = organizationRepositories()
  const stores = {
    deckFolders: extras.deckFolders ?? fallback.deckFolders,
    deckTags: extras.deckTags ?? fallback.deckTags,
    deckOrganizations: extras.deckOrganizations ?? fallback.deckOrganizations,
  }
  render(
    <MemoryRouter initialEntries={['/decks']}>
      <Routes>
        <Route
          path="/decks"
          element={
            <SavedDecksPage
              repository={withDeckVersionCascade(deckRepository, deckVersions)}
              deckVersions={deckVersions}
              createNewDeck={createNewDeck}
              now={() => new Date(2026, 8, 13)}
              downloadFile={extras.downloadFile}
              createImportId={extras.createImportId}
              deckFolders={stores.deckFolders}
              deckTags={stores.deckTags}
              deckOrganizations={stores.deckOrganizations}
            />
          }
        />
        <Route path="/decks/:deckId" element={<p>Editor destination</p>} />
      </Routes>
      <Location />
    </MemoryRouter>,
  )
  return stores
}

function backupFile(contents: string, size?: number): File {
  const file = new File([contents], 'backup.json', {
    type: 'application/json',
  })
  Object.defineProperty(file, 'text', { value: async () => contents })
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('SavedDecksPage', () => {
  it('shows loading and the empty state', async () => {
    let resolveList!: (decks: Deck[]) => void
    const listPromise = new Promise<Deck[]>((resolve) => {
      resolveList = resolve
    })
    renderPage(repository({ listDecks: () => listPromise }))

    expect(screen.getByText('デッキを読み込んでいます…')).toBeVisible()
    resolveList([])
    expect(await screen.findByText('デッキがありません')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'バックアップを書き出す' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'バックアップを読み込む' }),
    ).toBeEnabled()
    expect(
      within(
        screen.getByRole('navigation', { name: 'デッキメニュー' }),
      ).getByRole('link', { name: 'デッキ比較' }),
    ).toHaveAttribute('href', '/deck-compare')
  })

  it('lists totals, update information, and an editor link', async () => {
    renderPage(repository({ listDecks: async () => [deck()] }))

    expect(await screen.findByText('テストデッキ')).toBeVisible()
    expect(screen.getByText('合計 3枚')).toBeVisible()
    expect(screen.getByText(/^更新 /)).toBeVisible()
    fireEvent.click(screen.getByRole('link', { name: '開く' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/decks/deck-1')
  })

  it('creates, saves, and opens a new deck', async () => {
    const saveDeck = vi.fn(async () => undefined)
    renderPage(repository({ saveDeck }))
    await screen.findByText('デッキがありません')

    fireEvent.click(screen.getByRole('button', { name: '新しいデッキを作成' }))

    await waitFor(() =>
      expect(saveDeck).toHaveBeenCalledWith(
        deck({ id: 'new-deck', entries: [] }),
      ),
    )
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/decks/new-deck',
      ),
    )
  })

  it('does not navigate when creation persistence fails', async () => {
    renderPage(
      repository({ saveDeck: async () => Promise.reject(new Error('full')) }),
    )
    await screen.findByText('デッキがありません')
    fireEvent.click(screen.getByRole('button', { name: '新しいデッキを作成' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'デッキを作成できませんでした。',
    )
    expect(screen.getByTestId('location')).toHaveTextContent('/decks')
  })

  it('requires confirmation before deleting and supports cancel', async () => {
    const deleteDeck = vi.fn(async () => undefined)
    renderPage(repository({ listDecks: async () => [deck()], deleteDeck }))
    await screen.findByText('テストデッキ')

    fireEvent.click(screen.getByRole('button', { name: 'テストデッキを削除' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      '「テストデッキ」を削除しますか？',
    )
    expect(deleteDeck).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('deletes only after confirmation', async () => {
    const deleteDeck = vi.fn(async () => undefined)
    renderPage(repository({ listDecks: async () => [deck()], deleteDeck }))
    await screen.findByText('テストデッキ')

    fireEvent.click(screen.getByRole('button', { name: 'テストデッキを削除' }))
    fireEvent.click(screen.getByRole('button', { name: '削除する' }))

    await waitFor(() => expect(deleteDeck).toHaveBeenCalledWith('deck-1'))
    expect(screen.getByText('デッキがありません')).toBeVisible()
  })

  it('keeps the deck visible when deletion fails', async () => {
    renderPage(
      repository({
        listDecks: async () => [deck()],
        deleteDeck: async () => Promise.reject(new Error('blocked')),
      }),
    )
    await screen.findByText('テストデッキ')
    fireEvent.click(screen.getByRole('button', { name: 'テストデッキを削除' }))
    fireEvent.click(screen.getByRole('button', { name: '削除する' }))

    expect(
      await screen.findByText('デッキを削除できませんでした。'),
    ).toBeVisible()
    expect(screen.getByText('テストデッキ')).toBeVisible()
  })

  it('shows list errors and retries', async () => {
    const listDecks = vi
      .fn<() => Promise<Deck[]>>()
      .mockRejectedValueOnce(new Error('blocked'))
      .mockResolvedValueOnce([])
    renderPage(repository({ listDecks }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'デッキを読み込めませんでした。',
    )
    fireEvent.click(screen.getByRole('button', { name: '再試行' }))
    expect(await screen.findByText('デッキがありません')).toBeVisible()
    expect(listDecks).toHaveBeenCalledTimes(2)
  })

  // The one load failure the reporter can act on, so it says what to do.
  it('names the other tab when the database is blocked', async () => {
    const listDecks = vi.fn<() => Promise<Deck[]>>(async () => {
      throw new AppDatabaseBlockedError()
    })
    renderPage(repository({ listDecks }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('デッキを読み込めませんでした。')
    expect(alert).toHaveTextContent(
      'ほかのタブで HLSieve DB を開いている場合は、そのタブを閉じてから再試行してください。',
    )
  })

  it('says nothing about other tabs for an ordinary load failure', async () => {
    renderPage(
      repository({
        listDecks: vi.fn<() => Promise<Deck[]>>(async () => {
          throw new Error('blocked')
        }),
      }),
    )

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('デッキを読み込めませんでした。')
    expect(alert).not.toHaveTextContent('ほかのタブ')
  })

  it('exports all Decks with the local-date filename and privacy boundaries', async () => {
    const downloadFile = vi.fn()
    const saved = deck({ name: '日本語デッキ' })
    renderPage(repository({ listDecks: async () => [saved] }), undefined, {
      downloadFile,
    })
    fireEvent.click(
      await screen.findByRole('button', { name: 'バックアップを書き出す' }),
    )

    expect(downloadFile).toHaveBeenCalledTimes(1)
    expect(downloadFile.mock.calls[0][0]).toBe(
      'hlsieve-deck-backup-2026-09-13.json',
    )
    expect(JSON.parse(downloadFile.mock.calls[0][1])).toMatchObject({
      format: 'hlsieve-deck-backup',
      version: 1,
      decks: [{ id: 'deck-1', name: '日本語デッキ' }],
    })
    expect(downloadFile.mock.calls[0][1]).not.toContain('tournament')
    expect(downloadFile.mock.calls[0][1]).not.toContain('selected-deck')
    expect(screen.getByText(/デッキ名とカード番号・枚数/)).toBeVisible()
    expect(screen.getByText(/外部へ送信されません/)).toBeVisible()
  })

  it('previews counts, cancels without writing, and accepts the same file again', async () => {
    const repo = repository()
    renderPage(repo)
    const file = backupFile(
      serializeDeckBackup(
        createDeckBackup(
          [deck({ id: 'restored' })],
          '2026-09-13T00:00:00.000Z',
        ),
      ),
    )
    const input = screen.getByLabelText('デッキバックアップJSONファイル')
    fireEvent.change(input, { target: { files: [file] } })
    const preview = await screen.findByRole('dialog', {
      name: '読み込み内容の確認',
    })
    expect(
      within(preview).getByText('新規追加').parentElement,
    ).toHaveTextContent('新規追加1件')
    fireEvent.click(within(preview).getByRole('button', { name: 'キャンセル' }))
    expect(repo.importDecks).not.toHaveBeenCalled()
    expect(input).toHaveValue('')
    fireEvent.change(input, { target: { files: [file] } })
    expect(await screen.findByRole('dialog')).toBeVisible()
  })

  it('imports after confirmation, refreshes the list, and remains idempotent', async () => {
    localStorage.setItem('hlsieve:selected-deck', 'selected-before-import')
    const stored: Deck[] = []
    const repo = repository({
      listDecks: vi.fn(async () => [...stored]),
      importDecks: vi.fn(async (values) => {
        stored.push(...values)
      }),
    })
    renderPage(repo)
    const incoming = deck({ id: 'restored', name: '復元デッキ' })
    const file = backupFile(
      serializeDeckBackup(
        createDeckBackup([incoming], '2026-09-13T00:00:00.000Z'),
      ),
    )
    const input = screen.getByLabelText('デッキバックアップJSONファイル')
    fireEvent.change(input, { target: { files: [file] } })
    fireEvent.click(
      await screen.findByRole('button', { name: '読み込みを実行' }),
    )
    await waitFor(() =>
      expect(repo.importDecks).toHaveBeenCalledWith([incoming]),
    )
    expect(
      await screen.findByRole('heading', { name: '復元デッキ' }),
    ).toBeVisible()
    expect(screen.getByText(/バックアップを読み込みました/)).toHaveTextContent(
      '追加: 1件、同一のためスキップ: 0件',
    )

    fireEvent.change(input, { target: { files: [file] } })
    const secondPreview = await screen.findByRole('dialog')
    expect(
      within(secondPreview).getByText('既存と同一').parentElement,
    ).toHaveTextContent('既存と同一1件')
    fireEvent.click(
      within(secondPreview).getByRole('button', { name: '読み込みを実行' }),
    )
    await waitFor(() => expect(repo.importDecks).toHaveBeenLastCalledWith([]))
    expect(screen.getAllByRole('heading', { name: '復元デッキ' })).toHaveLength(
      1,
    )
    expect(localStorage.getItem('hlsieve:selected-deck')).toBe(
      'selected-before-import',
    )
  })

  it('imports an ID conflict under a new ID without overwriting the existing Deck', async () => {
    const existing = deck({ name: '既存デッキ' })
    const incoming = deck({ name: '復元デッキ' })
    let stored = [existing]
    const repo = repository({
      listDecks: vi.fn(async () => [...stored]),
      importDecks: vi.fn(async (values) => {
        stored = [...stored, ...values]
      }),
    })
    renderPage(repo, undefined, { createImportId: () => 'generated-id' })
    await screen.findByRole('heading', { name: '既存デッキ' })
    const file = backupFile(
      serializeDeckBackup(
        createDeckBackup([incoming], '2026-09-13T00:00:00.000Z'),
      ),
    )
    fireEvent.change(screen.getByLabelText('デッキバックアップJSONファイル'), {
      target: { files: [file] },
    })
    const preview = await screen.findByRole('dialog')
    expect(within(preview).getByText('ID重複').parentElement).toHaveTextContent(
      'ID重複1件',
    )
    expect(
      within(preview).getByText(/既存データは上書きされません/),
    ).toBeVisible()
    fireEvent.click(
      within(preview).getByRole('button', { name: '読み込みを実行' }),
    )
    await waitFor(() =>
      expect(repo.importDecks).toHaveBeenCalledWith([
        { ...incoming, id: 'generated-id' },
      ]),
    )
    expect(screen.getByRole('heading', { name: '既存デッキ' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '復元デッキ' })).toBeVisible()
  })

  it('rejects invalid and oversized files without changing existing Decks', async () => {
    const existing = deck()
    const repo = repository({ listDecks: async () => [existing] })
    renderPage(repo)
    await screen.findByRole('heading', { name: 'テストデッキ' })
    const input = screen.getByLabelText('デッキバックアップJSONファイル')
    fireEvent.change(input, { target: { files: [backupFile('{')] } })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'バックアップファイルを読み込めませんでした',
    )
    expect(repo.importDecks).not.toHaveBeenCalled()

    fireEvent.change(input, {
      target: { files: [backupFile('{}', MAX_DECK_BACKUP_FILE_SIZE + 1)] },
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ファイルサイズが大きすぎます',
    )
    expect(screen.getByRole('heading', { name: 'テストデッキ' })).toBeVisible()
  })

  it('reports atomic import failure and leaves the visible list unchanged', async () => {
    const existing = deck()
    const repo = repository({
      listDecks: async () => [existing],
      importDecks: async () => Promise.reject(new Error('transaction failed')),
    })
    renderPage(repo)
    const file = backupFile(
      serializeDeckBackup(
        createDeckBackup(
          [deck({ id: 'new', name: '新規デッキ' })],
          '2026-09-13T00:00:00.000Z',
        ),
      ),
    )
    fireEvent.change(screen.getByLabelText('デッキバックアップJSONファイル'), {
      target: { files: [file] },
    })
    fireEvent.click(
      await screen.findByRole('button', { name: '読み込みを実行' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '既存のデッキは変更されていません',
    )
    expect(screen.getByRole('heading', { name: 'テストデッキ' })).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: '新規デッキ' }),
    ).not.toBeInTheDocument()
  })
})

/**
 * Which format each saved deck is built for.
 *
 * Shown, never written: a list is something the reporter reads, and opening it
 * is not a decision about any deck in it.
 */
describe('the format each saved deck is built for', () => {
  const SELECTION = 'selection-cup-2026-autumn'

  it('calls a deck that names no format ordinary construction', async () => {
    renderPage(repository({ listDecks: async () => [deck()] }))

    expect(await screen.findByText('通常構築')).toBeVisible()
  })

  it('says the same for a deck that spells it out', async () => {
    renderPage(
      repository({
        listDecks: async () => [deck({ regulationId: 'standard' })],
      }),
    )

    expect(await screen.findByText('通常構築')).toBeVisible()
  })

  it('names the tournament a deck is built for', async () => {
    renderPage(
      repository({
        listDecks: async () => [deck({ regulationId: SELECTION })],
      }),
    )

    expect(
      await screen.findByText(/セレクションカップ 2026年9-10月/),
    ).toBeVisible()
    expect(screen.queryByText('通常構築')).toBeNull()
  })

  // Showing this as ordinary construction would tell the reporter their
  // tournament deck is an ordinary one.
  it('says when it does not recognise the format', async () => {
    renderPage(
      repository({
        listDecks: async () => [
          deck({ regulationId: 'future-or-removed-rule' }),
        ],
      }),
    )

    expect(await screen.findByText('不明なレギュレーション')).toBeVisible()
    expect(screen.queryByText('通常構築')).toBeNull()
  })

  it('tells two decks apart that differ only by their format', async () => {
    renderPage(
      repository({
        listDecks: async () => [
          deck({ id: 'deck-1', name: '通常のデッキ' }),
          deck({ id: 'deck-2', name: '大会用デッキ', regulationId: SELECTION }),
        ],
      }),
    )

    const cards = await screen.findAllByRole('listitem')
    expect(within(cards[0] as HTMLElement).getByText('通常構築')).toBeVisible()
    expect(
      within(cards[1] as HTMLElement).getByText(
        /セレクションカップ 2026年9-10月/,
      ),
    ).toBeVisible()
  })

  it('writes nothing merely by listing the decks', async () => {
    const saveDeck = vi.fn(async () => undefined)
    renderPage(
      repository({
        listDecks: async () => [
          deck({ regulationId: 'future-or-removed-rule' }),
        ],
        saveDeck,
      }),
    )
    await screen.findByText('不明なレギュレーション')

    expect(saveDeck).not.toHaveBeenCalled()
  })

  // A restored backup is read back through the same list.
  it('shows the format of a deck brought back from a backup', async () => {
    const decks = [deck({ regulationId: SELECTION })]
    renderPage(repository({ listDecks: async () => decks }))

    expect(
      await screen.findByText(/セレクションカップ 2026年9-10月/),
    ).toBeVisible()
  })
})

/**
 * Copying a deck, and what deleting one takes with it.
 *
 * A copy is its own deck from the moment it exists, and a deck's snapshots
 * restore into that deck and nothing else, so they go when it does.
 */
describe('copies and snapshots', () => {
  const versionRepository = emptyVersionRepository

  function renderWithVersions(
    deckRepository: CloudSyncedDeckRepository,
    deckVersions: DeckVersionRepository,
  ) {
    render(
      <MemoryRouter initialEntries={['/decks']}>
        <Routes>
          <Route
            path="/decks"
            element={
              <SavedDecksPage
                repository={withDeckVersionCascade(
                  deckRepository,
                  deckVersions,
                )}
                deckVersions={deckVersions}
              />
            }
          />
          <Route path="/decks/:deckId" element={<p>Editor destination</p>} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('saves a copy under a name that says so, and opens it', async () => {
    const duplicateDeck = vi.fn<(value: Deck) => Promise<void>>(
      async () => undefined,
    )
    renderWithVersions(
      repository({
        listDecks: async () => [deck({ id: 'deck-1', name: '白上フブキ' })],
        duplicateDeck,
      }),
      versionRepository(),
    )
    fireEvent.click(
      await screen.findByRole('button', { name: '白上フブキを複製' }),
    )

    await waitFor(() => expect(duplicateDeck).toHaveBeenCalledTimes(1))
    const copy = duplicateDeck.mock.calls[0]?.[0] as Deck
    expect(copy.name).toBe('白上フブキのコピー')
    expect(copy.id).not.toBe('deck-1')
    expect(copy.entries).toEqual(deck().entries)
  })

  it('numbers a copy when the name is taken', async () => {
    const duplicateDeck = vi.fn<(value: Deck) => Promise<void>>(
      async () => undefined,
    )
    renderWithVersions(
      repository({
        listDecks: async () => [
          deck({ id: 'deck-1', name: '白上フブキ' }),
          deck({ id: 'deck-2', name: '白上フブキのコピー' }),
        ],
        duplicateDeck,
      }),
      versionRepository(),
    )
    fireEvent.click(
      await screen.findByRole('button', { name: '白上フブキを複製' }),
    )

    await waitFor(() => expect(duplicateDeck).toHaveBeenCalledTimes(1))
    expect((duplicateDeck.mock.calls[0]?.[0] as Deck).name).toBe(
      '白上フブキのコピー 2',
    )
  })

  it('keeps the format a copied deck was built for', async () => {
    const duplicateDeck = vi.fn<(value: Deck) => Promise<void>>(
      async () => undefined,
    )
    renderWithVersions(
      repository({
        listDecks: async () => [
          deck({ regulationId: 'selection-cup-2026-autumn' }),
        ],
        duplicateDeck,
      }),
      versionRepository(),
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'テストデッキを複製' }),
    )

    await waitFor(() => expect(duplicateDeck).toHaveBeenCalledTimes(1))
    expect((duplicateDeck.mock.calls[0]?.[0] as Deck).regulationId).toBe(
      'selection-cup-2026-autumn',
    )
  })

  // The number is part of the question: deleting takes them too.
  it('says how many snapshots deleting the deck will take', async () => {
    renderWithVersions(
      repository({ listDecks: async () => [deck()] }),
      versionRepository({
        listVersions: vi.fn(async () => [
          {
            id: 'v1',
            deckId: 'deck-1',
            label: 'a',
            createdAt: '2026-09-20T00:00:00.000Z',
            snapshot: { name: 'テストデッキ', entries: [] },
          },
          {
            id: 'v2',
            deckId: 'deck-1',
            label: 'b',
            createdAt: '2026-09-21T00:00:00.000Z',
            snapshot: { name: 'テストデッキ', entries: [] },
          },
        ]),
      }),
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'テストデッキを削除' }),
    )

    expect(
      await screen.findByText(/このデッキのバージョン2件も削除されます/),
    ).toBeVisible()
  })

  it('says nothing about snapshots when there are none', async () => {
    renderWithVersions(
      repository({ listDecks: async () => [deck()] }),
      versionRepository(),
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'テストデッキを削除' }),
    )

    await screen.findByText('「テストデッキ」を削除しますか？')
    // Scoped to the question: each row also has a link to its versions.
    const dialog = screen.getByRole('alertdialog', { name: 'デッキ削除の確認' })
    expect(within(dialog).queryByText(/バージョン/)).toBeNull()
  })

  it('removes the deck s snapshots along with it', async () => {
    const deleteVersionsForDeck = vi.fn(async () => undefined)
    renderWithVersions(
      repository({
        listDecks: async () => [deck()],
        deleteDeck: vi.fn(async () => undefined),
      }),
      versionRepository({ deleteVersionsForDeck }),
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'テストデッキを削除' }),
    )
    fireEvent.click(screen.getByRole('button', { name: '削除する' }))

    await waitFor(() =>
      expect(deleteVersionsForDeck).toHaveBeenCalledWith('deck-1'),
    )
  })

  // Opening the list is not a decision about any deck in it.
  it('writes nothing merely by listing the decks', async () => {
    const saveDeck = vi.fn(async () => undefined)
    const deleteVersionsForDeck = vi.fn(async () => undefined)
    renderWithVersions(
      repository({ listDecks: async () => [deck()], saveDeck }),
      versionRepository({ deleteVersionsForDeck }),
    )
    await screen.findByText('テストデッキ')

    expect(saveDeck).not.toHaveBeenCalled()
    expect(deleteVersionsForDeck).not.toHaveBeenCalled()
  })
})

/**
 * Deleting a deck clears its snapshots first.
 *
 * They restore into that deck and nothing else, so a deck removed while they
 * remain would leave records nobody can reach or clear. Doing them first means
 * a failure leaves everything as it was, which is a state the reporter can
 * retry from.
 */
describe('the order a deck and its snapshots are deleted in', () => {
  const failing = () =>
    emptyVersionRepository({
      deleteVersionsForDeck: vi.fn(async () => {
        throw new Error('indexeddb unavailable')
      }),
    })

  it('keeps the deck when its snapshots cannot be cleared', async () => {
    const deleteDeck = vi.fn(async () => undefined)
    renderPage(
      repository({ listDecks: async () => [deck()], deleteDeck }),
      undefined,
      { deckVersions: failing() },
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'テストデッキを削除' }),
    )

    fireEvent.click(screen.getByRole('button', { name: '削除する' }))

    expect(
      await screen.findByText('デッキを削除できませんでした。'),
    ).toBeVisible()
    expect(deleteDeck).not.toHaveBeenCalled()
    expect(screen.getByText('テストデッキ')).toBeVisible()
  })

  it('deletes the deck once its snapshots are gone', async () => {
    const deleteDeck = vi.fn(async () => undefined)
    const deleteVersionsForDeck = vi.fn(async () => undefined)
    renderPage(
      repository({ listDecks: async () => [deck()], deleteDeck }),
      undefined,
      { deckVersions: emptyVersionRepository({ deleteVersionsForDeck }) },
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'テストデッキを削除' }),
    )

    fireEvent.click(screen.getByRole('button', { name: '削除する' }))

    await waitFor(() => expect(deleteDeck).toHaveBeenCalledWith('deck-1'))
    expect(deleteVersionsForDeck).toHaveBeenCalledWith('deck-1')
    expect(deleteVersionsForDeck.mock.invocationCallOrder[0] ?? 0).toBeLessThan(
      deleteDeck.mock.invocationCallOrder[0] ?? 0,
    )
    expect(await screen.findByText('デッキがありません')).toBeVisible()
  })

  it('touches only the snapshots of the deck being deleted', async () => {
    const deleteVersionsForDeck = vi.fn(async () => undefined)
    renderPage(
      repository({
        listDecks: async () => [
          deck({ id: 'deck-1', name: '消すデッキ' }),
          deck({ id: 'deck-2', name: '残すデッキ' }),
        ],
      }),
      undefined,
      { deckVersions: emptyVersionRepository({ deleteVersionsForDeck }) },
    )
    fireEvent.click(
      await screen.findByRole('button', { name: '消すデッキを削除' }),
    )

    fireEvent.click(screen.getByRole('button', { name: '削除する' }))

    await waitFor(() =>
      expect(deleteVersionsForDeck).toHaveBeenCalledWith('deck-1'),
    )
    expect(deleteVersionsForDeck).toHaveBeenCalledTimes(1)
    expect(deleteVersionsForDeck).not.toHaveBeenCalledWith('deck-2')
    expect(screen.getByText('残すデッキ')).toBeVisible()
  })
})

describe('a backup that carries folders and tags', () => {
  it('is written in the older format while nothing is organized', async () => {
    const downloadFile = vi.fn()
    const stores = organizationRepositories()
    renderPage(
      repository({ listDecks: vi.fn(async () => [deck()]) }),
      undefined,
      {
        downloadFile,
        ...stores,
      },
    )

    fireEvent.click(
      await screen.findByRole('button', { name: 'バックアップを書き出す' }),
    )

    await waitFor(() => expect(downloadFile).toHaveBeenCalledTimes(1))
    const written = JSON.parse(downloadFile.mock.calls[0][1]) as {
      version: number
    }
    expect(written.version).toBe(1)
  })

  // Only then, so a file an older build can still read stays that way.
  it('is written in the newer format once a folder or tag exists', async () => {
    const downloadFile = vi.fn()
    const stores = organizationRepositories({
      folders: [folder('f1', '大会用')],
      tags: [tag('t1', '赤')],
      organizations: [
        organization('deck-1', { folderId: 'f1', tagIds: ['t1'] }),
      ],
    })
    renderPage(
      repository({ listDecks: vi.fn(async () => [deck()]) }),
      undefined,
      {
        downloadFile,
        ...stores,
      },
    )

    fireEvent.click(
      await screen.findByRole('button', { name: 'バックアップを書き出す' }),
    )

    await waitFor(() => expect(downloadFile).toHaveBeenCalledTimes(1))
    expect(JSON.parse(downloadFile.mock.calls[0][1])).toMatchObject({
      version: 2,
      folders: [folder('f1', '大会用')],
      tags: [tag('t1', '赤')],
      organizations: [
        organization('deck-1', { folderId: 'f1', tagIds: ['t1'] }),
      ],
    })
  })

  it('is read back through the one write that keeps them together', async () => {
    const repo = repository()
    const stores = organizationRepositories()
    renderPage(repo, undefined, stores)
    await organizationLoaded(stores)
    const incoming = deck({ id: 'restored', name: '復元デッキ' })
    const file = backupFile(
      serializeDeckBackup(
        createDeckBackupV2(
          {
            decks: [incoming],
            folders: [folder('f1', '大会用')],
            tags: [tag('t1', '赤')],
            organizations: [
              organization('restored', { folderId: 'f1', tagIds: ['t1'] }),
            ],
          },
          ORGANIZED_AT,
        ),
      ),
    )

    fireEvent.change(screen.getByLabelText('デッキバックアップJSONファイル'), {
      target: { files: [file] },
    })
    fireEvent.click(
      await screen.findByRole('button', { name: '読み込みを実行' }),
    )

    await waitFor(() =>
      expect(repo.importOrganizationBackup).toHaveBeenCalledWith({
        decks: [incoming],
        folders: [folder('f1', '大会用')],
        tags: [tag('t1', '赤')],
        organizations: [
          organization('restored', { folderId: 'f1', tagIds: ['t1'] }),
        ],
      }),
    )
    // The older path writes decks alone, and would drop the rest.
    expect(repo.importDecks).not.toHaveBeenCalled()
  })

  it('says what it did beyond adding decks', async () => {
    const stores = organizationRepositories({
      folders: [folder('own', '大会用')],
    })
    renderPage(repository(), undefined, stores)
    await organizationLoaded(stores)
    const file = backupFile(
      serializeDeckBackup(
        createDeckBackupV2(
          {
            decks: [deck({ id: 'restored' })],
            folders: [folder('f1', '大会用')],
            tags: [],
            organizations: [organization('missing')],
          },
          ORGANIZED_AT,
        ),
      ),
    )

    fireEvent.change(screen.getByLabelText('デッキバックアップJSONファイル'), {
      target: { files: [file] },
    })
    fireEvent.click(
      await screen.findByRole('button', { name: '読み込みを実行' }),
    )

    const status = await screen.findByText(/バックアップを読み込みました/)
    expect(status).toHaveTextContent('追加: 1件')
    expect(status).toHaveTextContent(
      'デッキが見つからない整理情報 1件を取り込みませんでした。',
    )
    expect(status).toHaveTextContent(
      '名前が重なるフォルダー・タグ 1件に番号を付けました。',
    )
  })

  it('adds nothing when the same file is read a second time', async () => {
    const storedDecks: Deck[] = []
    const stores = organizationRepositories()
    const repo = repository({
      listDecks: vi.fn(async () => [...storedDecks]),
      importOrganizationBackup: vi.fn(async (values) => {
        storedDecks.push(...values.decks)
        stores.folders.push(...values.folders)
        stores.tags.push(...values.tags)
        stores.organizations.push(...values.organizations)
      }),
    })
    renderPage(repo, undefined, stores)
    await organizationLoaded(stores)
    const incoming = deck({ id: 'restored', name: '復元デッキ' })
    const file = backupFile(
      serializeDeckBackup(
        createDeckBackupV2(
          {
            decks: [incoming],
            folders: [folder('f1', '大会用')],
            tags: [tag('t1', '赤')],
            organizations: [
              organization('restored', { folderId: 'f1', tagIds: ['t1'] }),
            ],
          },
          ORGANIZED_AT,
        ),
      ),
    )
    const input = screen.getByLabelText('デッキバックアップJSONファイル')

    fireEvent.change(input, { target: { files: [file] } })
    fireEvent.click(
      await screen.findByRole('button', { name: '読み込みを実行' }),
    )
    await waitFor(() =>
      expect(repo.importOrganizationBackup).toHaveBeenCalledTimes(1),
    )
    expect(
      await screen.findByRole('heading', { name: '復元デッキ' }),
    ).toBeVisible()

    fireEvent.change(input, { target: { files: [file] } })
    fireEvent.click(
      await screen.findByRole('button', { name: '読み込みを実行' }),
    )

    await waitFor(() =>
      expect(repo.importOrganizationBackup).toHaveBeenLastCalledWith({
        decks: [],
        folders: [],
        tags: [],
        organizations: [],
      }),
    )
    expect(storedDecks).toHaveLength(1)
    expect(stores.folders).toHaveLength(1)
    expect(stores.tags).toHaveLength(1)
    expect(stores.organizations).toHaveLength(1)
  })

  it('carries the copy of an organized deck through the same write', async () => {
    const stores = organizationRepositories({
      organizations: [
        organization('deck-1', { folderId: 'f1', tagIds: ['t1'] }),
      ],
      folders: [folder('f1', '大会用')],
      tags: [tag('t1', '赤')],
    })
    const duplicate = vi.fn(async () => undefined)
    const repo = repository({
      listDecks: vi.fn(async () => [deck()]),
      duplicateDeck: duplicate,
    })
    renderPage(repo, undefined, stores)
    await organizationLoaded(stores)

    fireEvent.click(
      await screen.findByRole('button', { name: 'テストデッキを複製' }),
    )

    await waitFor(() => expect(duplicate).toHaveBeenCalledTimes(1))
    const [copy, copyOrganization] = duplicate.mock.calls[0] as unknown as [
      Deck,
      DeckOrganization,
    ]
    expect(copyOrganization.deckId).toBe(copy.id)
    expect(copyOrganization.folderId).toBe('f1')
    expect(copyOrganization.tagIds).toEqual(['t1'])
  })
})

/**
 * A collection whose folders and tags could not be read is not a collection
 * without any. Anything that would write a file, or plan against what is
 * already here, has to stop instead of quietly leaving them out.
 */
describe('when the folders and tags cannot be read', () => {
  function unreadable() {
    const stores = organizationRepositories()
    stores.deckFolders.listFolders = vi.fn(async () => {
      throw new Error('blocked')
    })
    return stores
  }

  it('stops the backup instead of writing one without them', async () => {
    const downloadFile = vi.fn()
    const stores = unreadable()
    renderPage(
      repository({ listDecks: vi.fn(async () => [deck()]) }),
      undefined,
      { downloadFile, ...stores },
    )
    await organizationLoaded(stores)

    fireEvent.click(
      await screen.findByRole('button', { name: 'バックアップを書き出す' }),
    )

    expect(
      await screen.findByText(
        'フォルダー・タグを読み込めないため、書き出しを中止しました。ページを再読み込みしてください。',
      ),
    ).toBeVisible()
    expect(downloadFile).not.toHaveBeenCalled()
  })

  // Still reading is a wait, not a failure, and says so.
  it('asks the reporter to wait while they are still being read', async () => {
    const downloadFile = vi.fn()
    const stores = organizationRepositories()
    stores.deckFolders.listFolders = vi.fn(
      () => new Promise<DeckFolder[]>(() => undefined),
    )
    renderPage(
      repository({ listDecks: vi.fn(async () => [deck()]) }),
      undefined,
      { downloadFile, ...stores },
    )

    fireEvent.click(
      await screen.findByRole('button', { name: 'バックアップを書き出す' }),
    )

    expect(
      await screen.findByText(
        'フォルダー・タグを読み込み中です。少し待ってからもう一度お試しください。',
      ),
    ).toBeVisible()
    expect(downloadFile).not.toHaveBeenCalled()
  })

  it('stops a newer-format import before it is previewed', async () => {
    const stores = unreadable()
    const repo = repository()
    renderPage(repo, undefined, stores)
    await organizationLoaded(stores)
    const file = backupFile(
      serializeDeckBackup(
        createDeckBackupV2(
          {
            decks: [deck({ id: 'restored' })],
            folders: [folder('f1', '大会用')],
            tags: [],
            organizations: [organization('restored', { folderId: 'f1' })],
          },
          ORGANIZED_AT,
        ),
      ),
    )

    fireEvent.change(screen.getByLabelText('デッキバックアップJSONファイル'), {
      target: { files: [file] },
    })

    expect(
      await screen.findByText(
        'フォルダー・タグを読み込めないため、読み込みを中止しました。ページを再読み込みしてください。',
      ),
    ).toBeVisible()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(repo.importOrganizationBackup).not.toHaveBeenCalled()
  })

  // An older file carries no folders or tags, so nothing about it depends on
  // the ones already here.
  it('reads an older-format backup as it always did', async () => {
    const stores = unreadable()
    const repo = repository()
    renderPage(repo, undefined, stores)
    await organizationLoaded(stores)
    const incoming = deck({ id: 'restored', name: '復元デッキ' })
    const file = backupFile(
      serializeDeckBackup(createDeckBackup([incoming], ORGANIZED_AT)),
    )

    fireEvent.change(screen.getByLabelText('デッキバックアップJSONファイル'), {
      target: { files: [file] },
    })
    fireEvent.click(
      await screen.findByRole('button', { name: '読み込みを実行' }),
    )

    await waitFor(() =>
      expect(repo.importDecks).toHaveBeenCalledWith([incoming]),
    )
  })

  // The copy is the deck the reporter asked for; its folder and tags are not.
  it('copies a deck without carrying its organization', async () => {
    const stores = unreadable()
    const duplicate = vi.fn<
      (value: Deck, organization?: DeckOrganization) => Promise<void>
    >(async () => undefined)
    renderPage(
      repository({
        listDecks: vi.fn(async () => [deck()]),
        duplicateDeck: duplicate,
      }),
      undefined,
      stores,
    )
    await organizationLoaded(stores)

    fireEvent.click(
      await screen.findByRole('button', { name: 'テストデッキを複製' }),
    )

    await waitFor(() => expect(duplicate).toHaveBeenCalledTimes(1))
    expect(duplicate.mock.calls[0]?.[1]).toBeUndefined()
    expect(screen.queryByText('デッキを複製できませんでした。')).toBeNull()
  })

  it('stops a later backup when the read after an import failed', async () => {
    const downloadFile = vi.fn()
    const stores = organizationRepositories()
    const listFolders = vi
      .fn<() => Promise<DeckFolder[]>>()
      .mockResolvedValueOnce([])
      .mockRejectedValue(new Error('blocked'))
    stores.deckFolders.listFolders = listFolders
    const storedDecks: Deck[] = []
    const repo = repository({
      listDecks: vi.fn(async () => [...storedDecks]),
      importOrganizationBackup: vi.fn(async (values) => {
        storedDecks.push(...values.decks)
      }),
    })
    renderPage(repo, undefined, { downloadFile, ...stores })
    await organizationLoaded(stores)
    const file = backupFile(
      serializeDeckBackup(
        createDeckBackupV2(
          {
            decks: [deck({ id: 'restored', name: '復元デッキ' })],
            folders: [folder('f1', '大会用')],
            tags: [],
            organizations: [organization('restored', { folderId: 'f1' })],
          },
          ORGANIZED_AT,
        ),
      ),
    )

    fireEvent.change(screen.getByLabelText('デッキバックアップJSONファイル'), {
      target: { files: [file] },
    })
    fireEvent.click(
      await screen.findByRole('button', { name: '読み込みを実行' }),
    )

    // The import itself succeeded, and says so.
    expect(
      await screen.findByText(/バックアップを読み込みました/),
    ).toBeVisible()

    fireEvent.click(
      screen.getByRole('button', { name: 'バックアップを書き出す' }),
    )

    expect(
      await screen.findByText(
        'フォルダー・タグを読み込めないため、書き出しを中止しました。ページを再読み込みしてください。',
      ),
    ).toBeVisible()
    expect(downloadFile).not.toHaveBeenCalled()
  })
})
