import { describe, expect, it } from 'vitest'

import { parseDeckLogHtml } from './deckLog'

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
})
