import { describe, expect, it } from 'vitest'

import {
  createContextSnapshot,
  formatContextSnapshot,
  parseContextArgs,
  type ContextDependencies,
} from './context'

const LARGE_MARKER = 'DO_NOT_DUMP_THIS_LARGE_FILE_BODY'

function dependencies(status = ''): ContextDependencies {
  return {
    git: (args) => {
      if (args[0] === 'status') return status
      if (args[0] === 'rev-list') return '0\t0\n'
      if (args[0] === 'branch') return 'main\n'
      if (args[0] === 'rev-parse') return 'abc1234\n'
      throw new Error(`Unexpected git command: ${args.join(' ')}`)
    },
    readPackageScripts: () => ({
      'cards:audit': 'large command body is not output',
      'tournaments:daily': 'another command body',
      build: 'build command',
    }),
    readJson: (path) => {
      if (path === 'public/cards.json') {
        return { dataVersion: 'cards-v1', cards: [{ body: LARGE_MARKER }] }
      }
      if (path === 'public/card-printings.json') {
        return {
          dataVersion: 'printings-v1',
          cards: { one: { printings: [{ body: LARGE_MARKER }, {}] } },
        }
      }
      if (path === 'public/tournaments/index.json') {
        return {
          dataVersion: 'tournaments-v1',
          events: [{ results: [{ body: LARGE_MARKER }, {}] }],
        }
      }
      if (path === 'public/tournaments/oshi-master.json') {
        return { cardsDataVersion: 'cards-v1', cards: { one: LARGE_MARKER } }
      }
      throw new Error(`Unexpected JSON path: ${path}`)
    },
  }
}

describe('AI context snapshot', () => {
  it('reports clean and dirty repositories without source contents', () => {
    const clean = createContextSnapshot('deck', dependencies())
    const dirty = createContextSnapshot(
      'deck',
      dependencies(' M src/domain/decks/deck.ts\n?? local.txt\n'),
    )

    expect(clean.git).toMatchObject({ clean: true, changedFiles: [] })
    expect(dirty.git).toMatchObject({
      clean: false,
      changedFiles: ['src/domain/decks/deck.ts', 'local.txt'],
    })
  })

  it.each(['tournaments', 'cards', 'deck'] as const)(
    'provides a compact %s preset',
    (area) => {
      const snapshot = createContextSnapshot(area, dependencies())
      const output = formatContextSnapshot(snapshot)
      expect(snapshot.area).toBe(area)
      expect(snapshot.suggestedFiles.length).toBeGreaterThan(0)
      expect(output.split('\n').length).toBeLessThan(100)
      expect(output).not.toContain(LARGE_MARKER)
      expect(output).not.toContain('command body')
    },
  )

  it('summarizes generated data by count and version only', () => {
    expect(createContextSnapshot('cards', dependencies()).data).toEqual({
      logicalCards: 1,
      printings: 2,
      cardsDataVersion: 'cards-v1',
      printingsDataVersion: 'printings-v1',
    })
    expect(createContextSnapshot('tournaments', dependencies()).data).toEqual({
      events: 1,
      results: 2,
      tournamentDataVersion: 'tournaments-v1',
      oshiCards: 1,
      oshiCardsDataVersion: 'cards-v1',
    })
  })

  it('supports compact JSON mode and rejects invalid areas', () => {
    const options = parseContextArgs(['--area', 'cards', '--json'])
    const output = JSON.stringify(
      createContextSnapshot(options.area, dependencies()),
    )
    expect(options.json).toBe(true)
    expect(output).not.toContain(LARGE_MARKER)
    expect(() => parseContextArgs(['--area', 'unknown'])).toThrow(
      /tournaments, cards, or deck/,
    )
  })
})
