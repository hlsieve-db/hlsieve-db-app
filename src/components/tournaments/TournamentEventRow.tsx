import { Link } from 'react-router-dom'

import type { TournamentIndexFile } from '../../domain/tournaments/types'
import {
  tournamentEnvironmentLabel,
  tournamentTypeLabel,
} from '../../domain/tournaments/ui'

type TournamentIndexEvent = TournamentIndexFile['events'][number]

type TournamentEventRowProps = {
  event: TournamentIndexEvent
  winnerOshiName?: string
}

export function TournamentEventRow({
  event,
  winnerOshiName,
}: TournamentEventRowProps) {
  const venue = [event.venue.prefecture, event.venue.name]
    .filter(Boolean)
    .join('／')

  return (
    <tr>
      <td>
        <time dateTime={event.date}>{event.date}</time>
      </td>
      <th scope="row" className="tournament-table__event">
        <Link to={`/tournaments/${encodeURIComponent(event.id)}`}>
          {event.tournament.seriesName}
        </Link>
      </th>
      <td>{tournamentTypeLabel(event.tournament.type)}</td>
      <td>
        {event.tournament.environment
          ? tournamentEnvironmentLabel(event.tournament.environment)
          : '—'}
      </td>
      <td className="tournament-table__venue" title={venue}>
        {venue}
      </td>
      <td>
        {event.participantCount !== undefined
          ? `${event.participantCount}人`
          : '—'}
      </td>
      <td>{event.resultCount}件</td>
      <td>{winnerOshiName ?? '—'}</td>
    </tr>
  )
}
