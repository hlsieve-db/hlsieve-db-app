import type { Page, Response } from 'playwright'

export const COLLECTOR_PAGE_DELAY_MS = 3_000

export class CollectorBlockedError extends Error {}

export function assertAllowedStatus(status: number, url: string): void {
  if (status === 403 || status === 429) {
    throw new CollectorBlockedError(
      `Collector stopped on HTTP ${status}: ${url}`,
    )
  }
}

export function assertNoChallengeText(text: string, url: string): void {
  const normalized = text.normalize('NFKC').toLowerCase()
  if (
    /captcha|cloudflare|cloudfront|access denied|forbidden|request blocked|automation block|verify you are human|403 error|ロボットではない/.test(
      normalized,
    )
  ) {
    throw new CollectorBlockedError(`Collector challenge detected: ${url}`)
  }
  if (/ログインしてください|ログインが必要/.test(normalized)) {
    throw new CollectorBlockedError(
      `Collector login requirement detected: ${url}`,
    )
  }
}

export async function assertPublicPage(
  page: Page,
  response: Response | null,
): Promise<void> {
  if (response) assertAllowedStatus(response.status(), page.url())
  assertNoChallengeText(await page.locator('body').innerText(), page.url())
}

export async function delayBetweenPages(
  delayMs = COLLECTOR_PAGE_DELAY_MS,
): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delayMs))
}
