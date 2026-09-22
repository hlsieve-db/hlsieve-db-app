import { useId, useMemo, useRef, useState } from 'react'

import type { Card } from '../../domain/cards/types'
import {
  formatOshiOptionLabel,
  searchOshiCandidates,
} from '../../domain/tournamentReport/oshi'

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
  const imeHintId = `${inputId}-ime-hint`
  const selectedCard = cards.find(
    (card) => card.cardNumber === selectedCardNumber,
  )
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const inputValue =
    query ?? (selectedCard ? formatOshiOptionLabel(selectedCard, cards) : '')
  // Filtering on the typed query rather than the displayed value keeps the
  // full candidate list available on focus, including once a card is
  // selected and its label is what the input shows. The listbox scrolls
  // internally, so every candidate stays reachable by tap alone.
  const matches = useMemo(
    () => searchOshiCandidates(cards, query ?? ''),
    [cards, query],
  )
  const canClear = !disabled && inputValue !== ''

  const clear = () => {
    // Clearing the typed query and the parent's selection together keeps the
    // displayed value and the report in sync, whatever was in the field.
    setQuery('')
    onChange(undefined)
    setIsOpen(true)
    inputRef.current?.focus()
  }

  return (
    <div className="oshi-combobox">
      <label htmlFor={inputId}>{label}</label>
      <div className="oshi-combobox__field">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          inputMode="text"
          lang="ja"
          autoCapitalize="none"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={isOpen}
          // The field takes Japanese names and readings, so the browser's
          // Latin text services only get in the way. None of this can choose
          // the on-screen keyboard: a page cannot switch it, so the hint below
          // tells the reader how to do it instead.
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          aria-describedby={imeHintId}
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
        {canClear && (
          <button
            className="oshi-combobox__clear"
            type="button"
            aria-label={`${label}をクリア`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.stopPropagation()
              clear()
            }}
          >
            <span aria-hidden="true">×</span>
          </button>
        )}
      </div>
      {/* Shown only at phone widths, where the keyboard is on screen and often
          opens in English. Selecting the candidate from the list below works
          without switching at all, so this is a shortcut rather than a
          requirement. */}
      <p className="oshi-combobox__ime-hint" id={imeHintId}>
        英字キーボードの場合は、🌐から「日本語かな」を選択してください
      </p>
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
