import { compareUnicodeCodePoints } from '../hash/stableStringify'
import { diffCardSnapshots } from './diffCardSnapshots'
import type {
  CardCollectionDiffInput,
  CardCollectionDiffReport,
  CardDiffSnapshot,
  CurrentCardFailure,
  DiffIssue,
  DiffResult,
} from './types'

function snapshotsByCardNumber(
  snapshots: readonly CardDiffSnapshot[],
  duplicateCode: 'DUPLICATE_PREVIOUS_CARD' | 'DUPLICATE_CURRENT_CARD',
  errors: DiffIssue[],
): Map<string, CardDiffSnapshot> {
  const result = new Map<string, CardDiffSnapshot>()
  for (const snapshot of snapshots) {
    if (result.has(snapshot.cardNumber)) {
      errors.push({
        code: duplicateCode,
        cardNumber: snapshot.cardNumber,
        message: `Duplicate snapshot for ${snapshot.cardNumber}.`,
      })
    } else {
      result.set(snapshot.cardNumber, snapshot)
    }
  }
  return result
}

function failuresByCardNumber(
  failures: readonly CurrentCardFailure[],
  errors: DiffIssue[],
): Map<string, CurrentCardFailure> {
  const result = new Map<string, CurrentCardFailure>()
  for (const failure of failures) {
    const existing = result.get(failure.cardNumber)
    if (!existing) {
      result.set(failure.cardNumber, failure)
    } else if (
      existing.stage !== failure.stage ||
      existing.message !== failure.message
    ) {
      errors.push({
        code: 'CONTRADICTORY_FAILURES',
        cardNumber: failure.cardNumber,
        message: `Contradictory failures exist for ${failure.cardNumber}.`,
      })
    }
  }
  return result
}

export function diffCardCollections(
  input: CardCollectionDiffInput,
): DiffResult<CardCollectionDiffReport> {
  const errors: DiffIssue[] = []
  const previous = snapshotsByCardNumber(
    input.previous,
    'DUPLICATE_PREVIOUS_CARD',
    errors,
  )
  const current = snapshotsByCardNumber(
    input.current,
    'DUPLICATE_CURRENT_CARD',
    errors,
  )
  const failures = failuresByCardNumber(input.failures, errors)

  for (const cardNumber of current.keys()) {
    if (failures.has(cardNumber)) {
      errors.push({
        code: 'CURRENT_AND_FAILURE_CONFLICT',
        cardNumber,
        message: `Current snapshot and failure both exist for ${cardNumber}.`,
      })
    }
  }
  if (errors.length > 0) return { ok: false, errors }

  const cardNumbers = [
    ...new Set([...previous.keys(), ...current.keys(), ...failures.keys()]),
  ].sort(compareUnicodeCodePoints)
  const entries = []
  for (const cardNumber of cardNumbers) {
    const result = diffCardSnapshots({
      previous: previous.get(cardNumber),
      current: current.get(cardNumber),
      failure: failures.get(cardNumber),
      discoveryComplete: input.discoveryComplete,
    })
    if (!result.ok) errors.push(...result.errors)
    else entries.push(result.value)
  }
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: { entries }, warnings: [] }
}
