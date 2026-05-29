// src/data/inventory.ts
// Single source of truth for inventory domain types.
//
// MULTI-PROFILE ARCHITECTURE (v2)
// ────────────────────────────────────────────────────────────────
// Products are now grouped into 5 profile types. Each type carries
// different fields, units, costing logic, and UI behaviour.
//
// Profile types:
//   Raw Material  — purchased in Bags, valued in KG
//   Chemical      — purchased in Drums, valued in Litres
//   Finished Good — tracked in BDL with MRP / dealer pricing
//   Packaging     — simple pcs / unit tracking (legacy behaviour)
//   Trading Goods — purchased for resale, MRP-aware
//
// KEY UNIT ARCHITECTURE:
//   purchase_unit      — what the supplier invoices in (Bag, Drum, pcs)
//   valuation_unit     — what current_stock is stored in (KG, Litre, BDL)
//   display_unit       — label shown in stock tables (same as valuation_unit usually)
//   sales_unit         — unit used on outbound invoices (BDL, pcs)
//   conversion_factor  — valuation_unit per purchase_unit (25 KG/Bag, 220 L/Drum)
//
//   current_stock is ALWAYS in valuation_unit.
//   Display strings are computed by the store helpers.

// ── Product types ─────────────────────────────────────────────────

export type ProductType =
  | "Raw Material"
  | "Chemical"
  | "Finished Good"
  | "Packaging"
  | "Trading Goods";

/**
 * Legacy alias kept for backward compat — all existing code that
 * imports ItemCategory continues to compile unchanged.
 */
export type ItemCategory = ProductType;

// ── Profile-specific field shapes ─────────────────────────────────

export interface RawMaterialProfile {
  product_type: "Raw Material";
  /** Base/valuation unit — typically "KG" */
  base_unit: string;
  /** Purchase unit — typically "Bag" */
  purchase_unit: string;
  /** Valuation units per purchase unit — e.g. 25 (KG per Bag) */
  conversion_factor: number;
  /** Rate per valuation unit (₹/KG) */
  rate_per_base_unit: number;
}

export interface ChemicalProfile {
  product_type: "Chemical";
  /** Base/valuation unit — typically "Litre" */
  base_unit: string;
  /** Purchase unit — typically "Drum" */
  purchase_unit: string;
  /** Litres per Drum (e.g. 220) */
  conversion_ratio: number;
  /** Rate per litre */
  rate_per_litre: number;
}

export interface FinishedGoodsProfile {
  product_type: "Finished Good";
  /** Sales unit — "BDL" */
  sales_unit: string;
  /** Maximum Retail Price */
  mrp: number;
  /** Dealer discount percentage (0–100) */
  dealer_discount_pct: number;
  /** Computed: mrp × (1 − dealer_discount_pct / 100) */
  net_dealer_price: number;
  /**
   * Production / purchase cost per bundle — used for inventory valuation.
   * Mirrored into InventoryItem.buy_rate so all existing WAC formulas work.
   * If null/0 for legacy records, the UI falls back to net_dealer_price.
   */
  valuation_rate: number;
  /** Weight of one bundle in KG */
  bundle_weight: number;
  /** Number of pipe pieces per bundle */
  pieces_per_bundle: number;
  // ── Pipe specifications ──
  /** Nominal diameter e.g. "1 inch (25mm)" */
  diameter: string;
  /** Pressure grade e.g. "Class 3", "Class 4", "Class 6" */
  pressure_grade: string;
  /** Pipe length per piece e.g. "3 metres", "6 metres" */
  length: string;
  /** Colour of pipe e.g. "Grey", "White", "Blue" */
  color: string;
}

export interface PackagingProfile {
  product_type: "Packaging";
  /** Unit label — pcs, rolls, sheets, etc. */
  unit: string;
}

export interface TradingGoodsProfile {
  product_type: "Trading Goods";
  /** Sales/display unit */
  sales_unit: string;
  /** MRP — optional for trading goods */
  mrp?: number;
  /** Dealer discount % — optional */
  dealer_discount_pct?: number;
}

/** Discriminated union of all profile shapes */
export type ProductProfile =
  | RawMaterialProfile
  | ChemicalProfile
  | FinishedGoodsProfile
  | PackagingProfile
  | TradingGoodsProfile;

// ── Transaction types ─────────────────────────────────────────────

export type TransactionType =
  | "Purchase/In"
  | "Production/Out"
  | "Sales/Out"
  | "Adjustment"
  | "return_in";

// ── Core inventory item ───────────────────────────────────────────

export interface InventoryItem {
  id: string;
  sku_code: string;
  product_code?: string;
  item_name: string;

  /**
   * Product profile type — drives UI form, UOM display, valuation.
   * Stored as `category` in Supabase (backward-compat column name).
   */
  category: ProductType;

  /**
   * Valuation unit — the unit that `current_stock` and `buy_rate` are
   * denominated in. E.g. "KG" for Raw Material, "Litre" for Chemical,
   * "BDL" for Finished Good, "pcs" for Packaging / Trading Goods.
   */
  unit_of_measure: string;

  /** [NEW] What the supplier invoices in — "Bag", "Drum", "pcs", etc. */
  purchase_unit?: string | null;

  /**
   * [NEW] How many valuation_units are in one purchase_unit.
   * E.g. 25 (KG/Bag), 220 (Litre/Drum). Defaults to 1 when absent.
   */
  conversion_factor?: number | null;

  /** [NEW] Explicit label for the valuation unit (mirrors unit_of_measure). */
  valuation_unit?: string | null;

  /** [NEW] Label used in display strings — usually same as unit_of_measure. */
  display_unit?: string | null;

  /** Rate per valuation unit (₹/KG, ₹/Litre, ₹/BDL, etc.) */
  buy_rate?: number;

  /** Always stored in valuation units. */
  current_stock: number;

  /** Reorder threshold in valuation units. */
  minimum_reorder_level: number;

  /**
   * [NEW] Profile-specific fields stored as JSONB.
   * Shape is determined by `category` (ProductType).
   */
  profile_data?: ProductProfile | null;

  created_at: string;
  updated_at?: string;
}

// ── Joined transaction type ───────────────────────────────────────

export interface InventoryTransaction {
  id: string;
  item_id: string;
  transaction_type: TransactionType;
  quantity_changed: number;
  transaction_date?: string;
  reference_number?: string;
  notes?: string;
  created_at: string;
  // Joined fields from inventory_items
  inventory_items?: {
    item_name: string;
    unit_of_measure: string;
    buy_rate?: number;
    product_code?: string;
    sku_code?: string;
    current_stock?: number;
    purchase_unit?: string | null;
    conversion_factor?: number | null;
    category?: ProductType;
  } | null;
}

// ── Display helpers ───────────────────────────────────────────────

/**
 * Returns the purchase unit label for a given item.
 * Falls back to the valuation unit when no purchase unit is defined.
 */
export function getPurchaseUnitLabel(item: Pick<InventoryItem, "purchase_unit" | "unit_of_measure">): string {
  return item.purchase_unit || item.unit_of_measure;
}

/**
 * Returns the effective conversion factor (purchase → valuation unit).
 * Defaults to 1 when not set.
 */
export function getConversionFactor(item: Pick<InventoryItem, "conversion_factor">): number {
  return item.conversion_factor && item.conversion_factor > 0 ? item.conversion_factor : 1;
}

/**
 * Converts a quantity in purchase units to valuation units.
 * E.g. 100 Bags × 25 KG/Bag = 2500 KG
 */
export function purchaseToValuation(purchaseQty: number, item: Pick<InventoryItem, "conversion_factor">): number {
  return purchaseQty * getConversionFactor(item);
}

/**
 * Converts a quantity in valuation units to purchase units.
 * E.g. 2500 KG ÷ 25 KG/Bag = 100 Bags
 */
export function valuationToPurchase(valuationQty: number, item: Pick<InventoryItem, "conversion_factor">): number {
  const factor = getConversionFactor(item);
  return valuationQty / factor;
}

/**
 * Formats the stock display string based on the item's profile.
 *
 * Examples:
 *   Raw Material: "2500 KG (100 Bags)"
 *   Chemical:     "4400 L (20 Drums)"
 *   Finished Good: "120 BDL"
 *   Packaging:    "500 pcs"
 */
export function formatStockDisplay(item: Pick<
  InventoryItem,
  "current_stock" | "unit_of_measure" | "purchase_unit" | "conversion_factor" | "category"
>): string {
  const stock = item.current_stock;
  const valUnit = item.unit_of_measure || "pcs";
  const factor = getConversionFactor(item);
  const purchUnit = item.purchase_unit;

  // Dual-unit display when a purchase unit + conversion factor exist
  if (purchUnit && factor > 1) {
    const purchQty = stock / factor;
    const purchQtyFmt = purchQty % 1 === 0
      ? purchQty.toLocaleString("en-IN")
      : purchQty.toLocaleString("en-IN", { maximumFractionDigits: 2 });
    const valQtyFmt = stock % 1 === 0
      ? stock.toLocaleString("en-IN")
      : stock.toLocaleString("en-IN", { maximumFractionDigits: 2 });
    return `${valQtyFmt} ${valUnit} (${purchQtyFmt} ${purchUnit}s)`;
  }

  // Single-unit display
  const qtyFmt = stock % 1 === 0
    ? stock.toLocaleString("en-IN")
    : stock.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return `${qtyFmt} ${valUnit}`;
}

// ── Aggregate types used by the store layer ───────────────────────

export type ValuationMethod = "WAC" | "FIFO" | "STANDARD_COST";

export interface StockSummary {
  /** Total INR value of all current stock (WAC basis) */
  closingStockValue: number;
  /**
   * INR value of stock at the START of a reporting period.
   * null when not computed (all-time view or no transaction history).
   */
  openingStockValue: number | null;
  hasInventoryData: boolean;
  lowStockCount: number;
  totalItems: number;
  valuationMethod: ValuationMethod;
  fetchError: string | null;
}

export interface StockMutationResult {
  success: boolean;
  newStock: number;
  error?: string;
}

// ── Valuation helpers ─────────────────────────────────────────────

/**
 * Returns the effective valuation rate for a Finished Good item.
 *
 * Priority chain (migration-safe):
 *   1. item.buy_rate  — set after the fix is deployed
 *   2. profile_data.valuation_rate — redundant store in JSONB
 *   3. net_dealer_price — legacy fallback for old records
 *
 * Returns 0 only when none of the above are available.
 */
export function getFinishedGoodValuationRate(
  item: Pick<InventoryItem, "buy_rate" | "profile_data">
): { rate: number; isFallback: boolean } {
  if ((item.buy_rate ?? 0) > 0) {
    return { rate: item.buy_rate!, isFallback: false };
  }
  const pd = item.profile_data as FinishedGoodsProfile | null;
  if (pd?.valuation_rate && pd.valuation_rate > 0) {
    return { rate: pd.valuation_rate, isFallback: false };
  }
  // Migration fallback — use net_dealer_price as temporary estimate
  if (pd?.net_dealer_price && pd.net_dealer_price > 0) {
    return { rate: pd.net_dealer_price, isFallback: true };
  }
  return { rate: 0, isFallback: false };
}

/**
 * Returns the effective valuation rate for any inventory item.
 *
 * • For Finished Goods, delegates to getFinishedGoodValuationRate().
 * • For all other types, uses buy_rate directly (already correct).
 *
 * Use this everywhere instead of bare `item.buy_rate` so Finished Goods
 * are never excluded from inventory valuation calculations.
 */
export function getInventoryItemValuationRate(
  item: Pick<InventoryItem, "buy_rate" | "profile_data" | "category">
): number {
  if (item.category === "Finished Good") {
    return getFinishedGoodValuationRate(item).rate;
  }
  return item.buy_rate ?? 0;
}

/**
 * Returns total weight in stock for a Finished Good (BDL × KG/BDL).
 * Returns null for non-Finished Good items or when bundle_weight is missing.
 */
export function getTotalWeightInStock(
  item: Pick<InventoryItem, "category" | "current_stock" | "profile_data">
): number | null {
  if (item.category !== "Finished Good") return null;
  const pd = item.profile_data as FinishedGoodsProfile | null;
  const bw = pd?.bundle_weight ?? 0;
  if (bw <= 0 || item.current_stock <= 0) return null;
  return item.current_stock * bw;
}

/**
 * Computes total inventory weight across all items.
 *
 * Formula:
 *   Σ Raw Material  current_stock          (already in KG)
 * + Σ Finished Good current_stock × bundle_weight  (BDL → KG)
 *
 * Chemicals (Litres), Packaging, and Trading Goods are excluded
 * because no reliable density/weight conversion is available.
 */
export function getTotalInventoryWeight(items: InventoryItem[]): number {
  return items.reduce((total, item) => {
    if (item.category === "Raw Material") {
      return total + item.current_stock;
    }
    if (item.category === "Finished Good") {
      const w = getTotalWeightInStock(item);
      return total + (w ?? 0);
    }
    return total;
  }, 0);
}
