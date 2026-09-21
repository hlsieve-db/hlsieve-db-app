import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'

import {
  ACCOUNT_NAV_ITEM,
  activeNavigationGroup,
  NAV_GROUPS,
  UPDATES_NAV_ITEM,
  type NavigationGroupKey,
} from '../domain/navigation/navigation'
import type { ThemePreference } from '../domain/theme/theme'
import { useAuth } from '../auth/useAuth'
import { useTheme } from '../hooks/useTheme'

function ThemeControl({
  preference,
  setPreference,
}: {
  preference: ThemePreference
  setPreference: (preference: ThemePreference) => void
}) {
  return (
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
  )
}

export function AppNavigation() {
  const { preference, setPreference } = useTheme()
  // Hidden until a deployment is actually set up for accounts, so nobody is
  // led to a page that can only tell them the feature is unavailable.
  const { isCloudSyncAvailable } = useAuth()
  const location = useLocation()
  const locationKey = `${location.pathname}${location.search}`
  const [openGroupState, setOpenGroupState] = useState<{
    key: NavigationGroupKey
    locationKey: string
  }>()
  const [mobileOpenLocation, setMobileOpenLocation] = useState<string>()
  const rootRef = useRef<HTMLDivElement>(null)
  const mobileButtonRef = useRef<HTMLButtonElement>(null)
  const lastGroupButtonRef = useRef<HTMLButtonElement | undefined>(undefined)
  const activeGroup = activeNavigationGroup(location.pathname)
  const openGroup =
    openGroupState?.locationKey === locationKey ? openGroupState.key : undefined
  const mobileOpen = mobileOpenLocation === locationKey

  useEffect(() => {
    const closeFromOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenGroupState(undefined)
        setMobileOpenLocation(undefined)
      }
    }
    const closeFromEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (mobileOpen) mobileButtonRef.current?.focus()
      else if (openGroup) lastGroupButtonRef.current?.focus()
      setOpenGroupState(undefined)
      setMobileOpenLocation(undefined)
    }
    document.addEventListener('pointerdown', closeFromOutside)
    document.addEventListener('keydown', closeFromEscape)
    return () => {
      document.removeEventListener('pointerdown', closeFromOutside)
      document.removeEventListener('keydown', closeFromEscape)
    }
  }, [mobileOpen, openGroup])

  return (
    <>
      <a className="skip-link" href="#main-content">
        本文へスキップ
      </a>
      <div className="app-navigation" ref={rootRef}>
        <div className="site-branding">
          <Link
            className="site-brand"
            to="/cards"
            onClick={() => {
              setOpenGroupState(undefined)
              setMobileOpenLocation(undefined)
            }}
          >
            <img src="/hlsieve-mark.svg" alt="" aria-hidden="true" />
            <span>HLSieve DB</span>
          </Link>
          <span className="site-brand__subtitle" aria-hidden="true">
            ホロライブOCGカード検索DB
          </span>
        </div>

        <button
          ref={mobileButtonRef}
          type="button"
          className="app-navigation__menu-button"
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation-panel"
          onClick={() => {
            setOpenGroupState(undefined)
            setMobileOpenLocation(mobileOpen ? undefined : locationKey)
          }}
        >
          <span className="app-navigation__menu-icon" aria-hidden="true">
            ☰
          </span>
          <span className="app-navigation__menu-label">メニュー</span>
        </button>

        <div className="app-navigation__controls">
          <nav
            className="primary-navigation primary-navigation--desktop"
            aria-label="メインナビゲーション"
          >
            {NAV_GROUPS.map((group) => {
              const expanded = openGroup === group.key
              const active = activeGroup === group.key
              return (
                <div className="primary-navigation__group" key={group.key}>
                  <button
                    type="button"
                    className={active ? 'is-active' : undefined}
                    aria-expanded={expanded}
                    aria-controls={`navigation-${group.key}`}
                    aria-current={active ? 'page' : undefined}
                    onClick={(event) => {
                      lastGroupButtonRef.current = event.currentTarget
                      setOpenGroupState(
                        expanded ? undefined : { key: group.key, locationKey },
                      )
                    }}
                  >
                    {group.label}
                    <span aria-hidden="true">▾</span>
                  </button>
                  {expanded && (
                    <div
                      id={`navigation-${group.key}`}
                      className="primary-navigation__dropdown"
                    >
                      {group.items.map((item) => (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          onClick={() => setOpenGroupState(undefined)}
                        >
                          {item.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            <NavLink
              className="primary-navigation__updates"
              to="/updates"
              onClick={() => setOpenGroupState(undefined)}
            >
              {UPDATES_NAV_ITEM.label}
            </NavLink>
            {isCloudSyncAvailable && (
              <NavLink
                className="primary-navigation__updates"
                to={ACCOUNT_NAV_ITEM.to}
                onClick={() => setOpenGroupState(undefined)}
              >
                {ACCOUNT_NAV_ITEM.label}
              </NavLink>
            )}
          </nav>

          <ThemeControl preference={preference} setPreference={setPreference} />
        </div>

        {mobileOpen && (
          <nav
            id="mobile-navigation-panel"
            className="primary-navigation primary-navigation--mobile"
            aria-label="モバイルメニュー"
          >
            {NAV_GROUPS.map((group) => (
              <section key={group.key} aria-labelledby={`mobile-${group.key}`}>
                <h2
                  id={`mobile-${group.key}`}
                  className={
                    activeGroup === group.key ? 'is-active' : undefined
                  }
                >
                  {group.label}
                </h2>
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpenLocation(undefined)}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </section>
            ))}
            <section aria-labelledby="mobile-other">
              <h2
                id="mobile-other"
                className={
                  location.pathname === UPDATES_NAV_ITEM.to ||
                  (isCloudSyncAvailable &&
                    location.pathname === ACCOUNT_NAV_ITEM.to)
                    ? 'is-active'
                    : undefined
                }
              >
                その他
              </h2>
              <NavLink
                to={UPDATES_NAV_ITEM.to}
                onClick={() => setMobileOpenLocation(undefined)}
              >
                {UPDATES_NAV_ITEM.label}
              </NavLink>
              {isCloudSyncAvailable && (
                <NavLink
                  to={ACCOUNT_NAV_ITEM.to}
                  onClick={() => setMobileOpenLocation(undefined)}
                >
                  {ACCOUNT_NAV_ITEM.label}
                </NavLink>
              )}
            </section>
          </nav>
        )}
      </div>
    </>
  )
}
