import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import type { CardPipelineDryRunResult } from '../audit/types'
import { serializeDataFile } from '../generate/serializeDataFile'
import { validateCardsSnapshotText } from './validateCardsSnapshot'

export type PublishFileOperations = {
  mkdir: typeof mkdir
  readFile: typeof readFile
  rename: typeof rename
  unlink: typeof unlink
  writeFile: typeof writeFile
}

export type PublishCardsSnapshotOptions = {
  outputPath: string
  fileOperations?: PublishFileOperations
  createTemporaryId?: () => string
}

export type PublishCardsSnapshotResult =
  | {
      ok: true
      outputPath: string
      cardCount: number
      uniqueCardNumbers: number
      dataVersion: string
      bytes: number
      memoryMatchesWritten: true
    }
  | { ok: false; errors: string[] }

const defaultFileOperations: PublishFileOperations = {
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
}

export async function publishCardsSnapshot(
  pipeline: CardPipelineDryRunResult,
  options: PublishCardsSnapshotOptions,
): Promise<PublishCardsSnapshotResult> {
  if (!pipeline.report.isPublishable || !pipeline.artifacts) {
    return {
      ok: false,
      errors: ['Pipeline audit did not produce publishable artifacts.'],
    }
  }

  const serialized = serializeDataFile(pipeline.artifacts.cardsDataFile)
  if (!serialized.ok) {
    return {
      ok: false,
      errors: serialized.errors.map((error) => error.message),
    }
  }
  if (serialized.value !== pipeline.artifacts.serializedCards) {
    return {
      ok: false,
      errors: ['Pipeline cards artifact and serialized output differ.'],
    }
  }
  const memoryValidation = validateCardsSnapshotText(serialized.value)
  if (!memoryValidation.ok) return memoryValidation

  const operations = options.fileOperations ?? defaultFileOperations
  const directory = dirname(options.outputPath)
  const temporaryPath = join(
    directory,
    `.${basename(options.outputPath)}.${options.createTemporaryId?.() ?? randomUUID()}.tmp`,
  )
  let promoted = false
  try {
    await operations.mkdir(directory, { recursive: true })
    await operations.writeFile(temporaryPath, serialized.value, {
      encoding: 'utf8',
      flag: 'wx',
    })
    const temporaryContents = await operations.readFile(temporaryPath, 'utf8')
    const temporaryValidation = validateCardsSnapshotText(temporaryContents)
    if (!temporaryValidation.ok) return temporaryValidation
    if (temporaryContents !== serialized.value) {
      return { ok: false, errors: ['Temporary file differs from memory.'] }
    }

    await operations.rename(temporaryPath, options.outputPath)
    promoted = true
    const publishedContents = await operations.readFile(
      options.outputPath,
      'utf8',
    )
    const publishedValidation = validateCardsSnapshotText(publishedContents)
    if (!publishedValidation.ok) return publishedValidation
    if (publishedContents !== serialized.value) {
      return { ok: false, errors: ['Published file differs from memory.'] }
    }

    const cards = publishedValidation.value.cards
    return {
      ok: true,
      outputPath: options.outputPath,
      cardCount: cards.length,
      uniqueCardNumbers: new Set(cards.map((card) => card.cardNumber)).size,
      dataVersion: publishedValidation.value.dataVersion,
      bytes: Buffer.byteLength(publishedContents),
      memoryMatchesWritten: true,
    }
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : String(error)],
    }
  } finally {
    if (!promoted) {
      try {
        await operations.unlink(temporaryPath)
      } catch {
        // The temporary file may not have been created.
      }
    }
  }
}
