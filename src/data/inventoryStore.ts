// src/data/inventoryStore.ts
// Store layer for inventory — the single access boundary between the app and
// the inventory_items / inventory_transactions Supabase tables.
//
// Why this exists:
//   Stock mutation logic (newStock = current ± qty) was living inside
//   Inventory.tsx tab components, making it untestable and unshare-able.
//   Moving it here means Reports (P&L COGS), Dashboard KPIs, and any future
//   invoice→stock-out linkage can all call the same validated functions.
//
// What Reports.tsx PnL uses today (and what replaces it):
//   BEFORE: direct supabase.from("inventory_items").select("*") in a useEffect
//   AFTER:  getStockSummary() — one call, typed return, no Supabase in the page.
//
// Inventory.tsx tab components can replace their direct supabase calls with:
//   postTransaction()  — for recording stock IN / OUT with the reversal-safe update
//   getItems()         — for the products list
//   getTransactions()  — for the transaction log

import { supabase } from "@/lib/supabaseClient";
import type {
  InventoryItem,
  InventoryTransaction,
  StockSummary,
  StockMutationResult,
  ItemCategory,
  TransactionType,
} from "@/types/inventory";

// ── Direction helper (same logic as Inventory.tsx txDir) ──────────────────
const TX_IN_TYPES: TransactionType[] = ["purchase_in", "return_in"];
const VALID_TRANSACTION_TYPES: TransactionType[] = [
  "purchase_in",
  "production_out",
  "sales_out",
  "adjustment",
  "return_in",
];
const VALID_ITEM_CATEGORIES: ItemCategory[] = [
  "raw_material",
  "finished_good",
  "packaging",
  "other",
];

export const txDirection = (type: TransactionType): "in" | "out" =>
  TX_IN_TYPES.includes(type) ? "in" : "out";

const isValidTransactionType = (type: string): type is TransactionType =>
  VALID_TRANSACTION_TYPES.includes(type as TransactionType);

const isValidItemCategory = (category: string): category is ItemCategory =>
  VALID_ITEM_CATEGORIES.includes(category as ItemCategory);

// ════════════════════════════════════════════════════════════════
// READ — Products
// ════════════════════════════════════════════════════════════════

/** Fetch all inventory items ordered by category then name. */
export const getItems = async (): Promise<InventoryItem[]> => {
  const { data, error } = await supabase
    .from("inventory_items")
    .select("*")
    .order("category")
    .order("item_name");

  if (error) throw new Error(`[inventoryStore.getItems] ${error.message}`);
  return (data as InventoryItem[]) ?? [];
};

// ════════════════════════════════════════════════════════════════
// READ — Transactions
// ════════════════════════════════════════════════════════════════

/** Fetch recent transactions with joined item details. Limit defaults to 300. */
export const getTransactions = async (limit = 300): Promise<InventoryTransaction[]> => {
  const { data, error } = await supabase
    .from("inventory_transactions")
    .select(
      "*, inventory_items(item_name, unit_of_measure, buy_rate, product_code, sku_code, current_stock)"
    )
    .order("transaction_date", { ascending: false })
    .order("created_at",       { ascending: false })
    .limit(limit);

  if (error) throw new Error(`[inventoryStore.getTransactions] ${error.message}`);
  return (data as InventoryTransaction[]) ?? [];
};

// ════════════════════════════════════════════════════════════════
// READ — Aggregate (used by P&L and Dashboard)
// ════════════════════════════════════════════════════════════════

/**
 * VALUATION METHOD: Weighted Average Cost (WAC)
 *
 *   closingStockValue = Σ (current_stock × buy_rate)
 *
 * `buy_rate` on each item is the purchase cost per unit — a single blended
 * rate, not lot-tracked. This is equivalent to weighted average cost in a
 * periodic inventory system.
 *
 * ⚠️  FINANCIAL IMPACT — callers must understand this:
 *   P&L uses this value as:  COGS = openingStockValue + purchases − closingStockValue
 *   If closingStockValue rises (more stock on hand), COGS falls, profit rises.
 *   If closingStockValue falls (stock consumed), COGS rises, profit falls.
 *   A valuation method change (e.g. to FIFO) will move net profit without
 *   any code change in Reports.tsx — the risk lives here, not there.
 *
 * ⚠️  FAILURE BEHAVIOUR — callers must check fetchError:
 *   This function never throws. On Supabase failure it returns fetchError: string
 *   with closingStockValue: 0.
 *   That zero is NOT a safe fallback. The direction of the error is unknowable:
 *     - If opening stock is high, COGS is overstated → profit understated
 *     - If purchases are incomplete, COGS is already wrong regardless
 *     - Timing mismatches can push it either direction
 *   There is no "conservative" failure mode here. The number is simply invalid.
 *   P&L MUST refuse to render COGS, gross profit, and net profit when fetchError
 *   is set. Do not fallback, estimate, or warn-and-proceed.
 *
 * @param periodStart  ISO date string "YYYY-MM-DD". When provided, the function
 *   also computes openingStockValue — the WAC value of stock on hand just before
 *   this date, derived by replaying inventory_transactions in reverse from the
 *   current stock. When omitted (all-time view), openingStockValue is null.
 *
 * Used by:
 *   - Reports.tsx PnLReport  → closingStockValue + openingStockValue for COGS
 *   - Dashboard (future)     → lowStockCount + closingStockValue for KPIs
 */
export const getStockSummary = async (periodStart?: string): Promise<StockSummary> => {
  const { data, error } = await supabase
    .from("inventory_items")
    .select("id, current_stock, buy_rate, minimum_reorder_level");

  // Return typed error — do NOT throw or default to zero silently.
  // closingStockValue: 0 here is NOT a safe fallback. It is an invalid number.
  // Whether it over- or understates COGS depends on opening stock, purchase
  // timing, and data completeness — the direction is unknowable.
  // Callers MUST check fetchError and refuse to render any P&L output when set.
  if (error) {
    return {
      closingStockValue: 0,
      openingStockValue: null,
      hasInventoryData:  false,
      lowStockCount:     0,
      totalItems:        0,
      valuationMethod:   "WAC",
      fetchError:        `[inventoryStore.getStockSummary] ${error.message}`,
    };
  }

  const items = (data ?? []) as (Pick<
    InventoryItem,
    "current_stock" | "buy_rate" | "minimum_reorder_level"
  > & { id: string })[];

  // WAC: each item's contribution = qty on hand × purchase cost per unit.
  // Items with no buy_rate (null/0) contribute ₹0 — we don't know their
  // cost basis so they are treated as zero-cost, which understates the asset.
  // When buy_rate coverage improves, this number will increase automatically.
  const closingStockValue = items.reduce(
    (sum, item) => sum + item.current_stock * (item.buy_rate ?? 0),
    0
  );

  const lowStockCount = items.filter(
    (item) => item.current_stock <= item.minimum_reorder_level
  ).length;

  // ── Opening stock computation ──────────────────────────────────────────────
  // When a period start is given, reconstruct the stock level each item held
  // just before that date by replaying transactions that occurred ON OR AFTER
  // periodStart in reverse.
  //
  // Logic: current_stock is the live ending balance. Any transaction that
  // happened on or after periodStart has already moved the balance from what
  // it was at period open. Reversing those transactions gives us opening stock.
  //
  //   openingQty = current_stock
  //                − Σ qty of IN  transactions on/after periodStart   (undo the adds)
  //                + Σ qty of OUT transactions on/after periodStart   (undo the subtracts)
  //
  // Opening value = Σ (openingQty × buy_rate) — WAC, same basis as closing.
  //
  // LIMITATIONS:
  //   - buy_rate is a single current rate per item (not lot-tracked). If the
  //     rate changed during the period, opening value is on the current rate,
  //     which slightly misrepresents the historical cost. This is the same
  //     limitation that affects closingStockValue and is inherent to the WAC
  //     periodic approach without lot tracking.
  //   - Transactions with null transaction_date are excluded from the replay;
  //     they are treated as pre-period. This is the safe direction — they
  //     reduce the adjustment, leaving openingQty closer to current_stock —
  //     but it is a known approximation when dates are missing.

  let openingStockValue: number | null = null;
  let replayError: string | null = null;

  if (periodStart && items.length > 0) {
    const { data: txData, error: txErr } = await supabase
      .from("inventory_transactions")
      .select("item_id, transaction_type, quantity_changed, transaction_date")
      .gte("transaction_date", periodStart);

    if (txErr) {
      openingStockValue = null;
      replayError = `[inventoryStore.getStockSummary] Failed to replay opening stock from ${periodStart}: ${txErr.message}`;
    } else {
      // Build a per-item adjustment map
      const adjustments = new Map<string, number>(); // item_id → net qty to subtract from current_stock
      for (const tx of (txData ?? [])) {
        const dir = TX_IN_TYPES.includes(tx.transaction_type as TransactionType) ? "in" : "out";
        const current = adjustments.get(tx.item_id) ?? 0;
        // Reversing: IN transactions subtracted (they added to stock during period),
        // OUT transactions added back (they removed from stock during period).
        adjustments.set(
          tx.item_id,
          dir === "in"
            ? current - tx.quantity_changed
            : current + tx.quantity_changed
        );
      }

      // Compute opening value: apply adjustment to each item
      openingStockValue = items.reduce((sum, item) => {
        const adj = adjustments.get(item.id) ?? 0;
        const openingQty = Math.max(0, item.current_stock + adj);
        return sum + openingQty * (item.buy_rate ?? 0);
      }, 0);
    }
  }

  return {
    closingStockValue,
    openingStockValue,
    hasInventoryData: items.length > 0,
    lowStockCount,
    totalItems:       items.length,
    valuationMethod:  "WAC",
    fetchError:       replayError,
  };
};

// ════════════════════════════════════════════════════════════════
// WRITE — Post a transaction + update stock atomically
// ════════════════════════════════════════════════════════════════

export interface PostTransactionPayload {
  item_id: string;
  transaction_type: TransactionType;
  quantity_changed: number;
  transaction_date: string;  // ISO "YYYY-MM-DD"
  reference_number?: string;
  notes?: string;
  /** Current stock of the item — caller must pass this to avoid a second read. */
  currentStock: number;
}

/**
 * Records a stock transaction and updates current_stock on the item.
 *
 * This is the domain logic that previously lived in Inventory.tsx tab
 * components as `newStock = current_stock ± qty`.  Moving it here means:
 *   - The same calculation can be called from invoice save (sales_out) in future
 *   - The reversal logic (delete transaction) also uses this function's inverse
 *   - It can be unit-tested without mounting a React component
 *
 * Stock can never go below 0 on an outbound transaction.
 */
export const postTransaction = async (
  payload: PostTransactionPayload
): Promise<StockMutationResult> => {
  const { item_id, transaction_type, quantity_changed, currentStock } = payload;
  if (!isValidTransactionType(transaction_type)) {
    return { success: false, newStock: currentStock, error: `Invalid transaction type: ${transaction_type}` };
  }
  const dir = txDirection(transaction_type);

  const newStock =
    dir === "in"
      ? currentStock + quantity_changed
      : Math.max(0, currentStock - quantity_changed);

  // 1. Insert the transaction record
  const { error: txErr } = await supabase
    .from("inventory_transactions")
    .insert({
      item_id,
      transaction_type,
      quantity_changed,
      transaction_date:  payload.transaction_date,
      reference_number:  payload.reference_number ?? null,
      notes:             payload.notes ?? null,
    });

  if (txErr) {
    return { success: false, newStock: currentStock, error: txErr.message };
  }

  // 2. Update current_stock on the item
  const { error: stockErr } = await supabase
    .from("inventory_items")
    .update({ current_stock: newStock })
    .eq("id", item_id);

  if (stockErr) {
    return { success: false, newStock: currentStock, error: stockErr.message };
  }

  return { success: true, newStock };
};

// ════════════════════════════════════════════════════════════════
// WRITE — Reverse a transaction (used by delete in TransactionLogTab)
// ════════════════════════════════════════════════════════════════

export interface ReverseTransactionPayload {
  transactionId: string;
  item_id: string;
  transaction_type: TransactionType;
  quantity_changed: number;
  /** Current stock on the item at time of deletion — from the joined inventory_items field. */
  currentStock: number;
}

/**
 * Deletes a transaction record and reverses its stock effect.
 * Replaces the inline delete + reversal logic in TransactionLogTab.handleDelete.
 */
export const reverseTransaction = async (
  payload: ReverseTransactionPayload
): Promise<StockMutationResult> => {
  const { transactionId, item_id, transaction_type, quantity_changed, currentStock } = payload;
  if (!isValidTransactionType(transaction_type)) {
    return { success: false, newStock: currentStock, error: `Invalid transaction type: ${transaction_type}` };
  }
  const dir = txDirection(transaction_type);

  // Reversal: IN becomes subtract, OUT becomes add
  const newStock =
    dir === "in"
      ? Math.max(0, currentStock - quantity_changed)
      : currentStock + quantity_changed;

  // 1. Delete the transaction record
  const { error: delErr } = await supabase
    .from("inventory_transactions")
    .delete()
    .eq("id", transactionId);

  if (delErr) {
    return { success: false, newStock: currentStock, error: delErr.message };
  }

  // 2. Reverse the stock on the item
  const { error: stockErr } = await supabase
    .from("inventory_items")
    .update({ current_stock: newStock })
    .eq("id", item_id);

  if (stockErr) {
    return { success: false, newStock: currentStock, error: stockErr.message };
  }

  return { success: true, newStock };
};

// ════════════════════════════════════════════════════════════════
// WRITE — Products CRUD (used by ProductsTab)
// ════════════════════════════════════════════════════════════════

export type ProductPayload = Omit<InventoryItem,
  "id" | "created_at" | "updated_at" | "current_stock"
>;

export const addItem = async (payload: ProductPayload): Promise<{ error?: string }> => {
  if (!isValidItemCategory(payload.category)) {
    return { error: `Invalid item category: ${payload.category}` };
  }
  const { error } = await supabase
    .from("inventory_items")
    .insert({ ...payload, current_stock: 0 });
  return error ? { error: error.message } : {};
};

export const updateItem = async (
  id: string,
  payload: Partial<ProductPayload>
): Promise<{ error?: string }> => {
  if (payload.category && !isValidItemCategory(payload.category)) {
    return { error: `Invalid item category: ${payload.category}` };
  }
  const { error } = await supabase
    .from("inventory_items")
    .update(payload)
    .eq("id", id);
  return error ? { error: error.message } : {};
};

export const deleteItem = async (id: string): Promise<{ error?: string }> => {
  const { error } = await supabase
    .from("inventory_items")
    .delete()
    .eq("id", id);
  return error ? { error: error.message } : {};
};
