import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { parseTournamentIntakeCli } from './intakeCli'
import { LocalTournamentQueueRepository } from './repository'

function formatPreview(
  result: Awaited<ReturnType<LocalTournamentQueueRepository['intake']>>,
): string {
  const lines = result.preview.entries.map((entry) =>
    [
      entry.line,
      entry.sourceEventId ?? '-',
      entry.classification,
      entry.action,
      entry.error ?? '-',
    ].join('\t'),
  )
  const summary = Object.entries(result.preview.summary)
    .map(([classification, count]) => `${classification}=${count}`)
    .join(' ')
  return [...lines, summary, result.written ? 'written' : 'dry-run'].join('\n')
}

async function main(): Promise<void> {
  const options = parseTournamentIntakeCli(process.argv.slice(2))
  const text = await readFile(resolve(options.file), 'utf8')
  const result = await new LocalTournamentQueueRepository().intake(
    text,
    new Date().toISOString(),
    options.write,
  )
  console.log(
    options.json ? JSON.stringify(result, null, 2) : formatPreview(result),
  )
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
