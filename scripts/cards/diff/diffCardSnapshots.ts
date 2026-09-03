import { stableStringify } from '../hash/stableStringify'
import { buildCategoryPayloads } from './buildCategoryPayloads'
import { diffValues } from './diffValues'
import {
  DIFF_CATEGORY_ORDER,
  type CardDiffEntry,
  type CardSnapshotDiffInput,
  type CurrentCardFailure,
  type DiffIssue,
  type DiffResult,
} from './types'

function entryBase(
  cardNumber: string,
): Pick<CardDiffEntry, 'cardNumber' | 'changedCategories' | 'changedFields'> {
  return { cardNumber, changedCategories: [], changedFields: [] }
}

function inputCardNumber(input: CardSnapshotDiffInput): string | undefined {
  return (
    input.current?.cardNumber ??
    input.previous?.cardNumber ??
    input.failure?.cardNumber
  )
}

function validateInput(input: CardSnapshotDiffInput): DiffIssue[] {
  const issues: DiffIssue[] = []
  for (const snapshot of [input.previous, input.current]) {
    if (snapshot && snapshot.cardNumber !== snapshot.card.cardNumber) {
      issues.push({
        code: 'SNAPSHOT_CARD_NUMBER_MISMATCH',
        cardNumber: snapshot.cardNumber,
        message: `Snapshot cardNumber ${snapshot.cardNumber} does not match card.cardNumber ${snapshot.card.cardNumber}.`,
      })
    }
  }
  const numbers = [
    input.previous?.cardNumber,
    input.current?.cardNumber,
    input.failure?.cardNumber,
  ].filter((value): value is string => value !== undefined)
  if (new Set(numbers).size > 1) {
    issues.push({
      code: 'DIFF_CARD_NUMBER_MISMATCH',
      message: `Card diff input contains different card numbers: ${numbers.join(', ')}.`,
    })
  }
  if (input.current && input.failure) {
    issues.push({
      code: 'CURRENT_AND_FAILURE_CONFLICT',
      cardNumber: input.current.cardNumber,
      message: `Current snapshot and failure both exist for ${input.current.cardNumber}.`,
    })
  }
  if (numbers.length === 0) {
    issues.push({
      code: 'EMPTY_CARD_DIFF_INPUT',
      message: 'Card diff input has no previous, current, or failure value.',
    })
  }
  return issues
}

function failedEntry(
  cardNumber: string,
  input: CardSnapshotDiffInput,
  failure: CurrentCardFailure,
): CardDiffEntry {
  return {
    ...entryBase(cardNumber),
    status: 'failed',
    ...(input.previous
      ? { beforeHash: input.previous.contentHash, before: input.previous }
      : {}),
    failure,
  }
}

export function diffCardSnapshots(
  input: CardSnapshotDiffInput,
): DiffResult<CardDiffEntry> {
  const validationErrors = validateInput(input)
  if (validationErrors.length > 0)
    return { ok: false, errors: validationErrors }

  const cardNumber = inputCardNumber(input) as string
  const { previous, current } = input

  if (!current) {
    if (input.failure) {
      return {
        ok: true,
        value: failedEntry(cardNumber, input, input.failure),
        warnings: [],
      }
    }
    if (!input.discoveryComplete) {
      return {
        ok: true,
        value: failedEntry(cardNumber, input, {
          cardNumber,
          stage: 'unknown',
          message:
            'DISCOVERY_INCOMPLETE: current card presence cannot be determined.',
        }),
        warnings: [],
      }
    }
    return {
      ok: true,
      value: {
        ...entryBase(cardNumber),
        status: 'disappeared_candidate',
        beforeHash: previous?.contentHash,
        before: previous,
      },
      warnings: [],
    }
  }

  if (!previous) {
    return {
      ok: true,
      value: {
        ...entryBase(cardNumber),
        status: 'added',
        afterHash: current.contentHash,
        after: current,
      },
      warnings: [],
    }
  }

  if (previous.contentHash === current.contentHash) {
    return {
      ok: true,
      value: {
        ...entryBase(cardNumber),
        status: 'unchanged',
        beforeHash: previous.contentHash,
        afterHash: current.contentHash,
        before: previous,
        after: current,
      },
      warnings: [],
    }
  }

  const beforePayloads = buildCategoryPayloads(previous.card)
  const afterPayloads = buildCategoryPayloads(current.card)
  const changedCategories = DIFF_CATEGORY_ORDER.filter(
    (category) =>
      stableStringify(beforePayloads[category]) !==
      stableStringify(afterPayloads[category]),
  )
  if (changedCategories.length === 0) {
    return {
      ok: false,
      errors: [
        {
          code: 'UNCLASSIFIED_HASH_CHANGE',
          cardNumber,
          message: `Hashes differ for ${cardNumber}, but all category payloads are equal.`,
        },
      ],
    }
  }

  const changedFields = changedCategories.flatMap((category) =>
    diffValues(category, beforePayloads[category], afterPayloads[category]),
  )
  return {
    ok: true,
    value: {
      cardNumber,
      status: 'changed',
      beforeHash: previous.contentHash,
      afterHash: current.contentHash,
      changedCategories,
      changedFields,
      before: previous,
      after: current,
    },
    warnings: [],
  }
}
