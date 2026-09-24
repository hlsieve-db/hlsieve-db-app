import { STANDARD_REGULATION_ID } from './standard'

/**
 * Comparing the format two decks are built for.
 *
 * Ordinary construction has two spellings, because absent is what a deck says
 * when nothing chose a format and `'standard'` is what a screen would send if
 * it named one. They mean the same thing, and a deck that differs only in which
 * spelling it carries is the same deck.
 *
 * Anything else is kept exactly as it is, including an id this build does not
 * define. Folding an unknown id into ordinary construction here would make a
 * deck built for a format that has since been removed compare equal to an
 * unrestricted one, and syncing or importing would then quietly discard the
 * format it was built for. Resolving an unknown id to something usable is a
 * separate question, answered by `getRegulation` at the point of use.
 */
export function normalizeDeckRegulationId(id?: string): string {
  return id ?? STANDARD_REGULATION_ID
}

/** Whether two decks are built for the same format. */
export function sameDeckRegulation(left?: string, right?: string): boolean {
  return normalizeDeckRegulationId(left) === normalizeDeckRegulationId(right)
}
