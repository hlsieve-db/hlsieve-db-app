import { TOURNAMENT_DATA_START_DATE } from '../../../src/domain/tournaments/constants'
import { TOURNAMENT_SERIES_CONFIGS } from './seriesConfig'

export type CollectorCliOptions = {
  dryRun: boolean
  headless: boolean
  refresh: boolean
  from: string
  to: string
  seriesIds: string[]
  sourceEventId?: string
  delayMs: number
  smoke: boolean
}

function optionValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  return index < 0 ? undefined : args[index + 1]
}

function defaultRange(): { from: string; to: string } {
  const today = new Date()
  const to = today.toISOString().slice(0, 10)
  const fromDate = new Date(`${to}T00:00:00Z`)
  fromDate.setUTCDate(fromDate.getUTCDate() - 13)
  return {
    from: [
      fromDate.toISOString().slice(0, 10),
      TOURNAMENT_DATA_START_DATE,
    ].sort()[1]!,
    to,
  }
}

export function parseCollectorCli(args: string[]): CollectorCliOptions {
  const defaults = defaultRange()
  const headed = args.includes('--headed')
  const headless = args.includes('--headless')
  if (headed && headless)
    throw new Error('Choose either --headed or --headless.')
  const publish = args.includes('--publish')
  const dryRunFlag = args.includes('--dry-run')
  if (publish && dryRunFlag)
    throw new Error('Choose either --dry-run or --publish.')
  const smoke = args.includes('--smoke')
  if (smoke && publish) throw new Error('--smoke is dry-run only.')
  const sourceEventId = optionValue(args, '--event-id')
  if (smoke && !sourceEventId) {
    throw new Error('--smoke requires an explicit --event-id.')
  }
  const seriesValue = optionValue(args, '--series')
  const delayValue = optionValue(args, '--delay-ms')
  const delayMs = delayValue === undefined ? 3_000 : Number(delayValue)
  if (!Number.isSafeInteger(delayMs) || delayMs < 0) {
    throw new Error('--delay-ms must be a non-negative integer.')
  }
  return {
    dryRun: !publish,
    headless,
    refresh: args.includes('--refresh'),
    from: optionValue(args, '--from') ?? defaults.from,
    to: optionValue(args, '--to') ?? defaults.to,
    seriesIds: seriesValue
      ? seriesValue.split(',').map((value) => value.trim())
      : TOURNAMENT_SERIES_CONFIGS.map((config) => config.seriesId),
    sourceEventId,
    delayMs,
    smoke,
  }
}
