import { NavLink } from 'react-router-dom'

import {
  NAV_GROUPS,
  type NavigationGroupKey,
} from '../domain/navigation/navigation'

const LABELS: Record<NavigationGroupKey, string> = {
  cards: 'カードメニュー',
  decks: 'デッキメニュー',
  tournament: '大会戦績メニュー',
  tools: 'ツールメニュー',
}

export function SectionLocalNavigation({
  groupKey,
}: {
  groupKey: NavigationGroupKey
}) {
  const group = NAV_GROUPS.find((candidate) => candidate.key === groupKey)!
  return (
    <nav className="section-local-navigation" aria-label={LABELS[groupKey]}>
      {group.items.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.to === '/cards'}>
          {item.shortLabel}
        </NavLink>
      ))}
    </nav>
  )
}
