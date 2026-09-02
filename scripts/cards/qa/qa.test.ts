/** @vitest-environment node */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { fixtureManifest } from '../fixtures/manifest'
import { normalizeCardDetail } from '../normalize/normalizeCardDetail'
import type { NormalizeResult } from '../normalize/types'
import { parseCardDetailHtml } from '../parser/parseCardDetail'
import type { ParseResult, RawCardDetail } from '../parser/types'
import { normalizeQaEntries } from './normalizeQa'
import { parseQaSectionHtml } from './parseQaSection'
import type { ParsedQaSection } from './types'

const fixtureRoot = resolve(process.cwd(), 'scripts/cards/fixtures')

function expectSuccess<T>(result: ParseResult<T> | NormalizeResult<T>): T {
  if (!result.ok) {
    throw new Error(`Expected success: ${JSON.stringify(result.errors)}`)
  }
  return result.value
}

async function rawDetail(id: string): Promise<RawCardDetail> {
  const fixture = fixtureManifest.find((entry) => entry.id === id)
  if (!fixture || fixture.kind !== 'detail') {
    throw new Error(`Unknown detail fixture: ${id}`)
  }
  const html = await readFile(resolve(fixtureRoot, fixture.file), 'utf8')
  return expectSuccess(parseCardDetailHtml(html, fixture.sourceUrl))
}

async function parsedFixtureQa(id: string): Promise<ParsedQaSection> {
  return parseQaSectionHtml((await rawDetail(id)).qaSectionHtmlRaw)
}

function qaSection(entries: string): string {
  return `<div id="faq"><div class="qa-List">${entries}</div></div>`
}

function qaEntry({
  title = 'Q1（2026.03.02）',
  question = '<span>Q</span>質問',
  answer = '<span>A</span>回答',
  relation = '',
}: {
  title?: string
  question?: string
  answer?: string
  relation?: string
} = {}): string {
  return `<div class="qa-List_Item">
    <div class="qa-List_Ttl">${title}</div>
    <p class="qa-List_Txt-Q">${question}</p>
    <p class="qa-List_Txt-A">${answer}</p>
  </div>${relation}`
}

describe('official Q&A fixture parsing and normalization', () => {
  it('returns [] when the detail has no Q&A section', async () => {
    const raw = await rawDetail('detail-spot-kanata')
    const parsed = parseQaSectionHtml(raw.qaSectionHtmlRaw)
    const normalized = normalizeQaEntries(parsed.entries)

    expect(raw.qaSectionHtmlRaw).toBeUndefined()
    expect(parsed).toEqual({ entries: [], warnings: [] })
    expect(normalized.value).toEqual([])
  })

  it('extracts all FUWAMOCO entries in DOM order with metadata', async () => {
    const parsed = await parsedFixtureQa('detail-multicolor-fuwamoco')
    const normalized = normalizeQaEntries(parsed.entries)

    expect(parsed.entries).toHaveLength(12)
    expect(normalized.value).toHaveLength(12)
    expect(normalized.value.map((entry) => entry.sourceIndex)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ])
    expect(normalized.value.map((entry) => entry.qNumber)).toEqual([
      617, 544, 404, 390, 359, 340, 322, 321, 320, 319, 318, 302,
    ])
    expect(normalized.value[0]).toMatchObject({
      qNumber: 617,
      publishedDate: '2026-03-02',
      relatedCardNumbers: ['hBP03-050'],
    })
    expect(normalized.value.at(-1)?.qNumber).toBe(302)
  })

  it('keeps the complete multi-line question and answer', async () => {
    const normalized = normalizeQaEntries(
      (await parsedFixtureQa('detail-multicolor-fuwamoco')).entries,
    ).value

    expect(normalized[2]?.question).toContain(
      '〈ときのそら〉と〈フワワ・アビスガード〉を選びました。\n',
    )
    expect(normalized[2]?.question).toContain('手札に加えられますか？')
    expect(normalized[4]?.answer).toBe(
      'はい、できます。\nカード名称に該当のカードがない場合でもエクストラに「このホロメンは〈フワワ・アビスガード〉〈モココ・アビスガード〉としても扱う」の様に特定のカード名として扱うカードが存在している場合は、その条件を満たします。',
    )
  })

  it('removes only structural Q/A spans and excludes related cards from the answer', async () => {
    const parsed = await parsedFixtureQa('detail-multicolor-fuwamoco')
    const first = normalizeQaEntries(parsed.entries).value[0]

    expect(first?.question.startsWith('Q')).toBe(false)
    expect(first?.answer.startsWith('A')).toBe(false)
    expect(first?.answer).not.toContain('関連カード')
    expect(first?.answer).not.toContain('[hBP03-050')

    const literalPrefix = parseQaSectionHtml(
      qaSection(qaEntry({ question: '<span>Q</span>Qから始まる質問' })),
    )
    expect(literalPrefix.entries[0]?.questionRaw).toBe('Qから始まる質問')
  })

  it('extracts related card numbers in DOM order', async () => {
    const normalized = normalizeQaEntries(
      (await parsedFixtureQa('detail-multicolor-fuwamoco')).entries,
    ).value

    expect(normalized[2]?.relatedCardNumbers).toEqual([
      'hBP04-089',
      'hSD01-013',
      'hBP03-050',
    ])
  })

  it('keeps both FUWAMOCO printings as separate candidate Q&A arrays', async () => {
    const original = expectSuccess(
      normalizeCardDetail(await rawDetail('detail-multicolor-fuwamoco')),
    )
    const reprint = expectSuccess(
      normalizeCardDetail(
        await rawDetail('detail-multicolor-fuwamoco-reprint'),
      ),
    )

    expect(original.officialId).toBe('614')
    expect(reprint.officialId).toBe('2545')
    expect(original.qas).toHaveLength(12)
    expect(reprint.qas).toHaveLength(12)
    expect(original.qas).not.toBe(reprint.qas)
  })

  it('connects a required empty qas array without deriving effect tags', async () => {
    const raw = await rawDetail('detail-debut-shirogane-noel')
    const noQa = expectSuccess(normalizeCardDetail(raw))
    const withGameTerms = expectSuccess(
      normalizeCardDetail({
        ...raw,
        qaSectionHtmlRaw: qaSection(
          qaEntry({
            question: '<span>Q</span>カードをドローできますか？',
            answer: '<span>A</span>特殊ダメージには影響しません。',
          }),
        ),
      }),
    )

    expect(noQa.qas).toEqual([])
    expect(withGameTerms.qas[0]?.question).toContain('ドロー')
    expect(withGameTerms.qas[0]?.answer).toContain('特殊ダメージ')
    expect(withGameTerms).not.toHaveProperty('effectTags')
  })
})

describe('Q&A malformed and boundary handling', () => {
  it('returns [] for an empty Q&A section', () => {
    expect(parseQaSectionHtml(qaSection('')).entries).toEqual([])
  })

  it('warns and skips an entry without a question', () => {
    const result = parseQaSectionHtml(
      qaSection(qaEntry({ question: '<span>Q</span>' })),
    )

    expect(result.entries).toEqual([])
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'QA_MISSING_QUESTION', sourceIndex: 0 }),
    )
  })

  it('warns and skips an entry without an answer while preserving later entries', () => {
    const result = parseQaSectionHtml(
      qaSection(
        qaEntry({ answer: '<span>A</span>' }) +
          qaEntry({ title: 'Q2（2026.03.03）' }),
      ),
    )

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]?.sourceIndex).toBe(1)
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'QA_MISSING_ANSWER', sourceIndex: 0 }),
    )
  })

  it('warns on invalid Q number and date without producing NaN', () => {
    const parsed = parseQaSectionHtml(
      qaSection(qaEntry({ title: 'Qinvalid（2025.02.29）' })),
    )
    const result = normalizeQaEntries(parsed.entries)

    expect(result.value[0]?.qNumber).toBeUndefined()
    expect(Number.isNaN(result.value[0]?.qNumber)).toBe(false)
    expect(result.value[0]?.publishedDate).toBeUndefined()
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'QA_INVALID_NUMBER' }),
        expect.objectContaining({ code: 'QA_INVALID_DATE' }),
      ]),
    )
  })

  it('deduplicates related card numbers exactly while preserving first-seen order', () => {
    const relation = `<div class="relation"><p>関連カード</p><p>
      [hBP03-050 ： FUWAMOCO]
      [hBP04-089 ： ツートンカラーパソコン]
      [hBP03-050 ： FUWAMOCO]
    </p></div>`
    const parsed = parseQaSectionHtml(qaSection(qaEntry({ relation })))

    expect(
      normalizeQaEntries(parsed.entries).value[0]?.relatedCardNumbers,
    ).toEqual(['hBP03-050', 'hBP04-089'])
  })

  it('warns on an invalid related card without discarding the Q&A entry', () => {
    const result = normalizeQaEntries([
      {
        questionRaw: '質問',
        answerRaw: '回答',
        relatedCardsRaw: [{}],
        sourceIndex: 0,
      },
    ])

    expect(result.value).toHaveLength(1)
    expect(result.value[0]?.relatedCardNumbers).toEqual([])
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'QA_INVALID_RELATED_CARD' }),
    )
  })
})
