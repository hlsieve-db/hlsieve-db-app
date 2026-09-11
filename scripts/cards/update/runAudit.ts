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
  console.log(JSON.stringify(report, null, 2))
  process.exitCode = report.exitCode
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
