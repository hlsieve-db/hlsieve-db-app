import { useMemo, useState } from 'react'

import { AppNavigation } from '../components/AppNavigation'
import {
  calculateSwissDistribution,
  formatExpectedPlayers,
  formatSwissPercentage,
  getSwissValidationErrors,
  MAX_SWISS_PARTICIPANTS,
  MAX_SWISS_ROUNDS,
} from '../domain/probability/swissDistribution'
import { SWISS_METADATA } from '../domain/site/metadata'
import { useDocumentMetadata } from '../hooks/useDocumentMetadata'

const DEFAULT_PARTICIPANT_COUNT = '64'
const DEFAULT_ROUND_COUNT = '5'

function parseIntegerInput(value: string): number {
  return value.trim() === '' ? Number.NaN : Number(value)
}

export function SwissPage() {
  useDocumentMetadata(SWISS_METADATA)
  const [participantCount, setParticipantCount] = useState(
    DEFAULT_PARTICIPANT_COUNT,
  )
  const [roundCount, setRoundCount] = useState(DEFAULT_ROUND_COUNT)
  const calculation = useMemo(() => {
    const input = {
      participantCount: parseIntegerInput(participantCount),
      roundCount: parseIntegerInput(roundCount),
    }
    const errors = getSwissValidationErrors(input)

    return errors.length > 0
      ? { status: 'invalid' as const, errors }
      : {
          status: 'valid' as const,
          errors,
          rows: calculateSwissDistribution(input),
          participantCount: input.participantCount,
        }
  }, [participantCount, roundCount])

  return (
    <main className="content-page swiss-page">
      <AppNavigation />
      <header className="content-page__header">
        <h1>スイスドロー計算</h1>
        <p>大会参加人数と回戦数から、各勝敗数の理論人数を計算します。</p>
      </header>

      <section
        className="content-surface swiss-calculator"
        aria-labelledby="swiss-input-heading"
      >
        <h2 id="swiss-input-heading">大会条件</h2>
        <div className="swiss-calculator__inputs">
          <label htmlFor="swiss-participant-count">
            <span>参加人数</span>
            <input
              id="swiss-participant-count"
              type="number"
              inputMode="numeric"
              min="2"
              max={MAX_SWISS_PARTICIPANTS}
              step="1"
              value={participantCount}
              aria-invalid={calculation.status === 'invalid'}
              aria-describedby={
                calculation.status === 'invalid' ? 'swiss-errors' : undefined
              }
              onChange={(event) =>
                setParticipantCount(event.currentTarget.value)
              }
            />
          </label>
          <label htmlFor="swiss-round-count">
            <span>スイス回戦数</span>
            <input
              id="swiss-round-count"
              type="number"
              inputMode="numeric"
              min="1"
              max={MAX_SWISS_ROUNDS}
              step="1"
              value={roundCount}
              aria-invalid={calculation.status === 'invalid'}
              aria-describedby={
                calculation.status === 'invalid' ? 'swiss-errors' : undefined
              }
              onChange={(event) => setRoundCount(event.currentTarget.value)}
            />
          </label>
        </div>

        {calculation.status === 'invalid' ? (
          <div
            id="swiss-errors"
            className="swiss-calculator__errors"
            role="alert"
          >
            {calculation.errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        ) : (
          <section
            className="swiss-calculator__result"
            aria-labelledby="swiss-result-heading"
            aria-live="polite"
          >
            <div className="swiss-calculator__result-heading">
              <div>
                <h2 id="swiss-result-heading">理論上の勝敗分布</h2>
                <p>勝数が多い順に表示しています。</p>
              </div>
              <p className="swiss-calculator__undefeated">
                全勝者の理論人数
                <strong>
                  {formatExpectedPlayers(calculation.rows[0].expectedPlayers)}
                </strong>
              </p>
            </div>
            <div className="swiss-calculator__table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">戦績</th>
                    <th scope="col">理論人数</th>
                    <th scope="col">割合</th>
                  </tr>
                </thead>
                <tbody>
                  {calculation.rows.map((row) => (
                    <tr key={`${row.wins}-${row.losses}`}>
                      <th scope="row">
                        {row.wins}-{row.losses}
                      </th>
                      <td>{formatExpectedPlayers(row.expectedPlayers)}</td>
                      <td>{formatSwissPercentage(row.probability)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">合計</th>
                    <td>
                      {formatExpectedPlayers(calculation.participantCount)}
                    </td>
                    <td>100.0%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="swiss-calculator__note">
              ※引き分け・Bye・途中棄権を考慮しない理論値です。実際の大会結果とは異なる場合があります。
            </p>
          </section>
        )}
      </section>
    </main>
  )
}
