import { DeckQuantityValue } from './DeckEntryPresentation'

type DeckQuantityControlProps = {
  cardName: string
  quantity: number
  disabled?: boolean
  onDecrement: () => void
  onIncrement: () => void
}

export function DeckQuantityControl({
  cardName,
  quantity,
  disabled = false,
  onDecrement,
  onIncrement,
}: DeckQuantityControlProps) {
  return (
    <div className="deck-quantity-control" aria-label={`${cardName}の枚数`}>
      <button
        type="button"
        aria-label={`${cardName}を1枚減らす`}
        disabled={disabled || quantity === 0}
        onClick={onDecrement}
      >
        −
      </button>
      <DeckQuantityValue quantity={quantity} />
      <button
        type="button"
        aria-label={`${cardName}を1枚追加`}
        disabled={disabled}
        onClick={onIncrement}
      >
        ＋
      </button>
    </div>
  )
}
