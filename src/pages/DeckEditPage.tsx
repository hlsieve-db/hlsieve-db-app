import { useParams } from 'react-router-dom'

export function DeckEditPage() {
  const { deckId } = useParams<'deckId'>()

  return (
    <>
      <h1>デッキ編集</h1>
      {deckId && <p>deckId: {deckId}</p>}
    </>
  )
}
