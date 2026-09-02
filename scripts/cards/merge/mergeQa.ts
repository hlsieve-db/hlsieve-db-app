import type { NormalizedCardCandidate } from '../normalize/types'
import type { NormalizedQaEntry } from '../qa/types'
import type { QaConflict } from './types'

export type MergedQa = {
  qas: NormalizedQaEntry[]
  conflicts: QaConflict[]
}

export function mergeCandidateQas(
  candidates: readonly NormalizedCardCandidate[],
): MergedQa {
  const qas: NormalizedQaEntry[] = []
  const seenExact = new Map<string, Set<string>>()
  const variantsByQuestion = new Map<
    string,
    Map<string, { answer: string; officialIds: string[] }>
  >()

  for (const candidate of candidates) {
    for (const qa of candidate.qas) {
      let answers = seenExact.get(qa.question)
      if (!answers) {
        answers = new Set()
        seenExact.set(qa.question, answers)
      }
      if (!answers.has(qa.answer)) {
        answers.add(qa.answer)
        qas.push(qa)
      }

      let variants = variantsByQuestion.get(qa.question)
      if (!variants) {
        variants = new Map()
        variantsByQuestion.set(qa.question, variants)
      }
      let variant = variants.get(qa.answer)
      if (!variant) {
        variant = { answer: qa.answer, officialIds: [] }
        variants.set(qa.answer, variant)
      }
      if (!variant.officialIds.includes(candidate.officialId)) {
        variant.officialIds.push(candidate.officialId)
      }
    }
  }

  const cardNumber = candidates[0]?.cardNumber ?? ''
  const conflicts: QaConflict[] = []
  for (const [question, variants] of variantsByQuestion) {
    if (variants.size > 1) {
      conflicts.push({
        kind: 'qa_conflict',
        cardNumber,
        question,
        variants: [...variants.values()],
      })
    }
  }

  return { qas, conflicts }
}
