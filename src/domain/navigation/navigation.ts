export type NavigationGroupKey = 'cards' | 'decks' | 'tournament' | 'tools'

export type NavigationItem = {
  label: string
  shortLabel: string
  to: string
}

export type NavigationGroup = {
  key: NavigationGroupKey
  label: string
  items: readonly NavigationItem[]
  matches: (pathname: string) => boolean
}

export const NAV_GROUPS: readonly NavigationGroup[] = [
  {
    key: 'cards',
    label: 'カード',
    matches: (pathname) =>
      pathname.startsWith('/cards') ||
      pathname === '/favorites' ||
      pathname === '/recent' ||
      pathname === '/qa',
    items: [
      { label: 'カード検索', shortLabel: 'カード検索', to: '/cards' },
      { label: 'お気に入り', shortLabel: 'お気に入り', to: '/favorites' },
      {
        label: '最近見たカード',
        shortLabel: '最近見たカード',
        to: '/recent',
      },
      { label: '公式Q&A検索', shortLabel: '公式Q&A', to: '/qa' },
    ],
  },
  {
    key: 'decks',
    label: 'デッキ',
    matches: (pathname) =>
      pathname.startsWith('/decks') ||
      pathname === '/deck-compare' ||
      pathname === '/deck/share',
    items: [
      { label: '保存デッキ', shortLabel: '保存デッキ', to: '/decks' },
      { label: 'デッキ比較', shortLabel: 'デッキ比較', to: '/deck-compare' },
    ],
  },
  {
    key: 'tournament',
    label: '大会',
    matches: (pathname) => pathname.startsWith('/tournament-'),
    items: [
      {
        label: '大会戦績を作成',
        shortLabel: '戦績を作成',
        to: '/tournament-report',
      },
      {
        label: '大会戦績履歴',
        shortLabel: '履歴',
        to: '/tournament-history',
      },
      {
        label: '大会戦績統計',
        shortLabel: '統計',
        to: '/tournament-stats',
      },
    ],
  },
  {
    key: 'tools',
    label: 'ツール',
    matches: (pathname) =>
      pathname === '/probability' ||
      pathname === '/mulligan' ||
      pathname === '/swiss',
    items: [
      { label: '確率計算', shortLabel: '確率計算', to: '/probability' },
      {
        label: 'マリガン計算',
        shortLabel: 'マリガン計算',
        to: '/mulligan',
      },
      { label: 'スイス計算', shortLabel: 'スイス計算', to: '/swiss' },
    ],
  },
] as const

export const UPDATES_NAV_ITEM = {
  label: '更新履歴',
  shortLabel: '更新履歴',
  to: '/updates',
} as const

export function activeNavigationGroup(
  pathname: string,
): NavigationGroupKey | undefined {
  return NAV_GROUPS.find((group) => group.matches(pathname))?.key
}
