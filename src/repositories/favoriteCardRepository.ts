import { STORE_FAVORITE_CARDS } from '../domain/decks/constants'
import { isFavoriteCard, type FavoriteCard } from '../domain/favorites/types'
import {
  createIndexedDbStorePersistence,
  type IndexedDbStorePersistence,
} from './appDatabase'
import type { LocalDataNamespace } from '../domain/storage/localDataNamespace'

export type FavoriteCardPersistenceAdapter = Omit<
  IndexedDbStorePersistence<FavoriteCard>,
  'addMany'
>

export type FavoriteCardRepository = {
  listFavorites: () => Promise<FavoriteCard[]>
  getFavorite: (cardNumber: string) => Promise<FavoriteCard | undefined>
  addFavorite: (cardNumber: string) => Promise<FavoriteCard>
  removeFavorite: (cardNumber: string) => Promise<void>
}

function compareFavorites(left: FavoriteCard, right: FavoriteCard): number {
  return (
    right.createdAt.localeCompare(left.createdAt) ||
    left.cardNumber.localeCompare(right.cardNumber, 'en')
  )
}

export function createFavoriteCardRepository(
  persistence: FavoriteCardPersistenceAdapter,
  options: { now?: () => string } = {},
): FavoriteCardRepository {
  return {
    async listFavorites() {
      const values = await persistence.getAll()
      if (!values.every(isFavoriteCard)) {
        throw new Error('Favorite card data has an invalid shape.')
      }
      return [...values].sort(compareFavorites)
    },
    async getFavorite(cardNumber) {
      const value = await persistence.get(cardNumber)
      if (value === undefined) return undefined
      if (!isFavoriteCard(value)) {
        throw new Error('Favorite card data has an invalid shape.')
      }
      return value
    },
    async addFavorite(cardNumber) {
      const normalizedCardNumber = cardNumber.trim()
      if (!normalizedCardNumber) throw new Error('Card number is required.')
      const existing = await persistence.get(normalizedCardNumber)
      if (existing !== undefined) {
        if (!isFavoriteCard(existing)) {
          throw new Error('Favorite card data has an invalid shape.')
        }
        return existing
      }
      const favorite = {
        cardNumber: normalizedCardNumber,
        createdAt: options.now?.() ?? new Date().toISOString(),
      }
      await persistence.put(favorite)
      return favorite
    },
    async removeFavorite(cardNumber) {
      await persistence.delete(cardNumber)
    },
  }
}

export function createIndexedDbFavoriteCardPersistence(
  databaseFactory?: IDBFactory,
  namespace?: LocalDataNamespace,
): FavoriteCardPersistenceAdapter {
  return createIndexedDbStorePersistence(
    STORE_FAVORITE_CARDS,
    databaseFactory,
    namespace,
  )
}

export const favoriteCardRepository = createFavoriteCardRepository(
  createIndexedDbFavoriteCardPersistence(),
)
