import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_SEARCH_URL_STATE,
  type SearchUrlState,
} from '../../domain/search/searchUrlState'
import {
  toSavedSearchState,
  type SavedSearchPreset,
} from '../../domain/searchPresets/types'
import type { SavedSearchPresetRepository } from '../../repositories/savedSearchPresetRepository'
import { SavedSearchPresets } from './SavedSearchPresets'

function savedPreset(
  id: string,
  name: string,
  overrides: Partial<SearchUrlState> = {},
): SavedSearchPreset {
  const searchState = toSavedSearchState({
    ...DEFAULT_SEARCH_URL_STATE,
    ...overrides,
  })
  return {
    id,
    name,
    searchState,
    createdAt: '2026-09-14T00:00:00.000Z',
    updatedAt: '2026-09-14T00:00:00.000Z',
  }
}

function repository(
  initial: SavedSearchPreset[] = [],
  overrides: Partial<SavedSearchPresetRepository> = {},
): SavedSearchPresetRepository {
  const values = [...initial]
  return {
    listPresets: vi.fn(async () => [...values]),
    getPreset: vi.fn(async (id) => values.find((value) => value.id === id)),
    createPreset: vi.fn(async (name, state) => {
      const created = savedPreset(`preset-${values.length + 1}`, name, state)
      values.unshift(created)
      return created
    }),
    removePreset: vi.fn(async (id) => {
      const index = values.findIndex((value) => value.id === id)
      if (index >= 0) values.splice(index, 1)
    }),
    ...overrides,
  }
}

describe('SavedSearchPresets', () => {
  it('shows its local-only empty state and saves the current search state', async () => {
    const currentState: SearchUrlState = {
      ...DEFAULT_SEARCH_URL_STATE,
      query: 'フワモコ',
      colors: ['red'],
      sort: 'card_number_asc',
      page: 3,
    }
    const presetRepository = repository()
    render(
      <SavedSearchPresets
        currentState={currentState}
        repository={presetRepository}
        onApply={vi.fn()}
      />,
    )

    expect(
      await screen.findByText('保存した検索条件はありません。'),
    ).toBeVisible()
    expect(screen.getByText(/このブラウザ内に保存/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '検索条件を保存' }))
    expect(screen.getByLabelText('名前')).toHaveAttribute('maxlength', '50')
    fireEvent.change(screen.getByLabelText('名前'), {
      target: { value: '  赤いフワモコ  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(presetRepository.createPreset).toHaveBeenCalledWith(
        '赤いフワモコ',
        currentState,
      ),
    )
    expect(
      await screen.findByRole('button', { name: '赤いフワモコ' }),
    ).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('保存しました')
  })

  it('validates an empty name without adding test-only production behavior', async () => {
    const presetRepository = repository()
    render(
      <SavedSearchPresets
        currentState={DEFAULT_SEARCH_URL_STATE}
        repository={presetRepository}
        onApply={vi.fn()}
      />,
    )
    await screen.findByText('保存した検索条件はありません。')
    fireEvent.click(screen.getByRole('button', { name: '検索条件を保存' }))
    fireEvent.change(screen.getByLabelText('名前'), {
      target: { value: '   ' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      '名前を入力してください。',
    )
    expect(presetRepository.createPreset).not.toHaveBeenCalled()
  })

  it('enforces the name limit and allows duplicate names as separate presets', async () => {
    const presetRepository = repository()
    render(
      <SavedSearchPresets
        currentState={DEFAULT_SEARCH_URL_STATE}
        repository={presetRepository}
        onApply={vi.fn()}
      />,
    )
    await screen.findByText('保存した検索条件はありません。')
    fireEvent.click(screen.getByRole('button', { name: '検索条件を保存' }))
    fireEvent.change(screen.getByLabelText('名前'), {
      target: { value: 'a'.repeat(51) },
    })
    fireEvent.submit(screen.getByLabelText('名前').closest('form')!)
    expect(screen.getByRole('alert')).toHaveTextContent('50文字以内')

    fireEvent.change(screen.getByLabelText('名前'), {
      target: { value: '同名' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await screen.findByRole('button', { name: '同名' })
    fireEvent.click(screen.getByRole('button', { name: '検索条件を保存' }))
    fireEvent.change(screen.getByLabelText('名前'), {
      target: { value: '同名' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: '同名' })).toHaveLength(2),
    )
  })

  it('reloads persisted presets through the repository rather than component state', async () => {
    const presetRepository = repository()
    const first = render(
      <SavedSearchPresets
        currentState={DEFAULT_SEARCH_URL_STATE}
        repository={presetRepository}
        onApply={vi.fn()}
      />,
    )
    await screen.findByText('保存した検索条件はありません。')
    fireEvent.click(screen.getByRole('button', { name: '検索条件を保存' }))
    fireEvent.change(screen.getByLabelText('名前'), {
      target: { value: '再読込' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await screen.findByRole('button', { name: '再読込' })
    first.unmount()

    render(
      <SavedSearchPresets
        currentState={DEFAULT_SEARCH_URL_STATE}
        repository={presetRepository}
        onApply={vi.fn()}
      />,
    )
    expect(await screen.findByRole('button', { name: '再読込' })).toBeVisible()
    expect(presetRepository.listPresets).toHaveBeenCalledTimes(2)
  })

  it('applies a preset as page 1 and leaves URL navigation to its caller', async () => {
    const onApply = vi.fn()
    render(
      <SavedSearchPresets
        currentState={DEFAULT_SEARCH_URL_STATE}
        repository={repository([
          savedPreset('preset-1', 'Buzz検索', {
            bloom: ['buzz'],
            sort: 'release_date_desc',
            page: 8,
          }),
        ])}
        onApply={onApply}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Buzz検索' }))
    expect(onApply).toHaveBeenCalledWith({
      ...DEFAULT_SEARCH_URL_STATE,
      bloom: ['buzz'],
      sort: 'release_date_desc',
      page: 1,
    })
  })

  it('requires confirmation before deleting and keeps the list unchanged on cancel', async () => {
    const presetRepository = repository([savedPreset('preset-1', '赤検索')])
    render(
      <SavedSearchPresets
        currentState={DEFAULT_SEARCH_URL_STATE}
        repository={presetRepository}
        onApply={vi.fn()}
      />,
    )
    await screen.findByRole('button', { name: '赤検索' })
    fireEvent.click(screen.getByRole('button', { name: '「赤検索」を削除' }))
    const dialog = screen.getByRole('dialog', { name: '検索条件を削除' })
    expect(dialog).toHaveTextContent('「赤検索」を削除しますか？')
    fireEvent.click(within(dialog).getByRole('button', { name: 'キャンセル' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(presetRepository.removePreset).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '「赤検索」を削除' }))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: '削除' }),
    )
    await waitFor(() =>
      expect(presetRepository.removePreset).toHaveBeenCalledWith('preset-1'),
    )
    expect(
      screen.queryByRole('button', { name: '赤検索' }),
    ).not.toBeInTheDocument()
  })

  it('reports load, save, and delete failures and supports retrying load', async () => {
    const listPresets = vi
      .fn<() => Promise<SavedSearchPreset[]>>()
      .mockRejectedValueOnce(new Error('load failed'))
      .mockResolvedValueOnce([savedPreset('preset-1', '復旧')])
    const presetRepository = repository([], {
      listPresets,
      createPreset: vi.fn(async () => {
        throw new Error('save failed')
      }),
      removePreset: vi.fn(async () => {
        throw new Error('delete failed')
      }),
    })
    render(
      <SavedSearchPresets
        currentState={DEFAULT_SEARCH_URL_STATE}
        repository={presetRepository}
        onApply={vi.fn()}
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '読み込めませんでした',
    )
    fireEvent.click(screen.getByRole('button', { name: '再試行' }))
    await screen.findByRole('button', { name: '復旧' })

    fireEvent.click(screen.getByRole('button', { name: '検索条件を保存' }))
    fireEvent.change(screen.getByLabelText('名前'), {
      target: { value: '保存失敗' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '保存できませんでした',
    )

    fireEvent.click(screen.getByRole('button', { name: '「復旧」を削除' }))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: '削除' }),
    )
    expect(
      await within(screen.getByRole('dialog')).findByRole('alert'),
    ).toHaveTextContent('削除できませんでした')
    expect(screen.getByRole('button', { name: '復旧' })).toBeVisible()
  })
})
