/**
 * purchaseStore.ts
 * ─────────────────────────────────────────────────────────────────
 * Single source of truth for all purchase data.
 * Supabase-only — no JSON seeds, no localStorage.
 *
 * Mirrors the architecture of invoiceStore.ts:
 *   - Pure async functions consumed directly by hooks/components
 *   - Explicit error surfaces (throws on failure so callers can handle)
 *   - One efficient join query: purchases + purchase_line_items + supplier
 *
 * SUPPLIER IDENTITY CHANGE (ERP-grade integrity):
 *   - `supplier_id` (FK → purchase_suppliers.id) is now the canonical
 *     identity key for all grouping, aggregation, and linking logic.
 *   - `supplier_name` is a DISPLAY-ONLY field derived from the join.
 *     Never use it for equality checks, grouping, or AP identity.
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
  // ── Supplier identity ──────────────────────────────────────────
  /** Canonical FK — use for all grouping, linking, aggregation. */
  supplier_id: string;
  /** Display-only label. Never use for identity or grouping logic. */
  supplier_name: string;
  // ──────────────────────────────────────────────────────────────
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

export interface Supplier {
  id: string;
  name: string;
  created_at: string;
}

// ── Raw Supabase row shape ────────────────────────────────────────

interface RawSupplierJoin {
  id: string;
  name: string;
}

interface RawPurchaseRow {
  id: string;
  invoice_no: string;
  purchase_date: string;
  supplier_id: string;
  /** Joined from purchase_suppliers. Present when the relational select is used. */
  supplier: RawSupplierJoin | null;
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
  const cgst = raw.cgst ?? 0;
  const sgst = raw.sgst ?? 0;
  const igst = raw.igst ?? 0;
  return {
    id:             raw.id,
    invoice_no:     raw.invoice_no,
    purchase_date:  raw.purchase_date,
    supplier_id:    raw.supplier_id,
    supplier_name:  raw.supplier?.name ?? "",   // display only
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

// ── Relational select fragment (reused across all queries) ────────

/**
 * Always fetch the canonical supplier join so display name is always
 * populated without a second round-trip.
 */
const PURCHASE_SELECT =
  "*, purchase_line_items(*), supplier:purchase_suppliers(id, name)";

// ── Consistency validation (dev-mode warning, not a hard throw) ───

function warnIfInconsistent(p: Purchase): void {
  if (process.env.NODE_ENV !== "production" && p.line_items.length > 0) {
    const lineTotal = p.line_items.reduce((s, li) => s + (li.line_total ?? 0), 0);
    const diff = Math.abs(lineTotal - p.total_amount);
    if (diff > 1) {
      console.warn(
        `[purchaseStore] Consistency warning for ${p.invoice_no}: ` +
        `sum of line_items.line_total (${lineTotal.toFixed(2)}) ≠ ` +
        `purchases.total_amount (${p.total_amount.toFixed(2)})`
      );
    }
  }
}

// ══════════════════════════════════════════════════════════════════
// SERVICE LAYER — PURCHASES
// ══════════════════════════════════════════════════════════════════

/**
 * Fetch all purchases with their line items and relational supplier.
 * Single join query — no N+1.
 */
export async function getPurchases(): Promise<Purchase[]> {
  const { data, error } = await supabase
    .from("purchases")
    .select(PURCHASE_SELECT)
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
    .select(PURCHASE_SELECT)
    .eq("category", category)
    .order("purchase_date", { ascending: false });

  if (error) throw new Error(`getPurchasesByCategory: ${error.message}`);

  const purchases = (data as RawPurchaseRow[]).map(mapRow);
  purchases.forEach(warnIfInconsistent);
  return purchases;
}

/**
 * Fetch all purchases for a specific supplier.
 * Groups by `supplier_id` — the canonical identity key.
 */
export async function getPurchasesBySupplierId(supplierId: string): Promise<Purchase[]> {
  const { data, error } = await supabase
    .from("purchases")
    .select(PURCHASE_SELECT)
    .eq("supplier_id", supplierId)
    .order("purchase_date", { ascending: false });

  if (error) throw new Error(`getPurchasesBySupplierId: ${error.message}`);

  const purchases = (data as RawPurchaseRow[]).map(mapRow);
  purchases.forEach(warnIfInconsistent);
  return purchases;
}

/**
 * Fetch a single purchase with all line items and relational supplier.
 */
export async function getPurchaseById(id: string): Promise<Purchase | null> {
  const { data, error } = await supabase
    .from("purchases")
    .select(PURCHASE_SELECT)
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
  /** FK to purchase_suppliers.id — required for insert. */
  supplier_id: string;
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
  if (!p.invoice_no?.trim())  throw new Error("Invoice number is required.");
  if (!p.purchase_date)       throw new Error("Purchase date is required.");
  if (!p.supplier_id?.trim()) throw new Error("Supplier is required.");
  if (!p.category?.trim())    throw new Error("Category is required.");
  if (p.total_amount <= 0)    throw new Error("Total amount must be > 0.");
  if (p.taxable_amount < 0)   throw new Error("Taxable amount cannot be negative.");

  const expectedGST   = p.cgst + p.sgst + p.igst;
  const expectedTotal = p.taxable_amount + expectedGST;
  if (Math.abs(expectedTotal - p.total_amount) > 1) {
    throw new Error(
      `Total mismatch: taxable (${p.taxable_amount}) + GST (${expectedGST}) ≠ total (${p.total_amount})`
    );
  }

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
    .select(PURCHASE_SELECT)
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

  const { data: header, error: headerErr } = await supabase
    .from("purchases")
    .insert({ ...purchase, source: purchase.source ?? "manual" })
    .select()
    .single();

  if (headerErr) throw new Error(`createPurchaseWithItems (header): ${headerErr.message}`);

  const purchaseId = header.id as string;

  if (items.length > 0) {
    const lineRows = items.map(li => ({ ...li, purchase_id: purchaseId }));
    const { error: itemsErr } = await supabase
      .from("purchase_line_items")
      .insert(lineRows);

    if (itemsErr) {
      await supabase.from("purchases").delete().eq("id", purchaseId);
      throw new Error(`createPurchaseWithItems (line items): ${itemsErr.message}`);
    }
  }

  const result = await getPurchaseById(purchaseId);
  if (!result) throw new Error("createPurchaseWithItems: could not re-fetch after insert");
  return result;
}

// ── RPC input types ───────────────────────────────────────────────

/**
 * Minimal line item payload sent to the DB RPC.
 * Only raw user inputs — no derived/calculated fields.
 * The DB function `create_purchase_with_items` computes:
 *   taxable_value, gst_amount, line_total, taxable_amount, cgst, sgst, total_amount.
 */
export interface RpcLineItem {
  product_name:      string;
  item_category:     string;
  quantity:          number;
  unit_of_measure:   string;
  rate:              number;
  gst_pct:           number;
  inventory_item_id: string | null;
}

export interface CreatePurchaseRpcInput {
  p_supplier_id: string;
  p_invoice_no:  string;
  p_date:        string;          // "YYYY-MM-DD"
  p_category:    string;
  p_freight:     number;
  p_notes:       string | null;
  p_line_items:  RpcLineItem[];
}

/**
 * Create a purchase atomically via a single Supabase RPC call.
 *
 * Replaces the two-step pattern of:
 *   supabase.from("purchases").insert(...)
 *   supabase.from("purchase_line_items").insert(...)
 *
 * Benefits:
 *  - Atomic: header rollback is handled inside the DB function on any failure.
 *  - RLS-safe: the RPC executes server-side — avoids direct RLS policy blocks
 *    on purchase_line_items that caused the original insert error.
 *  - DB-authoritative: all derived financials (taxable_amount, cgst, sgst,
 *    total_amount, line_total) are computed server-side, preventing client drift.
 *
 * @throws Error with message from DB if validation or insert fails.
 */
export async function createPurchaseWithRpc(
  input: CreatePurchaseRpcInput
): Promise<Purchase> {
  if (!input.p_supplier_id?.trim()) throw new Error("Supplier is required.");
  if (!input.p_invoice_no?.trim())  throw new Error("Invoice number is required.");
  if (!input.p_date)                throw new Error("Purchase date is required.");
  if (input.p_line_items.length === 0) throw new Error("At least one line item is required.");

  const { data, error } = await supabase.rpc("create_purchase_with_items", {
    p_supplier_id: input.p_supplier_id,
    p_invoice_no:  input.p_invoice_no,
    p_date:        input.p_date,
    p_category:    input.p_category,
    p_freight:     input.p_freight,
    p_notes:       input.p_notes,
    p_line_items:  input.p_line_items,
  });

  if (error) throw new Error(`createPurchaseWithRpc: ${error.message}`);

  // RPC returns the new purchase id — re-fetch with full relational join
  const raw = data as { id: string } | string;
  const id  = typeof raw === "string" ? raw : raw.id;

  const result = await getPurchaseById(id);
  if (!result) throw new Error("createPurchaseWithRpc: could not fetch purchase after insert");
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

export interface SupplierSummaryEntry {
  /** Canonical identity. Use this for navigation, linking, AP drill-downs. */
  supplierId: string;
  /** Display label sourced from purchase_suppliers.name. */
  supplierName: string;
  spend: number;
  orders: number;
  lastDate: string;
}

export interface PurchaseSummary {
  totalSpend: number;
  totalTaxable: number;
  totalGST: number;
  totalOrders: number;
  byCategory: Record<string, { spend: number; orders: number }>;
  /**
   * Keyed by `supplier_id` (UUID string) — not by name.
   * Use `supplierName` inside each entry for display only.
   */
  bySupplier: Record<string, SupplierSummaryEntry>;
  /**
   * Keyed by display name (supplier_name) — for UI charts, labels, reports.
   * Derived at aggregation time from each Purchase record's display-only
   * `supplier_name` field. Two suppliers with the same display name but
   * different `supplier_id`s will be merged here (name collision).
   * For identity-safe logic, always use `bySupplier` (ID-keyed) instead.
   */
  bySupplierName: Record<string, { spend: number; orders: number; lastDate: string }>;
  byMonth: Record<string, number>;
}

export function summarizePurchases(purchases: Purchase[]): PurchaseSummary {
  const summary: PurchaseSummary = {
    totalSpend:   0,
    totalTaxable: 0,
    totalGST:     0,
    totalOrders:  purchases.length,
    byCategory:   {},
    bySupplier:   {},
    bySupplierName: {},
    byMonth:      {},
  };

  for (const p of purchases) {
    summary.totalSpend   += p.total_amount;
    summary.totalTaxable += p.taxable_amount;
    summary.totalGST     += p.total_gst;

    // ── Category grouping (unchanged) ──────────────────────────────
    const cat = summary.byCategory[p.category] ?? { spend: 0, orders: 0 };
    cat.spend  += p.total_amount;
    cat.orders += 1;
    summary.byCategory[p.category] = cat;

    // ── Supplier grouping — keyed by supplier_id, not name ─────────
    const sup: SupplierSummaryEntry = summary.bySupplier[p.supplier_id] ?? {
      supplierId:   p.supplier_id,
      supplierName: p.supplier_name,   // display only, set on first encounter
      spend:        0,
      orders:       0,
      lastDate:     "",
    };
    sup.spend  += p.total_amount;
    sup.orders += 1;
    if (p.purchase_date > sup.lastDate) sup.lastDate = p.purchase_date;
    summary.bySupplier[p.supplier_id] = sup;

    // ── Supplier grouping — keyed by display name (for UI) ─────────
    const displayName = p.supplier_name || "Unknown Supplier";
    const byName = summary.bySupplierName[displayName] ?? { spend: 0, orders: 0, lastDate: "" };
    byName.spend  += p.total_amount;
    byName.orders += 1;
    if (p.purchase_date > byName.lastDate) byName.lastDate = p.purchase_date;
    summary.bySupplierName[displayName] = byName;

    // ── Month grouping ─────────────────────────────────────────────
    const month = p.purchase_date.slice(0, 7);
    summary.byMonth[month] = (summary.byMonth[month] ?? 0) + p.total_amount;
  }

  return summary;
}

// ══════════════════════════════════════════════════════════════════
// SERVICE LAYER — SUPPLIERS
// ══════════════════════════════════════════════════════════════════

/**
 * Fetch all suppliers for the authenticated user, sorted A→Z.
 * RLS guarantees only the current user's rows are returned.
 */
export async function getSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from("purchase_suppliers")
    .select("id, name, created_at")
    .order("name", { ascending: true });

  if (error) throw new Error(`getSuppliers: ${error.message}`);
  return (data ?? []) as Supplier[];
}

/**
 * Create a supplier for the authenticated user.
 *
 * Design decisions:
 *  - Trims and collapses internal whitespace before insert (mirrors DB
 *    normalisation via REGEXP_REPLACE(TRIM(name), '\s+', ' ', 'g')).
 *  - Does NOT pass `user_id` — the column DEFAULT auth.uid() owns it.
 *  - Throws the raw Supabase PostgrestError (not a wrapped Error) so
 *    callers can inspect `err.code`:
 *      "23505" → unique_supplier_name_per_user constraint — duplicate.
 *
 * @param name  Raw supplier name from the UI input.
 * @returns     The newly inserted Supplier row.
 */
export async function createSupplier(name: string): Promise<Supplier> {
  // Mirror DB normalisation: trim + collapse internal whitespace
  const normalised = name.trim().replace(/\s+/g, " ");
  if (!normalised) throw new Error("Supplier name cannot be empty.");

  const { data, error } = await supabase
    .from("purchase_suppliers")
    .insert({ name: normalised })        // user_id filled by DB default
    .select("id, name, created_at")
    .single();

  if (error) throw error;               // preserve error.code for callers

  return data as Supplier;
}
