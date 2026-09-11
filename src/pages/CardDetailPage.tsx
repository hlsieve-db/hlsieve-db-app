import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'

import { AppNavigation } from '../components/AppNavigation'
import { DeckQuantityControl } from '../components/decks/DeckQuantityControl'
import { DeckTargetSelector } from '../components/decks/DeckTargetSelector'
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
import { assertCardPrintingsCompatibility } from '../domain/cards/cardPrintingsValidation'
import type {
  Card,
  CardPrintingGroupPublic,
  CardPrintingPublic,
  CardPrintingsDataFile,
  CardsDataFile,
  RequiredCheer,
} from '../domain/cards/types'
import { loadCardPrintingsData } from '../repositories/loadCardPrintingsData'
import { loadCardsData } from '../repositories/loadCardsData'
import {
  deckRepository,
  type DeckRepository,
} from '../repositories/deckRepository'
import { useSavedDeckQuickEdit } from '../hooks/useSavedDeckQuickEdit'
import { useDocumentMetadata } from '../hooks/useDocumentMetadata'
import { buildCardDetailMetadata } from '../domain/site/metadata'

type CardDataState =
  | { status: 'loading' }
  | { status: 'loaded'; data: CardsDataFile }
  | { status: 'error' }

type CardDetailPageProps = {
  loadCards?: () => Promise<CardsDataFile>
  loadPrintings?: () => Promise<CardPrintingsDataFile>
  repository?: DeckRepository
}

type PrintingDataState =
  | { status: 'loading' }
  | { status: 'loaded'; group: CardPrintingGroupPublic }
  | { status: 'load-error' }
  | { status: 'compatibility-error' }
  | { status: 'missing-group' }

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
      <AppNavigation />
      <Link className="back-link" to="/cards">
        カード検索へ戻る
      </Link>
    </header>
  )
}

function CardInformation({
  card,
  officialUrl,
}: {
  card: Card
  officialUrl?: string
}) {
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
          <h2 id="card-qa">公式Q&amp;A（{card.qas.length}件）</h2>
          <div className="qa-list">
            {card.qas.map((qa) => (
              <details key={qa.id}>
                <summary>Q. {qa.question}</summary>
                <div className="qa-answer">
                  <p>A. {qa.answer}</p>
                  <p className="qa-meta">
                    <span>{qa.id}</span>
                    {qa.publishedAt && <time>{qa.publishedAt}</time>}
                  </p>
                  <a
                    className="qa-official-link"
                    href={qa.officialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${qa.id}を公式で確認`}
                  >
                    公式で確認
                  </a>
                </div>
              </details>
            ))}
          </div>
        </section>
      )}

      {officialUrl && (
        <p className="detail-official-link">
          <a href={officialUrl} target="_blank" rel="noopener noreferrer">
            公式カードページ
          </a>
        </p>
      )}
    </>
  )
}

function printingKind(printing: CardPrintingPublic): string {
  return printing.isParallel ? 'パラレル' : '通常'
}

function printingAccessibleName(
  cardName: string,
  printing: CardPrintingPublic,
): string {
  return [
    cardName,
    printingKind(printing),
    printing.rarity,
    `版 ${printing.officialId}`,
  ]
    .filter(Boolean)
    .join(' ')
}

function PrintingMetadata({ printing }: { printing: CardPrintingPublic }) {
  return (
    <dl className="printing-metadata">
      <div>
        <dt>版種別</dt>
        <dd>{printingKind(printing)}</dd>
      </div>
      {printing.rarity && (
        <div>
          <dt>レアリティ</dt>
          <dd>{printing.rarity}</dd>
        </div>
      )}
      {printing.illustrator && (
        <div>
          <dt>イラストレーター</dt>
          <dd>{printing.illustrator}</dd>
        </div>
      )}
      {printing.products.length > 0 && (
        <div className="printing-metadata__products">
          <dt>収録・関連商品</dt>
          <dd>
            <ul>
              {printing.products.map((product) => (
                <li key={product}>{product}</li>
              ))}
            </ul>
          </dd>
        </div>
      )}
      <div>
        <dt>版番号</dt>
        <dd>版 {printing.officialId}</dd>
      </div>
    </dl>
  )
}

function PrintingPanel({
  card,
  state,
  selectedPrinting,
  onSelect,
  onRetry,
}: {
  card: Card
  state: PrintingDataState
  selectedPrinting?: CardPrintingPublic
  onSelect: (officialId: string) => void
  onRetry: () => void
}) {
  return (
    <section className="printing-panel" aria-labelledby="printing-heading">
      <h2 id="printing-heading">版情報</h2>
      {state.status === 'loading' && (
        <p role="status" aria-live="polite">
          版情報を読み込んでいます…
        </p>
      )}
      {state.status === 'load-error' && (
        <div className="printing-panel__error" role="alert">
          <p>版情報を読み込めませんでした。</p>
          <button type="button" className="button" onClick={onRetry}>
            版情報を再試行
          </button>
        </div>
      )}
      {state.status === 'compatibility-error' && (
        <p className="printing-panel__error" role="alert">
          カード情報と版情報の互換性を確認できませんでした。
        </p>
      )}
      {state.status === 'missing-group' && (
        <p className="printing-panel__error" role="alert">
          このカードの版情報が見つかりませんでした。
        </p>
      )}
      {state.status === 'loaded' && selectedPrinting && (
        <>
          {state.group.printings.length > 1 && (
            <div
              className="printing-selector"
              role="group"
              aria-label="カードの版を選択"
            >
              {state.group.printings.map((printing) => (
                <button
                  type="button"
                  className="printing-option"
                  aria-label={printingAccessibleName(card.name, printing)}
                  aria-pressed={
                    printing.officialId === selectedPrinting.officialId
                  }
                  key={printing.officialId}
                  onClick={() => onSelect(printing.officialId)}
                >
                  <span className="printing-option__image">
                    {printing.imageUrl ? (
                      <img src={printing.imageUrl} alt="" />
                    ) : (
                      <span>画像なし</span>
                    )}
                  </span>
                  <span>{printingKind(printing)}</span>
                  {printing.rarity && <span>{printing.rarity}</span>}
                  <span>版 {printing.officialId}</span>
                </button>
              ))}
            </div>
          )}
          <PrintingMetadata printing={selectedPrinting} />
        </>
      )}
    </section>
  )
}

function LoadedCardDetail({
  card,
  cardsDataVersion,
  loadPrintings,
  repository,
}: {
  card: Card
  cardsDataVersion: string
  loadPrintings: () => Promise<CardPrintingsDataFile>
  repository: DeckRepository
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [printingData, setPrintingData] = useState<PrintingDataState>({
    status: 'loading',
  })
  const [loadAttempt, setLoadAttempt] = useState(0)
  const deckQuickEdit = useSavedDeckQuickEdit(repository)

  useEffect(() => {
    let active = true
    void loadPrintings().then(
      (data) => {
        if (!active) return
        try {
          assertCardPrintingsCompatibility(cardsDataVersion, data)
        } catch {
          setPrintingData({ status: 'compatibility-error' })
          return
        }
        const group = data.cards[card.cardNumber]
        setPrintingData(
          group ? { status: 'loaded', group } : { status: 'missing-group' },
        )
      },
      () => {
        if (active) setPrintingData({ status: 'load-error' })
      },
    )
    return () => {
      active = false
    }
  }, [card.cardNumber, cardsDataVersion, loadAttempt, loadPrintings])

  const requestedPrintingId = searchParams.get('printing')
  const selectedPrinting = useMemo(() => {
    if (printingData.status !== 'loaded') return undefined
    const requested = requestedPrintingId
      ? printingData.group.printings.find(
          (printing) => printing.officialId === requestedPrintingId,
        )
      : undefined
    return (
      requested ??
      printingData.group.printings.find(
        (printing) =>
          printing.officialId === printingData.group.defaultPrintingOfficialId,
      )
    )
  }, [printingData, requestedPrintingId])

  useEffect(() => {
    if (printingData.status !== 'loaded' || requestedPrintingId === null) return
    const isNumeric = /^\d+$/.test(requestedPrintingId)
    const isInGroup = printingData.group.printings.some(
      (printing) => printing.officialId === requestedPrintingId,
    )
    const isDefault =
      requestedPrintingId === printingData.group.defaultPrintingOfficialId
    if (isNumeric && isInGroup && !isDefault) return

    const canonicalParams = new URLSearchParams(searchParams)
    canonicalParams.delete('printing')
    setSearchParams(canonicalParams, { replace: true })
  }, [printingData, requestedPrintingId, searchParams, setSearchParams])

  const selectPrinting = (officialId: string) => {
    if (printingData.status !== 'loaded') return
    const nextParams = new URLSearchParams(searchParams)
    if (officialId === printingData.group.defaultPrintingOfficialId) {
      nextParams.delete('printing')
    } else {
      nextParams.set('printing', officialId)
    }
    setSearchParams(nextParams)
  }

  const retryPrintings = () => {
    setPrintingData({ status: 'loading' })
    setLoadAttempt((attempt) => attempt + 1)
  }

  const imageUrl = selectedPrinting ? selectedPrinting.imageUrl : card.imageUrl
  const officialUrl = selectedPrinting
    ? selectedPrinting.officialUrl
    : card.officialUrl

  return (
    <article className="detail-card">
      <div className="detail-card__visual">
        <div className="detail-card__image-frame">
          {imageUrl ? (
            <img src={imageUrl} alt={`${card.name}のカード画像`} />
          ) : (
            <span>画像なし</span>
          )}
        </div>
        <section
          className="deck-quick-add-panel detail-deck-quick-add"
          aria-labelledby="detail-deck-quick-add-heading"
        >
          <h2 id="detail-deck-quick-add-heading">デッキへ追加</h2>
          <DeckTargetSelector
            state={deckQuickEdit.state}
            decks={deckQuickEdit.decks}
            selectedDeckId={deckQuickEdit.selectedDeckId}
            saveState={deckQuickEdit.saveState}
            onSelect={deckQuickEdit.selectDeck}
            onRetry={deckQuickEdit.retry}
          />
          {deckQuickEdit.selectedDeck && (
            <DeckQuantityControl
              cardName={card.name}
              quantity={deckQuickEdit.quantityFor(card.cardNumber)}
              onDecrement={() => deckQuickEdit.decrement(card.cardNumber)}
              onIncrement={() => deckQuickEdit.increment(card.cardNumber)}
            />
          )}
        </section>
        <PrintingPanel
          card={card}
          state={printingData}
          selectedPrinting={selectedPrinting}
          onSelect={selectPrinting}
          onRetry={retryPrintings}
        />
      </div>
      <div className="detail-card__content">
        <CardInformation card={card} officialUrl={officialUrl} />
      </div>
    </article>
  )
}

export function CardDetailPage({
  loadCards = loadCardsData,
  loadPrintings = loadCardPrintingsData,
  repository = deckRepository,
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

  useDocumentMetadata(
    card
      ? buildCardDetailMetadata(card)
      : {
          title:
            cardData.status === 'loaded'
              ? 'カードが見つかりません | HLSieve DB'
              : 'カード詳細 | HLSieve DB',
          description:
            cardData.status === 'loaded'
              ? '指定されたカードはHLSieve DBに登録されていません。'
              : 'HLSieve DBでホロライブOCGのカード詳細を確認しています。',
          robots: 'noindex',
        },
  )

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
        <LoadedCardDetail
          key={card.cardNumber}
          card={card}
          cardsDataVersion={cardData.data.dataVersion}
          loadPrintings={loadPrintings}
          repository={repository}
        />
      )}
    </main>
  )
}
