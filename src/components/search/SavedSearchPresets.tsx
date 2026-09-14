import { useEffect, useState, type FormEvent } from 'react'

import type { SearchUrlState } from '../../domain/search/searchUrlState'
import {
  presetToSearchUrlState,
  SEARCH_PRESET_NAME_MAX_LENGTH,
  type SavedSearchPreset,
} from '../../domain/searchPresets/types'
import type { SavedSearchPresetRepository } from '../../repositories/savedSearchPresetRepository'

type LoadState = 'loading' | 'loaded' | 'error'

function sortPresets(
  presets: readonly SavedSearchPreset[],
): SavedSearchPreset[] {
  return [...presets].sort(
    (left, right) =>
      right.createdAt.localeCompare(left.createdAt) ||
      left.name.localeCompare(right.name, 'ja') ||
      left.id.localeCompare(right.id, 'en'),
  )
}

export function SavedSearchPresets({
  currentState,
  repository,
  onApply,
}: {
  currentState: SearchUrlState
  repository: SavedSearchPresetRepository
  onApply: (state: SearchUrlState) => void
}) {
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [presets, setPresets] = useState<SavedSearchPreset[]>([])
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [formError, setFormError] = useState('')
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string>()
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    let active = true
    void repository.listPresets().then(
      (loaded) => {
        if (!active) return
        setPresets(loaded)
        setLoadState('loaded')
      },
      () => {
        if (active) setLoadState('error')
      },
    )
    return () => {
      active = false
    }
  }, [loadAttempt, repository])

  const save = async (event: FormEvent) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      setFormError('名前を入力してください。')
      return
    }
    if (trimmedName.length > SEARCH_PRESET_NAME_MAX_LENGTH) {
      setFormError(
        `名前は${SEARCH_PRESET_NAME_MAX_LENGTH}文字以内で入力してください。`,
      )
      return
    }
    setFormError('')
    setStatus('')
    setSaving(true)
    try {
      const created = await repository.createPreset(trimmedName, currentState)
      setPresets((current) => sortPresets([created, ...current]))
      setName('')
      setShowForm(false)
      setStatus(`「${created.name}」を保存しました。`)
    } catch {
      setFormError('検索条件を保存できませんでした。')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (preset: SavedSearchPreset) => {
    setDeleteError('')
    try {
      await repository.removePreset(preset.id)
      setPresets((current) =>
        current.filter((candidate) => candidate.id !== preset.id),
      )
      setDeletingId(undefined)
      setStatus(`「${preset.name}」を削除しました。`)
    } catch {
      setDeleteError('保存した検索条件を削除できませんでした。')
    }
  }

  const deletingPreset = presets.find((preset) => preset.id === deletingId)

  return (
    <section
      className="search-presets"
      aria-labelledby="search-presets-heading"
    >
      <div className="search-presets__heading">
        <div>
          <h2 id="search-presets-heading">保存した検索条件</h2>
          <p>保存した検索条件はこのブラウザ内に保存されます。</p>
        </div>
        <button
          type="button"
          className="button"
          aria-expanded={showForm}
          onClick={() => {
            setShowForm((visible) => !visible)
            setFormError('')
          }}
        >
          検索条件を保存
        </button>
      </div>

      {showForm && (
        <form
          className="search-presets__form"
          onSubmit={(event) => void save(event)}
        >
          <label htmlFor="search-preset-name">
            名前
            <input
              id="search-preset-name"
              type="text"
              value={name}
              maxLength={SEARCH_PRESET_NAME_MAX_LENGTH}
              onChange={(event) => setName(event.currentTarget.value)}
            />
          </label>
          <div className="search-presets__form-actions">
            <button type="submit" className="button" disabled={saving}>
              保存
            </button>
            <button
              type="button"
              className="button button--secondary"
              disabled={saving}
              onClick={() => {
                setShowForm(false)
                setName('')
                setFormError('')
              }}
            >
              キャンセル
            </button>
          </div>
        </form>
      )}

      {formError && (
        <p className="search-presets__error" role="alert">
          {formError}
        </p>
      )}
      {status && (
        <p className="search-presets__status" role="status" aria-live="polite">
          {status}
        </p>
      )}

      {loadState === 'loading' && (
        <p role="status">保存した検索条件を読み込んでいます…</p>
      )}
      {loadState === 'error' && (
        <div className="search-presets__error" role="alert">
          <p>保存した検索条件を読み込めませんでした。</p>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => {
              setLoadState('loading')
              setLoadAttempt((attempt) => attempt + 1)
            }}
          >
            再試行
          </button>
        </div>
      )}
      {loadState === 'loaded' && presets.length === 0 && (
        <p className="search-presets__empty">保存した検索条件はありません。</p>
      )}
      {loadState === 'loaded' && presets.length > 0 && (
        <ul className="search-presets__list">
          {presets.map((preset) => (
            <li key={preset.id}>
              <button
                type="button"
                className="search-presets__apply"
                onClick={() =>
                  onApply(presetToSearchUrlState(preset.searchState))
                }
              >
                {preset.name}
              </button>
              <button
                type="button"
                className="search-presets__delete"
                aria-label={`「${preset.name}」を削除`}
                onClick={() => {
                  setDeleteError('')
                  setDeletingId(preset.id)
                }}
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      )}

      {deletingPreset && (
        <div className="search-presets__dialog-backdrop">
          <div
            className="search-presets__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-preset-heading"
          >
            <h3 id="delete-preset-heading">検索条件を削除</h3>
            <p>「{deletingPreset.name}」を削除しますか？</p>
            {deleteError && (
              <p className="search-presets__error" role="alert">
                {deleteError}
              </p>
            )}
            <div className="search-presets__form-actions">
              <button
                type="button"
                className="button button--danger"
                onClick={() => void remove(deletingPreset)}
              >
                削除
              </button>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setDeletingId(undefined)}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
