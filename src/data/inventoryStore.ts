// src/data/inventoryStore.ts
// Store layer for inventory — the single access boundary between the app and
// the inventory_items / inventory_transactions Supabase tables.
//
// FIX CHANGELOG
// ─────────────
// [FIX-CAT] CATEGORY CONSTRAINT (400 errors)
//   VALID_ITEM_CATEGORIES was using snake_case values ("raw_material") that
//   don't match the DB check constraint which expects title-case strings.
//   Confirmed constraint via pg_get_constraintdef:
//     ARRAY['Raw Material', 'Packaging', 'Finished Good']
//   "Other" is NOT in the constraint — it has been removed.
//   The type, constant, and isValidItemCategory guard are now aligned to the
//   exact DB values. Use the ITEM_CATEGORY_LABELS map for display strings if
//   different UI labels are needed without touching the stored value.
//
// [FIX-RLS] RLS COMPLIANCE on ALL writes
//   requireUserId() / attachUserId() helpers (same pattern as expenseStore)
//   are applied to every .insert() and .upsert() call:
//     • postTransaction  — inventory_transactions insert
//     • addItem          — inventory_items insert
//     • updateItem       — inventory_items update (no user_id change needed,
//                          but RLS USING already gates by user_id column so
//                          the update is safe; no mutation of user_id here)
//   Both functions previously had inline getCurrentUserId() checks that only
//   guarded some paths. They now consistently throw via requireUserId().
//
// [FIX-NOOP] reverseTransaction / deleteItem
//   These are DELETE operations. RLS USING (user_id = auth.uid()) already
//   prevents cross-user deletes at the DB level. No user_id payload needed.

import { supabase, getCurrentUserId } from "@/lib/supabaseClient";
import type {
  InventoryItem,
  InventoryTransaction,
  StockSummary,
  StockMutationResult,
  TransactionType,
} from "@/types/inventory";

// ── [FIX-CAT] Corrected item categories ───────────────────────────────────
// ⚠️  These THREE values are the ONLY ones accepted by the DB check constraint
//   (confirmed via pg_get_constraintdef):
//   CHECK ((category = ANY (ARRAY['Raw Material'::text, 'Packaging'::text, 'Finished Good'::text])))
// "Other" is NOT in the constraint and has been removed.
// Do NOT add values here without first updating the constraint in Supabase.
export const ITEM_CATEGORIES = [
  "Raw Material",
  "Finished Good",
  "Packaging",
] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

// Optional: map DB values → human labels if the UI wants different display text.
// Currently they're identical; add entries here if the UI ever diverges.
export const ITEM_CATEGORY_LABELS: Record<ItemCategory, string> = {
  "Raw Material":  "Raw Material",
  "Finished Good": "Finished Good",
  "Packaging":     "Packaging",
};

// ── Direction helper (same logic as Inventory.tsx txDir) ──────────────────
const TX_IN_TYPES: TransactionType[] = ["purchase_in", "return_in"];
const VALID_TRANSACTION_TYPES: TransactionType[] = [
  "purchase_in",
  "production_out",
  "sales_out",
  "adjustment",
  "return_in",
];

export const txDirection = (type: TransactionType): "in" | "out" =>
  TX_IN_TYPES.includes(type) ? "in" : "out";

const isValidTransactionType = (type: string): type is TransactionType =>
  VALID_TRANSACTION_TYPES.includes(type as TransactionType);

// [FIX-CAT] Now validates against corrected title-case values
const isValidItemCategory = (category: string): category is ItemCategory =>
  (ITEM_CATEGORIES as readonly string[]).includes(category);

// ── [FIX-RLS] Auth helpers ────────────────────────────────────────────────

/**
 * Resolves the current user's ID or throws immediately.
 * Use at the top of every write function so RLS failures surface as a
 * clear auth error rather than a silent 403 from Supabase.
 */
async function requireUserId(): Promise<string> {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error(
      "[inventoryStore] No authenticated session. " +
      "The user must be logged in before writing inventory data."
    );
  }
  return userId;
}

/**
 * Stamps `user_id` onto any insert/upsert payload without mutating the original.
 */
function attachUserId<T extends object>(payload: T, userId: string): T & { user_id: string } {
  return { ...payload, user_id: userId };
}

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
 *   That zero is NOT a safe fallback. The direction of the error is unknowable.
 *   P&L MUST refuse to render COGS, gross profit, and net profit when fetchError
 *   is set. Do not fallback, estimate, or warn-and-proceed.
 *
 * @param periodStart  ISO date string "YYYY-MM-DD". When provided, the function
 *   also computes openingStockValue — the WAC value of stock on hand just before
 *   this date, derived by replaying inventory_transactions in reverse from the
 *   current stock. When omitted (all-time view), openingStockValue is null.
 */
export const getStockSummary = async (periodStart?: string): Promise<StockSummary> => {
  const { data, error } = await supabase
    .from("inventory_items")
    .select("id, current_stock, buy_rate, minimum_reorder_level");

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

  const closingStockValue = items.reduce(
    (sum, item) => sum + item.current_stock * (item.buy_rate ?? 0),
    0
  );

  const lowStockCount = items.filter(
    (item) => item.current_stock <= item.minimum_reorder_level
  ).length;

  let openingStockValue: number | null = null;
  let replayError: string | null = null;

  if (periodStart && items.length > 0) {
    const { data: txData, error: txErr } = await supabase
      .from("inventory_transactions")
      .select("item_id, transaction_type, quantity_changed, transaction_date")
      .gte("transaction_date", periodStart);

    if (txErr) {
      replayError = `[inventoryStore.getStockSummary] opening stock replay failed: ${txErr.message}`;
    } else {
      const adjustments = new Map<string, number>();

      for (const tx of txData ?? []) {
        if (!tx.transaction_date) continue;
        const dir = txDirection(tx.transaction_type as TransactionType);
        const current = adjustments.get(tx.item_id) ?? 0;
        adjustments.set(
          tx.item_id,
          dir === "in"
            ? current - tx.quantity_changed
            : current + tx.quantity_changed
        );
      }

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
  transaction_date: string;   // ISO "YYYY-MM-DD"
  reference_number?: string;
  notes?: string;
  /** Current stock of the item — caller must pass this to avoid a second read. */
  currentStock: number;
}

/**
 * Records a stock transaction and updates current_stock on the item.
 *
 * [FIX-RLS] Uses requireUserId() / attachUserId() on the INSERT.
 *           The stock UPDATE (.update) does not need user_id in the payload;
 *           RLS USING filters by the row's existing user_id column.
 *
 * Stock can never go below 0 on an outbound transaction.
 */
export const postTransaction = async (
  payload: PostTransactionPayload
): Promise<StockMutationResult> => {
  const { item_id, transaction_type, quantity_changed, currentStock } = payload;

  if (!isValidTransactionType(transaction_type)) {
    return {
      success: false,
      newStock: currentStock,
      error: `Invalid transaction type: ${transaction_type}`,
    };
  }

  const dir = txDirection(transaction_type);
  const newStock =
    dir === "in"
      ? currentStock + quantity_changed
      : Math.max(0, currentStock - quantity_changed);

  // [FIX-RLS] Throws clearly if there is no session.
  const userId = await requireUserId();

  // 1. Insert the transaction record with user_id attached.
  const { error: txErr } = await supabase
    .from("inventory_transactions")
    .insert(
      attachUserId(
        {
          item_id,
          transaction_type,
          quantity_changed,
          transaction_date:  payload.transaction_date,
          reference_number:  payload.reference_number ?? null,
          notes:             payload.notes ?? null,
        },
        userId
      )
    );

  if (txErr) {
    return { success: false, newStock: currentStock, error: txErr.message };
  }

  // 2. Update current_stock on the item.
  //    RLS USING on inventory_items gates this to the owner's rows.
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
 *
 * [FIX-NOOP] DELETE is gated by RLS USING (user_id = auth.uid()) at the DB
 *            level. No user_id payload is required or modified here.
 */
export const reverseTransaction = async (
  payload: ReverseTransactionPayload
): Promise<StockMutationResult> => {
  const { transactionId, item_id, transaction_type, quantity_changed, currentStock } = payload;

  if (!isValidTransactionType(transaction_type)) {
    return {
      success: false,
      newStock: currentStock,
      error: `Invalid transaction type: ${transaction_type}`,
    };
  }

  const dir = txDirection(transaction_type);
  const newStock =
    dir === "in"
      ? Math.max(0, currentStock - quantity_changed)
      : currentStock + quantity_changed;

  // 1. Delete the transaction record — RLS USING handles auth enforcement.
  const { error: delErr } = await supabase
    .from("inventory_transactions")
    .delete()
    .eq("id", transactionId);

  if (delErr) {
    return { success: false, newStock: currentStock, error: delErr.message };
  }

  // 2. Reverse the stock on the item.
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

/**
 * Insert a new inventory item.
 *
 * [FIX-CAT] isValidItemCategory now validates against title-case DB values.
 * [FIX-RLS] Uses requireUserId() / attachUserId() on the INSERT.
 */
export const addItem = async (payload: ProductPayload): Promise<{ error?: string }> => {
  if (!isValidItemCategory(payload.category)) {
    return {
      error:
        `Invalid item category "${payload.category}". ` +
        `Allowed values (must match DB exactly): ${ITEM_CATEGORIES.join(", ")}`,
    };
  }

  // [FIX-RLS] Throws if no session — caller's try/catch will show the error.
  const userId = await requireUserId();

  const { error } = await supabase
    .from("inventory_items")
    .insert(attachUserId({ ...payload, current_stock: 0 }, userId));

  return error ? { error: error.message } : {};
};

/**
 * Update an existing inventory item.
 *
 * [FIX-CAT] Category validation now uses corrected title-case values.
 * [FIX-RLS] UPDATE on inventory_items is gated by RLS USING (user_id = auth.uid()).
 *           We do NOT change user_id here — the row already carries it, and
 *           the RLS policy prevents updating another user's row.
 */
export const updateItem = async (
  id: string,
  payload: Partial<ProductPayload>
): Promise<{ error?: string }> => {
  if (payload.category && !isValidItemCategory(payload.category)) {
    return {
      error:
        `Invalid item category "${payload.category}". ` +
        `Allowed values (must match DB exactly): ${ITEM_CATEGORIES.join(", ")}`,
    };
  }

  const { error } = await supabase
    .from("inventory_items")
    .update(payload)
    .eq("id", id);

  return error ? { error: error.message } : {};
};

/**
 * Delete an inventory item by ID.
 *
 * [FIX-NOOP] RLS USING prevents cross-user deletes at the DB level.
 *            No user_id payload required.
 */
export const deleteItem = async (id: string): Promise<{ error?: string }> => {
  const { error } = await supabase
    .from("inventory_items")
    .delete()
    .eq("id", id);

  return error ? { error: error.message } : {};
};
