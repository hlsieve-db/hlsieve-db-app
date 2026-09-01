import { useParams } from 'react-router-dom'

export function CardDetailPage() {
  const { cardNumber } = useParams<'cardNumber'>()

  return (
    <>
      <h1>カード詳細</h1>
      {cardNumber && <p>cardNumber: {cardNumber}</p>}
    </>
  )
}
