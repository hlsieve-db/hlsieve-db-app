import type { Card } from '../cards/types'
import {
  buildTournamentReportImageFileName,
  buildTournamentReportImagePages,
  DEFAULT_TOURNAMENT_EXPORT_PRESET,
  TOURNAMENT_EXPORT_PRESETS,
  type TournamentExportPreset,
  type TournamentReportImagePage,
} from './imageReport'
import type { TournamentReport } from './types'

const FONT_FAMILY =
  '"Yu Gothic", "Hiragino Sans", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif'

const EXPORT_COLORS = {
  background: '#f4f7fb',
  header: '#10233f',
  accent: '#0ea5a8',
  accentSoft: '#d9f3f2',
  surface: '#ffffff',
  stripe: '#edf3f8',
  text: '#10233f',
  muted: '#52647a',
  border: '#cbd8e6',
  win: '#087f5b',
  draw: '#8a5b00',
  loss: '#b42318',
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
    headerHeight: 280,
    contentTop: 304,
    contentX: 48,
    contentWidth: 984,
    sectionHeaderHeight: 48,
    sectionGap: 10,
    rowHeight: 84,
    rowSurfaceHeight: 80,
    footerBrandY: 1296,
    footerUrlY: 1326,
    footerNoticeY: 1320,
    titleSize: 54,
    titleMinimumSize: 36,
    titleMaximumWidth: 900,
    contextSize: 25,
    sectionTitleSize: 30,
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

function drawHeader(
  context: CanvasRenderingContext2D,
  page: TournamentReportImagePage,
  layout: TournamentReportRenderLayout,
): void {
  context.fillStyle = EXPORT_COLORS.header
  context.fillRect(0, 0, layout.width, layout.headerHeight)
  context.fillStyle = EXPORT_COLORS.accent
  context.fillRect(0, 0, layout.width, 12)
  context.fillStyle = '#8de0dc'
  setFont(context, 24, 800)
  context.fillText('TOURNAMENT REPORT', layout.contentX, 54)

  context.fillStyle = '#ffffff'
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
  const isMobile = layout.rowLayout === 'stacked'
  const titleStartY =
    titleLines.length === 1 ? (isMobile ? 138 : 122) : isMobile ? 108 : 96
  const titleLineHeight = isMobile ? 48 : 42
  titleLines.forEach((line, index) => {
    context.fillText(
      line,
      layout.contentX,
      titleStartY + index * titleLineHeight,
    )
  })

  const contextParts = [
    page.placement,
    page.selfOshi ? `使用推し：${page.selfOshi}` : undefined,
    page.participantCount ? `参加人数：${page.participantCount}` : undefined,
    page.eventDate ? `開催日：${page.eventDate}` : undefined,
  ].filter((value): value is string => value !== undefined)
  context.fillStyle = '#dce8f5'
  setFont(context, layout.contextSize, 700)
  const contextY =
    titleLines.length === 1 ? (isMobile ? 224 : 184) : isMobile ? 246 : 196
  context.fillText(
    ellipsize(context, contextParts.join('  ｜  '), layout.contentWidth),
    layout.contentX,
    contextY,
  )

  if (page.totalPages > 1) {
    context.fillStyle = '#ffffff'
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
  setFont(context, 29, 800)
  context.fillStyle = EXPORT_COLORS.accent
  context.fillText(round.label, x + 20, y + 32)
  context.fillStyle = EXPORT_COLORS.text
  setFont(context, 28, 750)
  context.fillText(
    ellipsize(context, round.opponent, width - 130),
    x + 110,
    y + 32,
  )
  setFont(context, 25, 750)
  context.fillStyle = EXPORT_COLORS.text
  context.fillText(round.playOrder, x + 110, y + 68)
  context.fillText(round.initiative, x + 310, y + 68)
  context.fillStyle = resultColor(round.result)
  setFont(context, 26, 900)
  context.fillText(round.result, x + 520, y + 68)
}

function drawSingleLineRound(
  context: CanvasRenderingContext2D,
  round: TournamentReportImagePage['sections'][number]['rounds'][number],
  x: number,
  y: number,
): void {
  setFont(context, 25, 800)
  context.fillStyle = EXPORT_COLORS.accent
  context.fillText(round.label, x + 20, y + 34)
  context.fillStyle = EXPORT_COLORS.text
  setFont(context, 25, 700)
  context.fillText(ellipsize(context, round.opponent, 620), x + 126, y + 34)
  context.fillText(round.playOrder, x + 786, y + 34)
  context.fillText(round.initiative, x + 966, y + 34)
  context.fillStyle = resultColor(round.result)
  setFont(context, 25, 900)
  context.fillText(round.result, x + 1166, y + 34)
}

function drawSection(
  context: CanvasRenderingContext2D,
  section: TournamentReportImagePage['sections'][number],
  startY: number,
  layout: TournamentReportRenderLayout,
): number {
  context.fillStyle = EXPORT_COLORS.accentSoft
  context.fillRect(
    layout.contentX,
    startY,
    layout.contentWidth,
    layout.sectionHeaderHeight,
  )
  context.fillStyle = EXPORT_COLORS.text
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
    context.fillStyle =
      index % 2 === 0 ? EXPORT_COLORS.surface : EXPORT_COLORS.stripe
    context.fillRect(
      layout.contentX,
      y,
      layout.contentWidth,
      layout.rowSurfaceHeight,
    )
    context.fillStyle = EXPORT_COLORS.border
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

export function drawTournamentReportImagePage(
  context: CanvasRenderingContext2D,
  page: TournamentReportImagePage,
): void {
  const layout = RENDER_LAYOUTS[page.preset]
  context.textBaseline = 'alphabetic'
  context.textAlign = 'left'
  context.fillStyle = EXPORT_COLORS.background
  context.fillRect(0, 0, layout.width, layout.height)
  drawHeader(context, page, layout)
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
  const layout = RENDER_LAYOUTS[preset]
  const files: TournamentReportImageFile[] = []
  for (const page of pages) {
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
