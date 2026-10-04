import { describe, expect, it } from 'vitest'

import { describeTournamentQueueAdd, parseTournamentQueueCli } from './cli'

describe('Tournament queue CLI', () => {
  it('parses add, list, process, publication, and explicit unlock commands', () => {
    expect(parseTournamentQueueCli(['add', '1764903'])).toEqual({
      command: 'add',
      input: '1764903',
    })
    expect(parseTournamentQueueCli(['list'])).toEqual({ command: 'list' })
    expect(parseTournamentQueueCli(['process'])).toEqual({
      command: 'process',
      maxItems: 1,
    })
    expect(parseTournamentQueueCli(['process', '--max', '3'])).toEqual({
      command: 'process',
      maxItems: 3,
    })
    expect(parseTournamentQueueCli(['unlock', '--force'])).toEqual({
      command: 'unlock',
      force: true,
    })
    expect(parseTournamentQueueCli(['refresh-ready', '1764903'])).toEqual({
      command: 'refresh-ready',
      sourceEventId: '1764903',
    })
    expect(parseTournamentQueueCli(['publish', '1764903'])).toEqual({
      command: 'publish',
      sourceEventId: '1764903',
      write: false,
    })
    expect(parseTournamentQueueCli(['publish', '1764903', '--write'])).toEqual({
      command: 'publish',
      sourceEventId: '1764903',
      write: true,
    })
  })

  it('rejects invalid commands and unsafe process limits', () => {
    expect(() => parseTournamentQueueCli(['add'])).toThrow(/Usage/)
    expect(() => parseTournamentQueueCli(['process', '--max', '0'])).toThrow(
      /1 through 10/,
    )
    expect(() => parseTournamentQueueCli(['unknown'])).toThrow(/must be/)
  })

  it('describes the actual add or requeue result', () => {
    expect(describeTournamentQueueAdd(undefined, 'queued')).toBe('added')
    expect(describeTournamentQueueAdd('needs-review', 'queued')).toBe(
      'requeued',
    )
    expect(describeTournamentQueueAdd('published', 'queued')).toBe('requeued')
    expect(describeTournamentQueueAdd('queued', 'queued')).toBe(
      'existing/queued',
    )
    expect(describeTournamentQueueAdd('collecting', 'collecting')).toBe(
      'existing/collecting',
    )
    expect(describeTournamentQueueAdd('waiting-result', 'waiting-result')).toBe(
      'existing/waiting-result',
    )
  })
})
