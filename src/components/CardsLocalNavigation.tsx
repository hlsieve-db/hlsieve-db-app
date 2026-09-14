import { NavLink } from 'react-router-dom'

const LINKS = [
  { to: '/cards', label: 'カード検索' },
  { to: '/favorites', label: 'お気に入り' },
  { to: '/recent', label: '最近見たカード' },
] as const

export function CardsLocalNavigation() {
  return (
    <nav className="cards-local-navigation" aria-label="カード関連">
      {LINKS.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          className={({ isActive }) => (isActive ? 'is-active' : undefined)}
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  )
}
