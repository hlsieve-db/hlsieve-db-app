/** @vitest-environment node */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { fixtureManifest } from '../fixtures/manifest'
import { parseCardDetailHtml } from '../parser/parseCardDetail'
import { parseCardListHtml } from '../parser/parseCardList'
import type {
  ParseResult,
  RawCardDetail,
  RawCardListEntry,
} from '../parser/types'
import { normalizeCardDetail } from './normalizeCardDetail'
import { normalizeCardListEntry } from './normalizeCardListEntry'
import {
  normalizeJapaneseReleaseDate,
  normalizeProducts,
} from './normalizeProducts'
import type { NormalizeResult, NormalizedCardCandidate } from './types'

const fixtureRoot = resolve(process.cwd(), 'scripts/cards/fixtures')

function expectSuccess<T>(result: ParseResult<T> | NormalizeResult<T>): T {
  if (!result.ok) {
    throw new Error(`Expected success: ${JSON.stringify(result.errors)}`)
  }
  return result.value
}

async function fixtureInput(id: string): Promise<{
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

async function rawDetail(id: string): Promise<RawCardDetail> {
  const fixture = await fixtureInput(id)
  return expectSuccess(parseCardDetailHtml(fixture.html, fixture.sourceUrl))
}

async function candidate(id: string): Promise<NormalizedCardCandidate> {
  return expectSuccess(normalizeCardDetail(await rawDetail(id)))
}

async function rawListEntries(id: string): Promise<RawCardListEntry[]> {
  const fixture = await fixtureInput(id)
  return expectSuccess(parseCardListHtml(fixture.html, fixture.sourceUrl))
    .entries
}

describe('normalizeCardDetail', () => {
  it('normalizes an oshi holomem with LIFE and card color', async () => {
    const card = await candidate('detail-oshi-kiara-multiple-qa')

    expect(card).toMatchObject({
      cardType: 'oshi',
      isBuzz: false,
      life: 5,
      colors: ['red'],
      batonPass: [],
    })
    expect(card.hp).toBeUndefined()
  })

  it('normalizes a regular Debut holomem', async () => {
    const card = await candidate('detail-debut-shirogane-noel')

    expect(card).toMatchObject({
      cardType: 'holomem',
      isBuzz: false,
      hp: 100,
      bloomLevel: 'debut',
      debutType: 'normal',
      colors: ['white'],
    })
  })

  it('models Buzz independently from its real Bloom level', async () => {
    const card = await candidate('detail-buzz-houshou-marine')

    expect(card).toMatchObject({
      cardType: 'holomem',
      isBuzz: true,
      bloomLevel: 'first',
      hp: 240,
    })
    expect(card.extraText).toBe('このホロメンがダウンした時、自分のライフ-2')
  })

  it('classifies Debut Extra from the card extra field, not a product name', async () => {
    const raw = await rawDetail('detail-debut-shirogane-noel')
    const result = normalizeCardDetail({
      ...raw,
      productNamesRaw: ['エクストラブースターという名前だけの商品'],
      extraRaw: 'このホロメンはデッキに何枚でも入れられる',
    })
    const card = expectSuccess(result)

    expect(card.debutType).toBe('extra')
    expect(card.extraText).toBe('このホロメンはデッキに何枚でも入れられる')
    expect(card.deckLimit).toBeNull()
  })

  it('does not classify a Debut as Extra from the product name alone', async () => {
    const raw = await rawDetail('detail-debut-shirogane-noel')
    const card = expectSuccess(
      normalizeCardDetail({
        ...raw,
        productNamesRaw: ['エクストラブースター サマー・ホログラム'],
      }),
    )

    expect(card.debutType).toBe('normal')
  })

  it.each([
    ['detail-multicolor-fuwamoco', 'first'],
    ['detail-second-houshou-marine', 'second'],
    ['detail-spot-kanata', 'spot'],
  ])('normalizes the real Bloom value from %s', async (id, bloomLevel) => {
    expect((await candidate(id)).bloomLevel).toBe(bloomLevel)
  })

  it('normalizes an Energy card without holomem-only fields', async () => {
    const card = await candidate('detail-cheer-white')

    expect(card).toMatchObject({
      cardType: 'cheer',
      isBuzz: false,
      colors: ['white'],
      isLimited: false,
      batonPass: [],
    })
    expect(card.bloomLevel).toBeUndefined()
  })

  it('normalizes LIMITED, tool, and fan support types structurally', async () => {
    const limited = await candidate('detail-limited-two-tone-pc')
    const tool = await candidate('detail-tool-stone-axe')
    const fan = await candidate('detail-fan-35p')

    expect(limited).toMatchObject({
      cardType: 'support',
      supportType: 'item',
      isLimited: true,
      supportSearchCategory: 'limited',
    })
    expect(tool).toMatchObject({
      cardType: 'support',
      supportType: 'tool',
      isLimited: false,
      supportSearchCategory: 'tool',
    })
    expect(fan).toMatchObject({
      cardType: 'support',
      supportType: 'fan',
      isLimited: false,
      supportSearchCategory: 'fan',
    })
  })

  it('gives LIMITED precedence over a support subtype', async () => {
    const raw = await rawDetail('detail-tool-stone-axe')
    const card = expectSuccess(
      normalizeCardDetail({
        ...raw,
        cardTypeRaw: 'サポート・ツール・LIMITED',
      }),
    )

    expect(card.supportType).toBe('tool')
    expect(card.isLimited).toBe(true)
    expect(card.supportSearchCategory).toBe('limited')
  })

  it('maps an event subtype independently of LIMITED', async () => {
    const raw = await rawDetail('detail-limited-two-tone-pc')
    const card = expectSuccess(
      normalizeCardDetail({
        ...raw,
        cardTypeRaw: 'サポート・イベント・LIMITED',
      }),
    )

    expect(card.supportType).toBe('event')
    expect(card.supportSearchCategory).toBe('limited')
  })

  it('warns instead of silently mapping an unknown support subtype', async () => {
    const raw = await rawDetail('detail-tool-stone-axe')
    const result = normalizeCardDetail({
      ...raw,
      cardTypeRaw: 'サポート・未知種別',
    })
    const card = expectSuccess(result)

    expect(card.cardType).toBe('support')
    expect(card.supportType).toBeUndefined()
    expect(result.ok && result.warnings).toContainEqual(
      expect.objectContaining({ code: 'UNKNOWN_SUPPORT_TYPE' }),
    )
  })

  it('normalizes multi-color in DOM order and keeps colorless separate from any cost', async () => {
    const multicolor = await candidate('detail-multicolor-fuwamoco')
    const spot = await candidate('detail-spot-kanata')

    expect(multicolor.colors).toEqual(['blue', 'red'])
    expect(multicolor.batonPass).toEqual([{ color: 'any', count: 1 }])
    expect(spot.colors).toEqual(['colorless'])
    expect(spot.batonPass).toEqual([{ color: 'any', count: 1 }])
  })

  it('aggregates baton-pass costs by color in first-seen order', async () => {
    const card = await candidate('detail-second-houshou-marine')

    expect(card.batonPass).toEqual([{ color: 'any', count: 2 }])
  })

  it('normalizes structured ability signals and keeps full text', async () => {
    const card = await candidate('detail-debut-shirogane-noel')

    expect(card.abilities[0]).toMatchObject({
      type: 'collab',
      text: expect.stringContaining('3期生の海の家'),
    })
    expect(card.abilities[0]?.text).toContain('アーツ+10')
  })

  it('normalizes arts name, cost, damage, and effect text separately', async () => {
    const card = await candidate('detail-multicolor-fuwamoco')

    expect(card.arts[0]).toMatchObject({
      name: '魔界乃番犬シスターズ',
      requiredCheers: [{ color: 'any', count: 2 }],
      damage: 40,
      effectText:
        '自分のエールデッキから、[赤エールか青エール]1枚を公開し、自分の#Adventを持つホロメンに送る。そしてエールデッキをシャッフルする。',
    })
    expect(card.arts[1]).toMatchObject({
      name: '2人揃ってFUWAMOCOです！',
      requiredCheers: [
        { color: 'blue', count: 1 },
        { color: 'red', count: 1 },
      ],
      damage: 60,
    })
    expect(card.arts[0]?.effectText).not.toContain('魔界乃番犬シスターズ')
    expect(card.arts[0]?.effectText).not.toContain('40')
    expect(card.arts[1]?.effectText).toBeUndefined()
  })

  it('creates Critical only from the structured Critical image token', async () => {
    const card = await candidate('detail-second-houshou-marine')

    expect(card.arts[0]?.critical).toEqual({
      color: 'yellow',
      bonusDamage: 50,
    })
    expect(card.arts[1]?.requiredCheers).toEqual([
      { color: 'red', count: 2 },
      { color: 'any', count: 1 },
    ])
  })

  it('does not treat +numbers in ability text as Critical', async () => {
    const debut = await candidate('detail-debut-shirogane-noel')
    const tool = await candidate('detail-tool-stone-axe')

    expect(debut.abilities[0]?.text).toContain('アーツ+10')
    expect(debut.arts[0]?.critical).toBeUndefined()
    expect(tool.abilities[0]?.text).toContain('アーツ+20')
    expect(tool.arts).toEqual([])
  })

  it('normalizes product fields and Japanese release dates', async () => {
    const card = await candidate('detail-cheer-white')

    expect(card.products).toHaveLength(8)
    expect(card.products[0]).toEqual({
      name: 'ブースターパック「ブルーミングレディアンス」',
      category: 'Boosters',
      releaseDate: '2024-09-20',
      detailUrl:
        'https://hololive-official-cardgame.com/products/post/blooming-radiance/',
    })
  })

  it('keeps a printing-specific image URL', async () => {
    const card = await candidate('detail-oshi-kiara-multiple-qa')

    expect(card.imageUrl).toBe(
      'https://hololive-official-cardgame.com/wp-content/images/cardlist/hBP01/hBP01-006_SEC.png',
    )
  })

  it('keeps FUWAMOCO printings separate', async () => {
    const original = await candidate('detail-multicolor-fuwamoco')
    const reprint = await candidate('detail-multicolor-fuwamoco-reprint')

    expect(original).toMatchObject({
      officialId: '614',
      cardNumber: 'hBP03-050',
    })
    expect(reprint).toMatchObject({
      officialId: '2545',
      cardNumber: 'hBP03-050',
    })
    expect(original.imageUrl).not.toBe(reprint.imageUrl)
    expect(original.colors).toEqual(['blue', 'red'])
    expect(reprint.colors).toEqual(['blue'])
  })

  it('deduplicates exact tags without removing #', async () => {
    const raw = await rawDetail('detail-debut-shirogane-noel')
    const card = expectSuccess(
      normalizeCardDetail({
        ...raw,
        tagsRaw: [' #JP ', '#JP', '', '#3期生'],
      }),
    )

    expect(card.tags).toEqual(['#JP', '#3期生'])
  })

  it('does not store NaN for malformed numeric values', async () => {
    const raw = await rawDetail('detail-debut-shirogane-noel')
    const result = normalizeCardDetail({ ...raw, hpRaw: '100HP' })
    const card = expectSuccess(result)

    expect(card.hp).toBeUndefined()
    expect(result.ok && result.warnings).toContainEqual(
      expect.objectContaining({ code: 'INVALID_INTEGER' }),
    )
  })

  it('does not fall back unknown card types to holomem', async () => {
    const raw = await rawDetail('detail-debut-shirogane-noel')
    const result = normalizeCardDetail({ ...raw, cardTypeRaw: '未知カード' })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.errors).toContainEqual(
      expect.objectContaining({ code: 'UNKNOWN_CARD_TYPE' }),
    )
  })

  it('warns instead of inventing an unknown Bloom value', async () => {
    const raw = await rawDetail('detail-debut-shirogane-noel')
    const result = normalizeCardDetail({ ...raw, bloomLevelRaw: 'Buzz' })
    const card = expectSuccess(result)

    expect(card.bloomLevel).toBeUndefined()
    expect(result.ok && result.warnings).toContainEqual(
      expect.objectContaining({ code: 'UNKNOWN_BLOOM_LEVEL' }),
    )
  })

  it('fails rather than fabricating a missing card number', async () => {
    const raw = await rawDetail('detail-debut-shirogane-noel')

    expect(normalizeCardDetail({ ...raw, cardNumberRaw: 'null' }).ok).toBe(
      false,
    )
  })
})

describe('normalizeProducts', () => {
  it.each([
    ['2024年02月29日(木)', '2024-02-29'],
    ['2025年02月29日(土)', undefined],
    ['2026年13月01日(木)', undefined],
    ['not-a-date', undefined],
  ])('normalizes and validates %s', (raw, expected) => {
    expect(normalizeJapaneseReleaseDate(raw)).toBe(expected)
  })

  it('warns on invalid dates and deduplicates exact products', () => {
    const block = {
      productNameRaw: '商品',
      categoryRaw: 'Boosters',
      releaseDateRaw: '2025年02月29日(土)',
    }
    const result = normalizeProducts([block, block])

    expect(result.value).toEqual([{ name: '商品', category: 'Boosters' }])
    expect(result.warnings).toHaveLength(2)
  })
})

describe('normalizeCardListEntry', () => {
  it('normalizes a structural card entry', async () => {
    const [raw] = await rawListEntries('list-normal-multi-result')
    if (!raw) {
      throw new Error('Expected a list entry')
    }

    expect(expectSuccess(normalizeCardListEntry(raw))).toMatchObject({
      kind: 'card',
      officialId: '22',
      cardNumber: 'hBP01-001',
      name: '天音かなた',
    })
  })

  it('classifies literal-null card number as special without a name hardcode', async () => {
    const [raw] = await rawListEntries('list-special-deck-building-rules')
    if (!raw) {
      throw new Error('Expected the special list entry')
    }

    expect(expectSuccess(normalizeCardListEntry(raw))).toEqual({
      kind: 'special',
      officialId: '2697',
      name: 'デッキ構築ルール',
      detailUrl:
        'https://hololive-official-cardgame.com/cardlist/?id=2697&keyword=%E3%83%87%E3%83%83%E3%82%AD%E6%A7%8B%E7%AF%89%E3%83%AB%E3%83%BC%E3%83%AB&view=text',
      imageUrl:
        'https://hololive-official-cardgame.com/wp-content/images/cardlist/selehGS26/selehGS26_teaching.png',
    })
  })

  it('fails an entry without a name', () => {
    expect(normalizeCardListEntry({ nameRaw: ' ', textRaw: '' }).ok).toBe(false)
  })
})
