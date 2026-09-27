import {
  sortTagsForDisplay,
  tagsForOrganization,
} from '../../domain/deckOrganization/operations'
import type {
  DeckFolder,
  DeckOrganization,
  DeckTag,
} from '../../domain/deckOrganization/types'
import {
  deckOrganizationConflictKey,
  type DeckOrganizationConflict,
  type DeckOrganizationConflictChoice,
  type DeckOrganizationReconciliationPlan,
  type DeckOrganizationResolutions,
} from '../../cloud/deckOrganizationReconciliation'

/**
 * Where the reporter settles what this device and the account disagree about in
 * their folders, tags and deck organization.
 *
 * Grouped by kind, definitions first, because the name chosen for a folder is
 * what the assignments below are then described with. A folder or a tag offers
 * nothing to compare but its name, so each side is shown with how many decks it
 * affects — without that, the choice is between two words.
 */

export type OrganizationConflictChooserProps = {
  plan: DeckOrganizationReconciliationPlan
  resolutions: DeckOrganizationResolutions
  /** True while the choices are being applied, so nothing can be changed. */
  applying?: boolean
  /** Names to describe an assignment with, after the plan's own changes. */
  folders: readonly DeckFolder[]
  tags: readonly DeckTag[]
  onChoose: (key: string, choice: DeckOrganizationConflictChoice) => void
  onApply: () => void
  onCancel: () => void
}

const CHOICE_LABELS: Record<
  DeckOrganizationConflict['kind'],
  Record<DeckOrganizationConflictChoice, string>
> = {
  'folder-name': {
    local: 'この端末の名前を使う',
    cloud: 'クラウドの名前を使う',
  },
  'tag-name': {
    local: 'この端末の名前を使う',
    cloud: 'クラウドの名前を使う',
  },
  'organization-assignment': {
    local: 'この端末の割り当てを使う',
    cloud: 'クラウドの割り当てを使う',
  },
  'organization-tombstone': {
    local: 'この端末の整理情報を残す',
    cloud: 'クラウド側の削除を反映',
  },
}

function describeAssignment(
  organization: DeckOrganization,
  folders: readonly DeckFolder[],
  tags: readonly DeckTag[],
): string {
  const folderName =
    organization.folderId === undefined
      ? 'フォルダーなし'
      : (folders.find((folder) => folder.id === organization.folderId)?.name ??
        'フォルダーなし')
  const tagNames = tagsForOrganization(organization, sortTagsForDisplay(tags))
    .map((tag) => tag.name)
    .join('、')
  return tagNames ? `${folderName} ・ ${tagNames}` : folderName
}

function heading(conflict: DeckOrganizationConflict): string {
  switch (conflict.kind) {
    case 'folder-name':
      return conflict.localFolder.name
    case 'tag-name':
      return conflict.localTag.name
    default:
      return conflict.id
  }
}

function sides(
  conflict: DeckOrganizationConflict,
  folders: readonly DeckFolder[],
  tags: readonly DeckTag[],
): string {
  switch (conflict.kind) {
    case 'folder-name':
      return `この端末: ${conflict.localFolder.name}（${conflict.localDeckCount}件のデッキ） / クラウド: ${conflict.cloudFolder.name}（${conflict.cloudDeckCount}件のデッキ）`
    case 'tag-name':
      return `この端末: ${conflict.localTag.name}（${conflict.localDeckCount}件のデッキ） / クラウド: ${conflict.cloudTag.name}（${conflict.cloudDeckCount}件のデッキ）`
    case 'organization-assignment':
      return `この端末: ${describeAssignment(conflict.localOrganization, folders, tags)} / クラウド: ${describeAssignment(conflict.cloudOrganization, folders, tags)}`
    default:
      return `この端末: ${describeAssignment(conflict.localOrganization, folders, tags)} / クラウド: 削除済み`
  }
}

const GROUPS: {
  kind: DeckOrganizationConflict['kind']
  label: string
}[] = [
  { kind: 'folder-name', label: 'フォルダー名' },
  { kind: 'tag-name', label: 'タグ名' },
  { kind: 'organization-assignment', label: 'デッキの整理' },
  { kind: 'organization-tombstone', label: 'クラウドで削除された整理情報' },
]

export function OrganizationConflictChooser({
  plan,
  resolutions,
  applying = false,
  folders,
  tags,
  onChoose,
  onApply,
  onCancel,
}: OrganizationConflictChooserProps) {
  const total = plan.conflicts.length
  const answered = plan.conflicts.filter(
    (conflict) =>
      resolutions[deckOrganizationConflictKey(conflict)] !== undefined,
  ).length
  const normalizations = plan.organizations.normalizations
  const removedDefinitions =
    plan.folders.tombstoned.length + plan.tags.tombstoned.length

  return (
    <div className="account-cloud-sync__conflicts">
      <h3>フォルダー・タグの違いを確認</h3>
      <p>
        この端末とクラウドで内容が異なる項目が{total}件あります（{answered}
        件を選択済み）。選ばなかった項目は変更されません。
      </p>

      {GROUPS.map((group) => {
        const conflicts = plan.conflicts.filter(
          (conflict) => conflict.kind === group.kind,
        )
        if (conflicts.length === 0) return null
        return (
          <section key={group.kind}>
            <h4>
              {group.label}（{conflicts.length}件）
            </h4>
            {conflicts.map((conflict) => {
              const key = deckOrganizationConflictKey(conflict)
              return (
                <fieldset className="account-cloud-sync__conflict" key={key}>
                  <legend>{heading(conflict)}</legend>
                  <p>{sides(conflict, folders, tags)}</p>
                  {(['local', 'cloud'] as const).map((choice) => (
                    <label key={choice}>
                      <input
                        type="radio"
                        name={key}
                        value={choice}
                        disabled={applying}
                        checked={resolutions[key] === choice}
                        onChange={() => onChoose(key, choice)}
                      />
                      {CHOICE_LABELS[conflict.kind][choice]}
                    </label>
                  ))}
                </fieldset>
              )
            })}
          </section>
        )
      })}

      {/* Not choices: a deleted folder or tag stays deleted, and a reference
          that cannot resolve cannot be stored. Said plainly instead. */}
      {removedDefinitions > 0 && (
        <p>
          クラウドで削除されたフォルダー・タグ{removedDefinitions}
          件を、この端末からも外します。デッキは削除されません。
        </p>
      )}
      {normalizations.length > 0 && (
        <p>
          取り込む整理情報のうち、見つからないフォルダー・タグの割り当て
          {normalizations.length}件を外します。
        </p>
      )}

      <div>
        <button
          type="button"
          className="button"
          disabled={applying}
          onClick={onApply}
        >
          {applying ? '適用中…' : '選択した内容で続行'}
        </button>
        <button
          type="button"
          className="button button--secondary"
          disabled={applying}
          onClick={onCancel}
        >
          あとで
        </button>
      </div>
    </div>
  )
}
