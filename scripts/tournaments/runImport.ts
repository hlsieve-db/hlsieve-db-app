import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { CardsDataFile } from '../../src/domain/cards/types'
import { runTournamentImportPipeline } from './importPipeline'

const importPath = process.argv[2]
if (!importPath) {
  console.error('Usage: npm run tournaments:import -- <normalized-import.json>')
  process.exitCode = 2
} else {
  try {
    const [inputText, cardsText] = await Promise.all([
      readFile(resolve(importPath), 'utf8'),
      readFile(resolve('public/cards.json'), 'utf8'),
    ])
    const cardsData = JSON.parse(cardsText) as CardsDataFile
    const result = await runTournamentImportPipeline(
      JSON.parse(inputText) as unknown,
      cardsData,
    )
    console.log(
      `Published ${result.publishedEvents} Tournament Event(s); ${result.pendingRecords} pending record(s).`,
    )
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
