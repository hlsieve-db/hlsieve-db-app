import { STORE_SAVED_SEARCH_PRESETS } from '../domain/decks/constants'
import type { SearchUrlState } from '../domain/search/searchUrlState'
import {
  isSavedSearchPreset,
  SEARCH_PRESET_NAME_MAX_LENGTH,
  toSavedSearchState,
  type SavedSearchPreset,
} from '../domain/searchPresets/types'
import {
  createIndexedDbStorePersistence,
  type IndexedDbStorePersistence,
} from './appDatabase'

export type SavedSearchPresetPersistenceAdapter = Omit<
  IndexedDbStorePersistence<SavedSearchPreset>,
  'addMany'
>

export type SavedSearchPresetRepository = {
  listPresets: () => Promise<SavedSearchPreset[]>
  getPreset: (id: string) => Promise<SavedSearchPreset | undefined>
  createPreset: (
    name: string,
    searchState: SearchUrlState,
  ) => Promise<SavedSearchPreset>
  removePreset: (id: string) => Promise<void>
}

function comparePresets(
  left: SavedSearchPreset,
  right: SavedSearchPreset,
): number {
  return (
    right.createdAt.localeCompare(left.createdAt) ||
    left.name.localeCompare(right.name, 'ja') ||
    left.id.localeCompare(right.id, 'en')
  )
}

function validateName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Preset name is required.')
  if (trimmed.length > SEARCH_PRESET_NAME_MAX_LENGTH) {
    throw new Error('Preset name is too long.')
  }
  return trimmed
}

export function createSavedSearchPresetRepository(
  persistence: SavedSearchPresetPersistenceAdapter,
  options: { id?: () => string; now?: () => string } = {},
): SavedSearchPresetRepository {
  return {
    async listPresets() {
      return (await persistence.getAll())
        .filter(isSavedSearchPreset)
        .sort(comparePresets)
    },
    async getPreset(id) {
      const value = await persistence.get(id)
      return isSavedSearchPreset(value) ? value : undefined
    },
    async createPreset(name, searchState) {
      const timestamp = options.now?.() ?? new Date().toISOString()
      const preset: SavedSearchPreset = {
        id: options.id?.() ?? crypto.randomUUID(),
        name: validateName(name),
        searchState: toSavedSearchState(searchState),
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      if (!isSavedSearchPreset(preset)) {
        throw new Error('Search preset has an invalid shape.')
      }
      await persistence.put(preset)
      return preset
    },
    async removePreset(id) {
      await persistence.delete(id)
    },
  }
}

export function createIndexedDbSavedSearchPresetPersistence(
  databaseFactory?: IDBFactory,
): SavedSearchPresetPersistenceAdapter {
  return createIndexedDbStorePersistence(
    STORE_SAVED_SEARCH_PRESETS,
    databaseFactory,
  )
}

export const savedSearchPresetRepository = createSavedSearchPresetRepository(
  createIndexedDbSavedSearchPresetPersistence(),
)
