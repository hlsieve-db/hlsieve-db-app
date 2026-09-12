import { useMemo, useState } from 'react'

import { AppNavigation } from '../components/AppNavigation'
import { formatProbability } from '../domain/probability/atLeastOneProbability'
import {
  calculateMulliganProbability,
  getMulliganValidationErrors,
} from '../domain/probability/mulliganProbability'
import { MULLIGAN_METADATA } from '../domain/site/metadata'
import { useDocumentMetadata } from '../hooks/useDocumentMetadata'

const DEFAULT_DECK_SIZE = '50'
const DEFAULT_TARGET_COUNT = '4'
const DEFAULT_OPENING_HAND_SIZE = '7'
const DEFAULT_REDRAW_COUNT = '5'

function parseIntegerInput(value: string): number {
  return value.trim() === '' ? Number.NaN : Number(value)
}

export function MulliganPage() {
  useDocumentMetadata(MULLIGAN_METADATA)
  const [deckSize, setDeckSize] = useState(DEFAULT_DECK_SIZE)
  const [targetCount, setTargetCount] = useState(DEFAULT_TARGET_COUNT)
  const [openingHandSize, setOpeningHandSize] = useState(
    DEFAULT_OPENING_HAND_SIZE,
  )
  const [redrawCount, setRedrawCount] = useState(DEFAULT_REDRAW_COUNT)
  const calculation = useMemo(() => {
    const input = {
      deckSize: parseIntegerInput(deckSize),
      targetCount: parseIntegerInput(targetCount),
      openingHandSize: parseIntegerInput(openingHandSize),
      redrawCount: parseIntegerInput(redrawCount),
    }
    const errors = getMulliganValidationErrors(input)
    return errors.length > 0
      ? { status: 'invalid' as const, errors }
      : {
          status: 'valid' as const,
          errors,
          result: calculateMulliganProbability(input),
        }
  }, [deckSize, openingHandSize, redrawCount, targetCount])

  return (
    <main className="content-page mulligan-page">
      <AppNavigation />
      <header className="content-page__header">
        <h1>マリガン計算</h1>
        <p>
          山札・対象カード・初手・引き直しの枚数から、最終手札に対象カードが1枚以上ある確率を計算します。
        </p>
      </header>

      <section
        className="content-surface mulligan-calculator"
        aria-labelledby="mulligan-input-heading"
      >
        <h2 id="mulligan-input-heading">簡易マリガン条件</h2>
        <div className="mulligan-calculator__inputs">
          <label htmlFor="mulligan-deck-size">
            <span>現在の山札枚数</span>
            <input
              id="mulligan-deck-size"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={deckSize}
              onChange={(event) => setDeckSize(event.currentTarget.value)}
            />
          </label>
          <label htmlFor="mulligan-target-count">
            <span>対象カードの枚数</span>
            <input
              id="mulligan-target-count"
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={targetCount}
              onChange={(event) => setTargetCount(event.currentTarget.value)}
            />
          </label>
          <label htmlFor="mulligan-opening-hand-size">
            <span>初手枚数</span>
            <input
              id="mulligan-opening-hand-size"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={openingHandSize}
              onChange={(event) =>
                setOpeningHandSize(event.currentTarget.value)
              }
            />
          </label>
          <label htmlFor="mulligan-redraw-count">
            <span>引き直す枚数</span>
            <input
              id="mulligan-redraw-count"
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={redrawCount}
              onChange={(event) => setRedrawCount(event.currentTarget.value)}
            />
          </label>
        </div>

        <div className="mulligan-calculator__explanation">
          <p>
            初手に対象カードがあれば保持し、対象カードがない場合に指定枚数を山札へ戻して混ぜ直し、同じ枚数を引く簡易モデルです。
          </p>
          <p>
            引き直す枚数は「初手に対象カードがなかった場合」の枚数です。実際のゲームルールやマリガン方法とは異なる場合があります。
          </p>
        </div>

        {calculation.status === 'invalid' ? (
          <div className="mulligan-calculator__errors" role="alert">
            {calculation.errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        ) : (
          <section
            className="mulligan-calculator__result"
            aria-labelledby="mulligan-result-heading"
            aria-live="polite"
          >
            <h2 id="mulligan-result-heading">
              マリガン後に対象カードが1枚以上ある確率
            </h2>
            <output aria-label="マリガン後に対象カードが1枚以上ある確率">
              {formatProbability(calculation.result.finalHitProbability)}
            </output>
            <dl>
              <div>
                <dt>初手で1枚以上引ける確率</dt>
                <dd>
                  {formatProbability(calculation.result.initialHitProbability)}
                </dd>
              </div>
              <div>
                <dt>初手で引けなかった場合、引き直しで引ける確率</dt>
                <dd>
                  {calculation.result.redrawHitProbabilityGivenMiss === null
                    ? '—'
                    : formatProbability(
                        calculation.result.redrawHitProbabilityGivenMiss,
                      )}
                </dd>
              </div>
              <div>
                <dt>マリガンによる改善</dt>
                <dd>
                  +
                  {(
                    calculation.result.improvementProbabilityPoints * 100
                  ).toFixed(1)}
                  pt
                </dd>
              </div>
            </dl>
          </section>
        )}
      </section>
    </main>
  )
}
