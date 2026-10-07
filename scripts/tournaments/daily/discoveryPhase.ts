import type { TournamentAutomatedIntakeResult } from '../discovery/automatedIntake'
import type {
  TournamentDiscoveryCandidate,
  TournamentDiscoveryRunResult,
} from '../discovery/types'

export type TournamentDailyDiscoveryPhaseResult =
  | {
      status: 'ok' | 'degraded'
      discovery: TournamentDiscoveryRunResult
      intake: TournamentAutomatedIntakeResult
    }
  | { status: 'degraded'; error: string }

export async function runTournamentDailyDiscoveryPhase(options: {
  discover: () => Promise<TournamentDiscoveryRunResult>
  intake: (
    candidates: readonly TournamentDiscoveryCandidate[],
  ) => Promise<TournamentAutomatedIntakeResult>
}): Promise<TournamentDailyDiscoveryPhaseResult> {
  let discovery: TournamentDiscoveryRunResult
  try {
    discovery = await options.discover()
  } catch (error) {
    return {
      status: 'degraded',
      error: error instanceof Error ? error.message : String(error),
    }
  }
  const intake = await options.intake(discovery.candidates)
  const degraded =
    discovery.summary.saturatedQueries > 0 ||
    discovery.summary.failedQueries > 0 ||
    discovery.summary.challengeQueries > 0
  return { status: degraded ? 'degraded' : 'ok', discovery, intake }
}
