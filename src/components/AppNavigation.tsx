import { Link, NavLink, useLocation } from 'react-router-dom'

import type { ThemePreference } from '../domain/theme/theme'
import { useTheme } from '../hooks/useTheme'

export function AppNavigation() {
  const { preference, setPreference } = useTheme()
  const location = useLocation()
  const isDeckSection =
    location.pathname.startsWith('/decks') ||
    location.pathname === '/deck/share'

  return (
    <div className="app-navigation">
      <Link className="site-brand" to="/cards">
        <img src="/hlsieve-mark.svg" alt="" aria-hidden="true" />
        <span>HLSieve DB</span>
      </Link>
      <div className="app-navigation__controls">
        <nav aria-label="メインナビゲーション">
          <NavLink to="/cards">Cards</NavLink>
          <Link
            to="/decks"
            className={isDeckSection ? 'active' : undefined}
            aria-current={isDeckSection ? 'page' : undefined}
          >
            Decks
          </Link>
        </nav>
        <label className="theme-control" htmlFor="theme-preference">
          <span>テーマ</span>
          <select
            id="theme-preference"
            value={preference}
            onChange={(event) =>
              setPreference(event.currentTarget.value as ThemePreference)
            }
          >
            <option value="system">システム</option>
            <option value="light">ライト</option>
            <option value="dark">ダーク</option>
          </select>
        </label>
      </div>
    </div>
  )
}
