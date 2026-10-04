export type PrepareOptions = {
  forceRefreshOfficialIds: ReadonlySet<string>
}

export function parsePrepareOptions(args: readonly string[]): PrepareOptions {
  const forceRefreshOfficialIds = new Set<string>()

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument !== '--refresh-official-id') {
      throw new Error(`Unknown cards:update:prepare option: ${argument}`)
    }
    const officialId = args[index + 1]
    if (!officialId || !/^\d+$/.test(officialId)) {
      throw new Error('--refresh-official-id requires a numeric officialId.')
    }
    forceRefreshOfficialIds.add(officialId)
    index += 1
  }

  return { forceRefreshOfficialIds }
}
