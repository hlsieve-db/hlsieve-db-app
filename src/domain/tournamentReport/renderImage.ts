import type { Card } from '../cards/types'
import {
  buildTournamentReportImageFileName,
  buildTournamentReportImagePages,
  TOURNAMENT_REPORT_IMAGE_HEIGHT,
  TOURNAMENT_REPORT_IMAGE_WIDTH,
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
): void {
  context.fillStyle = EXPORT_COLORS.header
  context.fillRect(0, 0, TOURNAMENT_REPORT_IMAGE_WIDTH, 224)
  context.fillStyle = EXPORT_COLORS.accent
  context.fillRect(0, 0, TOURNAMENT_REPORT_IMAGE_WIDTH, 12)

  context.fillStyle = '#8de0dc'
  setFont(context, 24, 800)
  context.fillText('TOURNAMENT REPORT', 64, 54)

  context.fillStyle = '#ffffff'
  const titleSize = fitFontSize(context, page.tournamentName, 1260, 58, 34, 900)
  setFont(context, titleSize, 900)
  const titleLines =
    context.measureText(page.tournamentName).width <= 1260
      ? [page.tournamentName]
      : wrapText(context, page.tournamentName, 1260, 2)
  const titleStartY = titleLines.length === 1 ? 122 : 96
  titleLines.forEach((line, index) => {
    context.fillText(line, 64, titleStartY + index * 42)
  })

  const contextParts = [
    page.placement,
    page.selfOshi ? `使用推し：${page.selfOshi}` : undefined,
    page.participantCount ? `参加人数：${page.participantCount}` : undefined,
    page.eventDate ? `開催日：${page.eventDate}` : undefined,
  ].filter((value): value is string => value !== undefined)
  context.fillStyle = '#dce8f5'
  setFont(context, 26, 700)
  context.fillText(
    ellipsize(context, contextParts.join('  ｜  '), 1430),
    64,
    titleLines.length === 1 ? 184 : 196,
  )

  if (page.totalPages > 1) {
    context.fillStyle = '#ffffff'
    setFont(context, 26, 800)
    context.textAlign = 'right'
    context.fillText(
      `${page.pageNumber} / ${page.totalPages}`,
      TOURNAMENT_REPORT_IMAGE_WIDTH - 64,
      54,
    )
    context.textAlign = 'left'
  }
}

function drawSection(
  context: CanvasRenderingContext2D,
  section: TournamentReportImagePage['sections'][number],
  startY: number,
): number {
  context.fillStyle = EXPORT_COLORS.accentSoft
  context.fillRect(64, startY, 1472, 42)
  context.fillStyle = EXPORT_COLORS.text
  setFont(context, 28, 900)
  context.fillText(section.heading, 84, startY + 31)
  if (section.summary) {
    context.fillStyle = EXPORT_COLORS.accent
    context.textAlign = 'right'
    context.fillText(section.summary, 1512, startY + 31)
    context.textAlign = 'left'
  }

  let y = startY + 48
  section.rounds.forEach((round, index) => {
    context.fillStyle =
      index % 2 === 0 ? EXPORT_COLORS.surface : EXPORT_COLORS.stripe
    context.fillRect(64, y, 1472, 50)
    context.fillStyle = EXPORT_COLORS.border
    context.fillRect(64, y + 49, 1472, 1)

    setFont(context, 25, 800)
    context.fillStyle = EXPORT_COLORS.accent
    context.fillText(round.label, 84, y + 34)

    context.fillStyle = EXPORT_COLORS.text
    setFont(context, 25, 700)
    context.fillText(ellipsize(context, round.opponent, 620), 190, y + 34)
    context.fillText(round.playOrder, 850, y + 34)
    context.fillText(round.initiative, 1030, y + 34)

    context.fillStyle = resultColor(round.result)
    setFont(context, 25, 900)
    context.fillText(round.result, 1230, y + 34)
    y += 54
  })
  return y + 8
}

export function drawTournamentReportImagePage(
  context: CanvasRenderingContext2D,
  page: TournamentReportImagePage,
): void {
  context.textBaseline = 'alphabetic'
  context.textAlign = 'left'
  context.fillStyle = EXPORT_COLORS.background
  context.fillRect(
    0,
    0,
    TOURNAMENT_REPORT_IMAGE_WIDTH,
    TOURNAMENT_REPORT_IMAGE_HEIGHT,
  )
  drawHeader(context, page)

  let y = 248
  page.sections.forEach((section) => {
    y = drawSection(context, section, y)
  })

  context.fillStyle = EXPORT_COLORS.muted
  setFont(context, 20, 700)
  context.fillText('非公式ファンメイドツール', 64, 864)
  context.textAlign = 'right'
  context.fillStyle = EXPORT_COLORS.text
  setFont(context, 24, 900)
  context.fillText('HLSieve DB', 1536, 850)
  context.fillStyle = EXPORT_COLORS.muted
  setFont(context, 18, 700)
  context.fillText('hlsieve.com', 1536, 876)
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
  createCanvas: TournamentReportCanvasFactory = defaultCanvasFactory,
): Promise<TournamentReportImageFile[]> {
  const pages = buildTournamentReportImagePages(report, oshiCards)
  const files: TournamentReportImageFile[] = []
  for (const page of pages) {
    const canvas = createCanvas(
      TOURNAMENT_REPORT_IMAGE_WIDTH,
      TOURNAMENT_REPORT_IMAGE_HEIGHT,
    )
    canvas.width = TOURNAMENT_REPORT_IMAGE_WIDTH
    canvas.height = TOURNAMENT_REPORT_IMAGE_HEIGHT
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
      width: TOURNAMENT_REPORT_IMAGE_WIDTH,
      height: TOURNAMENT_REPORT_IMAGE_HEIGHT,
    })
  }
  return files
}
