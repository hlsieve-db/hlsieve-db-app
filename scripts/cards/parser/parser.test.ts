/** @vitest-environment node */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { fixtureManifest } from '../fixtures/manifest'
import { resolveHttpUrl } from './htmlTokens'
import { parseCardDetailHtml } from './parseCardDetail'
import { parseCardListHtml } from './parseCardList'
import type { ParseResult, RawCardDetail, RawCardList } from './types'

const fixtureRoot = resolve(process.cwd(), 'scripts/cards/fixtures')

function expectSuccess<T>(result: ParseResult<T>): T {
  if (!result.ok) {
    throw new Error(`Expected parse success: ${JSON.stringify(result.errors)}`)
  }

  return result.value
}

async function readFixture(id: string): Promise<{
  html: string
  sourceUrl: string
}> {
  const fixture = fixtureManifest.find((entry) => entry.id === id)
  if (!fixture) {
    throw new Error(`Unknown fixture: ${id}`)
  }

  return {
    html: await readFile(resolve(fixtureRoot, fixture.file), 'utf8'),
    sourceUrl: fixture.sourceUrl,
  }
}

async function parseDetail(id: string): Promise<RawCardDetail> {
  const fixture = await readFixture(id)
  return expectSuccess(parseCardDetailHtml(fixture.html, fixture.sourceUrl))
}

async function parseList(id: string): Promise<RawCardList> {
  const fixture = await readFixture(id)
  return expectSuccess(parseCardListHtml(fixture.html, fixture.sourceUrl))
}

describe('parseCardDetailHtml', () => {
  it.each([
    [
      'detail-oshi-kiara-multiple-qa',
      '小鳥遊キアラ',
      'hBP01-006',
      '推しホロメン',
    ],
    ['detail-debut-shirogane-noel', '白銀ノエル', 'hSD09-005', 'ホロメン'],
    [
      'detail-limited-two-tone-pc',
      'ツートンカラーパソコン',
      'hBP04-089',
      'サポート・アイテム・LIMITED',
    ],
    ['detail-cheer-white', '白エール', 'hY01-001', 'エール'],
  ])(
    'parses basic raw fields from %s',
    async (fixtureId, name, cardNumber, cardType) => {
      const card = await parseDetail(fixtureId)

      expect(card.nameRaw).toBe(name)
      expect(card.cardNumberRaw).toBe(cardNumber)
      expect(card.cardTypeRaw).toBe(cardType)
    },
  )

  it.each([
    ['detail-debut-shirogane-noel', 'Debut'],
    ['detail-multicolor-fuwamoco', '1st'],
    ['detail-second-houshou-marine', '2nd'],
    ['detail-spot-kanata', 'Spot'],
    ['detail-buzz-houshou-marine', '1st'],
  ])('keeps the raw Bloom value from %s', async (fixtureId, bloomLevel) => {
    const card = await parseDetail(fixtureId)

    expect(card.bloomLevelRaw).toBe(bloomLevel)
  })

  it('keeps Buzz as the raw card type', async () => {
    const card = await parseDetail('detail-buzz-houshou-marine')

    expect(card.cardTypeRaw).toBe('Buzzホロメン')
  })

  it('parses tags, rarity, HP, Life, illustrator, and product names', async () => {
    const holomem = await parseDetail('detail-debut-shirogane-noel')
    const oshi = await parseDetail('detail-oshi-kiara-multiple-qa')

    expect(holomem.tagsRaw).toEqual(['#JP', '#3期生', '#お酒', '#サマー'])
    expect(holomem.rarityRaw).toBe('C')
    expect(holomem.hpRaw).toBe('100')
    expect(holomem.illustratorRaw).toBe('スライム')
    expect(holomem.productNamesRaw).toEqual(['スタートデッキ 赤 宝鐘マリン'])
    expect(oshi.lifeRaw).toBe('5')
  })

  it('preserves color and baton-pass icons as raw image tokens', async () => {
    const multicolor = await parseDetail('detail-multicolor-fuwamoco')
    const second = await parseDetail('detail-second-houshou-marine')

    expect(multicolor.colorTokens).toEqual([
      expect.objectContaining({
        kind: 'image',
        image: expect.objectContaining({ altRaw: '青赤' }),
      }),
    ])
    expect(second.batonPassTokens).toHaveLength(2)
    expect(second.batonPassTokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'image',
          image: expect.objectContaining({ altRaw: '◇' }),
        }),
      ]),
    )
  })

  it('keeps ability text as content blocks without semantic conversion', async () => {
    const support = await parseDetail('detail-limited-two-tone-pc')
    const holomem = await parseDetail('detail-debut-shirogane-noel')

    expect(support.abilityBlocks[0]).toMatchObject({
      labelRaw: '能力テキスト',
    })
    expect(support.abilityBlocks[0]?.textRaw).toContain(
      'LIMITED:ターンに1枚しか使えない。',
    )
    expect(holomem.abilityBlocks[0]?.labelRaw).toBe('キーワード')
    expect(holomem.abilityBlocks[0]?.tokens[0]).toMatchObject({
      kind: 'image',
      image: { altRaw: 'コラボエフェクト' },
    })
  })

  it('preserves image and text token order inside arts', async () => {
    const card = await parseDetail('detail-second-houshou-marine')
    const tokens = card.artBlocks[0]?.tokens ?? []

    expect(tokens[0]).toMatchObject({
      kind: 'image',
      image: { altRaw: '赤' },
    })
    expect(tokens[1]).toMatchObject({
      kind: 'text',
      textRaw: expect.stringContaining('3期生の絆'),
    })
    expect(tokens[2]).toMatchObject({
      kind: 'image',
      image: { altRaw: '黄+50' },
    })
    expect(tokens[3]).toMatchObject({
      kind: 'text',
      textRaw: expect.stringContaining('自分のステージ'),
    })
  })

  it('extracts the card image from every normal detail fixture', async () => {
    const detailFixtures = fixtureManifest.filter(
      (fixture) => fixture.kind === 'detail',
    )

    for (const fixture of detailFixtures) {
      const html = await readFile(resolve(fixtureRoot, fixture.file), 'utf8')
      const card = expectSuccess(parseCardDetailHtml(html, fixture.sourceUrl))

      expect(card.cardImage, fixture.id).toBeDefined()
      expect(card.cardImage?.srcRaw, fixture.id).toContain(
        '/wp-content/images/cardlist/',
      )
      expect(card.cardImage?.srcRaw, fixture.id).not.toContain('/texticon/')
      expect(card.cardImage?.resolvedUrl, fixture.id).toMatch(
        /^https:\/\/hololive-official-cardgame\.com\/wp-content\/images\/cardlist\//,
      )
    }
  })

  it('returns a warning instead of fabricating a missing card image', async () => {
    const fixture = await readFixture('detail-spot-kanata')
    const htmlWithoutCardImage = fixture.html.replace(
      /<div class="img w100"><img[^>]+><\/div>/,
      '<div class="img w100"></div>',
    )
    const result = parseCardDetailHtml(htmlWithoutCardImage, fixture.sourceUrl)

    expect(result.ok).toBe(true)
    expect(result.ok && result.value.cardImage).toBeUndefined()
    expect(result.ok && result.warnings).toContainEqual(
      expect.objectContaining({ code: 'MISSING_CARD_IMAGE' }),
    )
  })

  it('resolves only http(s) image URLs against the source URL', () => {
    const sourceUrl = 'https://hololive-official-cardgame.com/cardlist/?id=1'

    expect(resolveHttpUrl('/images/card.png', sourceUrl)).toBe(
      'https://hololive-official-cardgame.com/images/card.png',
    )
    expect(
      resolveHttpUrl('data:image/png;base64,abc', sourceUrl),
    ).toBeUndefined()
    expect(resolveHttpUrl('javascript:alert(1)', sourceUrl)).toBeUndefined()
  })

  it('keeps FUWAMOCO printings separate with their own image URLs', async () => {
    const original = await parseDetail('detail-multicolor-fuwamoco')
    const reprint = await parseDetail('detail-multicolor-fuwamoco-reprint')

    expect(original.officialId).toBe('614')
    expect(reprint.officialId).toBe('2545')
    expect(original.cardNumberRaw).toBe('hBP03-050')
    expect(reprint.cardNumberRaw).toBe('hBP03-050')
    expect(original.cardImage?.resolvedUrl).not.toBe(
      reprint.cardImage?.resolvedUrl,
    )
  })

  it('keeps every product block and raw release date', async () => {
    const cheer = await parseDetail('detail-cheer-white')

    expect(cheer.productBlocks).toHaveLength(8)
    expect(cheer.productBlocks[0]).toMatchObject({
      productNameRaw: 'ブースターパック「ブルーミングレディアンス」',
      categoryRaw: 'Boosters',
      releaseDateRaw: '2024年09月20日(金)',
    })
  })

  it('keeps Q&A HTML without parsing its contents', async () => {
    const withQa = await parseDetail('detail-oshi-kiara-multiple-qa')
    const withoutQa = await parseDetail('detail-spot-kanata')

    expect(withQa.qaSectionHtmlRaw).toContain('id="faq"')
    expect(withQa.qaSectionHtmlRaw).toContain('Q689')
    expect(withoutQa.qaSectionHtmlRaw).toBeUndefined()
  })

  it.each([
    ['', 'https://hololive-official-cardgame.com/cardlist/?id=1'],
    [
      '<div id="content"></div>',
      'https://hololive-official-cardgame.com/cardlist/?id=1',
    ],
    ['<div id="content"></div>', 'not a URL'],
    [
      '<div id="content"></div>',
      'https://hololive-official-cardgame.com/cardlist/',
    ],
    [
      '<div id="content"><div class="cardlist-Detail"></div></div>',
      'https://hololive-official-cardgame.com/cardlist/?id=1',
    ],
  ])(
    'does not turn malformed detail input into an empty success',
    (html, sourceUrl) => {
      expect(parseCardDetailHtml(html, sourceUrl).ok).toBe(false)
    },
  )
})

describe('parseCardListHtml', () => {
  it('parses multiple entries with detail URLs, ids, images, and raw text', async () => {
    const list = await parseList('list-normal-multi-result')

    expect(list.entries.length).toBeGreaterThan(1)
    expect(list.entries[0]).toMatchObject({
      nameRaw: '天音かなた',
      officialId: '22',
      cardNumberRaw: 'hBP01-001',
    })
    expect(list.entries[0]?.detailUrl).toContain('/cardlist/?id=22')
    expect(list.entries[0]?.image?.resolvedUrl).toContain(
      '/wp-content/images/cardlist/hBP01/hBP01-001_OSR.png',
    )
    expect(list.entries[0]?.textRaw).toContain('推しホロメン')
  })

  it('keeps the special entry without inventing a card number', async () => {
    const fixture = await readFixture('list-special-deck-building-rules')
    const result = parseCardListHtml(fixture.html, fixture.sourceUrl)
    const list = expectSuccess(result)

    expect(list.entries).toHaveLength(1)
    expect(list.entries[0]).toMatchObject({
      nameRaw: 'デッキ構築ルール',
      officialId: '2697',
    })
    expect(list.entries[0]?.cardNumberRaw).toBeUndefined()
    expect(result.ok && result.warnings).toContainEqual(
      expect.objectContaining({ code: 'LIST_ENTRY_NULL_CARD_NUMBER' }),
    )
  })

  it.each([
    ['', 'https://hololive-official-cardgame.com/cardlist/cardsearch/'],
    [
      '<div id="content"></div>',
      'https://hololive-official-cardgame.com/cardlist/cardsearch/',
    ],
    ['<div id="content"></div>', 'invalid'],
  ])('fails malformed list input', (html, sourceUrl) => {
    expect(parseCardListHtml(html, sourceUrl).ok).toBe(false)
  })
})
