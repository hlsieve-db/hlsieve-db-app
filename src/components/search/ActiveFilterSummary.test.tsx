import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ActiveFilterSummary } from './ActiveFilterSummary'
import type { SearchUrlState } from '../../domain/search/searchUrlState'

const empty: SearchUrlState = {
  query: '',
  colors: [],
  colorMode: 'or',
  cardTypes: [],
  bloom: [],
  criticalColors: [],
  criticalColorMode: 'or',
  effectTags: [],
  effectTagMode: 'and',
  sort: 'default',
  page: 1,
}

describe('ActiveFilterSummary', () => {
  it('renders nothing with no active conditions', () => {
    const { container } = render(
      <ActiveFilterSummary
        state={empty}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('summarizes active filters and delegates removal', () => {
    const onRemove = vi.fn()
    render(
      <ActiveFilterSummary
        state={{
          ...empty,
          query: 'ドロー',
          colors: ['blue'],
          effectTags: ['draw', 'gift'],
        }}
        onRemove={onRemove}
        onClear={vi.fn()}
      />,
    )
    expect(screen.getByText('ドロー')).toBeInTheDocument()
    expect(screen.getByText('青')).toBeInTheDocument()
    expect(screen.getByText('効果タグ 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '青の条件を外す' }))
    expect(onRemove).toHaveBeenCalledWith({ colors: [] })
  })

  it('shows up to two support categories as individually removable chips', () => {
    const onRemove = vi.fn()
    render(
      <ActiveFilterSummary
        state={{
          ...empty,
          cardTypes: ['support_limited', 'support_fan'],
        }}
        onRemove={onRemove}
        onClear={vi.fn()}
      />,
    )

    expect(screen.getByText('サポート（リミテッド）')).toBeVisible()
    expect(screen.getByText('ファン')).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', {
        name: 'サポート（リミテッド）の条件を外す',
      }),
    )
    expect(onRemove).toHaveBeenCalledWith({ cardTypes: ['support_fan'] })
  })

  it('summarizes three or more card types with the existing count rule', () => {
    const onRemove = vi.fn()
    render(
      <ActiveFilterSummary
        state={{
          ...empty,
          cardTypes: ['support_limited', 'support_general', 'support_tool'],
        }}
        onRemove={onRemove}
        onClear={vi.fn()}
      />,
    )

    expect(screen.getByText('カードタイプ 3')).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: 'カードタイプ 3の条件を外す' }),
    )
    expect(onRemove).toHaveBeenCalledWith({ cardTypes: [] })
  })
})
