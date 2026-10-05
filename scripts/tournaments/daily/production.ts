import { chromium } from 'playwright'
import { SITE_ORIGIN } from '../../../src/domain/site/constants'
import type {
  TournamentEventFile,
  TournamentIndexFile,
  TournamentOshiMasterFile,
} from '../../../src/domain/tournaments/types'

export type ResultSmokeObservation = {
  url: string
  warning: boolean
  sections: { oshi: boolean; main: boolean; cheer: boolean }
  actions: {
    deckCode: boolean
    copyCode: boolean
    deckLog: boolean
    hlsieve: boolean
  }
  images: Array<{
    src: string
    complete: boolean
    naturalWidth: number
    state?: string
  }>
}

export type RepresentativeImageWaiter = {
  scrollIntoView: () => Promise<void>
  waitForAttached: () => Promise<void>
  waitForLoaded: () => Promise<void>
}

export async function waitForRepresentativeCardImage(
  waiter: RepresentativeImageWaiter,
): Promise<void> {
  await waiter.scrollIntoView()
  await waiter.waitForAttached()
  await waiter.waitForLoaded()
}

export function assertResultSmoke(observation: ResultSmokeObservation): void {
  const failures: string[] = []
  if (observation.warning) failures.push('card lookup warning is present')
  for (const [name, present] of Object.entries(observation.sections))
    if (!present) failures.push(`missing ${name} section`)
  for (const [name, present] of Object.entries(observation.actions))
    if (!present) failures.push(`missing ${name} action`)
  if (observation.images.length === 0)
    failures.push('representative image is missing')
  for (const image of observation.images) {
    if (!image.complete || image.naturalWidth <= 0)
      failures.push(
        `representative image failed: ${image.src || '(no src)'} ` +
          `(complete=${image.complete}, naturalWidth=${image.naturalWidth}, state=${image.state ?? 'unknown'})`,
      )
  }
  if (failures.length > 0)
    throw new Error(
      [
        `Production Result card smoke failed: ${observation.url}`,
        `Failed conditions: ${failures.join('; ')}`,
        `Image count: ${observation.images.length}`,
        `Warning present: ${observation.warning}`,
        `Missing actions: ${
          Object.entries(observation.actions)
            .filter(([, present]) => !present)
            .map(([name]) => name)
            .join(', ') || '-'
        }`,
      ].join('\n'),
    )
}

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
      if (/Application error/i.test(body))
        throw new Error(`Production Result smoke failed: ${path}`)
      if (path.includes('/results/')) {
        const mainSection = page
          .locator('.tournament-deck-zone')
          .filter({ has: page.getByRole('heading', { name: 'メインデッキ' }) })
        const imageRoot = mainSection.locator('[data-image-state]').first()
        const representative = imageRoot.locator('img')
        try {
          await waitForRepresentativeCardImage({
            scrollIntoView: () => imageRoot.scrollIntoViewIfNeeded(),
            waitForAttached: () =>
              representative.waitFor({ state: 'attached', timeout: 10_000 }),
            waitForLoaded: async () => {
              await page.waitForFunction(
                (image) =>
                  image instanceof HTMLImageElement &&
                  image.complete &&
                  image.naturalWidth > 0,
                await representative.elementHandle(),
                { timeout: 15_000 },
              )
            },
          })
        } catch {
          // The structured assertion below reports the exact image state.
        }
        const images = await representative.evaluateAll((elements) =>
          elements.map((element) => {
            const image = element as HTMLImageElement
            return {
              src: image.currentSrc || image.src,
              complete: image.complete,
              naturalWidth: image.naturalWidth,
              state: image.parentElement?.dataset.imageState,
            }
          }),
        )
        const headings = await page.getByRole('heading').allTextContents()
        assertResultSmoke({
          url: path,
          warning: body.includes('カード情報を一部表示できません'),
          sections: {
            oshi: headings.includes('推しホロメン構成'),
            main: headings.includes('メインデッキ'),
            cheer: headings.includes('エールデッキ'),
          },
          actions: {
            deckCode: body.includes('Deck Code'),
            copyCode: body.includes('コードをコピー'),
            deckLog: body.includes('DECK LOGで見る'),
            hlsieve: body.includes('HLSieveにコピー'),
          },
          images,
        })
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
