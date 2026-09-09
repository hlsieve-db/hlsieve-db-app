import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  addCardToDeck,
  decrementCardQuantity,
  incrementCardQuantity,
} from '../domain/decks/deck'
import {
  readSelectedDeckId,
  resolveSelectedDeckId,
  writeSelectedDeckId,
} from '../domain/decks/selectedDeckPreference'
import type { Deck } from '../domain/decks/types'
import type { DeckRepository } from '../repositories/deckRepository'
import { useDeckSaveQueue } from './useDeckSaveQueue'

export type SavedDecksState =
  { status: 'loading' } | { status: 'loaded' } | { status: 'error' }

export function useSavedDeckQuickEdit(repository: DeckRepository) {
  const [state, setState] = useState<SavedDecksState>({ status: 'loading' })
  const [decks, setDecks] = useState<Deck[]>([])
  const [selectedDeckId, setSelectedDeckIdState] = useState<string>()
  const [loadAttempt, setLoadAttempt] = useState(0)
  const decksRef = useRef<Deck[]>([])
  const selectedDeckIdRef = useRef<string | undefined>(undefined)
  const { saveState, persist } = useDeckSaveQueue(repository)

  useEffect(() => {
    let active = true
    void repository.listDecks().then(
      (loadedDecks) => {
        if (!active) return
        const resolvedId = resolveSelectedDeckId(
          loadedDecks,
          readSelectedDeckId(),
        )
        decksRef.current = loadedDecks
        selectedDeckIdRef.current = resolvedId
        setDecks(loadedDecks)
        setSelectedDeckIdState(resolvedId)
        setState({ status: 'loaded' })
        if (resolvedId) writeSelectedDeckId(resolvedId)
      },
      () => {
        if (active) setState({ status: 'error' })
      },
    )
    return () => {
      active = false
    }
  }, [loadAttempt, repository])

  const selectedDeck = useMemo(
    () => decks.find((deck) => deck.id === selectedDeckId),
    [decks, selectedDeckId],
  )

  const selectDeck = useCallback((deckId: string) => {
    if (!decksRef.current.some((deck) => deck.id === deckId)) return
    selectedDeckIdRef.current = deckId
    setSelectedDeckIdState(deckId)
    writeSelectedDeckId(deckId)
  }, [])

  const changeQuantity = useCallback(
    (cardNumber: string, delta: 1 | -1) => {
      const targetId = selectedDeckIdRef.current
      const current = decksRef.current.find((deck) => deck.id === targetId)
      if (!current) return
      const entry = current.entries.find(
        (candidate) => candidate.cardNumber === cardNumber,
      )
      if (delta < 0 && !entry) return
      const next =
        delta > 0
          ? entry
            ? incrementCardQuantity(current, cardNumber)
            : addCardToDeck(current, cardNumber)
          : decrementCardQuantity(current, cardNumber)
      const nextDecks = decksRef.current.map((deck) =>
        deck.id === next.id ? next : deck,
      )
      decksRef.current = nextDecks
      setDecks(nextDecks)
      persist(next)
    },
    [persist],
  )

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setLoadAttempt((attempt) => attempt + 1)
  }, [])

  const quantityFor = useCallback(
    (cardNumber: string) =>
      selectedDeck?.entries.find((entry) => entry.cardNumber === cardNumber)
        ?.quantity ?? 0,
    [selectedDeck],
  )

  return {
    state,
    decks,
    selectedDeck,
    selectedDeckId,
    saveState,
    selectDeck,
    increment: (cardNumber: string) => changeQuantity(cardNumber, 1),
    decrement: (cardNumber: string) => changeQuantity(cardNumber, -1),
    quantityFor,
    retry,
  }
}
