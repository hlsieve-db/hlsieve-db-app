import { AppNavigation } from '../components/AppNavigation'
import { CONTACT_FORM_URL } from '../domain/site/constants'
import { CONTACT_METADATA } from '../domain/site/metadata'
import { useDocumentMetadata } from '../hooks/useDocumentMetadata'

const CONTACT_TOPICS = [
  'カード情報の誤り',
  '公式Q&Aについて',
  '不具合報告',
  'ご要望',
  '権利関係・削除依頼',
  'その他',
]

export function ContactPage() {
  useDocumentMetadata(CONTACT_METADATA)

  return (
    <main className="content-page contact-page">
      <AppNavigation />
      <header className="content-page__header">
        <h1>お問い合わせ</h1>
        <p>HLSieve DBに関するお問い合わせはこちらからお願いします。</p>
      </header>

      <div className="content-surface legal-content contact-page__content">
        <p>
          カード情報の誤り、不具合、ご要望、権利関係・削除依頼などを受け付けています。
        </p>
        <p>
          権利者・関係者の方からの修正・削除等のご連絡もこちらからお願いいたします。
        </p>
        <p>
          内容によっては返信できない場合があります。あらかじめご了承ください。
        </p>

        <section aria-labelledby="contact-topics-heading">
          <h2 id="contact-topics-heading">お問い合わせの例</h2>
          <ul>
            {CONTACT_TOPICS.map((topic) => (
              <li key={topic}>{topic}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="contact-form-heading">
          <h2 id="contact-form-heading">お問い合わせフォーム</h2>
          <p>HLSieve DBは非公式のファンメイドサービスです。</p>
          <p>お問い合わせフォームは外部サービスを利用しています。</p>
          <a
            className="button contact-page__cta"
            href={CONTACT_FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="お問い合わせフォームを開く（外部サイト）"
          >
            お問い合わせフォームを開く ↗
          </a>
        </section>
      </div>
    </main>
  )
}
