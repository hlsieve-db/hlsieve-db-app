import { load, type Cheerio, type CheerioAPI } from 'cheerio'
import type { AnyNode, Element } from 'domhandler'

import {
  cleanRawText,
  parseImageRef,
  resolveHttpUrl,
  textWithBreaks,
  toInlineTokens,
} from './htmlTokens'
import type {
  ParseIssue,
  ParseResult,
  RawCardDetail,
  RawContentBlock,
  RawProductBlock,
} from './types'

function parseSourceUrl(sourceUrl: string): ParseResult<URL> {
  try {
    const url = new URL(sourceUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return {
        ok: false,
        errors: [
          {
            code: 'INVALID_SOURCE_URL_SCHEME',
            message: 'sourceUrl must use http or https.',
          },
        ],
      }
    }

    return { ok: true, value: url, warnings: [] }
  } catch {
    return {
      ok: false,
      errors: [
        {
          code: 'INVALID_SOURCE_URL',
          message: 'sourceUrl is not a valid URL.',
        },
      ],
    }
  }
}

function findInfoValue(
  $: CheerioAPI,
  label: string,
): Cheerio<Element> | undefined {
  let value: Cheerio<Element> | undefined

  $('.cardlist-Detail .info dt').each((_, element) => {
    if (cleanRawText($(element).text()) === label) {
      const candidate = $(element).next('dd')
      if (candidate.length > 0) {
        value = candidate
      }
      return false
    }
  })

  return value
}

function optionalText(value: Cheerio<AnyNode> | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const text = cleanRawText(value.text())
  return text || undefined
}

function parseContentBlock(
  $: CheerioAPI,
  container: Cheerio<Element>,
  sourceUrl: string,
): RawContentBlock | undefined {
  const paragraphs = container.children('p')
  const content = paragraphs.eq(1)

  if (content.length === 0) {
    return undefined
  }

  const textRaw = textWithBreaks(content)
  const tokens = toInlineTokens($, content, sourceUrl)
  const labelRaw = cleanRawText(paragraphs.eq(0).text()) || undefined
  const htmlRaw = content.html() ?? undefined

  return {
    ...(labelRaw ? { labelRaw } : {}),
    textRaw,
    tokens,
    ...(htmlRaw ? { htmlRaw } : {}),
  }
}

function parseInfoAbilityBlock(
  $: CheerioAPI,
  sourceUrl: string,
): RawContentBlock | undefined {
  const content = findInfoValue($, '能力テキスト')
  if (!content) {
    return undefined
  }

  const htmlRaw = content.html() ?? undefined
  return {
    labelRaw: '能力テキスト',
    textRaw: textWithBreaks(content),
    tokens: toInlineTokens($, content, sourceUrl),
    ...(htmlRaw ? { htmlRaw } : {}),
  }
}

function parseProductBlocks(
  $: CheerioAPI,
  sourceUrl: string,
): RawProductBlock[] {
  return $('.cardlist-Detail_Products .products')
    .toArray()
    .flatMap((element) => {
      const product = $(element)
      const productNameRaw = cleanRawText(
        product.find('.products-ttl p').text(),
      )
      if (!productNameRaw) {
        return []
      }

      const categoryRaw = cleanRawText(
        product.find('.products-ttl .cat').text(),
      )
      let releaseDateRaw: string | undefined
      product.find('dt').each((_, term) => {
        if (cleanRawText($(term).text()) === '発売日') {
          releaseDateRaw = cleanRawText($(term).next('dd').text()) || undefined
          return false
        }
      })

      const detailHref = product
        .find('.btn a')
        .toArray()
        .map((link) => $(link))
        .find((link) => cleanRawText(link.text()) === 'MORE')
        ?.attr('href')
      const detailUrl = resolveHttpUrl(detailHref, sourceUrl)

      return [
        {
          productNameRaw,
          ...(categoryRaw ? { categoryRaw } : {}),
          ...(releaseDateRaw ? { releaseDateRaw } : {}),
          ...(detailUrl ? { detailUrl } : {}),
        },
      ]
    })
}

export function parseCardDetailHtml(
  html: string,
  sourceUrl: string,
): ParseResult<RawCardDetail> {
  const parsedSource = parseSourceUrl(sourceUrl)
  if (!parsedSource.ok) {
    return parsedSource
  }

  const officialId = parsedSource.value.searchParams.get('id')
  if (!officialId || !/^\d+$/.test(officialId)) {
    return {
      ok: false,
      errors: [
        {
          code: 'MISSING_OR_INVALID_OFFICIAL_ID',
          message: 'sourceUrl must contain a numeric id query parameter.',
        },
      ],
    }
  }

  const $ = load(html, null, false)
  if ($('#content').length === 0) {
    return {
      ok: false,
      errors: [
        {
          code: 'MISSING_CONTENT_ROOT',
          message: 'The #content root was not found.',
        },
      ],
    }
  }
  if ($('.cardlist-Detail').length === 0) {
    return {
      ok: false,
      errors: [
        {
          code: 'MISSING_DETAIL_ROOT',
          message: 'The card detail root was not found.',
        },
      ],
    }
  }

  const nameRaw = cleanRawText($('.cardlist-Detail h1.name').first().text())
  if (!nameRaw) {
    return {
      ok: false,
      errors: [
        {
          code: 'MISSING_CARD_NAME',
          message: 'The card detail does not contain a name.',
        },
      ],
    }
  }

  const warnings: ParseIssue[] = []
  const cardNumberRaw =
    cleanRawText(
      $('.cardlist-Detail .illustrator .number span').first().text(),
    ) || undefined
  if (!cardNumberRaw) {
    warnings.push({
      code: 'MISSING_CARD_NUMBER',
      message: 'The card detail does not contain a card number.',
    })
  }

  const cardImage = parseImageRef(
    $('.cardlist-Detail_Box_Inner > .img.w100 > img').first(),
    sourceUrl,
  )
  if (!cardImage) {
    warnings.push({
      code: 'MISSING_CARD_IMAGE',
      message:
        'The card detail does not contain a card image in its image container.',
    })
  }

  const cardTypeRaw = optionalText(findInfoValue($, 'カードタイプ'))
  const rarityRaw = optionalText(findInfoValue($, 'レアリティ'))
  const hpRaw = optionalText(findInfoValue($, 'HP'))
  const lifeRaw = optionalText(findInfoValue($, 'LIFE'))
  const bloomLevelRaw = optionalText(findInfoValue($, 'Bloomレベル'))
  const tags = findInfoValue($, 'タグ')
  const tagsRaw = tags
    ? tags
        .find('a')
        .toArray()
        .map((tag) => cleanRawText($(tag).text()))
        .filter(Boolean)
    : []
  const products = findInfoValue($, '収録商品')
  const productNamesRaw = products
    ? textWithBreaks(products).split('\n').filter(Boolean)
    : []
  const color = findInfoValue($, '色')
  const batonPass = findInfoValue($, 'バトンタッチ')

  const abilityBlocks: RawContentBlock[] = []
  const infoAbility = parseInfoAbilityBlock($, sourceUrl)
  if (infoAbility) {
    abilityBlocks.push(infoAbility)
  }

  const detailContent = $('.cardlist-Detail .txt-Inner').first()
  detailContent.children('div').each((_, element) => {
    const container = $(element)
    if (
      container.hasClass('info') ||
      container.hasClass('arts') ||
      container.hasClass('extra') ||
      container.hasClass('illustrator')
    ) {
      return
    }

    const block = parseContentBlock($, container, sourceUrl)
    if (block) {
      abilityBlocks.push(block)
    }
  })

  const artBlocks = detailContent
    .children('.arts')
    .toArray()
    .flatMap((element) => {
      const block = parseContentBlock($, $(element), sourceUrl)
      return block ? [block] : []
    })
  const extraRaw = optionalText(
    detailContent.children('.extra').find('p').eq(1),
  )
  const illustratorRaw =
    cleanRawText(
      $('.cardlist-Detail .illustrator .ill-name span').first().text(),
    ) || undefined
  const faq = $('#faq').first()
  const qaSectionHtmlRaw = faq.length > 0 ? $.html(faq) : undefined

  return {
    ok: true,
    warnings,
    value: {
      sourceUrl,
      officialId,
      nameRaw,
      ...(cardNumberRaw ? { cardNumberRaw } : {}),
      ...(cardImage ? { cardImage } : {}),
      ...(cardTypeRaw ? { cardTypeRaw } : {}),
      tagsRaw,
      ...(rarityRaw ? { rarityRaw } : {}),
      productNamesRaw,
      colorTokens: color ? toInlineTokens($, color, sourceUrl) : [],
      ...(hpRaw ? { hpRaw } : {}),
      ...(lifeRaw ? { lifeRaw } : {}),
      ...(bloomLevelRaw ? { bloomLevelRaw } : {}),
      batonPassTokens: batonPass ? toInlineTokens($, batonPass, sourceUrl) : [],
      abilityBlocks,
      artBlocks,
      ...(extraRaw ? { extraRaw } : {}),
      ...(illustratorRaw ? { illustratorRaw } : {}),
      productBlocks: parseProductBlocks($, sourceUrl),
      ...(qaSectionHtmlRaw ? { qaSectionHtmlRaw } : {}),
    },
  }
}
