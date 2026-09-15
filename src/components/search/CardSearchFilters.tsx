import {
  CARD_COLOR_LABELS,
  CRITICAL_COLOR_LABELS,
  EFFECT_TAG_LABELS,
} from '../../domain/cards/constants'
import type {
  CardColor,
  CriticalColor,
  EffectTag,
} from '../../domain/cards/types'
import {
  BLOOM_FILTER_LABELS,
  CARD_TYPE_FILTER_LABELS,
  MATCH_MODE_LABELS,
} from '../../domain/search/constants'
import type { SearchUrlState } from '../../domain/search/searchUrlState'
import type {
  BloomFilterValue,
  CardTypeFilterValue,
  MatchMode,
} from '../../domain/search/types'

export type CardSearchFilterState = Pick<
  SearchUrlState,
  | 'colors'
  | 'colorMode'
  | 'cardTypes'
  | 'bloom'
  | 'criticalColors'
  | 'criticalColorMode'
  | 'effectTags'
  | 'effectTagMode'
>

type CardSearchFiltersProps = {
  state: CardSearchFilterState
  onChange: (patch: Partial<CardSearchFilterState>) => void
  variant?: 'all' | 'basic' | 'advanced'
  idPrefix?: string
}

function toggleValue<T>(values: readonly T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value]
}

function ModeSelect({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string
  label: string
  value: MatchMode
  disabled: boolean
  onChange: (mode: MatchMode) => void
}) {
  return (
    <label className="filter-mode" htmlFor={id}>
      <span>{label}</span>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value as MatchMode)}
      >
        {Object.entries(MATCH_MODE_LABELS).map(([mode, modeLabel]) => (
          <option key={mode} value={mode}>
            {modeLabel}
          </option>
        ))}
      </select>
    </label>
  )
}

function Checkboxes<T extends string>({
  name,
  labels,
  selected,
  onToggle,
}: {
  name: string
  labels: Record<T, string>
  selected: readonly T[]
  onToggle: (value: T) => void
}) {
  return (
    <div className="filter-options">
      {(Object.entries(labels) as [T, string][]).map(([value, label]) => (
        <label className="filter-option" key={value}>
          <input
            type="checkbox"
            name={name}
            value={value}
            checked={selected.includes(value)}
            aria-label={
              value === 'second_turn_one' ? '後攻1ターン目限定効果' : label
            }
            onChange={() => onToggle(value)}
          />
          <span
            title={
              value === 'second_turn_one' ? '後攻1ターン目限定効果' : undefined
            }
          >
            {label}
          </span>
        </label>
      ))}
    </div>
  )
}

export function CardSearchFilters({
  state,
  onChange,
  variant = 'all',
  idPrefix = '',
}: CardSearchFiltersProps) {
  const showBasic = variant !== 'advanced'
  const showAdvanced = variant !== 'basic'
  return (
    <div className="filter-groups">
      {showBasic && (
        <fieldset className="filter-group">
          <legend>色</legend>
          <div className="filter-group__mode">
            <ModeSelect
              id={`${idPrefix}color-mode`}
              label="色の一致条件"
              value={state.colorMode}
              disabled={state.colors.length === 0}
              onChange={(colorMode) => onChange({ colorMode })}
            />
          </div>
          <Checkboxes<CardColor>
            name="color"
            labels={CARD_COLOR_LABELS}
            selected={state.colors}
            onToggle={(color) =>
              onChange({ colors: toggleValue(state.colors, color) })
            }
          />
        </fieldset>
      )}

      {showAdvanced && (
        <fieldset className="filter-group">
          <legend>カードタイプ</legend>
          <Checkboxes<CardTypeFilterValue>
            name="card-type"
            labels={CARD_TYPE_FILTER_LABELS}
            selected={state.cardTypes}
            onToggle={(cardType) =>
              onChange({ cardTypes: toggleValue(state.cardTypes, cardType) })
            }
          />
        </fieldset>
      )}

      {showAdvanced && (
        <fieldset className="filter-group">
          <legend>Bloom / Buzz</legend>
          <Checkboxes<BloomFilterValue>
            name="bloom"
            labels={BLOOM_FILTER_LABELS}
            selected={state.bloom}
            onToggle={(bloom) =>
              onChange({ bloom: toggleValue(state.bloom, bloom) })
            }
          />
        </fieldset>
      )}

      {showAdvanced && (
        <fieldset className="filter-group">
          <legend>Critical</legend>
          <div className="filter-group__mode">
            <ModeSelect
              id={`${idPrefix}critical-mode`}
              label="Criticalの一致条件"
              value={state.criticalColorMode}
              disabled={state.criticalColors.length === 0}
              onChange={(criticalColorMode) => onChange({ criticalColorMode })}
            />
          </div>
          <Checkboxes<CriticalColor>
            name="critical-color"
            labels={CRITICAL_COLOR_LABELS}
            selected={state.criticalColors}
            onToggle={(criticalColor) =>
              onChange({
                criticalColors: toggleValue(
                  state.criticalColors,
                  criticalColor,
                ),
              })
            }
          />
        </fieldset>
      )}

      {showAdvanced && (
        <fieldset
          className="filter-group filter-group--wide"
          id="effect-tags-section"
        >
          <legend>効果タグ</legend>
          <div className="filter-group__mode">
            <ModeSelect
              id={`${idPrefix}effect-tag-mode`}
              label="効果タグの一致条件"
              value={state.effectTagMode}
              disabled={state.effectTags.length === 0}
              onChange={(effectTagMode) => onChange({ effectTagMode })}
            />
          </div>
          <Checkboxes<EffectTag>
            name="effect-tag"
            labels={EFFECT_TAG_LABELS}
            selected={state.effectTags}
            onToggle={(effectTag) =>
              onChange({ effectTags: toggleValue(state.effectTags, effectTag) })
            }
          />
          <p className="effect-tag-note">
            「後攻1T効果」は「後攻1ターン目限定効果」の短縮表示
          </p>
        </fieldset>
      )}
    </div>
  )
}
