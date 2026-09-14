import { Navigate, Route, Routes } from 'react-router-dom'
import { AppFooter } from './components/AppFooter'
import { FavoriteCardsProvider } from './contexts/FavoriteCardsContext'
import { CardDetailPage } from './pages/CardDetailPage'
import { CardSearchPage } from './pages/CardSearchPage'
import { DeckEditPage } from './pages/DeckEditPage'
import { DeckComparePage } from './pages/DeckComparePage'
import { DisclaimerPage } from './pages/DisclaimerPage'
import { FavoriteCardsPage } from './pages/FavoriteCardsPage'
import { MulliganPage } from './pages/MulliganPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ProbabilityPage } from './pages/ProbabilityPage'
import { QaSearchPage } from './pages/QaSearchPage'
import { SavedDecksPage } from './pages/SavedDecksPage'
import { SharedDeckPage } from './pages/SharedDeckPage'
import { SwissPage } from './pages/SwissPage'
import { TournamentReportPage } from './pages/TournamentReportPage'
import { TournamentHistoryPage } from './pages/TournamentHistoryPage'
import { TournamentStatsPage } from './pages/TournamentStatsPage'
import { UpdateHistoryPage } from './pages/UpdateHistoryPage'

function App() {
  return (
    <FavoriteCardsProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/cards" replace />} />
        <Route path="/cards" element={<CardSearchPage />} />
        <Route path="/cards/:cardNumber" element={<CardDetailPage />} />
        <Route path="/favorites" element={<FavoriteCardsPage />} />
        <Route path="/deck/share" element={<SharedDeckPage />} />
        <Route path="/decks" element={<SavedDecksPage />} />
        <Route path="/deck-compare" element={<DeckComparePage />} />
        <Route path="/decks/:deckId" element={<DeckEditPage />} />
        <Route path="/updates" element={<UpdateHistoryPage />} />
        <Route path="/probability" element={<ProbabilityPage />} />
        <Route path="/qa" element={<QaSearchPage />} />
        <Route path="/mulligan" element={<MulliganPage />} />
        <Route path="/swiss" element={<SwissPage />} />
        <Route path="/tournament-report" element={<TournamentReportPage />} />
        <Route path="/tournament-history" element={<TournamentHistoryPage />} />
        <Route path="/tournament-stats" element={<TournamentStatsPage />} />
        <Route path="/disclaimer" element={<DisclaimerPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <AppFooter />
    </FavoriteCardsProvider>
  )
}

export default App
