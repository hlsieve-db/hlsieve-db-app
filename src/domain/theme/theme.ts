export const THEME_STORAGE_KEY = 'hlsieve:theme'
export const SYSTEM_DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)'

export type ThemePreference = 'system' | 'light' | 'dark'
export type EffectiveTheme = 'light' | 'dark'

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function readThemePreference(
  storage: Pick<Storage, 'getItem'> = window.localStorage,
): ThemePreference {
  try {
    const value = storage.getItem(THEME_STORAGE_KEY)
    return isThemePreference(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

export function writeThemePreference(
  preference: ThemePreference,
  storage: Pick<Storage, 'setItem'> = window.localStorage,
): void {
  try {
    storage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // The selected theme still applies for this session when storage is blocked.
  }
}

export function resolveEffectiveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): EffectiveTheme {
  return preference === 'system'
    ? systemPrefersDark
      ? 'dark'
      : 'light'
    : preference
}

export function applyEffectiveTheme(
  theme: EffectiveTheme,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.theme = theme
  root.style.colorScheme = theme
  root.style.backgroundColor = theme === 'dark' ? '#0b121a' : '#f3f7fa'
  const themeColor = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  )
  themeColor?.setAttribute('content', theme === 'dark' ? '#0b121a' : '#f3f7fa')
}
