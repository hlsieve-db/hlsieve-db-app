import { Link } from 'react-router-dom'

import {
  CARD_DATA_UPDATE_HISTORY,
  formatUpdateDate,
  latestFirst,
} from '../domain/updates/history'
import type { CardDataUpdateEntry } from '../domain/updates/types'

type LatestUpdateNoticeProps = {
  entries?: readonly CardDataUpdateEntry[]
}

export function LatestUpdateNotice({
  entries = CARD_DATA_UPDATE_HISTORY,
}: LatestUpdateNoticeProps) {
  const latest = latestFirst(entries)[0]
  if (!latest) return null

  return (
    <aside className="latest-update-notice" aria-label="最新のカードデータ更新">
      <div>
        <p className="latest-update-notice__date">
          カードデータ更新 {formatUpdateDate(latest.publishedAt)}
        </p>
        <p>{latest.summary}</p>
      </div>
      <Link to="/updates">更新内容を見る</Link>
    </aside>
  )
}
