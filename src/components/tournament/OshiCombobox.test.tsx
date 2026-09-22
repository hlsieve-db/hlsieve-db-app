import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Card } from '../../domain/cards/types'
import { OshiCombobox } from './OshiCombobox'

function card(
  cardNumber: string,
  name: string,
  overrides: Partial<Card> = {},
): Card {
  return {
    cardNumber,
    name,
    imageUrl: `https://example.test/${cardNumber}.png`,
    cardType: 'oshi',
    colors: ['white'],
    isBuzz: false,
    tags: [],
    isLimited: false,
    abilities: [],
    arts: [],
    batonPass: [],
    effectTags: [],
    criticalColors: [],
    rarities: [],
    products: [],
    illustrators: [],
    qas: [],
    searchText: `${cardNumber} ${name}`,
    ...overrides,
  }
}

const cards = [
  card('hSD01-001', 'ときのそら', { nameReading: 'ときのそら' }),
  card('hSD02-001', 'さくらみこ', { nameReading: 'さくらみこ' }),
  card('hSD03-001', 'AZKi', { nameReading: 'あずき' }),
]

function renderCombobox(
  props: Partial<Parameters<typeof OshiCombobox>[0]> = {},
) {
  const onChange = vi.fn()
  const result = render(
    <OshiCombobox
      label="推しホロメン"
      cards={cards}
      onChange={onChange}
      {...props}
    />,
  )
  return { ...result, onChange }
}

const input = () => screen.getByLabelText('推しホロメン')

describe('oshi input and the on-screen keyboard', () => {
  // A page cannot choose the keyboard. What it can do is avoid asking for a
  // Latin one and avoid the browser's Latin text services.
  it('is a plain Japanese text field', () => {
    renderCombobox()

    expect(input()).toHaveAttribute('type', 'text')
    expect(input()).toHaveAttribute('lang', 'ja')
    expect(input()).toHaveAttribute('inputmode', 'text')
    expect(input()).toHaveAttribute('autocapitalize', 'none')
    expect(input()).toHaveAttribute('autocorrect', 'off')
    expect(input()).toHaveAttribute('spellcheck', 'false')
    expect(input()).toHaveAttribute('autocomplete', 'off')
  })

  // Each of these steers a soft keyboard towards Latin, or refuses Japanese
  // outright. None belongs on a field that takes Japanese names.
  it('carries nothing that would bias the keyboard to Latin', () => {
    renderCombobox()
    const field = input()

    expect(field).not.toHaveAttribute('pattern')
    expect(field.getAttribute('type')).not.toBe('search')
    expect(field.getAttribute('type')).not.toBe('email')
    expect(field.getAttribute('type')).not.toBe('url')
    expect(['email', 'url', 'search', 'numeric', 'tel']).not.toContain(
      field.getAttribute('inputmode'),
    )
  })
})

describe('the keyboard hint', () => {
  it('tells the reader how to reach the Japanese keyboard', () => {
    renderCombobox()

    expect(
      screen.getByText(
        /英字キーボードの場合は、🌐から「日本語かな」を選択してください/,
      ),
    ).toBeInTheDocument()
  })

  it('is described by the input, so it is announced with the field', () => {
    renderCombobox()
    const describedBy = input().getAttribute('aria-describedby')

    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy ?? '')).toHaveTextContent(
      '日本語かな',
    )
  })

  // The page has no way to switch the keyboard, so it must not say it will.
  it('promises no automatic switch', () => {
    renderCombobox()
    const text = document.body.textContent ?? ''

    expect(text).not.toContain('自動')
    expect(text).not.toContain('日本語キーボードが開きます')
    expect(text).not.toContain('切り替わります')
  })

  it('belongs to its own field when several are on the page', () => {
    render(
      <>
        <OshiCombobox label="推しホロメン1" cards={cards} onChange={vi.fn()} />
        <OshiCombobox label="推しホロメン2" cards={cards} onChange={vi.fn()} />
      </>,
    )

    const first = screen
      .getByLabelText('推しホロメン1')
      .getAttribute('aria-describedby')
    const second = screen
      .getByLabelText('推しホロメン2')
      .getAttribute('aria-describedby')

    expect(first).not.toBe(second)
  })
})

// Selecting from the list works without switching keyboard at all, which is
// why the hint is a shortcut rather than a requirement.
describe('the existing behaviour is untouched', () => {
  it('still shows every candidate on focus', () => {
    renderCombobox()
    fireEvent.focus(input())

    expect(screen.getAllByRole('option')).toHaveLength(cards.length)
  })

  it('still filters by reading', () => {
    renderCombobox()
    fireEvent.focus(input())
    fireEvent.change(input(), { target: { value: 'あずき' } })

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveTextContent('AZKi')
  })

  it('still filters by card number', () => {
    renderCombobox()
    fireEvent.focus(input())
    fireEvent.change(input(), { target: { value: 'hSD02' } })

    expect(screen.getAllByRole('option')).toHaveLength(1)
  })

  it('still selects a candidate by tapping it', () => {
    const { onChange } = renderCombobox()
    fireEvent.focus(input())
    fireEvent.click(screen.getByRole('option', { name: /さくらみこ/ }))

    expect(onChange).toHaveBeenCalledWith('hSD02-001')
  })

  it('still offers the clear button once there is a value', () => {
    const { onChange } = renderCombobox({ selectedCardNumber: 'hSD01-001' })
    fireEvent.click(
      screen.getByRole('button', { name: '推しホロメンをクリア' }),
    )

    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('still reports no candidates when nothing matches', () => {
    renderCombobox()
    fireEvent.focus(input())
    fireEvent.change(input(), { target: { value: 'そんなカードはない' } })

    expect(screen.getByText('候補がありません')).toBeVisible()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })
})
