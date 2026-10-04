import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { TournamentWeeklyTrendResult } from '../../domain/tournaments/weeklyTrend'
import { TournamentWeeklyTrendChart } from './TournamentWeeklyTrendChart'

function trend(candidates = ['CARD-A', 'CARD-B']): TournamentWeeklyTrendResult {
  const shares = [0.2, 0.25, null, 0.3]
  return {
    environment: { tournamentType: 'selectioncup', environment: 'bp09' },
    candidates,
    points: ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'].map(
      (weekStart, index) => ({
        weekStart,
        weekEnd: ['2026-09-13', '2026-09-20', '2026-09-27', '2026-10-04'][
          index
        ]!,
        isPartial: index === 0,
        partialReasons: index === 0 ? ['data-start'] : [],
        summary: {
          totalEvents: index + 1,
          eligibleWinnerEvents: shares[index] === null ? 0 : 4,
          eligiblePlacementEvents: 4,
          winnerResultCount: shares[index] === null ? 0 : 4,
          placementResultCount: 8,
        },
        entries: candidates.map((oshiCardNumber, candidateIndex) => ({
          oshiCardNumber,
          winner: {
            count: shares[index] === null ? 0 : candidateIndex === 0 ? 1 : 0,
            totalResults: shares[index] === null ? 0 : 4,
            share: candidateIndex === 0 ? shares[index] : 0,
          },
          placement: {
            count: 0,
            totalResults: 8,
            share: 0,
          },
        })),
      }),
    ),
  }
}

const master = {
  format: 'hlsieve-tournament-oshi-master' as const,
  formatVersion: 1 as const,
  cardsDataVersion: 'test',
  cards: { 'CARD-A': { name: 'Known Oshi' } },
}

describe('TournamentWeeklyTrendChart', () => {
  it('uses the first stable candidate and renders accessible series plus complete text values', () => {
    const { container } = render(
      <TournamentWeeklyTrendChart
        trend={trend()}
        oshiMaster={master}
        environmentLabel="セレクションカップ／9弾"
      />,
    )
    expect(screen.getByRole('heading', { name: '週次推移' })).toBeVisible()
    expect(screen.getByRole('combobox', { name: '推しカード' })).toHaveValue(
      'CARD-A',
    )
    expect(
      screen.getByRole('option', { name: 'Known Oshi（CARD-A）' }),
    ).toBeVisible()
    expect(
      screen.getByRole('option', { name: '名称不明（CARD-B）' }),
    ).toBeVisible()
    expect(screen.getByText('優勝構成比')).toBeVisible()
    expect(screen.getByText('入賞構成比')).toBeVisible()
    expect(
      container.querySelector('.tournament-weekly-trend__key--winner')
        ?.parentElement,
    ).toHaveTextContent('優勝構成比')
    expect(
      container.querySelector('.tournament-weekly-trend__key--placement')
        ?.parentElement,
    ).toHaveTextContent('入賞構成比')
    expect(
      screen.getByRole('img', { name: /Known Oshi（CARD-A）の週次推移/ }),
    ).toBeVisible()
    expect(
      container.querySelectorAll('[data-series="winner"] path'),
    ).toHaveLength(1)
    expect(
      container.querySelector('[data-series="winner"] path'),
    ).not.toHaveAttribute('d', expect.stringContaining('620'))
    expect(
      container.querySelectorAll('[data-series="winner"] circle'),
    ).toHaveLength(3)
    expect(
      container.querySelectorAll(
        '[data-series="placement"] circle[data-share="0"]',
      ),
    ).toHaveLength(4)
    expect(screen.getByText('9/7〜9/13')).toBeVisible()
    expect(screen.getByText(/一部期間/)).toHaveTextContent('収録開始を含む')
    expect(screen.getByText('収録対象大会 1件')).toBeVisible()
    expect(screen.getByText('9/7〜9/13').closest('li')).toHaveTextContent(
      '優勝 1件 / 4件 · 20.0%',
    )
    expect(screen.getByText('9/21〜9/27').closest('li')).toHaveTextContent(
      '優勝 0件 / 0件 · データなし',
    )
    expect(screen.getByText('9/7〜9/13').closest('li')).toHaveTextContent(
      '入賞 0件 / 8件 · 0.0%',
    )
    expect(
      container.querySelector('.tournament-weekly-trend__chart'),
    ).not.toHaveAttribute('width')
    expect(container.querySelector('svg')).not.toHaveAttribute('width')
  })

  it('retains a valid selection and resets a stale selection to the new first candidate', () => {
    const { rerender } = render(
      <TournamentWeeklyTrendChart
        trend={trend()}
        oshiMaster={master}
        environmentLabel="env"
      />,
    )
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'CARD-B' },
    })
    expect(screen.getByRole('combobox')).toHaveValue('CARD-B')
    rerender(
      <TournamentWeeklyTrendChart
        trend={trend(['CARD-B', 'CARD-C'])}
        oshiMaster={master}
        environmentLabel="env"
      />,
    )
    expect(screen.getByRole('combobox')).toHaveValue('CARD-B')
    rerender(
      <TournamentWeeklyTrendChart
        trend={trend(['CARD-C'])}
        oshiMaster={master}
        environmentLabel="env"
      />,
    )
    expect(screen.getByRole('combobox')).toHaveValue('CARD-C')
    rerender(
      <TournamentWeeklyTrendChart
        trend={trend(['CARD-B', 'CARD-C'])}
        oshiMaster={master}
        environmentLabel="env"
      />,
    )
    expect(screen.getByRole('combobox')).toHaveValue('CARD-C')
  })

  it('keeps the text alternative and omits chart paths when both series are all null', () => {
    const value = trend(['CARD-A'])
    value.points = value.points.map((point) => ({
      ...point,
      entries: [
        {
          oshiCardNumber: 'CARD-A',
          winner: { count: 0, totalResults: 0, share: null },
          placement: { count: 0, totalResults: 0, share: null },
        },
      ],
    }))
    const { container } = render(
      <TournamentWeeklyTrendChart trend={value} environmentLabel="env" />,
    )
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(
      container.querySelectorAll('.tournament-weekly-trend__weeks li'),
    ).toHaveLength(4)
    expect(
      [
        ...container.querySelectorAll(
          '.tournament-weekly-trend__weeks li span',
        ),
      ].filter((element) => element.textContent?.includes('データなし')),
    ).toHaveLength(8)
  })

  it('shows a dedicated no-candidate state without a selector or fake series', () => {
    render(
      <TournamentWeeklyTrendChart
        trend={{ ...trend(), candidates: [], points: [] }}
        environmentLabel="env"
      />,
    )
    expect(
      screen.getByText('週次推移を表示できる推しデータがありません。'),
    ).toBeVisible()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
