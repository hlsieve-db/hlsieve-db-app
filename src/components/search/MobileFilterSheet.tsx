import { useEffect, useRef } from 'react'
import {
  CardSearchFilters,
  type CardSearchFilterState,
} from './CardSearchFilters'

export function MobileFilterSheet({
  state,
  onChange,
  resultCount,
  onClose,
}: {
  state: CardSearchFilterState
  onChange: (patch: Partial<CardSearchFilterState>) => void
  resultCount: number
  onClose: () => void
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    headingRef.current?.focus()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])
  return (
    <div className="mobile-filter-sheet__scrim" onClick={onClose}>
      <section
        className="mobile-filter-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-filter-heading"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mobile-filter-sheet__header">
          <h2 id="mobile-filter-heading" tabIndex={-1} ref={headingRef}>
            絞り込み
          </h2>
          <button
            type="button"
            className="button button--secondary"
            onClick={onClose}
          >
            閉じる
          </button>
        </div>
        <CardSearchFilters
          state={state}
          onChange={onChange}
          idPrefix="mobile-"
        />
        <button
          type="button"
          className="button mobile-filter-sheet__apply"
          onClick={onClose}
        >
          {resultCount}件を表示
        </button>
      </section>
    </div>
  )
}
