/**
 * purchaseStore.ts
 * ─────────────────────────────────────────────────────────────────
 * Single source of truth for all purchase data.
 * Supabase-only — no JSON seeds, no localStorage.
 *
 * Mirrors the architecture of invoiceStore.ts:
 *   - Pure async functions consumed directly by hooks/components
 *   - Explicit error surfaces (throws on failure so callers can handle)
 *   - One efficient join query: purchases + purchase_line_items
 * ─────────────────────────────────────────────────────────────────
 */

import { supabase } from "@/lib/supabaseClient";

// ── Canonical frontend types ──────────────────────────────────────

export interface PurchaseLineItem {
  id: string;
  purchase_id: string;
  product_name: string;
  item_category: "Raw Material" | "Packaging" | string;
  quantity: number;
  unit_of_measure: string;
  rate: number;
  gst_pct: number;
  taxable_value: number;
  gst_amount: number;
  line_total: number;
}

export interface Purchase {
  id: string;
  invoice_no: string;
  purchase_date: string;        // ISO date string "YYYY-MM-DD"
  supplier_name: string;
  category: string;             // "raw-materials" | "packaging" etc.
  taxable_amount: number;
  cgst: number;
  sgst: number;
  igst: number;
  total_gst: number;            // derived: cgst + sgst + igst
  total_amount: number;
  source: string;
  line_items: PurchaseLineItem[];
}

// ── Raw Supabase row shape ────────────────────────────────────────

interface RawPurchaseRow {
  id: string;
  invoice_no: string;
  purchase_date: string;
  supplier_name: string;
  category: string;
  taxable_amount: number;
  cgst: number;
  sgst: number;
  igst: number;
  total_amount: number;
  source: string;
  purchase_line_items: Omit<PurchaseLineItem, "purchase_id">[] | null;
}

// ── Transform raw DB row → canonical Purchase ─────────────────────

function mapRow(raw: RawPurchaseRow): Purchase {
  const cgst  = raw.cgst  ?? 0;
  const sgst  = raw.sgst  ?? 0;
  const igst  = raw.igst  ?? 0;
  return {
    id:             raw.id,
    invoice_no:     raw.invoice_no,
    purchase_date:  raw.purchase_date,
    supplier_name:  raw.supplier_name,
    category:       raw.category,
    taxable_amount: raw.taxable_amount ?? 0,
    cgst,
    sgst,
    igst,
    total_gst:      cgst + sgst + igst,
    total_amount:   raw.total_amount ?? 0,
    source:         raw.source ?? "manual",
    line_items:     (raw.purchase_line_items ?? []).map(li => ({
      ...li,
      purchase_id: raw.id,
    })),
  };
}

// ── Consistency validation (dev-mode warning, not a hard throw) ───

function warnIfInconsistent(p: Purchase): void {
  if (process.env.NODE_ENV !== "production" && p.line_items.length > 0) {
    const lineTotal = p.line_items.reduce((s, li) => s + (li.line_total ?? 0), 0);
    const diff = Math.abs(lineTotal - p.total_amount);
    if (diff > 1) {                         // allow ₹1 rounding tolerance
      console.warn(
        `[purchaseStore] Consistency warning for ${p.invoice_no}: ` +
        `sum of line_items.line_total (${lineTotal.toFixed(2)}) ≠ ` +
        `purchases.total_amount (${p.total_amount.toFixed(2)})`
      );
    }
  }
}

// ══════════════════════════════════════════════════════════════════
// SERVICE LAYER
// ══════════════════════════════════════════════════════════════════

/**
 * Fetch all purchases with their line items.
 * Single join query — no N+1.
 */
export async function getPurchases(): Promise<Purchase[]> {
  const { data, error } = await supabase
    .from("purchases")
    .select("*, purchase_line_items(*)")
    .order("purchase_date", { ascending: false });

  if (error) throw new Error(`getPurchases: ${error.message}`);

  const purchases = (data as RawPurchaseRow[]).map(mapRow);
  purchases.forEach(warnIfInconsistent);
  return purchases;
}

/**
 * Fetch all purchases for a specific category.
 * Filters at DB level.
 */
export async function getPurchasesByCategory(category: string): Promise<Purchase[]> {
  const { data, error } = await supabase
    .from("purchases")
    .select("*, purchase_line_items(*)")
    .eq("category", category)
    .order("purchase_date", { ascending: false });

  if (error) throw new Error(`getPurchasesByCategory: ${error.message}`);

  const purchases = (data as RawPurchaseRow[]).map(mapRow);
  purchases.forEach(warnIfInconsistent);
  return purchases;
}

/**
 * Fetch a single purchase with all line items.
 */
export async function getPurchaseById(id: string): Promise<Purchase | null> {
  const { data, error } = await supabase
    .from("purchases")
    .select("*, purchase_line_items(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`getPurchaseById: ${error.message}`);
  if (!data) return null;

  const purchase = mapRow(data as RawPurchaseRow);
  warnIfInconsistent(purchase);
  return purchase;
}

// ── Insert types ──────────────────────────────────────────────────

export interface NewPurchaseLineItem {
  product_name: string;
  item_category: "Raw Material" | "Packaging" | string;
  quantity: number;
  unit_of_measure: string;
  rate: number;
  gst_pct: number;
  taxable_value: number;
  gst_amount: number;
  line_total: number;
}

export interface NewPurchase {
  invoice_no: string;
  purchase_date: string;
  supplier_name: string;
  category: string;
  taxable_amount: number;
  cgst: number;
  sgst: number;
  igst: number;
  total_amount: number;
  source?: string;
}

/**
 * Validate a new purchase before insert.
 * Throws a descriptive error on failure.
 */
function validateNewPurchase(p: NewPurchase, items: NewPurchaseLineItem[]): void {
  if (!p.invoice_no?.trim())    throw new Error("Invoice number is required.");
  if (!p.purchase_date)         throw new Error("Purchase date is required.");
  if (!p.supplier_name?.trim()) throw new Error("Supplier name is required.");
  if (!p.category?.trim())      throw new Error("Category is required.");
  if (p.total_amount <= 0)      throw new Error("Total amount must be > 0.");
  if (p.taxable_amount < 0)     throw new Error("Taxable amount cannot be negative.");

  // Verify GST math
  const expectedGST = p.cgst + p.sgst + p.igst;
  const expectedTotal = p.taxable_amount + expectedGST;
  if (Math.abs(expectedTotal - p.total_amount) > 1) {
    throw new Error(
      `Total mismatch: taxable (${p.taxable_amount}) + GST (${expectedGST}) ≠ total (${p.total_amount})`
    );
  }

  // Verify line items add up if provided
  if (items.length > 0) {
    const lineTotal = items.reduce((s, li) => s + li.line_total, 0);
    if (Math.abs(lineTotal - p.total_amount) > 1) {
      throw new Error(
        `Line items total (${lineTotal.toFixed(2)}) does not match purchase total (${p.total_amount.toFixed(2)})`
      );
    }
  }
}

/**
 * Create a purchase (header only, no line items).
 */
export async function createPurchase(purchase: NewPurchase): Promise<Purchase> {
  validateNewPurchase(purchase, []);

  const { data, error } = await supabase
    .from("purchases")
    .insert({ ...purchase, source: purchase.source ?? "manual" })
    .select("*, purchase_line_items(*)")
    .single();

  if (error) throw new Error(`createPurchase: ${error.message}`);
  return mapRow(data as RawPurchaseRow);
}

/**
 * Create a purchase with line items atomically.
 * Inserts the header first, then bulk-inserts line items.
 * Rolls back (deletes header) if line item insert fails.
 */
export async function createPurchaseWithItems(
  purchase: NewPurchase,
  items: NewPurchaseLineItem[]
): Promise<Purchase> {
  validateNewPurchase(purchase, items);

  // 1. Insert header
  const { data: header, error: headerErr } = await supabase
    .from("purchases")
    .insert({ ...purchase, source: purchase.source ?? "manual" })
    .select()
    .single();

  if (headerErr) throw new Error(`createPurchaseWithItems (header): ${headerErr.message}`);

  const purchaseId = header.id as string;

  // 2. Bulk-insert line items
  if (items.length > 0) {
    const lineRows = items.map(li => ({ ...li, purchase_id: purchaseId }));
    const { error: itemsErr } = await supabase
      .from("purchase_line_items")
      .insert(lineRows);

    if (itemsErr) {
      // Rollback: remove the orphaned header
      await supabase.from("purchases").delete().eq("id", purchaseId);
      throw new Error(`createPurchaseWithItems (line items): ${itemsErr.message}`);
    }
  }

  // 3. Return fully-joined record
  const result = await getPurchaseById(purchaseId);
  if (!result) throw new Error("createPurchaseWithItems: could not re-fetch after insert");
  return result;
}

/**
 * Delete a purchase by ID.
 * FK cascade in DB removes line items automatically.
 */
export async function deletePurchase(id: string): Promise<void> {
  const { error } = await supabase.from("purchases").delete().eq("id", id);
  if (error) throw new Error(`deletePurchase: ${error.message}`);
}

// ── Aggregation helpers (used by Reports) ────────────────────────

export interface PurchaseSummary {
  totalSpend: number;
  totalTaxable: number;
  totalGST: number;
  totalOrders: number;
  byCategory: Record<string, { spend: number; orders: number }>;
  bySupplier: Record<string, { spend: number; orders: number; lastDate: string }>;
  byMonth: Record<string, number>;  // key: "YYYY-MM", value: spend
}

export function summarizePurchases(purchases: Purchase[]): PurchaseSummary {
  const summary: PurchaseSummary = {
    totalSpend:   0,
    totalTaxable: 0,
    totalGST:     0,
    totalOrders:  purchases.length,
    byCategory:   {},
    bySupplier:   {},
    byMonth:      {},
  };

  for (const p of purchases) {
    summary.totalSpend   += p.total_amount;
    summary.totalTaxable += p.taxable_amount;
    summary.totalGST     += p.total_gst;

    // By category
    const cat = summary.byCategory[p.category] ?? { spend: 0, orders: 0 };
    cat.spend  += p.total_amount;
    cat.orders += 1;
    summary.byCategory[p.category] = cat;

    // By supplier
    const sup = summary.bySupplier[p.supplier_name] ?? { spend: 0, orders: 0, lastDate: "" };
    sup.spend  += p.total_amount;
    sup.orders += 1;
    if (p.purchase_date > sup.lastDate) sup.lastDate = p.purchase_date;
    summary.bySupplier[p.supplier_name] = sup;

    // By month
    const month = p.purchase_date.slice(0, 7);
    summary.byMonth[month] = (summary.byMonth[month] ?? 0) + p.total_amount;
  }

  return summary;
}
