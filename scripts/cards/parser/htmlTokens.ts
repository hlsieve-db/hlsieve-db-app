import type { Cheerio, CheerioAPI } from 'cheerio'
import type { AnyNode, Element } from 'domhandler'

import type { RawImageRef, RawInlineToken } from './types'

export function cleanRawText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .trim()
}

export function textWithBreaks(element: Cheerio<AnyNode>): string {
  const clone = element.clone()
  clone.find('br').replaceWith('\n')

  return cleanRawText(clone.text())
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
}

export function resolveHttpUrl(
  value: string | undefined,
  sourceUrl: string,
): string | undefined {
  if (!value) {
    return undefined
  }

  try {
    const resolved = new URL(value, sourceUrl)

    return resolved.protocol === 'http:' || resolved.protocol === 'https:'
      ? resolved.href
      : undefined
  } catch {
    return undefined
  }
}

export function parseImageRef(
  image: Cheerio<Element>,
  sourceUrl: string,
): RawImageRef | undefined {
  const srcRaw = image.attr('src')?.trim()

  if (!srcRaw) {
    return undefined
  }

  const attributes = image.attr() ?? {}
  const dataAttributes = Object.fromEntries(
    Object.entries(attributes).filter(([name]) => name.startsWith('data-')),
  )
  const classNames = (image.attr('class') ?? '').split(/\s+/).filter(Boolean)
  const altRaw = image.attr('alt')
  const titleRaw = image.attr('title')
  const resolvedUrl = resolveHttpUrl(srcRaw, sourceUrl)

  return {
    srcRaw,
    ...(resolvedUrl ? { resolvedUrl } : {}),
    ...(altRaw !== undefined ? { altRaw } : {}),
    ...(titleRaw !== undefined ? { titleRaw } : {}),
    classNames,
    dataAttributes,
  }
}

export function toInlineTokens(
  $: CheerioAPI,
  element: Cheerio<AnyNode>,
  sourceUrl: string,
): RawInlineToken[] {
  const tokens: RawInlineToken[] = []

  const addText = (value: string) => {
    const textRaw = value.replace(/\r\n?/g, '\n').replace(/[\t ]+/g, ' ')

    if (!textRaw.trim()) {
      return
    }

    const previous = tokens.at(-1)
    if (previous?.kind === 'text') {
      previous.textRaw += textRaw
      return
    }

    tokens.push({ kind: 'text', textRaw })
  }

  const visit = (node: AnyNode) => {
    if (node.type === 'text') {
      addText(node.data)
      return
    }

    if (node.type !== 'tag') {
      return
    }

    if (node.name === 'img') {
      const image = parseImageRef($(node), sourceUrl)
      if (image) {
        tokens.push({ kind: 'image', image })
      }
      return
    }

    if (node.name === 'br') {
      addText('\n')
      return
    }

    for (const child of node.children) {
      visit(child)
    }
  }

  element.contents().each((_, node) => visit(node))

  const first = tokens[0]
  if (first?.kind === 'text') {
    first.textRaw = first.textRaw.trimStart()
  }
  const last = tokens.at(-1)
  if (last?.kind === 'text') {
    last.textRaw = last.textRaw.trimEnd()
  }

  return tokens.filter(
    (token) => token.kind === 'image' || token.textRaw.length > 0,
  )
}
