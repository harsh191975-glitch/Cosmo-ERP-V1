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

export type ItemCategory   = 'raw_material' | 'finished_good' | 'packaging' | 'other';
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
