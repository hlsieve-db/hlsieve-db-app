import { SELECTION_CUP_2026_AUTUMN } from './selectionCup2026Autumn'
import { STANDARD_REGULATION, STANDARD_REGULATION_ID } from './standard'
import type { RegulationDefinition } from './types'

/**
 * Every format the app knows about.
 *
 * Adding one is adding a file and a line here. Nothing else in the app names a
 * format, so a new tournament does not reach the validator, the editor or the
 * deck model.
 */
export const REGULATIONS: readonly RegulationDefinition[] = [
  STANDARD_REGULATION,
  SELECTION_CUP_2026_AUTUMN,
]

/**
 * Every id a deck might carry, current and superseded alike.
 *
 * An alias resolves to the definition that replaced it, so a deck saved before
 * an id was corrected still finds its format instead of falling back to
 * ordinary construction.
 */
const BY_ID = new Map(
  REGULATIONS.flatMap((regulation) =>
    [regulation.id, ...(regulation.aliasIds ?? [])].map(
      (id) => [id, regulation] as const,
    ),
  ),
)

/**
 * Ordinary construction for anything unrecognised.
 *
 * A deck built under a format this build has never heard of, or one whose
 * definition has since been removed, is still a deck. Falling back to the
 * unrestricted rules shows it as it is; refusing it, or marking every card in
 * it illegal, would make a missing definition look like a broken deck. A screen
 * can say the definition is unavailable, which is a different thing from the
 * deck being wrong.
 */
export function getRegulation(id?: string): RegulationDefinition {
  if (id === undefined) return STANDARD_REGULATION
  return BY_ID.get(id) ?? STANDARD_REGULATION
}

/** Whether this build has the definition, as opposed to falling back. */
export function hasRegulation(id?: string): boolean {
  return id === undefined || id === STANDARD_REGULATION_ID || BY_ID.has(id)
}

/**
 * Whether a format applies on a given day, both bounds inclusive.
 *
 * Dates are compared as ISO day strings rather than as moments: a format runs
 * on a date, and turning that into an instant would start or end it at a
 * different time for each reporter depending on where they are.
 */
export function isRegulationActive(
  regulation: RegulationDefinition,
  now: string,
): boolean {
  if (
    regulation.effectiveFrom !== undefined &&
    now < regulation.effectiveFrom
  ) {
    return false
  }
  return regulation.effectiveTo === undefined || now <= regulation.effectiveTo
}

/**
 * The formats worth offering, in the order they are declared.
 *
 * A format that has not started, or has ended, is left out of the list rather
 * than out of the registry: a deck already built under it still resolves, and
 * only the choice disappears.
 */
export function listRegulations(
  now: string = new Date().toISOString().slice(0, 10),
): RegulationDefinition[] {
  return REGULATIONS.filter((regulation) => isRegulationActive(regulation, now))
}
