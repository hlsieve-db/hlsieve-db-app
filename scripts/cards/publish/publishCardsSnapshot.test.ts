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
import { buildCardsDataFile } from '../generate/buildCardsDataFile'
import { serializeDataFile } from '../generate/serializeDataFile'
import {
  publishCardsSnapshot,
  type PublishFileOperations,
} from './publishCardsSnapshot'
import { validateCardsSnapshotText } from './validateCardsSnapshot'

const GENERATED_AT = '2026-09-04T00:00:00.000Z'
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

function publicCard(overrides: Partial<Card> = {}): Card {
  return {
    cardNumber: 'hBP07-019',
    name: '宝鐘マリン',
    cardType: 'holomem',
    colors: ['red'],
    bloomLevel: 'first',
    isBuzz: true,
    hp: 130,
    tags: ['3期生'],
    abilities: [],
    arts: [],
    batonPass: [],
    effectTags: [],
    criticalColors: [],
    rarities: ['R'],
    products: ['hBP07'],
    illustrators: [],
    qas: [],
    searchText: 'hbp07-019 宝鐘マリン ほうしょうまりん',
    imageUrl:
      'https://hololive-official-cardgame.com/wp-content/images/cardlist/hBP07/hBP07-019_R.png',
    officialUrl:
      'https://hololive-official-cardgame.com/cardlist/?faq=&id=3000',
    ...overrides,
  }
}

function pipelineResult(
  cards: Card[] = [publicCard()],
  isPublishable = true,
): CardPipelineDryRunResult {
  const built = buildCardsDataFile(cards, { generatedAt: GENERATED_AT })
  if (!built.ok) throw new Error(JSON.stringify(built.errors))
  const serialized = serializeDataFile(built.value)
  if (!serialized.ok) throw new Error(JSON.stringify(serialized.errors))
  return {
    report: { isPublishable } as CardPipelineDryRunResult['report'],
    artifacts: {
      cardsDataFile: built.value,
      serializedCards: serialized.value,
    } as CardPipelineDryRunResult['artifacts'],
  }
}

async function outputPath() {
  const directory = await mkdtemp(join(tmpdir(), 'hocg-publish-'))
  temporaryDirectories.push(directory)
  return join(directory, 'cards.json')
}

const realOperations: PublishFileOperations = {
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
}

describe('publishCardsSnapshot', () => {
  it('atomically replaces an existing snapshot with validated output', async () => {
    const output = await outputPath()
    await writeFile(output, 'previous snapshot', 'utf8')
    const renameSpy = vi.fn(rename)

    const result = await publishCardsSnapshot(pipelineResult(), {
      outputPath: output,
      fileOperations: { ...realOperations, rename: renameSpy },
      createTemporaryId: () => 'atomic',
    })

    expect(result).toMatchObject({
      ok: true,
      cardCount: 1,
      uniqueCardNumbers: 1,
      memoryMatchesWritten: true,
    })
    expect(renameSpy).toHaveBeenCalledWith(
      join(output.replace(/cards\.json$/, ''), '.cards.json.atomic.tmp'),
      output,
    )
    const published = await readFile(output, 'utf8')
    expect(validateCardsSnapshotText(published).ok).toBe(true)
  })

  it('performs no filesystem operation when the audit is not publishable', async () => {
    const fail = vi.fn(() => {
      throw new Error('filesystem must not be called')
    })
    const operations = {
      mkdir: fail,
      readFile: fail,
      rename: fail,
      unlink: fail,
      writeFile: fail,
    } as unknown as PublishFileOperations

    const result = await publishCardsSnapshot(pipelineResult([], false), {
      outputPath: 'unused/cards.json',
      fileOperations: operations,
    })

    expect(result.ok).toBe(false)
    expect(fail).not.toHaveBeenCalled()
  })

  it('preserves the previous snapshot when atomic promotion fails', async () => {
    const output = await outputPath()
    await writeFile(output, 'previous snapshot', 'utf8')
    const operations: PublishFileOperations = {
      ...realOperations,
      rename: vi.fn(async () => {
        throw new Error('simulated rename failure')
      }),
    }

    const result = await publishCardsSnapshot(pipelineResult(), {
      outputPath: output,
      fileOperations: operations,
      createTemporaryId: () => 'failure',
    })

    expect(result).toEqual({
      ok: false,
      errors: ['simulated rename failure'],
    })
    await expect(readFile(output, 'utf8')).resolves.toBe('previous snapshot')
    await expect(
      readFile(
        join(output.replace(/cards\.json$/, ''), '.cards.json.failure.tmp'),
      ),
    ).rejects.toThrow()
  })

  it('preserves the previous snapshot when the temporary write fails', async () => {
    const output = await outputPath()
    await writeFile(output, 'previous snapshot', 'utf8')
    const operations: PublishFileOperations = {
      ...realOperations,
      writeFile: vi.fn(async () => {
        throw new Error('simulated write failure')
      }),
    }

    const result = await publishCardsSnapshot(pipelineResult(), {
      outputPath: output,
      fileOperations: operations,
      createTemporaryId: () => 'write-failure',
    })

    expect(result).toEqual({
      ok: false,
      errors: ['simulated write failure'],
    })
    await expect(readFile(output, 'utf8')).resolves.toBe('previous snapshot')
  })

  it('writes identical bytes when publishing the same artifact twice', async () => {
    const output = await outputPath()
    const pipeline = pipelineResult()

    expect(
      (await publishCardsSnapshot(pipeline, { outputPath: output })).ok,
    ).toBe(true)
    const first = await readFile(output)
    expect(
      (await publishCardsSnapshot(pipeline, { outputPath: output })).ok,
    ).toBe(true)
    expect(await readFile(output)).toEqual(first)
  })

  it('rejects a serialization mismatch before replacing the old file', async () => {
    const output = await outputPath()
    await writeFile(output, 'previous snapshot', 'utf8')
    const pipeline = pipelineResult()
    if (!pipeline.artifacts) throw new Error('missing artifacts')
    pipeline.artifacts.serializedCards = '{}\n'

    const result = await publishCardsSnapshot(pipeline, { outputPath: output })

    expect(result.ok).toBe(false)
    await expect(readFile(output, 'utf8')).resolves.toBe('previous snapshot')
  })

  it('preserves the previous snapshot when serialization fails', async () => {
    const output = await outputPath()
    await writeFile(output, 'previous snapshot', 'utf8')
    const pipeline = pipelineResult()
    if (!pipeline.artifacts) throw new Error('missing artifacts')
    pipeline.artifacts.cardsDataFile.cards[0] = {
      ...publicCard(),
      hp: BigInt(130) as unknown as number,
    }

    const result = await publishCardsSnapshot(pipeline, { outputPath: output })

    expect(result.ok).toBe(false)
    await expect(readFile(output, 'utf8')).resolves.toBe('previous snapshot')
  })

  it('rereads and rejects a corrupted temporary file before promotion', async () => {
    const output = await outputPath()
    await writeFile(output, 'previous snapshot', 'utf8')
    const operations: PublishFileOperations = {
      ...realOperations,
      readFile: vi.fn(async (path, options) => {
        if (String(path).endsWith('.tmp')) return '{}'
        return readFile(path, options)
      }) as typeof readFile,
    }

    const result = await publishCardsSnapshot(pipelineResult(), {
      outputPath: output,
      fileOperations: operations,
      createTemporaryId: () => 'corrupt',
    })

    expect(result.ok).toBe(false)
    await expect(readFile(output, 'utf8')).resolves.toBe('previous snapshot')
  })
})

describe('validateCardsSnapshotText', () => {
  it('retains Buzz, representative image, and search text public fields', () => {
    const pipeline = pipelineResult()
    const serialized = pipeline.artifacts?.serializedCards ?? ''
    const result = validateCardsSnapshotText(serialized)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.cards[0]).toMatchObject({
      cardNumber: 'hBP07-019',
      bloomLevel: 'first',
      isBuzz: true,
      imageUrl:
        'https://hololive-official-cardgame.com/wp-content/images/cardlist/hBP07/hBP07-019_R.png',
      searchText: 'hbp07-019 宝鐘マリン ほうしょうまりん',
    })
  })

  it.each(['officialId', 'isParallel', 'printings', 'contentHash'])(
    'rejects internal field %s',
    (field) => {
      const pipeline = pipelineResult()
      const value = pipeline.artifacts?.cardsDataFile
      if (!value) throw new Error('missing artifact')
      const leaked = structuredClone(value) as unknown as Record<
        string,
        unknown
      >
      const cards = leaked.cards as Record<string, unknown>[]
      if (!cards[0]) throw new Error('missing card')
      cards[0][field] = 'internal'

      expect(
        validateCardsSnapshotText(`${JSON.stringify(leaked, null, 2)}\n`),
      ).toEqual({
        ok: false,
        errors: ['cards[0] violates the public Card schema.'],
      })
    },
  )

  it('rejects a stale dataVersion', () => {
    const pipeline = pipelineResult()
    const value = structuredClone(pipeline.artifacts?.cardsDataFile)
    if (!value) throw new Error('missing artifact')
    value.dataVersion = `sha256:${'0'.repeat(64)}`

    expect(
      validateCardsSnapshotText(`${JSON.stringify(value, null, 2)}\n`),
    ).toEqual({
      ok: false,
      errors: ['dataVersion does not match card content.'],
    })
  })
})
