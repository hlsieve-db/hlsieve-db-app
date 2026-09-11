import { useMemo, useState } from 'react'

import { AppNavigation } from '../components/AppNavigation'
import {
  calculateAtLeastOneProbability,
  formatProbability,
  getProbabilityValidationErrors,
} from '../domain/probability/atLeastOneProbability'
import { PROBABILITY_METADATA } from '../domain/site/metadata'
import { useDocumentMetadata } from '../hooks/useDocumentMetadata'

const DEFAULT_DECK_SIZE = '50'
const DEFAULT_TARGET_COUNT = '4'
const DEFAULT_DRAW_COUNT = '5'

function parseIntegerInput(value: string): number {
  return value.trim() === '' ? Number.NaN : Number(value)
}

export function ProbabilityPage() {
  useDocumentMetadata(PROBABILITY_METADATA)
  const [deckSize, setDeckSize] = useState(DEFAULT_DECK_SIZE)
  const [targetCount, setTargetCount] = useState(DEFAULT_TARGET_COUNT)
  const [drawCount, setDrawCount] = useState(DEFAULT_DRAW_COUNT)
  const calculation = useMemo(() => {
    const input = {
      deckSize: parseIntegerInput(deckSize),
      targetCount: parseIntegerInput(targetCount),
      drawCount: parseIntegerInput(drawCount),
    }
    const errors = getProbabilityValidationErrors(input)
    return errors.length > 0
      ? { status: 'invalid' as const, errors }
      : {
          status: 'valid' as const,
          errors,
          probability: calculateAtLeastOneProbability(input),
        }
  }, [deckSize, drawCount, targetCount])

  return (
    <main className="content-page probability-page">
      <AppNavigation />
      <header className="content-page__header">
        <h1>確率計算</h1>
        <p>
          今の山札状況を入力して、上から見たカードに対象カードが1枚以上含まれる確率を計算します。
        </p>
      </header>

      <section
        className="content-surface probability-calculator"
        aria-labelledby="probability-input-heading"
      >
        <h2 id="probability-input-heading">現在の状況</h2>
        <div className="probability-calculator__inputs">
          <label htmlFor="probability-deck-size">
            <span>現在の山札枚数</span>
            <input
              id="probability-deck-size"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={deckSize}
              aria-describedby="probability-deck-size-help"
              onChange={(event) => setDeckSize(event.currentTarget.value)}
            />
            <small id="probability-deck-size-help">
              今その時点で山札に残っている枚数
            </small>
          </label>
          <label htmlFor="probability-target-count">
            <span>対象カードの枚数</span>
            <input
              id="probability-target-count"
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={targetCount}
              aria-describedby="probability-target-count-help"
              onChange={(event) => setTargetCount(event.currentTarget.value)}
            />
            <small id="probability-target-count-help">
              現在の山札に残っている対象カードの枚数
            </small>
          </label>
          <label htmlFor="probability-draw-count">
            <span>見る枚数</span>
            <input
              id="probability-draw-count"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={drawCount}
              onChange={(event) => setDrawCount(event.currentTarget.value)}
            />
          </label>
        </div>

        {calculation.status === 'invalid' ? (
          <div className="probability-calculator__errors" role="alert">
            {calculation.errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        ) : (
          <section
            className="probability-calculator__result"
            aria-labelledby="probability-result-heading"
            aria-live="polite"
          >
            <h2 id="probability-result-heading">1枚以上含まれる確率</h2>
            <output>{formatProbability(calculation.probability)}</output>
          </section>
        )}
      </section>
    </main>
  )
}
