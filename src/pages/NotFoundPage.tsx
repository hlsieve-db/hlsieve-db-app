import { useEffect } from 'react'
import { Link } from 'react-router-dom'

import { AppNavigation } from '../components/AppNavigation'

export function NotFoundPage() {
  useEffect(() => {
    const previousTitle = document.title
    document.title = 'ページが見つかりません | HLSieve DB'
    return () => {
      document.title = previousTitle
    }
  }, [])

  return (
    <main className="deck-page not-found-page">
      <AppNavigation />
      <section className="status-message">
        <p className="not-found-page__code">404</p>
        <h1>ページが見つかりません</h1>
        <p>URLをご確認いただくか、以下からお探しください。</p>
        <div className="not-found-page__links">
          <Link className="button detail-link-button" to="/cards">
            Cardsへ
          </Link>
          <Link
            className="button button--secondary detail-link-button"
            to="/decks"
          >
            Decksへ
          </Link>
        </div>
      </section>
    </main>
  )
}
