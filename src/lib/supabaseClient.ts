import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Cloud Sync is optional, so the keys may simply be absent. When they are, the
 * app runs exactly as it always has: everything local, no account.
 */
function readConfig(): { url: string; anonKey: string } | undefined {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  return url && anonKey ? { url, anonKey } : undefined
}

let client: SupabaseClient | null | undefined

/** Null when Cloud Sync is not configured for this deployment. */
export function getSupabaseClient(): SupabaseClient | null {
  if (client === undefined) {
    const config = readConfig()
    client = config ? createClient(config.url, config.anonKey) : null
  }
  return client
}

export function isCloudSyncConfigured(): boolean {
  return getSupabaseClient() !== null
}

/** Only for tests, which must never reach the network. */
export function resetSupabaseClientForTests(): void {
  client = undefined
}
