import { describe, expect, it } from 'vitest'

import type { Card } from '../cards/types'
import { SITE_ORIGIN } from './constants'
import { buildCardDetailMetadata, resolvePageMetadata } from './metadata'

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    cardNumber: 'TEST-001',
    name: 'テストカード',
    cardType: 'holomem',
    colors: ['white'],
    isBuzz: false,
    tags: [],
    abilities: [],
    arts: [],
    batonPass: [],
    effectTags: [],
    criticalColors: [],
    rarities: [],
    products: [],
    illustrators: [],
    qas: [],
    searchText: '',
    ...overrides,
  }
}

describe('site metadata', () => {
  it('resolves default social metadata from the shared site contract', () => {
    const metadata = resolvePageMetadata({
      title: 'HLSieve DB',
      canonicalPath: '/cards',
    })

    expect(metadata.canonicalUrl).toBe(`${SITE_ORIGIN}/cards`)
    expect(metadata.socialUrl).toBe(`${SITE_ORIGIN}/cards`)
    expect(metadata.description).toContain('非公式')
    expect(metadata.robots).toBe('index,follow')
    expect(metadata.imageUrl).toBe(`${SITE_ORIGIN}/og-image.png`)
  })

  it('builds Card Detail metadata with the logical representative image once', () => {
    const imageUrl =
      'https://hololive-official-cardgame.com/wp-content/images/cardlist/hEB01/hBP03-050_R_02.png'
    const metadata = buildCardDetailMetadata(
      makeCard({
        cardNumber: 'hBP03-050',
        name: 'FUWAMOCO',
        imageUrl,
      }),
    )
    const resolved = resolvePageMetadata(metadata)

    expect(metadata.title).toBe('FUWAMOCO (hBP03-050) | HLSieve DB')
    expect(metadata.description).toContain('FUWAMOCO（hBP03-050）')
    expect(metadata.description).toContain('ホロメンカード情報')
    expect(metadata.canonicalPath).toBe('/cards/hBP03-050')
    expect(resolved.imageUrl).toBe(imageUrl)
  })

  it.each([undefined, '', '   '])(
    'falls back to the site OGP image when Card imageUrl is %j',
    (imageUrl) => {
      const resolved = resolvePageMetadata(
        buildCardDetailMetadata(makeCard({ imageUrl })),
      )

      expect(resolved.imageUrl).toBe(`${SITE_ORIGIN}/og-image.png`)
    },
  )

  it('preserves special characters for the HTML layer to escape', () => {
    const metadata = buildCardDetailMetadata(
      makeCard({ name: `A&B <C> "D" 'E'` }),
    )

    expect(metadata.title).toBe(`A&B <C> "D" 'E' (TEST-001) | HLSieve DB`)
    expect(metadata.description).toContain(`A&B <C> "D" 'E'`)
  })
})
