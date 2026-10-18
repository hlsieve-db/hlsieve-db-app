import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export type ContextArea = 'tournaments' | 'cards' | 'deck'

type JsonObject = Record<string, unknown>

export type ContextSnapshot = {
  area: ContextArea
  git: {
    branch: string
    head: string
    ahead: number
    behind: number
    clean: boolean
    changedFiles: string[]
  }
  scripts: string[]
  directories: string[]
  suggestedFiles: string[]
  protectedFiles: string[]
  runtimePaths?: string[]
  data?: Record<string, string | number>
}

export type ContextDependencies = {
  git(args: string[]): string
  readJson(path: string): JsonObject
  readPackageScripts(): Record<string, string>
}

const AREA_CONFIG: Record<
  ContextArea,
  Omit<ContextSnapshot, 'area' | 'git' | 'scripts' | 'data'> & {
    scriptPrefixes: string[]
  }
> = {
  tournaments: {
    scriptPrefixes: ['tournaments:'],
    directories: [
      'scripts/tournaments/',
      'src/domain/tournaments/',
      'src/components/tournaments/',
      'src/pages/Tournament*',
    ],
    suggestedFiles: [
      'scripts/tournaments/daily/workflow.ts',
      'scripts/tournaments/queue/processor.ts',
      'src/domain/tournaments/types.ts',
      'src/pages/TournamentListPage.tsx',
      'src/pages/TournamentDetailPages.tsx',
    ],
    protectedFiles: [
      'public/tournaments/index.json',
      'public/tournaments/oshi-master.json',
      'public/tournaments/events/*.json',
    ],
    runtimePaths: ['.cache/tournaments/', '.cache/tournaments/queue/'],
  },
  cards: {
    scriptPrefixes: ['cards:'],
    directories: ['scripts/cards/', 'src/domain/cards/'],
    suggestedFiles: [
      'scripts/cards/update/workflow.ts',
      'scripts/cards/generate/buildCardsDataFile.ts',
      'scripts/cards/generate/buildCardPrintingsDataFile.ts',
      'src/domain/cards/types.ts',
    ],
    protectedFiles: ['public/cards.json', 'public/card-printings.json'],
  },
  deck: {
    scriptPrefixes: [],
    directories: [
      'src/domain/decks/',
      'src/components/decks/',
      'src/pages/Deck*',
    ],
    suggestedFiles: [
      'src/domain/decks/types.ts',
      'src/domain/decks/deck.ts',
      'src/domain/decks/displayOrder.ts',
      'src/components/decks/DeckEntryPresentation.tsx',
      'src/pages/DeckEditPage.tsx',
    ],
    protectedFiles: [],
  },
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0
}

function recordLength(value: unknown): number {
  return value && typeof value === 'object'
    ? Object.keys(value as JsonObject).length
    : 0
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : 'unknown'
}

function cardDataSummary(deps: ContextDependencies) {
  const cards = deps.readJson('public/cards.json')
  const printings = deps.readJson('public/card-printings.json')
  const printingCards = Array.isArray(printings.cards)
    ? printings.cards
    : Object.values((printings.cards as JsonObject | undefined) ?? {})
  return {
    logicalCards: arrayLength(cards.cards),
    printings: printingCards.reduce((total, card) => {
      if (Array.isArray(card)) return total + card.length
      if (card && typeof card === 'object') {
        return total + arrayLength((card as JsonObject).printings)
      }
      return total
    }, 0),
    cardsDataVersion: stringValue(cards.dataVersion),
    printingsDataVersion: stringValue(printings.dataVersion),
  }
}

function tournamentDataSummary(deps: ContextDependencies) {
  const index = deps.readJson('public/tournaments/index.json')
  const oshi = deps.readJson('public/tournaments/oshi-master.json')
  const events = Array.isArray(index.events) ? index.events : []
  return {
    events: events.length,
    results: events.reduce((total, event) => {
      if (!event || typeof event !== 'object') return total
      return total + arrayLength((event as JsonObject).results)
    }, 0),
    tournamentDataVersion: stringValue(index.dataVersion),
    oshiCards: recordLength(oshi.cards),
    oshiCardsDataVersion: stringValue(oshi.cardsDataVersion),
  }
}

export function createContextSnapshot(
  area: ContextArea,
  deps: ContextDependencies,
): ContextSnapshot {
  const config = AREA_CONFIG[area]
  const changedFiles = deps
    .git(['status', '--porcelain'])
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3))
  const [behind = '0', ahead = '0'] = deps
    .git(['rev-list', '--left-right', '--count', 'origin/main...HEAD'])
    .trim()
    .split(/\s+/)
  const packageScripts = deps.readPackageScripts()
  const scripts = Object.keys(packageScripts)
    .filter((name) =>
      config.scriptPrefixes.some((prefix) => name.startsWith(prefix)),
    )
    .sort()

  return {
    area,
    git: {
      branch: deps.git(['branch', '--show-current']).trim(),
      head: deps.git(['rev-parse', '--short', 'HEAD']).trim(),
      ahead: Number(ahead),
      behind: Number(behind),
      clean: changedFiles.length === 0,
      changedFiles,
    },
    scripts,
    directories: config.directories,
    suggestedFiles: config.suggestedFiles,
    protectedFiles: config.protectedFiles,
    ...(config.runtimePaths ? { runtimePaths: config.runtimePaths } : {}),
    ...(area === 'cards'
      ? { data: cardDataSummary(deps) }
      : area === 'tournaments'
        ? { data: tournamentDataSummary(deps) }
        : {}),
  }
}

export function formatContextSnapshot(snapshot: ContextSnapshot): string {
  const lines = [
    `AI context: ${snapshot.area}`,
    `Git: ${snapshot.git.branch} @ ${snapshot.git.head}; ahead ${snapshot.git.ahead}, behind ${snapshot.git.behind}; ${snapshot.git.clean ? 'clean' : 'dirty'}`,
  ]
  if (!snapshot.git.clean) {
    lines.push(`Changed files: ${snapshot.git.changedFiles.join(', ')}`)
  }
  if (snapshot.data) {
    lines.push(
      'Data: ' +
        Object.entries(snapshot.data)
          .map(([key, value]) => `${key}=${value}`)
          .join(', '),
    )
  }
  const section = (title: string, values: string[]) => {
    lines.push(`${title}:`)
    lines.push(
      ...(values.length > 0 ? values.map((value) => `- ${value}`) : ['- none']),
    )
  }
  section('Relevant scripts', snapshot.scripts)
  section('Relevant directories', snapshot.directories)
  section('Suggested files', snapshot.suggestedFiles)
  section('Protected/generated files', snapshot.protectedFiles)
  if (snapshot.runtimePaths) section('Runtime paths', snapshot.runtimePaths)
  return `${lines.join('\n')}\n`
}

export function parseContextArgs(args: string[]): {
  area: ContextArea
  json: boolean
} {
  const areaIndex = args.indexOf('--area')
  const area = areaIndex >= 0 ? args[areaIndex + 1] : undefined
  if (area !== 'tournaments' && area !== 'cards' && area !== 'deck') {
    throw new Error('--area must be tournaments, cards, or deck.')
  }
  return { area, json: args.includes('--json') }
}

const defaultDependencies: ContextDependencies = {
  git: (args) => execFileSync('git', args, { encoding: 'utf8' }),
  readJson: (path) => JSON.parse(readFileSync(path, 'utf8')) as JsonObject,
  readPackageScripts: () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts?: Record<string, string>
    }
    return packageJson.scripts ?? {}
  },
}

function main(): void {
  const options = parseContextArgs(process.argv.slice(2))
  const snapshot = createContextSnapshot(options.area, defaultDependencies)
  process.stdout.write(
    options.json
      ? `${JSON.stringify(snapshot)}\n`
      : formatContextSnapshot(snapshot),
  )
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
