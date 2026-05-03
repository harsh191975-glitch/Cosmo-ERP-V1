import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[COSMO] Missing Supabase configuration. ' +
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file and restart the dev server.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Returns the authenticated user's ID for RLS-compliant inserts.
 *
 * PERFORMANCE: Uses getSession() (reads the local JWT from storage — no
 * network round-trip) instead of getUser() (which hits the Supabase Auth
 * server on every call). This is safe for write operations because:
 *   - The session token was already verified by Supabase when the user logged in.
 *   - ProtectedRoute re-validates via getUser() on every page mount.
 *   - Supabase RLS re-validates auth.uid() server-side on every insert anyway.
 *
 * FAIL-FAST: Throws immediately if no session exists. Callers must not
 * proceed with inserts on auth failure — no silent nulls, no fallbacks.
 *
 * DO NOT cache the returned userId in a module-level variable. Sessions
 * can change (logout → login as different user) within the same JS module
 * lifetime. getSession() is already cheap (reads from localStorage synchronously
 * under the hood — the async wrapper is just for API consistency).
 *
 * @throws {Error} If no active session is found.
 *
 * @example
 *   const userId = await getCurrentUserId();
 *   await supabase.from("expenses").insert({ ...payload, user_id: userId });
 */
export async function getCurrentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  const userId = data?.session?.user?.id;

  if (error || !userId) {
    throw new Error(
      "[COSMO] No active session found. User must be logged in to perform write operations."
    );
  }

  return userId;
}

/**
 * Canonical category values — must exactly match the DB enum.
 * Title Case is the single source of truth across the entire stack:
 *   frontend dropdowns → DB insert → DB read → UI display.
 * Never use the old snake_case variants ('raw_material', etc.) anywhere.
 */
export type ItemCategory =
  | 'Raw Material'
  | 'Finished Good'
  | 'Packaging'
  | 'Other';

export type TransactionType = 'purchase_in' | 'production_out' | 'sales_out' | 'adjustment' | 'return_in';

export interface InventoryItem {
  id: number;
  name: string;
  category: ItemCategory;
  unit: string;
  current_stock: number;
  reorder_level: number;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface InventoryTransaction {
  id: number;
  item_id: number;
  transaction_type: TransactionType;
  quantity: number;
  notes?: string;
  reference?: string;
  created_at: string;
  inventory_items?: { name: string; unit: string } | null;
}
