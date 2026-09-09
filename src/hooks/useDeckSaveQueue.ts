import { useCallback, useRef, useState } from 'react'

import type { Deck } from '../domain/decks/types'
import type { DeckRepository } from '../repositories/deckRepository'

export type DeckSaveState = 'idle' | 'saving' | 'saved' | 'error'

export function useDeckSaveQueue(repository: DeckRepository) {
  const [saveState, setSaveState] = useState<DeckSaveState>('idle')
  const queue = useRef<Promise<void>>(Promise.resolve())
  const version = useRef(0)

  const persist = useCallback(
    (deck: Deck) => {
      const requestVersion = ++version.current
      setSaveState('saving')
      const request = queue.current
        .catch(() => undefined)
        .then(() => repository.saveDeck(deck))
      queue.current = request
      void request.then(
        () => {
          if (version.current === requestVersion) setSaveState('saved')
        },
        () => {
          if (version.current === requestVersion) setSaveState('error')
        },
      )
    },
    [repository],
  )

  return { saveState, persist }
}
