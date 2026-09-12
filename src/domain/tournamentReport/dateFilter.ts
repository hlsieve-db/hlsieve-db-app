import type { SavedTournamentReport } from './savedReport'

export type TournamentStatsDateFilter =
  | { type: 'all' }
  | { type: 'last30' }
  | { type: 'last90' }
  | { type: 'thisYear' }
  | { type: 'custom'; startDate: string; endDate: string }

export type TournamentStatsDateFilterResult = {
  reports: SavedTournamentReport[]
  missingEventDateCount: number
  label: string
  error?: string
}

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MILLISECONDS = 86_400_000

function dateOnlyToOrdinal(value: string): number | undefined {
  const match = DATE_ONLY_PATTERN.exec(value)
  if (!match) return undefined
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const milliseconds = Date.UTC(year, month - 1, day)
  const date = new Date(milliseconds)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined
  }
  return Math.floor(milliseconds / DAY_MILLISECONDS)
}

function formatDateOnly(value: string): string {
  return value.replaceAll('-', '/')
}

export function localTodayDateOnly(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function filterTournamentReportsByDate({
  reports,
  filter,
  today,
}: {
  reports: readonly SavedTournamentReport[]
  filter: TournamentStatsDateFilter
  today: string
}): TournamentStatsDateFilterResult {
  if (filter.type === 'all') {
    return {
      reports: [...reports],
      missingEventDateCount: 0,
      label: '全期間',
    }
  }

  const todayOrdinal = dateOnlyToOrdinal(today)
  if (todayOrdinal === undefined) {
    return {
      reports: [],
      missingEventDateCount: 0,
      label: '',
      error: '基準日が正しくありません。',
    }
  }

  let startOrdinal: number
  let endOrdinal: number
  let label: string
  if (filter.type === 'last30') {
    startOrdinal = todayOrdinal - 29
    endOrdinal = todayOrdinal
    label = '直近30日'
  } else if (filter.type === 'last90') {
    startOrdinal = todayOrdinal - 89
    endOrdinal = todayOrdinal
    label = '直近90日'
  } else if (filter.type === 'thisYear') {
    startOrdinal = dateOnlyToOrdinal(`${today.slice(0, 4)}-01-01`) as number
    endOrdinal = todayOrdinal
    label = '今年'
  } else {
    if (!filter.startDate || !filter.endDate) {
      return {
        reports: [],
        missingEventDateCount: reports.filter(
          (saved) => !saved.report.eventDate,
        ).length,
        label: '期間指定',
        error: '開始日と終了日を入力してください。',
      }
    }
    const customStart = dateOnlyToOrdinal(filter.startDate)
    const customEnd = dateOnlyToOrdinal(filter.endDate)
    if (customStart === undefined || customEnd === undefined) {
      return {
        reports: [],
        missingEventDateCount: 0,
        label: '期間指定',
        error: '開始日と終了日に正しい日付を入力してください。',
      }
    }
    if (customStart > customEnd) {
      return {
        reports: [],
        missingEventDateCount: 0,
        label: '期間指定',
        error: '開始日は終了日以前の日付を指定してください。',
      }
    }
    startOrdinal = customStart
    endOrdinal = customEnd
    label = `${formatDateOnly(filter.startDate)} ～ ${formatDateOnly(filter.endDate)}`
  }

  const missingEventDateCount = reports.filter(
    (saved) => !saved.report.eventDate,
  ).length
  return {
    reports: reports.filter((saved) => {
      const eventDate = saved.report.eventDate
      if (!eventDate) return false
      const ordinal = dateOnlyToOrdinal(eventDate)
      return (
        ordinal !== undefined &&
        ordinal >= startOrdinal &&
        ordinal <= endOrdinal
      )
    }),
    missingEventDateCount,
    label,
  }
}
