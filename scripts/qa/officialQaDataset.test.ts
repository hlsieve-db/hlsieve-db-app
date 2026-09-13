/** @vitest-environment node */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { CardsDataFile } from '../../src/domain/cards/types'
import { buildOfficialQaSearchIndex } from '../../src/domain/qa/officialQaSearch'

describe('production official Q&A dataset', () => {
  it('builds 655 conflict-free unique records from 909 card occurrences', async () => {
    const data = JSON.parse(
      await readFile(resolve('public', 'cards.json'), 'utf8'),
    ) as CardsDataFile
    const canonical = new Map<string, { question: string; answer: string }>()
    let occurrences = 0

    for (const card of data.cards) {
      for (const qa of card.qas) {
        occurrences += 1
        const previous = canonical.get(qa.id)
        if (previous) {
          expect({ question: qa.question, answer: qa.answer }).toEqual(previous)
        } else {
          canonical.set(qa.id, {
            question: qa.question,
            answer: qa.answer,
          })
        }
      }
    }

    const index = buildOfficialQaSearchIndex(data.cards)
    expect(occurrences).toBe(909)
    expect(index).toHaveLength(655)
    expect(new Set(index.map(({ id }) => id))).toHaveProperty('size', 655)
  })
})
