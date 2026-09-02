import type {
  Ability,
  CardColor,
  CriticalColor,
  RequiredCheer,
} from '../../../src/domain/cards/types'
import type {
  RawContentBlock,
  RawImageRef,
  RawInlineToken,
} from '../parser/types'
import type { NormalizeIssue, NormalizedArt } from './types'

const COLOR_BY_JAPANESE = {
  白: 'white',
  緑: 'green',
  赤: 'red',
  青: 'blue',
  紫: 'purple',
  黄: 'yellow',
  無: 'colorless',
} as const satisfies Record<string, CardColor>

const COST_COLOR_BY_FILENAME = {
  white: 'white',
  green: 'green',
  red: 'red',
  blue: 'blue',
  purple: 'purple',
  yellow: 'yellow',
} as const satisfies Record<string, CardColor>

const CRITICAL_COLOR_BY_FILENAME = {
  white: 'white',
  green: 'green',
  red: 'red',
  blue: 'blue',
  purple: 'purple',
  yellow: 'yellow',
} as const satisfies Record<string, CriticalColor>

const CRITICAL_COLOR_BY_JAPANESE = {
  白: 'white',
  緑: 'green',
  赤: 'red',
  青: 'blue',
  紫: 'purple',
  黄: 'yellow',
} as const satisfies Record<string, CriticalColor>

export function normalizeDisplayText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[\t ]+/g, ' ').trim())
    .join('\n')
    .trim()
}

export function normalizeOptionalText(
  value: string | undefined,
): string | undefined {
  if (value === undefined) {
    return undefined
  }

  return normalizeDisplayText(value) || undefined
}

export function normalizeStrictInteger(
  value: string | undefined,
  field: string,
  warnings: NormalizeIssue[],
): number | undefined {
  const normalized = normalizeOptionalText(value)
  if (normalized === undefined) {
    return undefined
  }

  if (!/^(?:0|[1-9]\d*)$/.test(normalized)) {
    warnings.push({
      code: 'INVALID_INTEGER',
      message: `${field} is not a non-negative integer: ${normalized}`,
    })
    return undefined
  }

  const parsed = Number(normalized)
  if (!Number.isSafeInteger(parsed)) {
    warnings.push({
      code: 'INVALID_INTEGER',
      message: `${field} is outside the safe integer range: ${normalized}`,
    })
    return undefined
  }

  return parsed
}

export function normalizeCardColors(tokens: RawInlineToken[]): {
  value: CardColor[]
  warnings: NormalizeIssue[]
} {
  const colors: CardColor[] = []
  const warnings: NormalizeIssue[] = []

  for (const token of tokens) {
    if (token.kind === 'text') {
      if (normalizeDisplayText(token.textRaw)) {
        warnings.push({
          code: 'UNEXPECTED_CARD_COLOR_TEXT',
          message: `Unexpected text in card color tokens: ${token.textRaw}`,
        })
      }
      continue
    }

    const alt = normalizeOptionalText(token.image.altRaw)
    let mapped: CardColor[] | undefined
    if (
      alt === '◇' &&
      /\/texticon\/type_null\.png(?:[?#].*)?$/.test(token.image.srcRaw)
    ) {
      mapped = ['colorless']
    } else if (alt) {
      const parts = Array.from(alt)
      if (parts.every((part) => part in COLOR_BY_JAPANESE)) {
        mapped = parts.map(
          (part) => COLOR_BY_JAPANESE[part as keyof typeof COLOR_BY_JAPANESE],
        )
      }
    }

    if (!mapped) {
      warnings.push({
        code: 'UNKNOWN_CARD_COLOR_TOKEN',
        message: `Unknown card color image: ${token.image.srcRaw}`,
      })
      continue
    }

    for (const color of mapped) {
      if (!colors.includes(color)) {
        colors.push(color)
      }
    }
  }

  return { value: colors, warnings }
}

function normalizeCostImage(image: RawImageRef): CardColor | 'any' | undefined {
  if (
    image.altRaw === '◇' &&
    /\/texticon\/arts_null\.png(?:[?#].*)?$/.test(image.srcRaw)
  ) {
    return 'any'
  }

  const match = image.srcRaw.match(
    /\/texticon\/arts_(white|green|red|blue|purple|yellow)\.png(?:[?#].*)?$/,
  )
  return match
    ? COST_COLOR_BY_FILENAME[match[1] as keyof typeof COST_COLOR_BY_FILENAME]
    : undefined
}

export function normalizeRequiredCheers(
  tokens: RawInlineToken[],
  context: string,
): { value: RequiredCheer[]; warnings: NormalizeIssue[] } {
  const requiredCheers: RequiredCheer[] = []
  const warnings: NormalizeIssue[] = []

  for (const token of tokens) {
    if (token.kind === 'text') {
      if (normalizeDisplayText(token.textRaw)) {
        warnings.push({
          code: 'UNEXPECTED_COST_TEXT',
          message: `Unexpected text in ${context} cost tokens: ${token.textRaw}`,
        })
      }
      continue
    }

    const color = normalizeCostImage(token.image)
    if (!color) {
      warnings.push({
        code: 'UNKNOWN_COST_TOKEN',
        message: `Unknown ${context} cost image: ${token.image.srcRaw}`,
      })
      continue
    }

    const existing = requiredCheers.find((cheer) => cheer.color === color)
    if (existing) {
      existing.count += 1
    } else {
      requiredCheers.push({ color, count: 1 })
    }
  }

  return { value: requiredCheers, warnings }
}

function abilityType(block: RawContentBlock): Ability['type'] {
  const imageSignal = block.tokens.find(
    (token): token is Extract<RawInlineToken, { kind: 'image' }> =>
      token.kind === 'image',
  )?.image.altRaw
  const signal = normalizeOptionalText(imageSignal) ?? block.labelRaw

  if (signal === 'ブルームエフェクト') {
    return 'bloom'
  }
  if (signal === 'コラボエフェクト') {
    return 'collab'
  }
  if (signal === 'ギフト') {
    return 'gift'
  }
  return 'normal'
}

export function normalizeAbilities(blocks: RawContentBlock[]): Ability[] {
  return blocks.flatMap((block) => {
    const text = normalizeDisplayText(block.textRaw)
    return text ? [{ type: abilityType(block), text }] : []
  })
}

function parseCriticalImage(
  image: RawImageRef,
): { color: CriticalColor; bonusDamage: number } | undefined {
  const sourceMatch = image.srcRaw.match(
    /\/texticon\/tokkou_(\d+)_(white|green|red|blue|purple|yellow)\.png(?:[?#].*)?$/,
  )
  const altMatch = image.altRaw?.match(/^(白|緑|赤|青|紫|黄)\+(\d+)$/)
  if (!sourceMatch || !altMatch) {
    return undefined
  }

  const color =
    CRITICAL_COLOR_BY_FILENAME[
      sourceMatch[2] as keyof typeof CRITICAL_COLOR_BY_FILENAME
    ]
  const sourceBonus = Number(sourceMatch[1])
  const altBonus = Number(altMatch[2])
  const altColor =
    CRITICAL_COLOR_BY_JAPANESE[
      altMatch[1] as keyof typeof CRITICAL_COLOR_BY_JAPANESE
    ]
  if (
    !Number.isSafeInteger(sourceBonus) ||
    sourceBonus !== altBonus ||
    color !== altColor
  ) {
    return undefined
  }

  return { color, bonusDamage: sourceBonus }
}

export function normalizeArts(blocks: RawContentBlock[]): {
  value: NormalizedArt[]
  warnings: NormalizeIssue[]
} {
  const arts: NormalizedArt[] = []
  const warnings: NormalizeIssue[] = []

  blocks.forEach((block, index) => {
    const headerIndex = block.tokens.findIndex((token) => token.kind === 'text')
    if (headerIndex < 0) {
      warnings.push({
        code: 'MISSING_ART_HEADER',
        message: `Art block ${index} has no text header.`,
      })
      return
    }

    const headerToken = block.tokens[headerIndex]
    if (headerToken.kind !== 'text') {
      return
    }
    const normalizedBlockText = normalizeDisplayText(block.textRaw)
    const [header = '', ...effectLines] = normalizedBlockText.split('\n')
    const effectText = normalizeOptionalText(effectLines.join('\n'))
    const headerMatch = header.match(/^(.+?)\s+(\d+)\+?$/)
    const name = normalizeDisplayText(headerMatch?.[1] ?? header)
    if (!name) {
      warnings.push({
        code: 'MISSING_ART_NAME',
        message: `Art block ${index} has no usable name.`,
      })
      return
    }

    let damage: number | undefined
    if (headerMatch) {
      const parsedDamage = Number(headerMatch[2])
      if (Number.isSafeInteger(parsedDamage)) {
        damage = parsedDamage
      }
    } else {
      warnings.push({
        code: 'UNKNOWN_ART_DAMAGE',
        message: `Art block ${index} has no structured trailing damage value.`,
      })
    }

    const cost = normalizeRequiredCheers(
      block.tokens.slice(0, headerIndex),
      `art ${index}`,
    )
    warnings.push(...cost.warnings)

    let critical: NormalizedArt['critical']
    for (const token of block.tokens.slice(headerIndex + 1)) {
      if (token.kind !== 'image') {
        continue
      }

      const parsedCritical = parseCriticalImage(token.image)
      if (!parsedCritical) {
        warnings.push({
          code: 'UNKNOWN_ART_IMAGE_TOKEN',
          message: `Unknown image after art header: ${token.image.srcRaw}`,
        })
        continue
      }
      if (critical) {
        warnings.push({
          code: 'MULTIPLE_CRITICAL_TOKENS',
          message: `Art block ${index} has more than one Critical token.`,
        })
        continue
      }
      critical = parsedCritical
    }

    arts.push({
      name,
      requiredCheers: cost.value,
      ...(damage !== undefined ? { damage } : {}),
      ...(effectText ? { effectText } : {}),
      ...(critical ? { critical } : {}),
    })
  })

  return { value: arts, warnings }
}
