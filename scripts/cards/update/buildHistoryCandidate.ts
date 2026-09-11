import type { CardDataUpdateEntry } from '../../../src/domain/updates/types'
import type { UpdateAuditReport } from './types'

export function requiresHistoryEntry(report: UpdateAuditReport): boolean {
  return (
    report.cards.added.length > 0 ||
    report.cards.changed.length > 0 ||
    report.cards.removed.length > 0 ||
    report.printings.addedOfficialIds.length > 0 ||
    report.printings.removedOfficialIds.length > 0
  )
}

export function hasReviewedHistoryEntry(
  report: UpdateAuditReport,
  entries: readonly CardDataUpdateEntry[],
): boolean {
  return (
    !requiresHistoryEntry(report) ||
    entries.some(
      (entry) =>
        entry.cardsDataVersion === report.versions.newCardsDataVersion &&
        entry.printingsDataVersion === report.versions.newPrintingsDataVersion,
    )
  )
}

export function buildHistoryCandidate(
  report: UpdateAuditReport,
): CardDataUpdateEntry {
  const date = report.generatedAt.slice(0, 10)
  const added = report.cards.added.length
  const changed = report.cards.changed.length
  const summary =
    added > 0
      ? `カードデータを${added}件追加しました`
      : changed > 0
        ? `カード情報を${changed}件修正しました`
        : 'カードデータを更新しました'

  return {
    id: `card-data-${date}`,
    publishedAt: date,
    cardsDataVersion: report.versions.newCardsDataVersion,
    printingsDataVersion: report.versions.newPrintingsDataVersion,
    summary,
    addedCards: added,
    changedCards: changed,
    removedCards: report.cards.removed.length,
    addedPrintings: report.printings.addedOfficialIds.length,
    removedPrintings: report.printings.removedOfficialIds.length,
    notes: [
      '公開日、概要、代表的な変更内容を人間が確認してから履歴へ追加してください。',
    ],
  }
}
