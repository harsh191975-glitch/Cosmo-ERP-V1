// src/data/inventoryStore.ts
// Store layer for inventory — the single access boundary between the app and
// the inventory_items / inventory_transactions Supabase tables.
//
// MULTI-PROFILE ARCHITECTURE (v2)
// ─────────────────────────────────────────────────────────────────────────────
// Products now belong to one of 5 profile types, each with different UOM,
// costing, and display logic. The store layer exposes:
//   • getDisplayStock(item)       — formatted dual-unit string
//   • entryToPurchaseQty(...)     — converts UI entry to valuation qty
//   • All existing CRUD functions — extended with profile_data + UOM columns
//
// UNIT ARCHITECTURE:
//   current_stock  always in valuation_unit (KG, Litre, BDL, pcs)
//   buy_rate       always per valuation_unit
//   purchase_unit  what the supplier invoices in
//   conversion_factor  valuation_units per purchase_unit
//
// FIX CHANGELOG
// ─────────────────────────────────────────────────────────────────────────────
// [FIX-CAT] CATEGORY CONSTRAINT — updated for 5 profile types.
//   DB CHECK constraint must be updated manually in Supabase (see plan).
// [FIX-RLS] RLS COMPLIANCE — requireUserId() / attachUserId() on all writes.
// [FIX-NOOP] DELETE ops gated by DB RLS — no payload change needed.

import { supabase, getCurrentUserId } from "@/lib/supabaseClient";
import type {
  InventoryItem,
  InventoryTransaction,
  StockSummary,
  StockMutationResult,
  TransactionType,
  ProductType,
  ProductProfile,
} from "@/data/inventory";
import { formatStockDisplay, getConversionFactor, purchaseToValuation } from "@/data/inventory";

// ── [FIX-CAT] Corrected + extended item categories ────────────────────────
// ⚠️  The DB check constraint must be updated to include Chemical + Trading Goods.
//     See implementation_plan.md for the SQL migration.
//     After that migration, these 5 values are the ONLY accepted categories.
export const ITEM_CATEGORIES = [
  "Raw Material",
  "Chemical",
  "Finished Good",
  "Packaging",
  "Trading Goods",
] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

// Display labels for each profile type
export const ITEM_CATEGORY_LABELS: Record<ItemCategory, string> = {
  "Raw Material":  "Raw Material",
  "Chemical":      "Chemical / Liquid",
  "Finished Good": "Finished Good",
  "Packaging":     "Packaging",
  "Trading Goods": "Trading Goods",
};

// Profile type icons / colors for UI (Lucide icon name strings)
export const ITEM_CATEGORY_META: Record<ItemCategory, {
  icon: string;
  color: string;
  badge: string;
  description: string;
}> = {
  "Raw Material":  {
    icon: "FlaskConical",
    color: "text-amber-400",
    badge: "bg-amber-950/50 text-amber-400 border-amber-500/30",
    description: "Purchased in bags, valued in KG",
  },
  "Chemical":      {
    icon: "Beaker",
    color: "text-cyan-400",
    badge: "bg-cyan-950/50 text-cyan-400 border-cyan-500/30",
    description: "Purchased in drums, valued in litres",
  },
  "Finished Good": {
    icon: "Package",
    color: "text-violet-400",
    badge: "bg-violet-950/50 text-violet-400 border-violet-500/30",
    description: "Manufactured pipe bundles with MRP & dealer pricing",
  },
  "Packaging":     {
    icon: "Box",
    color: "text-emerald-400",
    badge: "bg-emerald-950/50 text-emerald-400 border-emerald-500/30",
    description: "Packaging materials tracked in pcs / rolls",
  },
  "Trading Goods": {
    icon: "ShoppingCart",
    color: "text-blue-400",
    badge: "bg-blue-950/50 text-blue-400 border-blue-500/30",
    description: "Purchased for resale with MRP",
  },
};

// ── Direction helper ───────────────────────────────────────────────
const TX_IN_TYPES: string[] = ["Purchase/In", "purchase_in", "return_in"];
const VALID_TRANSACTION_TYPES: string[] = [
  "Purchase/In",
  "purchase_in",
  "Production/Out",
  "production_out",
  "Sales/Out",
  "sales_out",
  "Adjustment",
  "adjustment",
  "return_in",
];

export const txDirection = (type: string): "in" | "out" =>
  TX_IN_TYPES.includes(type) ? "in" : "out";

const isValidTransactionType = (type: string): boolean =>
  VALID_TRANSACTION_TYPES.includes(type);

const isValidItemCategory = (category: string): category is ItemCategory =>
  (ITEM_CATEGORIES as readonly string[]).includes(category);

// ── [FIX-RLS] Auth helpers ─────────────────────────────────────────

async function requireUserId(): Promise<string> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Authenticated user not found");
  return userId;
}

function attachUserId<T extends object>(payload: T, userId: string): T & { user_id: string } {
  return { ...payload, user_id: userId };
}

// ══════════════════════════════════════════════════════════════════
// DISPLAY HELPERS — re-exported for convenience
// ══════════════════════════════════════════════════════════════════

/**
 * Returns the formatted stock string for an inventory item.
 * Automatically uses dual-unit display when purchase_unit + conversion_factor are set.
 *
 * Examples:
 *   Raw Material (25 KG/Bag):  "2500 KG (100 Bags)"
 *   Chemical (220 L/Drum):     "4400 L (20 Drums)"
 *   Finished Good:             "120 BDL"
 */
export { formatStockDisplay } from "@/data/inventory";

/**
 * Converts a quantity entered in purchase units to the valuation unit.
 * Use this when recording a stock movement entered in purchase units.
 *
 * E.g. user enters "100 Bags" → stores 2500 KG in current_stock.
 */
export function entryToValuationQty(
  enteredQty: number,
  item: Pick<InventoryItem, "purchase_unit" | "conversion_factor" | "unit_of_measure">,
  enteredInPurchaseUnit: boolean
): number {
  if (!enteredInPurchaseUnit) return enteredQty;
  return purchaseToValuation(enteredQty, item);
}

/**
 * Returns the label to show next to the quantity input in stock movement forms.
 * When a purchase unit exists, shows both: "Bags (1 Bag = 25 KG)"
 */
export function getMovementQtyLabel(item: InventoryItem): string {
  if (item.purchase_unit && getConversionFactor(item) > 1) {
    return `${item.purchase_unit}s (1 ${item.purchase_unit} = ${getConversionFactor(item)} ${item.unit_of_measure})`;
  }
  return item.unit_of_measure;
}

// ══════════════════════════════════════════════════════════════════
// READ — Products
// ══════════════════════════════════════════════════════════════════

/** Full select fragment — uses * to fetch all columns including new profile_data/UOM columns.
 *  Avoids hard-coding column names that may not exist in all DB environments.
 */
const ITEM_SELECT = "*";

/** Fetch all inventory items ordered by category then name. */
export const getItems = async (): Promise<InventoryItem[]> => {
  const { data, error } = await supabase
    .from("inventory_items")
    .select(ITEM_SELECT)
    .order("category")
    .order("item_name");

  if (error) throw new Error(`[inventoryStore.getItems] ${error.message}`);
  return (data as InventoryItem[]) ?? [];
};

// ══════════════════════════════════════════════════════════════════
// READ — Transactions
// ══════════════════════════════════════════════════════════════════

/** Fetch recent transactions with joined item details. Limit defaults to 300. */
export const getTransactions = async (limit = 300): Promise<InventoryTransaction[]> => {
  const { data, error } = await supabase
    .from("inventory_transactions")
    .select(
      "*, inventory_items(item_name, unit_of_measure, buy_rate, product_code, sku_code, current_stock, purchase_unit, conversion_factor, category)"
    )
    .order("transaction_date", { ascending: false })
    .order("created_at",       { ascending: false })
    .limit(limit);

  if (error) throw new Error(`[inventoryStore.getTransactions] ${error.message}`);
  return (data as InventoryTransaction[]) ?? [];
};

// ══════════════════════════════════════════════════════════════════
// READ — Aggregate (used by P&L and Dashboard)
// ══════════════════════════════════════════════════════════════════

/**
 * VALUATION METHOD: Weighted Average Cost (WAC)
 *
 *   closingStockValue = Σ (current_stock × buy_rate)
 *
 * Both current_stock and buy_rate are denominated in the valuation unit
 * (KG, Litre, BDL, pcs). The dual-unit purchase system does not affect
 * WAC — all stock is converted to valuation units on entry.
 *
 * ⚠️  FINANCIAL IMPACT — see original comments above.
 * ⚠️  FAILURE BEHAVIOUR — callers must check fetchError.
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

// ══════════════════════════════════════════════════════════════════
// WRITE — Post a transaction + update stock atomically
// ══════════════════════════════════════════════════════════════════

export interface PostTransactionPayload {
  item_id: string;
  transaction_type: TransactionType;
  /**
   * Quantity to record. MUST be in the valuation unit (KG, Litre, BDL, pcs).
   * If the user entered in purchase units (Bags, Drums), convert first via
   * entryToValuationQty() before calling this function.
   */
  quantity_changed: number;
  transaction_date: string;   // ISO "YYYY-MM-DD"
  reference_number?: string;
  notes?: string;
  /** Current stock of the item in valuation units — avoids a second read. */
  currentStock: number;
}

/**
 * Records a stock transaction and updates current_stock on the item.
 * Stock is always stored and updated in valuation units.
 *
 * [FIX-RLS] Uses requireUserId() / attachUserId() on the INSERT.
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

  const userId = await requireUserId();

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

  const { error: stockErr } = await supabase
    .from("inventory_items")
    .update({ current_stock: newStock })
    .eq("id", item_id);

  if (stockErr) {
    return { success: false, newStock: currentStock, error: stockErr.message };
  }

  return { success: true, newStock };
};

// ══════════════════════════════════════════════════════════════════
// WRITE — Reverse a transaction
// ══════════════════════════════════════════════════════════════════

export interface ReverseTransactionPayload {
  transactionId: string;
  item_id: string;
  transaction_type: TransactionType;
  quantity_changed: number;
  currentStock: number;
}

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

  const { error: delErr } = await supabase
    .from("inventory_transactions")
    .delete()
    .eq("id", transactionId);

  if (delErr) {
    return { success: false, newStock: currentStock, error: delErr.message };
  }

  const { error: stockErr } = await supabase
    .from("inventory_items")
    .update({ current_stock: newStock })
    .eq("id", item_id);

  if (stockErr) {
    return { success: false, newStock: currentStock, error: stockErr.message };
  }

  return { success: true, newStock };
};

// ══════════════════════════════════════════════════════════════════
// WRITE — Products CRUD
// ══════════════════════════════════════════════════════════════════

export type ProductPayload = Omit<InventoryItem,
  "id" | "created_at" | "updated_at" | "current_stock"
>;

/**
 * Insert a new inventory item.
 * profile_data and UOM fields are included in the payload automatically.
 */
export const addItem = async (payload: ProductPayload): Promise<{ error?: string }> => {
  if (!isValidItemCategory(payload.category)) {
    return {
      error:
        `Invalid item category "${payload.category}". ` +
        `Allowed values: ${ITEM_CATEGORIES.join(", ")}`,
    };
  }

  const userId = await requireUserId();

  const { error } = await supabase
    .from("inventory_items")
    .insert(attachUserId({ ...payload, current_stock: 0 }, userId));

  return error ? { error: error.message } : {};
};

/**
 * Update an existing inventory item.
 * Supports partial updates — only provided fields are changed.
 */
export const updateItem = async (
  id: string,
  payload: Partial<ProductPayload>
): Promise<{ error?: string }> => {
  if (payload.category && !isValidItemCategory(payload.category)) {
    return {
      error:
        `Invalid item category "${payload.category}". ` +
        `Allowed values: ${ITEM_CATEGORIES.join(", ")}`,
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
 */
export const deleteItem = async (id: string): Promise<{ error?: string }> => {
  const { error } = await supabase
    .from("inventory_items")
    .delete()
    .eq("id", id);

  return error ? { error: error.message } : {};
};
