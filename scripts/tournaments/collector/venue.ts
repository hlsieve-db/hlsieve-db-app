import { createHash } from 'node:crypto'

function normalizeVenuePart(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function createVenueSlug(name: string, prefecture?: string): string {
  const normalizedName = normalizeVenuePart(name)
  const normalizedPrefecture = normalizeVenuePart(prefecture ?? '')
  if (!normalizedName) throw new Error('Venue name must not be empty.')
  const hash = createHash('sha256')
    .update(`${normalizedPrefecture}\n${normalizedName}`, 'utf8')
    .digest('hex')
    .slice(0, 16)
  return `venue-${hash}`
}

export function extractPrefecture(address: string): string | undefined {
  return address
    .normalize('NFKC')
    .match(/^(北海道|東京都|(?:京都|大阪)府|.{2,3}県)/)?.[1]
}
