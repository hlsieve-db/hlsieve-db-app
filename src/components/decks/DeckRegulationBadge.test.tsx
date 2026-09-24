import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DeckRegulationBadge } from './DeckRegulationBadge'

const SELECTION = 'selection-cup-2026-autumn'
describe('showing which format a deck is built for', () => {
  it('calls a deck that names no format ordinary construction', () => {
    render(<DeckRegulationBadge />)

    expect(screen.getByText('通常構築')).toBeVisible()
  })

  // The two spellings of ordinary construction read the same to a reporter.
  it('says the same for a deck that spells it out', () => {
    render(<DeckRegulationBadge regulationId="standard" />)

    expect(screen.getByText('通常構築')).toBeVisible()
  })

  it('names the tournament a deck is built for', () => {
    render(<DeckRegulationBadge regulationId={SELECTION} />)

    expect(screen.getByText(/セレクションカップ 2026年9-10月/)).toBeVisible()
    expect(screen.queryByText('通常構築')).toBeNull()
  })

  // A format the editor no longer offers, because it has ended, is still the
  // format this deck was built for, so it is named rather than corrected.
  it('names a format whatever its dates say', () => {
    render(<DeckRegulationBadge regulationId={SELECTION} />)

    expect(screen.getByText(/セレクションカップ 2026年9-10月/)).toBeVisible()
  })

  // Showing the fallback as a plain "ordinary construction" badge would tell
  // the reporter their tournament deck is an ordinary one.
  it('says so when it does not recognise the format', () => {
    render(<DeckRegulationBadge regulationId="future-or-removed-rule" />)

    expect(screen.getByText('不明なレギュレーション')).toBeVisible()
    expect(screen.queryByText('通常構築')).toBeNull()
  })

  // Not shown to the reporter, but worth having when something is wrong.
  it('keeps the unrecognised id where support can find it', () => {
    render(<DeckRegulationBadge regulationId="future-or-removed-rule" />)

    expect(screen.getByText('不明なレギュレーション')).toHaveAttribute(
      'title',
      'future-or-removed-rule',
    )
  })

  it('never shows the internal id as the name', () => {
    render(<DeckRegulationBadge regulationId={SELECTION} />)

    expect(screen.queryByText(SELECTION)).toBeNull()
  })
})
