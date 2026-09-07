import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import {
  ABILITY_TYPE_LABELS,
  BLOOM_LEVEL_LABELS,
  CARD_COLOR_LABELS,
  CARD_TYPE_LABELS,
  CRITICAL_COLOR_LABELS,
  DEBUT_TYPE_LABELS,
  EFFECT_TAG_LABELS,
  SUPPORT_SEARCH_CATEGORY_LABELS,
  SUPPORT_TYPE_LABELS,
} from '../domain/cards/constants'
import type { Card, CardsDataFile, RequiredCheer } from '../domain/cards/types'
import { loadCardsData } from '../repositories/loadCardsData'

type CardDataState =
  | { status: 'loading' }
  | { status: 'loaded'; data: CardsDataFile }
  | { status: 'error' }

type CardDetailPageProps = {
  loadCards?: () => Promise<CardsDataFile>
}

function bloomLabel(card: Card): string | undefined {
  if (!card.bloomLevel) return undefined
  const level = BLOOM_LEVEL_LABELS[card.bloomLevel]
  if (card.bloomLevel !== 'debut' || !card.debutType) return level
  return `${level}（${DEBUT_TYPE_LABELS[card.debutType]}）`
}

function cheerLabel(cheer: RequiredCheer): string {
  const color = cheer.color === 'any' ? '任意' : CARD_COLOR_LABELS[cheer.color]
  return `${color} × ${cheer.count}`
}

function CheerList({ cheers }: { cheers: RequiredCheer[] }) {
  return (
    <ul className="detail-chips" aria-label="必要エール">
      {cheers.map((cheer, index) => (
        <li key={`${cheer.color}-${cheer.count}-${index}`}>
          {cheerLabel(cheer)}
        </li>
      ))}
    </ul>
  )
}

function DetailHeader() {
  return (
    <header className="detail-page__header">
      <Link className="site-brand" to="/cards">
        HLSieve DB
      </Link>
      <Link className="back-link" to="/cards">
        カード検索へ戻る
      </Link>
    </header>
  )
}

function CardInformation({ card }: { card: Card }) {
  const bloom = bloomLabel(card)
  const isSupport = card.cardType === 'support'
  return (
    <>
      <section className="detail-primary" aria-labelledby="card-information">
        <p className="detail-card-number">{card.cardNumber}</p>
        <h1>{card.name}</h1>
        {card.nameReading && (
          <p className="detail-name-reading">{card.nameReading}</p>
        )}
        <h2 id="card-information">カード情報</h2>
        <dl className="detail-facts">
          <div>
            <dt>カードタイプ</dt>
            <dd>{CARD_TYPE_LABELS[card.cardType]}</dd>
          </div>
          <div>
            <dt>色</dt>
            <dd>
              {card.colors.map((color) => CARD_COLOR_LABELS[color]).join('・')}
            </dd>
          </div>
          {bloom && (
            <div>
              <dt>Bloom</dt>
              <dd>{bloom}</dd>
            </div>
          )}
          {card.isBuzz && (
            <div>
              <dt>Buzz</dt>
              <dd>Buzzホロメン</dd>
            </div>
          )}
          {card.hp !== undefined && (
            <div>
              <dt>HP</dt>
              <dd>{card.hp}</dd>
            </div>
          )}
          {card.life !== undefined && (
            <div>
              <dt>ライフ</dt>
              <dd>{card.life}</dd>
            </div>
          )}
          {isSupport && card.supportType && (
            <div>
              <dt>サポートタイプ</dt>
              <dd>{SUPPORT_TYPE_LABELS[card.supportType]}</dd>
            </div>
          )}
          {isSupport && card.isLimited !== undefined && (
            <div>
              <dt>LIMITED</dt>
              <dd>{card.isLimited ? '対象' : '対象外'}</dd>
            </div>
          )}
          {isSupport && card.supportSearchCategory && (
            <div>
              <dt>サポート分類</dt>
              <dd>
                {SUPPORT_SEARCH_CATEGORY_LABELS[card.supportSearchCategory]}
              </dd>
            </div>
          )}
          {card.releaseDate && (
            <div>
              <dt>リリース日</dt>
              <dd>{card.releaseDate}</dd>
            </div>
          )}
          {card.deckLimit !== undefined && card.deckLimit !== null && (
            <div>
              <dt>デッキ上限</dt>
              <dd>{card.deckLimit}枚</dd>
            </div>
          )}
        </dl>
      </section>

      {card.batonPass.length > 0 && (
        <section className="detail-section" aria-labelledby="baton-pass">
          <h2 id="baton-pass">バトンタッチ</h2>
          <CheerList cheers={card.batonPass} />
        </section>
      )}

      {card.abilities.length > 0 && (
        <section className="detail-section" aria-labelledby="abilities">
          <h2 id="abilities">能力</h2>
          <div className="detail-stack">
            {card.abilities.map((ability, index) => (
              <article className="detail-text-card" key={index}>
                <h3>
                  {ability.type ? ABILITY_TYPE_LABELS[ability.type] : '能力'}
                </h3>
                <p>{ability.text}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {card.arts.length > 0 && (
        <section className="detail-section" aria-labelledby="arts">
          <h2 id="arts">アーツ</h2>
          <div className="detail-stack">
            {card.arts.map((art, index) => (
              <article
                className="detail-text-card"
                key={`${art.name}-${index}`}
              >
                <h3>{art.name}</h3>
                <dl className="art-facts">
                  {art.requiredCheers.length > 0 && (
                    <div>
                      <dt>必要エール</dt>
                      <dd>
                        <CheerList cheers={art.requiredCheers} />
                      </dd>
                    </div>
                  )}
                  {art.damage !== undefined && (
                    <div>
                      <dt>ダメージ</dt>
                      <dd>{art.damage}</dd>
                    </div>
                  )}
                  {art.critical && (
                    <div>
                      <dt>Critical</dt>
                      <dd>
                        {CRITICAL_COLOR_LABELS[art.critical.color]}
                        {art.critical.bonusDamage !== undefined &&
                          ` +${art.critical.bonusDamage}`}
                      </dd>
                    </div>
                  )}
                </dl>
                {art.effectText && <p>{art.effectText}</p>}
              </article>
            ))}
          </div>
        </section>
      )}

      {card.extraText && (
        <section className="detail-section" aria-labelledby="extra-text">
          <h2 id="extra-text">追加テキスト</h2>
          <p className="detail-copy">{card.extraText}</p>
        </section>
      )}

      {card.effectTags.length > 0 && (
        <section className="detail-section" aria-labelledby="effect-tags">
          <h2 id="effect-tags">効果タグ</h2>
          <ul className="detail-chips">
            {card.effectTags.map((tag) => (
              <li key={tag}>{EFFECT_TAG_LABELS[tag]}</li>
            ))}
          </ul>
        </section>
      )}

      {card.criticalColors.length > 0 && (
        <section className="detail-section" aria-labelledby="critical-colors">
          <h2 id="critical-colors">Critical対応色</h2>
          <ul className="detail-chips">
            {card.criticalColors.map((color) => (
              <li key={color}>{CRITICAL_COLOR_LABELS[color]}</li>
            ))}
          </ul>
        </section>
      )}

      {card.qas.length > 0 && (
        <section className="detail-section" aria-labelledby="card-qa">
          <h2 id="card-qa">Q&amp;A（{card.qas.length}件）</h2>
          <div className="qa-list">
            {card.qas.map((qa, index) => (
              <details key={index}>
                <summary>Q. {qa.question}</summary>
                <p>A. {qa.answer}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {card.officialUrl && (
        <p className="detail-official-link">
          <a href={card.officialUrl} target="_blank" rel="noopener noreferrer">
            公式カードページ
          </a>
        </p>
      )}
    </>
  )
}

export function CardDetailPage({
  loadCards = loadCardsData,
}: CardDetailPageProps) {
  const { cardNumber } = useParams<'cardNumber'>()
  const [cardData, setCardData] = useState<CardDataState>({
    status: 'loading',
  })
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    let active = true
    void loadCards().then(
      (data) => {
        if (active) setCardData({ status: 'loaded', data })
      },
      () => {
        if (active) setCardData({ status: 'error' })
      },
    )
    return () => {
      active = false
    }
  }, [loadAttempt, loadCards])

  const card = useMemo(
    () =>
      cardData.status === 'loaded' && cardNumber
        ? cardData.data.cards.find(
            (candidate) => candidate.cardNumber === cardNumber,
          )
        : undefined,
    [cardData, cardNumber],
  )

  const documentTitle =
    cardData.status === 'loaded'
      ? card
        ? `${card.name} | HLSieve DB`
        : 'カードが見つかりません | HLSieve DB'
      : 'カード詳細 | HLSieve DB'

  useEffect(() => {
    const previousTitle = document.title
    document.title = documentTitle
    return () => {
      document.title = previousTitle
    }
  }, [documentTitle])

  const retryLoad = () => {
    setCardData({ status: 'loading' })
    setLoadAttempt((attempt) => attempt + 1)
  }

  return (
    <main className="detail-page">
      <DetailHeader />

      {cardData.status === 'loading' && (
        <section className="status-message detail-status">
          <h1>カード詳細</h1>
          <p role="status" aria-live="polite">
            カード情報を読み込んでいます…
          </p>
        </section>
      )}

      {cardData.status === 'error' && (
        <section
          className="status-message status-message--error detail-status"
          role="alert"
        >
          <h1>カード詳細</h1>
          <p>カード情報を読み込めませんでした。</p>
          <button type="button" className="button" onClick={retryLoad}>
            再試行
          </button>
        </section>
      )}

      {cardData.status === 'loaded' && !card && (
        <section className="status-message detail-status">
          <h1>カードが見つかりません</h1>
          <p>指定されたカード番号のカードは登録されていません。</p>
          <Link className="button detail-link-button" to="/cards">
            カード検索へ戻る
          </Link>
        </section>
      )}

      {cardData.status === 'loaded' && card && (
        <article className="detail-card">
          <div className="detail-card__image-frame">
            {card.imageUrl ? (
              <img src={card.imageUrl} alt={`${card.name}のカード画像`} />
            ) : (
              <span>画像なし</span>
            )}
          </div>
          <div className="detail-card__content">
            <CardInformation card={card} />
          </div>
        </article>
      )}
    </main>
  )
}
