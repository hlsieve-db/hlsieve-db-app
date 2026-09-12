import { NavLink } from 'react-router-dom'

export function TournamentLocalNavigation() {
  return (
    <nav className="tournament-local-navigation" aria-label="大会戦績メニュー">
      <NavLink to="/tournament-report">大会戦績作成</NavLink>
      <NavLink to="/tournament-history">大会戦績履歴</NavLink>
      <NavLink to="/tournament-stats">大会戦績統計</NavLink>
    </nav>
  )
}
