import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { useLocation, useNavigate, MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { TournamentIndexFile } from '../domain/tournaments/types'
import {
  SYNTHETIC_TOURNAMENT_INDEX,
  SYNTHETIC_TOURNAMENT_OSHI_MASTER,
} from '../test/fixtures/tournaments'
import { TournamentListPage } from './TournamentListPage'

vi.mock('../components/AppNavigation', () => ({
  AppNavigation: () => <nav aria-label="test navigation" />,
}))
vi.mock('../hooks/useDocumentMetadata', () => ({
  useDocumentMetadata: () => undefined,
}))

function LocationProbe() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <output data-testid="location">
        {location.pathname}
        {location.search}
      </output>
      <button type="button" onClick={() => navigate('?venue=url-value')}>
        外部URL更新
      </button>
    </>
  )
}

function renderPage({
  path = '/tournaments',
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
      <TournamentListPage
        loadIndex={loadIndex}
        loadOshiMaster={loadOshiMaster}
      />
      <LocationProbe />
    </MemoryRouter>,
  )
  return { loadIndex, loadOshiMaster }
}

describe('TournamentListPage', () => {
  it('renders one semantic table row per Event with official metadata', async () => {
    renderPage()
    expect(screen.getByText('大会データを読み込んでいます…')).toHaveTextContent(
      '大会データを読み込んでいます',
    )
    expect(
      await screen.findByRole('link', { name: 'Synthetic North Hall' }),
    ).toHaveAttribute('href', '/tournaments/synthetic-event-a')
    expect(screen.getByRole('table', { name: '大会一覧' })).toBeVisible()
    expect(screen.getAllByRole('row')).toHaveLength(4)
    expect(
      screen.getAllByRole('columnheader').map((header) => header.textContent),
    ).toEqual([
      '日付',
      '店名',
      '優勝推し',
      '種別',
      '環境',
      '地域',
      '参加者',
      '入賞数',
    ])
    expect(screen.queryByRole('columnheader', { name: 'イベント' })).toBeNull()
    expect(screen.getByText('テスト県')).toBeVisible()
    expect(screen.getByText('64人')).toBeVisible()
    expect(screen.getAllByText('セレクションカップ')).toHaveLength(2)
    expect(screen.getAllByText('その他')).toHaveLength(2)
    expect(screen.queryByText(/future-format/)).toBeNull()
    expect(screen.queryByText(/Synthetic Bloom Cup.*参加者/)).toBeNull()
  })

  it('renders a propagated participant count', async () => {
    renderPage({
      index: {
        ...SYNTHETIC_TOURNAMENT_INDEX,
        events: SYNTHETIC_TOURNAMENT_INDEX.events.map((event, index) =>
          index === 0 ? { ...event, participantCount: 60 } : event,
        ),
      },
    })
    expect(await screen.findByText('60人')).toBeVisible()
  })

  it('keeps the full venue name as the detail link and preserves a fallback link', async () => {
    const first = SYNTHETIC_TOURNAMENT_INDEX.events[0]!
    const longVenueName =
      'Synthetic Card Shop With A Deliberately Long Complete Store Name'
    renderPage({
      index: {
        ...SYNTHETIC_TOURNAMENT_INDEX,
        events: [
          {
            ...first,
            id: 'long-venue',
            venue: { ...first.venue, name: longVenueName },
          },
          {
            ...first,
            id: 'missing-venue',
            venue: { ...first.venue, name: '' },
          },
        ],
      },
    })

    expect(
      await screen.findByRole('link', { name: longVenueName }),
    ).toHaveAttribute('href', '/tournaments/long-venue')
    expect(
      screen.getByRole('link', { name: '大会詳細を見る' }),
    ).toHaveAttribute('href', '/tournaments/missing-venue')
    expect(document.querySelector('.tournament-table__event')).toBeNull()
  })

  it('uses the single actual rank 1 Result as winner text without rendering images', async () => {
    const first = SYNTHETIC_TOURNAMENT_INDEX.events[0]!
    renderPage({
      index: {
        ...SYNTHETIC_TOURNAMENT_INDEX,
        events: [
          {
            ...first,
            results: [first.results[1]!, first.results[0]!],
            resultCount: 2,
          },
        ],
      },
    })
    expect(await screen.findByText('優勝推し')).toBeVisible()
    expect(screen.getByText('Synthetic Oshi')).toBeVisible()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('does not choose an arbitrary winner when invalid data has duplicate rank 1', async () => {
    const first = SYNTHETIC_TOURNAMENT_INDEX.events[0]!
    renderPage({
      index: {
        ...SYNTHETIC_TOURNAMENT_INDEX,
        events: [
          {
            ...first,
            results: [first.results[0]!, { ...first.results[1]!, rank: 1 }],
            resultCount: 2,
          },
        ],
      },
    })

    const row = (
      await screen.findByRole('link', {
        name: 'Synthetic North Hall',
      })
    ).closest('tr')
    expect(row).not.toBeNull()
    expect(within(row!).getAllByText('—')).not.toHaveLength(0)
    expect(within(row!).queryByText('Synthetic Oshi')).toBeNull()
  })

  it('keeps filters and result count outside the table scroll region', async () => {
    renderPage()
    const region = await screen.findByRole('region', { name: '大会一覧表' })

    expect(
      within(region).getByRole('link', { name: 'Synthetic North Hall' }),
    ).toBeVisible()
    expect(
      within(region).queryByRole('searchbox', { name: '店舗名・都道府県' }),
    ).toBeNull()
    expect(within(region).queryByText('3件')).toBeNull()
    expect(screen.getByText('3件')).toBeVisible()
  })

  it.each([
    {
      label: 'rank 1なし',
      index: {
        ...SYNTHETIC_TOURNAMENT_INDEX,
        events: [
          {
            ...SYNTHETIC_TOURNAMENT_INDEX.events[0]!,
            results: SYNTHETIC_TOURNAMENT_INDEX.events[0]!.results.filter(
              ({ rank }) => rank !== 1,
            ),
          },
        ],
      },
      master: SYNTHETIC_TOURNAMENT_OSHI_MASTER,
    },
    {
      label: 'oshi master欠損',
      index: {
        ...SYNTHETIC_TOURNAMENT_INDEX,
        events: [SYNTHETIC_TOURNAMENT_INDEX.events[0]!],
      },
      master: { ...SYNTHETIC_TOURNAMENT_OSHI_MASTER, cards: {} },
    },
    {
      label: '画像URL欠損',
      index: {
        ...SYNTHETIC_TOURNAMENT_INDEX,
        events: [
          {
            ...SYNTHETIC_TOURNAMENT_INDEX.events[1]!,
            results: [
              {
                ...SYNTHETIC_TOURNAMENT_INDEX.events[1]!.results[0]!,
                oshiCardNumber: 'SYNTH-OSHI-NO-IMAGE',
              },
            ],
          },
        ],
      },
      master: SYNTHETIC_TOURNAMENT_OSHI_MASTER,
    },
  ])(
    'keeps Event information usable when $label',
    async ({ index, master }) => {
      renderPage({ index, loadOshiMaster: vi.fn(async () => master) })
      expect(await screen.findByRole('link')).toBeVisible()
      expect(screen.getByText('優勝推し')).toBeVisible()
      expect(screen.queryByRole('img')).toBeNull()
    },
  )

  it('does not render coverage labels in the list', async () => {
    renderPage()
    await screen.findByRole('link', { name: /Synthetic North Hall/ })
    expect(screen.queryByText('収録範囲')).toBeNull()
    expect(screen.queryByText('1〜8位の結果を収録')).toBeNull()
    expect(screen.getByText('8件')).toBeVisible()
  })

  it('shows preparation for missing or empty indexes and distinguishes filter emptiness', async () => {
    const loadIndex = vi.fn(async () => ({
      ...SYNTHETIC_TOURNAMENT_INDEX,
      dataVersion: '741638a568efd6f9',
      events: [],
    }))
    const first = renderPage({ loadIndex })
    expect(
      await screen.findByText('大会データは現在準備中です。'),
    ).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(first.loadIndex).toHaveBeenCalledOnce()
  })

  it('filters by cardNumber even when two Oshi options have the same name', async () => {
    renderPage()
    const select = await screen.findByRole('combobox', { name: '推しホロメン' })
    const matchingOptions = within(select)
      .getAllByRole('option')
      .filter((option) => option.textContent?.startsWith('Synthetic Oshi（'))
    expect(matchingOptions).toHaveLength(2)
    fireEvent.change(select, { target: { value: 'SYNTH-OSHI-002' } })
    expect(screen.getByTestId('location')).toHaveTextContent(
      'oshi=SYNTH-OSHI-002',
    )
    expect(
      screen.getByRole('link', { name: /Synthetic North Hall/ }),
    ).toBeVisible()
    expect(
      screen.getByRole('link', { name: /Synthetic Future Space/ }),
    ).toBeVisible()
    expect(
      screen.queryByRole('link', { name: /Synthetic South Store/ }),
    ).toBeNull()
  })

  it('filters date, type, round and normalized venue and resets page', async () => {
    const selection = SYNTHETIC_TOURNAMENT_INDEX.events[0]!
    const bloom = SYNTHETIC_TOURNAMENT_INDEX.events[1]!
    const index: TournamentIndexFile = {
      ...SYNTHETIC_TOURNAMENT_INDEX,
      events: [
        ...Array.from({ length: 21 }, (_, itemIndex) => ({
          ...selection,
          id: `selection-${itemIndex}`,
        })),
        bloom,
      ],
    }
    renderPage({ path: '/tournaments?page=2', index })
    await screen.findAllByRole('link', { name: /Synthetic North Hall/ })
    fireEvent.change(screen.getByRole('combobox', { name: '大会種別' }), {
      target: { value: 'bloomcup' },
    })
    expect(screen.getByTestId('location')).toHaveTextContent('?type=bloomcup')
    expect(screen.getByTestId('location')).not.toHaveTextContent('page=')
    fireEvent.change(screen.getByRole('combobox', { name: '環境' }), {
      target: { value: 'none' },
    })
    fireEvent.change(
      screen.getByRole('searchbox', { name: '店舗名・都道府県' }),
      { target: { value: 'south' } },
    )
    fireEvent.change(screen.getByLabelText('開始日'), {
      target: { value: '2026-09-20' },
    })
    fireEvent.change(screen.getByLabelText('終了日'), {
      target: { value: '2026-09-20' },
    })
    expect(
      screen.getByRole('link', { name: /Synthetic South Store/ }),
    ).toBeVisible()
  })

  it('keeps IME composition local and commits the final venue once', async () => {
    renderPage()
    await screen.findByRole('link', { name: /Synthetic North Hall/ })
    const input = screen.getByRole('searchbox', {
      name: '店舗名・都道府県',
    })

    fireEvent.compositionStart(input)
    for (const value of ['a', 'あ', 'あい', 'あいち']) {
      fireEvent.change(input, { target: { value } })
      expect(input).toHaveValue(value)
      expect(screen.getByTestId('location')).not.toHaveTextContent('venue=')
    }

    fireEvent.compositionEnd(input, { data: 'あいち' })
    expect(input).toHaveValue('あいち')
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        'venue=%E3%81%82%E3%81%84%E3%81%A1',
      ),
    )
  })

  it('keeps ordinary venue input immediate and synchronized with the URL', async () => {
    renderPage()
    await screen.findByRole('link', { name: /Synthetic North Hall/ })
    const input = screen.getByRole('searchbox', {
      name: '店舗名・都道府県',
    })

    fireEvent.change(input, { target: { value: 'aichi' } })

    expect(input).toHaveValue('aichi')
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('venue=aichi'),
    )
  })

  it('does not overwrite the composition draft during an external URL update', async () => {
    renderPage()
    await screen.findByRole('link', { name: /Synthetic North Hall/ })
    const input = screen.getByRole('searchbox', {
      name: '店舗名・都道府県',
    })

    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: 'あい' } })
    fireEvent.click(screen.getByRole('button', { name: '外部URL更新' }))

    expect(input).toHaveValue('あい')
    expect(screen.getByTestId('location')).toHaveTextContent('venue=url-value')
    fireEvent.compositionEnd(input, { data: 'あい' })
    await waitFor(() => expect(input).toHaveValue('あい'))
  })

  it('announces a reversed date range without swapping it', async () => {
    renderPage({ path: '/tournaments?from=2026-09-30&to=2026-09-19' })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '開始日は終了日以前',
    )
    expect(screen.getByTestId('location')).toHaveTextContent(
      'from=2026-09-30&to=2026-09-19',
    )
  })

  it('resets page on a filter change even when page 2 remains in range', async () => {
    const seed = SYNTHETIC_TOURNAMENT_INDEX.events[0]!
    const index: TournamentIndexFile = {
      ...SYNTHETIC_TOURNAMENT_INDEX,
      events: Array.from({ length: 41 }, (_, itemIndex) => ({
        ...seed,
        id: `filter-page-${itemIndex}`,
      })),
    }
    renderPage({ path: '/tournaments?page=2', index })
    await screen.findAllByRole('link', { name: /Synthetic North Hall/ })
    fireEvent.change(screen.getByRole('combobox', { name: '大会種別' }), {
      target: { value: 'selectioncup' },
    })
    expect(screen.getByTestId('location')).not.toHaveTextContent('page=')
  })

  it('keeps the list usable when Oshi master fails', async () => {
    renderPage({
      loadOshiMaster: vi.fn(async () => Promise.reject(new Error('missing'))),
    })
    expect(
      await screen.findByRole('link', { name: /Synthetic North Hall/ }),
    ).toBeVisible()
    expect(
      screen.getByRole('combobox', { name: '推しホロメン' }),
    ).toBeDisabled()
    expect(
      screen.getByText(/推しホロメンの絞り込みは現在利用できません/),
    ).toBeVisible()
  })

  it('shows an alert for index failure and retries', async () => {
    const loadIndex = vi
      .fn<() => Promise<TournamentIndexFile | undefined>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(SYNTHETIC_TOURNAMENT_INDEX)
    renderPage({ loadIndex })
    fireEvent.click(await screen.findByRole('button', { name: '再試行' }))
    expect(
      await screen.findByRole('link', { name: /Synthetic North Hall/ }),
    ).toBeVisible()
    expect(loadIndex).toHaveBeenCalledTimes(2)
  })

  it('paginates at exactly 20 with stable page navigation and range correction', async () => {
    const seed = SYNTHETIC_TOURNAMENT_INDEX.events[0]!
    const index: TournamentIndexFile = {
      ...SYNTHETIC_TOURNAMENT_INDEX,
      events: Array.from({ length: 21 }, (_, index) => ({
        ...seed,
        id: `synthetic-page-${String(index).padStart(2, '0')}`,
        tournament: {
          ...seed.tournament,
          seriesName: `Synthetic Page Event ${index + 1}`,
        },
      })),
    }
    renderPage({ index, path: '/tournaments?page=99' })
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('page=2'),
    )
    expect(screen.getAllByRole('row')).toHaveLength(2)
    expect(screen.getByText('2 / 2')).toHaveAttribute('aria-current', 'page')
    fireEvent.click(screen.getByRole('button', { name: '前へ' }))
    expect(screen.getAllByRole('row')).toHaveLength(21)
  })
})
