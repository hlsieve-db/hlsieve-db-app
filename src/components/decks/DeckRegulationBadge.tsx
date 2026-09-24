import { getRegulation, hasRegulation } from '../../domain/regulations/registry'

/**
 * Which format a deck is built for, shown beside it.
 *
 * Display only. It never writes to the deck, and opening a list of decks is
 * not a decision about any of them: a deck naming a format this build does not
 * have keeps naming it until the reporter changes it in the editor.
 *
 * An unrecognised format is called out rather than shown as ordinary
 * construction. `getRegulation` falls back so the rest of the app stays usable,
 * but showing that fallback as a plain "スタンダード" badge would tell the
 * reporter their tournament deck is an ordinary one, which is the one thing
 * this badge must not do.
 *
 * A format that has finished is still the format the deck was built for, so it
 * is named as usual rather than being corrected to something the deck does not
 * say. No finished format exists yet, since none carries an end date, which is
 * why there is no note about one here to go stale.
 */

export type DeckRegulationBadgeProps = {
  regulationId?: string
}

export const UNKNOWN_REGULATION_LABEL = '不明なレギュレーション'

export function DeckRegulationBadge({
  regulationId,
}: DeckRegulationBadgeProps) {
  if (regulationId !== undefined && !hasRegulation(regulationId)) {
    return (
      <span
        className="deck-regulation-badge deck-regulation-badge--unknown"
        // The id itself is not shown: it is ours rather than the reporter's,
        // but it is worth having to hand when something has gone wrong.
        title={regulationId}
      >
        {UNKNOWN_REGULATION_LABEL}
      </span>
    )
  }

  return (
    <span className="deck-regulation-badge">
      {getRegulation(regulationId).name}
    </span>
  )
}
