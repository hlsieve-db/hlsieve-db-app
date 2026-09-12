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

  it('keeps the probability calculator mobile-first without fixed overflow', async () => {
    const css = await readFile('src/styles/global.css', 'utf8')

    expect(css).toMatch(
      /\.probability-calculator__inputs\s*{[^}]*grid-template-columns: minmax\(0, 1fr\)/s,
    )
    expect(css).toMatch(
      /\.probability-calculator__inputs input\s*{[^}]*width: 100%[^}]*min-width: 0/s,
    )
    expect(css).toMatch(
      /\.probability-calculator__errors\s*{[^}]*overflow-wrap: anywhere/s,
    )
    expect(css).toMatch(/body\s*{[^}]*min-width: 0/s)
  })

  it('keeps the Swiss calculator and result table within narrow viewports', async () => {
    const css = await readFile('src/styles/global.css', 'utf8')

    expect(css).toMatch(
      /\.swiss-calculator__inputs\s*{[^}]*grid-template-columns: minmax\(0, 1fr\)/s,
    )
    expect(css).toMatch(
      /\.swiss-calculator__inputs input\s*{[^}]*width: 100%[^}]*min-width: 0/s,
    )
    expect(css).toMatch(
      /\.swiss-calculator__table-wrap\s*{[^}]*min-width: 0[^}]*overflow-x: hidden/s,
    )
    expect(css).toMatch(
      /\.swiss-calculator table\s*{[^}]*width: 100%[^}]*table-layout: fixed/s,
    )
    expect(css).toMatch(
      /\.swiss-calculator__note\s*{[^}]*overflow-wrap: anywhere/s,
    )
  })

  it('stacks the tournament report builder and round controls on mobile', async () => {
    const css = await readFile('src/styles/global.css', 'utf8')

    expect(css).toMatch(
      /\.tournament-report-layout\s*{[^}]*grid-template-columns: minmax\(0, 1fr\)/s,
    )
    expect(css).toMatch(
      /\.report-basic-fields\s*{[^}]*grid-template-columns: minmax\(0, 1fr\)/s,
    )
    expect(css).toMatch(/\.tournament-round\s*{[^}]*min-width: 0/s)
    expect(css).toMatch(
      /\.tournament-round__choice\s*{[^}]*flex-wrap: wrap[^}]*min-width: 0/s,
    )
    expect(css).toMatch(
      /\.report-preview\s*{[^}]*min-width: 0[^}]*overflow: hidden/s,
    )
    expect(css).toMatch(
      /@media \(min-width: 1000px\)[\s\S]*\.tournament-report-layout\s*{[^}]*grid-template-columns:/s,
    )
  })
})
