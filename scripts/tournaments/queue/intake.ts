import {
  enqueueTournament,
  type TournamentQueueFile,
  type TournamentQueueStatus,
} from './queue'
import { parseTournamentSourceEventId } from './submission'

export type TournamentIntakeClassification =
  'new' | TournamentQueueStatus | 'invalid'

export type TournamentIntakeEntry = {
  input: string
  line: number
  sourceEventId?: string
  classification: TournamentIntakeClassification
  action: 'add' | 'requeue' | 'unchanged' | 'reject'
  error?: string
}

export type TournamentIntakePreview = {
  entries: TournamentIntakeEntry[]
  summary: Record<TournamentIntakeClassification, number>
}

const CLASSIFICATIONS: readonly TournamentIntakeClassification[] = [
  'new',
  'queued',
  'collecting',
  'waiting-result',
  'needs-review',
  'ready',
  'published',
  'invalid',
]

export function previewTournamentIntake(
  text: string,
  queue: TournamentQueueFile,
): TournamentIntakePreview {
  const entries: TournamentIntakeEntry[] = []
  const seen = new Set<string>()

  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const input = rawLine.trim()
    if (input === '') continue
    let sourceEventId: string
    try {
      sourceEventId = parseTournamentSourceEventId(input)
    } catch (error) {
      entries.push({
        input,
        line: index + 1,
        classification: 'invalid',
        action: 'reject',
        error: error instanceof Error ? error.message : String(error),
      })
      continue
    }
    if (seen.has(sourceEventId)) continue
    seen.add(sourceEventId)
    const existing = queue.records.find(
      (record) => record.sourceEventId === sourceEventId,
    )
    const classification = existing?.status ?? 'new'
    entries.push({
      input,
      line: index + 1,
      sourceEventId,
      classification,
      action:
        classification === 'new'
          ? 'add'
          : classification === 'needs-review' || classification === 'published'
            ? 'requeue'
            : 'unchanged',
    })
  }

  const summary = Object.fromEntries(
    CLASSIFICATIONS.map((classification) => [classification, 0]),
  ) as Record<TournamentIntakeClassification, number>
  for (const entry of entries) summary[entry.classification] += 1
  return { entries, summary }
}

export function applyTournamentIntake(
  queue: TournamentQueueFile,
  preview: TournamentIntakePreview,
  now: string,
): TournamentQueueFile {
  return preview.entries.reduce(
    (current, entry) =>
      entry.action === 'add' || entry.action === 'requeue'
        ? enqueueTournament(current, entry.sourceEventId!, now)
        : current,
    queue,
  )
}
