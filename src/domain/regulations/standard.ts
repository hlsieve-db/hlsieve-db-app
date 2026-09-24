import type { RegulationDefinition } from './types'

/**
 * Ordinary construction: every published card may be used.
 *
 * The one a deck is under when it says nothing, so a deck made before formats
 * existed, and a deck made by someone who never opens the setting, are the same
 * deck. Nothing is stored for it, which is why the absent case and this id mean
 * the same thing everywhere.
 */
export const STANDARD_REGULATION_ID = 'standard'

export const STANDARD_REGULATION: RegulationDefinition = {
  id: STANDARD_REGULATION_ID,
  name: '通常構築',
  description: '公開されているすべてのカードを使用できます。',
  // No cardPool: the absence is the rule, rather than a pool that happens to
  // hold everything and would need maintaining as cards are published.
}
