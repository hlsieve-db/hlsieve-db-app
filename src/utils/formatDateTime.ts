const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** 2026/09/23 09:15, in the reporter's own time zone. */
export function formatDateTime(value: string): string {
  return DATE_TIME_FORMATTER.format(new Date(value))
}
