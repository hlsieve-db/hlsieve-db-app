import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  SYSTEM_DARK_MEDIA_QUERY,
  applyEffectiveTheme,
  readThemePreference,
  resolveEffectiveTheme,
  writeThemePreference,
  type ThemePreference,
} from '../domain/theme/theme'

export function useTheme() {
  const [preference, setPreferenceState] = useState(readThemePreference)
  const mediaQuery = useMemo(
    () => window.matchMedia(SYSTEM_DARK_MEDIA_QUERY),
    [],
  )
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => mediaQuery.matches,
  )
  const effectiveTheme = resolveEffectiveTheme(preference, systemPrefersDark)

  useEffect(() => {
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches)
    }
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [mediaQuery])

  useEffect(() => {
    applyEffectiveTheme(effectiveTheme)
  }, [effectiveTheme])

  const setPreference = useCallback((next: ThemePreference) => {
    writeThemePreference(next)
    setPreferenceState(next)
  }, [])

  return { preference, effectiveTheme, setPreference }
}
