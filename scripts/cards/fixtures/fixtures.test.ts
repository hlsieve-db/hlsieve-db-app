import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { fixtureManifest } from './manifest'

const fixtureRoot = resolve(process.cwd(), 'scripts/cards/fixtures')

describe('official card HTML fixture integrity', () => {
  it('has unique manifest ids', () => {
    const ids = fixtureManifest.map(({ id }) => id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(fixtureManifest)(
    '$id points to a safe, non-empty official fixture',
    async (entry) => {
      const fixturePath = resolve(fixtureRoot, entry.file)
      const relativePath = relative(fixtureRoot, fixturePath)
      const sourceUrl = new URL(entry.sourceUrl)

      expect(isAbsolute(relativePath)).toBe(false)
      expect(relativePath).not.toMatch(/^\.\.(?:[\\/]|$)/)
      expect(sourceUrl.protocol).toBe('https:')
      expect(sourceUrl.hostname).toBe('hololive-official-cardgame.com')

      const fixtureStat = await stat(fixturePath)
      const html = await readFile(fixturePath, 'utf8')

      expect(fixtureStat.isFile()).toBe(true)
      expect(fixtureStat.size).toBeGreaterThan(0)
      expect(html.trim().length).toBeGreaterThan(0)
      expect(html).toContain('id="content"')

      for (const signal of entry.expectedSignals ?? []) {
        expect(html).toContain(signal)
      }
    },
  )
})
