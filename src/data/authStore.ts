import { supabase } from '@/lib/supabaseClient'

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
