import { createContext } from 'react'

import type { AppRepositories } from './appRepositories'

export const AppRepositoriesContext = createContext<
  AppRepositories | undefined
>(undefined)
