import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)
async function git(args: string[]): Promise<string> {
  return (await exec('git', args, { encoding: 'utf8' })).stdout.trim()
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
  if (
    paths.some(
      (path) =>
        !/^public\/tournaments\/(index\.json|oshi-master\.json|events\/.+\.json)$/.test(
          path,
        ),
    )
  )
    throw new Error('Daily found an unexpected tracked or untracked diff.')
  return paths
}

export async function assertDailyGitStart(
  targetDate: string,
  allowPublicationDiff = false,
): Promise<'synced' | 'commit-pending-push'> {
  const branch = await git(['branch', '--show-current'])
  const status = await git(['status', '--porcelain'])
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
  return validateDailyGitState({
    branch,
    status,
    behind: behind!,
    ahead: ahead!,
    subject,
    targetDate,
    allowPublicationDiff,
  })
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
  const lines = (await git(['status', '--porcelain']))
    .split('\n')
    .filter(Boolean)
  const paths = lines.map((line) => line.slice(3).replace(/^"|"$/g, ''))
  return validatePublicationPaths(paths)
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
