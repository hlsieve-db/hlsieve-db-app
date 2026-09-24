import { getRegulation, hasRegulation } from './registry'
import { STANDARD_REGULATION_ID } from './standard'

/**
 * Comparing the format two decks are built for.
 *
 * Ordinary construction has two spellings, because absent is what a deck says
 * when nothing chose a format and `'standard'` is what a screen would send if
 * it named one. They mean the same thing, and a deck that differs only in which
 * spelling it carries is the same deck.
 *
 * An id a definition lists as a former spelling of itself resolves to the
 * current one, so a deck saved before the correction and a deck saved after it
 * are the same deck rather than a disagreement to be asked about.
 *
 * Anything else is kept exactly as it is, including an id this build does not
 * define. Folding an unknown id into ordinary construction here would make a
 * deck built for a format that has since been removed compare equal to an
 * unrestricted one, and syncing or importing would then quietly discard the
 * format it was built for. Resolving an unknown id to something usable is a
 * separate question, answered by `getRegulation` at the point of use.
 */
export function normalizeDeckRegulationId(id?: string): string {
  if (id === undefined) return STANDARD_REGULATION_ID
  // hasRegulation first, because getRegulation falls back to ordinary
  // construction for anything it does not know, and that fallback must not
  // reach a comparison.
  return hasRegulation(id) ? getRegulation(id).id : id
}

/** Whether two decks are built for the same format. */
export function sameDeckRegulation(left?: string, right?: string): boolean {
  return normalizeDeckRegulationId(left) === normalizeDeckRegulationId(right)
}
