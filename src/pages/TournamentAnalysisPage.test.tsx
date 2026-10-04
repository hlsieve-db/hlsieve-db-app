import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { TournamentIndexFile } from '../domain/tournaments/types'
import * as tierDomain from '../domain/tournaments/tier'
import * as weeklyTrendDomain from '../domain/tournaments/weeklyTrend'
import {
  SYNTHETIC_TOURNAMENT_INDEX,
  SYNTHETIC_TOURNAMENT_OSHI_MASTER,
} from '../test/fixtures/tournaments'
import { TournamentAnalysisPage } from './TournamentAnalysisPage'

vi.mock('../components/AppNavigation', () => ({
  AppNavigation: () => <nav aria-label="test navigation" />,
}))
vi.mock('../hooks/useDocumentMetadata', () => ({
  useDocumentMetadata: () => undefined,
}))

function LocationProbe() {
  const location = useLocation()
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  )
}

function renderPage({
  path = '/tournaments/analysis',
  index = SYNTHETIC_TOURNAMENT_INDEX,
  loadIndex = vi.fn(async () => index),
  loadOshiMaster = vi.fn(async () => SYNTHETIC_TOURNAMENT_OSHI_MASTER),
}: {
  path?: string
  index?: TournamentIndexFile | undefined
  loadIndex?: () => Promise<TournamentIndexFile | undefined>
  loadOshiMaster?: () => Promise<typeof SYNTHETIC_TOURNAMENT_OSHI_MASTER>
} = {}) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <TournamentAnalysisPage
        loadIndex={loadIndex}
        loadOshiMaster={loadOshiMaster}
      />
      <LocationProbe />
    </MemoryRouter>,
  )
  return { loadIndex, loadOshiMaster }
}

function sufficientTierIndex(): TournamentIndexFile {
  const seed = SYNTHETIC_TOURNAMENT_INDEX.events[0]!
  const winnerCards = [
    ...Array<string>(10).fill('TIER-S'),
    ...Array<string>(6).fill('TIER-A'),
    ...Array<string>(4).fill('TIER-B'),
    'TIER-C-UNKNOWN-WITH-A-DELIBERATELY-LONG-CARD-NUMBER',
  ]
  const remainingCards = [
    ...Array<string>(70).fill('TIER-S'),
    ...Array<string>(42).fill('TIER-A'),
    ...Array<string>(28).fill('TIER-B'),
    ...Array<string>(7).fill(
      'TIER-C-UNKNOWN-WITH-A-DELIBERATELY-LONG-CARD-NUMBER',
    ),
  ]
  return {
    ...SYNTHETIC_TOURNAMENT_INDEX,
    events: winnerCards.map((winner, eventIndex) => {
      const cardNumbers = [
        winner,
        ...remainingCards.slice(eventIndex * 7, eventIndex * 7 + 7),
      ]
      return {
        ...seed,
        id: `tier-event-${eventIndex}`,
        resultCount: 8,
        results: cardNumbers.map((oshiCardNumber, rankIndex) => ({
          id: `tier-result-${eventIndex}-${rankIndex + 1}`,
          rank: rankIndex + 1,
          oshiCardNumber,
        })),
      }
    }),
  }
}

const TIER_OSHI_MASTER = {
  ...SYNTHETIC_TOURNAMENT_OSHI_MASTER,
  cards: {
    ...SYNTHETIC_TOURNAMENT_OSHI_MASTER.cards,
    'TIER-S': { name: 'Tier S Oshi' },
    'TIER-A': { name: 'Tier A Oshi' },
    'TIER-B': { name: 'Tier B Oshi' },
  },
}

describe('TournamentAnalysisPage', () => {
  it('loads the index once and renders separate environment text rankings', async () => {
    const weeklyAggregator = vi.spyOn(
      weeklyTrendDomain,
      'aggregateTournamentWeeklyTrends',
    )
    const { loadIndex } = renderPage()
    expect(screen.getByText('大会データを読み込んでいます…')).toBeVisible()
    expect(
      await screen.findByRole('heading', { name: 'セレクションカップ／bp08' }),
    ).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'ブルームカップ／ラウンドなし' }),
    ).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'その他／ラウンドなし' }),
    ).toBeVisible()
    expect(loadIndex).toHaveBeenCalledOnce()
    expect(weeklyAggregator).toHaveBeenCalledWith(
      SYNTHETIC_TOURNAMENT_INDEX,
      expect.objectContaining({
        tournamentType: undefined,
        round: undefined,
        from: undefined,
        to: undefined,
      }),
    )

    const selection = screen
      .getByRole('heading', { name: 'セレクションカップ／bp08' })
      .closest('section')!
    expect(
      within(
        selection.querySelector('.tournament-analysis-summary')!,
      ).getByText('8件', { selector: 'dd' }),
    ).toBeVisible()
    expect(
      within(selection).getAllByText('Synthetic Oshi').length,
    ).toBeGreaterThan(0)
    expect(
      within(selection).getAllByText('SYNTH-OSHI-001').length,
    ).toBeGreaterThan(0)
    expect(within(selection).getAllByText('50.0%').length).toBeGreaterThan(0)
    expect(
      selection.querySelectorAll('.tournament-analysis-ranking'),
    ).toHaveLength(2)
    expect(
      within(selection).getByRole('img', {
        name: 'セレクションカップ／bp08の収録済み大会の優勝分布',
      }),
    ).toBeVisible()
    expect(
      within(selection).getByRole('img', {
        name: 'セレクションカップ／bp08の収録済み大会の入賞分布',
      }),
    ).toBeVisible()
    const charts = within(selection).getAllByTestId(
      'tournament-distribution-donut',
    )
    expect(
      [...charts[0].querySelectorAll('[data-count]')].map((node) =>
        node.getAttribute('data-count'),
      ),
    ).toEqual(['1'])
    expect(
      [...charts[1].querySelectorAll('[data-count]')].map((node) =>
        node.getAttribute('data-count'),
      ),
    ).toEqual(['4', '4'])
    const winnerOnly = screen
      .getByRole('heading', { name: 'その他／ラウンドなし' })
      .closest('section')!
    const placement = within(winnerOnly)
      .getByRole('heading', { name: '入賞分布' })
      .closest('section')!
    expect(
      within(placement).getByText('対象データがありません。'),
    ).toBeVisible()
    expect(within(placement).queryByRole('img')).not.toBeInTheDocument()
    expect(
      within(selection).getByRole('heading', { name: '週次推移' }),
    ).toBeVisible()
    weeklyAggregator.mockRestore()
  })

  it('renders sufficient domain tiers with accessible groups, metrics, and metadata fallback', async () => {
    const evaluator = vi.spyOn(tierDomain, 'evaluateTournamentTier')
    renderPage({
      index: sufficientTierIndex(),
      loadOshiMaster: vi.fn(async () => TIER_OSHI_MASTER),
    })

    const environmentHeading = await screen.findByRole('heading', {
      name: 'セレクションカップ／bp08',
    })
    const environment = environmentHeading.closest('section')!
    const tierHeading = within(environment).getByRole('heading', {
      name: '収録大会実績Tier',
    })
    const tierSection = tierHeading.closest('section')!

    expect(evaluator).toHaveBeenCalledOnce()
    expect(evaluator.mock.calls[0]?.[0].environment).toEqual({
      tournamentType: 'selectioncup',
      round: 'bp08',
    })
    expect(
      within(tierSection)
        .getAllByRole('heading', { level: 4 })
        .map((heading) => heading.textContent?.trim()),
    ).toEqual(['STier S', 'ATier A', 'BTier B', 'CTier C'])
    expect(within(tierSection).getByText('Tier S Oshi')).toBeVisible()
    expect(within(tierSection).getByText('Tier A Oshi')).toBeVisible()
    expect(within(tierSection).getByText('Tier B Oshi')).toBeVisible()
    expect(within(tierSection).getByText('名称不明')).toBeVisible()
    expect(
      within(tierSection).getByText(
        'TIER-C-UNKNOWN-WITH-A-DELIBERATELY-LONG-CARD-NUMBER',
      ),
    ).toBeVisible()
    expect(within(tierSection).getByText('優勝 10件 / 47.6%')).toBeVisible()
    expect(within(tierSection).getByText('入賞 80件 / 47.6%')).toBeVisible()
    expect(within(tierSection).queryByText(/^勝率/)).not.toBeInTheDocument()
    expect(within(tierSection).queryByText(/^使用率/)).not.toBeInTheDocument()
    expect(within(tierSection).getAllByRole('list')).toHaveLength(4)
    expect(
      within(environment).getAllByTestId('tournament-distribution-donut'),
    ).toHaveLength(2)
    expect(
      environment.querySelectorAll('.tournament-analysis-ranking'),
    ).toHaveLength(2)
    evaluator.mockRestore()
  })

  it('renders limited sample details and reasons without any Tier group', async () => {
    renderPage({
      path: '/tournaments/analysis?type=selectioncup&round=bp08',
    })
    const tierHeading = await screen.findByRole('heading', {
      name: '収録大会実績Tier',
    })
    const tierSection = tierHeading.closest('section')!
    expect(
      within(tierSection).getByText(
        '収録結果が少ないため、実績Tierはまだ判定していません。',
      ),
    ).toBeVisible()
    expect(
      within(tierSection).getByText('優勝データがまだ少ないです'),
    ).toBeVisible()
    expect(
      within(tierSection).getByText('入賞集計対象の大会数がまだ少ないです'),
    ).toBeVisible()
    expect(
      within(tierSection).getByText('入賞データがまだ少ないです'),
    ).toBeVisible()
    expect(
      within(tierSection).getByText('優勝データ').parentElement,
    ).toHaveTextContent('1件')
    expect(
      within(tierSection).getByText('入賞対象大会').parentElement,
    ).toHaveTextContent('1件')
    expect(
      within(tierSection).getByText('入賞データ').parentElement,
    ).toHaveTextContent('8件')
    expect(
      within(tierSection).queryByRole('heading', { name: /^Tier [SABC]$/ }),
    ).not.toBeInTheDocument()
  })

  it('omits empty Tier groups', async () => {
    const index = sufficientTierIndex()
    const onlyLeader: TournamentIndexFile = {
      ...index,
      events: index.events.map((event) => ({
        ...event,
        results: event.results.map((result) => ({
          ...result,
          oshiCardNumber: 'TIER-S',
        })),
      })),
    }
    renderPage({
      index: onlyLeader,
      loadOshiMaster: vi.fn(async () => TIER_OSHI_MASTER),
    })
    const tier = (
      await screen.findByRole('heading', {
        name: '収録大会実績Tier',
      })
    ).closest('section')!
    expect(within(tier).getByRole('heading', { name: 'Tier S' })).toBeVisible()
    expect(
      within(tier).queryByRole('heading', { name: /^Tier [ABC]$/ }),
    ).not.toBeInTheDocument()
  })

  it('explains the relative reference-only calculation without presenting rates as strength', async () => {
    renderPage({
      path: '/tournaments/analysis?type=selectioncup&round=bp08',
    })
    const tier = (
      await screen.findByRole('heading', {
        name: '収録大会実績Tier',
      })
    ).closest('section')!
    expect(within(tier).getByText(/収録された大会結果/)).toHaveTextContent(
      '相対評価',
    )
    expect(within(tier).getByText(/収録された大会結果/)).toHaveTextContent(
      '絶対的な強さや勝率を示すものではなく',
    )
    expect(within(tier).getByText(/50:50/)).toHaveTextContent(
      '同じ大会環境内の首位実績に対する相対値',
    )
  })

  it('keeps different rounds of the same type in stable separate groups', async () => {
    const seed = SYNTHETIC_TOURNAMENT_INDEX.events[0]!
    renderPage({
      index: {
        ...SYNTHETIC_TOURNAMENT_INDEX,
        events: [
          {
            ...seed,
            id: 'r2',
            tournament: { ...seed.tournament, round: 'r2' },
          },
          {
            ...seed,
            id: 'no-round',
            tournament: { ...seed.tournament, round: undefined },
          },
          {
            ...seed,
            id: 'r1',
            tournament: { ...seed.tournament, round: 'r1' },
          },
        ],
      },
    })
    const headings = await screen.findAllByRole('heading', {
      name: /セレクションカップ／/,
    })
    expect(headings.map((heading) => heading.textContent)).toEqual([
      'セレクションカップ／ラウンドなし',
      'セレクションカップ／r1',
      'セレクションカップ／r2',
    ])
  })

  it('shows a normal empty state without synthetic fallback', async () => {
    renderPage({ index: { ...SYNTHETIC_TOURNAMENT_INDEX, events: [] } })
    expect(
      await screen.findByText('集計可能な大会データがありません。'),
    ).toBeVisible()
    expect(screen.queryByText(/Synthetic/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows index errors, retries, and does not silently empty aggregation errors', async () => {
    const loadIndex = vi
      .fn<() => Promise<TournamentIndexFile | undefined>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(SYNTHETIC_TOURNAMENT_INDEX)
    renderPage({ loadIndex })
    fireEvent.click(await screen.findByRole('button', { name: '再試行' }))
    expect(
      await screen.findByRole('heading', { name: 'セレクションカップ／bp08' }),
    ).toBeVisible()
    expect(loadIndex).toHaveBeenCalledTimes(2)

    const duplicate: TournamentIndexFile = {
      ...SYNTHETIC_TOURNAMENT_INDEX,
      events: [
        SYNTHETIC_TOURNAMENT_INDEX.events[0]!,
        SYNTHETIC_TOURNAMENT_INDEX.events[0]!,
      ],
    }
    renderPage({ index: duplicate })
    expect(await screen.findByRole('alert')).toHaveTextContent('集計に失敗')
  })

  it('keeps rankings when the Oshi master fails and preserves unknown cards', async () => {
    renderPage({
      loadOshiMaster: vi.fn(async () => Promise.reject(new Error('missing'))),
    })
    expect(
      await screen.findByText(
        '推し名称を読み込めませんでした。カード番号で集計を表示します。',
      ),
    ).toBeVisible()
    expect(screen.getAllByText('名称不明').length).toBeGreaterThan(0)
    expect(screen.getAllByText('SYNTH-OSHI-001').length).toBeGreaterThan(0)
    expect(
      document.querySelectorAll('[data-image-state="missing"]').length,
    ).toBeGreaterThan(0)
  })

  it('filters type, round including none, and inclusive dates through the URL', async () => {
    renderPage({
      path: '/tournaments/analysis?type=bloomcup&round=none&from=2026-09-20&to=2026-09-20',
    })
    expect(
      await screen.findByRole('heading', {
        name: 'ブルームカップ／ラウンドなし',
      }),
    ).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: /セレクションカップ／bp08/ }),
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText('開始日')).toHaveValue('2026-09-20')
    expect(screen.getByLabelText('終了日')).toHaveValue('2026-09-20')
    expect(screen.getByLabelText('開始日')).toHaveAttribute('min', '2026-09-19')
  })

  it('disables round without type and clears it when type changes', async () => {
    renderPage({ path: '/tournaments/analysis?type=selectioncup&round=bp08' })
    const round = await screen.findByRole('combobox', { name: 'ラウンド' })
    expect(round).toHaveValue('bp08')
    fireEvent.change(screen.getByRole('combobox', { name: '大会種別' }), {
      target: { value: 'bloomcup' },
    })
    expect(screen.getByTestId('location')).toHaveTextContent('?type=bloomcup')
    expect(round).toHaveValue('')
    fireEvent.change(screen.getByRole('combobox', { name: '大会種別' }), {
      target: { value: '' },
    })
    expect(round).toBeDisabled()
  })

  it('validates reversed dates without calling aggregation or canonical loops', async () => {
    renderPage({
      path: '/tournaments/analysis?from=2026-09-26&to=2026-09-20&unknown=x',
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '開始日は終了日以前',
    )
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '?from=2026-09-26&to=2026-09-20',
      ),
    )
    expect(screen.getByTestId('location')).not.toHaveTextContent('unknown')
    expect(
      screen.queryByText('集計可能な大会データがありません。'),
    ).not.toBeInTheDocument()
  })

  it('renders explicit empty winner and placement sections', async () => {
    const noResults: TournamentIndexFile = {
      ...SYNTHETIC_TOURNAMENT_INDEX,
      events: [
        {
          ...SYNTHETIC_TOURNAMENT_INDEX.events[0]!,
          id: 'no-results',
          resultCoverage: { kind: 'variable' },
          resultCount: 0,
          results: [],
        },
      ],
    }
    renderPage({ index: noResults })
    await screen.findByRole('heading', { name: 'セレクションカップ／bp08' })
    expect(screen.getAllByText('対象データがありません。')).toHaveLength(3)
  })
})
