import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

export type PreparedPublicationFile = { source: string; destination: string }

export async function publishPreparedFiles(
  files: readonly PreparedPublicationFile[],
): Promise<void> {
  const id = randomUUID()
  const staged: {
    destination: string
    temporary: string
    previous?: string
  }[] = []
  try {
    for (const file of files) {
      const directory = dirname(file.destination)
      await mkdir(directory, { recursive: true })
      const temporary = join(
        directory,
        `.${basename(file.destination)}.${id}.tmp`,
      )
      let previous: string | undefined
      try {
        previous = await readFile(file.destination, 'utf8')
      } catch {
        // A first publication has no previous file.
      }
      const contents = await readFile(file.source, 'utf8')
      await writeFile(temporary, contents, { encoding: 'utf8', flag: 'wx' })
      if ((await readFile(temporary, 'utf8')) !== contents) {
        throw new Error(`Staged file differs from source: ${file.source}`)
      }
      staged.push({ destination: file.destination, temporary, previous })
    }
    for (const file of staged) await rename(file.temporary, file.destination)
  } catch (error) {
    for (const file of staged) {
      if (file.previous === undefined) {
        await rm(file.destination, { force: true })
      } else {
        await writeFile(file.destination, file.previous, 'utf8')
      }
    }
    throw error
  } finally {
    await Promise.all(staged.map((file) => rm(file.temporary, { force: true })))
  }
}
