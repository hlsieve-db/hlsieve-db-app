export type TournamentIntakeCliOptions = {
  file: string
  write: boolean
  json: boolean
}

export function parseTournamentIntakeCli(
  args: readonly string[],
): TournamentIntakeCliOptions {
  let file: string | undefined
  let write = false
  let json = false
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--file' && args[index + 1]) {
      if (file !== undefined)
        throw new Error('--file may only be specified once.')
      file = args[index + 1]
      index += 1
    } else if (argument === '--write') {
      write = true
    } else if (argument === '--json') {
      json = true
    } else {
      throw new Error(
        'Usage: tournaments:intake -- --file <path> [--write] [--json]',
      )
    }
  }
  if (!file) {
    throw new Error(
      'Usage: tournaments:intake -- --file <path> [--write] [--json]',
    )
  }
  return { file, write, json }
}
