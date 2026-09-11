// @vitest-environment node

import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

describe('responsive content and navigation layout', () => {
  it('stacks mobile branding and navigation controls without fixed overflow', async () => {
    const css = await readFile('src/styles/global.css', 'utf8')
    const mobile = css.slice(css.indexOf('@media (max-width: 420px)'))

    expect(mobile).toMatch(/\.site-branding\s*{[^}]*flex-direction: column/s)
    expect(mobile).toMatch(
      /\.app-navigation__controls\s*{[^}]*flex-direction: column[^}]*width: 100%/s,
    )
    expect(mobile).toMatch(/\.app-navigation nav\s*{[^}]*flex-wrap: wrap/s)
    expect(mobile).not.toMatch(/min-width:\s*[4-9]\d{2}px/)
  })

  it('uses theme-aware surfaces and wrapping for policy content', async () => {
    const css = await readFile('src/styles/global.css', 'utf8')

    expect(css).toMatch(
      /\.content-surface\s*{[^}]*background: var\(--color-surface\)/s,
    )
    expect(css).toMatch(/\.legal-content\s*{[^}]*overflow-wrap: anywhere/s)
  })
})
