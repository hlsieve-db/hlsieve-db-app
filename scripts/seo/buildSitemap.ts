import { SITE_ORIGIN } from '../../src/domain/site/constants'

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export function buildSitemap(cardNumbers: readonly string[]): string {
  const paths = [
    '/cards',
    ...[...new Set(cardNumbers)]
      .sort((left, right) => left.localeCompare(right, 'en'))
      .map((cardNumber) => `/cards/${encodeURIComponent(cardNumber)}`),
  ]
  const urls = paths
    .map(
      (path) =>
        `  <url><loc>${escapeXml(new URL(path, SITE_ORIGIN).toString())}</loc></url>`,
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}
