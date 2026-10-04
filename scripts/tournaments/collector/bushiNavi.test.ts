import { chromium, type Browser } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { TOURNAMENT_DATA_START_DATE } from '../../../src/domain/tournaments/constants'
import {
  assertCollectorStartDate,
  BUSHI_NAVI_TEST_CONSTANTS,
  buildOfficialDeckLogUrl,
  classifyKnownEventAvailability,
  determineCoverage,
  limitToTopEight,
  parseDeckCodeFromModalImage,
  parseKnownEventMetadata,
  parseParticipantCount,
  parseRankText,
  parseSourceEventId,
  planDiscoveryResult,
  resolveEventDate,
  readReadyResultDeckCode,
  splitDateRange,
  validateKnownSeriesYear,
} from './bushiNavi'

describe('Bushi Navi Collector rules', () => {
  it('limits Selection Cup source ranks 1-16 to ranks 1-8', () => {
    expect(BUSHI_NAVI_TEST_CONSTANTS.maxImportedRank).toBe(8)
    const results = Array.from({ length: 16 }, (_, index) => ({
      rank: index + 1,
    }))
    expect(limitToTopEight(results).map(({ rank }) => rank)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ])
  })

  it('uses exact coverage only for contiguous ranks from one', () => {
    expect(determineCoverage([{ rank: 1 }, { rank: 2 }, { rank: 3 }])).toEqual({
      kind: 'exact',
      maxRank: 3,
    })
    expect(determineCoverage([{ rank: 1 }, { rank: 2 }, { rank: 4 }])).toEqual({
      kind: 'variable',
    })
  })

  it('combines the configured year with the public month/day and checks the range', () => {
    expect(
      resolveEventDate('09月23日（水）13時00分', 2026, {
        from: '2026-09-19',
        to: '2026-09-23',
      }),
    ).toBe('2026-09-23')
    expect(() =>
      resolveEventDate('09月24日（木）13時00分', 2026, {
        from: '2026-09-19',
        to: '2026-09-23',
      }),
    ).toThrow(/outside/)
  })

  it('splits a saturated multi-day range without overlap', () => {
    expect(splitDateRange({ from: '2026-09-19', to: '2026-09-23' })).toEqual([
      { from: '2026-09-19', to: '2026-09-21' },
      { from: '2026-09-22', to: '2026-09-23' },
    ])
    expect(
      planDiscoveryResult({ from: '2026-09-19', to: '2026-09-23' }, 10),
    ).toMatchObject({ complete: false })
    expect(
      planDiscoveryResult({ from: '2026-09-19', to: '2026-09-23' }, 9),
    ).toEqual({ complete: true })
  })

  it('fails when a single day is still saturated at ten results', () => {
    expect(() =>
      planDiscoveryResult({ from: '2026-09-19', to: '2026-09-19' }, 10),
    ).toThrow(/Incomplete discovery/)
  })

  it('accepts only a public result URL as the source Event identity', () => {
    expect(
      parseSourceEventId('https://www.bushi-navi.com/event/result/1764903'),
    ).toBe('1764903')
    expect(() =>
      parseSourceEventId('https://www.bushi-navi.com/event/result/list'),
    ).toThrow(/event ID/)
  })

  it('parses participant count, rank, and the public Deck Log code', () => {
    expect(parseParticipantCount('大会結果参加者: 60人')).toBe(60)
    expect(parseRankText('8')).toBe(8)
    expect(
      parseDeckCodeFromModalImage(
        'https://decklog.bushiroad.com/deckimages/KE8C4.png',
      ),
    ).toBe('KE8C4')
  })

  it('rejects a missing rank or missing Deck Log code', () => {
    expect(() => parseRankText('')).toThrow(/rank/)
    expect(() => parseDeckCodeFromModalImage(undefined)).toThrow(/code/)
  })

  it('builds Deck Log navigation only from a strict public code', () => {
    expect(buildOfficialDeckLogUrl('1GXSK6')).toBe(
      'https://decklog.bushiroad.com/view/1GXSK6',
    )
    expect(() => buildOfficialDeckLogUrl('https://evil.example/x')).toThrow(
      /alphanumeric/,
    )
    expect(() => buildOfficialDeckLogUrl('../x')).toThrow(/alphanumeric/)
  })

  it('rejects dates before the Phase 9B start date', () => {
    expect(TOURNAMENT_DATA_START_DATE).toBe('2026-09-19')
    expect(() =>
      assertCollectorStartDate({ from: '2026-09-18', to: '2026-09-19' }),
    ).toThrow(/starts before/)
  })

  it('parses exact Selection and Bloom direct metadata', () => {
    expect(
      parseKnownEventMetadata({
        title:
          '【ホロカ】先行開催！セレクションカップ（2026年9月） / in 竜星の嵐 名古屋店',
        dateTimeText: '09月23日（水）13時00分',
        venueName: '竜星の嵐 名古屋店',
        pageText: '大会結果\n参加者: 60人',
      }),
    ).toMatchObject({
      date: '2026-09-23',
      participantCount: 60,
      venueName: '竜星の嵐 名古屋店',
      series: { type: 'selectioncup', round: 'bp08' },
    })
    expect(
      parseKnownEventMetadata({
        title:
          '【ホロカ】ブルームカップ「響咲リオナ」 （2026年9月開催） / ブルームカップ「響咲リオナ」/アメニティードリーム横浜店',
        dateTimeText: '09月30日（水）12時30分',
        venueName: 'アメニティードリーム横浜店',
        pageText: '大会結果参加者: 28人',
      }).series,
    ).toMatchObject({ type: 'bloomcup', year: 2026 })
  })

  it('rejects partial or unknown series and unsafe years', () => {
    const base = {
      dateTimeText: '09月23日（水）13時00分',
      venueName: '会場',
      pageText: '大会結果参加者: 60人',
    }
    expect(() =>
      parseKnownEventMetadata({ ...base, title: 'セレクションカップ / 会場' }),
    ).toThrow(/Unknown/)
    expect(() =>
      parseKnownEventMetadata({
        ...base,
        title: '【ホロカ】先行開催！セレクションカップ（2025年9月） / in 会場',
      }),
    ).toThrow(/Unknown/)
    expect(() =>
      validateKnownSeriesYear(
        '【ホロカ】先行開催！セレクションカップ（2026年9月）',
        2025,
      ),
    ).toThrow(/does not match config/)
    expect(() =>
      parseKnownEventMetadata({
        ...base,
        title: '【ホロカ】先行開催！セレクションカップ（2026年9月） / in 会場',
        dateTimeText: '02月30日（月）13時00分',
      }),
    ).toThrow(/date is invalid/)
  })

  it('rejects the generic source error before interpreting zero participants', () => {
    expect(() =>
      parseKnownEventMetadata({
        title: '',
        dateTimeText: '10月04日（日）14時54分',
        venueName: '',
        pageText: 'サーバーからの応答がありません\n参加者: 0人',
      }),
    ).toThrow(/generic source error/)
  })

  it('requires valid metadata before zero Results can mean waiting-result', () => {
    expect(
      classifyKnownEventAvailability({ metadataValid: true, resultCount: 0 }),
    ).toBe('waiting-result')
    expect(
      classifyKnownEventAvailability({ metadataValid: false, resultCount: 0 }),
    ).toBe('needs-review')
  })
})

describe('Bushi Navi Result modal binding', () => {
  let browser: Browser

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
  })

  afterAll(async () => {
    await browser.close()
  })

  async function modalPage(updateDelay: number | undefined, code = '1GXSK6') {
    const page = await browser.newPage()
    await page.setContent(`<table><tbody>
      <tr><td>1</td><td><a>Rank One</a><button id="rank1">デッキを見る</button></td></tr>
      <tr><td>2</td><td><a>Rank Two</a><button id="rank2">デッキを見る</button></td></tr>
    </tbody></table>
    <div id="eventResultDeckModal" style="display:none">
      <div class="playerName"></div><img><button>デッキログへ</button><button class="buttonClose">閉じる</button>
    </div>
    <script>
      const modal = document.querySelector('#eventResultDeckModal')
      const update = (name, code) => {
        modal.querySelector('.playerName').textContent = name
        modal.querySelector('img').src = 'https://decklog.bushiroad.com/deckimages/' + code + '.png'
      }
      document.querySelector('#rank1').onclick = () => { modal.style.display = 'block'; update('Rank One', 'KE8C4') }
      document.querySelector('#rank2').onclick = () => {
        modal.style.display = 'block'
        ${updateDelay === undefined ? '' : `setTimeout(() => update('Rank Two', '${code}'), ${updateDelay})`}
      }
      modal.querySelector('.buttonClose').onclick = () => {
        modal.style.display = 'none'
        modal.dataset.closeCount = String(Number(modal.dataset.closeCount || '0') + 1)
      }
    </script>`)
    return page
  }

  it.each([0, 50, 250])(
    'waits for the clicked row binding after a %ims update',
    async (delay) => {
      const page = await modalPage(delay)
      try {
        await expect(readReadyResultDeckCode(page, 0)).resolves.toBe('KE8C4')
        await expect(readReadyResultDeckCode(page, 1)).resolves.toBe('1GXSK6')
        await expect(
          page
            .locator('#eventResultDeckModal')
            .getAttribute('data-close-count'),
        ).resolves.toBe('1')
      } finally {
        await page.close()
      }
    },
  )

  it.each([
    ['never updates', undefined, '1GXSK6'],
    ['uses an invalid code', 0, 'invalid-code'],
  ])('rejects when the modal %s', async (_label, delay, code) => {
    const page = await modalPage(delay, code)
    try {
      page.setDefaultTimeout(100)
      await readReadyResultDeckCode(page, 0)
      await expect(readReadyResultDeckCode(page, 1)).rejects.toThrow(/Timeout/)
    } finally {
      await page.close()
    }
  })
})
