import type { Card } from '../../domain/cards/types'
import type {
  InitiativeChoiceResult,
  MatchResult,
  PlayOrder,
  TournamentRound,
} from '../../domain/tournamentReport/types'
import { OshiCombobox } from './OshiCombobox'

type RoundEditorProps = {
  label: string
  round: TournamentRound
  oshiCards: readonly Card[]
  onChange: (round: TournamentRound) => void
  onRemove: () => void
}

function optionalValue<T extends string>(value: string): T | undefined {
  return value === '' ? undefined : (value as T)
}

export function RoundEditor({
  label,
  round,
  oshiCards,
  onChange,
  onRemove,
}: RoundEditorProps) {
  const inputName = `round-${label}`

  return (
    <fieldset className="tournament-round">
      <legend>{label}</legend>
      <button
        className="button button--secondary tournament-round__remove"
        type="button"
        aria-label={`${label}を削除`}
        onClick={onRemove}
      >
        回戦を削除
      </button>

      <OshiCombobox
        label={`${label} 対戦相手の推し`}
        cards={oshiCards}
        selectedCardNumber={round.opponentOshiCardNumber}
        onChange={(opponentOshiCardNumber) =>
          onChange({ ...round, opponentOshiCardNumber })
        }
      />

      <fieldset className="tournament-round__choice">
        <legend>先攻・後攻</legend>
        {[
          ['', '未入力'],
          ['first', '先攻'],
          ['second', '後攻'],
        ].map(([value, text]) => (
          <label key={value || 'unset'}>
            <input
              type="radio"
              name={`${inputName}-play-order`}
              value={value}
              checked={(round.playOrder ?? '') === value}
              onChange={(event) =>
                onChange({
                  ...round,
                  playOrder: optionalValue<PlayOrder>(
                    event.currentTarget.value,
                  ),
                })
              }
            />
            <span>{text}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="tournament-round__choice">
        <legend>手番選択権</legend>
        {[
          ['', '未入力', '未入力'],
          ['won_choice', '⚀○', '⚀○ 手番選択権あり'],
          ['lost_choice', '⚀×', '⚀× 手番選択権なし'],
        ].map(([value, text, accessibleLabel]) => (
          <label key={value || 'unset'}>
            <input
              type="radio"
              name={`${inputName}-initiative`}
              value={value}
              aria-label={accessibleLabel}
              checked={(round.initiativeChoiceResult ?? '') === value}
              onChange={(event) =>
                onChange({
                  ...round,
                  initiativeChoiceResult: optionalValue<InitiativeChoiceResult>(
                    event.currentTarget.value,
                  ),
                })
              }
            />
            <span>{text}</span>
          </label>
        ))}
        <small>じゃんけん等で手番を自分で選べたかを記録します。</small>
      </fieldset>

      <fieldset className="tournament-round__choice tournament-round__result-choice">
        <legend>勝敗</legend>
        {[
          ['', '未入力'],
          ['win', 'WIN'],
          ['draw', 'DRAW'],
          ['loss', 'LOSE'],
        ].map(([value, text]) => (
          <label key={value || 'unset'}>
            <input
              type="radio"
              name={`${inputName}-result`}
              value={value}
              checked={(round.result ?? '') === value}
              onChange={(event) =>
                onChange({
                  ...round,
                  result: optionalValue<MatchResult>(event.currentTarget.value),
                })
              }
            />
            <span>{text}</span>
          </label>
        ))}
      </fieldset>
    </fieldset>
  )
}
