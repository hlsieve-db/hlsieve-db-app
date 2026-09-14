const VIEWED_AT_FORMATTER = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export function formatViewedAt(value: string): string {
  return VIEWED_AT_FORMATTER.format(new Date(value))
}
