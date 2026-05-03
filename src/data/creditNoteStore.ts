/**
 * creditNoteStore.ts  — v2 (Supabase-only)
 *
 * All credit note data now lives exclusively in Supabase.
 * localStorage is no longer used.
 *
 * Read path:   Supabase (async)
 * Write path:  Supabase (async, awaited — throws on failure)
 *
 * Accounting rule: Balance = Invoice Total − Payments − Credit Notes
 * Credit notes are NOT payments — they are adjustments.
 *
 * Components must use async patterns (useEffect / hooks).
 * See src/pages/Invoices.tsx and InvoiceDetail.tsx for reference.
 */

import { supabase, getCurrentUserId } from "@/lib/supabaseClient";

// ── Domain types ───────────────────────────────────────────────────────────────

export type CreditNoteReason =
  | "Rate Difference"
  | "Goods Return"
  | "Discount Adjustment"
  | "Quantity Difference"
  | "Quality Issue"
  | "Other";

export interface CreditNoteLineItem {
  description: string;
  quantity:    number;
  rate:        number;
  amount:      number;       // quantity * rate
  discountPct: number;
  lineAmount:  number;       // amount after discount
}

export interface CreditNote {
  id:               string;  // UUID from Supabase
  creditNoteNumber: string;  // CN/0001/25-26 format
  invoiceNo:        string;
  customerName:     string;
  date:             string;  // ISO date
  reason:           CreditNoteReason;
  lineItems:        CreditNoteLineItem[];
  taxableAmount:    number;
  cgst:             number;
  sgst:             number;
  totalAmount:      number;
  notes?:           string;
  createdAt:        string;
}

export interface NewCreditNote {
  invoiceNo:     string;
  customerName:  string;
  date:          string;
  reason:        CreditNoteReason;
  lineItems:     CreditNoteLineItem[];
  taxableAmount: number;
  cgst:          number;
  sgst:          number;
  totalAmount:   number;
  notes?:        string;
}

// ── Row → domain mapper ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCreditNote(row: any): CreditNote {
  let lineItems: CreditNoteLineItem[] = [];
  try {
    // column is jsonb → driver gives us a plain array already.
    // Guard against legacy rows that were accidentally stored as a JSON string.
    lineItems = Array.isArray(row.line_items)
      ? row.line_items
      : typeof row.line_items === "string"
        ? JSON.parse(row.line_items)
        : [];
  } catch {
    lineItems = [];
  }

  return {
    id:               row.id,
    creditNoteNumber: row.credit_note_number,
    invoiceNo:        row.invoice_no,
    customerName:     row.customer_name,
    date:             row.date,
    reason:           row.reason as CreditNoteReason,
    lineItems,
    taxableAmount:    Number(row.taxable_amount ?? 0),
    cgst:             Number(row.cgst           ?? 0),
    sgst:             Number(row.sgst           ?? 0),
    totalAmount:      Number(row.total_amount   ?? 0),
    notes:            row.notes ?? undefined,
    createdAt:        row.created_at,
  };
}

function getFinancialYearSuffix(baseDate = new Date()): string {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const startYear = month >= 3 ? year : year - 1;
  const endYear = (startYear + 1) % 100;
  return `${String(startYear).slice(-2)}-${String(endYear).padStart(2, "0")}`;
}

// ── Next credit note number ───────────────────────────────────────────────────

export async function getNextCreditNoteNumber(baseDate = new Date()): Promise<string> {
  const fySuffix = getFinancialYearSuffix(baseDate);
  const { data } = await supabase
    .from("credit_notes")
    .select("credit_note_number");

  const nums = (data ?? [])
    .map((r: { credit_note_number: string }) => {
      const m = r.credit_note_number.match(new RegExp(`^CN\\/(\\d+)\\/${fySuffix}$`));
      return m ? parseInt(m[1]) : 0;
    })
    .filter((n: number) => n > 0);

  const next = Math.max(...(nums.length ? nums : [0])) + 1;
  return `CN/${String(next).padStart(4, "0")}/${fySuffix}`;
}

// ── Read all credit notes ─────────────────────────────────────────────────────

export async function getAllCreditNotes(): Promise<CreditNote[]> {
  const { data, error } = await supabase
    .from("credit_notes")
    .select("*")
    .order("date", { ascending: false });

  if (error) {
    console.error("[creditNoteStore] getAllCreditNotes:", error.message);
    return [];
  }
  return (data ?? []).map(rowToCreditNote);
}

// ── Get credit notes for a specific invoice ───────────────────────────────────

export async function getCreditNotesForInvoice(invoiceNo: string): Promise<CreditNote[]> {
  const { data, error } = await supabase
    .from("credit_notes")
    .select("*")
    .eq("invoice_no", invoiceNo)
    .order("date", { ascending: false });

  if (error) {
    console.error("[creditNoteStore] getCreditNotesForInvoice:", error.message);
    return [];
  }
  return (data ?? []).map(rowToCreditNote);
}

// ── Get total credit note amount for a single invoice (async) ────────────────

export async function getTotalCreditForInvoiceAsync(invoiceNo: string): Promise<number> {
  const notes = await getCreditNotesForInvoice(invoiceNo);
  return notes.reduce((sum, cn) => sum + cn.totalAmount, 0);
}

// ── Get credit totals for many invoices in ONE batched query ──────────────────
// Returns a Map<invoiceNo, totalCreditAmount>.
// Use this in list views (e.g. buildInvoicesWithPayments) to avoid N+1 queries.

export async function getCreditTotalsForInvoices(
  invoiceNos: string[],
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (invoiceNos.length === 0) return totals;

  const { data, error } = await supabase
    .from("credit_notes")
    .select("invoice_no, total_amount")
    .in("invoice_no", invoiceNos);

  if (error) {
    console.error("[creditNoteStore] getCreditTotalsForInvoices:", error.message);
    return totals;
  }

  for (const row of data ?? []) {
    const prev = totals.get(row.invoice_no) ?? 0;
    totals.set(row.invoice_no, prev + Number(row.total_amount ?? 0));
  }
  return totals;
}

// ── Save a new credit note ────────────────────────────────────────────────────

export async function saveCreditNote(input: NewCreditNote): Promise<CreditNote> {
  const [cnNumber, userId] = await Promise.all([
    getNextCreditNoteNumber(),
    getCurrentUserId(),
  ]);

  // Guard: if the session isn't hydrated yet, userId will be null and the
  // RLS policy (user_id = auth.uid()) will reject the insert silently.
  if (!userId) {
    throw new Error("[creditNoteStore] saveCreditNote: no authenticated user — cannot insert (RLS would reject)");
  }

  const { data, error } = await supabase
    .from("credit_notes")
    .insert({
      user_id:            userId,
      credit_note_number: cnNumber,
      invoice_no:         input.invoiceNo,
      customer_name:      input.customerName,
      date:               input.date,
      reason:             input.reason,
      // Pass the array directly — the column is jsonb, not text.
      // JSON.stringify() causes double-encoding: the driver serialises it again,
      // landing a raw string in the DB instead of a JSON array.
      line_items:         input.lineItems,
      taxable_amount:     input.taxableAmount,
      cgst:               input.cgst,
      sgst:               input.sgst,
      total_amount:       input.totalAmount,
      notes:              input.notes || null,
    })
    .select()
    .single();

  if (error || !data) {
    // Surface the full Supabase error so it appears in the console and can be
    // caught and displayed by the UI — not swallowed into "Failed to save".
    throw new Error(
      `[creditNoteStore] saveCreditNote failed — code: ${error?.code}, message: ${error?.message}, details: ${error?.details}, hint: ${error?.hint}`,
    );
  }

  return rowToCreditNote(data);
}

// ── Delete a credit note by credit note number ────────────────────────────────

export async function deleteCreditNote(creditNoteNumber: string): Promise<void> {
  const { error } = await supabase
    .from("credit_notes")
    .delete()
    .eq("credit_note_number", creditNoteNumber);

  if (error) throw new Error(`[creditNoteStore] deleteCreditNote: ${error.message}`);
}

// ── Delete all credit notes for an invoice ────────────────────────────────────

export async function deleteCreditNotesByInvoice(invoiceNo: string): Promise<void> {
  const { error } = await supabase
    .from("credit_notes")
    .delete()
    .eq("invoice_no", invoiceNo);

  if (error) throw new Error(`[creditNoteStore] deleteCreditNotesByInvoice: ${error.message}`);
}
