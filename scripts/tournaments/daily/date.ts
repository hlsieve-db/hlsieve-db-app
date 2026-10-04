const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function parseCalendarDate(value: string): string {
  if (!DATE_PATTERN.test(value)) throw new Error('Invalid calendar date.')
  const parsed = new Date(`${value}T00:00:00Z`)
  if (
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error('Invalid calendar date.')
  }
  return value
}

export function yesterdayInTokyo(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  )
  const today = `${values.year}-${values.month}-${values.day}`
  const date = new Date(`${today}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}
