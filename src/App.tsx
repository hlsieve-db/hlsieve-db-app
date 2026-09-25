import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthGate } from './auth/AuthGate'
import { CloudDeckSyncRetry } from './cloud/CloudDeckSyncRetry'
import { AuthProvider } from './auth/AuthProvider'
import { namespaceForAuthState, namespaceKey } from './auth/authState'
import { useAuth } from './auth/useAuth'
import { AccountPage } from './pages/AccountPage'
import { AppFooter } from './components/AppFooter'
import { FavoriteCardsProvider } from './contexts/FavoriteCardsContext'
import { AppRepositoriesProvider } from './repositories/AppRepositoriesProvider'
import { CardDetailPage } from './pages/CardDetailPage'
import { CardSearchPage } from './pages/CardSearchPage'
import { DeckEditPage } from './pages/DeckEditPage'
import { DeckVersionsPage } from './pages/DeckVersionsPage'
import { DeckComparePage } from './pages/DeckComparePage'
import { DisclaimerPage } from './pages/DisclaimerPage'
import { ContactPage } from './pages/ContactPage'
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage'
import { FavoriteCardsPage } from './pages/FavoriteCardsPage'
import { RecentlyViewedCardsPage } from './pages/RecentlyViewedCardsPage'
import { MulliganPage } from './pages/MulliganPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ProbabilityPage } from './pages/ProbabilityPage'
import { QaSearchPage } from './pages/QaSearchPage'
import { SavedDecksPage } from './pages/SavedDecksPage'
import { SharedDeckPage } from './pages/SharedDeckPage'
import { ShortSharePage } from './pages/ShortSharePage'
import { SwissPage } from './pages/SwissPage'
import { TournamentReportPage } from './pages/TournamentReportPage'
import { TournamentHistoryPage } from './pages/TournamentHistoryPage'
import { TournamentStatsPage } from './pages/TournamentStatsPage'
import { UpdateHistoryPage } from './pages/UpdateHistoryPage'

function AppRoutes() {
  const { state } = useAuth()

  return (
    // Keyed by account so switching users starts the tree from scratch
    // instead of reusing state loaded for the previous one.
    <AppRepositoriesProvider key={namespaceKey(namespaceForAuthState(state))}>
      <FavoriteCardsProvider>
        {/* Finishes sending deck changes that failed earlier. Renders nothing,
            and sends nothing that the reporter did not already change. */}
        <CloudDeckSyncRetry />
        <Routes>
          <Route path="/" element={<Navigate to="/cards" replace />} />
          <Route path="/cards" element={<CardSearchPage />} />
          <Route path="/cards/:cardNumber" element={<CardDetailPage />} />
          <Route path="/favorites" element={<FavoriteCardsPage />} />
          <Route path="/recent" element={<RecentlyViewedCardsPage />} />
          <Route path="/deck/share" element={<SharedDeckPage />} />
          <Route path="/s/:shareId" element={<ShortSharePage />} />
          <Route path="/decks" element={<SavedDecksPage />} />
          <Route path="/deck-compare" element={<DeckComparePage />} />
          <Route path="/decks/:deckId" element={<DeckEditPage />} />
          <Route
            path="/decks/:deckId/versions"
            element={<DeckVersionsPage />}
          />
          <Route path="/updates" element={<UpdateHistoryPage />} />
          <Route path="/probability" element={<ProbabilityPage />} />
          <Route path="/qa" element={<QaSearchPage />} />
          <Route path="/mulligan" element={<MulliganPage />} />
          <Route path="/swiss" element={<SwissPage />} />
          <Route path="/tournament-report" element={<TournamentReportPage />} />
          <Route
            path="/tournament-history"
            element={<TournamentHistoryPage />}
          />
          <Route path="/tournament-stats" element={<TournamentStatsPage />} />
          <Route path="/disclaimer" element={<DisclaimerPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        <AppFooter />
      </FavoriteCardsProvider>
    </AppRepositoriesProvider>
  )
}

function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <AppRoutes />
      </AuthGate>
    </AuthProvider>
  )
}

export default App
