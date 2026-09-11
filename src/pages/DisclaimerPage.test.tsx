import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { DisclaimerPage } from './DisclaimerPage'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/disclaimer']}>
      <DisclaimerPage />
    </MemoryRouter>,
  )
}

describe('DisclaimerPage', () => {
  it('states its unofficial status and third-party rights attribution', () => {
    renderPage()
    expect(
      screen.getByRole('heading', { name: '免責事項・利用条件' }),
    ).toBeVisible()
    expect(
      screen.getByText(/個人が運営する非公式のファンメイドツール/),
    ).toBeVisible()
    expect(
      screen.getByText(/公式に運営、提供、承認または協賛された/),
    ).toBeVisible()
    expect(
      screen.getByText(/著作物・商標等の権利は、各権利者に帰属/),
    ).toBeVisible()
  })

  it('covers accuracy, official-rule guidance, liability, and external links', () => {
    renderPage()
    expect(screen.getByText(/正確性、完全性、最新性を保証/)).toBeVisible()
    expect(
      screen.getByText(/公式サイト、公式ルールおよび公式Q&A/),
    ).toBeVisible()
    expect(
      screen.getByText(/法令上認められる範囲で運営者は責任を負いません/),
    ).toBeVisible()
    expect(screen.getByText(/外部リンク先の内容やサービス/)).toBeVisible()
  })

  it('distinguishes free introductions from prohibited commercial uses', () => {
    renderPage()
    expect(
      screen.getByRole('heading', { name: '営利目的での利用について' }),
    ).toBeVisible()
    expect(screen.getByText('〇 無料noteでHLSieve DBを紹介する')).toBeVisible()
    expect(screen.getByText(/× 有料noteへ/)).toBeVisible()
    expect(screen.getByText(/× 有料教材や有料会員向けコンテンツ/)).toBeVisible()
    expect(
      screen.getByText(/× HLSieve DBの情報を利用した資料を販売/),
    ).toBeVisible()
  })

  it('does not imply permission over third-party works and handles no contact method', () => {
    renderPage()
    expect(
      screen.getByText(/運営者が利用許諾を与えるものではありません/),
    ).toBeVisible()
    expect(
      screen.getByText(/第三者権利物の利用は、各権利者のルール/),
    ).toBeVisible()
    expect(
      screen.getByText(/現時点では問い合わせ窓口を設けていない/),
    ).toBeVisible()
    expect(
      screen.getByText(/判断が難しい場合は利用をお控えください/),
    ).toBeVisible()
  })

  it('uses canonical noindex,follow metadata', () => {
    renderPage()
    expect(document.title).toBe('免責事項・利用条件 | HLSieve DB')
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex,follow',
    )
    expect(
      document.head.querySelector('link[rel="canonical"]'),
    ).toHaveAttribute('href', 'https://hlsieve.com/disclaimer')
  })

  it('keeps the theme control available on the responsive content surface', () => {
    const { container } = renderPage()
    expect(screen.getByLabelText('テーマ')).toBeVisible()
    expect(container.querySelector('.content-surface')).toHaveClass(
      'legal-content',
    )
  })
})
