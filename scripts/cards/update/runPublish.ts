import { readFile } from 'node:fs/promises'

import { validateCardPrintingsSnapshotText } from '../publish/validateCardPrintingsSnapshot'
import { validateCardsSnapshotText } from '../publish/validateCardsSnapshot'
import { UPDATE_PATHS } from './paths'
import { publishPreparedFiles } from './publishPreparedFiles'
import { writeUpdateReports } from './report'
import { auditPreparedUpdate } from './workflow'

try {
  const report = await auditPreparedUpdate()
  await writeUpdateReports(
    report,
    UPDATE_PATHS.reportJson,
    UPDATE_PATHS.reportMarkdown,
  )
  if (report.status !== 'safe') {
    console.error(`PUBLISH_BLOCKED: audit status is ${report.status}.`)
    process.exitCode = report.exitCode
  } else {
    const cardsText = await readFile(UPDATE_PATHS.candidateCards, 'utf8')
    const printingsText = await readFile(
      UPDATE_PATHS.candidatePrintings,
      'utf8',
    )
    const cards = validateCardsSnapshotText(cardsText)
    if (!cards.ok) throw new Error(cards.errors.join('; '))
    const printings = validateCardPrintingsSnapshotText(
      printingsText,
      cards.value,
    )
    if (!printings.ok) throw new Error(printings.errors.join('; '))
    await publishPreparedFiles([
      {
        source: UPDATE_PATHS.candidateCards,
        destination: UPDATE_PATHS.baselineCards,
      },
      {
        source: UPDATE_PATHS.candidatePrintings,
        destination: UPDATE_PATHS.baselinePrintings,
      },
      {
        source: UPDATE_PATHS.candidateSitemap,
        destination: UPDATE_PATHS.publicSitemap,
      },
      {
        source: UPDATE_PATHS.candidateRobots,
        destination: UPDATE_PATHS.publicRobots,
      },
    ])
    console.log(
      'Published reviewed Card snapshots and SEO source assets. Run build and verify next.',
    )
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
