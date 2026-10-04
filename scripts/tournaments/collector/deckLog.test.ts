import { chromium, type Browser } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  DeckLogReadinessError,
  parseDeckLogHtml,
  waitForDeckLogReady,
} from './deckLog'

function card(title: string | undefined, quantity: string | undefined): string {
  return `<div class="card-item"><img ${title ? `title="${title}"` : ''}>${
    quantity === undefined ? '' : `<span class="num">${quantity}</span>`
  }</div>`
}

function fixture(
  overrides: Partial<Record<'oshi' | 'main' | 'cheer', string>> = {},
) {
  return `<main>
    <h3>推しホロメン</h3><div>${overrides.oshi ?? card('OSHI-1 : Oshi', '1')}</div>
    <h3>メインデッキ</h3><div>${
      overrides.main ??
      `${card('MAIN-1 : Main A', '2')}${card('MAIN-1 : Main B', '2')}`
    }</div>
    <h3>エールデッキ</h3><div>${overrides.cheer ?? card('CHEER-1 : Cheer', '20')}</div>
  </main>`
}

describe('parseDeckLogHtml', () => {
  it('extracts all zones and aggregates duplicate card numbers within one zone', () => {
    expect(parseDeckLogHtml(fixture())).toEqual({
      oshi: [{ cardNumber: 'OSHI-1', quantity: 1 }],
      main: [{ cardNumber: 'MAIN-1', quantity: 4 }],
      cheer: [{ cardNumber: 'CHEER-1', quantity: 20 }],
    })
  })

  it('does not aggregate the same card number across zones', () => {
    const parsed = parseDeckLogHtml(
      fixture({
        oshi: card('SAME-1 : Oshi', '1'),
        main: card('SAME-1 : Main', '50'),
        cheer: card('SAME-1 : Cheer', '20'),
      }),
    )
    expect(parsed).toEqual({
      oshi: [{ cardNumber: 'SAME-1', quantity: 1 }],
      main: [{ cardNumber: 'SAME-1', quantity: 50 }],
      cheer: [{ cardNumber: 'SAME-1', quantity: 20 }],
    })
  })

  it.each([
    ['missing title', { main: card(undefined, '4') }, /title is missing/],
    [
      'malformed card number',
      { main: card('bad number : Main', '4') },
      /Malformed/,
    ],
    [
      'missing quantity',
      { main: card('MAIN-1 : Main', undefined) },
      /quantity/,
    ],
  ])('rejects %s', (_label, overrides, expected) => {
    expect(() => parseDeckLogHtml(fixture(overrides))).toThrow(expected)
  })

  it('does not fall back to alt text when the card title is missing', () => {
    expect(() =>
      parseDeckLogHtml(
        fixture({
          main: '<div class="card-item"><img alt="MAIN-1 : Main"><span class="num">50</span></div>',
        }),
      ),
    ).toThrow(/title is missing/)
  })
})

describe('waitForDeckLogReady', () => {
  let browser: Browser

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
  })

  afterAll(async () => {
    await browser.close()
  })

  async function expectPending(resolved: () => boolean): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(resolved()).toBe(false)
  }

  it('waits until all three semantic sections contain parser-ready cards', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent('<main><h3>推しホロメン</h3></main>')
      let resolved = false
      const ready = waitForDeckLogReady(page).then(() => {
        resolved = true
      })

      await page.evaluate(() => {
        document
          .querySelector('main')!
          .insertAdjacentHTML(
            'beforeend',
            '<div><div class="card-item"><img title="OSHI-1 : Oshi"><span class="num">1</span></div></div>',
          )
      })
      await expectPending(() => resolved)
      await page.evaluate(() => {
        document
          .querySelector('main')!
          .insertAdjacentHTML(
            'beforeend',
            '<h3>メインデッキ</h3><div><div class="card-item"><img title="MAIN-1 : Main"><span class="num">50</span></div></div>',
          )
      })
      await expectPending(() => resolved)
      await page.evaluate(() => {
        document
          .querySelector('main')!
          .insertAdjacentHTML(
            'beforeend',
            '<h3>エールデッキ</h3><div><div class="card-item"><img title="CHEER-1 : Cheer"><span class="num">20</span></div></div>',
          )
      })

      await ready
      expect(resolved).toBe(true)
    } finally {
      await page.close()
    }
  })

  it.each([
    [
      'missing Oshi section',
      '<h3>メインデッキ</h3><div><div class="card-item"><img title="MAIN-1 : Main"><span class="num">50</span></div></div><h3>エールデッキ</h3><div><div class="card-item"><img title="CHEER-1 : Cheer"><span class="num">20</span></div></div>',
    ],
    [
      'missing Main section',
      '<h3>推しホロメン</h3><div><div class="card-item"><img title="OSHI-1 : Oshi"><span class="num">1</span></div></div><h3>エールデッキ</h3><div><div class="card-item"><img title="CHEER-1 : Cheer"><span class="num">20</span></div></div>',
    ],
    [
      'missing Cheer section',
      '<h3>推しホロメン</h3><div><div class="card-item"><img title="OSHI-1 : Oshi"><span class="num">1</span></div></div><h3>メインデッキ</h3><div><div class="card-item"><img title="MAIN-1 : Main"><span class="num">50</span></div></div>',
    ],
    [
      'missing container',
      '<h3>推しホロメン</h3><h3>メインデッキ</h3><div><div class="card-item"><img title="MAIN-1 : Main"><span class="num">50</span></div></div><h3>エールデッキ</h3><div><div class="card-item"><img title="CHEER-1 : Cheer"><span class="num">20</span></div></div>',
    ],
    [
      'missing card item',
      '<h3>推しホロメン</h3><div></div><h3>メインデッキ</h3><div><div class="card-item"><img title="MAIN-1 : Main"><span class="num">50</span></div></div><h3>エールデッキ</h3><div><div class="card-item"><img title="CHEER-1 : Cheer"><span class="num">20</span></div></div>',
    ],
    [
      'missing title',
      '<h3>推しホロメン</h3><div><div class="card-item"><img><span class="num">1</span></div></div><h3>メインデッキ</h3><div><div class="card-item"><img title="MAIN-1 : Main"><span class="num">50</span></div></div><h3>エールデッキ</h3><div><div class="card-item"><img title="CHEER-1 : Cheer"><span class="num">20</span></div></div>',
    ],
    [
      'missing quantity',
      '<h3>推しホロメン</h3><div><div class="card-item"><img title="OSHI-1 : Oshi"></div></div><h3>メインデッキ</h3><div><div class="card-item"><img title="MAIN-1 : Main"><span class="num">50</span></div></div><h3>エールデッキ</h3><div><div class="card-item"><img title="CHEER-1 : Cheer"><span class="num">20</span></div></div>',
    ],
  ])('does not accept %s', async (_label, incomplete) => {
    const page = await browser.newPage()
    try {
      await page.setContent(`<main>${incomplete}</main>`)
      page.setDefaultTimeout(50)
      await expect(waitForDeckLogReady(page)).rejects.toBeInstanceOf(
        DeckLogReadinessError,
      )
    } finally {
      await page.close()
    }
  })
})
