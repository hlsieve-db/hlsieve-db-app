import { Link } from 'react-router-dom'

export function AppNavigation() {
  return (
    <div className="app-navigation">
      <Link className="site-brand" to="/cards">
        HLSieve DB
      </Link>
      <nav aria-label="メインナビゲーション">
        <Link to="/cards">Cards</Link>
        <Link to="/decks">Decks</Link>
      </nav>
    </div>
  )
}
