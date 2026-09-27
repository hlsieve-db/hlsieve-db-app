import type {
  DeckFolder,
  DeckOrganization,
  DeckTag,
} from '../domain/deckOrganization/types'
import type {
  CloudDeckOrganizationFailure,
  CloudDeckOrganizationRepository,
} from './cloudDeckOrganizationRepository'

/**
 * The first upload: the folders, tags and deck organization on this device are
 * written to the account.
 *
 * Local is the truth and nothing is read, which is what makes this safe to run
 * without asking the reporter to resolve anything — the same bargain the deck
 * upload makes. The caller is responsible for only running it where that bargain
 * holds: the account has no rows at all, not even tombstones. With a tombstone
 * present this would write an organization naming a folder the account has
 * deleted, which the table accepts (the folder's row is still there) and which
 * would then reach every other device as an assignment nobody made.
 *
 * Definitions go first and organization last, because an organization names a
 * folder the account has to hold already. Locally every reference resolves, so
 * that order is enough to keep it resolving there too.
 *
 * Two devices that both upload first end up with both sets of folders, because
 * ids are generated per device. Where both had organized the same deck, the
 * later upload wins: one row per deck is what the table holds, and the deck
 * itself behaves the same way. Avoiding that would mean reading the account
 * before writing, which is the one thing a first upload deliberately does not
 * do.
 */

export type DeckOrganizationUploadFailure =
  | CloudDeckOrganizationFailure
  /** No cloud repository at all: not configured, or nobody signed in. */
  | 'unavailable'

export type DeckOrganizationUploadCounts = {
  folders: number
  tags: number
  organizations: number
}

export type DeckOrganizationUploadResult =
  | { ok: true; uploaded: DeckOrganizationUploadCounts }
  | {
      ok: false
      reason: DeckOrganizationUploadFailure
      uploaded: DeckOrganizationUploadCounts
    }

export type DeckOrganizationUploadOptions = {
  /** Read from the unwrapped stores: this sends everything itself. */
  local: {
    folders: readonly DeckFolder[]
    tags: readonly DeckTag[]
    organizations: readonly DeckOrganization[]
  }
  cloud: CloudDeckOrganizationRepository | null
  /** Called before the first write and after each one, for a progress line. */
  onProgress?: (progress: { completed: number; total: number }) => void
}

export async function syncLocalDeckOrganizationToCloud({
  local,
  cloud,
  onProgress,
}: DeckOrganizationUploadOptions): Promise<DeckOrganizationUploadResult> {
  const uploaded: DeckOrganizationUploadCounts = {
    folders: 0,
    tags: 0,
    organizations: 0,
  }
  if (!cloud) return { ok: false, reason: 'unavailable', uploaded }

  const total =
    local.folders.length + local.tags.length + local.organizations.length
  let completed = 0
  onProgress?.({ completed, total })

  const advance = () => {
    completed += 1
    onProgress?.({ completed, total })
  }

  for (const folder of local.folders) {
    // One at a time, so the count shown is real, the order is deterministic, and
    // a failure stops rather than firing the rest at a server that has already
    // refused once.
    const result = await cloud.upsertFolder(folder)
    if (!result.ok) return { ok: false, reason: result.reason, uploaded }
    // A folder the account holds as a tombstone is not counted: nothing was
    // written, and saying otherwise would overstate what the account now has.
    if (result.value.written) uploaded.folders += 1
    advance()
  }

  for (const tag of local.tags) {
    const result = await cloud.upsertTag(tag)
    if (!result.ok) return { ok: false, reason: result.reason, uploaded }
    if (result.value.written) uploaded.tags += 1
    advance()
  }

  for (const organization of local.organizations) {
    const result = await cloud.upsertOrganization(organization)
    if (!result.ok) return { ok: false, reason: result.reason, uploaded }
    uploaded.organizations += 1
    advance()
  }

  // A collection with nothing to organize has finished successfully: there was
  // nothing to send, and it should not be asked to try again.
  return { ok: true, uploaded }
}
