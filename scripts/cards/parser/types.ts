export type RawImageRef = {
  srcRaw: string
  resolvedUrl?: string
  altRaw?: string
  titleRaw?: string
  classNames: string[]
  dataAttributes: Record<string, string>
}

export type RawInlineToken =
  | {
      kind: 'text'
      textRaw: string
    }
  | {
      kind: 'image'
      image: RawImageRef
    }

export type RawContentBlock = {
  labelRaw?: string
  textRaw: string
  tokens: RawInlineToken[]
  htmlRaw?: string
}

export type RawProductBlock = {
  productNameRaw: string
  categoryRaw?: string
  releaseDateRaw?: string
  detailUrl?: string
}

export type RawCardDetail = {
  sourceUrl: string
  officialId: string
  nameRaw: string
  cardNumberRaw?: string
  cardImage?: RawImageRef
  cardTypeRaw?: string
  tagsRaw: string[]
  rarityRaw?: string
  productNamesRaw: string[]
  colorTokens: RawInlineToken[]
  hpRaw?: string
  lifeRaw?: string
  bloomLevelRaw?: string
  batonPassTokens: RawInlineToken[]
  abilityBlocks: RawContentBlock[]
  artBlocks: RawContentBlock[]
  extraRaw?: string
  illustratorRaw?: string
  productBlocks: RawProductBlock[]
  qaSectionHtmlRaw?: string
}

export type RawCardListEntry = {
  nameRaw: string
  detailUrl?: string
  officialId?: string
  cardNumberRaw?: string
  image?: RawImageRef
  textRaw: string
}

export type RawCardList = {
  sourceUrl: string
  entries: RawCardListEntry[]
}

export type ParseIssue = {
  code: string
  message: string
}

export type ParseResult<T> =
  | {
      ok: true
      value: T
      warnings: ParseIssue[]
    }
  | {
      ok: false
      errors: ParseIssue[]
    }
