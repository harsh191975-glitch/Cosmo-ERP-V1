// src/types/inventory.ts
// Single source of truth for inventory domain types.
// Previously coupled to supabaseClient.ts — moved here so pages, stores,
// and the engine can import types without pulling in the DB client.

export type ItemCategory =
  | "raw_material"
  | "finished_good"
  | "packaging"
  | "other";

export type TransactionType =
  | "purchase_in"
  | "production_out"
  | "sales_out"
  | "adjustment"
  | "return_in";

export interface InventoryItem {
  id: string;
  sku_code: string;
  product_code?: string;
  item_name: string;
  category: ItemCategory;
  unit_of_measure: string;
  buy_rate?: number;
  current_stock: number;
  minimum_reorder_level: number;
  created_at: string;
  updated_at?: string;
}

export interface InventoryTransaction {
  id: string;
  item_id: string;
  transaction_type: TransactionType;
  quantity_changed: number;
  transaction_date?: string;
  reference_number?: string;
  notes?: string;
  created_at: string;
  // Joined field from inventory_items — present when fetched with select("*, inventory_items(...)")
  inventory_items?: {
    item_name: string;
    unit_of_measure: string;
    buy_rate?: number;
    product_code?: string;
    sku_code?: string;
    current_stock?: number;
  } | null;
}

// ── Derived / aggregate types used by the store layer ─────────

/**
 * Valuation methods supported by inventoryStore.getStockSummary.
 * Only WAC is implemented today. Adding FIFO here signals to P&L callers
 * that the number they receive has changed meaning, not just magnitude.
 */
export type ValuationMethod = "WAC" | "FIFO" | "STANDARD_COST";

export interface StockSummary {
  /** Total INR value of all current stock under the active valuation method */
  closingStockValue: number;
  /**
   * INR value of stock on hand at the START of a reporting period.
   * Only non-zero when getStockSummary is called with a periodStart date.
   * Used by P&L to compute the correct periodic COGS:
   *   COGS = openingStockValue + purchases − closingStockValue
   * Without this, COGS is understated by the value of stock held at period open.
   * null when not computed (e.g. "all time" view or no transaction history).
   */
  openingStockValue: number | null;
  /** True when at least one inventory item exists */
  hasInventoryData: boolean;
  /** Count of items at or below their minimum_reorder_level */
  lowStockCount: number;
  /** Total number of distinct items */
  totalItems: number;
  /**
   * Which cost assumption produced closingStockValue.
   * P&L callers should surface this to users so they know the basis.
   * Currently always "WAC" (current_stock × buy_rate per item).
   */
  valuationMethod: ValuationMethod;
  /**
   * Non-null when the Supabase fetch failed.
   * CALLERS MUST CHECK THIS before using closingStockValue in financial
   * calculations — a fetch failure returns closingStockValue: 0, which
   * would silently overstate COGS and understate profit if used as-is.
   */
  fetchError: string | null;
}

export interface StockMutationResult {
  success: boolean;
  newStock: number;
  error?: string;
}
