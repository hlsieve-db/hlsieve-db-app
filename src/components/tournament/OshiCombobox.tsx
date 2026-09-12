import { useId, useMemo, useState } from 'react'

import type { Card } from '../../domain/cards/types'
import {
  formatOshiOptionLabel,
  searchOshiCandidates,
} from '../../domain/tournamentReport/oshi'

const MAX_VISIBLE_OPTIONS = 20

type OshiComboboxProps = {
  label: string
  cards: readonly Card[]
  selectedCardNumber?: string
  disabled?: boolean
  onChange: (cardNumber: string | undefined) => void
}

export function OshiCombobox({
  label,
  cards,
  selectedCardNumber,
  disabled = false,
  onChange,
}: OshiComboboxProps) {
  const inputId = useId()
  const listboxId = `${inputId}-listbox`
  const selectedCard = cards.find(
    (card) => card.cardNumber === selectedCardNumber,
  )
  const [query, setQuery] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const inputValue =
    query ?? (selectedCard ? formatOshiOptionLabel(selectedCard, cards) : '')
  const matches = useMemo(
    () => searchOshiCandidates(cards, inputValue).slice(0, MAX_VISIBLE_OPTIONS),
    [cards, inputValue],
  )

  return (
    <div className="oshi-combobox">
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        autoComplete="off"
        disabled={disabled}
        placeholder={
          disabled ? 'カードデータを読み込み中…' : '名前・読み・カード番号'
        }
        value={inputValue}
        onFocus={() => setIsOpen(true)}
        onChange={(event) => {
          setQuery(event.currentTarget.value)
          onChange(undefined)
          setIsOpen(true)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setIsOpen(false)
        }}
      />
      {isOpen && !disabled && (
        <div className="oshi-combobox__options" id={listboxId} role="listbox">
          {matches.length === 0 ? (
            <p>候補がありません</p>
          ) : (
            matches.map((card) => (
              <button
                key={card.cardNumber}
                type="button"
                role="option"
                aria-selected={card.cardNumber === selectedCardNumber}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(card.cardNumber)
                  setQuery(null)
                  setIsOpen(false)
                }}
              >
                <span>{formatOshiOptionLabel(card, cards)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
