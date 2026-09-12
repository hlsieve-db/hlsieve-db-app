import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { AppNavigation } from '../components/AppNavigation'
import { OshiCombobox } from '../components/tournament/OshiCombobox'
import { RoundEditor } from '../components/tournament/RoundEditor'
import {
  TournamentReportImageDialog,
  type TournamentReportImagePreview,
} from '../components/tournament/TournamentReportImageDialog'
import type { Card, CardsDataFile } from '../domain/cards/types'
import { TOURNAMENT_REPORT_METADATA } from '../domain/site/metadata'
import { formatTournamentReportText } from '../domain/tournamentReport/formatText'
import {
  DEFAULT_TOURNAMENT_EXPORT_PRESET,
  TOURNAMENT_EXPORT_PRESETS,
  type TournamentExportPreset,
} from '../domain/tournamentReport/imageReport'
import {
  generateTournamentReportImages,
  type TournamentReportImageFile,
} from '../domain/tournamentReport/renderImage'
import {
  buildTournamentShareText,
  buildTournamentShareTitle,
  buildTournamentXIntentUrl,
  shareTournamentReport,
  type TournamentShareNavigator,
} from '../domain/tournamentReport/share'
import {
  formatOshiLabel,
  getOshiCandidates,
} from '../domain/tournamentReport/oshi'
import {
  createDefaultTournamentReport,
  createTournamentRound,
  formatTournamentResultSummary,
  MAX_PLACEMENT_LENGTH,
  MAX_REPORT_PARTICIPANTS,
  MAX_SWISS_REPORT_ROUNDS,
  MAX_TOURNAMENT_NAME_LENGTH,
  MAX_TOURNAMENT_REPORT_ROUNDS,
  summarizeTournamentRounds,
  validateTournamentReport,
} from '../domain/tournamentReport/report'
import type {
  TournamentReport,
  TournamentRound,
} from '../domain/tournamentReport/types'
import { useDocumentMetadata } from '../hooks/useDocumentMetadata'
import { loadCardsData } from '../repositories/loadCardsData'
import {
  tournamentReportRepository,
  type TournamentReportRepository,
} from '../repositories/tournamentReportRepository'

type CardDataState =
  | { status: 'loading' }
  | { status: 'loaded'; cards: Card[] }
  | { status: 'error' }

type TournamentReportPageProps = {
  loadCards?: () => Promise<CardsDataFile>
  writeClipboard?: (text: string) => Promise<void>
  generateImages?: (
    report: TournamentReport,
    oshiCards: readonly Card[],
    preset: TournamentExportPreset,
  ) => Promise<TournamentReportImageFile[]>
  createObjectUrl?: (blob: Blob) => string
  revokeObjectUrl?: (url: string) => void
  downloadFile?: (url: string, fileName: string) => void
  shareNavigator?: TournamentShareNavigator
  createShareFile?: (
    parts: BlobPart[],
    fileName: string,
    options: FilePropertyBag,
  ) => File
  repository?: TournamentReportRepository
}

const PLAY_ORDER_LABELS = {
  first: '先攻',
  second: '後攻',
} as const

const INITIATIVE_LABELS = {
  won_choice: '⚀○',
  lost_choice: '⚀×',
} as const

const RESULT_LABELS = {
  win: '○ WIN',
  draw: '△ DRAW',
  loss: '× LOSE',
} as const

async function writeClipboardText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error('Clipboard API is unavailable.')
  }
  await navigator.clipboard.writeText(text)
}

function createImageObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob)
}

function revokeImageObjectUrl(url: string): void {
  URL.revokeObjectURL(url)
}

function downloadImageFile(url: string, fileName: string): void {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.hidden = true
  document.body.append(anchor)
  try {
    anchor.click()
  } finally {
    anchor.remove()
  }
}

function generateImagesForPreset(
  report: TournamentReport,
  oshiCards: readonly Card[],
  preset: TournamentExportPreset,
): Promise<TournamentReportImageFile[]> {
  return generateTournamentReportImages(report, oshiCards, { preset })
}

function getBrowserShareNavigator(): TournamentShareNavigator {
  return {
    share: navigator.share?.bind(navigator),
    canShare: navigator.canShare?.bind(navigator),
  }
}

function RoundPreview({
  label,
  round,
  oshiCards,
}: {
  label: string
  round: TournamentRound
  oshiCards: readonly Card[]
}) {
  const opponent = oshiCards.find(
    (card) => card.cardNumber === round.opponentOshiCardNumber,
  )

  return (
    <li>
      <strong>{label}</strong>
      {opponent && <span>{formatOshiLabel(opponent, oshiCards)}</span>}
      {round.playOrder && <span>{PLAY_ORDER_LABELS[round.playOrder]}</span>}
      {round.initiativeChoiceResult && (
        <span
          aria-label={
            round.initiativeChoiceResult === 'won_choice'
              ? '手番選択権あり'
              : '手番選択権なし'
          }
        >
          {INITIATIVE_LABELS[round.initiativeChoiceResult]}
        </span>
      )}
      {round.result && (
        <span
          className={`report-preview__result report-preview__result--${round.result}`}
        >
          {RESULT_LABELS[round.result]}
        </span>
      )}
    </li>
  )
}

export function TournamentReportPage({
  loadCards = loadCardsData,
  writeClipboard = writeClipboardText,
  generateImages = generateImagesForPreset,
  createObjectUrl = createImageObjectUrl,
  revokeObjectUrl = revokeImageObjectUrl,
  downloadFile = downloadImageFile,
  shareNavigator,
  createShareFile,
  repository = tournamentReportRepository,
}: TournamentReportPageProps) {
  useDocumentMetadata(TOURNAMENT_REPORT_METADATA)
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedReportId = searchParams.get('id')?.trim() || undefined
  const [report, setReport] = useState<TournamentReport>(() =>
    createDefaultTournamentReport(),
  )
  const [participantDraft, setParticipantDraft] = useState('')
  const [cardData, setCardData] = useState<CardDataState>({ status: 'loading' })
  const [copyFeedback, setCopyFeedback] = useState<
    'idle' | 'success' | 'error'
  >('idle')
  const [imageStatus, setImageStatus] = useState<
    'idle' | 'generating' | 'error'
  >('idle')
  const [exportPreset, setExportPreset] = useState<TournamentExportPreset>(
    DEFAULT_TOURNAMENT_EXPORT_PRESET,
  )
  const [imagePreviews, setImagePreviews] = useState<
    TournamentReportImagePreview[] | undefined
  >()
  const [shareStatus, setShareStatus] = useState<
    | 'idle'
    | 'sharing'
    | 'shared-with-images'
    | 'shared-text-only'
    | 'unsupported'
    | 'error'
  >('idle')
  const [savedReportId, setSavedReportId] = useState<string>()
  const [savedLoadStatus, setSavedLoadStatus] = useState<
    'ready' | 'loading' | 'not-found' | 'error'
  >(requestedReportId ? 'loading' : 'ready')
  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')
  const [savedSnapshot, setSavedSnapshot] = useState<string>()

  useEffect(() => {
    let active = true
    if (!requestedReportId) {
      return () => {
        active = false
      }
    }
    void repository.getReport(requestedReportId).then(
      (saved) => {
        if (!active) return
        if (!saved) {
          setSavedReportId(undefined)
          setSavedLoadStatus('not-found')
          return
        }
        setReport(saved.report)
        setParticipantDraft(
          saved.report.participantCount === undefined
            ? ''
            : String(saved.report.participantCount),
        )
        setSavedReportId(saved.id)
        setSavedSnapshot(JSON.stringify(saved.report))
        setSavedLoadStatus('ready')
      },
      () => active && setSavedLoadStatus('error'),
    )
    return () => {
      active = false
    }
  }, [repository, requestedReportId])

  useEffect(() => {
    let active = true
    void loadCards().then(
      (data) => {
        if (active) {
          setCardData({
            status: 'loaded',
            cards: getOshiCandidates(data.cards),
          })
        }
      },
      () => {
        if (active) setCardData({ status: 'error' })
      },
    )
    return () => {
      active = false
    }
  }, [loadCards])

  useEffect(
    () => () => {
      imagePreviews?.forEach((image) => revokeObjectUrl(image.url))
    },
    [imagePreviews, revokeObjectUrl],
  )

  const oshiCards = useMemo(
    () => (cardData.status === 'loaded' ? cardData.cards : []),
    [cardData],
  )
  const validationErrors = useMemo(
    () => validateTournamentReport(report, oshiCards),
    [oshiCards, report],
  )
  const selfOshi = oshiCards.find(
    (card) => card.cardNumber === report.selfOshiCardNumber,
  )
  const swissSummary = summarizeTournamentRounds(report.swissRounds)
  const tournamentSummary = summarizeTournamentRounds(report.tournamentRounds)
  const reportText = useMemo(
    () => formatTournamentReportText(report, oshiCards),
    [oshiCards, report],
  )
  const shareText = useMemo(
    () => buildTournamentShareText(report, oshiCards),
    [oshiCards, report],
  )
  const shareTitle = useMemo(() => buildTournamentShareTitle(report), [report])
  const xIntentUrl = useMemo(
    () => buildTournamentXIntentUrl(shareText),
    [shareText],
  )

  const copyReportText = async () => {
    if (!reportText) return
    try {
      await writeClipboard(reportText)
      setCopyFeedback('success')
    } catch {
      setCopyFeedback('error')
    }
  }

  const createReportImages = async () => {
    if (!reportText || imageStatus === 'generating') return
    setImageStatus('generating')
    try {
      const files = await generateImages(report, oshiCards, exportPreset)
      if (files.length === 0) throw new Error('No image pages were generated.')
      const createdPreviews: TournamentReportImagePreview[] = []
      try {
        files.forEach((file) => {
          createdPreviews.push({
            url: createObjectUrl(file.blob),
            fileName: file.fileName,
            pageNumber: file.page.pageNumber,
            totalPages: file.page.totalPages,
            width: file.width,
            height: file.height,
          })
        })
      } catch (error) {
        createdPreviews.forEach((image) => revokeObjectUrl(image.url))
        throw error
      }
      setImagePreviews(createdPreviews)
      setImageStatus('idle')
    } catch {
      setImageStatus('error')
    }
  }

  const shareReport = async () => {
    if (!reportText || shareStatus === 'sharing') return
    const activeShareNavigator = shareNavigator ?? getBrowserShareNavigator()
    if (!activeShareNavigator.share) {
      setShareStatus('unsupported')
      return
    }
    setShareStatus('sharing')
    let files: TournamentReportImageFile[] = []
    let imageGenerationFailed = false
    try {
      files = await generateImages(report, oshiCards, exportPreset)
      if (files.length === 0) imageGenerationFailed = true
    } catch {
      imageGenerationFailed = true
    }

    const result = await shareTournamentReport({
      navigator: activeShareNavigator,
      title: shareTitle,
      text: shareText,
      images: files,
      createFile: createShareFile,
    })
    if (result.status === 'cancelled') {
      setShareStatus('idle')
    } else if (result.status === 'unsupported') {
      setShareStatus('unsupported')
    } else if (result.status === 'error') {
      setShareStatus('error')
    } else if (result.includedImages && !imageGenerationFailed) {
      setShareStatus('shared-with-images')
    } else {
      setShareStatus('shared-text-only')
    }
  }

  const saveReport = async () => {
    if (saveStatus === 'saving' || savedLoadStatus !== 'ready') return
    setSaveStatus('saving')
    try {
      const saved = savedReportId
        ? await repository.updateReport(savedReportId, report)
        : await repository.createReport(report)
      setSavedReportId(saved.id)
      setSavedSnapshot(JSON.stringify(saved.report))
      setSaveStatus('saved')
      if (!requestedReportId) {
        setSearchParams({ id: saved.id }, { replace: true })
      }
    } catch {
      setSaveStatus('error')
    }
  }

  const startNewReport = () => {
    setReport(createDefaultTournamentReport())
    setParticipantDraft('')
    setSavedReportId(undefined)
    setSavedSnapshot(undefined)
    setSavedLoadStatus('ready')
    setSaveStatus('idle')
  }

  const updateRound = (
    section: 'swissRounds' | 'tournamentRounds',
    index: number,
    round: TournamentRound,
  ) => {
    setReport((current) => ({
      ...current,
      [section]: current[section].map((candidate, candidateIndex) =>
        candidateIndex === index ? round : candidate,
      ),
    }))
  }

  const removeRound = (
    section: 'swissRounds' | 'tournamentRounds',
    index: number,
  ) => {
    setReport((current) => ({
      ...current,
      [section]: current[section].filter(
        (_round, candidateIndex) => candidateIndex !== index,
      ),
    }))
  }

  const addRound = (
    section: 'swissRounds' | 'tournamentRounds',
    maximum: number,
  ) => {
    setReport((current) =>
      current[section].length >= maximum
        ? current
        : {
            ...current,
            [section]: [...current[section], createTournamentRound()],
          },
    )
  }

  return (
    <main className="content-page tournament-report-page">
      <AppNavigation />
      <header className="content-page__header">
        <h1>大会戦績レポート</h1>
        <p>
          大会情報と各対戦結果を入力して、SNS投稿用のレポートをまとめられます。
        </p>
      </header>

      <div className="tournament-report-storage-actions">
        <button
          className="button"
          type="button"
          disabled={saveStatus === 'saving' || savedLoadStatus !== 'ready'}
          onClick={() => void saveReport()}
        >
          {saveStatus === 'saving'
            ? '保存しています…'
            : savedReportId
              ? '変更を保存'
              : '保存'}
        </button>
        <Link className="button button--secondary" to="/tournament-history">
          大会戦績履歴
        </Link>
        {savedReportId && (
          <Link
            className="button button--secondary"
            to="/tournament-report"
            onClick={startNewReport}
          >
            新しい大会戦績を作成
          </Link>
        )}
      </div>
      <p className="tournament-report-storage-notice">
        大会戦績はこの端末のブラウザ内に保存されます。自動保存やクラウド同期は行いません。
      </p>
      {savedLoadStatus === 'loading' && (
        <p className="status-message" role="status">
          大会戦績を読み込んでいます…
        </p>
      )}
      {savedLoadStatus === 'not-found' && (
        <p className="status-message status-message--error" role="alert">
          大会戦績が見つかりません。
        </p>
      )}
      {savedLoadStatus === 'error' && (
        <p className="status-message status-message--error" role="alert">
          大会戦績を読み込めませんでした。
        </p>
      )}
      {saveStatus === 'saved' && savedSnapshot === JSON.stringify(report) && (
        <p className="status-message" role="status" aria-live="polite">
          大会戦績を保存しました。
        </p>
      )}
      {savedReportId && savedSnapshot !== JSON.stringify(report) && (
        <p className="status-message" role="status" aria-live="polite">
          未保存の変更があります。
        </p>
      )}
      {saveStatus === 'error' && (
        <p className="status-message status-message--error" role="alert">
          大会戦績を保存できませんでした。
        </p>
      )}

      <div className="tournament-report-layout">
        <div className="tournament-report-form">
          <section
            className="content-surface report-section"
            aria-labelledby="report-basic-heading"
          >
            <h2 id="report-basic-heading">大会情報</h2>
            <div className="report-basic-fields">
              <label>
                <span>大会名（必須）</span>
                <input
                  type="text"
                  maxLength={MAX_TOURNAMENT_NAME_LENGTH}
                  value={report.tournamentName}
                  onChange={(event) => {
                    const value = event.currentTarget.value
                    setReport((current) => ({
                      ...current,
                      tournamentName: value,
                    }))
                  }}
                />
              </label>
              <label>
                <span>順位</span>
                <input
                  type="text"
                  maxLength={MAX_PLACEMENT_LENGTH}
                  placeholder="優勝、3位、ベスト8など"
                  value={report.placement}
                  onChange={(event) => {
                    const value = event.currentTarget.value
                    setReport((current) => ({
                      ...current,
                      placement: value,
                    }))
                  }}
                />
              </label>
              <label>
                <span>参加人数（任意）</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max={MAX_REPORT_PARTICIPANTS}
                  step="1"
                  value={participantDraft}
                  onChange={(event) => {
                    const value = event.currentTarget.value
                    setParticipantDraft(value)
                    setReport((current) => ({
                      ...current,
                      participantCount:
                        value === '' ? undefined : Number(value),
                    }))
                  }}
                />
              </label>
              <label>
                <span>開催日（任意）</span>
                <input
                  type="date"
                  value={report.eventDate ?? ''}
                  onChange={(event) => {
                    const value = event.currentTarget.value
                    setReport((current) => ({
                      ...current,
                      eventDate: value || undefined,
                    }))
                  }}
                />
              </label>
            </div>

            <OshiCombobox
              label="自分の推しホロメン（必須）"
              cards={oshiCards}
              selectedCardNumber={report.selfOshiCardNumber}
              disabled={cardData.status !== 'loaded'}
              onChange={(selfOshiCardNumber) =>
                setReport((current) => ({ ...current, selfOshiCardNumber }))
              }
            />
            {cardData.status === 'loaded' && (
              <p className="report-field-help">
                推しホロメン候補 {oshiCards.length}件
              </p>
            )}
            {cardData.status === 'loaded' &&
              report.selfOshiCardNumber &&
              !selfOshi && (
                <p className="report-load-error">
                  保存された推しは現在のカードデータでは確認できません。記録は保持されています。
                </p>
              )}
            {cardData.status === 'error' && (
              <p className="report-load-error" role="alert">
                カードデータを読み込めませんでした。
              </p>
            )}
          </section>

          <section
            className="content-surface report-section"
            aria-labelledby="swiss-report-heading"
          >
            <div className="report-section__heading">
              <div>
                <h2 id="swiss-report-heading">Swiss</h2>
                <p>
                  {report.swissRounds.length} / {MAX_SWISS_REPORT_ROUNDS}回戦
                </p>
              </div>
              <button
                className="button"
                type="button"
                disabled={report.swissRounds.length >= MAX_SWISS_REPORT_ROUNDS}
                onClick={() => addRound('swissRounds', MAX_SWISS_REPORT_ROUNDS)}
              >
                ＋ 回戦を追加
              </button>
            </div>
            <div className="tournament-round-list">
              {report.swissRounds.map((round, index) => (
                <RoundEditor
                  key={`swiss-${index}`}
                  label={`R${index + 1}`}
                  round={round}
                  oshiCards={oshiCards}
                  onChange={(nextRound) =>
                    updateRound('swissRounds', index, nextRound)
                  }
                  onRemove={() => removeRound('swissRounds', index)}
                />
              ))}
            </div>
          </section>

          <section
            className="content-surface report-section"
            aria-labelledby="tournament-round-heading"
          >
            <div className="report-section__heading">
              <div>
                <h2 id="tournament-round-heading">決勝トーナメント</h2>
                <p>
                  {report.tournamentRounds.length} /{' '}
                  {MAX_TOURNAMENT_REPORT_ROUNDS}回戦
                </p>
              </div>
              <button
                className="button"
                type="button"
                disabled={
                  report.tournamentRounds.length >= MAX_TOURNAMENT_REPORT_ROUNDS
                }
                onClick={() =>
                  addRound('tournamentRounds', MAX_TOURNAMENT_REPORT_ROUNDS)
                }
              >
                ＋ トーナメント戦を追加
              </button>
            </div>
            <div className="tournament-round-list">
              {report.tournamentRounds.map((round, index) => (
                <RoundEditor
                  key={`tournament-${index}`}
                  label={`T${index + 1}`}
                  round={round}
                  oshiCards={oshiCards}
                  onChange={(nextRound) =>
                    updateRound('tournamentRounds', index, nextRound)
                  }
                  onRemove={() => removeRound('tournamentRounds', index)}
                />
              ))}
            </div>
          </section>
        </div>

        <aside
          className="report-preview-column"
          aria-labelledby="report-preview-heading"
        >
          <div className="report-preview" aria-live="polite">
            <p className="report-preview__eyebrow">TOURNAMENT REPORT</p>
            <h2 id="report-preview-heading">
              {report.tournamentName.trim() || '大会名未入力'}
            </h2>
            {report.placement.trim() && (
              <p className="report-preview__placement">{report.placement}</p>
            )}
            <dl className="report-preview__facts">
              <div>
                <dt>使用推し</dt>
                <dd>
                  {selfOshi ? formatOshiLabel(selfOshi, oshiCards) : '未選択'}
                </dd>
              </div>
              {Number.isFinite(report.participantCount) && (
                <div>
                  <dt>参加人数</dt>
                  <dd>{report.participantCount?.toLocaleString('ja-JP')}人</dd>
                </div>
              )}
              {report.eventDate && (
                <div>
                  <dt>開催日</dt>
                  <dd>{report.eventDate}</dd>
                </div>
              )}
            </dl>

            {(report.swissRounds.length > 0 ||
              swissSummary.completedRounds > 0) && (
              <section aria-labelledby="report-preview-swiss">
                <h3 id="report-preview-swiss">
                  Swiss
                  {swissSummary.completedRounds > 0 && (
                    <span>{formatTournamentResultSummary(swissSummary)}</span>
                  )}
                </h3>
                <ol>
                  {report.swissRounds.map((round, index) => (
                    <RoundPreview
                      key={`preview-swiss-${index}`}
                      label={`R${index + 1}`}
                      round={round}
                      oshiCards={oshiCards}
                    />
                  ))}
                </ol>
              </section>
            )}

            {(report.tournamentRounds.length > 0 ||
              tournamentSummary.completedRounds > 0) && (
              <section aria-labelledby="report-preview-tournament">
                <h3 id="report-preview-tournament">
                  Tournament
                  {tournamentSummary.completedRounds > 0 && (
                    <span>
                      {formatTournamentResultSummary(tournamentSummary)}
                    </span>
                  )}
                </h3>
                <ol>
                  {report.tournamentRounds.map((round, index) => (
                    <RoundPreview
                      key={`preview-tournament-${index}`}
                      label={`T${index + 1}`}
                      round={round}
                      oshiCards={oshiCards}
                    />
                  ))}
                </ol>
              </section>
            )}

            <p className="report-preview__brand">HLSieve DB</p>
          </div>

          <div className="report-copy-control">
            <button
              className="button"
              type="button"
              disabled={!reportText}
              onClick={() => void copyReportText()}
            >
              テキストをコピー
            </button>
            <p
              className={`report-copy-control__feedback report-copy-control__feedback--${copyFeedback}`}
              aria-live="polite"
              role={
                copyFeedback === 'error'
                  ? 'alert'
                  : copyFeedback === 'success'
                    ? 'status'
                    : undefined
              }
            >
              {copyFeedback === 'success' && 'コピーしました'}
              {copyFeedback === 'error' && 'コピーできませんでした'}
            </p>

            <fieldset className="report-image-preset">
              <legend>画像サイズ</legend>
              {(
                Object.entries(TOURNAMENT_EXPORT_PRESETS) as [
                  TournamentExportPreset,
                  (typeof TOURNAMENT_EXPORT_PRESETS)[TournamentExportPreset],
                ][]
              ).map(([preset, config]) => (
                <label key={preset}>
                  <input
                    type="radio"
                    name="tournament-export-preset"
                    value={preset}
                    checked={exportPreset === preset}
                    onChange={() => setExportPreset(preset)}
                  />
                  <span>
                    <strong>{config.label}</strong>
                    <small>{config.dimensionsLabel}</small>
                  </span>
                </label>
              ))}
            </fieldset>

            <button
              className="button"
              type="button"
              disabled={!reportText || imageStatus === 'generating'}
              onClick={() => void createReportImages()}
            >
              {imageStatus === 'generating'
                ? '画像を作成しています…'
                : '大会結果を画像にする'}
            </button>
            <p className="report-image-export-notice">
              ※現在、カード画像は出力画像に含まれません。推しホロメン名・対戦結果などの情報のみ画像化されます。
            </p>
            {imageStatus === 'error' && (
              <p className="report-image-export-error" role="alert">
                画像を作成できませんでした。もう一度お試しください。
              </p>
            )}

            <section
              className="report-share-control"
              aria-labelledby="report-share-heading"
            >
              <h3 id="report-share-heading">共有</h3>
              <button
                className="button"
                type="button"
                disabled={!reportText || shareStatus === 'sharing'}
                onClick={() => void shareReport()}
              >
                {shareStatus === 'sharing'
                  ? '共有を準備しています…'
                  : '共有する'}
              </button>
              <a
                className={`button report-share-control__x${
                  reportText ? '' : ' report-share-control__x--disabled'
                }`}
                href={xIntentUrl}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!reportText}
                aria-label="Xで投稿"
                onClick={(event) => {
                  if (!reportText) event.preventDefault()
                }}
              >
                Xで投稿
              </a>
              <p className="report-share-control__notice">
                画像共有に対応している端末では、選択中サイズの大会結果PNGも共有シートへ渡します。X投稿画面には画像が自動添付されないため、保存した画像を添付してください。
              </p>
              <p
                className={`report-share-control__feedback report-share-control__feedback--${shareStatus}`}
                aria-live="polite"
                role={
                  shareStatus === 'error'
                    ? 'alert'
                    : shareStatus !== 'idle' && shareStatus !== 'sharing'
                      ? 'status'
                      : undefined
                }
              >
                {shareStatus === 'shared-with-images' &&
                  '画像を含めて共有シートへ渡しました。'}
                {shareStatus === 'shared-text-only' &&
                  'この端末では画像を共有できないため、テキストのみ共有しました。画像は保存して添付してください。'}
                {shareStatus === 'unsupported' &&
                  'この端末では共有シートを利用できません。テキストをコピーするか、Xで投稿を利用してください。'}
                {shareStatus === 'error' &&
                  '共有できませんでした。テキストをコピーするか、Xで投稿を利用してください。'}
              </p>
            </section>
          </div>

          {validationErrors.length > 0 && (
            <div className="report-validation" aria-live="polite">
              <h2>レポートを完成するには</h2>
              <ul>
                {validationErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {imagePreviews && (
        <TournamentReportImageDialog
          images={imagePreviews}
          onClose={() => setImagePreviews(undefined)}
          onSave={(image) => downloadFile(image.url, image.fileName)}
        />
      )}
    </main>
  )
}
