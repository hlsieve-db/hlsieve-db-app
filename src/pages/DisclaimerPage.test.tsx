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
  it('states its unofficial status and does not grant permission over third-party works', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: '利用条件' })).toBeVisible()
    expect(screen.getByText(/非公式のファンメイドツール/)).toBeVisible()
    expect(
      screen.getByText(/権利者が運営・提供・公認するサービスではありません/),
    ).toBeVisible()
    expect(
      screen.getByText(
        /第三者権利物について利用許諾を与える立場にはありません/,
      ),
    ).toBeVisible()
    expect(
      screen.getByText(/各権利者が定める利用規約、ガイドライン/),
    ).toBeVisible()
  })

  it('does not prohibit commercial use solely because revenue is generated', () => {
    renderPage()
    expect(
      screen.getByRole('heading', { name: '4. 営利目的での利用について' }),
    ).toBeVisible()
    expect(screen.getByText(/営利・非営利を問わず禁止しません/)).toBeVisible()
    expect(
      screen.getByText(/収益が発生することを理由として、その利用を一律に禁止/),
    ).toBeVisible()
  })

  it('prohibits cloning, mass redistribution, and disruptive access', () => {
    renderPage()
    expect(
      screen.getByText(
        /別サービスとして再配布・再公開する行為は認められません/,
      ),
    ).toBeVisible()
    expect(
      screen.getByText(/実質的に同一のデータベースやサービスを構築・公開/),
    ).toBeVisible()
    expect(screen.getByText(/不正アクセス、脆弱性の悪用/)).toBeVisible()
    expect(screen.getByText(/スクレイピング、クローリング/)).toBeVisible()
  })

  it('removes the former free-versus-paid usage rules', () => {
    renderPage()
    const pageText = document.body.textContent ?? ''
    expect(pageText).not.toContain('営利目的の活動は禁止します')
    expect(pageText).not.toContain('無料コンテンツで許容する例')
    expect(pageText).not.toContain('禁止する例')
    expect(pageText).not.toContain('有料note')
    expect(pageText).not.toContain('有料教材')
    expect(pageText).not.toContain('直接または間接的に収益を得る目的')
    expect(pageText).not.toContain('判断が難しい場合は利用をお控えください')
  })

  it('covers accuracy, liability, service changes, and contact guidance', () => {
    renderPage()
    expect(screen.getByText(/正確性、完全性、最新性を保証/)).toBeVisible()
    expect(screen.getByText(/公式情報を優先/)).toBeVisible()
    expect(
      screen.getByText(/法令上責任を負う場合を除き、責任を負いません/),
    ).toBeVisible()
    expect(screen.getByText(/公開停止または運営終了を行う場合/)).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'お問い合わせページ' }),
    ).toHaveAttribute('href', '/contact')
  })

  it('uses canonical noindex,follow metadata', () => {
    renderPage()
    expect(document.title).toBe('利用条件 | HLSieve DB')
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
