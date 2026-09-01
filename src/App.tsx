import { Navigate, Route, Routes } from 'react-router-dom'
import { CardDetailPage } from './pages/CardDetailPage'
import { CardSearchPage } from './pages/CardSearchPage'
import { DeckEditPage } from './pages/DeckEditPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { SavedDecksPage } from './pages/SavedDecksPage'
import { SharedDeckPage } from './pages/SharedDeckPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/cards" replace />} />
      <Route path="/cards" element={<CardSearchPage />} />
      <Route path="/cards/:cardNumber" element={<CardDetailPage />} />
      <Route path="/deck/share" element={<SharedDeckPage />} />
      <Route path="/deck/:deckId" element={<DeckEditPage />} />
      <Route path="/decks" element={<SavedDecksPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
