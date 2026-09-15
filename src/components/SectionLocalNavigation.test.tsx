import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { SectionLocalNavigation } from './SectionLocalNavigation'

describe('SectionLocalNavigation', () => {
  it.each([
    {
      group: 'cards' as const,
      path: '/qa',
      label: 'カードメニュー',
      links: ['カード検索', 'お気に入り', '最近見たカード', '公式Q&A'],
      current: '公式Q&A',
    },
    {
      group: 'decks' as const,
      path: '/deck-compare',
      label: 'デッキメニュー',
      links: ['保存デッキ', 'デッキ比較'],
      current: 'デッキ比較',
    },
    {
      group: 'tournament' as const,
      path: '/tournament-history',
      label: '大会戦績メニュー',
      links: ['戦績を作成', '履歴', '統計'],
      current: '履歴',
    },
    {
      group: 'tools' as const,
      path: '/mulligan',
      label: 'ツールメニュー',
      links: ['確率計算', 'マリガン計算', 'スイス計算'],
      current: 'マリガン計算',
    },
  ])('renders the $group local destinations once', (entry) => {
    render(
      <MemoryRouter initialEntries={[entry.path]}>
        <SectionLocalNavigation groupKey={entry.group} />
      </MemoryRouter>,
    )

    const navigation = screen.getByRole('navigation', { name: entry.label })
    expect(
      within(navigation)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(entry.links)
    expect(
      within(navigation).getByRole('link', { name: entry.current }),
    ).toHaveAttribute('aria-current', 'page')
  })
})
