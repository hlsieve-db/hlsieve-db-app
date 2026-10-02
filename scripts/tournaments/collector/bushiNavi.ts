import type { Page } from 'playwright'

import { TOURNAMENT_DATA_START_DATE } from '../../../src/domain/tournaments/constants'
import type {
  TournamentDeck,
  TournamentImportEvent,
  TournamentImportResult,
  TournamentResultCoverage,
} from '../../../src/domain/tournaments/types'
import { createVenueSlug, extractPrefecture } from './venue'
import type { TournamentSeriesConfig } from './seriesConfig'
import { assertPublicPage, delayBetweenPages } from './policy'

const BUSHI_NAVI_RESULT_LIST_URL =
  'https://www.bushi-navi.com/event/result/list?game_title_id%5B%5D=10'
const BUSHI_NAVI_ORIGIN = 'https://www.bushi-navi.com'
const RESULT_SATURATION_COUNT = 10
const MAX_IMPORTED_RANK = 8

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
  const match = text.normalize('NFKC').match(/大会結果参加者:\s*(\d+)人/)
  return match ? Number(match[1]) : undefined
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

export function limitToTopEight<T extends { rank: number }>(
  results: readonly T[],
): T[] {
  return results.filter((result) => result.rank >= 1 && result.rank <= 8)
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

async function readDeckCodeAndDeck(
  page: Page,
  resultButtonIndex: number,
  resolveDeck: BushiNaviCollectorOptions['resolveDeck'],
): Promise<{ deckLogCode: string; deck: TournamentDeck }> {
  await page
    .getByRole('button', { name: 'デッキを見る', exact: true })
    .nth(resultButtonIndex)
    .press('Enter')
  const deckLogButton = page.getByRole('button', {
    name: 'デッキログへ',
    exact: true,
  })
  await deckLogButton.waitFor({ state: 'visible' })
  const imageSource = await deckLogButton.evaluate((element) =>
    element.parentElement?.parentElement
      ?.querySelector('img[src*="decklog.bushiroad.com/deckimages/"]')
      ?.getAttribute('src'),
  )
  const candidate = parseDeckCodeFromModalImage(imageSource)

  let popup: Page | undefined
  try {
    const deck = await resolveDeck(candidate, async () => {
      const popupPromise = page.waitForEvent('popup', { timeout: 10_000 })
      await deckLogButton.click()
      popup = await popupPromise
      await popup.waitForLoadState('domcontentloaded')
      await assertPublicPage(popup, null)
      const match = new URL(popup.url()).pathname.match(/^\/view\/([^/]+)$/)
      if (!match?.[1] || decodeURIComponent(match[1]) !== candidate) {
        throw new Error(
          'Deck Log public URL does not match the public modal code.',
        )
      }
      return popup
    })
    return { deckLogCode: candidate, deck }
  } finally {
    await popup?.close()
    const close = page.locator('button.buttonClose').filter({ visible: true })
    if ((await close.count()) > 0) await close.first().click()
  }
}

async function collectCurrentEvent(
  page: Page,
  series: TournamentSeriesConfig,
  range: DateRange,
  discovery: DiscoveryCard,
  resolveDeck: BushiNaviCollectorOptions['resolveDeck'],
  resultLimit = MAX_IMPORTED_RANK,
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
  const safeResultLimit = Math.min(resultLimit, MAX_IMPORTED_RANK)
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
  const limitedResults = limitToTopEight(results).sort(
    (left, right) => left.rank - right.rank,
  )
  const date = resolveEventDate(discovery.dateTimeText, series.year, range)
  const venueName = discovery.venueName.normalize('NFKC').trim()
  if (!venueName)
    throw new Error(`Venue is missing for Event ${sourceEventId}.`)
  const prefecture = extractPrefecture(discovery.address)
  return {
    identity: { sourceEventId },
    tournament: {
      type: series.type,
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
  maxImportedRank: MAX_IMPORTED_RANK,
}
