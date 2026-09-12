import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { SITE_ORIGIN } from '../domain/site/constants'
import { SwissPage } from './SwissPage'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/swiss']}>
      <SwissPage />
    </MemoryRouter>,
  )
}

describe('SwissPage', () => {
  it('shows accessible numeric defaults and the exact 64 / 5 distribution', () => {
    renderPage()

    expect(screen.getByLabelText('参加人数')).toHaveValue(64)
    expect(screen.getByLabelText('スイス回戦数')).toHaveValue(5)
    expect(screen.getByLabelText('参加人数')).toHaveAttribute(
      'inputmode',
      'numeric',
    )
    expect(screen.getByLabelText('スイス回戦数')).toHaveAttribute(
      'inputmode',
      'numeric',
    )

    const table = screen.getByRole('table')
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['戦績', '理論人数', '割合'])
    expect(
      within(table)
        .getAllByRole('row')
        .slice(1, -1)
        .map((row) => row.textContent),
    ).toEqual([
      '5-02人3.1%',
      '4-110人15.6%',
      '3-220人31.3%',
      '2-320人31.3%',
      '1-410人15.6%',
      '0-52人3.1%',
    ])
    expect(within(table).getByText('64人')).toBeVisible()
  })

  it('recalculates immediately and formats fractional theoretical players', () => {
    renderPage()

    fireEvent.change(screen.getByLabelText('参加人数'), {
      target: { value: '150' },
    })

    expect(screen.getAllByText('約4.7人')).toHaveLength(3)
    expect(screen.getAllByText('約23.4人')).toHaveLength(2)
    expect(screen.getAllByText('約46.9人')).toHaveLength(2)
    expect(screen.getByText('150人')).toBeVisible()
  })

  it('accepts a freely entered round count and keeps wins descending', () => {
    renderPage()

    fireEvent.change(screen.getByLabelText('参加人数'), {
      target: { value: '8' },
    })
    fireEvent.change(screen.getByLabelText('スイス回戦数'), {
      target: { value: '3' },
    })

    expect(
      screen.getAllByRole('rowheader').map((cell) => cell.textContent),
    ).toEqual(['3-0', '2-1', '1-2', '0-3', '合計'])
  })

  it.each([
    ['参加人数', '1', '参加人数は2〜100,000の整数で入力してください。'],
    ['参加人数', '', '参加人数は2〜100,000の整数で入力してください。'],
    ['スイス回戦数', '21', 'スイス回戦数は1〜20の整数で入力してください。'],
    ['スイス回戦数', '1.5', 'スイス回戦数は1〜20の整数で入力してください。'],
  ])('hides results for invalid %s input', (label, value, error) => {
    renderPage()

    fireEvent.change(screen.getByLabelText(label), { target: { value } })

    expect(screen.getByRole('alert')).toHaveTextContent(error)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(label)).toHaveAttribute(
      'aria-describedby',
      'swiss-errors',
    )
  })

  it('explains the idealized model and exposes indexable metadata', () => {
    renderPage()

    expect(
      screen.getByText(/引き分け・Bye・途中棄権を考慮しない理論値/),
    ).toBeVisible()
    expect(screen.getByText('全勝者の理論人数')).toBeVisible()
    expect(document.title).toBe('スイスドロー計算 | HLSieve DB')
    expect(
      document.head.querySelector('link[rel="canonical"]'),
    ).toHaveAttribute('href', `${SITE_ORIGIN}/swiss`)
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'index,follow',
    )
  })
})
