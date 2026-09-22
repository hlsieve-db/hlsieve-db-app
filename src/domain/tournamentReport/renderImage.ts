import { CARD_COLOR_LABELS } from '../cards/constants'
import type { Card } from '../cards/types'
import {
  buildTournamentReportImageFileName,
  buildTournamentReportImagePages,
  DEFAULT_TOURNAMENT_EXPORT_PRESET,
  TOURNAMENT_EXPORT_PRESETS,
  type TournamentExportPreset,
  type TournamentReportImagePage,
} from './imageReport'
import {
  resolveOshiCard,
  resolveOshiDisplayName,
  selfOshiEntry,
} from './oshiEntry'
import type { TournamentReport } from './types'

const FONT_FAMILY =
  '"Yu Gothic", "Hiragino Sans", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif'

const EXPORT_COLORS = {
  background: '#f8fafc',
  header: '#ffffff',
  accent: '#0ea5a8',
  accentSoft: '#d8f1f0',
  surface: '#ffffff',
  stripe: '#f1f5f9',
  text: '#16233a',
  muted: '#4e627c',
  border: '#cbd5e1',
  win: '#c62828',
  draw: '#222222',
  loss: '#1565c0',
} as const

const MOBILE_EXPORT_COLORS = {
  background: '#f8fafc',
  section: '#d8f1f0',
  row: '#ffffff',
  rowAlternate: '#f1f5f9',
  text: '#16233a',
  muted: '#4e627c',
  border: '#cbd5e1',
  win: '#c62828',
  draw: '#222222',
  loss: '#1565c0',
} as const

type TournamentReportRenderLayout = {
  width: number
  height: number
  headerHeight: number
  contentTop: number
  contentX: number
  contentWidth: number
  sectionHeaderHeight: number
  sectionGap: number
  rowHeight: number
  rowSurfaceHeight: number
  footerBrandY: number
  footerUrlY: number
  footerNoticeY: number
  titleSize: number
  titleMinimumSize: number
  titleMaximumWidth: number
  contextSize: number
  sectionTitleSize: number
  rowLayout: 'stacked' | 'single-line'
}

const RENDER_LAYOUTS: Record<
  TournamentExportPreset,
  TournamentReportRenderLayout
> = {
  mobile_4_5: {
    width: TOURNAMENT_EXPORT_PRESETS.mobile_4_5.width,
    height: TOURNAMENT_EXPORT_PRESETS.mobile_4_5.height,
    headerHeight: 230,
    contentTop: 254,
    contentX: 48,
    contentWidth: 984,
    sectionHeaderHeight: 56,
    sectionGap: 16,
    rowHeight: 106,
    rowSurfaceHeight: 92,
    footerBrandY: 1296,
    footerUrlY: 1326,
    footerNoticeY: 1320,
    titleSize: 38,
    titleMinimumSize: 28,
    titleMaximumWidth: 900,
    contextSize: 22,
    sectionTitleSize: 32,
    rowLayout: 'stacked',
  },
  landscape_16_9: {
    width: TOURNAMENT_EXPORT_PRESETS.landscape_16_9.width,
    height: TOURNAMENT_EXPORT_PRESETS.landscape_16_9.height,
    headerHeight: 224,
    contentTop: 248,
    contentX: 64,
    contentWidth: 1472,
    sectionHeaderHeight: 42,
    sectionGap: 8,
    rowHeight: 54,
    rowSurfaceHeight: 50,
    footerBrandY: 850,
    footerUrlY: 876,
    footerNoticeY: 864,
    titleSize: 58,
    titleMinimumSize: 34,
    titleMaximumWidth: 1260,
    contextSize: 26,
    sectionTitleSize: 28,
    rowLayout: 'single-line',
  },
}

export type TournamentReportImageFile = {
  blob: Blob
  fileName: string
  page: TournamentReportImagePage
  width: number
  height: number
}

export type TournamentReportCanvasFactory = (
  width: number,
  height: number,
) => HTMLCanvasElement

export type GenerateTournamentReportImagesOptions = {
  preset?: TournamentExportPreset
  createCanvas?: TournamentReportCanvasFactory
}

function defaultCanvasFactory(
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function setFont(
  context: CanvasRenderingContext2D,
  size: number,
  weight = 700,
): void {
  context.font = `${weight} ${size}px ${FONT_FAMILY}`
}

function fitFontSize(
  context: CanvasRenderingContext2D,
  text: string,
  maximumWidth: number,
  initialSize: number,
  minimumSize: number,
  weight = 700,
): number {
  let size = initialSize
  while (size > minimumSize) {
    setFont(context, size, weight)
    if (context.measureText(text).width <= maximumWidth) return size
    size -= 1
  }
  return minimumSize
}

function ellipsize(
  context: CanvasRenderingContext2D,
  text: string,
  maximumWidth: number,
): string {
  if (context.measureText(text).width <= maximumWidth) return text
  let fitted = text
  while (
    fitted.length > 0 &&
    context.measureText(`${fitted}…`).width > maximumWidth
  ) {
    fitted = fitted.slice(0, -1)
  }
  return `${fitted}…`
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maximumWidth: number,
  maximumLines: number,
): string[] {
  const lines: string[] = []
  let remaining = text
  while (remaining && lines.length < maximumLines) {
    let line = ''
    for (const character of remaining) {
      if (context.measureText(`${line}${character}`).width > maximumWidth) break
      line += character
    }
    if (!line) line = remaining[0]
    lines.push(line)
    remaining = remaining.slice(line.length)
  }
  if (remaining && lines.length > 0) {
    lines[lines.length - 1] = ellipsize(
      context,
      `${lines[lines.length - 1]}${remaining}`,
      maximumWidth,
    )
  }
  return lines
}

function resultColor(result: string): string {
  if (result.includes('WIN')) return EXPORT_COLORS.win
  if (result.includes('DRAW')) return EXPORT_COLORS.draw
  if (result.includes('LOSE')) return EXPORT_COLORS.loss
  return EXPORT_COLORS.text
}

function mobileResultColor(result: string): string {
  if (result.includes('WIN')) return MOBILE_EXPORT_COLORS.win
  if (result.includes('DRAW')) return MOBILE_EXPORT_COLORS.draw
  if (result.includes('LOSE')) return MOBILE_EXPORT_COLORS.loss
  return MOBILE_EXPORT_COLORS.text
}

function mobileInitiativeLabel(value: string): string {
  if (value.includes('○')) return '○'
  if (value.includes('×')) return '×'
  return value || '—'
}

function formatImageSelfOshi(
  report: TournamentReport,
  oshiCards: readonly Card[],
): string | undefined {
  const entry = selfOshiEntry(report)
  const card = resolveOshiCard(entry, oshiCards)
  // Only a resolved card can supply colours and a number. Free text that names
  // no card is still printed, just without the extra detail.
  if (!card) return resolveOshiDisplayName(entry, oshiCards)
  const colors = card.colors.map((color) => CARD_COLOR_LABELS[color]).join('/')
  return `${card.name}${colors ? `【${colors}】` : ''}（${card.cardNumber}）`
}

function drawHeader(
  context: CanvasRenderingContext2D,
  page: TournamentReportImagePage,
  layout: TournamentReportRenderLayout,
): void {
  context.fillStyle = EXPORT_COLORS.header
  context.fillRect(0, 0, layout.width, layout.headerHeight)
  context.fillStyle = EXPORT_COLORS.accent
  context.fillRect(0, 0, layout.width, 12)
  context.fillStyle = EXPORT_COLORS.text
  const isMobile = layout.rowLayout === 'stacked'
  setFont(context, isMobile ? 20 : 24, 800)
  context.fillText('大会成績', layout.contentX, isMobile ? 42 : 54)

  context.fillStyle = EXPORT_COLORS.text
  const titleSize = fitFontSize(
    context,
    page.tournamentName,
    layout.titleMaximumWidth,
    layout.titleSize,
    layout.titleMinimumSize,
    900,
  )
  setFont(context, titleSize, 900)
  const titleLines =
    context.measureText(page.tournamentName).width <= layout.titleMaximumWidth
      ? [page.tournamentName]
      : wrapText(context, page.tournamentName, layout.titleMaximumWidth, 2)
  const titleStartY =
    titleLines.length === 1 ? (isMobile ? 84 : 122) : isMobile ? 72 : 96
  const titleLineHeight = isMobile ? 34 : 42
  titleLines.forEach((line, index) => {
    context.fillText(
      line,
      layout.contentX,
      titleStartY + index * titleLineHeight,
    )
  })

  if (isMobile) {
    const selfOshiY = titleLines.length === 1 ? 136 : 148
    context.fillStyle = EXPORT_COLORS.text
    setFont(context, 30, 900)
    context.fillText(
      ellipsize(
        context,
        `使用推し：${page.selfOshi ?? '未入力'}`,
        layout.contentWidth,
      ),
      layout.contentX,
      selfOshiY,
    )
  }

  const contextParts = [
    page.placement,
    !isMobile && page.selfOshi ? `使用推し：${page.selfOshi}` : undefined,
    page.participantCount ? `参加人数：${page.participantCount}` : undefined,
    page.eventDate ? `開催日：${page.eventDate}` : undefined,
  ].filter((value): value is string => value !== undefined)
  context.fillStyle = EXPORT_COLORS.muted
  setFont(context, layout.contextSize, 700)
  const contextY =
    titleLines.length === 1 ? (isMobile ? 190 : 184) : isMobile ? 202 : 196
  context.fillText(
    ellipsize(context, contextParts.join('  ｜  '), layout.contentWidth),
    layout.contentX,
    contextY,
  )

  if (page.totalPages > 1) {
    context.fillStyle = EXPORT_COLORS.text
    setFont(context, 24, 800)
    context.textAlign = 'right'
    context.fillText(
      `${page.pageNumber} / ${page.totalPages}`,
      layout.width - layout.contentX,
      54,
    )
    context.textAlign = 'left'
  }
}

function drawStackedRound(
  context: CanvasRenderingContext2D,
  round: TournamentReportImagePage['sections'][number]['rounds'][number],
  x: number,
  y: number,
  width: number,
): void {
  setFont(context, 24, 700)
  context.fillStyle = EXPORT_COLORS.accent
  context.fillText(round.label, x + 24, y + 42)
  context.fillStyle = MOBILE_EXPORT_COLORS.text
  setFont(context, 28, 700)
  context.fillText(
    ellipsize(context, round.opponent || '対戦相手未入力', width - 300),
    x + 126,
    y + 42,
  )
  setFont(context, 22, 600)
  context.fillStyle = MOBILE_EXPORT_COLORS.muted
  context.fillText(
    [round.playOrder, round.initiative].filter(Boolean).join('  '),
    x + 126,
    y + 66,
  )
  context.fillStyle = mobileResultColor(round.result)
  setFont(context, 24, 700)
  context.textAlign = 'right'
  context.fillText(round.result || '未入力', x + width - 24, y + 46)
  context.textAlign = 'left'
  context.fillStyle = MOBILE_EXPORT_COLORS.border
  context.fillRect(x + 24, y + 78, width - 48, 1)
}

function drawSingleLineRound(
  context: CanvasRenderingContext2D,
  round: TournamentReportImagePage['sections'][number]['rounds'][number],
  x: number,
  y: number,
): void {
  setFont(context, 24, 700)
  context.fillStyle = EXPORT_COLORS.accent
  context.fillText(round.label, x + 20, y + 34)
  context.fillStyle = EXPORT_COLORS.text
  setFont(context, 28, 700)
  context.fillText(ellipsize(context, round.opponent, 620), x + 126, y + 34)
  setFont(context, 22, 600)
  context.fillText(round.playOrder, x + 786, y + 34)
  context.fillText(round.initiative, x + 966, y + 34)
  context.fillStyle = resultColor(round.result)
  setFont(context, 24, 700)
  context.fillText(round.result, x + 1166, y + 34)
}

function drawLandscapeColumnHeader(
  context: CanvasRenderingContext2D,
  layout: TournamentReportRenderLayout,
): void {
  const x = layout.contentX
  const baseline = layout.contentTop - 6
  context.fillStyle = EXPORT_COLORS.muted
  setFont(context, 20, 700)
  context.fillText('R', x + 20, baseline)
  context.fillText('対戦相手 / 使用推し', x + 126, baseline)
  context.fillText('先後', x + 786, baseline)
  context.fillText('手番選択', x + 966, baseline)
  context.fillText('結果', x + 1166, baseline)
}

function drawSection(
  context: CanvasRenderingContext2D,
  section: TournamentReportImagePage['sections'][number],
  startY: number,
  layout: TournamentReportRenderLayout,
): number {
  const isMobile = layout.rowLayout === 'stacked'
  context.fillStyle = isMobile
    ? MOBILE_EXPORT_COLORS.section
    : EXPORT_COLORS.accentSoft
  context.fillRect(
    layout.contentX,
    startY,
    layout.contentWidth,
    layout.sectionHeaderHeight,
  )
  context.fillStyle = isMobile ? MOBILE_EXPORT_COLORS.text : EXPORT_COLORS.text
  setFont(context, layout.sectionTitleSize, 900)
  context.fillText(
    section.heading,
    layout.contentX + 20,
    startY + layout.sectionHeaderHeight - 11,
  )
  if (section.summary) {
    context.fillStyle = EXPORT_COLORS.accent
    context.textAlign = 'right'
    context.fillText(
      section.summary,
      layout.contentX + layout.contentWidth - 24,
      startY + layout.sectionHeaderHeight - 11,
    )
    context.textAlign = 'left'
  }

  let y = startY + layout.sectionHeaderHeight + 6
  section.rounds.forEach((round, index) => {
    context.fillStyle = isMobile
      ? index % 2 === 0
        ? MOBILE_EXPORT_COLORS.row
        : MOBILE_EXPORT_COLORS.rowAlternate
      : index % 2 === 0
        ? EXPORT_COLORS.surface
        : EXPORT_COLORS.stripe
    context.fillRect(
      layout.contentX,
      y,
      layout.contentWidth,
      layout.rowSurfaceHeight,
    )
    context.fillStyle = isMobile
      ? MOBILE_EXPORT_COLORS.border
      : EXPORT_COLORS.border
    context.fillRect(
      layout.contentX,
      y + layout.rowSurfaceHeight - 1,
      layout.contentWidth,
      1,
    )
    if (layout.rowLayout === 'stacked') {
      drawStackedRound(context, round, layout.contentX, y, layout.contentWidth)
    } else {
      drawSingleLineRound(context, round, layout.contentX, y)
    }
    y += layout.rowHeight
  })
  return y + layout.sectionGap
}

function mobileRoundSummary(page: TournamentReportImagePage): {
  wins: number
  losses: number
  draws: number
  first: number
  second: number
} {
  const rounds = page.sections.flatMap((section) => section.rounds)
  return rounds.reduce(
    (summary, round) => {
      if (round.result.includes('WIN')) summary.wins += 1
      if (round.result.includes('LOSE')) summary.losses += 1
      if (round.result.includes('DRAW')) summary.draws += 1
      if (round.playOrder === '先攻') summary.first += 1
      if (round.playOrder === '後攻') summary.second += 1
      return summary
    },
    { wins: 0, losses: 0, draws: 0, first: 0, second: 0 },
  )
}

function drawMobileHeader(
  context: CanvasRenderingContext2D,
  page: TournamentReportImagePage,
  layout: TournamentReportRenderLayout,
): void {
  context.fillStyle = MOBILE_EXPORT_COLORS.row
  context.fillRect(0, 0, layout.width, 240)
  context.fillStyle = EXPORT_COLORS.accent
  context.fillRect(0, 0, layout.width, 10)

  context.fillStyle = MOBILE_EXPORT_COLORS.text
  setFont(context, 21, 900)
  context.fillText('大会成績', layout.contentX, 46)

  context.fillStyle = MOBILE_EXPORT_COLORS.text
  const titleSize = fitFontSize(
    context,
    page.tournamentName,
    layout.contentWidth,
    36,
    27,
    850,
  )
  setFont(context, titleSize, 850)
  const titleLines = wrapText(
    context,
    page.tournamentName,
    layout.contentWidth,
    2,
  )
  const titleStartY = titleLines.length === 1 ? 91 : 76
  titleLines.forEach((line, index) => {
    context.fillText(line, layout.contentX, titleStartY + index * 32)
  })

  const selfOshiLabelY = titleLines.length === 1 ? 126 : 143
  const detailsY = titleLines.length === 1 ? 202 : 220
  context.fillStyle = MOBILE_EXPORT_COLORS.text
  const selfOshiText = `使用推し：${page.selfOshi ?? '未入力'}`
  const selfOshiSize = fitFontSize(
    context,
    selfOshiText,
    layout.contentWidth,
    30,
    20,
    900,
  )
  setFont(context, selfOshiSize, 900)
  context.fillText(
    ellipsize(context, selfOshiText, layout.contentWidth),
    layout.contentX,
    selfOshiLabelY + 26,
  )

  const details = [
    page.participantCount ? `参加人数 ${page.participantCount}` : undefined,
    page.eventDate ? `開催日 ${page.eventDate}` : undefined,
  ].filter((value): value is string => value !== undefined)
  context.fillStyle = MOBILE_EXPORT_COLORS.muted
  setFont(context, 20, 750)
  context.fillText(details.join('  ｜  '), layout.contentX, detailsY)

  if (page.totalPages > 1) {
    context.textAlign = 'right'
    setFont(context, 20, 800)
    context.fillText(
      `${page.pageNumber} / ${page.totalPages}`,
      layout.width - layout.contentX,
      46,
    )
    context.textAlign = 'left'
  }
}

function drawMobileRecord(
  context: CanvasRenderingContext2D,
  page: TournamentReportImagePage,
  layout: TournamentReportRenderLayout,
): void {
  const summary = mobileRoundSummary(page)
  const record = `${summary.wins}勝${summary.losses}敗${summary.draws > 0 ? `${summary.draws}分` : ''}`
  const completed = summary.wins + summary.losses + summary.draws
  const winRate =
    completed > 0 ? Math.round((summary.wins / completed) * 100) : 0
  const x = layout.contentX
  const y = 256

  context.fillStyle = MOBILE_EXPORT_COLORS.row
  context.fillRect(x, y, layout.contentWidth, 190)
  context.fillStyle = EXPORT_COLORS.accent
  context.fillRect(x, y, 8, 190)
  context.fillStyle = MOBILE_EXPORT_COLORS.text
  setFont(context, 19, 900)
  context.fillText('RECORD', x + 28, y + 34)

  context.fillStyle = MOBILE_EXPORT_COLORS.text
  setFont(context, 46, 700)
  context.fillText(record, x + 28, y + 100)
  context.textAlign = 'right'
  setFont(context, 36, 700)
  context.fillText(
    page.placement ?? '順位未入力',
    x + layout.contentWidth - 28,
    y + 98,
  )
  context.textAlign = 'left'

  context.fillStyle = MOBILE_EXPORT_COLORS.muted
  setFont(context, 20, 750)
  context.fillText(
    `勝率 ${winRate}%    先攻 ${summary.first}    後攻 ${summary.second}`,
    x + 30,
    y + 152,
  )
}

function drawMobileMatches(
  context: CanvasRenderingContext2D,
  page: TournamentReportImagePage,
  layout: TournamentReportRenderLayout,
): void {
  const rounds = page.sections.flatMap((section) => section.rounds)
  const x = layout.contentX
  const headingY = 486
  const headerY = 508
  const headerHeight = 42
  const rowHeight = 72
  const rowStart = headerY + headerHeight
  const columns = {
    round: x + 18,
    opponent: x + 92,
    playOrder: x + 620,
    initiative: x + 746,
    result: x + layout.contentWidth - 20,
  }

  context.fillStyle = MOBILE_EXPORT_COLORS.text
  setFont(context, 23, 900)
  context.fillText(`MATCHES — 全${rounds.length}戦`, x, headingY)
  context.fillStyle = MOBILE_EXPORT_COLORS.section
  context.fillRect(x, headerY, layout.contentWidth, headerHeight)
  context.fillStyle = MOBILE_EXPORT_COLORS.text
  setFont(context, 20, 700)
  context.fillText('R', columns.round, headerY + 28)
  context.fillText('対戦相手 / 使用推し', columns.opponent, headerY + 28)
  context.fillText('先後', columns.playOrder, headerY + 28)
  context.fillText('手番選択', columns.initiative, headerY + 28)
  context.textAlign = 'right'
  context.fillText('結果', columns.result, headerY + 28)
  context.textAlign = 'left'

  rounds.forEach((round, index) => {
    const y = rowStart + index * rowHeight
    context.fillStyle =
      index % 2 === 0
        ? MOBILE_EXPORT_COLORS.row
        : MOBILE_EXPORT_COLORS.rowAlternate
    context.fillRect(x, y, layout.contentWidth, rowHeight)
    context.fillStyle = MOBILE_EXPORT_COLORS.border
    context.fillRect(x, y + rowHeight - 1, layout.contentWidth, 1)

    context.fillStyle = EXPORT_COLORS.accent
    setFont(context, 24, 700)
    context.fillText(round.label, columns.round, y + 44)
    context.fillStyle = MOBILE_EXPORT_COLORS.text
    setFont(context, 28, 700)
    context.fillText(
      ellipsize(context, round.opponent || '対戦相手未入力', 500),
      columns.opponent,
      y + 44,
    )
    setFont(context, 22, 600)
    context.fillText(round.playOrder || '—', columns.playOrder, y + 44)
    context.fillText(
      mobileInitiativeLabel(round.initiative),
      columns.initiative,
      y + 44,
    )
    context.fillStyle = mobileResultColor(round.result)
    setFont(context, 24, 700)
    context.textAlign = 'right'
    context.fillText(round.result || '未入力', columns.result, y + 44)
    context.textAlign = 'left'
  })
}

function drawMobileFooter(
  context: CanvasRenderingContext2D,
  layout: TournamentReportRenderLayout,
): void {
  context.textAlign = 'right'
  context.fillStyle = MOBILE_EXPORT_COLORS.text
  setFont(context, 24, 900)
  context.fillText('HLSieve DB', layout.width - layout.contentX, 1296)
  context.fillStyle = MOBILE_EXPORT_COLORS.muted
  setFont(context, 18, 700)
  context.fillText('hlsieve.com', layout.width - layout.contentX, 1326)
  context.textAlign = 'left'
}

function drawMobileTournamentReportImagePage(
  context: CanvasRenderingContext2D,
  page: TournamentReportImagePage,
  layout: TournamentReportRenderLayout,
): void {
  context.fillStyle = MOBILE_EXPORT_COLORS.background
  context.fillRect(0, 0, layout.width, layout.height)
  drawMobileHeader(context, page, layout)
  drawMobileRecord(context, page, layout)
  drawMobileMatches(context, page, layout)
  drawMobileFooter(context, layout)
}

export function drawTournamentReportImagePage(
  context: CanvasRenderingContext2D,
  page: TournamentReportImagePage,
): void {
  const layout = RENDER_LAYOUTS[page.preset]
  context.textBaseline = 'alphabetic'
  context.textAlign = 'left'
  if (page.preset === 'mobile_4_5') {
    drawMobileTournamentReportImagePage(context, page, layout)
    return
  }
  context.fillStyle = EXPORT_COLORS.background
  context.fillRect(0, 0, layout.width, layout.height)
  drawHeader(context, page, layout)
  drawLandscapeColumnHeader(context, layout)
  let y = layout.contentTop
  page.sections.forEach((section) => {
    y = drawSection(context, section, y, layout)
  })

  context.fillStyle = EXPORT_COLORS.muted
  setFont(context, 20, 700)
  context.fillText(
    '非公式ファンメイドツール',
    layout.contentX,
    layout.footerNoticeY,
  )
  context.textAlign = 'right'
  context.fillStyle = EXPORT_COLORS.text
  setFont(context, 24, 900)
  context.fillText(
    'HLSieve DB',
    layout.width - layout.contentX,
    layout.footerBrandY,
  )
  context.fillStyle = EXPORT_COLORS.muted
  setFont(context, 18, 700)
  context.fillText(
    'hlsieve.com',
    layout.width - layout.contentX,
    layout.footerUrlY,
  )
  context.textAlign = 'left'
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.type !== 'image/png' || blob.size === 0) {
        reject(new Error('PNG image generation failed.'))
        return
      }
      resolve(blob)
    }, 'image/png')
  })
}

export async function generateTournamentReportImages(
  report: TournamentReport,
  oshiCards: readonly Card[],
  options: GenerateTournamentReportImagesOptions = {},
): Promise<TournamentReportImageFile[]> {
  const preset = options.preset ?? DEFAULT_TOURNAMENT_EXPORT_PRESET
  const createCanvas = options.createCanvas ?? defaultCanvasFactory
  const pages = buildTournamentReportImagePages(report, oshiCards, preset)
  const selfOshi = formatImageSelfOshi(report, oshiCards)
  const layout = RENDER_LAYOUTS[preset]
  const files: TournamentReportImageFile[] = []
  for (const sourcePage of pages) {
    const page = { ...sourcePage, selfOshi }
    const canvas = createCanvas(layout.width, layout.height)
    canvas.width = layout.width
    canvas.height = layout.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas 2D context is unavailable.')
    drawTournamentReportImagePage(context, page)
    const blob = await canvasToPngBlob(canvas)
    files.push({
      blob,
      fileName: buildTournamentReportImageFileName(
        report.tournamentName,
        page.pageNumber,
        page.totalPages,
      ),
      page,
      width: layout.width,
      height: layout.height,
    })
  }
  return files
}
