import type { ReactNode } from 'react'

type DeckEntryPresentationProps = {
  cardNumber: string
  compact?: boolean
  image?: ReactNode
  name: string
  quantity: number
  quantityControl?: ReactNode
  informationExtra?: ReactNode
  afterInformation?: ReactNode
  removeAction?: ReactNode
}

export function DeckQuantityValue({ quantity }: { quantity: number }) {
  return <output aria-label={`現在 ${quantity}枚`}>{quantity}</output>
}

export function DeckEntryPresentation({
  cardNumber,
  compact = false,
  image,
  name,
  quantity,
  quantityControl,
  informationExtra,
  afterInformation,
  removeAction,
}: DeckEntryPresentationProps) {
  return (
    <li
      className={`deck-entry${compact ? ' deck-entry--compact' : ''}${image ? '' : ' deck-entry--without-image'}`}
    >
      {image}
      <div className="deck-entry__information">
        <h4>{name}</h4>
        {name !== cardNumber && <p>{cardNumber}</p>}
        {informationExtra}
      </div>
      {quantityControl ?? (
        <div className="deck-quantity-control deck-quantity-control--readonly">
          <DeckQuantityValue quantity={quantity} />
        </div>
      )}
      {afterInformation}
      {removeAction}
    </li>
  )
}
