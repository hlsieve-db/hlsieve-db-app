import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { SITE_ORIGIN } from '../domain/site/constants'
import { ProbabilityPage } from './ProbabilityPage'

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/probability']}>
      <ProbabilityPage />
    </MemoryRouter>,
  )
}

describe('ProbabilityPage', () => {
  it('renders accessible numeric inputs with the final defaults', () => {
    renderPage()

    expect(screen.getByLabelText(/現在の山札枚数/)).toHaveValue(50)
    expect(screen.getByLabelText(/対象カードの枚数/)).toHaveValue(4)
    expect(screen.getByLabelText('見る枚数')).toHaveValue(5)
    expect(screen.getByRole('link', { name: '確率計算' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    for (const input of screen.getAllByRole('spinbutton')) {
      expect(input).toHaveAttribute('inputmode', 'numeric')
      expect(input).toHaveAttribute('step', '1')
    }
    expect(screen.getByText('35.3%')).toBeVisible()
    expect(
      screen.getByRole('region', { name: '1枚以上含まれる確率' }),
    ).toBeVisible()
  })

  it('allows free current-state inputs and recalculates immediately', () => {
    renderPage()

    fireEvent.change(screen.getByLabelText(/現在の山札枚数/), {
      target: { value: '34' },
    })
    fireEvent.change(screen.getByLabelText(/対象カードの枚数/), {
      target: { value: '2' },
    })
    fireEvent.change(screen.getByLabelText('見る枚数'), {
      target: { value: '3' },
    })

    expect(screen.getByText('17.1%')).toBeVisible()
  })

  it('hides the result and shows natural validation errors', () => {
    renderPage()

    fireEvent.change(screen.getByLabelText(/現在の山札枚数/), {
      target: { value: '3' },
    })
    expect(screen.queryByText('35.3%')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      '対象カードの枚数は現在の山札枚数以下にしてください。',
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      '見る枚数は現在の山札枚数以下にしてください。',
    )
  })

  it('shows exact zero and one hundred percent endpoints', () => {
    renderPage()

    fireEvent.change(screen.getByLabelText(/対象カードの枚数/), {
      target: { value: '0' },
    })
    expect(screen.getByText('0%')).toBeVisible()
    fireEvent.change(screen.getByLabelText(/対象カードの枚数/), {
      target: { value: '50' },
    })
    expect(screen.getByText('100%')).toBeVisible()
  })

  it('sets indexable production metadata', () => {
    renderPage()

    expect(document.title).toBe('確率計算 | HLSieve DB')
    expect(
      document.head.querySelector('meta[name="description"]'),
    ).toHaveAttribute('content', expect.stringContaining('現在の山札枚数'))
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'index,follow',
    )
    expect(
      document.head.querySelector('link[rel="canonical"]'),
    ).toHaveAttribute('href', `${SITE_ORIGIN}/probability`)
  })
})
