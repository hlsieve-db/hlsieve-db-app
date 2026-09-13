import type { Card } from '../../domain/cards/types'
import type {
  AnalysisBreakdownItem,
  DeckAnalysis,
} from '../../domain/decks/analysis'
import { formatOshiLabel } from '../../domain/tournamentReport/oshi'

function formatPercentage(value: number | undefined): string {
  return value === undefined ? '—' : `${value.toFixed(1)}%`
}

function Breakdown({
  heading,
  items,
  emptyLabel,
}: {
  heading: string
  items: readonly AnalysisBreakdownItem[]
  emptyLabel: string
}) {
  return (
    <section className="deck-analysis__section">
      <h3>{heading}</h3>
      {items.length === 0 ? (
        <p>{emptyLabel}</p>
      ) : (
        <ul className="deck-analysis__breakdown">
          {items.map((item) => {
            const percentage = formatPercentage(item.percentage)
            return (
              <li
                key={item.key}
                aria-label={`${item.label} ${item.quantity}枚 ${percentage}`}
              >
                <div className="deck-analysis__breakdown-label">
                  <span>{item.label}</span>
                  <span>
                    {item.quantity}枚 <strong>{percentage}</strong>
                  </span>
                </div>
                <span className="deck-analysis__bar" aria-hidden="true">
                  <span
                    style={{ width: `${Math.min(item.percentage ?? 0, 100)}%` }}
                  />
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export function DeckAnalysisSummary({
  analysis,
  cards,
}: {
  analysis: DeckAnalysis
  cards: readonly Card[]
}) {
  if (analysis.totals.total === 0) {
    return (
      <section
        className="deck-analysis"
        aria-labelledby="deck-analysis-heading"
      >
        <h2 id="deck-analysis-heading">デッキ分析</h2>
        <p>カードを追加するとデッキ構成を確認できます。</p>
      </section>
    )
  }

  const oshiCards = cards.filter((card) => card.cardType === 'oshi')

  return (
    <section className="deck-analysis" aria-labelledby="deck-analysis-heading">
      <h2 id="deck-analysis-heading">デッキ分析</h2>
      <p className="deck-analysis__note">
        現在編集中の内容を、確認できたカード情報から客観的に集計しています。
      </p>

      <section className="deck-analysis__section">
        <h3>概要</h3>
        <dl className="deck-analysis__totals">
          <div>
            <dt>推しホロメン</dt>
            <dd>{analysis.totals.oshi}枚</dd>
          </div>
          <div>
            <dt>メイン</dt>
            <dd>{analysis.totals.main}枚</dd>
          </div>
          <div>
            <dt>エール</dt>
            <dd>{analysis.totals.cheer}枚</dd>
          </div>
          <div>
            <dt>合計</dt>
            <dd>{analysis.totals.total}枚</dd>
          </div>
        </dl>
        <div className="deck-analysis__oshi">
          <h4>使用推し</h4>
          {analysis.oshiCards.length === 0 ? (
            <p>未設定</p>
          ) : (
            <ul>
              {analysis.oshiCards.map(({ card, quantity }) => (
                <li key={card.cardNumber}>
                  {formatOshiLabel(card, oshiCards)} ×{quantity}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="deck-analysis__grid">
        <Breakdown
          heading="メインデッキ 色構成"
          items={analysis.colors}
          emptyLabel="分析できるメインカードがありません。"
        />
        <Breakdown
          heading="カードタイプ"
          items={analysis.cardTypes}
          emptyLabel="分析できるメインカードがありません。"
        />
        <section className="deck-analysis__section">
          <h3>Bloom構成</h3>
          {analysis.bloomLevels.length === 0 && analysis.buzzQuantity === 0 ? (
            <p>分析できるホロメンカードがありません。</p>
          ) : (
            <ul className="deck-analysis__plain-list">
              {analysis.bloomLevels.map((item) => (
                <li key={item.key}>
                  <span>{item.label}</span>
                  <strong>{item.quantity}枚</strong>
                </li>
              ))}
              {analysis.buzzQuantity > 0 && (
                <li>
                  <span>Buzz</span>
                  <strong>{analysis.buzzQuantity}枚</strong>
                </li>
              )}
            </ul>
          )}
          {analysis.buzzQuantity > 0 && (
            <p className="deck-analysis__note">
              BuzzはBloom段階とは別の性質のため、各段階と重複します。
            </p>
          )}
        </section>
        <Breakdown
          heading="エール色構成"
          items={analysis.cheerColors}
          emptyLabel="分析できるエールカードがありません。"
        />
      </div>

      <div className="deck-analysis__grid deck-analysis__grid--footer">
        <section className="deck-analysis__section">
          <h3>制限カード</h3>
          {analysis.restrictedCards.length === 0 ? (
            <p>制限カードなし</p>
          ) : (
            <ul className="deck-analysis__restriction-list">
              {analysis.restrictedCards.map((item) => (
                <li
                  key={item.cardNumber}
                  className={item.isOverLimit ? 'is-over-limit' : undefined}
                >
                  <span>
                    {item.cardNumber} {item.name}
                  </span>
                  <strong>
                    {item.quantity}枚 / 上限{item.maxCopies}枚
                  </strong>
                  {item.isOverLimit && <span>上限超過</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="deck-analysis__section">
          <h3>未確認カード</h3>
          {analysis.unknownCards.length === 0 ? (
            <p>未確認カードなし</p>
          ) : (
            <>
              <p>分類不能 {analysis.totals.unknown}枚</p>
              <ul className="deck-analysis__unknown-list">
                {analysis.unknownCards.map((item) => (
                  <li key={item.cardNumber}>
                    <span>{item.cardNumber}</span>
                    <strong>×{item.quantity}</strong>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
      <p className="deck-analysis__denominator-note">
        割合は、カード情報を確認できた各デッキ区分の枚数を分母にしています。
      </p>
    </section>
  )
}
