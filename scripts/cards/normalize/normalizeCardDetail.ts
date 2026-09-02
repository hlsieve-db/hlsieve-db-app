import type { Card } from '../../../src/domain/cards/types'
import type { RawCardDetail } from '../parser/types'
import { normalizeQaEntries } from '../qa/normalizeQa'
import { parseQaSectionHtml } from '../qa/parseQaSection'
import { normalizeProducts } from './normalizeProducts'
import type {
  NormalizeIssue,
  NormalizeResult,
  NormalizedCardCandidate,
} from './types'
import {
  normalizeAbilities,
  normalizeArts,
  normalizeCardColors,
  normalizeDisplayText,
  normalizeOptionalText,
  normalizeRequiredCheers,
  normalizeStrictInteger,
} from './normalizeValues'

type CardTypeInfo = {
  cardType: Card['cardType']
  isBuzz: boolean
  supportType?: Card['supportType']
  isLimited: boolean
  supportSearchCategory?: Card['supportSearchCategory']
}

const SUPPORT_TYPE_BY_RAW = {
  スタッフ: 'staff',
  アイテム: 'item',
  イベント: 'event',
  ツール: 'tool',
  マスコット: 'mascot',
  ファン: 'fan',
} as const satisfies Record<string, NonNullable<Card['supportType']>>

function normalizeCardType(
  value: string | undefined,
): NormalizeResult<CardTypeInfo> {
  const cardTypeRaw = normalizeOptionalText(value)
  if (!cardTypeRaw) {
    return {
      ok: false,
      errors: [
        {
          code: 'MISSING_CARD_TYPE',
          message: 'cardTypeRaw is required.',
        },
      ],
    }
  }

  if (cardTypeRaw === '推しホロメン') {
    return {
      ok: true,
      warnings: [],
      value: {
        cardType: 'oshi',
        isBuzz: false,
        isLimited: false,
      },
    }
  }
  if (cardTypeRaw === 'ホロメン') {
    return {
      ok: true,
      warnings: [],
      value: {
        cardType: 'holomem',
        isBuzz: false,
        isLimited: false,
      },
    }
  }
  if (cardTypeRaw === 'Buzzホロメン') {
    return {
      ok: true,
      warnings: [],
      value: {
        cardType: 'holomem',
        isBuzz: true,
        isLimited: false,
      },
    }
  }
  if (cardTypeRaw === 'エール') {
    return {
      ok: true,
      warnings: [],
      value: {
        cardType: 'cheer',
        isBuzz: false,
        isLimited: false,
      },
    }
  }

  const segments = cardTypeRaw.split('・').map((segment) => segment.trim())
  if (segments[0] !== 'サポート') {
    return {
      ok: false,
      errors: [
        {
          code: 'UNKNOWN_CARD_TYPE',
          message: `Unknown cardTypeRaw: ${cardTypeRaw}`,
        },
      ],
    }
  }

  const warnings: NormalizeIssue[] = []
  const isLimited = segments.slice(1).includes('LIMITED')
  const subtypeSegments = segments
    .slice(1)
    .filter((segment) => segment !== 'LIMITED' && segment.length > 0)
  const knownSubtypes = subtypeSegments.flatMap((segment) => {
    const supportType =
      SUPPORT_TYPE_BY_RAW[segment as keyof typeof SUPPORT_TYPE_BY_RAW]
    if (!supportType) {
      warnings.push({
        code: 'UNKNOWN_SUPPORT_TYPE',
        message: `Unknown support subtype: ${segment}`,
      })
      return []
    }
    return [supportType]
  })
  if (knownSubtypes.length > 1) {
    warnings.push({
      code: 'MULTIPLE_SUPPORT_TYPES',
      message: `Multiple support subtypes are present: ${subtypeSegments.join('・')}`,
    })
  }

  const supportType = knownSubtypes[0]
  const supportSearchCategory: Card['supportSearchCategory'] = isLimited
    ? 'limited'
    : supportType === 'tool'
      ? 'tool'
      : supportType === 'fan'
        ? 'fan'
        : 'general'

  return {
    ok: true,
    warnings,
    value: {
      cardType: 'support',
      isBuzz: false,
      ...(supportType ? { supportType } : {}),
      isLimited,
      supportSearchCategory,
    },
  }
}

function normalizeBloomLevel(
  value: string | undefined,
  cardType: Card['cardType'],
  warnings: NormalizeIssue[],
): Card['bloomLevel'] {
  const raw = normalizeOptionalText(value)
  if (!raw) {
    return undefined
  }

  const bloomLevel = {
    Debut: 'debut',
    '1st': 'first',
    '2nd': 'second',
    Spot: 'spot',
  }[raw] as Card['bloomLevel']

  if (!bloomLevel) {
    warnings.push({
      code: 'UNKNOWN_BLOOM_LEVEL',
      message: `Unknown bloomLevelRaw: ${raw}`,
    })
    return undefined
  }

  if (cardType !== 'holomem') {
    warnings.push({
      code: 'UNEXPECTED_BLOOM_LEVEL',
      message: `A ${cardType} card contains bloomLevelRaw: ${raw}`,
    })
  }

  return bloomLevel
}

function normalizeHttpUrl(value: string | undefined): string | undefined {
  const normalized = normalizeOptionalText(value)
  if (!normalized) {
    return undefined
  }

  try {
    const url = new URL(normalized)
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? normalized
      : undefined
  } catch {
    return undefined
  }
}

export function normalizeCardDetail(
  raw: RawCardDetail,
): NormalizeResult<NormalizedCardCandidate> {
  const cardNumber = normalizeOptionalText(raw.cardNumberRaw)
  if (!cardNumber || cardNumber === 'null') {
    return {
      ok: false,
      errors: [
        {
          code: 'MISSING_CARD_NUMBER',
          message: 'A normal card candidate requires a card number.',
        },
      ],
    }
  }

  const officialId = normalizeDisplayText(raw.officialId)
  const name = normalizeDisplayText(raw.nameRaw)
  const officialUrl = normalizeHttpUrl(raw.sourceUrl)
  const requiredErrors: NormalizeIssue[] = []
  if (!/^\d+$/.test(officialId)) {
    requiredErrors.push({
      code: 'INVALID_OFFICIAL_ID',
      message: `officialId must be numeric: ${raw.officialId}`,
    })
  }
  if (!name) {
    requiredErrors.push({
      code: 'MISSING_CARD_NAME',
      message: 'A normal card candidate requires a name.',
    })
  }
  if (!officialUrl) {
    requiredErrors.push({
      code: 'INVALID_OFFICIAL_URL',
      message: `sourceUrl must be an http(s) URL: ${raw.sourceUrl}`,
    })
  }
  if (requiredErrors.length > 0 || !officialUrl) {
    return { ok: false, errors: requiredErrors }
  }

  const cardTypeResult = normalizeCardType(raw.cardTypeRaw)
  if (!cardTypeResult.ok) {
    return cardTypeResult
  }
  const typeInfo = cardTypeResult.value
  const warnings = [...cardTypeResult.warnings]

  const colors = normalizeCardColors(raw.colorTokens)
  warnings.push(...colors.warnings)
  const batonPass = normalizeRequiredCheers(raw.batonPassTokens, 'baton pass')
  warnings.push(...batonPass.warnings)

  const hp = normalizeStrictInteger(raw.hpRaw, 'HP', warnings)
  const life = normalizeStrictInteger(raw.lifeRaw, 'LIFE', warnings)
  if (life !== undefined && typeInfo.cardType !== 'oshi') {
    warnings.push({
      code: 'UNEXPECTED_LIFE',
      message: `A ${typeInfo.cardType} card contains LIFE.`,
    })
  }
  if (hp !== undefined && typeInfo.cardType !== 'holomem') {
    warnings.push({
      code: 'UNEXPECTED_HP',
      message: `A ${typeInfo.cardType} card contains HP.`,
    })
  }

  const bloomLevel = normalizeBloomLevel(
    raw.bloomLevelRaw,
    typeInfo.cardType,
    warnings,
  )
  const extraText = normalizeOptionalText(raw.extraRaw)
  const debutType =
    typeInfo.cardType === 'holomem' && bloomLevel === 'debut'
      ? extraText
        ? 'extra'
        : 'normal'
      : undefined
  const deckLimit = extraText?.includes(
    'このホロメンはデッキに何枚でも入れられる',
  )
    ? null
    : undefined

  const arts = normalizeArts(raw.artBlocks)
  warnings.push(...arts.warnings)
  const products = normalizeProducts(raw.productBlocks)
  warnings.push(...products.warnings)
  const parsedQas = parseQaSectionHtml(raw.qaSectionHtmlRaw)
  const normalizedQas = normalizeQaEntries(parsedQas.entries)
  warnings.push(...parsedQas.warnings, ...normalizedQas.warnings)

  let imageUrl: string | undefined
  if (raw.cardImage) {
    imageUrl = normalizeHttpUrl(raw.cardImage.resolvedUrl)
    if (!imageUrl) {
      warnings.push({
        code: 'UNRESOLVED_CARD_IMAGE',
        message: 'cardImage exists but has no valid http(s) resolvedUrl.',
      })
    }
  } else {
    warnings.push({
      code: 'MISSING_CARD_IMAGE',
      message: 'The Raw card detail has no cardImage.',
    })
  }

  const tags: string[] = []
  for (const rawTag of raw.tagsRaw) {
    const tag = normalizeDisplayText(rawTag)
    if (tag && !tags.includes(tag)) {
      tags.push(tag)
    }
  }

  const rarity = normalizeOptionalText(raw.rarityRaw)
  const illustrator = normalizeOptionalText(raw.illustratorRaw)

  return {
    ok: true,
    warnings,
    value: {
      officialId,
      officialUrl,
      cardNumber,
      name,
      ...(imageUrl ? { imageUrl } : {}),
      cardType: typeInfo.cardType,
      isBuzz: typeInfo.isBuzz,
      colors: colors.value,
      ...(bloomLevel ? { bloomLevel } : {}),
      ...(debutType ? { debutType } : {}),
      ...(hp !== undefined ? { hp } : {}),
      ...(life !== undefined ? { life } : {}),
      tags,
      ...(typeInfo.supportType ? { supportType: typeInfo.supportType } : {}),
      isLimited: typeInfo.isLimited,
      ...(typeInfo.supportSearchCategory
        ? { supportSearchCategory: typeInfo.supportSearchCategory }
        : {}),
      batonPass: batonPass.value,
      abilities: normalizeAbilities(raw.abilityBlocks),
      arts: arts.value,
      ...(extraText ? { extraText } : {}),
      ...(deckLimit !== undefined ? { deckLimit } : {}),
      ...(rarity ? { rarity } : {}),
      products: products.value,
      ...(illustrator ? { illustrator } : {}),
      qas: normalizedQas.value,
    },
  }
}
