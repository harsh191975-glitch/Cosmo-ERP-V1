import { supabase } from '@/lib/supabaseClient'
import type { Session } from '@supabase/supabase-js'

/**
 * Terminates the current Supabase session server-side and clears all local
 * auth tokens.  Callers must handle navigation — this function is UI-agnostic.
 *
 * @throws {Error} Re-throws the Supabase auth error so the UI can show feedback.
 */
export async function logoutUser(): Promise<void> {
  const { error } = await supabase.auth.signOut()

  if (error) {
    // Surface a clean message; preserve original for debugging
    throw new Error(error.message ?? 'Sign-out failed. Please try again.')
  }
}

/**
 * Returns the current active Supabase session, or null if unauthenticated.
 *
 * UI components must NOT call supabase.auth.getSession() directly.
 * Use this wrapper so all auth access stays in the store layer and
 * remains consistent with RLS policies.
 */
export async function getActiveSession(): Promise<Session | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}
