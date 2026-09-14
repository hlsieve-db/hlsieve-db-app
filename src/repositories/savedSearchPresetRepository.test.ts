import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_SEARCH_URL_STATE } from '../domain/search/searchUrlState'
import {
  toSavedSearchState,
  type SavedSearchPreset,
} from '../domain/searchPresets/types'
import {
  createSavedSearchPresetRepository,
  type SavedSearchPresetPersistenceAdapter,
} from './savedSearchPresetRepository'

function memoryPersistence(
  initial: unknown[] = [],
): SavedSearchPresetPersistenceAdapter {
  const records = new Map(
    initial.map((value) => [(value as { id: string }).id, value]),
  )
  return {
    getAll: vi.fn(async () => [...records.values()]),
    get: vi.fn(async (id) => records.get(id)),
    put: vi.fn(async (preset) => {
      records.set(preset.id, preset)
    }),
    delete: vi.fn(async (id) => {
      records.delete(id)
    }),
  }
}

function preset(
  id: string,
  name: string,
  createdAt: string,
): SavedSearchPreset {
  return {
    id,
    name,
    searchState: toSavedSearchState(DEFAULT_SEARCH_URL_STATE),
    createdAt,
    updatedAt: createdAt,
  }
}

describe('savedSearchPresetRepository', () => {
  it('creates a trimmed, page-free preset and supports get/list/remove', async () => {
    const persistence = memoryPersistence()
    const repository = createSavedSearchPresetRepository(persistence, {
      id: () => 'preset-1',
      now: () => '2026-09-14T01:02:03.000Z',
    })

    const created = await repository.createPreset('  赤ホロメン  ', {
      ...DEFAULT_SEARCH_URL_STATE,
      colors: ['red'],
      page: 4,
    })
    const expectedSearchState = toSavedSearchState({
      ...DEFAULT_SEARCH_URL_STATE,
      colors: ['red'],
      page: 4,
    })

    expect(created).toEqual({
      id: 'preset-1',
      name: '赤ホロメン',
      searchState: expectedSearchState,
      createdAt: '2026-09-14T01:02:03.000Z',
      updatedAt: '2026-09-14T01:02:03.000Z',
    })
    expect(created.searchState).not.toHaveProperty('page')
    await expect(repository.getPreset('preset-1')).resolves.toEqual(created)
    await expect(repository.listPresets()).resolves.toEqual([created])
    await repository.removePreset('preset-1')
    await expect(repository.getPreset('preset-1')).resolves.toBeUndefined()
  })

  it('sorts newest first with stable tie-breakers', async () => {
    const repository = createSavedSearchPresetRepository(
      memoryPersistence([
        preset('c', '古い', '2026-09-13T00:00:00.000Z'),
        preset('b', 'い', '2026-09-14T00:00:00.000Z'),
        preset('a', 'あ', '2026-09-14T00:00:00.000Z'),
      ]),
    )

    await expect(repository.listPresets()).resolves.toEqual([
      preset('a', 'あ', '2026-09-14T00:00:00.000Z'),
      preset('b', 'い', '2026-09-14T00:00:00.000Z'),
      preset('c', '古い', '2026-09-13T00:00:00.000Z'),
    ])
  })

  it('allows duplicate names and duplicate search conditions', async () => {
    const persistence = memoryPersistence()
    const ids = ['preset-1', 'preset-2']
    const repository = createSavedSearchPresetRepository(persistence, {
      id: () => ids.shift()!,
      now: () => '2026-09-14T00:00:00.000Z',
    })

    await repository.createPreset('同名', DEFAULT_SEARCH_URL_STATE)
    await repository.createPreset('同名', DEFAULT_SEARCH_URL_STATE)

    await expect(repository.listPresets()).resolves.toHaveLength(2)
  })

  it('rejects invalid names and safely skips invalid persisted records', async () => {
    const valid = preset('valid', '有効', '2026-09-14T00:00:00.000Z')
    const repository = createSavedSearchPresetRepository(
      memoryPersistence([
        valid,
        {
          ...valid,
          id: 'invalid',
          searchState: { ...valid.searchState, page: 2 },
        },
      ]),
    )

    await expect(
      repository.createPreset('   ', DEFAULT_SEARCH_URL_STATE),
    ).rejects.toThrow('required')
    await expect(
      repository.createPreset('a'.repeat(51), DEFAULT_SEARCH_URL_STATE),
    ).rejects.toThrow('too long')
    await expect(repository.listPresets()).resolves.toEqual([valid])
    await expect(repository.getPreset('invalid')).resolves.toBeUndefined()
  })

  it('propagates persistence failures without masking them', async () => {
    const failure = new Error('transaction failed')
    const repository = createSavedSearchPresetRepository({
      getAll: vi.fn(async () => {
        throw failure
      }),
      get: vi.fn(async () => {
        throw failure
      }),
      put: vi.fn(async () => {
        throw failure
      }),
      delete: vi.fn(async () => {
        throw failure
      }),
    })

    await expect(repository.listPresets()).rejects.toBe(failure)
    await expect(
      repository.createPreset('有効', DEFAULT_SEARCH_URL_STATE),
    ).rejects.toBe(failure)
    await expect(repository.removePreset('preset-1')).rejects.toBe(failure)
  })
})
