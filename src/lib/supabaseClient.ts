import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Cloud Sync is optional, so the keys may simply be absent. When they are, the
 * app runs exactly as it always has: everything local, no account.
 */
function readConfig(): { url: string; publishableKey: string } | undefined {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  // The publishable key is meant to ship in the browser. Its counterpart, the
  // secret key, must never appear here or anywhere else in this bundle.
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  return url && publishableKey ? { url, publishableKey } : undefined
}

let client: SupabaseClient | null | undefined

/** Null when Cloud Sync is not configured for this deployment. */
export function getSupabaseClient(): SupabaseClient | null {
  if (client === undefined) {
    const config = readConfig()
    client = config ? createClient(config.url, config.publishableKey) : null
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

/**
 * Whether the email login link may be offered. Supabase's built-in mail is
 * rate limited and only delivers to project members, so the field stays
 * hidden until a deployment has its own SMTP configured and sets this.
 */
export function isEmailSignInEnabled(): boolean {
  return import.meta.env.VITE_SUPABASE_EMAIL_SIGN_IN?.trim() === 'true'
}
