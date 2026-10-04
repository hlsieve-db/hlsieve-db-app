import { chromium } from 'playwright'
import { SITE_ORIGIN } from '../../../src/domain/site/constants'
import type {
  TournamentEventFile,
  TournamentIndexFile,
  TournamentOshiMasterFile,
} from '../../../src/domain/tournaments/types'

async function json<T>(path: string): Promise<T> {
  const response = await fetch(new URL(path, SITE_ORIGIN))
  if (
    !response.ok ||
    !response.headers.get('content-type')?.includes('application/json')
  )
    throw new Error(`Production JSON smoke failed: ${path}`)
  return response.json() as Promise<T>
}

export async function waitForProductionPublication(options: {
  expectedVersion: string
  cardsDataVersion: string
  eventIds: readonly string[]
  timeoutMs?: number
  pollMs?: number
}): Promise<void> {
  const deadline = Date.now() + (options.timeoutMs ?? 10 * 60_000)
  let index: TournamentIndexFile | undefined
  while (Date.now() < deadline) {
    index = await json<TournamentIndexFile>('/tournaments/index.json')
    if (index.dataVersion === options.expectedVersion) break
    await new Promise((resolve) =>
      setTimeout(resolve, options.pollMs ?? 10_000),
    )
  }
  if (index?.dataVersion !== options.expectedVersion)
    throw new Error('Production deployment version timeout.')
  const master = await json<TournamentOshiMasterFile>(
    '/tournaments/oshi-master.json',
  )
  if (master.cardsDataVersion !== options.cardsDataVersion)
    throw new Error('Production Cards/Oshi version mismatch.')
  const summaries = new Map(index.events.map((event) => [event.id, event]))
  for (const eventId of options.eventIds) {
    const event = await json<TournamentEventFile>(
      `/tournaments/events/${eventId}.json`,
    )
    const summary = summaries.get(eventId)
    if (
      !summary ||
      event.dataVersion !== options.expectedVersion ||
      event.event.results.length !== summary.resultCount
    )
      throw new Error(`Production Event consistency failure: ${eventId}`)
    if (
      /playerName|address|submitter|attemptCount|leaseUntil|\.cache|[A-Z]:\\/i.test(
        JSON.stringify(event),
      )
    )
      throw new Error(`Production Event privacy failure: ${eventId}`)
  }
}

export async function smokeProductionUi(
  representatives: ReadonlyArray<{ eventId: string; resultId: string }>,
): Promise<void> {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({
      viewport: { width: 304, height: 900 },
    })
    const paths = [
      '/tournaments',
      ...representatives.flatMap(({ eventId, resultId }) => [
        `/tournaments/${eventId}`,
        `/tournaments/${eventId}/results/${resultId}`,
      ]),
      '/tournaments/analysis',
    ]
    for (const path of paths) {
      const response = await page.goto(new URL(path, SITE_ORIGIN).toString(), {
        waitUntil: 'networkidle',
      })
      if (!response?.ok())
        throw new Error(`Production UI smoke failed: ${path}`)
      const body = await page.locator('body').innerText()
      if (/カード情報を一部表示できません|Application error/i.test(body))
        throw new Error(`Production Result smoke failed: ${path}`)
      if (path.includes('/results/')) {
        const height = await page.evaluate(
          () => document.documentElement.scrollHeight,
        )
        for (let top = 0; top <= height; top += 500) {
          await page.evaluate((value) => window.scrollTo(0, value), top)
          await page.waitForTimeout(50)
        }
        const images = await page.locator('main img').evaluateAll((elements) =>
          elements.map((element) => {
            const image = element as HTMLImageElement
            return image.complete && image.naturalWidth > 0
          }),
        )
        if (
          images.length < 2 ||
          images.some((loaded) => !loaded) ||
          !/Deck Code|HLSieveにコピー|DECK LOGで見る/.test(body)
        )
          throw new Error(`Production Result card smoke failed: ${path}`)
      }
      const width = await page.evaluate(() => [
        document.documentElement.clientWidth,
        document.documentElement.scrollWidth,
      ])
      if (width[0] !== width[1])
        throw new Error(`Production mobile overflow: ${path}`)
    }
  } finally {
    await browser.close()
  }
}
