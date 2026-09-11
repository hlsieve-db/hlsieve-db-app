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

  it('builds the Card Detail title, description, and canonical path once', () => {
    const metadata = buildCardDetailMetadata(
      makeCard({ cardNumber: 'hBP03-050', name: 'FUWAMOCO' }),
    )

    expect(metadata.title).toBe('FUWAMOCO (hBP03-050) | HLSieve DB')
    expect(metadata.description).toContain('FUWAMOCO（hBP03-050）')
    expect(metadata.description).toContain('ホロメンカード情報')
    expect(metadata.canonicalPath).toBe('/cards/hBP03-050')
  })

  it('preserves special characters for the HTML layer to escape', () => {
    const metadata = buildCardDetailMetadata(
      makeCard({ name: `A&B <C> "D" 'E'` }),
    )

    expect(metadata.title).toBe(`A&B <C> "D" 'E' (TEST-001) | HLSieve DB`)
    expect(metadata.description).toContain(`A&B <C> "D" 'E'`)
  })
})
