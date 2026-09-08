import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import type { CardPipelineDryRunResult } from '../audit/types'
import { serializeDataFile } from '../generate/serializeDataFile'
import type { PublishFileOperations } from './publishCardsSnapshot'
import { validateCardPrintingsSnapshotText } from './validateCardPrintingsSnapshot'
import { validateCardsSnapshotText } from './validateCardsSnapshot'

export type PublishCardDataSnapshotsOptions = {
  cardsOutputPath: string
  printingsOutputPath: string
  fileOperations?: PublishFileOperations
  createTemporaryId?: () => string
}

export type PublishCardDataSnapshotsResult =
  | {
      ok: true
      cardsOutputPath: string
      printingsOutputPath: string
      cardCount: number
      printingCount: number
      cardsDataVersion: string
      printingsDataVersion: string
      cardsBytes: number
      printingsBytes: number
      parallelPrintings: number
      nonParallelPrintings: number
      imagePresent: number
      imageMissing: number
    }
  | { ok: false; errors: string[] }

const defaultOperations: PublishFileOperations = {
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
}

async function readExisting(
  operations: PublishFileOperations,
  path: string,
): Promise<string | undefined> {
  try {
    return await operations.readFile(path, 'utf8')
  } catch {
    return undefined
  }
}

async function removeIfPresent(
  operations: PublishFileOperations,
  path: string,
) {
  try {
    await operations.unlink(path)
  } catch {
    // A staging or rollback file may not have been created.
  }
}

async function restore(
  operations: PublishFileOperations,
  path: string,
  previous: string | undefined,
  rollbackPath: string,
) {
  if (previous === undefined) {
    await removeIfPresent(operations, path)
    return
  }
  await operations.writeFile(rollbackPath, previous, {
    encoding: 'utf8',
    flag: 'wx',
  })
  await operations.rename(rollbackPath, path)
}

export async function publishCardDataSnapshots(
  pipeline: CardPipelineDryRunResult,
  options: PublishCardDataSnapshotsOptions,
): Promise<PublishCardDataSnapshotsResult> {
  if (!pipeline.report.isPublishable || !pipeline.artifacts) {
    return {
      ok: false,
      errors: ['Pipeline audit did not produce publishable artifacts.'],
    }
  }

  const cardsSerialized = serializeDataFile(pipeline.artifacts.cardsDataFile)
  const printingsSerialized = serializeDataFile(
    pipeline.artifacts.cardPrintingsDataFile,
  )
  if (!cardsSerialized.ok || !printingsSerialized.ok) {
    return {
      ok: false,
      errors: (!cardsSerialized.ok
        ? cardsSerialized.errors
        : printingsSerialized.errors
      ).map((error) => error.message),
    }
  }
  if (
    cardsSerialized.value !== pipeline.artifacts.serializedCards ||
    printingsSerialized.value !== pipeline.artifacts.serializedCardPrintings
  ) {
    return { ok: false, errors: ['Pipeline serialized artifacts differ.'] }
  }
  const cardsValidation = validateCardsSnapshotText(cardsSerialized.value)
  if (!cardsValidation.ok) return cardsValidation
  const printingsValidation = validateCardPrintingsSnapshotText(
    printingsSerialized.value,
    cardsValidation.value,
  )
  if (!printingsValidation.ok) return printingsValidation

  const operations = options.fileOperations ?? defaultOperations
  const existingCards = await readExisting(operations, options.cardsOutputPath)
  const existingCardsValidation = existingCards
    ? validateCardsSnapshotText(existingCards)
    : undefined
  const cardsToPublish =
    existingCards &&
    existingCardsValidation?.ok &&
    existingCardsValidation.value.dataVersion ===
      cardsValidation.value.dataVersion
      ? existingCards
      : cardsSerialized.value
  const temporaryId = options.createTemporaryId?.() ?? randomUUID()
  const cardsDirectory = dirname(options.cardsOutputPath)
  const printingsDirectory = dirname(options.printingsOutputPath)
  const cardsTemporaryPath = join(
    cardsDirectory,
    `.${basename(options.cardsOutputPath)}.${temporaryId}.tmp`,
  )
  const printingsTemporaryPath = join(
    printingsDirectory,
    `.${basename(options.printingsOutputPath)}.${temporaryId}.tmp`,
  )
  const cardsRollbackPath = `${cardsTemporaryPath}.rollback`
  const printingsRollbackPath = `${printingsTemporaryPath}.rollback`
  let cardsPromoted = false
  let printingsPromoted = false
  let previousCards: string | undefined
  let previousPrintings: string | undefined

  try {
    await operations.mkdir(cardsDirectory, { recursive: true })
    if (printingsDirectory !== cardsDirectory) {
      await operations.mkdir(printingsDirectory, { recursive: true })
    }
    previousCards = existingCards
    previousPrintings = await readExisting(
      operations,
      options.printingsOutputPath,
    )
    await operations.writeFile(cardsTemporaryPath, cardsToPublish, {
      encoding: 'utf8',
      flag: 'wx',
    })
    await operations.writeFile(
      printingsTemporaryPath,
      printingsSerialized.value,
      { encoding: 'utf8', flag: 'wx' },
    )

    const stagedCards = await operations.readFile(cardsTemporaryPath, 'utf8')
    const stagedPrintings = await operations.readFile(
      printingsTemporaryPath,
      'utf8',
    )
    const stagedCardsValidation = validateCardsSnapshotText(stagedCards)
    if (!stagedCardsValidation.ok) return stagedCardsValidation
    const stagedPrintingsValidation = validateCardPrintingsSnapshotText(
      stagedPrintings,
      stagedCardsValidation.value,
    )
    if (!stagedPrintingsValidation.ok) return stagedPrintingsValidation
    if (
      stagedCards !== cardsToPublish ||
      stagedPrintings !== printingsSerialized.value
    ) {
      return { ok: false, errors: ['Temporary files differ from memory.'] }
    }

    await operations.rename(cardsTemporaryPath, options.cardsOutputPath)
    cardsPromoted = true
    await operations.rename(printingsTemporaryPath, options.printingsOutputPath)
    printingsPromoted = true

    const publishedCards = await operations.readFile(
      options.cardsOutputPath,
      'utf8',
    )
    const publishedPrintings = await operations.readFile(
      options.printingsOutputPath,
      'utf8',
    )
    const publishedCardsValidation = validateCardsSnapshotText(publishedCards)
    if (!publishedCardsValidation.ok)
      throw new Error(publishedCardsValidation.errors.join('; '))
    const publishedPrintingsValidation = validateCardPrintingsSnapshotText(
      publishedPrintings,
      publishedCardsValidation.value,
    )
    if (!publishedPrintingsValidation.ok) {
      throw new Error(publishedPrintingsValidation.errors.join('; '))
    }
    if (
      publishedCards !== cardsToPublish ||
      publishedPrintings !== printingsSerialized.value
    ) {
      throw new Error('Published files differ from memory.')
    }

    const printings = Object.values(
      publishedPrintingsValidation.value.cards,
    ).flatMap((group) => group.printings)
    return {
      ok: true,
      cardsOutputPath: options.cardsOutputPath,
      printingsOutputPath: options.printingsOutputPath,
      cardCount: publishedCardsValidation.value.cards.length,
      printingCount: printings.length,
      cardsDataVersion: publishedCardsValidation.value.dataVersion,
      printingsDataVersion: publishedPrintingsValidation.value.dataVersion,
      cardsBytes: Buffer.byteLength(publishedCards),
      printingsBytes: Buffer.byteLength(publishedPrintings),
      parallelPrintings: printings.filter((printing) => printing.isParallel)
        .length,
      nonParallelPrintings: printings.filter((printing) => !printing.isParallel)
        .length,
      imagePresent: printings.filter((printing) => printing.imageUrl).length,
      imageMissing: printings.filter((printing) => !printing.imageUrl).length,
    }
  } catch (error) {
    const errors = [error instanceof Error ? error.message : String(error)]
    try {
      if (cardsPromoted) {
        await restore(
          operations,
          options.cardsOutputPath,
          previousCards,
          cardsRollbackPath,
        )
      }
      if (printingsPromoted) {
        await restore(
          operations,
          options.printingsOutputPath,
          previousPrintings,
          printingsRollbackPath,
        )
      }
    } catch (rollbackError) {
      errors.push(
        `Rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
      )
    }
    return { ok: false, errors }
  } finally {
    await Promise.all([
      removeIfPresent(operations, cardsTemporaryPath),
      removeIfPresent(operations, printingsTemporaryPath),
      removeIfPresent(operations, cardsRollbackPath),
      removeIfPresent(operations, printingsRollbackPath),
    ])
  }
}
