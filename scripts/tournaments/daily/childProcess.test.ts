import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

import { npmScriptInvocation, runNpmScript } from './childProcess'

function childProcess() {
  return new EventEmitter()
}

describe('Tournament Daily child process', () => {
  it('runs the npm CLI through Node on Windows without a shell', () => {
    expect(
      npmScriptInvocation({
        script: 'tournaments:queue',
        args: ['process', '--max', '10'],
        cwd: 'C:\\repo',
        platform: 'win32',
        nodePath: 'C:\\node.exe',
        npmCliPath: 'C:\\npm-cli.js',
      }),
    ).toEqual({
      command: 'C:\\node.exe',
      args: [
        'C:\\npm-cli.js',
        'run',
        'tournaments:queue',
        '--',
        'process',
        '--max',
        '10',
      ],
      options: { cwd: 'C:\\repo', stdio: 'inherit', shell: false },
    })
  })

  it('keeps the existing direct npm contract outside Windows', () => {
    expect(
      npmScriptInvocation({
        script: 'tournaments:queue',
        args: ['process'],
        cwd: '/repo',
        platform: 'linux',
      }),
    ).toEqual({
      command: 'npm',
      args: ['run', 'tournaments:queue', '--', 'process'],
      options: { cwd: '/repo', stdio: 'inherit', shell: false },
    })
  })

  it('keeps arguments separate and preserves cwd and inherited output', () => {
    const invocation = npmScriptInvocation({
      script: 'tournaments:queue',
      args: ['process', 'value & echo unsafe'],
      cwd: '/exact/repo',
      platform: 'linux',
    })
    expect(invocation.command).toBe('npm')
    expect(invocation.args).toContain('value & echo unsafe')
    expect(invocation.options).toEqual({
      cwd: '/exact/repo',
      stdio: 'inherit',
      shell: false,
    })
  })

  it('resolves only after a successful exit', async () => {
    const child = childProcess()
    const spawn = vi.fn(() => child) as never
    const running = runNpmScript(
      { script: 'test', args: [], cwd: '/repo', platform: 'linux' },
      spawn,
    )
    child.emit('exit', 0, null)
    await expect(running).resolves.toBeUndefined()
  })

  it.each([
    [
      'spawn error',
      (child: EventEmitter) => child.emit('error', new Error('EINVAL')),
    ],
    ['non-zero exit', (child: EventEmitter) => child.emit('exit', 2, null)],
    [
      'signal termination',
      (child: EventEmitter) => child.emit('exit', null, 'SIGTERM'),
    ],
  ])('rejects %s', async (_label, finish) => {
    const child = childProcess()
    const spawn = vi.fn(() => child) as never
    const running = runNpmScript(
      { script: 'test', args: [], cwd: '/repo', platform: 'linux' },
      spawn,
    )
    finish(child)
    await expect(running).rejects.toThrow()
  })

  it('fails safely when Windows npm CLI metadata is unavailable', () => {
    expect(() =>
      npmScriptInvocation({
        script: 'test',
        args: [],
        cwd: 'C:\\repo',
        platform: 'win32',
        nodePath: 'C:\\node.exe',
        npmCliPath: '',
      }),
    ).toThrow('Windows npm CLI path is unavailable.')
  })
})
