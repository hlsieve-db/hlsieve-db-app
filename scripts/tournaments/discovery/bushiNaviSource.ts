import type { Page } from 'playwright'

import { discoverBushiNaviResultIds } from '../collector/bushiNavi'
import { getTournamentSeriesConfig } from '../collector/seriesConfig'
import type { TournamentDiscoverySource } from './core'

export function createBushiNaviDiscoverySource(
  page: Page,
  delayMs?: number,
): TournamentDiscoverySource {
  return {
    query: (seriesId, date) =>
      discoverBushiNaviResultIds(
        page,
        getTournamentSeriesConfig(seriesId),
        date,
        delayMs,
      ),
  }
}
