import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { UpdateAuditReport } from './types'

function list(values: readonly string[]): string {
  return values.length === 0
    ? '- none'
    : values.map((value) => `- ${value}`).join('\n')
}

export function renderUpdateReportMarkdown(report: UpdateAuditReport): string {
  return `# Card data update audit

- Status: ${report.status}
- Exit code: ${report.exitCode}
- Generated: ${report.generatedAt}
- Logical cards: ${report.summary.logicalCards.old} -> ${report.summary.logicalCards.next} (${report.summary.logicalCards.delta})
- Printings: ${report.summary.printings.old} -> ${report.summary.printings.next} (${report.summary.printings.delta})
- Cards dataVersion: ${report.versions.oldCardsDataVersion} -> ${report.versions.newCardsDataVersion}
- Printings dataVersion: ${report.versions.oldPrintingsDataVersion} -> ${report.versions.newPrintingsDataVersion}

## Added cards

${list(report.cards.added)}

## Changed cards

${list(report.cards.changed.map((card) => `${card.cardNumber}: ${card.fields.map((field) => field.field).join(', ')}`))}

## Removed cards

${list(report.cards.removed)}

## Added printings

${list(report.printings.addedOfficialIds)}

## Removed printings

${list(report.printings.removedOfficialIds)}

## Warnings

${list(report.warnings.map((warning) => `${warning.code}: ${warning.message}`))}

## Blocks

${list(report.blocks.map((block) => `${block.code}: ${block.message}`))}
`
}

export async function writeUpdateReports(
  report: UpdateAuditReport,
  jsonPath: string,
  markdownPath: string,
): Promise<void> {
  await Promise.all([
    mkdir(dirname(jsonPath), { recursive: true }),
    mkdir(dirname(markdownPath), { recursive: true }),
  ])
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
    writeFile(markdownPath, renderUpdateReportMarkdown(report), 'utf8'),
  ])
}
