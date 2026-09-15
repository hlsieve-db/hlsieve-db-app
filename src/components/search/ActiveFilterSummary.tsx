import {
  CARD_COLOR_LABELS,
  CRITICAL_COLOR_LABELS,
} from '../../domain/cards/constants'
import {
  BLOOM_FILTER_LABELS,
  CARD_TYPE_FILTER_LABELS,
} from '../../domain/search/constants'
import type { SearchUrlState } from '../../domain/search/searchUrlState'

export function ActiveFilterSummary({
  state,
  onRemove,
  onClear,
}: {
  state: SearchUrlState
  onRemove: (patch: Partial<SearchUrlState>) => void
  onClear: () => void
}) {
  const chips: {
    label: string
    key: string
    patch: Partial<SearchUrlState>
  }[] = []
  if (state.query)
    chips.push({ label: state.query, key: 'query', patch: { query: '' } })
  state.colors.forEach((value) =>
    chips.push({
      label: CARD_COLOR_LABELS[value],
      key: `color-${value}`,
      patch: { colors: state.colors.filter((item) => item !== value) },
    }),
  )
  if (state.cardTypes.length > 2)
    chips.push({
      label: `カードタイプ ${state.cardTypes.length}`,
      key: 'cardTypes',
      patch: { cardTypes: [] },
    })
  else
    state.cardTypes.forEach((value) =>
      chips.push({
        label: CARD_TYPE_FILTER_LABELS[value],
        key: `cardType-${value}`,
        patch: {
          cardTypes: state.cardTypes.filter((item) => item !== value),
        },
      }),
    )
  state.bloom.forEach((value) =>
    chips.push({
      label: BLOOM_FILTER_LABELS[value],
      key: `bloom-${value}`,
      patch: { bloom: state.bloom.filter((item) => item !== value) },
    }),
  )
  state.criticalColors.forEach((value) =>
    chips.push({
      label: CRITICAL_COLOR_LABELS[value],
      key: `critical-${value}`,
      patch: {
        criticalColors: state.criticalColors.filter((item) => item !== value),
      },
    }),
  )
  if (state.effectTags.length)
    chips.push({
      label: `効果タグ ${state.effectTags.length}`,
      key: 'effectTags',
      patch: { effectTags: [] },
    })
  if (!chips.length) return null
  return (
    <section
      className="active-filter-summary"
      aria-label="適用中の絞り込み条件"
    >
      <div className="active-filter-summary__chips" role="list">
        {chips.map((chip) => (
          <span
            className="active-filter-chip"
            role="listitem"
            key={chip.key}
            title={chip.label}
          >
            <span>{chip.label}</span>
            <button
              type="button"
              aria-label={`${chip.label}の条件を外す`}
              onClick={() => onRemove(chip.patch)}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <button
        type="button"
        className="button button--secondary active-filter-summary__clear"
        onClick={onClear}
      >
        すべてクリア
      </button>
    </section>
  )
}
