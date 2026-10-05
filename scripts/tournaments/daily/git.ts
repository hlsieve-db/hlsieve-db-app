import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const PUBLICATION_PATH =
  /^public\/tournaments\/(index\.json|oshi-master\.json|events\/.+\.json)$/
const PUBLICATION_TEMP_PATH =
  /^public\/\.tournaments\.[0-9a-f-]+\.(candidate|backup)(?:\/.*)?$/

export type DailyGitStart =
  | 'synced'
  | 'publication-pending-commit'
  | 'commit-pending-push'
  | 'production-pending'

export type PublicationInventory = {
  allowed: string[]
  temporary: string[]
  unexpectedTracked: string[]
  unexpectedUntracked: string[]
}
async function git(args: string[]): Promise<string> {
  return (await exec('git', args, { encoding: 'utf8' })).stdout.trim()
}

export function normalizeGitPorcelainOutput(output: string): string {
  return output.replace(/\r?\n$/, '')
}

async function gitStatus(): Promise<string> {
  return normalizeGitPorcelainOutput(
    (await exec('git', ['status', '--porcelain'], { encoding: 'utf8' })).stdout,
  )
}

export function validateDailyGitState(input: {
  branch: string
  status: string
  behind: number
  ahead: number
  subject?: string
  targetDate: string
  allowPublicationDiff?: boolean
}): 'synced' | 'commit-pending-push' {
  if (input.branch !== 'main') throw new Error('Daily requires branch main.')
  if (input.status.length > 0 && !input.allowPublicationDiff)
    throw new Error('Daily requires a clean working tree.')
  if (input.behind !== 0 || input.ahead > 1)
    throw new Error(
      'Daily requires local main to be synchronized or one resumable commit ahead.',
    )
  if (input.ahead === 1) {
    if (
      input.subject !==
      `data: publish tournament results for ${input.targetDate}`
    )
      throw new Error('Daily found an unrelated local commit.')
    return 'commit-pending-push'
  }
  return 'synced'
}

export function validatePublicationPaths(paths: string[]): string[] {
  if (paths.some((path) => !PUBLICATION_PATH.test(path)))
    throw new Error('Daily found an unexpected tracked or untracked diff.')
  return paths
}

export function classifyPublicationStatus(
  status: string,
): PublicationInventory {
  const inventory: PublicationInventory = {
    allowed: [],
    temporary: [],
    unexpectedTracked: [],
    unexpectedUntracked: [],
  }
  for (const line of status.split('\n').filter(Boolean)) {
    const path = line.slice(3).replace(/^"|"$/g, '')
    if (PUBLICATION_PATH.test(path)) inventory.allowed.push(path)
    else if (PUBLICATION_TEMP_PATH.test(path)) inventory.temporary.push(path)
    else if (line.startsWith('??')) inventory.unexpectedUntracked.push(path)
    else inventory.unexpectedTracked.push(path)
  }
  return inventory
}

function inventoryError(
  inventory: PublicationInventory,
  reason: string,
): Error {
  return new Error(
    [
      `Daily publication diff guard failed: ${reason}.`,
      `Allowed changed: ${inventory.allowed.join(', ') || '-'}`,
      `Unexpected tracked: ${inventory.unexpectedTracked.join(', ') || '-'}`,
      `Unexpected untracked: ${inventory.unexpectedUntracked.join(', ') || '-'}`,
      `Observed temp files: ${inventory.temporary.join(', ') || '-'}`,
    ].join('\n'),
  )
}

export async function waitForStablePublicationDiff(options: {
  scan: () => Promise<string>
  pause?: () => Promise<void>
  now?: () => number
  timeoutMs?: number
}): Promise<string[]> {
  const pause =
    options.pause ??
    (() => new Promise<void>((resolve) => setTimeout(resolve, 100)))
  const now = options.now ?? Date.now
  const timeoutMs = options.timeoutMs ?? 5_000
  const startedAt = now()
  let previous: string | undefined
  while (true) {
    const status = await options.scan()
    const latest = classifyPublicationStatus(status)
    const stable = status === previous && latest.temporary.length === 0
    if (stable) {
      if (
        latest.unexpectedTracked.length > 0 ||
        latest.unexpectedUntracked.length > 0
      ) {
        throw inventoryError(latest, 'unexpected paths remained stable')
      }
      return validatePublicationPaths(latest.allowed)
    }
    if (now() - startedAt >= timeoutMs) {
      throw inventoryError(latest, 'filesystem did not settle before timeout')
    }
    previous = status
    await pause()
  }
}

export async function assertDailyGitStart(
  targetDate: string,
  allowPublicationDiff = false,
): Promise<DailyGitStart> {
  const branch = await git(['branch', '--show-current'])
  const status = await gitStatus()
  if (status.length > 0) {
    if (!allowPublicationDiff)
      throw new Error('Daily requires a clean working tree.')
    await publicationDiff()
  }
  const [behind, ahead] = (
    await git(['rev-list', '--left-right', '--count', 'origin/main...HEAD'])
  )
    .split(/\s+/)
    .map(Number)
  const subject =
    ahead === 1 ? await git(['log', '-1', '--format=%s']) : undefined
  const state = validateDailyGitState({
    branch,
    status,
    behind: behind!,
    ahead: ahead!,
    subject,
    targetDate,
    allowPublicationDiff,
  })
  return status.length > 0 && allowPublicationDiff && state === 'synced'
    ? 'publication-pending-commit'
    : state
}

export async function assertDailyRecoveryCommit(
  expectedCommit: string,
): Promise<void> {
  const head = await git(['rev-parse', 'HEAD'])
  if (head !== expectedCommit)
    throw new Error('Daily recovery checkpoint commit does not match HEAD.')
}

export async function fetchAndAssertNotBehind(
  allowAheadOne = false,
): Promise<void> {
  await git(['fetch', 'origin'])
  const [behind, ahead] = (
    await git(['rev-list', '--left-right', '--count', 'origin/main...HEAD'])
  )
    .split(/\s+/)
    .map(Number)
  if (behind !== 0 || ahead > (allowAheadOne ? 1 : 0))
    throw new Error('Daily stopped because main is behind or diverged.')
}

export async function publicationDiff(): Promise<string[]> {
  return waitForStablePublicationDiff({
    scan: gitStatus,
  })
}

export async function commitDailyPublication(
  targetDate: string,
  paths: string[],
): Promise<string | undefined> {
  if (paths.length === 0) return undefined
  await git(['add', '--', ...paths])
  await git(['diff', '--cached', '--check'])
  await git([
    'commit',
    '-m',
    `data: publish tournament results for ${targetDate}`,
  ])
  return git(['rev-parse', 'HEAD'])
}

export async function pushDailyCommit(): Promise<void> {
  await git(['push', 'origin', 'main'])
}
