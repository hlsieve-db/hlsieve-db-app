import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CardsDataFile } from '../domain/cards/types'
import type { Deck } from '../domain/decks/types'
import { sortDeckEntriesForDisplay } from '../domain/decks/displayOrder'
import { buildDeckLogPublicUrl } from '../domain/tournaments/deckLog'
import type {
  TournamentEvent,
  TournamentEventFile,
  TournamentResult,
} from '../domain/tournaments/types'
import {
  SYNTHETIC_TOURNAMENT_INDEX,
  SYNTHETIC_TOURNAMENT_OSHI_MASTER,
  SYNTHETIC_TOURNAMENT_PUBLICATION,
} from '../test/fixtures/tournaments'
import { TournamentDataHttpError } from '../repositories/loadTournamentData'
import {
  TournamentEventPage,
  TournamentResultPage,
} from './TournamentDetailPages'

vi.mock('../components/AppNavigation', () => ({
  AppNavigation: () => <nav aria-label="test navigation" />,
}))
vi.mock('../hooks/useDocumentMetadata', () => ({
  useDocumentMetadata: () => undefined,
}))
vi.mock('../domain/tournaments/deckLog', () => ({
  buildDeckLogPublicUrl: vi.fn(
    (code: string) =>
      `https://deck-log-helper.invalid/${encodeURIComponent(code)}`,
  ),
}))
const repositoryMocks = vi.hoisted(() => ({ saveDeck: vi.fn() }))
vi.mock('../repositories/useAppRepositories', () => ({
  useAppRepositories: () => ({ decks: { saveDeck: repositoryMocks.saveDeck } }),
}))

beforeEach(() => {
  repositoryMocks.saveDeck.mockReset().mockResolvedValue(undefined)
})

const eventFile = SYNTHETIC_TOURNAMENT_PUBLICATION.events['synthetic-event-a']
const result = eventFile.event.results[0]
const cards: CardsDataFile = {
  format: 'holocard-cards',
  formatVersion: 1,
  dataVersion: SYNTHETIC_TOURNAMENT_OSHI_MASTER.cardsDataVersion,
  generatedAt: '2026-09-19T00:00:00.000Z',
  cards: [
    {
      cardNumber: 'SYNTH-MAIN-a',
      name: 'Synthetic Main Card',
      cardType: 'holomem',
      colors: [],
      isBuzz: false,
      tags: [],
      abilities: [],
      arts: [],
      batonPass: [],
      effectTags: [],
      criticalColors: [],
      rarities: [],
      products: [],
      illustrators: [],
      qas: [],
      searchText: 'synthetic',
      representativeImageUrl: 'https://invalid.example/main.webp',
    },
    {
      cardNumber: 'SYNTH-CHEER-a',
      name: 'Synthetic Cheer Card',
      cardType: 'cheer',
      colors: [],
      isBuzz: false,
      tags: [],
      abilities: [],
      arts: [],
      batonPass: [],
      effectTags: [],
      criticalColors: [],
      rarities: [],
      products: [],
      illustrators: [],
      qas: [],
      searchText: 'synthetic',
    },
  ],
}

function renderEvent(
  options: {
    index?: typeof SYNTHETIC_TOURNAMENT_INDEX
    file?: TournamentEventFile
    loadEvent?: () => Promise<TournamentEventFile>
  } = {},
) {
  render(
    <MemoryRouter initialEntries={['/tournaments/synthetic-event-a']}>
      <Routes>
        <Route
          path="/tournaments/:eventId"
          element={
            <TournamentEventPage
              loadIndex={async () =>
                options.index ?? SYNTHETIC_TOURNAMENT_INDEX
              }
              loadEvent={
                options.loadEvent ?? (async () => options.file ?? eventFile)
              }
              loadOshiMaster={async () => SYNTHETIC_TOURNAMENT_OSHI_MASTER}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}</output>
}

function renderResult(
  options: {
    path?: string
    loadOshi?: () => Promise<typeof SYNTHETIC_TOURNAMENT_OSHI_MASTER>
    loadCards?: () => Promise<CardsDataFile>
    convertResult?: (event: TournamentEvent, result: TournamentResult) => Deck
    file?: TournamentEventFile
  } = {},
) {
  render(
    <MemoryRouter
      initialEntries={[
        options.path ?? `/tournaments/synthetic-event-a/results/${result.id}`,
      ]}
    >
      <Routes>
        <Route
          path="/tournaments/:eventId/results/:resultId"
          element={
            <TournamentResultPage
              loadIndex={async () => SYNTHETIC_TOURNAMENT_INDEX}
              loadEvent={async () => options.file ?? eventFile}
              loadOshiMaster={
                options.loadOshi ??
                (async () => SYNTHETIC_TOURNAMENT_OSHI_MASTER)
              }
              loadCards={options.loadCards ?? (async () => cards)}
              convertResult={options.convertResult}
            />
          }
        />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )
}

describe('Tournament Event detail', () => {
  it('renders a propagated participant count', async () => {
    renderEvent({
      file: {
        ...eventFile,
        event: { ...eventFile.event, participantCount: 60 },
      },
    })
    expect(await screen.findByText('60人')).toBeVisible()
  })

  it('renders metadata without coverage and all real Results in stable Result-ID links', async () => {
    const sparse = SYNTHETIC_TOURNAMENT_PUBLICATION.events['synthetic-event-b']
    renderEvent({
      file: {
        ...sparse,
        event: {
          ...sparse.event,
          id: 'synthetic-event-a',
          results: [
            ...sparse.event.results,
            { ...sparse.event.results[0], id: 'rank-nine', rank: 9 },
          ],
        },
      },
    })
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Synthetic Bloom Cup',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByText('収録範囲')).not.toBeInTheDocument()
    expect(screen.queryByText('取得できた結果のみ収録')).not.toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.queryByText('4位')).not.toBeInTheDocument()
    expect(screen.getByText('9位')).toBeInTheDocument()
    expect(
      screen.getAllByRole('link', { name: '結果詳細を見る' })[0],
    ).toHaveAttribute(
      'href',
      expect.stringContaining(encodeURIComponent(sparse.event.results[0].id)),
    )
  })

  it('distinguishes unknown Event from an indexed missing Event file', async () => {
    render(
      <MemoryRouter initialEntries={['/tournaments/unknown']}>
        <Routes>
          <Route
            path="/tournaments/:eventId"
            element={
              <TournamentEventPage
                loadIndex={async () => SYNTHETIC_TOURNAMENT_INDEX}
                loadEvent={async () => eventFile}
                loadOshiMaster={async () => SYNTHETIC_TOURNAMENT_OSHI_MASTER}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    )
    expect(
      await screen.findByText('指定された大会は見つかりません。'),
    ).toBeInTheDocument()
  })

  it('reports indexed Event 404 as data inconsistency and supports retry', async () => {
    const loadEvent = vi
      .fn()
      .mockRejectedValueOnce(new TournamentDataHttpError(404))
      .mockResolvedValueOnce(eventFile)
    renderEvent({ loadEvent })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '大会一覧には存在しますが、詳細データが見つかりません。',
    )
    fireEvent.click(screen.getByRole('button', { name: '再試行' }))
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Synthetic Selection Cup',
      }),
    ).toBeInTheDocument()
    expect(loadEvent).toHaveBeenCalledTimes(2)
  })

  it('rejects Event ID and dataVersion mismatches', async () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/tournaments/synthetic-event-a']}>
        <Routes>
          <Route
            path="/tournaments/:eventId"
            element={
              <TournamentEventPage
                loadIndex={async () => SYNTHETIC_TOURNAMENT_INDEX}
                loadEvent={async () => ({
                  ...eventFile,
                  event: { ...eventFile.event, id: 'different-event' },
                })}
                loadOshiMaster={async () => SYNTHETIC_TOURNAMENT_OSHI_MASTER}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '大会詳細データを読み込めませんでした。',
    )
    unmount()

    renderEvent({ file: { ...eventFile, dataVersion: 'different-version' } })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '大会詳細データを読み込めませんでした。',
    )
  })

  it('renders an unknown type and missing participant count safely', async () => {
    const future = SYNTHETIC_TOURNAMENT_PUBLICATION.events['synthetic-event-c']
    renderEvent({
      file: {
        ...future,
        event: {
          ...future.event,
          id: 'synthetic-event-a',
          participantCount: undefined,
        },
      },
    })
    expect(await screen.findByText('その他')).toBeInTheDocument()
    expect(screen.queryByText('参加者')).not.toBeInTheDocument()
    expect(screen.queryByText('優勝結果のみ収録')).not.toBeInTheDocument()
  })

  it('keeps Results when the Oshi master is missing', async () => {
    render(
      <MemoryRouter initialEntries={['/tournaments/synthetic-event-a']}>
        <Routes>
          <Route
            path="/tournaments/:eventId"
            element={
              <TournamentEventPage
                loadIndex={async () => SYNTHETIC_TOURNAMENT_INDEX}
                loadEvent={async () => eventFile}
                loadOshiMaster={async () => {
                  throw new Error('missing')
                }}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    )
    expect((await screen.findAllByText('名称不明')).length).toBeGreaterThan(0)
    expect(
      screen.getAllByRole('link', { name: '結果詳細を見る' }),
    ).toHaveLength(8)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})

describe('Tournament Result detail', () => {
  const copiedDeck: Deck = {
    id: 'copied-deck-id',
    name: 'Synthetic Selection Cup 2026-09-26 1位',
    entries: [{ cardNumber: 'SYNTH-MAIN-a', quantity: 50 }],
    createdAt: '2026-10-03T00:00:00.000Z',
    updatedAt: '2026-10-03T00:00:00.000Z',
    regulationId: 'selection-cup-2026-autumn',
  }

  it('uses stable Result ID and renders Oshi, Main, Cheer and quantities', async () => {
    renderResult()
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'Synthetic Selection Cup',
    )
    expect(screen.getAllByText('Synthetic Oshi').length).toBeGreaterThan(0)
    expect(
      screen.getByRole('heading', { name: 'メインデッキ' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'エールデッキ' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Synthetic Main Card')).toBeInTheDocument()
    expect(screen.getByText('50枚')).toBeInTheDocument()
    expect(screen.getByText('20枚')).toBeInTheDocument()
    expect(screen.queryByText('収録範囲')).not.toBeInTheDocument()
    expect(screen.queryByText('1〜8位の結果を収録')).not.toBeInTheDocument()
    expect(
      screen
        .getByRole('heading', { name: '推しホロメン' })
        .closest('section')
        ?.querySelector('img'),
    ).toBeNull()
  })

  it('places Deck Code actions before the deck recipe in DOM order', async () => {
    renderResult()
    const deckCode = await screen.findByRole('heading', { name: 'Deck Log' })
    const recipe = screen.getByRole('heading', { name: '推しホロメン構成' })
    expect(
      deckCode.compareDocumentPosition(recipe) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'コードをコピー' })).toBeEnabled()
    expect(
      screen.getByRole('button', { name: 'HLSieveにコピー' }),
    ).toBeEnabled()
    expect(screen.getByRole('link', { name: /DECK LOGで見る/ })).toBeVisible()
  })

  it('matches Deck Editor display order for shuffled Main entries without mutation or quantity loss', async () => {
    const support = {
      ...cards.cards[0]!,
      cardNumber: 'A-SUPPORT',
      name: 'Support Card',
      cardType: 'support' as const,
      supportSearchCategory: 'general' as const,
    }
    const holomem = {
      ...cards.cards[0]!,
      cardNumber: 'Z-HOLOMEM',
      name: 'Holomem Card',
      cardType: 'holomem' as const,
      bloomLevel: 'debut' as const,
    }
    const shuffled = [
      { cardNumber: support.cardNumber, quantity: 4 },
      { cardNumber: holomem.cardNumber, quantity: 2 },
    ]
    const original = structuredClone(shuffled)
    const file: TournamentEventFile = {
      ...eventFile,
      event: {
        ...eventFile.event,
        results: eventFile.event.results.map((item, index) =>
          index === 0
            ? { ...item, deck: { ...item.deck, main: shuffled } }
            : item,
        ),
      },
    }
    const cardFile = { ...cards, cards: [support, holomem, ...cards.cards] }
    renderResult({ file, loadCards: async () => cardFile })
    const section = (
      await screen.findByRole('heading', {
        name: 'メインデッキ',
      })
    ).closest('section')!
    const rendered = Array.from(section.querySelectorAll('li')).map(
      (item) => item.querySelectorAll('span')[0]?.textContent,
    )
    const map = new Map(cardFile.cards.map((card) => [card.cardNumber, card]))
    expect(rendered).toEqual(
      sortDeckEntriesForDisplay(shuffled, map).map(
        ({ cardNumber }) => cardNumber,
      ),
    )
    expect(rendered).toEqual(['Z-HOLOMEM', 'A-SUPPORT'])
    expect(shuffled).toEqual(original)
    expect(shuffled.reduce((sum, item) => sum + item.quantity, 0)).toBe(6)
    expect(
      Array.from(section.querySelectorAll('li')).reduce(
        (sum, item) =>
          sum +
          Number.parseInt(item.textContent?.match(/(\d+)枚/)?.[1] ?? '0', 10),
        0,
      ),
    ).toBe(6)
  })

  it('renders Result not-found without falling back to rank', async () => {
    renderResult({ path: '/tournaments/synthetic-event-a/results/1' })
    expect(
      await screen.findByText('指定された大会結果は見つかりません。'),
    ).toBeInTheDocument()
  })

  it('degrades card lookup and preserves card number and quantity', async () => {
    renderResult({
      loadCards: async () => {
        throw new Error('offline')
      },
    })
    expect(
      await screen.findByText(/カード情報を一部表示できません/),
    ).toBeInTheDocument()
    expect(screen.getByText('SYNTH-MAIN-a')).toBeInTheDocument()
    expect(screen.getByText('50枚')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'HLSieveにコピー' }))
    await waitFor(() => expect(repositoryMocks.saveDeck).toHaveBeenCalledOnce())
  })

  it('shows Deck Log helper URL and external attributes', async () => {
    renderResult()
    const link = await screen.findByRole('link', { name: /DECK LOGで見る/ })
    expect(link).toHaveAttribute(
      'href',
      `https://deck-log-helper.invalid/${encodeURIComponent(result.deckLogCode!)}`,
    )
    expect(buildDeckLogPublicUrl).toHaveBeenCalledWith(result.deckLogCode)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('copies only the Deck Code and reports success and failure', async () => {
    const writeText = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    renderResult()
    const button = await screen.findByRole('button', { name: 'コードをコピー' })
    fireEvent.click(button)
    expect(
      await screen.findByText('Deck Codeをコピーしました。'),
    ).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith(result.deckLogCode)
    fireEvent.click(button)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'コピーできませんでした',
    )
  })

  it('shows explicit no-code text without empty actions', async () => {
    const noCode = SYNTHETIC_TOURNAMENT_PUBLICATION.events['synthetic-event-b']
    render(
      <MemoryRouter
        initialEntries={[
          '/tournaments/synthetic-event-a/results/synthetic-result-b-5',
        ]}
      >
        <Routes>
          <Route
            path="/tournaments/:eventId/results/:resultId"
            element={
              <TournamentResultPage
                loadIndex={async () => SYNTHETIC_TOURNAMENT_INDEX}
                loadEvent={async () => ({
                  ...noCode,
                  event: { ...noCode.event, id: 'synthetic-event-a' },
                })}
                loadOshiMaster={async () => SYNTHETIC_TOURNAMENT_OSHI_MASTER}
                loadCards={async () => cards}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Deck Codeなし')).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /DECK LOGで見る/ }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/DECK LOGで見る/)).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'HLSieveにコピー' }),
    ).toBeEnabled()
  })

  it('copies a valid Tournament Deck without a Deck Log code', async () => {
    const noCode = SYNTHETIC_TOURNAMENT_PUBLICATION.events['synthetic-event-b']
    renderResult({
      path: '/tournaments/synthetic-event-a/results/synthetic-result-b-5',
      file: {
        ...noCode,
        event: { ...noCode.event, id: 'synthetic-event-a' },
      },
      convertResult: () => copiedDeck,
    })
    fireEvent.click(
      await screen.findByRole('button', { name: 'HLSieveにコピー' }),
    )
    await waitFor(() =>
      expect(repositoryMocks.saveDeck).toHaveBeenCalledWith(copiedDeck),
    )
  })

  it('keeps text and actions after an image fails', async () => {
    renderResult()
    const [image] = await screen.findAllByRole('img', {
      name: 'Synthetic Oshiのカード画像',
    })
    fireEvent.error(image)
    expect(screen.getByText('画像を読み込めませんでした')).toBeInTheDocument()
    expect(screen.getAllByText('Synthetic Oshi').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'コードをコピー' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'HLSieveにコピー' }))
    await waitFor(() => expect(repositoryMocks.saveDeck).toHaveBeenCalledOnce())
  })

  it('reports unavailable clipboard as an error', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    })
    renderResult()
    fireEvent.click(
      await screen.findByRole('button', { name: 'コードをコピー' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Deck Codeをコピーできませんでした。',
    )
  })

  it('allows copying when the Oshi master fails', async () => {
    renderResult({
      loadOshi: async () => {
        throw new Error('missing')
      },
      convertResult: () => copiedDeck,
    })
    fireEvent.click(
      await screen.findByRole('button', { name: 'HLSieveにコピー' }),
    )
    await waitFor(() =>
      expect(repositoryMocks.saveDeck).toHaveBeenCalledWith(copiedDeck),
    )
  })

  it('converts the stable Result, saves through the repository, then navigates', async () => {
    const convertResult = vi.fn(() => copiedDeck)
    renderResult({ convertResult })
    fireEvent.click(
      await screen.findByRole('button', { name: 'HLSieveにコピー' }),
    )
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/decks/copied-deck-id',
      ),
    )
    expect(convertResult).toHaveBeenCalledWith(eventFile.event, result)
    expect(repositoryMocks.saveDeck).toHaveBeenCalledWith(copiedDeck)
  })

  it('keeps the generated Deck after failure and reuses it on retry', async () => {
    repositoryMocks.saveDeck
      .mockRejectedValueOnce(new Error('write failed'))
      .mockResolvedValueOnce(undefined)
    const convertResult = vi.fn(() => copiedDeck)
    renderResult({ convertResult })
    fireEvent.click(
      await screen.findByRole('button', { name: 'HLSieveにコピー' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'デッキを保存できませんでした',
    )
    expect(screen.getByTestId('location')).not.toHaveTextContent('/decks/')
    fireEvent.click(screen.getByRole('button', { name: 'HLSieveにコピー' }))
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/decks/copied-deck-id',
      ),
    )
    expect(convertResult).toHaveBeenCalledOnce()
    expect(repositoryMocks.saveDeck).toHaveBeenNthCalledWith(1, copiedDeck)
    expect(repositoryMocks.saveDeck).toHaveBeenNthCalledWith(2, copiedDeck)
  })

  it('disables saving and prevents a rapid double submit', async () => {
    let resolveSave: (() => void) | undefined
    repositoryMocks.saveDeck.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve
        }),
    )
    renderResult({ convertResult: () => copiedDeck })
    const button = await screen.findByRole('button', {
      name: 'HLSieveにコピー',
    })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(screen.getByRole('button', { name: 'コピー中…' })).toBeDisabled()
    expect(screen.getByText('デッキをコピーしています…')).toBeInTheDocument()
    expect(repositoryMocks.saveDeck).toHaveBeenCalledOnce()
    expect(screen.getByTestId('location')).not.toHaveTextContent('/decks/')
    resolveSave?.()
  })
})
