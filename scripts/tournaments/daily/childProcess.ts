import { spawn, type SpawnOptions } from 'node:child_process'

type Spawn = typeof spawn

export type NpmScriptInvocation = {
  command: string
  args: string[]
  options: SpawnOptions
}

export type RunNpmScriptOptions = {
  script: string
  args: readonly string[]
  cwd: string
  platform?: NodeJS.Platform
  nodePath?: string
  npmCliPath?: string
}

export function npmScriptInvocation(
  options: RunNpmScriptOptions,
): NpmScriptInvocation {
  const npmArgs = ['run', options.script, '--', ...options.args]
  const spawnOptions: SpawnOptions = {
    cwd: options.cwd,
    stdio: 'inherit',
    shell: false,
  }
  if ((options.platform ?? process.platform) !== 'win32') {
    return { command: 'npm', args: npmArgs, options: spawnOptions }
  }
  const npmCliPath = options.npmCliPath ?? process.env.npm_execpath
  if (!npmCliPath) {
    throw new Error('Windows npm CLI path is unavailable.')
  }
  return {
    command: options.nodePath ?? process.execPath,
    args: [npmCliPath, ...npmArgs],
    options: spawnOptions,
  }
}

export async function runNpmScript(
  options: RunNpmScriptOptions,
  spawnProcess: Spawn = spawn,
): Promise<void> {
  const invocation = npmScriptInvocation(options)
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawnProcess(
      invocation.command,
      invocation.args,
      invocation.options,
    )
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`npm script terminated by ${signal}.`))
      } else if (code === 0) {
        resolvePromise()
      } else {
        reject(new Error(`npm script exited ${String(code)}.`))
      }
    })
  })
}
