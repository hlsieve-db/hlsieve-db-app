import { UPDATE_PATHS } from './paths'
import { writeUpdateReports } from './report'
import { auditPreparedUpdate } from './workflow'

try {
  const report = await auditPreparedUpdate()
  await writeUpdateReports(
    report,
    UPDATE_PATHS.reportJson,
    UPDATE_PATHS.reportMarkdown,
  )
  await writeFile(
    UPDATE_PATHS.historyCandidate,
    `${JSON.stringify(buildHistoryCandidate(report), null, 2)}\n`,
    'utf8',
  )
  console.log(JSON.stringify(report, null, 2))
  process.exitCode = report.exitCode
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
import { writeFile } from 'node:fs/promises'

import { buildHistoryCandidate } from './buildHistoryCandidate'
