import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { SITE_ORIGIN } from '../domain/site/constants'
import { MulliganPage } from './MulliganPage'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/mulligan']}>
      <MulliganPage />
    </MemoryRouter>,
  )
}

describe('MulliganPage', () => {
  it('renders four accessible numeric inputs with the requested defaults', () => {
    renderPage()

    expect(screen.getByLabelText('現在の山札枚数')).toHaveValue(50)
    expect(screen.getByLabelText('対象カードの枚数')).toHaveValue(4)
    expect(screen.getByLabelText('初手枚数')).toHaveValue(7)
    expect(screen.getByLabelText('引き直す枚数')).toHaveValue(5)
    for (const input of screen.getAllByRole('spinbutton')) {
      expect(input).toHaveAttribute('inputmode', 'numeric')
      expect(input).toHaveAttribute('step', '1')
    }
    expect(screen.getByRole('link', { name: 'マリガン計算' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('shows initial, conditional redraw, final, and improvement results', () => {
    renderPage()

    const resultRegion = screen.getByRole('region', {
      name: 'マリガン後に対象カードが1枚以上ある確率',
    })
    expect(resultRegion).toBeVisible()
    expect(
      within(resultRegion).getByText('66.0%', { selector: 'output' }),
    ).toBeVisible()
    expect(screen.getByText('46.4%')).toBeVisible()
    expect(screen.getByText('36.6%')).toBeVisible()
    expect(screen.getByText('+19.6pt')).toBeVisible()
  })

  it('recalculates immediately from all four free inputs', () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('現在の山札枚数'), {
      target: { value: '40' },
    })
    fireEvent.change(screen.getByLabelText('対象カードの枚数'), {
      target: { value: '3' },
    })
    fireEvent.change(screen.getByLabelText('初手枚数'), {
      target: { value: '6' },
    })
    fireEvent.change(screen.getByLabelText('引き直す枚数'), {
      target: { value: '4' },
    })

    const resultRegion = screen.getByRole('region', {
      name: 'マリガン後に対象カードが1枚以上ある確率',
    })
    expect(
      within(resultRegion).getByText('57.0%', { selector: 'output' }),
    ).toBeVisible()
  })

  it('hides results and announces natural validation errors', () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('初手枚数'), {
      target: { value: '51' },
    })
    fireEvent.change(screen.getByLabelText('引き直す枚数'), {
      target: { value: '52' },
    })

    expect(screen.getByRole('alert')).toHaveTextContent(
      '初手枚数は現在の山札枚数以下にしてください。',
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      '引き直す枚数は初手枚数以下にしてください。',
    )
    expect(
      screen.queryByRole('region', {
        name: 'マリガン後に対象カードが1枚以上ある確率',
      }),
    ).not.toBeInTheDocument()
  })

  it('handles M=0, K=0, and impossible initial miss in the UI', () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('引き直す枚数'), {
      target: { value: '0' },
    })
    expect(screen.getByText('+0.0pt')).toBeVisible()

    fireEvent.change(screen.getByLabelText('対象カードの枚数'), {
      target: { value: '0' },
    })
    expect(screen.getAllByText('0%').length).toBeGreaterThanOrEqual(2)

    fireEvent.change(screen.getByLabelText('対象カードの枚数'), {
      target: { value: '50' },
    })
    expect(screen.getAllByText('100%').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('—')).toBeVisible()
  })

  it('explains the simplified strategy without claiming a specific game rule', () => {
    renderPage()

    expect(screen.getByText(/初手に対象カードがあれば保持/)).toBeVisible()
    expect(
      screen.getByText(/実際のゲームルールやマリガン方法とは異なる/),
    ).toBeVisible()
  })

  it('sets indexable production metadata', () => {
    renderPage()

    expect(document.title).toBe('マリガン計算 | HLSieve DB')
    expect(
      document.head.querySelector('meta[name="description"]'),
    ).toHaveAttribute('content', expect.stringContaining('引き直し枚数'))
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'index,follow',
    )
    expect(
      document.head.querySelector('link[rel="canonical"]'),
    ).toHaveAttribute('href', `${SITE_ORIGIN}/mulligan`)
  })
})
