import {
  isTournamentQueueRecordDue,
  type TournamentQueueRecord,
} from '../queue/queue'

export type TournamentDateProbeResult = {
  sourceEventId: string
  eventDate: string
}

export async function selectDueTournamentEventsForDate(options: {
  records: readonly TournamentQueueRecord[]
  targetDate: string
  now: string
  probe: (sourceEventId: string) => Promise<TournamentDateProbeResult>
  persist: (sourceEventId: string, eventDate: string) => Promise<void>
}): Promise<{ selected: string[]; unselected: string[]; probed: string[] }> {
  const selected: string[] = []
  const unselected: string[] = []
  const probed: string[] = []
  for (const record of options.records) {
    if (!isTournamentQueueRecordDue(record, options.now)) continue
    let eventDate = record.eventDate
    if (
      eventDate === undefined ||
      record.eventDateSource !== 'bushi-navi-public-browser-dom'
    ) {
      const metadata = await options.probe(record.sourceEventId)
      if (metadata.sourceEventId !== record.sourceEventId) {
        throw new Error('Tournament metadata probe Event identity mismatch.')
      }
      eventDate = metadata.eventDate
      await options.persist(record.sourceEventId, eventDate)
      probed.push(record.sourceEventId)
    }
    const destination = eventDate === options.targetDate ? selected : unselected
    destination.push(record.sourceEventId)
  }
  return { selected, unselected, probed }
}

export async function processSelectedTournamentEvents(
  selected: readonly string[],
  process: (sourceEventId: string) => Promise<void>,
): Promise<void> {
  for (const sourceEventId of selected) await process(sourceEventId)
}
