import type { Card } from '../../domain/cards/types'
import {
  DECK_RULES_EFFECTIVE_FROM,
  DECK_ZONE_COUNTS,
  TOTAL_DECK_COUNT,
} from '../../domain/decks/restrictions'
import type {
  DeckLegalityIssue,
  DeckLegalityResult,
} from '../../domain/decks/types'
import { DECK_ZONE_LABELS } from './constants'

function formatRuleDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return `${year}年${month}月${day}日`
}

function formatCountIssue(
  label: string,
  actual: number,
  expected: number,
): string {
  return actual < expected
    ? `${label}をあと${expected - actual}枚追加してください`
    : `${label}は${expected}枚にしてください（現在${actual}枚）`
}

function formatLegalityIssue(
  issue: DeckLegalityIssue,
  cardsByNumber: ReadonlyMap<string, Card>,
): string {
  switch (issue.code) {
    case 'oshi_count':
      return formatCountIssue(
        DECK_ZONE_LABELS.oshi,
        issue.actual,
        issue.expected,
      )
    case 'main_count':
      return formatCountIssue(
        DECK_ZONE_LABELS.main,
        issue.actual,
        issue.expected,
      )
    case 'cheer_count':
      return formatCountIssue(
        DECK_ZONE_LABELS.cheer,
        issue.actual,
        issue.expected,
      )
    case 'restricted_card': {
      const card = cardsByNumber.get(issue.cardNumber)
      return `${issue.cardNumber}${card ? ` ${card.name}` : ''}は制限カードのため${issue.max}枚までです（現在${issue.actual}枚）`
    }
    case 'copy_limit': {
      const card = cardsByNumber.get(issue.cardNumber)
      return `${issue.cardNumber}${card ? ` ${card.name}` : ''}は${issue.max}枚までです（現在${issue.actual}枚）`
    }
    case 'unknown_card':
      return `${issue.cardNumber}は現在のカードデータに存在しません`
    case 'unsupported_card_type':
      return `${issue.cardNumber}のカード種別にはまだ対応していません`
  }
}

export function DeckLegalitySummary({
  result,
  cardsByNumber,
}: {
  result: DeckLegalityResult
  cardsByNumber: ReadonlyMap<string, Card>
}) {
  const statusLabel = {
    incomplete: '作成中',
    invalid: 'ルール違反あり',
    legal: '使用可能',
  }[result.status]

  return (
    <section
      className={`deck-legality deck-legality--${result.status}`}
      aria-labelledby="deck-legality-heading"
    >
      <div className="deck-legality__heading">
        <h2 id="deck-legality-heading">デッキ構築状態</h2>
        <strong role="status">{statusLabel}</strong>
      </div>
      <dl className="deck-legality__counts">
        <div>
          <dt>推し</dt>
          <dd>
            {result.oshiCount} / {DECK_ZONE_COUNTS.oshi}
          </dd>
        </div>
        <div>
          <dt>メイン</dt>
          <dd>
            {result.mainCount} / {DECK_ZONE_COUNTS.main}
          </dd>
        </div>
        <div>
          <dt>エール</dt>
          <dd>
            {result.cheerCount} / {DECK_ZONE_COUNTS.cheer}
          </dd>
        </div>
        <div>
          <dt>合計</dt>
          <dd>
            {result.totalCount} / {TOTAL_DECK_COUNT}
          </dd>
        </div>
      </dl>
      {result.issues.length > 0 && (
        <ul className="deck-legality__issues">
          {result.issues.map((issue, index) => (
            <li
              key={`${issue.code}-${'cardNumber' in issue ? issue.cardNumber : ''}-${index}`}
            >
              {formatLegalityIssue(issue, cardsByNumber)}
            </li>
          ))}
        </ul>
      )}
      <p className="deck-legality__effective-date">
        {formatRuleDate(DECK_RULES_EFFECTIVE_FROM)}施行の制限ルールを反映
      </p>
    </section>
  )
}
