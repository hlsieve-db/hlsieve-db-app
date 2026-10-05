export type TournamentQueueCliOptions =
  | { command: 'add'; input: string }
  | { command: 'list' }
  | { command: 'process'; maxItems: number; sourceEventId?: string }
  | { command: 'refresh-ready'; sourceEventId: string }
  | { command: 'publish'; sourceEventId: string; write: boolean }
  | { command: 'unlock'; force: boolean }

export function describeTournamentQueueAdd(
  previousStatus: string | undefined,
  currentStatus: string,
): string {
  if (previousStatus === undefined) return 'added'
  if (previousStatus !== currentStatus && currentStatus === 'queued') {
    return 'requeued'
  }
  return `existing/${currentStatus}`
}

export function parseTournamentQueueCli(
  args: string[],
): TournamentQueueCliOptions {
  const command = args[0]
  if (command === 'add') {
    if (args.length !== 2 || !args[1]) {
      throw new Error(
        'Usage: tournaments:queue -- add <Result-URL-or-Event-ID>',
      )
    }
    return { command, input: args[1] }
  }
  if (command === 'list') {
    if (args.length !== 1) throw new Error('Usage: tournaments:queue -- list')
    return { command }
  }
  if (command === 'process') {
    const maxIndex = args.indexOf('--max')
    const eventIndex = args.indexOf('--event-id')
    if (maxIndex >= 0 && eventIndex >= 0) {
      throw new Error('process accepts either --max or --event-id, not both.')
    }
    if (eventIndex >= 0) {
      if (args.length !== 3 || !args[eventIndex + 1]) {
        throw new Error('Usage: tournaments:queue -- process --event-id <ID>')
      }
      const sourceEventId = args[eventIndex + 1]!
      if (!/^\d+$/.test(sourceEventId)) {
        throw new Error('process --event-id requires a numeric Event ID.')
      }
      return { command, maxItems: 1, sourceEventId }
    }
    const maxItems = maxIndex < 0 ? 1 : Number(args[maxIndex + 1])
    if (
      (maxIndex >= 0 && args.length !== 3) ||
      !Number.isSafeInteger(maxItems) ||
      maxItems < 1 ||
      maxItems > 10
    ) {
      throw new Error('process --max must be an integer from 1 through 10.')
    }
    return { command, maxItems }
  }
  if (command === 'unlock') {
    if (args.length > 2 || (args[1] !== undefined && args[1] !== '--force')) {
      throw new Error('Usage: tournaments:queue -- unlock [--force]')
    }
    return { command, force: args[1] === '--force' }
  }
  if (command === 'refresh-ready') {
    if (args.length !== 2 || !/^\d+$/.test(args[1] ?? '')) {
      throw new Error('Usage: tournaments:queue -- refresh-ready <Event-ID>')
    }
    return { command, sourceEventId: args[1]! }
  }
  if (command === 'publish') {
    if (
      (args.length !== 2 && args.length !== 3) ||
      !/^\d+$/.test(args[1] ?? '') ||
      (args[2] !== undefined && args[2] !== '--write')
    ) {
      throw new Error(
        'Usage: tournaments:queue -- publish <Event-ID> [--write]',
      )
    }
    return { command, sourceEventId: args[1]!, write: args[2] === '--write' }
  }
  throw new Error(
    'Queue command must be add, list, process, refresh-ready, publish, or unlock.',
  )
}
