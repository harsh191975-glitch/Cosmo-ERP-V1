/**
 * invoiceStore.ts  — v3 (Supabase-only)
 *
 * All invoice and payment data now lives exclusively in Supabase.
 * JSON seeds (financeData / paymentsData) and localStorage are no longer used.
 *
 * Read path:   Supabase (async)
 * Write path:  Supabase (async, awaited — throws on failure)
 *
 * Balance formula:  Invoice Total − Payments − Credit Notes  (computed, never stored)
 *
 * Components must use async patterns (useEffect / hooks).
 * See src/pages/Invoices.tsx and InvoiceDetail.tsx for reference.
 */

import { supabase } from "@/lib/supabaseClient";
import {
  deleteCreditNotesByInvoice,
  getTotalCreditForInvoiceAsync,
  getCreditTotalsForInvoices,
} from "./creditNoteStore";

// ── Domain types (UI imports these from here) ─────────────────────────────────

export interface LineItem {
  productDescription: string;
  uom:                string;
  quantity:           number;
  rateExclTax:        number;
  rateInclTax:        number;
  discountPct:        number;
  lineAmount:         number;
}

export interface Invoice {
  id:                 number;        // derived row-index — used as React list key only
  invoiceNo:          string;
  invoiceDate:        string;        // "YYYY-MM-DD"
  bookedBy?:          string;
  customerName:       string;
  gstin:              string;
  placeOfSupply:      string;
  eWayBillNo?:        string;
  dispatchedThrough?: string;
  destination?:       string;
  taxableAmount:      number;
  cgst:               number;
  sgst:               number;
  freight:            number;
  roundOff:           number;
  totalAmount:        number;
  weightKg:           number;
  gstRate:            number;
  lineItems:          LineItem[];
}

export interface Payment {
  id:            string;             // UUID from Supabase invoice_payments.id
  invoiceNo:     string;
  customerName:  string;
  amountPaid:    number;
  paymentDate:   string;
  paymentMethod: string;
  reference:     string;
  status:        string;
  notes?:        string;
}

export interface NewPayment {
  invoiceNo:     string;
  customerName:  string;
  amountPaid:    number;
  paymentDate:   string;
  paymentMethod: string;
  reference:     string;
  notes?:        string;
}

export interface InvoiceStats {
  totalPaid:        number;
  totalCreditNotes: number;
  outstanding:      number;
  status:           "Paid" | "Partial" | "Overdue" | "Pending";
  invoicePayments:  Payment[];
}

export interface EnrichedInvoice extends Invoice {
  totalPaid:        number;
  totalCreditNotes: number;
  outstanding:      number;
  status:           "Paid" | "Partial" | "Overdue" | "Pending";
  invoicePayments:  Payment[];
}

// ── Row → domain mappers ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToInvoice(row: any, idx: number): Invoice {
  let lineItems: LineItem[] = [];
  try {
    lineItems = typeof row.line_items === "string"
      ? JSON.parse(row.line_items)
      : Array.isArray(row.line_items)
        ? row.line_items
        : [];
  } catch {
    lineItems = [];
  }
  return {
    id:                idx + 1,
    invoiceNo:         row.invoice_no,
    invoiceDate:       row.invoice_date,
    bookedBy:          row.booked_by          ?? undefined,
    customerName:      row.customer_name,
    gstin:             row.gstin              ?? "",
    placeOfSupply:     row.place_of_supply    ?? "",
    eWayBillNo:        row.eway_bill_no       ?? undefined,
    dispatchedThrough: row.dispatched_through ?? undefined,
    destination:       row.destination        ?? undefined,
    taxableAmount:     Number(row.taxable_amount ?? 0),
    cgst:              Number(row.cgst           ?? 0),
    sgst:              Number(row.sgst           ?? 0),
    freight:           Number(row.freight        ?? 0),
    roundOff:          Number(row.round_off      ?? 0),
    totalAmount:       Number(row.total_amount   ?? 0),
    weightKg:          Number(row.weight_kg      ?? 0),
    gstRate:           Number(row.gst_rate       ?? 18),
    lineItems,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToPayment(row: any): Payment {
  return {
    id:            row.id,
    invoiceNo:     row.invoice_no,
    customerName:  row.customer_name,
    amountPaid:    Number(row.amount_paid  ?? 0),
    paymentDate:   row.payment_date,
    paymentMethod: row.payment_method,
    reference:     row.reference ?? "",
    status:        row.status    ?? "Completed",
    notes:         row.notes     ?? undefined,
  };
}

// ── Status computation (pure, reusable) ───────────────────────────────────────

function computeStatus(
  totalAmount: number,
  totalPaid: number,
  totalCreditNotes: number,
  invoiceDate: string,
): InvoiceStats["status"] {
  const days = (Date.now() - new Date(invoiceDate).getTime()) / 86400000;
  if (totalPaid + totalCreditNotes >= totalAmount) return "Paid";
  if (totalPaid > 0 || totalCreditNotes > 0)       return "Partial";
  if (days > 30)                                    return "Overdue";
  return "Pending";
}

function getFinancialYearSuffix(baseDate = new Date()): string {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const startYear = month >= 3 ? year : year - 1;
  const endYear = (startYear + 1) % 100;
  return `${String(startYear).slice(-2)}-${String(endYear).padStart(2, "0")}`;
}

// ── Async reads ───────────────────────────────────────────────────────────────

export async function getAllInvoices(): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .order("invoice_date", { ascending: false });

  if (error) {
    console.error("[invoiceStore] getAllInvoices:", error.message);
    return [];
  }
  return (data ?? []).map((row, idx) => rowToInvoice(row, idx));
}

export async function getInvoiceByNo(invoiceNo: string): Promise<Invoice | null> {
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("invoice_no", invoiceNo)
    .maybeSingle();

  if (error) {
    console.error("[invoiceStore] getInvoiceByNo:", error.message);
    return null;
  }
  return data ? rowToInvoice(data, 0) : null;
}

export async function getAllPayments(): Promise<Payment[]> {
  const { data, error } = await supabase
    .from("invoice_payments")
    .select("*")
    .order("payment_date", { ascending: false });

  if (error) {
    console.error("[invoiceStore] getAllPayments:", error.message);
    return [];
  }
  return (data ?? []).map(rowToPayment);
}

export async function getPaymentsForInvoice(invoiceNo: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from("invoice_payments")
    .select("*")
    .eq("invoice_no", invoiceNo)
    .order("payment_date", { ascending: false });

  if (error) {
    console.error("[invoiceStore] getPaymentsForInvoice:", error.message);
    return [];
  }
  return (data ?? []).map(rowToPayment);
}

// ── Next invoice number ────────────────────────────────────────────────────────

export async function getNextInvoiceNo(baseDate = new Date()): Promise<string> {
  const fySuffix = getFinancialYearSuffix(baseDate);
  const { data } = await supabase
    .from("invoices")
    .select("invoice_no");

  const nums = (data ?? [])
    .map((r: { invoice_no: string }) => {
      const m = r.invoice_no.match(new RegExp(`^AHC\\/(\\d+)\\/${fySuffix}$`));
      return m ? parseInt(m[1]) : 0;
    })
    .filter((n: number) => n > 0);

  const next = Math.max(...(nums.length ? nums : [0])) + 1;
  return `AHC/${String(next).padStart(4, "0")}/${fySuffix}`;
}

// ── Write: save invoice ───────────────────────────────────────────────────────

export async function saveInvoice(invoice: Invoice): Promise<void> {
  const { error } = await supabase.from("invoices").upsert(
    {
      invoice_no:         invoice.invoiceNo,
      invoice_date:       invoice.invoiceDate,
      booked_by:          invoice.bookedBy          ?? null,
      customer_name:      invoice.customerName,
      gstin:              invoice.gstin,
      place_of_supply:    invoice.placeOfSupply,
      eway_bill_no:       invoice.eWayBillNo         ?? null,
      dispatched_through: invoice.dispatchedThrough  ?? null,
      destination:        invoice.destination        ?? null,
      taxable_amount:     invoice.taxableAmount,
      cgst:               invoice.cgst,
      sgst:               invoice.sgst,
      freight:            invoice.freight,
      round_off:          invoice.roundOff,
      total_amount:       invoice.totalAmount,
      weight_kg:          invoice.weightKg,
      gst_rate:           invoice.gstRate,
      line_items:         JSON.stringify(invoice.lineItems),
      source:             "manual",
    },
    { onConflict: "invoice_no" },
  );

  if (error) throw new Error(`[invoiceStore] saveInvoice: ${error.message}`);
}

// ── Write: save payment ───────────────────────────────────────────────────────

export async function savePayment(p: NewPayment): Promise<Payment> {
  const { data, error } = await supabase
    .from("invoice_payments")
    .insert({
      invoice_no:     p.invoiceNo,
      customer_name:  p.customerName,
      amount_paid:    p.amountPaid,
      payment_date:   p.paymentDate,
      payment_method: p.paymentMethod,
      reference:      p.reference || null,
      notes:          p.notes     || null,
      status:         "Completed",
      source:         "manual",
    })
    .select()
    .single();

  if (error || !data) throw new Error(`[invoiceStore] savePayment: ${error?.message}`);
  return rowToPayment(data);
}

// ── Write: delete payment by UUID ────────────────────────────────────────────

export async function deletePayment(id: string): Promise<void> {
  const { error } = await supabase
    .from("invoice_payments")
    .delete()
    .eq("id", id);

  if (error) throw new Error(`[invoiceStore] deletePayment: ${error.message}`);
}

// ── Write: delete all payments for invoice ────────────────────────────────────

export async function deletePaymentsByInvoice(invoiceNo: string): Promise<void> {
  const { error } = await supabase
    .from("invoice_payments")
    .delete()
    .eq("invoice_no", invoiceNo);

  if (error) throw new Error(`[invoiceStore] deletePaymentsByInvoice: ${error.message}`);
}

// ── Write: delete invoice + its payments ──────────────────────────────────────

export async function deleteInvoice(invoiceNo: string): Promise<void> {
  await Promise.all([
    deletePaymentsByInvoice(invoiceNo),
    deleteCreditNotesByInvoice(invoiceNo),
  ]);

  const { error } = await supabase
    .from("invoices")
    .delete()
    .eq("invoice_no", invoiceNo);

  if (error) throw new Error(`[invoiceStore] deleteInvoice: ${error.message}`);
}

// ── Compute stats for a single invoice ───────────────────────────────────────

export async function getInvoiceStats(
  invoiceNo:   string,
  totalAmount: number,
  invoiceDate: string,
): Promise<InvoiceStats> {
  const [payments, totalCreditNotes] = await Promise.all([
    getPaymentsForInvoice(invoiceNo),
    getTotalCreditForInvoiceAsync(invoiceNo),
  ]);

  const totalPaid   = payments.reduce((s, p) => s + p.amountPaid, 0);
  const outstanding = Math.max(0, totalAmount - totalPaid - totalCreditNotes);
  const status      = computeStatus(totalAmount, totalPaid, totalCreditNotes, invoiceDate);

  return { totalPaid, totalCreditNotes, outstanding, status, invoicePayments: payments };
}

// ── Build enriched invoice list (Invoices.tsx AllInvoicesTab) ─────────────────
// Fetches invoices + all payments in two parallel queries, then joins in memory.

export async function buildInvoicesWithPayments(): Promise<EnrichedInvoice[]> {
  const [invoices, allPayments] = await Promise.all([
    getAllInvoices(),
    getAllPayments(),
  ]);

  // Single batched query for all credit note totals — no N+1
  const invoiceNos       = invoices.map(inv => inv.invoiceNo);
  const creditTotalsMap  = await getCreditTotalsForInvoices(invoiceNos);

  return invoices.map(inv => {
    const invoicePayments  = allPayments.filter(p => p.invoiceNo === inv.invoiceNo);
    const totalPaid        = invoicePayments.reduce((s, p) => s + p.amountPaid, 0);
    const totalCreditNotes = creditTotalsMap.get(inv.invoiceNo) ?? 0;
    const outstanding      = Math.max(0, inv.totalAmount - totalPaid - totalCreditNotes);
    const status           = computeStatus(inv.totalAmount, totalPaid, totalCreditNotes, inv.invoiceDate);

    return { ...inv, totalPaid, totalCreditNotes, outstanding, status, invoicePayments };
  });
}

// ── Backup exports ────────────────────────────────────────────────────────────

export async function exportFinanceDataJson(): Promise<void> {
  const invoices = await getAllInvoices();
  const blob = new Blob([JSON.stringify(invoices, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "financeData.json"; a.click();
  URL.revokeObjectURL(url);
}

export async function exportPaymentsDataJson(): Promise<void> {
  const payments = await getAllPayments();
  const blob = new Blob([JSON.stringify(payments, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "paymentsData.json"; a.click();
  URL.revokeObjectURL(url);
}
