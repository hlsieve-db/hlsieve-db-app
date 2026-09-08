/** @vitest-environment node */

import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Card } from '../../../src/domain/cards/types'
import type { CardPipelineDryRunResult } from '../audit/types'
import { buildCardPrintingsDataFile } from '../generate/buildCardPrintingsDataFile'
import { buildCardsDataFile } from '../generate/buildCardsDataFile'
import { serializeDataFile } from '../generate/serializeDataFile'
import type { SearchIndexedCardCandidate } from '../searchIndex/types'
import { publishCardDataSnapshots } from './publishCardDataSnapshots'
import type { PublishFileOperations } from './publishCardsSnapshot'
import { validateCardPrintingsSnapshotText } from './validateCardPrintingsSnapshot'

const directories: string[] = []
const realOperations: PublishFileOperations = {
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  )
})

function publicCard(): Card {
  return {
    cardNumber: 'TEST-001',
    name: 'Test',
    cardType: 'holomem',
    colors: ['red'],
    isBuzz: false,
    tags: [],
    abilities: [],
    arts: [],
    batonPass: [],
    effectTags: [],
    criticalColors: [],
    rarities: ['R'],
    products: ['Product'],
    illustrators: [],
    qas: [],
    searchText: 'test',
    imageUrl: 'https://img/1.png',
  }
}

function pipeline(isPublishable = true): CardPipelineDryRunResult {
  const cards = buildCardsDataFile([publicCard()], {
    generatedAt: '2026-09-08T00:00:00.000Z',
  })
  if (!cards.ok) throw new Error(JSON.stringify(cards.errors))
  const candidate = {
    cardNumber: 'TEST-001',
    representativeImageOfficialId: '1',
    printings: [
      {
        officialId: '1',
        officialUrl: 'https://official/cards?id=1',
        isParallel: false,
        imageUrl: 'https://img/1.png',
        rarity: 'R',
        products: [{ name: 'Product' }],
      },
    ],
  } as SearchIndexedCardCandidate
  const printings = buildCardPrintingsDataFile([candidate], cards.value)
  if (!printings.ok) throw new Error(JSON.stringify(printings.errors))
  const serializedCards = serializeDataFile(cards.value)
  const serializedPrintings = serializeDataFile(printings.value)
  if (!serializedCards.ok || !serializedPrintings.ok)
    throw new Error('serialize')
  return {
    report: { isPublishable } as CardPipelineDryRunResult['report'],
    artifacts: {
      cardsDataFile: cards.value,
      cardPrintingsDataFile: printings.value,
      serializedCards: serializedCards.value,
      serializedCardPrintings: serializedPrintings.value,
    } as CardPipelineDryRunResult['artifacts'],
  }
}

async function paths() {
  const directory = await mkdtemp(join(tmpdir(), 'hlsieve-pair-publish-'))
  directories.push(directory)
  return {
    cardsOutputPath: join(directory, 'cards.json'),
    printingsOutputPath: join(directory, 'card-printings.json'),
  }
}

describe('publishCardDataSnapshots', () => {
  it('stages and publishes both validated files', async () => {
    const output = await paths()
    const result = await publishCardDataSnapshots(pipeline(), output)
    expect(result).toMatchObject({ ok: true, cardCount: 1, printingCount: 1 })
    expect(
      validateCardPrintingsSnapshotText(
        await readFile(output.printingsOutputPath, 'utf8'),
      ).ok,
    ).toBe(true)
  })

  it('does no filesystem work for a non-publishable pipeline', async () => {
    const fail = vi.fn(() => {
      throw new Error('must not run')
    })
    const output = await paths()
    const result = await publishCardDataSnapshots(pipeline(false), {
      ...output,
      fileOperations: {
        mkdir: fail,
        readFile: fail,
        rename: fail,
        unlink: fail,
        writeFile: fail,
      } as unknown as PublishFileOperations,
    })
    expect(result.ok).toBe(false)
    expect(fail).not.toHaveBeenCalled()
  })

  it.each(['cards', 'printings'] as const)(
    'rejects a corrupted %s artifact before promotion',
    async (kind) => {
      const output = await paths()
      await writeFile(output.cardsOutputPath, 'old cards')
      await writeFile(output.printingsOutputPath, 'old printings')
      const input = pipeline()
      if (!input.artifacts) throw new Error('missing')
      if (kind === 'cards') input.artifacts.serializedCards = '{}\n'
      else input.artifacts.serializedCardPrintings = '{}\n'
      expect((await publishCardDataSnapshots(input, output)).ok).toBe(false)
      await expect(readFile(output.cardsOutputPath, 'utf8')).resolves.toBe(
        'old cards',
      )
      await expect(readFile(output.printingsOutputPath, 'utf8')).resolves.toBe(
        'old printings',
      )
    },
  )

  it('keeps existing files when a temporary write fails', async () => {
    const output = await paths()
    await writeFile(output.cardsOutputPath, 'old cards')
    await writeFile(output.printingsOutputPath, 'old printings')
    const operations = {
      ...realOperations,
      writeFile: vi.fn(async () => {
        throw new Error('write failed')
      }),
    } as PublishFileOperations
    expect(
      (
        await publishCardDataSnapshots(pipeline(), {
          ...output,
          fileOperations: operations,
        })
      ).ok,
    ).toBe(false)
    await expect(readFile(output.cardsOutputPath, 'utf8')).resolves.toBe(
      'old cards',
    )
    await expect(readFile(output.printingsOutputPath, 'utf8')).resolves.toBe(
      'old printings',
    )
  })

  it('publishes identical bytes on the second run', async () => {
    const output = await paths()
    const input = pipeline()
    expect((await publishCardDataSnapshots(input, output)).ok).toBe(true)
    const firstCards = await readFile(output.cardsOutputPath)
    const firstPrintings = await readFile(output.printingsOutputPath)
    expect((await publishCardDataSnapshots(input, output)).ok).toBe(true)
    expect(await readFile(output.cardsOutputPath)).toEqual(firstCards)
    expect(await readFile(output.printingsOutputPath)).toEqual(firstPrintings)
  })

  it('keeps cards.json byte-identical to the pipeline artifact', async () => {
    const output = await paths()
    const input = pipeline()
    await publishCardDataSnapshots(input, output)
    expect(await readFile(output.cardsOutputPath, 'utf8')).toBe(
      input.artifacts?.serializedCards,
    )
  })

  it('preserves existing cards bytes when the dataVersion is unchanged', async () => {
    const output = await paths()
    const input = pipeline()
    const existing = JSON.parse(input.artifacts!.serializedCards)
    existing.generatedAt = '2020-01-01T00:00:00.000Z'
    const existingText = `${JSON.stringify(existing, null, 2)}\n`
    await writeFile(output.cardsOutputPath, existingText)

    expect((await publishCardDataSnapshots(input, output)).ok).toBe(true)
    await expect(readFile(output.cardsOutputPath, 'utf8')).resolves.toBe(
      existingText,
    )
  })

  it('rolls back the first promotion when the second rename fails', async () => {
    const output = await paths()
    await writeFile(output.cardsOutputPath, 'old cards')
    await writeFile(output.printingsOutputPath, 'old printings')
    let renames = 0
    const operations: PublishFileOperations = {
      ...realOperations,
      rename: vi.fn(async (from, to) => {
        renames += 1
        if (renames === 2) throw new Error('second promotion failed')
        return rename(from, to)
      }),
    }
    const result = await publishCardDataSnapshots(pipeline(), {
      ...output,
      fileOperations: operations,
      createTemporaryId: () => 'rollback',
    })
    expect(result.ok).toBe(false)
    await expect(readFile(output.cardsOutputPath, 'utf8')).resolves.toBe(
      'old cards',
    )
    await expect(readFile(output.printingsOutputPath, 'utf8')).resolves.toBe(
      'old printings',
    )
  })
})
