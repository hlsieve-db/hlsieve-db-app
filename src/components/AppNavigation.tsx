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
      <div className="site-branding">
        <Link className="site-brand" to="/cards">
          <img src="/hlsieve-mark.svg" alt="" aria-hidden="true" />
          <span>HLSieve DB</span>
        </Link>
        <span className="site-brand__subtitle" aria-hidden="true">
          ホロライブOCGカード検索DB
        </span>
      </div>
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
          <NavLink to="/probability">確率計算</NavLink>
          <NavLink to="/mulligan">マリガン計算</NavLink>
          <NavLink to="/swiss">スイス計算</NavLink>
          <NavLink to="/tournament-report">大会戦績</NavLink>
          <NavLink to="/updates">更新履歴</NavLink>
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
