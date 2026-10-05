import type { Locator, Page } from 'playwright'

import { TOURNAMENT_DATA_START_DATE } from '../../../src/domain/tournaments/constants'
import {
  getTournamentPlacementMaxRank,
  selectTournamentPlacementResults,
} from '../../../src/domain/tournaments/placement'
import type {
  TournamentDeck,
  TournamentImportEvent,
  TournamentImportResult,
  TournamentResultCoverage,
} from '../../../src/domain/tournaments/types'
import { createVenueSlug, extractPrefecture } from './venue'
import {
  findTournamentSeriesByPublicName,
  normalizePublicSeriesName,
  type TournamentSeriesConfig,
} from './seriesConfig'
import { assertPublicPage, delayBetweenPages } from './policy'
import { buildOfficialTournamentResultUrl } from '../queue/submission'

const BUSHI_NAVI_RESULT_LIST_URL =
  'https://www.bushi-navi.com/event/result/list?game_title_id%5B%5D=10'
const BUSHI_NAVI_ORIGIN = 'https://www.bushi-navi.com'
const DECK_LOG_ORIGIN = 'https://decklog.bushiroad.com'
const RESULT_SATURATION_COUNT = 10

export type DateRange = { from: string; to: string }

export function assertCollectorStartDate(range: DateRange): void {
  if (range.from < TOURNAMENT_DATA_START_DATE) {
    throw new Error(
      `Collector range starts before ${TOURNAMENT_DATA_START_DATE}.`,
    )
  }
}

type DiscoveryCard = {
  dateTimeText: string
  venueName: string
  address: string
}

export type BushiNaviCollectorOptions = {
  page: Page
  series: TournamentSeriesConfig
  range: DateRange
  sourceEventId?: string
  resultLimit?: number
  allowSaturatedTarget?: boolean
  resolveDeck: (
    deckCode: string,
    openPublicPage: () => Promise<Page>,
  ) => Promise<TournamentDeck>
  delayMs?: number
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function parseIsoDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid Collector date: ${value}`)
  }
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.valueOf()) || isoDate(date) !== value) {
    throw new Error(`Invalid Collector date: ${value}`)
  }
  return date
}

export function splitDateRange(range: DateRange): [DateRange, DateRange] {
  const from = parseIsoDate(range.from)
  const to = parseIsoDate(range.to)
  const days = Math.floor((to.valueOf() - from.valueOf()) / 86_400_000)
  if (days < 1) {
    throw new Error(
      `Incomplete discovery: ${range.from} returned ${RESULT_SATURATION_COUNT} results.`,
    )
  }
  const middle = new Date(from.valueOf() + Math.floor(days / 2) * 86_400_000)
  const next = new Date(middle.valueOf() + 86_400_000)
  return [
    { from: range.from, to: isoDate(middle) },
    { from: isoDate(next), to: range.to },
  ]
}

export function planDiscoveryResult(
  range: DateRange,
  count: number,
): { complete: true } | { complete: false; ranges: [DateRange, DateRange] } {
  if (count < RESULT_SATURATION_COUNT) return { complete: true }
  if (count > RESULT_SATURATION_COUNT) {
    throw new Error(`Unexpected Bushi Navi result count: ${count}`)
  }
  return { complete: false, ranges: splitDateRange(range) }
}

export function parseSourceEventId(url: string): string {
  const match = new URL(url).pathname.match(/^\/event\/result\/(\d+)$/)
  if (!match?.[1]) throw new Error('Bushi Navi public event ID is missing.')
  return match[1]
}

export function parseParticipantCount(text: string): number | undefined {
  const normalized = text.normalize('NFKC').replace(/\s+/g, ' ').trim()
  const label = /大会結果\s*参加者\s*:?\s*/
  if (!label.test(normalized)) return undefined
  const match = normalized.match(/大会結果\s*参加者\s*:?\s*(\d+)\s*人/)
  const participantCount = match?.[1] ? Number(match[1]) : Number.NaN
  if (!Number.isSafeInteger(participantCount) || participantCount < 1) {
    throw new KnownEventCollectionError(
      'invalid-metadata',
      'Bushi Navi participant count is invalid.',
    )
  }
  return participantCount
}

export type KnownEventErrorCode =
  | 'unknown-series'
  | 'year-mismatch'
  | 'missing-year'
  | 'generic-source-error'
  | 'invalid-metadata'
  | 'result-not-published'
  | 'deck-navigation-failed'
  | 'deck-parse-failed'

export class KnownEventCollectionError extends Error {
  constructor(
    readonly code: KnownEventErrorCode,
    message: string,
  ) {
    super(message)
  }
}

type TournamentResultReadyOptions = {
  timeoutMs?: number
  pollIntervalMs?: number
  stableSnapshots?: number
}

export async function waitForTournamentResultReady(
  page: Page,
  options: TournamentResultReadyOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 5_000
  const pollIntervalMs = options.pollIntervalMs ?? 100
  const stableSnapshots = options.stableSnapshots ?? 2
  const startedAt = Date.now()
  let previousSnapshot: string | undefined
  let stableCount = 0
  let participantInvalid = false

  while (Date.now() - startedAt <= timeoutMs) {
    const main = page.locator('main')
    const pageText = await main.innerText().catch(() => '')
    if (/サーバーからの応答がありません|undefined/i.test(pageText)) {
      throw new KnownEventCollectionError(
        'generic-source-error',
        'Bushi Navi returned a generic source error.',
      )
    }
    const [title, dateTimeText] = await Promise.all([
      main
        .locator('h3')
        .allInnerTexts()
        .then((values) => values.find((value) => /\S/.test(value)) ?? ''),
      main
        .locator('time')
        .allInnerTexts()
        .then((values) => values[0] ?? ''),
    ])
    const venueName = await readKnownEventVenueName(main, title).catch(() => '')
    let participantCount: number | undefined
    participantInvalid = /参加\s*[：:]\s*人/.test(pageText.normalize('NFKC'))
    try {
      participantCount = parseParticipantCount(pageText)
    } catch (error) {
      if (!(error instanceof KnownEventCollectionError)) throw error
      participantInvalid = true
    }
    const complete =
      title.trim().length > 0 &&
      /\d{1,2}月\d{1,2}日/.test(dateTimeText.normalize('NFKC')) &&
      venueName.trim().length > 0 &&
      /大会結果/.test(pageText) &&
      !participantInvalid
    if (complete) {
      const snapshot = JSON.stringify({
        title: title.normalize('NFKC').trim(),
        dateTimeText: dateTimeText.normalize('NFKC').trim(),
        venueName: venueName.normalize('NFKC').trim(),
        participantCount,
      })
      stableCount = snapshot === previousSnapshot ? stableCount + 1 : 1
      previousSnapshot = snapshot
      if (stableCount >= stableSnapshots) return
    } else {
      previousSnapshot = undefined
      stableCount = 0
    }
    await page.waitForTimeout(pollIntervalMs)
  }
  throw new KnownEventCollectionError(
    'invalid-metadata',
    participantInvalid
      ? 'Bushi Navi participant metadata remained invalid.'
      : 'Bushi Navi Event metadata was not ready before timeout.',
  )
}

export function buildOfficialDeckLogUrl(deckCode: string): string {
  if (!/^[A-Za-z0-9]+$/.test(deckCode)) {
    throw new Error('Deck Log code must be alphanumeric.')
  }
  return `${DECK_LOG_ORIGIN}/view/${deckCode}`
}

export type KnownEventMetadataInput = {
  title: string
  dateTimeText: string
  venueName: string
  pageText: string
}

export function resolveKnownEventVenueName(
  title: string,
  explicitStoreName?: string,
): string {
  const titleVenueName = /\s+\/\s+in\s+(.+)$/i.exec(title)?.[1]
  const venueName = (titleVenueName ?? explicitStoreName)
    ?.normalize('NFKC')
    .trim()
  if (!venueName || /[\r\n]/.test(venueName)) {
    throw new KnownEventCollectionError(
      'invalid-metadata',
      'Bushi Navi venue is missing.',
    )
  }
  return venueName
}

export async function readKnownEventVenueName(
  main: Locator,
  title: string,
): Promise<string> {
  const explicitStoreName = await main
    .locator('.eventResult-organizerName > span, .icon-store span')
    .allInnerTexts()
    .then((values) => values.find((value) => /\S/.test(value)))
  return resolveKnownEventVenueName(title, explicitStoreName)
}

export function classifyKnownEventAvailability(input: {
  metadataValid: boolean
  resultCount: number
}): 'collect' | 'waiting-result' | 'needs-review' {
  if (!input.metadataValid) return 'needs-review'
  return input.resultCount === 0 ? 'waiting-result' : 'collect'
}

export function validateKnownSeriesYear(
  displayedSeriesName: string,
  configuredYear: number,
): void {
  const yearMatches = [
    ...normalizePublicSeriesName(displayedSeriesName).matchAll(/(\d{4})年/g),
  ].map((match) => Number(match[1]))
  const years = [...new Set(yearMatches)]
  if (years.length !== 1) {
    throw new KnownEventCollectionError(
      'missing-year',
      'Bushi Navi series year is missing or ambiguous.',
    )
  }
  if (years[0] !== configuredYear) {
    throw new KnownEventCollectionError(
      'year-mismatch',
      `Bushi Navi series year does not match config: ${years[0]} != ${configuredYear}`,
    )
  }
}

export function parseKnownEventMetadata(input: KnownEventMetadataInput): {
  series: TournamentSeriesConfig
  date: string
  venueName: string
  participantCount?: number
} {
  if (/サーバーからの応答がありません|undefined/i.test(input.pageText)) {
    throw new KnownEventCollectionError(
      'generic-source-error',
      'Bushi Navi returned a generic source error.',
    )
  }
  const displayedSeriesName = input.title.split(/\s+\/\s+/)[0]
  if (!displayedSeriesName) {
    throw new KnownEventCollectionError(
      'invalid-metadata',
      'Bushi Navi series name is missing.',
    )
  }
  const series = findTournamentSeriesByPublicName(displayedSeriesName)
  if (!series) {
    throw new KnownEventCollectionError(
      'unknown-series',
      `Unknown Bushi Navi series: ${normalizePublicSeriesName(displayedSeriesName)}`,
    )
  }
  validateKnownSeriesYear(displayedSeriesName, series.year)
  const dateMatch = input.dateTimeText
    .normalize('NFKC')
    .match(/(\d{1,2})月(\d{1,2})日/)
  const venueName = resolveKnownEventVenueName(input.title, input.venueName)
  if (!dateMatch?.[1] || !dateMatch[2] || !venueName) {
    throw new KnownEventCollectionError(
      'invalid-metadata',
      'Bushi Navi date or venue is missing.',
    )
  }
  const date = `${series.year}-${dateMatch[1].padStart(2, '0')}-${dateMatch[2].padStart(2, '0')}`
  const parsedDate = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsedDate.valueOf()) || isoDate(parsedDate) !== date) {
    throw new KnownEventCollectionError(
      'invalid-metadata',
      `Bushi Navi date is invalid: ${date}`,
    )
  }
  const participantCount = parseParticipantCount(input.pageText)
  return {
    series,
    date,
    venueName,
    ...(participantCount ? { participantCount } : {}),
  }
}

export function parseRankText(text: string): number {
  const normalized = text.normalize('NFKC').trim()
  if (!/^\d+$/.test(normalized)) throw new Error('Bushi Navi rank is invalid.')
  const rank = Number(normalized)
  if (!Number.isSafeInteger(rank) || rank < 1) {
    throw new Error('Bushi Navi rank is invalid.')
  }
  return rank
}

export function parseDeckCodeFromModalImage(
  imageSource: string | undefined,
): string {
  const candidate = imageSource?.match(
    /\/deckimages\/([^/.]+)\.png(?:\?|$)/,
  )?.[1]
  if (!candidate)
    throw new Error('Deck Log code is missing from the public modal.')
  return candidate
}

export function resolveEventDate(
  dateTimeText: string,
  seriesYear: number,
  searchedRange: DateRange,
): string {
  const match = dateTimeText.normalize('NFKC').match(/(\d{1,2})月(\d{1,2})日/)
  if (!match)
    throw new Error(`Bushi Navi event date is missing: ${dateTimeText}`)
  const month = Number(match[1])
  const day = Number(match[2])
  const value = `${seriesYear.toString().padStart(4, '0')}-${month
    .toString()
    .padStart(2, '0')}-${day.toString().padStart(2, '0')}`
  parseIsoDate(value)
  if (value < searchedRange.from || value > searchedRange.to) {
    throw new Error(
      `Bushi Navi event date ${value} is outside ${searchedRange.from}..${searchedRange.to}.`,
    )
  }
  return value
}

export function determineCoverage(
  results: readonly Pick<TournamentImportResult, 'rank'>[],
): TournamentResultCoverage {
  const ranks = [...new Set(results.map((result) => result.rank))].sort(
    (left, right) => left - right,
  )
  if (ranks.length === 0) return { kind: 'variable' }
  if (ranks.every((rank, index) => rank === index + 1)) {
    return { kind: 'exact', maxRank: ranks.at(-1) ?? 1 }
  }
  return { kind: 'variable' }
}

async function navigate(
  page: Page,
  url: string,
  delayMs?: number,
): Promise<void> {
  await delayBetweenPages(delayMs)
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded' })
      await assertPublicPage(page, response)
      return
    } catch (error) {
      lastError = error
      if (
        error instanceof Error &&
        /403|429|challenge|login requirement/i.test(error.message)
      ) {
        throw error
      }
      if (attempt === 0) await delayBetweenPages(delayMs)
    }
  }
  throw lastError
}

async function openResultFilters(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: /絞り込み検索/ })
  if ((await button.innerText()).includes('▼')) {
    await button.press('Enter')
  }
}

function filterSelect(page: Page, term: string) {
  return page
    .locator('dt')
    .filter({ hasText: term })
    .locator('xpath=following-sibling::dd[1]//select')
}

function filterInputs(page: Page, term: string) {
  return page
    .locator('dt')
    .filter({ hasText: term })
    .locator('xpath=following-sibling::dd[1]//input')
}

function resultDetailButtons(page: Page) {
  return page
    .getByRole('button', { name: '大会結果詳細へ', exact: true })
    .filter({ visible: true })
}

async function selectPublicDate(
  page: Page,
  input: ReturnType<typeof filterInputs>,
  value: string,
): Promise<void> {
  const target = parseIsoDate(value)
  const targetMonth = target.getUTCMonth()
  const targetYear = target.getUTCFullYear()
  await input.click()
  const menu = page.locator('.dp__menu')
  await menu.waitFor({ state: 'visible' })
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const header = await menu.locator('.dp__month_year_wrap').innerText()
    const match = header.normalize('NFKC').match(/(\d{1,2})月\s*(\d{4})/)
    if (!match) throw new Error('Bushi Navi date picker header is invalid.')
    const displayedMonth = Number(match[1]) - 1
    const displayedYear = Number(match[2])
    const displayedIndex = displayedYear * 12 + displayedMonth
    const targetIndex = targetYear * 12 + targetMonth
    if (displayedIndex === targetIndex) break
    await menu
      .getByRole('button', {
        name: displayedIndex < targetIndex ? 'Next month' : 'Previous month',
      })
      .click()
  }
  const englishMonth = target.toLocaleString('en-US', {
    month: 'short',
    timeZone: 'UTC',
  })
  const day = target.getUTCDate()
  const dayCell = menu.locator(
    `.dp__calendar_item[data-test*="${englishMonth} ${day.toString().padStart(2, '0')} ${targetYear}"]`,
  )
  const fallbackDayCell = menu.locator(
    `.dp__calendar_item[data-test*="${englishMonth} ${day} ${targetYear}"]`,
  )
  const cell = (await dayCell.count()) === 1 ? dayCell : fallbackDayCell
  if ((await cell.count()) !== 1) {
    throw new Error(`Bushi Navi date picker could not select ${value}.`)
  }
  await cell.click()
  await menu.getByText('選択', { exact: true }).click()
  await menu.waitFor({ state: 'hidden' })
}

async function searchRange(
  page: Page,
  series: TournamentSeriesConfig,
  range: DateRange,
  delayMs?: number,
): Promise<number> {
  await navigate(page, BUSHI_NAVI_RESULT_LIST_URL, delayMs)
  await openResultFilters(page)
  await filterSelect(page, 'イベントシリーズ選択').selectOption(series.seriesId)
  const dateInputs = filterInputs(page, '開催日')
  await selectPublicDate(page, dateInputs.nth(0), range.from)
  await selectPublicDate(page, dateInputs.nth(1), range.to)
  await page.getByRole('button', { name: '検索', exact: true }).press('Enter')
  await page.waitForURL(
    (url) => url.searchParams.get('event_series_id') === series.seriesId,
  )
  await page.waitForLoadState('networkidle', { timeout: 10_000 })
  const searchedUrl = new URL(page.url())
  const urlValues = [...searchedUrl.searchParams.values()]
  const hasDateValue = (value: string) =>
    urlValues.some(
      (candidate) =>
        candidate.includes(value) ||
        candidate.includes(value.replaceAll('-', '/')),
    )
  if (!hasDateValue(range.from) || !hasDateValue(range.to)) {
    throw new Error('Bushi Navi date filter was not applied.')
  }
  await assertPublicPage(page, null)
  return resultDetailButtons(page).count()
}

async function discoverCompleteRanges(
  page: Page,
  series: TournamentSeriesConfig,
  range: DateRange,
  delayMs?: number,
  allowSaturatedTarget = false,
): Promise<DateRange[]> {
  const count = await searchRange(page, series, range, delayMs)
  if (allowSaturatedTarget && count === RESULT_SATURATION_COUNT) return [range]
  let plan: ReturnType<typeof planDiscoveryResult>
  try {
    plan = planDiscoveryResult(range, count)
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`${error.message} Search URL: ${page.url()}`, {
        cause: error,
      })
    }
    throw error
  }
  if (plan.complete) return [range]
  const [left, right] = plan.ranges
  return [
    ...(await discoverCompleteRanges(page, series, left, delayMs)),
    ...(await discoverCompleteRanges(page, series, right, delayMs)),
  ]
}

async function readDiscoveryCard(
  page: Page,
  index: number,
): Promise<DiscoveryCard> {
  const button = resultDetailButtons(page).nth(index)
  return button.evaluate((element) => {
    let container: Element | null = element.parentElement
    while (
      container &&
      !(container.querySelector('h3') && container.querySelector('time'))
    ) {
      container = container.parentElement
    }
    if (!container)
      throw new Error('Bushi Navi result card structure is missing.')
    const venue =
      container.querySelector('.eventResult-organizerName > span') ??
      container.querySelector('.icon-store span')
    const address = container.querySelector('.eventResult-prefCode')
    const time = container.querySelector('time')
    return {
      dateTimeText: time?.textContent?.trim() ?? '',
      venueName: venue?.textContent?.trim() ?? '',
      address: address?.textContent?.trim() ?? '',
    }
  })
}

export async function readReadyResultDeckCode(
  page: Page,
  resultButtonIndex: number,
): Promise<string> {
  const resultButton = page
    .getByRole('button', { name: 'デッキを見る', exact: true })
    .nth(resultButtonIndex)
  const row = resultButton.locator('xpath=ancestor::tr[1]')
  const expectedPlayerName = (await row.locator('a').first().innerText()).trim()
  if (!expectedPlayerName) {
    throw new KnownEventCollectionError(
      'deck-navigation-failed',
      'Bushi Navi Result row identity is missing.',
    )
  }
  const modal = page.locator('#eventResultDeckModal')
  if (await modal.isVisible()) {
    await modal.locator('button.buttonClose').click()
    await modal.waitFor({ state: 'hidden' })
  }

  await resultButton.press('Enter')
  const deckLogButton = page.getByRole('button', {
    name: 'デッキログへ',
    exact: true,
  })
  await deckLogButton.waitFor({ state: 'visible' })
  const expectedIdentity = expectedPlayerName
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
  await page.waitForFunction((expectedName: string) => {
    const modal = document.querySelector('#eventResultDeckModal')
    if (!modal) return false
    const playerName = modal.querySelector('.playerName')?.textContent?.trim()
    const imageSource = modal
      .querySelector('img[src*="decklog.bushiroad.com/deckimages/"]')
      ?.getAttribute('src')
    return (
      playerName?.normalize('NFKC').replace(/\s+/g, ' ').trim() ===
        expectedName &&
      /^https:\/\/decklog\.bushiroad\.com\/deckimages\/[A-Za-z0-9]+\.png$/.test(
        imageSource ?? '',
      )
    )
  }, expectedIdentity)
  const imageSource = await deckLogButton.evaluate((element) =>
    element.parentElement?.parentElement
      ?.querySelector('img[src*="decklog.bushiroad.com/deckimages/"]')
      ?.getAttribute('src'),
  )
  return parseDeckCodeFromModalImage(imageSource)
}

async function readDeckCodeAndDeck(
  page: Page,
  resultButtonIndex: number,
  resolveDeck: BushiNaviCollectorOptions['resolveDeck'],
): Promise<{ deckLogCode: string; deck: TournamentDeck }> {
  const candidate = await readReadyResultDeckCode(page, resultButtonIndex)
  const modal = page.locator('#eventResultDeckModal')

  let deckPage: Page | undefined
  try {
    const deck = await resolveDeck(candidate, async () => {
      try {
        deckPage = await page.context().newPage()
        await deckPage.goto(buildOfficialDeckLogUrl(candidate), {
          waitUntil: 'domcontentloaded',
        })
        await assertPublicPage(deckPage, null)
      } catch (error) {
        throw new KnownEventCollectionError(
          'deck-navigation-failed',
          `Deck Log navigation failed for ${candidate}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
      const match = new URL(deckPage.url()).pathname.match(/^\/view\/([^/]+)$/)
      if (!match?.[1] || decodeURIComponent(match[1]) !== candidate) {
        throw new Error(
          'Deck Log public URL does not match the public modal code.',
        )
      }
      return deckPage
    })
    return { deckLogCode: candidate, deck }
  } finally {
    await deckPage?.close()
    if (await modal.isVisible()) {
      await modal.locator('button.buttonClose').click()
      await modal.waitFor({ state: 'hidden' })
    }
  }
}

async function collectCurrentEvent(
  page: Page,
  series: TournamentSeriesConfig,
  range: DateRange,
  discovery: DiscoveryCard,
  resolveDeck: BushiNaviCollectorOptions['resolveDeck'],
  resultLimit?: number,
): Promise<TournamentImportEvent> {
  const sourceEventId = parseSourceEventId(page.url())
  const sourceUrl = `${BUSHI_NAVI_ORIGIN}/event/result/${sourceEventId}`
  const title = await page
    .locator('main h3')
    .filter({ hasText: /\S/ })
    .first()
    .innerText()
  const normalizeTitle = (value: string) =>
    value.normalize('NFKC').replace(/\s+/g, ' ').trim()
  if (!normalizeTitle(title).includes(normalizeTitle(series.seriesName))) {
    throw new Error(
      `Bushi Navi series mismatch for Event ${sourceEventId}: ${title}`,
    )
  }
  const participantText = await page.locator('main').innerText()
  const participantCount = parseParticipantCount(participantText)
  const resultButtons = page.getByRole('button', {
    name: 'デッキを見る',
    exact: true,
  })
  const resultCount = await resultButtons.count()
  let placementMaxRank: 8 | 16
  try {
    placementMaxRank = getTournamentPlacementMaxRank(participantCount)
  } catch (error) {
    throw new KnownEventCollectionError(
      'invalid-metadata',
      error instanceof Error ? error.message : String(error),
    )
  }
  const safeResultLimit = Math.min(
    resultLimit ?? placementMaxRank,
    placementMaxRank,
  )
  const results: TournamentImportResult[] = []
  for (let index = 0; index < resultCount; index += 1) {
    const row = resultButtons.nth(index).locator('xpath=ancestor::tr[1]')
    const rank = parseRankText(await row.locator('td').first().innerText())
    if (rank < 1 || rank > safeResultLimit) continue
    const { deckLogCode, deck } = await readDeckCodeAndDeck(
      page,
      index,
      resolveDeck,
    )
    const oshiCardNumber = deck.oshi[0]?.cardNumber
    if (!oshiCardNumber)
      throw new Error(`Oshi is missing for Deck ${deckLogCode}.`)
    results.push({ rank, oshiCardNumber, deckLogCode, deck })
  }
  const limitedResults = selectTournamentPlacementResults(
    results,
    participantCount,
  ).sort((left, right) => left.rank - right.rank)
  const date = resolveEventDate(discovery.dateTimeText, series.year, range)
  const venueName = discovery.venueName.normalize('NFKC').trim()
  if (!venueName)
    throw new Error(`Venue is missing for Event ${sourceEventId}.`)
  const prefecture = extractPrefecture(discovery.address)
  return {
    identity: { sourceEventId },
    tournament: {
      type: series.type,
      ...(series.environment ? { environment: series.environment } : {}),
      ...(series.round ? { round: series.round } : {}),
      seriesName: series.seriesName,
    },
    date,
    venue: {
      slug: createVenueSlug(venueName, prefecture),
      name: venueName,
      ...(prefecture ? { prefecture } : {}),
    },
    ...(participantCount ? { participantCount } : {}),
    resultCoverage: determineCoverage(limitedResults),
    results: limitedResults,
    source: {
      sourceType: 'bushi-navi-public-browser-dom',
      sourceEventId,
      sourceUrl,
    },
  }
}

export type KnownTournamentCollectorOptions = {
  page: Page
  sourceEventId: string
  resolveDeck: BushiNaviCollectorOptions['resolveDeck']
  resultLimit?: number
  delayMs?: number
}

export type KnownTournamentMetadataProbe = ReturnType<
  typeof parseKnownEventMetadata
> & {
  sourceEventId: string
}

export async function probeKnownTournamentEventMetadata(options: {
  page: Page
  sourceEventId: string
  delayMs?: number
}): Promise<KnownTournamentMetadataProbe> {
  const sourceUrl = buildOfficialTournamentResultUrl(options.sourceEventId)
  await navigate(options.page, sourceUrl, options.delayMs)
  await waitForTournamentResultReady(options.page)
  const main = options.page.locator('main')
  const pageText = await main.innerText()
  let title: string
  let dateTimeText: string
  let venueName: string
  try {
    title = await main
      .locator('h3')
      .filter({ hasText: /\S/ })
      .first()
      .innerText()
    dateTimeText = await main.locator('time').first().innerText()
    venueName = await readKnownEventVenueName(main, title)
  } catch {
    throw new KnownEventCollectionError(
      'invalid-metadata',
      `Bushi Navi required metadata is missing for ${options.sourceEventId}.`,
    )
  }
  return {
    sourceEventId: options.sourceEventId,
    ...parseKnownEventMetadata({ title, dateTimeText, venueName, pageText }),
  }
}

export async function collectKnownTournamentEvent(
  options: KnownTournamentCollectorOptions,
): Promise<TournamentImportEvent> {
  const sourceUrl = buildOfficialTournamentResultUrl(options.sourceEventId)
  const metadata = await probeKnownTournamentEventMetadata(options)
  const resultButtons = options.page.getByRole('button', {
    name: 'デッキを見る',
    exact: true,
  })
  const resultCount = await resultButtons.count()
  if (
    classifyKnownEventAvailability({ metadataValid: true, resultCount }) ===
    'waiting-result'
  ) {
    throw new KnownEventCollectionError(
      'result-not-published',
      `Bushi Navi Result is not published for ${options.sourceEventId}.`,
    )
  }
  let placementMaxRank: 8 | 16
  try {
    placementMaxRank = getTournamentPlacementMaxRank(metadata.participantCount)
  } catch (error) {
    throw new KnownEventCollectionError(
      'invalid-metadata',
      error instanceof Error ? error.message : String(error),
    )
  }
  const safeResultLimit = Math.min(
    options.resultLimit ?? placementMaxRank,
    placementMaxRank,
  )
  const results: TournamentImportResult[] = []
  for (let index = 0; index < resultCount; index += 1) {
    const row = resultButtons.nth(index).locator('xpath=ancestor::tr[1]')
    const rank = parseRankText(await row.locator('td').first().innerText())
    if (rank < 1 || rank > safeResultLimit) continue
    try {
      const { deckLogCode, deck } = await readDeckCodeAndDeck(
        options.page,
        index,
        options.resolveDeck,
      )
      const oshiCardNumber = deck.oshi[0]?.cardNumber
      if (!oshiCardNumber) {
        throw new Error(`Oshi is missing for Deck ${deckLogCode}.`)
      }
      results.push({ rank, oshiCardNumber, deckLogCode, deck })
    } catch (error) {
      if (error instanceof KnownEventCollectionError) throw error
      throw new KnownEventCollectionError(
        'deck-parse-failed',
        error instanceof Error ? error.message : String(error),
      )
    }
  }
  const limitedResults = selectTournamentPlacementResults(
    results,
    metadata.participantCount,
  ).sort((left, right) => left.rank - right.rank)
  return {
    identity: { sourceEventId: options.sourceEventId },
    tournament: {
      type: metadata.series.type,
      ...(metadata.series.environment
        ? { environment: metadata.series.environment }
        : {}),
      ...(metadata.series.round ? { round: metadata.series.round } : {}),
      seriesName: metadata.series.seriesName,
    },
    date: metadata.date,
    venue: {
      slug: createVenueSlug(metadata.venueName),
      name: metadata.venueName,
    },
    ...(metadata.participantCount
      ? { participantCount: metadata.participantCount }
      : {}),
    resultCoverage: determineCoverage(limitedResults),
    results: limitedResults,
    source: {
      sourceType: 'bushi-navi-public-browser-dom',
      sourceEventId: options.sourceEventId,
      sourceUrl,
    },
  }
}

export async function collectBushiNaviEvents(
  options: BushiNaviCollectorOptions,
): Promise<TournamentImportEvent[]> {
  assertCollectorStartDate(options.range)
  const completeRanges = await discoverCompleteRanges(
    options.page,
    options.series,
    options.range,
    options.delayMs,
    options.allowSaturatedTarget,
  )
  const events: TournamentImportEvent[] = []
  for (const range of completeRanges) {
    const count = await searchRange(
      options.page,
      options.series,
      range,
      options.delayMs,
    )
    for (let index = 0; index < count; index += 1) {
      const discovery = await readDiscoveryCard(options.page, index)
      await resultDetailButtons(options.page).nth(index).press('Enter')
      await options.page.waitForURL(/\/event\/result\/\d+$/)
      await assertPublicPage(options.page, null)
      const sourceEventId = new URL(options.page.url()).pathname.match(
        /^\/event\/result\/(\d+)$/,
      )?.[1]
      if (
        options.sourceEventId !== undefined &&
        sourceEventId !== options.sourceEventId
      ) {
        await options.page.goBack({ waitUntil: 'domcontentloaded' })
        await assertPublicPage(options.page, null)
        const refreshedCount = await searchRange(
          options.page,
          options.series,
          range,
          options.delayMs,
        )
        if (refreshedCount !== count) {
          throw new Error('Bushi Navi result count changed during collection.')
        }
        continue
      }
      events.push(
        await collectCurrentEvent(
          options.page,
          options.series,
          range,
          discovery,
          options.resolveDeck,
          options.resultLimit,
        ),
      )
      if (options.sourceEventId !== undefined) return events
      await options.page.goBack({ waitUntil: 'domcontentloaded' })
      await assertPublicPage(options.page, null)
      const refreshedCount = await searchRange(
        options.page,
        options.series,
        range,
        options.delayMs,
      )
      if (refreshedCount !== count) {
        throw new Error('Bushi Navi result count changed during collection.')
      }
    }
  }
  return events
}

export const BUSHI_NAVI_TEST_CONSTANTS = {
  resultSaturationCount: RESULT_SATURATION_COUNT,
  maxImportedRank: 16,
}
