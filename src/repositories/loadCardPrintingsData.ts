import { isCardPrintingsDataFile } from '../domain/cards/cardPrintingsValidation'
import type { CardPrintingsDataFile } from '../domain/cards/types'

const CARD_PRINTINGS_DATA_URL = '/card-printings.json'

export function createCardPrintingsDataLoader(fetchData: typeof fetch = fetch) {
  let cached: Promise<CardPrintingsDataFile> | undefined

  return function loadCardPrintingsData(): Promise<CardPrintingsDataFile> {
    if (cached) return cached
    const request = (async () => {
      let response: Response
      try {
        response = await fetchData(CARD_PRINTINGS_DATA_URL)
      } catch (error) {
        throw new Error('Failed to fetch card printing data.', { cause: error })
      }
      if (!response.ok) {
        throw new Error(
          `Failed to load card printing data: HTTP ${response.status}.`,
        )
      }

      let value: unknown
      try {
        value = await response.json()
      } catch (error) {
        throw new Error('Card printing data is not valid JSON.', {
          cause: error,
        })
      }
      if (!isCardPrintingsDataFile(value)) {
        throw new Error('Card printing data has an invalid shape.')
      }
      return value
    })()
    cached = request
    void request.catch(() => {
      if (cached === request) cached = undefined
    })
    return request
  }
}

export const loadCardPrintingsData = createCardPrintingsDataLoader()
