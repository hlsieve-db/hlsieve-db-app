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

describe('TournamentAnalysisPage', () => {
  it('loads the index once and renders separate environment text rankings', async () => {
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

    const selection = screen
      .getByRole('heading', { name: 'セレクションカップ／bp08' })
      .closest('section')!
    expect(within(selection).getByText('8件', { selector: 'dd' })).toBeVisible()
    expect(
      within(selection).getAllByText('Synthetic Oshi').length,
    ).toBeGreaterThan(0)
    expect(
      within(selection).getAllByText('SYNTH-OSHI-001').length,
    ).toBeGreaterThan(0)
    expect(within(selection).getAllByText('50.0%').length).toBeGreaterThan(0)
    expect(within(selection).getAllByRole('list')).toHaveLength(2)
    const winnerOnly = screen
      .getByRole('heading', { name: 'その他／ラウンドなし' })
      .closest('section')!
    const placement = within(winnerOnly)
      .getByRole('heading', { name: '入賞分布' })
      .closest('section')!
    expect(
      within(placement).getByText('対象データがありません。'),
    ).toBeVisible()
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
    expect(screen.getAllByText('対象データがありません。')).toHaveLength(2)
  })
})
