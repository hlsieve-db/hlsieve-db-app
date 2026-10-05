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
  const venueName = event.venue.name.trim()

  return (
    <tr>
      <td>
        <time dateTime={event.date}>{event.date}</time>
      </td>
      <th scope="row" className="tournament-table__venue">
        <Link to={`/tournaments/${encodeURIComponent(event.id)}`}>
          {venueName || '大会詳細を見る'}
        </Link>
      </th>
      <td className="tournament-table__winner">{winnerOshiName ?? '—'}</td>
      <td>{tournamentTypeLabel(event.tournament.type)}</td>
      <td>
        {event.tournament.environment
          ? tournamentEnvironmentLabel(event.tournament.environment)
          : '—'}
      </td>
      <td>{event.venue.prefecture ?? '—'}</td>
      <td>
        {event.participantCount !== undefined
          ? `${event.participantCount}人`
          : '—'}
      </td>
      <td>{event.resultCount}件</td>
    </tr>
  )
}
