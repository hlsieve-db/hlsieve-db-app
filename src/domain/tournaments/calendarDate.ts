const DAY_MILLISECONDS = 86_400_000

function assertEpochDay(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error('Calendar date epoch day is invalid.')
  }
}

export function parseCalendarDate(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new Error('Calendar date is invalid.')
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const epochDay = Date.UTC(year, month - 1, day) / DAY_MILLISECONDS
  if (
    !Number.isSafeInteger(epochDay) ||
    formatCalendarDate(epochDay) !== value
  ) {
    throw new Error('Calendar date is invalid.')
  }
  return epochDay
}

export function formatCalendarDate(epochDay: number): string {
  assertEpochDay(epochDay)
  return new Date(epochDay * DAY_MILLISECONDS).toISOString().slice(0, 10)
}

export function addCalendarDays(value: string, days: number): string {
  if (!Number.isSafeInteger(days)) {
    throw new Error('Calendar day offset is invalid.')
  }
  return formatCalendarDate(parseCalendarDate(value) + days)
}

export function getMondayWeekStart(value: string): string {
  const epochDay = parseCalendarDate(value)
  const mondayOffset = (((epochDay + 3) % 7) + 7) % 7
  return formatCalendarDate(epochDay - mondayOffset)
}

export function getSundayWeekEnd(value: string): string {
  return addCalendarDays(getMondayWeekStart(value), 6)
}
