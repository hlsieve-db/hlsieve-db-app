import { Navigate, Route, Routes } from 'react-router-dom'
import { AppFooter } from './components/AppFooter'
import { CardDetailPage } from './pages/CardDetailPage'
import { CardSearchPage } from './pages/CardSearchPage'
import { DeckEditPage } from './pages/DeckEditPage'
import { DisclaimerPage } from './pages/DisclaimerPage'
import { MulliganPage } from './pages/MulliganPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ProbabilityPage } from './pages/ProbabilityPage'
import { SavedDecksPage } from './pages/SavedDecksPage'
import { SharedDeckPage } from './pages/SharedDeckPage'
import { SwissPage } from './pages/SwissPage'
import { TournamentReportPage } from './pages/TournamentReportPage'
import { TournamentHistoryPage } from './pages/TournamentHistoryPage'
import { TournamentStatsPage } from './pages/TournamentStatsPage'
import { UpdateHistoryPage } from './pages/UpdateHistoryPage'

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/cards" replace />} />
        <Route path="/cards" element={<CardSearchPage />} />
        <Route path="/cards/:cardNumber" element={<CardDetailPage />} />
        <Route path="/deck/share" element={<SharedDeckPage />} />
        <Route path="/decks" element={<SavedDecksPage />} />
        <Route path="/decks/:deckId" element={<DeckEditPage />} />
        <Route path="/updates" element={<UpdateHistoryPage />} />
        <Route path="/probability" element={<ProbabilityPage />} />
        <Route path="/mulligan" element={<MulliganPage />} />
        <Route path="/swiss" element={<SwissPage />} />
        <Route path="/tournament-report" element={<TournamentReportPage />} />
        <Route path="/tournament-history" element={<TournamentHistoryPage />} />
        <Route path="/tournament-stats" element={<TournamentStatsPage />} />
        <Route path="/disclaimer" element={<DisclaimerPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <AppFooter />
    </>
  )
}

export default App
