import { describe, expect, it } from 'vitest'
import {
  addCalendarDays,
  formatCalendarDate,
  getMondayWeekStart,
  getSundayWeekEnd,
  parseCalendarDate,
} from './calendarDate'

describe('tournament calendar dates', () => {
  it.each([
    ['2026-09-21', '2026-09-21', '2026-09-27'],
    ['2026-09-27', '2026-09-21', '2026-09-27'],
    ['2026-10-01', '2026-09-28', '2026-10-04'],
    ['2027-01-03', '2026-12-28', '2027-01-03'],
    ['2024-02-29', '2024-02-26', '2024-03-03'],
  ])('places %s in its Monday-Sunday week', (value, monday, sunday) => {
    expect(getMondayWeekStart(value)).toBe(monday)
    expect(getSundayWeekEnd(value)).toBe(sunday)
  })

  it('round-trips epoch days and adds calendar days across boundaries', () => {
    const value = parseCalendarDate('2026-12-31')
    expect(formatCalendarDate(value)).toBe('2026-12-31')
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addCalendarDays('2024-02-28', 1)).toBe('2024-02-29')
  })

  it.each(['2026-02-29', '2026-13-01', '2026-01-32', 'not-a-date'])(
    'rejects invalid calendar date %s',
    (value) => expect(() => parseCalendarDate(value)).toThrow(),
  )
})
