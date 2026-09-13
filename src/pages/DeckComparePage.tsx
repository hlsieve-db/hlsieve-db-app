import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { AppNavigation } from '../components/AppNavigation'
import type { Card, CardsDataFile } from '../domain/cards/types'
import {
  compareDecks,
  type BreakdownComparison,
  type CardChange,
  type CardChangeKind,
  type DeckComparison,
} from '../domain/decks/comparison'
import { CURRENT_DECK_RESTRICTIONS } from '../domain/decks/restrictions'
import type { Deck } from '../domain/decks/types'
import { DECK_COMPARISON_METADATA } from '../domain/site/metadata'
import { formatOshiLabel } from '../domain/tournamentReport/oshi'
import { useDocumentMetadata } from '../hooks/useDocumentMetadata'
import {
  deckRepository,
  type DeckRepository,
} from '../repositories/deckRepository'
import { loadCardsData } from '../repositories/loadCardsData'

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; decks: Deck[]; cards: Card[] }
  | { status: 'error'; message: string }

type DeckComparePageProps = {
  repository?: DeckRepository
  loadCards?: () => Promise<CardsDataFile>
}

const CHANGE_LABELS: Record<CardChangeKind, string> = {
  added: '追加',
  increased: '枚数増加',
  decreased: '枚数減少',
  removed: '削除',
}
const CHANGE_ORDER: readonly CardChangeKind[] = [
  'added',
  'increased',
  'decreased',
  'removed',
]
const TOTAL_LABELS: Record<
  keyof DeckComparison['analysisBefore']['totals'],
  string
> = {
  oshi: '推しホロメン',
  main: 'メイン',
  cheer: 'エール',
  unknown: '未確認',
  total: '合計',
}
const ZONE_LABELS: Record<CardChange['zone'], string> = {
  oshi: '推し',
  main: 'メイン',
  cheer: 'エール',
  unknown: '未確認',
}

function signedDelta(delta: number): string {
  if (delta > 0) return `+${delta}`
  return String(delta)
}

function deltaDescription(delta: number): string {
  if (delta > 0) return `${delta}枚増加`
  if (delta < 0) return `${Math.abs(delta)}枚減少`
  return '変更なし'
}

function percentage(value: number | undefined): string {
  return value === undefined ? '—' : `${value.toFixed(1)}%`
}

function MetricRow({
  label,
  before,
  after,
  delta,
  beforePercentage,
  afterPercentage,
}: {
  label: string
  before: number
  after: number
  delta: number
  beforePercentage?: number
  afterPercentage?: number
}) {
  const percentages =
    beforePercentage === undefined && afterPercentage === undefined
      ? undefined
      : `${percentage(beforePercentage)} → ${percentage(afterPercentage)}`
  return (
    <li
      className="deck-comparison-metric"
      aria-label={`${label}、${before}枚から${after}枚へ、${deltaDescription(delta)}${percentages ? `、${percentages}` : ''}`}
    >
      <strong>{label}</strong>
      <span>{before}枚</span>
      <span aria-hidden="true">→</span>
      <span>{after}枚</span>
      <span className="deck-comparison-metric__delta">
        {delta === 0 ? '±0' : signedDelta(delta)}
      </span>
      {percentages && (
        <small className="deck-comparison-metric__percentage">
          {percentages}
        </small>
      )}
    </li>
  )
}

function BreakdownSection({
  heading,
  items,
}: {
  heading: string
  items: readonly BreakdownComparison[]
}) {
  return (
    <section className="deck-comparison-section">
      <h2>{heading}</h2>
      {items.length === 0 ? (
        <p>比較できる項目がありません。</p>
      ) : (
        <ul className="deck-comparison-metrics">
          {items.map((item) => (
            <MetricRow
              key={item.key}
              label={item.label}
              before={item.beforeQuantity}
              after={item.afterQuantity}
              delta={item.delta}
              beforePercentage={item.beforePercentage}
              afterPercentage={item.afterPercentage}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function oshiLabel(
  items: DeckComparison['oshi']['before'],
  oshiCards: readonly Card[],
): string {
  if (items.length === 0) return '未設定'
  return items
    .map(
      ({ card, quantity }) =>
        `${formatOshiLabel(card, oshiCards)}${quantity === 1 ? '' : ` ×${quantity}`}`,
    )
    .join('、')
}

function CardChanges({ changes }: { changes: readonly CardChange[] }) {
  return (
    <section className="deck-comparison-section deck-comparison-card-changes">
      <h2>カード差分</h2>
      {changes.length === 0 ? (
        <p>カード差分はありません。</p>
      ) : (
        <div className="deck-comparison-change-grid">
          {CHANGE_ORDER.map((kind) => {
            const matching = changes.filter((change) => change.kind === kind)
            if (matching.length === 0) return null
            return (
              <section key={kind}>
                <h3>{CHANGE_LABELS[kind]}</h3>
                <ul>
                  {matching.map((change) => (
                    <li
                      key={change.cardNumber}
                      aria-label={`${change.name ?? '不明なカード'} ${change.cardNumber}、${change.beforeQuantity}枚から${change.afterQuantity}枚へ、${deltaDescription(change.delta)}`}
                    >
                      <div>
                        <strong>{change.name ?? '不明なカード'}</strong>
                        <span>{change.cardNumber}</span>
                        <small>{ZONE_LABELS[change.zone]}</small>
                      </div>
                      <span>
                        {change.beforeQuantity} → {change.afterQuantity}{' '}
                        <strong>({signedDelta(change.delta)})</strong>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </section>
  )
}

function ComparisonResult({
  comparison,
  cards,
}: {
  comparison: DeckComparison
  cards: readonly Card[]
}) {
  const oshiCards = cards.filter((card) => card.cardType === 'oshi')
  return (
    <div className="deck-comparison-results" aria-live="polite">
      {comparison.isIdentical && (
        <p className="status-message">2つのデッキに差分はありません。</p>
      )}

      <section className="deck-comparison-section">
        <h2>概要</h2>
        <div className="deck-comparison-oshi">
          <h3>推しホロメン</h3>
          <p>
            <span>{oshiLabel(comparison.oshi.before, oshiCards)}</span>
            <span aria-hidden="true">→</span>
            <span>{oshiLabel(comparison.oshi.after, oshiCards)}</span>
          </p>
          <strong>{comparison.oshi.changed ? '変更あり' : '変更なし'}</strong>
        </div>
        <ul className="deck-comparison-metrics deck-comparison-metrics--totals">
          {comparison.analysisDiff.totals
            .filter(
              (item) =>
                item.key !== 'unknown' ||
                item.beforeQuantity ||
                item.afterQuantity,
            )
            .map((item) => (
              <MetricRow
                key={item.key}
                label={TOTAL_LABELS[item.key]}
                before={item.beforeQuantity}
                after={item.afterQuantity}
                delta={item.delta}
              />
            ))}
        </ul>
      </section>

      <CardChanges changes={comparison.cardChanges} />

      <div className="deck-comparison-analysis-grid">
        <BreakdownSection
          heading="メインデッキ 色構成"
          items={comparison.analysisDiff.colors}
        />
        <BreakdownSection
          heading="カードタイプ"
          items={comparison.analysisDiff.cardTypes}
        />
        <BreakdownSection
          heading="Bloom構成"
          items={comparison.analysisDiff.bloomLevels}
        />
        <section className="deck-comparison-section">
          <h2>Buzz</h2>
          <ul className="deck-comparison-metrics">
            <MetricRow
              label="Buzz"
              before={comparison.analysisDiff.buzz.beforeQuantity}
              after={comparison.analysisDiff.buzz.afterQuantity}
              delta={comparison.analysisDiff.buzz.delta}
            />
          </ul>
          <p className="deck-comparison-note">
            BuzzはBloom段階とは別に比較しています。
          </p>
        </section>
        <BreakdownSection
          heading="エール色構成"
          items={comparison.analysisDiff.cheerColors}
        />
        <section className="deck-comparison-section">
          <h2>制限カード</h2>
          {comparison.analysisDiff.restrictions.length === 0 ? (
            <p>制限カードなし</p>
          ) : (
            <ul className="deck-comparison-restrictions">
              {comparison.analysisDiff.restrictions.map((item) => (
                <li key={item.cardNumber}>
                  <strong>
                    {item.cardNumber} {item.name}
                  </strong>
                  <span>
                    {item.beforeQuantity}枚 → {item.afterQuantity}枚 / 上限
                    {item.maxCopies}枚
                  </span>
                  <span>
                    Deck A: {item.beforeOverLimit ? '上限超過' : '上限内'} /{' '}
                    Deck B: {item.afterOverLimit ? '上限超過' : '上限内'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

export function DeckComparePage({
  repository = deckRepository,
  loadCards = loadCardsData,
}: DeckComparePageProps) {
  useDocumentMetadata(DECK_COMPARISON_METADATA)
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [beforeId, setBeforeId] = useState('')
  const [afterId, setAfterId] = useState('')

  useEffect(() => {
    let active = true
    void Promise.all([repository.listDecks(), loadCards()]).then(
      ([decks, data]) => {
        if (active) setState({ status: 'loaded', decks, cards: data.cards })
      },
      () => {
        if (active) {
          setState({
            status: 'error',
            message: 'デッキを読み込めませんでした。',
          })
        }
      },
    )
    return () => {
      active = false
    }
  }, [loadCards, repository])

  const beforeDeck =
    state.status === 'loaded'
      ? state.decks.find((deck) => deck.id === beforeId)
      : undefined
  const afterDeck =
    state.status === 'loaded'
      ? state.decks.find((deck) => deck.id === afterId)
      : undefined
  const comparison = useMemo(
    () =>
      state.status === 'loaded' && beforeDeck && afterDeck
        ? compareDecks({
            beforeDeck,
            afterDeck,
            cards: state.cards,
            restrictions: CURRENT_DECK_RESTRICTIONS,
          })
        : undefined,
    [afterDeck, beforeDeck, state],
  )

  return (
    <main className="content-page deck-comparison-page">
      <AppNavigation />
      <header className="content-page__header">
        <h1>デッキ比較</h1>
        <p>保存済みの2つのデッキを、Deck AからDeck Bへの方向で比較します。</p>
      </header>

      <Link className="back-link" to="/decks">
        保存デッキへ戻る
      </Link>

      {state.status === 'loading' && (
        <p className="status-message" role="status" aria-live="polite">
          デッキを読み込んでいます…
        </p>
      )}
      {state.status === 'error' && (
        <p className="status-message status-message--error" role="alert">
          {state.message}
        </p>
      )}
      {state.status === 'loaded' && state.decks.length === 0 && (
        <section className="content-surface deck-comparison-empty">
          <h2>保存されたデッキがありません。</h2>
          <Link className="button" to="/decks">
            デッキを作成
          </Link>
        </section>
      )}
      {state.status === 'loaded' && state.decks.length === 1 && (
        <section className="content-surface deck-comparison-empty">
          <h2>比較には2つのデッキが必要です。</h2>
          <p>もう1つデッキを作成してから比較してください。</p>
          <Link className="button" to="/decks">
            保存デッキを開く
          </Link>
        </section>
      )}
      {state.status === 'loaded' && state.decks.length >= 2 && (
        <>
          <section
            className="content-surface deck-comparison-selector"
            aria-labelledby="deck-comparison-selector-heading"
          >
            <h2 id="deck-comparison-selector-heading">比較するデッキ</h2>
            <div className="deck-comparison-selector__fields">
              <label>
                比較元デッキ（Deck A）
                <select
                  value={beforeId}
                  onChange={(event) => setBeforeId(event.target.value)}
                >
                  <option value="">選択してください</option>
                  {state.decks.map((deck) => (
                    <option key={deck.id} value={deck.id}>
                      {deck.name}
                    </option>
                  ))}
                </select>
              </label>
              <span
                className="deck-comparison-selector__arrow"
                aria-hidden="true"
              >
                →
              </span>
              <label>
                比較先デッキ（Deck B）
                <select
                  value={afterId}
                  onChange={(event) => setAfterId(event.target.value)}
                >
                  <option value="">選択してください</option>
                  {state.decks.map((deck) => (
                    <option key={deck.id} value={deck.id}>
                      {deck.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {beforeDeck && afterDeck ? (
              <p
                className="deck-comparison-direction"
                aria-label={`${beforeDeck.name}から${afterDeck.name}への比較`}
              >
                <strong>{beforeDeck.name}</strong>
                <span aria-hidden="true">→</span>
                <strong>{afterDeck.name}</strong>
              </p>
            ) : (
              <p>Deck AとDeck Bを選択してください。</p>
            )}
          </section>
          {comparison && (
            <ComparisonResult comparison={comparison} cards={state.cards} />
          )}
        </>
      )}
    </main>
  )
}
