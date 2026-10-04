export type TournamentQueueCliOptions =
  | { command: 'add'; input: string }
  | { command: 'list' }
  | { command: 'process'; maxItems: number }
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
  throw new Error('Queue command must be add, list, process, or unlock.')
}
