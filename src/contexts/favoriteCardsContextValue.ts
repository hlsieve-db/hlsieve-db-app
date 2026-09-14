import { createContext, useContext } from 'react'

import type { FavoriteCard } from '../domain/favorites/types'

export type FavoriteCardsStatus = 'loading' | 'loaded' | 'error'

export type FavoriteCardsContextValue = {
  status: FavoriteCardsStatus
  favorites: readonly FavoriteCard[]
  pendingCardNumbers: ReadonlySet<string>
  mutationError: boolean
  announcement: string
  isFavorite: (cardNumber: string) => boolean
  toggleFavorite: (cardNumber: string) => Promise<void>
  retry: () => void
}

export const FavoriteCardsContext = createContext<FavoriteCardsContextValue>({
  status: 'loading',
  favorites: [],
  pendingCardNumbers: new Set(),
  mutationError: false,
  announcement: '',
  isFavorite: () => false,
  toggleFavorite: async () => undefined,
  retry: () => undefined,
})

export function useFavoriteCards(): FavoriteCardsContextValue {
  return useContext(FavoriteCardsContext)
}
