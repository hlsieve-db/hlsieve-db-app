import type { DeckZone } from '../decks/types'

/**
 * A set of rules a deck can be built under.
 *
 * The point of the shape is that a new tournament format should be a new
 * definition file and nothing else: no branch in the validator, no new field in
 * a deck, no change to a screen. So it describes what is allowed rather than
 * naming the event it came from.
 *
 * Only the card pool lives here. Deck size, copy limits and the restricted-card
 * list belong to the ordinary legality rules, which every format in play today
 * shares, and duplicating them here would mean two places to correct when the
 * official rules change.
 */

/**
 * Which part of a deck a rule applies to. The same three parts the legality
 * rules count, named from the card rather than stored on the deck.
 */
export type DeckSection = DeckZone

export type RegulationCardPool = {
  /**
   * Products whose cards may be used, by the exact name the card data carries.
   *
   * Names rather than ids because the published data has no product id: a
   * product is identified by its display name and nothing else. Inventing an
   * id here would mean maintaining a second mapping that could disagree with
   * the data it claims to describe.
   *
   * That makes a rename a real risk, which is what `expectedCardCount` is for.
   */
  allowedProductNames?: string[]
  /**
   * How many cards the products above are expected to resolve to.
   *
   * Checked by the tests against the published card data, never at runtime. A
   * renamed product would otherwise match nothing and quietly turn the pool
   * empty, which reads to a reporter as every card being banned. Failing a test
   * says that loudly to us instead of silently to them.
   */
  expectedCardCount?: number
  /** Cards allowed on top of the products, by card number. */
  additionalAllowedCardNumbers?: string[]
  /** Cards not allowed, whatever else says otherwise. */
  bannedCardNumbers?: string[]
  /**
   * Which parts of the deck the pool restricts. Defaults to the oshi and the
   * main deck.
   *
   * Stated by each definition rather than inferred from what the pool happens
   * to contain: a pool with no cheer cards in it could mean cheer is
   * unrestricted or that no cheer card is legal, and those are opposite rules.
   */
  appliesTo?: DeckSection[]
}

export type RegulationDefinition = {
  /**
   * Stable and internal. Kept apart from the display name so that a change of
   * wording, or of the event's own branding, does not invalidate decks built
   * under it.
   */
  id: string
  /**
   * Ids this regulation used to be recorded under.
   *
   * A deck stores the id, so an id that turns out to be wrong cannot simply be
   * replaced: decks already naming it would stop resolving. Listing it here
   * makes the old id resolve to this definition, and makes a deck carrying it
   * compare equal to one carrying the current id, so two devices that saved the
   * same deck either side of the correction do not look like a disagreement.
   *
   * Only for correcting our own mistake. A change to the rules earns a new
   * definition rather than an alias.
   */
  aliasIds?: string[]
  name: string
  description?: string
  /** ISO dates, inclusive. Absent means it has always applied, or still does. */
  effectiveFrom?: string
  effectiveTo?: string
  /** Absent means no pool restriction at all. */
  cardPool?: RegulationCardPool
}

/** What the pool restricts by default: the oshi and the main deck. */
export const DEFAULT_POOL_SECTIONS: readonly DeckSection[] = ['oshi', 'main']

export type DeckRegulationViolation = {
  cardNumber: string
  section: DeckSection
  quantity: number
  reason: 'not-in-card-pool' | 'banned'
}

export type DeckRegulationResult = {
  valid: boolean
  violations: DeckRegulationViolation[]
}
