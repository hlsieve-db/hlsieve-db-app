import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import type { FavoriteCard } from '../domain/favorites/types'
import {
  favoriteCardRepository,
  type FavoriteCardRepository,
} from '../repositories/favoriteCardRepository'
import {
  FavoriteCardsContext,
  type FavoriteCardsStatus,
} from './favoriteCardsContextValue'

export function FavoriteCardsProvider({
  children,
  repository = favoriteCardRepository,
}: {
  children: ReactNode
  repository?: FavoriteCardRepository
}) {
  const [status, setStatus] = useState<FavoriteCardsStatus>('loading')
  const [favorites, setFavorites] = useState<FavoriteCard[]>([])
  const [pendingCardNumbers, setPendingCardNumbers] = useState<Set<string>>(
    new Set(),
  )
  const [mutationError, setMutationError] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    let active = true
    void repository.listFavorites().then(
      (loaded) => {
        if (!active) return
        setFavorites(loaded)
        setStatus('loaded')
      },
      () => {
        if (active) setStatus('error')
      },
    )
    return () => {
      active = false
    }
  }, [loadAttempt, repository])

  const favoriteNumbers = useMemo(
    () => new Set(favorites.map((favorite) => favorite.cardNumber)),
    [favorites],
  )
  const isFavorite = useCallback(
    (cardNumber: string) => favoriteNumbers.has(cardNumber),
    [favoriteNumbers],
  )
  const toggleFavorite = useCallback(
    async (cardNumber: string) => {
      if (status !== 'loaded' || pendingCardNumbers.has(cardNumber)) return
      setMutationError(false)
      setAnnouncement('')
      setPendingCardNumbers((current) => new Set(current).add(cardNumber))
      try {
        if (favoriteNumbers.has(cardNumber)) {
          await repository.removeFavorite(cardNumber)
          setFavorites((current) =>
            current.filter((favorite) => favorite.cardNumber !== cardNumber),
          )
          setAnnouncement('お気に入りから削除しました。')
        } else {
          const added = await repository.addFavorite(cardNumber)
          setFavorites((current) =>
            [
              added,
              ...current.filter(
                (favorite) => favorite.cardNumber !== cardNumber,
              ),
            ].sort(
              (left, right) =>
                right.createdAt.localeCompare(left.createdAt) ||
                left.cardNumber.localeCompare(right.cardNumber, 'en'),
            ),
          )
          setAnnouncement('お気に入りに追加しました。')
        }
      } catch {
        setMutationError(true)
      } finally {
        setPendingCardNumbers((current) => {
          const next = new Set(current)
          next.delete(cardNumber)
          return next
        })
      }
    },
    [favoriteNumbers, pendingCardNumbers, repository, status],
  )

  const value = useMemo(
    () => ({
      status,
      favorites,
      pendingCardNumbers,
      mutationError,
      announcement,
      isFavorite,
      toggleFavorite,
      retry: () => {
        setStatus('loading')
        setLoadAttempt((attempt) => attempt + 1)
      },
    }),
    [
      announcement,
      favorites,
      isFavorite,
      mutationError,
      pendingCardNumbers,
      status,
      toggleFavorite,
    ],
  )

  return (
    <FavoriteCardsContext.Provider value={value}>
      {children}
    </FavoriteCardsContext.Provider>
  )
}
