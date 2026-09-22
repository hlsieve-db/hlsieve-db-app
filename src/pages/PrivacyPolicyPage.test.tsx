import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { PrivacyPolicyPage } from './PrivacyPolicyPage'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/privacy']}>
      <PrivacyPolicyPage />
    </MemoryRouter>,
  )
}

const pageText = () => document.body.textContent ?? ''

describe('PrivacyPolicyPage', () => {
  it('introduces itself as the policy for this service', () => {
    renderPage()
    expect(
      screen.getByRole('heading', { name: 'プライバシーポリシー' }),
    ).toBeVisible()
    expect(screen.getByText(/HLSieve[\s\S]*利用者情報の取扱い/)).toBeVisible()
  })

  it('describes what Google sign-in provides and what it does not', () => {
    renderPage()
    expect(screen.getByText(/Googleアカウントに関連する識別子/)).toBeVisible()
    expect(screen.getByText(/パスワードは取得も保存もしません/)).toBeVisible()
    expect(
      screen.getByText(/Googleドライブ、Gmail、カレンダー、連絡先/),
    ).toBeVisible()
    expect(
      screen.getByText(/認証に必要のないGoogle APIのスコープは要求しません/),
    ).toBeVisible()
    expect(
      screen.getByText(/Googleユーザーデータを販売することはありません/),
    ).toBeVisible()
  })

  it('explains the browser-local stores and that they are not uploaded', () => {
    renderPage()
    expect(
      screen.getByText(/IndexedDBおよびlocalStorageに保存され/),
    ).toBeVisible()
    expect(
      screen.getByText(
        /ログインしただけでは、既存のデッキ等が自動的にクラウドへ送信されることはありません/,
      ),
    ).toBeVisible()
    const stored = screen
      .getByRole('heading', { name: '4. ブラウザ内に保存されるデータ' })
      .parentElement?.querySelector('ul')
    expect(
      [...(stored?.querySelectorAll('li') ?? [])].map((li) => li.textContent),
    ).toEqual([
      'デッキ',
      'お気に入りカード',
      '保存した検索条件',
      '大会レポート',
      '最近見たカード',
      '選択中のデッキ',
      'テーマ等の表示設定',
    ])
  })

  // A short share is the one thing that sends deck data to a server, so the
  // policy has to say so before the feature ships.
  describe('the short share disclosure', () => {
    it('says the upload happens only on an explicit action', () => {
      renderPage()
      expect(
        screen.getByRole('heading', {
          name: '5. 短い共有リンクを作成した場合',
        }),
      ).toBeVisible()
      expect(
        screen.getByText(
          /明示的に行った場合に限り[\s\S]*クラウド上に保存します/,
        ),
      ).toBeVisible()
    })

    it('says what the snapshot contains', () => {
      renderPage()
      expect(screen.getByText(/デッキ名、カード番号、枚数など/)).toBeVisible()
    })

    it('says account information is not included', () => {
      renderPage()
      expect(
        screen.getByText(
          /アカウント情報は、共有用スナップショットには含めません/,
        ),
      ).toBeVisible()
    })

    it('says anyone holding the link can view it, without overstating it', () => {
      renderPage()
      expect(screen.getByText(/短い共有リンクを知っている方は/)).toBeVisible()
      expect(
        screen.getByText(/秘密の情報を保管するための手段として提供するもので/),
      ).toBeVisible()
    })

    it('says there is no self-service deletion yet, and points at contact', () => {
      renderPage()
      const paragraph = screen.getByText(
        /共有用スナップショットを削除するための専用の画面/,
      )
      expect(paragraph).toBeVisible()
      expect(
        within(paragraph).getByRole('link', { name: 'お問い合わせページ' }),
      ).toHaveAttribute('href', '/contact')
    })

    it('keeps the long share URL described as needing no cloud storage', () => {
      renderPage()
      expect(
        screen.getByText(/従来の共有URLは、クラウドへの保存を必要としません/),
      ).toBeVisible()
    })

    // The sentence was true before short shares and is still true: signing in
    // alone uploads nothing.
    it('keeps the login-alone wording unchanged', () => {
      renderPage()
      expect(
        screen.getByText(
          /ログインしただけでは、既存のデッキ等が自動的にクラウドへ送信されることはありません/,
        ),
      ).toBeVisible()
    })

    it('does not promise the snapshot is kept forever or is private storage', () => {
      renderPage()
      const text = pageText()
      expect(text).not.toContain('永久')
      expect(text).not.toContain('非公開で保管')
      expect(text).not.toContain('安全に保管されます')
    })
  })

  // Cloud Sync is the first thing that sends an ordinary deck to a server, so
  // the policy has to describe it before the feature ships.
  describe('the cloud sync disclosure', () => {
    it('says the upload happens only on an explicit action', () => {
      renderPage()
      expect(
        screen.getByRole('heading', {
          name: '6. クラウド同期を有効にした場合',
        }),
      ).toBeVisible()
      expect(
        screen.getByText(
          /この端末のデッキをクラウドへ保存する操作を明示的に行った場合に限り/,
        ),
      ).toBeVisible()
    })

    it('lists exactly what is stored', () => {
      renderPage()
      expect(
        screen.getByText(
          /デッキのID、デッキ名、カード番号、枚数、および作成日時・更新日時/,
        ),
      ).toBeVisible()
    })

    it('says the decks are isolated per account', () => {
      renderPage()
      expect(
        screen.getByText(/他の利用者が閲覧・変更できないようにしています/),
      ).toBeVisible()
    })

    // The sentence that was true before Cloud Sync and must stay true.
    it('repeats that signing in alone sends nothing', () => {
      renderPage()
      expect(
        screen.getByText(
          /ログインしただけでは、デッキがクラウドへ送信されることはありません/,
        ),
      ).toBeVisible()
    })

    // Restoring downloads, so the policy has to describe that too, including
    // that it overwrites and that it can delete.
    it('describes restoring as an explicit action that can overwrite', () => {
      renderPage()
      expect(
        screen.getByText(
          /「クラウドから復元」も、利用者ご自身が操作した場合にのみ実行します/,
        ),
      ).toBeVisible()
      expect(
        screen.getByText(/同じIDのデッキがクラウドの内容で置き換わり/),
      ).toBeVisible()
    })

    // The rule that keeps restoring non-destructive.
    it('says a deck the cloud does not have is never deleted by restoring', () => {
      renderPage()
      expect(
        screen.getByText(
          /クラウドに存在しないこの端末のデッキは、復元によって削除されることはありません/,
        ),
      ).toBeVisible()
    })

    // Setting up reads both sides before anything moves, which is what stops a
    // second device overwriting an account it has never looked at.
    it('says looking at the setup screen moves nothing', () => {
      renderPage()
      expect(
        screen.getByText(
          /設定を開いて内容を確認している間も、デッキの送信や取り込みは行いません/,
        ),
      ).toBeVisible()
    })

    it('says both sides holding decks leads to a confirmation', () => {
      renderPage()
      expect(
        screen.getByText(
          /両方にデッキがある場合は、どちらの内容を使うかを確認したうえで実行します/,
        ),
      ).toBeVisible()
    })

    // The claim that is now false must not survive anywhere on the page.
    it('no longer claims nothing is downloaded', () => {
      renderPage()
      expect(pageText()).not.toContain(
        'クラウド上のデッキがこの端末へ取り込まれることはありません',
      )
    })

    it('says there is no deletion screen yet, and points at contact', () => {
      renderPage()
      const paragraph = screen.getByText(/クラウドから削除するための専用の画面/)
      expect(paragraph).toBeVisible()
      expect(
        within(paragraph).getByRole('link', { name: 'お問い合わせページ' }),
      ).toHaveAttribute('href', '/contact')
    })

    it('keeps it distinct from the short share snapshot', () => {
      renderPage()
      expect(
        screen.getByText(/短い共有リンクのスナップショットとは別のもの/),
      ).toBeVisible()
    })

    it('no longer describes cloud sync as a future possibility', () => {
      renderPage()
      const text = pageText()
      expect(text).not.toContain('今後クラウド同期機能を提供する場合')
    })
  })

  it('names Supabase as the authentication backend', () => {
    renderPage()
    expect(screen.getByText(/認証の基盤としてSupabaseを利用/)).toBeVisible()
    expect(screen.getByText(/クラウド同期の対象を広げる場合/)).toBeVisible()
  })

  it('links to the contact page rather than inlining an address', () => {
    renderPage()
    const links = screen.getAllByRole('link', {
      name: /お問い合わせ(ページ|フォーム)/,
    })
    expect(links.length).toBeGreaterThan(0)
    links.forEach((link) => expect(link).toHaveAttribute('href', '/contact'))
    expect(pageText()).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/)
  })

  // Every one of these would be a claim the code does not support, and the
  // first two would additionally be promises no service can keep.
  it('makes no claim the implementation cannot back', () => {
    renderPage()
    const text = pageText()
    expect(text).not.toContain('完全に安全')
    expect(text).not.toContain('絶対に漏洩しません')
    expect(text).not.toContain('完全準拠')
    // Cloud Sync is unimplemented, so it may only appear as a future tense.
    expect(text).not.toContain('デッキをクラウドに保存します')
    expect(text).not.toContain('同期データを収集します')
    // No account deletion UI exists yet, so none may be described.
    expect(text).not.toContain('アカウント削除ボタン')
    expect(text).not.toContain('退会手続き')
    // No analytics or tracking is present in the bundle.
    expect(text).not.toContain('アクセス解析')
    expect(text).not.toContain('Googleアナリティクス')
  })

  it('is indexable and canonical, so Google can reach it without signing in', () => {
    renderPage()
    expect(document.title).toBe('プライバシーポリシー | HLSieve DB')
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'index,follow',
    )
    expect(
      document.head.querySelector('link[rel="canonical"]'),
    ).toHaveAttribute('href', 'https://hlsieve.com/privacy')
  })

  it('reuses the shared legal content surface', () => {
    const { container } = renderPage()
    expect(screen.getByLabelText('テーマ')).toBeVisible()
    expect(container.querySelector('.content-surface')).toHaveClass(
      'legal-content',
    )
  })
})
