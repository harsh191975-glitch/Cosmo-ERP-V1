import React, { useMemo, useState, useEffect, useCallback } from "react";
/*
 * ─── REQUIRED SUPABASE MIGRATION ─────────────────────────────────────────────
 *
 * Run once against your Supabase project before deploying this file:
 *
 *   -- 1. Canonical FK: freight expense → invoice
 *   ALTER TABLE expenses
 *     ADD COLUMN IF NOT EXISTS reference_invoice_no TEXT;
 *
 *   -- 2. Store the invoice's logistics freight value for mismatch detection.
 *      Never used in P&L — informational only.
 *   ALTER TABLE expenses
 *     ADD COLUMN IF NOT EXISTS invoice_freight_amount NUMERIC(14,2);
 *
 *   -- 3. Optional: prevent duplicate single-payment per invoice.
 *      Remove this constraint if partial/split payments per invoice are allowed.
 *   ALTER TABLE expenses
 *     ADD CONSTRAINT unique_freight_per_invoice
 *     UNIQUE (reference_invoice_no, category);
 *
 *   -- 4. Guard: freight amounts must be positive.
 *   ALTER TABLE expenses
 *     ADD CONSTRAINT freight_amount_positive
 *     CHECK (category <> 'Freight' OR amount > 0);
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  TrendingDown, Users, BadgePercent, Star, Zap, Truck,
  ChevronDown, ChevronRight, SlidersHorizontal, Search, Plus, Trash2,
  CalendarRange,
} from "lucide-react";
import { RecordExpense } from "@/components/RecordExpense";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export interface ExpenseRow {
  id: string;
  category: string;              // "Salaries" | "Commission" | "Royalty" | "Utilities" | "Freight"
  amount: number;                // actual amount paid — ALWAYS positive
  expense_date: string;          // ISO date string  e.g. "2026-01-15"
  payee_name?: string | null;
  payment_method?: string | null;
  salary_month?: string | null;
  billing_month?: string | null;
  utility_type?: string | null;
  /** Canonical FK to invoices.invoice_no — REQUIRED for Freight rows */
  reference_invoice_no?: string | null;
  /** Invoice's logistics freight value — used only for mismatch warning, never for P&L */
  invoice_freight_amount?: number | null;
  reference_text?: string | null;
  gross_amount?: number | null;
  tds_amount?: number | null;
  notes?: string | null;
  source?: string | null;
}

type Category = "Salaries" | "Commission" | "Royalty" | "Utilities" | "Freight";
type Section  = Category | null;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const formatCurrency = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

const formatDate = (iso: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const formatMonthLabel = (iso: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
};

/** yyyy-MM-dd string → Date (noon UTC to avoid timezone boundary issues) */
const parseDate = (iso: string): Date => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
};

/** "2026-01-15" → "January 2026" */
const isoToMonthYear = (iso: string) => {
  if (!iso) return "";
  return formatMonthLabel(iso);
};

/** Returns the start of a given month */
const startOfMonth = (year: number, month: number) => new Date(year, month, 1);
/** Returns the end of a given month (last ms) */
const endOfMonth   = (year: number, month: number) => new Date(year, month + 1, 0, 23, 59, 59, 999);

// ─────────────────────────────────────────────────────────────
// Central summary function — single source of calculations
// ─────────────────────────────────────────────────────────────
interface ExpensesSummary {
  total: number;
  byCategory: Record<string, number>;
  byMonth: Record<string, { total: number; byCategory: Record<string, number> }>;
  grossByCategory: Record<string, number>;
  tdsByCategory:   Record<string, number>;
}

function getExpensesSummary(rows: ExpenseRow[]): ExpensesSummary {
  const byCategory: Record<string, number> = {};
  const grossByCategory: Record<string, number> = {};
  const tdsByCategory:   Record<string, number> = {};
  const byMonth: Record<string, { total: number; byCategory: Record<string, number> }> = {};

  for (const e of rows) {
    const cat  = e.category ?? "Other";
    const amt  = Number(e.amount) || 0;
    const mon  = isoToMonthYear(e.expense_date);

    byCategory[cat] = (byCategory[cat] ?? 0) + amt;
    grossByCategory[cat] = (grossByCategory[cat] ?? 0) + (Number(e.gross_amount) || amt);
    tdsByCategory[cat]   = (tdsByCategory[cat]   ?? 0) + (Number(e.tds_amount)   || 0);

    if (!byMonth[mon]) byMonth[mon] = { total: 0, byCategory: {} };
    byMonth[mon].total += amt;
    byMonth[mon].byCategory[cat] = (byMonth[mon].byCategory[cat] ?? 0) + amt;
  }

  const total = Object.values(byCategory).reduce((s, v) => s + v, 0);
  return { total, byCategory, byMonth, grossByCategory, tdsByCategory };
}

// ─────────────────────────────────────────────────────────────
// Page metadata
// ─────────────────────────────────────────────────────────────
const PAGE_META = {
  "/expenses":            { title: "All Expenses", icon: TrendingDown, section: null           },
  "/expenses/salaries":   { title: "Salaries",     icon: Users,        section: "Salaries"     },
  "/expenses/commission": { title: "Commission",   icon: BadgePercent, section: "Commission"   },
  "/expenses/royalty":    { title: "Royalty",      icon: Star,         section: "Royalty"      },
  "/expenses/utilities":  { title: "Utilities",    icon: Zap,          section: "Utilities"    },
  "/expenses/freight":    { title: "Freight",      icon: Truck,        section: "Freight"      },
} as const;

// ─────────────────────────────────────────────────────────────
// Shared delete hook
// ─────────────────────────────────────────────────────────────
const useDeleteExpense = (onDeleted: () => void) => {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const handleDelete = async (id: string) => {
    if (!confirm("Delete this expense record? This cannot be undone.")) return;
    setDeletingId(id);
    await supabase.from("expenses").delete().eq("id", id);
    setDeletingId(null);
    onDeleted();
  };
  return { deletingId, handleDelete };
};

// ─────────────────────────────────────────────────────────────
// Delete button
// ─────────────────────────────────────────────────────────────
const DeleteBtn = ({ id, deletingId, onDelete }: {
  id: string; deletingId: string | null; onDelete: (id: string) => void;
}) => (
  <button
    onClick={e => { e.stopPropagation(); onDelete(id); }}
    disabled={deletingId === id}
    title="Delete record"
    className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-all duration-150 opacity-0 group-hover:opacity-100 disabled:opacity-30 border border-transparent hover:border-red-500/20">
    <Trash2 className="h-3.5 w-3.5" />
  </button>
);

// ─────────────────────────────────────────────────────────────
// Salaries Table
// ─────────────────────────────────────────────────────────────
const SalariesTable = ({ rows, onDeleted }: { rows: ExpenseRow[]; onDeleted: () => void }) => {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const { deletingId, handleDelete } = useDeleteExpense(onDeleted);
  const total = rows.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden backdrop-blur-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="px-3 py-3.5 w-8"></th>
              <th className="px-5 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Date</th>
              <th className="px-5 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Employee / Role</th>
              <th className="px-5 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Method</th>
              <th className="px-5 py-3.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Salary</th>
              <th className="px-4 py-3.5 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <React.Fragment key={row.id}>
                <tr
                  className="border-t border-white/[0.04] hover:bg-white/[0.03] transition-colors duration-150 cursor-pointer group"
                  onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}>
                  <td className="px-3 py-4 text-slate-600">
                    {expandedRow === row.id ? <ChevronDown className="h-3.5 w-3.5 text-violet-400" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </td>
                  <td className="px-5 py-4 text-slate-400 text-xs">{row.salary_month ?? formatDate(row.expense_date)}</td>
                  <td className="px-5 py-4 font-medium text-slate-200">{row.payee_name ?? "—"}</td>
                  <td className="px-5 py-4">
                    {row.payment_method ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-800/60 border border-slate-700/40 text-slate-400 text-[11px] font-mono">{row.payment_method}</span>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-5 py-4 text-right font-bold text-emerald-400 tabular-nums">{formatCurrency(Number(row.amount))}</td>
                  <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                    <DeleteBtn id={row.id} deletingId={deletingId} onDelete={handleDelete} />
                  </td>
                </tr>
                {expandedRow === row.id && (
                  <tr className="border-t border-white/[0.04]">
                    <td colSpan={6} className="px-8 py-5 bg-slate-900/40">
                      <div className="grid grid-cols-4 gap-5 text-sm">
                        <div><p className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">Period</p><p className="font-medium text-slate-300">{row.salary_month ?? formatDate(row.expense_date)}</p></div>
                        <div><p className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">Employee</p><p className="font-medium text-slate-300">{row.payee_name ?? "—"}</p></div>
                        <div><p className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">Payment Method</p><p className="font-medium text-slate-300">{row.payment_method ?? "—"}</p></div>
                        <div><p className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">Amount</p><p className="font-semibold text-emerald-400">{formatCurrency(Number(row.amount))}</p></div>
                        {row.notes && <div className="col-span-4"><p className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">Notes</p><p className="text-sm text-slate-400">{row.notes}</p></div>}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-14 text-center text-slate-600 text-sm">No records found for this period</td></tr>
            )}
            <tr className="border-t border-white/[0.07] bg-white/[0.02]">
              <td colSpan={4} className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</td>
              <td className="px-5 py-3.5 text-right font-bold text-emerald-400 tabular-nums">{formatCurrency(total)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Commission Table
// ─────────────────────────────────────────────────────────────
const CommissionTable = ({ rows, onDeleted }: { rows: ExpenseRow[]; onDeleted: () => void }) => {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const { deletingId, handleDelete } = useDeleteExpense(onDeleted);
  const total = rows.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden backdrop-blur-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="px-3 py-3.5 w-8"></th>
              <th className="px-5 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Date</th>
              <th className="px-5 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Recipient</th>
              <th className="px-5 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Category</th>
              <th className="px-5 py-3.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Amount</th>
              <th className="px-4 py-3.5 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <React.Fragment key={row.id}>
                <tr
                  className="border-t border-white/[0.04] hover:bg-white/[0.03] transition-colors duration-150 cursor-pointer group"
                  onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}>
                  <td className="px-3 py-4 text-slate-600">
                    {expandedRow === row.id ? <ChevronDown className="h-3.5 w-3.5 text-cyan-400" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </td>
                  <td className="px-5 py-4 text-slate-400 text-xs">{row.salary_month ?? formatDate(row.expense_date)}</td>
                  <td className="px-5 py-4 font-medium text-slate-200">{row.payee_name ?? "—"}</td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[11px] font-medium">{row.reference_text ?? "Commission"}</span>
                  </td>
                  <td className="px-5 py-4 text-right font-bold text-cyan-400 tabular-nums">{formatCurrency(Number(row.amount))}</td>
                  <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                    <DeleteBtn id={row.id} deletingId={deletingId} onDelete={handleDelete} />
                  </td>
                </tr>
                {expandedRow === row.id && (
                  <tr className="border-t border-white/[0.04]">
                    <td colSpan={6} className="px-8 py-5 bg-slate-900/40">
                      <div className="grid grid-cols-4 gap-5 text-sm">
                        <div><p className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">Period</p><p className="font-medium text-slate-300">{row.salary_month ?? formatDate(row.expense_date)}</p></div>
                        <div><p className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">Recipient</p><p className="font-medium text-slate-300">{row.payee_name ?? "—"}</p></div>
                        <div><p className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">Payment Method</p><p className="font-medium text-slate-300">{row.payment_method ?? "—"}</p></div>
                        <div><p className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">Amount</p><p className="font-semibold text-cyan-400">{formatCurrency(Number(row.amount))}</p></div>
                        {row.reference_invoice_no && (
                          <div><p className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">Linked Invoice</p><p className="font-mono text-xs text-slate-300">{row.reference_invoice_no}</p></div>
                        )}
                        {row.notes && <div className="col-span-4"><p className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">Notes</p><p className="text-sm text-slate-400">{row.notes}</p></div>}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-14 text-center text-slate-600 text-sm">No records found for this period</td></tr>
            )}
            {rows.length > 0 && (
              <tr className="border-t border-white/[0.07] bg-white/[0.02]">
                <td colSpan={4} className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</td>
                <td className="px-5 py-3.5 text-right font-bold text-cyan-400 tabular-nums">{formatCurrency(total)}</td>
                <td></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Royalty Table
// ─────────────────────────────────────────────────────────────
const RoyaltyTable = ({ rows, onDeleted }: { rows: ExpenseRow[]; onDeleted: () => void }) => {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const { deletingId, handleDelete } = useDeleteExpense(onDeleted);
  const totalNet   = rows.reduce((s, e) => s + Number(e.amount), 0);
  const totalGross = rows.reduce((s, e) => s + (Number(e.gross_amount) || Number(e.amount)), 0);
  const totalTds   = rows.reduce((s, e) => s + (Number(e.tds_amount) || 0), 0);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden backdrop-blur-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="px-3 py-3.5 w-8"></th>
              <th className="px-5 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Date</th>
              <th className="px-5 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Recipient</th>
              <th className="px-5 py-3.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Gross</th>
              <th className="px-5 py-3.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-widest">TDS</th>
              <th className="px-5 py-3.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Net Paid</th>
              <th className="px-4 py-3.5 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const gross = Number(row.gross_amount) || Number(row.amount);
              const tds   = Number(row.tds_amount)   || 0;
              const net   = Number(row.amount);
              return (
                <React.Fragment key={row.id}>
                  <tr
                    className="border-t border-white/[0.04] hover:bg-white/[0.03] transition-colors duration-150 cursor-pointer group"
                    onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}>
                    <td className="px-3 py-4 text-slate-600">
                      {expandedRow === row.id ? <ChevronDown className="h-3.5 w-3.5 text-amber-400" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </td>
                    <td className="px-5 py-4 text-slate-400 text-xs">{row.salary_month ?? formatDate(row.expense_date)}</td>
                    <td className="px-5 py-4 font-medium text-slate-200">{row.payee_name ?? "—"}</td>
                    <td className="px-5 py-4 text-right tabular-nums text-slate-300">{formatCurrency(gross)}</td>
                    <td className="px-5 py-4 text-right tabular-nums text-amber-400">{tds > 0 ? formatCurrency(tds) : <span className="text-slate-600">—</span>}</td>
                    <td className="px-5 py-4 text-right font-bold text-yellow-400 tabular-nums">{formatCurrency(net)}</td>
                    <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                      <DeleteBtn id={row.id} deletingId={deletingId} onDelete={handleDelete} />
                    </td>
                  </tr>
                  {expandedRow === row.id && (
                    <tr className="border-t border-white/[0.04]">
                      <td colSpan={7} className="px-8 py-5 bg-slate-900/40">
                        <div className="grid grid-cols-4 gap-5 text-sm">
                          <div><p className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">Period</p><p className="font-medium text-slate-300">{row.salary_month ?? formatDate(row.expense_date)}</p></div>
                          <div><p className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">Gross Amount</p><p className="font-medium text-slate-300">{formatCurrency(gross)}</p></div>
                          <div><p className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">TDS Deducted</p><p className="font-medium text-amber-400">{tds > 0 ? `${((tds / gross) * 100).toFixed(1)}% — ${formatCurrency(tds)}` : "Nil"}</p></div>
                          <div><p className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">Net Payout</p><p className="font-semibold text-yellow-400">{formatCurrency(net)}</p></div>
                          <div><p className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">Payment Method</p><p className="font-medium text-slate-300">{row.payment_method ?? "—"}</p></div>
                          {row.notes && <div className="col-span-3"><p className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">Notes</p><p className="text-sm text-slate-400">{row.notes}</p></div>}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-14 text-center text-slate-600 text-sm">No records found for this period</td></tr>
            )}
            {rows.length > 0 && (
              <tr className="border-t border-white/[0.07] bg-white/[0.02]">
                <td colSpan={3} className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Totals</td>
                <td className="px-5 py-3.5 text-right tabular-nums font-medium text-slate-300">{formatCurrency(totalGross)}</td>
                <td className="px-5 py-3.5 text-right tabular-nums text-amber-400 font-medium">{formatCurrency(totalTds)}</td>
                <td className="px-5 py-3.5 text-right font-bold text-yellow-400 tabular-nums">{formatCurrency(totalNet)}</td>
                <td></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Utilities Table
// ─────────────────────────────────────────────────────────────
const UtilitiesTable = ({ rows, onDeleted }: { rows: ExpenseRow[]; onDeleted: () => void }) => {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const { deletingId, handleDelete } = useDeleteExpense(onDeleted);
  const total = rows.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden backdrop-blur-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="px-3 py-3.5 w-8"></th>
              <th className="px-5 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Date</th>
              <th className="px-5 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Type</th>
              <th className="px-5 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Provider / Reference</th>
              <th className="px-5 py-3.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Amount</th>
              <th className="px-4 py-3.5 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <React.Fragment key={row.id}>
                <tr
                  className="border-t border-white/[0.04] hover:bg-white/[0.03] transition-colors duration-150 cursor-pointer group"
                  onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}>
                  <td className="px-3 py-4 text-slate-600">
                    {expandedRow === row.id ? <ChevronDown className="h-3.5 w-3.5 text-blue-400" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </td>
                  <td className="px-5 py-4 text-slate-400 text-xs">{row.billing_month ?? formatDate(row.expense_date)}</td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[11px] font-medium">{row.utility_type ?? "Utility"}</span>
                  </td>
                  <td className="px-5 py-4 text-slate-400 text-xs font-mono">{row.payee_name ?? row.reference_text ?? "—"}</td>
                  <td className="px-5 py-4 text-right font-bold text-blue-400 tabular-nums">{formatCurrency(Number(row.amount))}</td>
                  <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                    <DeleteBtn id={row.id} deletingId={deletingId} onDelete={handleDelete} />
                  </td>
                </tr>
                {expandedRow === row.id && (
                  <tr className="border-t border-white/[0.04]">
                    <td colSpan={6} className="px-8 py-5 bg-slate-900/40">
                      <div className="grid grid-cols-4 gap-5 text-sm">
                        <div><p className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">Billing Month</p><p className="font-medium text-slate-300">{row.billing_month ?? formatDate(row.expense_date)}</p></div>
                        <div><p className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">Utility Type</p><p className="font-medium text-slate-300">{row.utility_type ?? "—"}</p></div>
                        <div><p className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">Provider</p><p className="font-medium text-slate-300">{row.payee_name ?? "—"}</p></div>
                        <div><p className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">Amount</p><p className="font-semibold text-blue-400">{formatCurrency(Number(row.amount))}</p></div>
                        {row.reference_text && <div><p className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">Bill Reference</p><p className="font-mono text-xs text-slate-400">{row.reference_text}</p></div>}
                        {row.notes && <div className="col-span-3"><p className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">Notes</p><p className="text-sm text-slate-400">{row.notes}</p></div>}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-14 text-center text-slate-600 text-sm">No records found for this period</td></tr>
            )}
            <tr className="border-t border-white/[0.07] bg-white/[0.02]">
              <td colSpan={4} className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</td>
              <td className="px-5 py-3.5 text-right font-bold text-blue-400 tabular-nums">{formatCurrency(total)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Freight helpers
// ─────────────────────────────────────────────────────────────

/**
 * Returns true when the paid amount differs from the invoice logistics amount
 * by more than ₹1 (floating-point tolerance).
 */
const freightMismatch = (row: ExpenseRow): boolean => {
  if (row.invoice_freight_amount == null) return false;
  return Math.abs(Number(row.amount) - Number(row.invoice_freight_amount)) > 1;
};

/** Visual badge shown next to every freight invoice link */
const InvoiceBadge = ({ invoiceNo }: { invoiceNo: string }) => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-500/10 border border-violet-500/25 text-violet-300 font-mono text-[11px] font-medium">
    <Truck className="h-3 w-3 shrink-0" />
    {invoiceNo}
  </span>
);

/** Amber warning shown when paid ≠ invoice logistics value */
const MismatchWarning = ({ paid, invoiced }: { paid: number; invoiced: number }) => {
  const diff = paid - invoiced;
  return (
    <div className="flex items-start gap-2 mt-3 px-3.5 py-3 rounded-xl bg-amber-500/8 border border-amber-500/25 text-xs text-amber-300">
      <span className="mt-0.5 shrink-0 text-amber-400">⚠</span>
      <span>
        Paid amount ({formatCurrency(paid)}) differs from invoice logistics value ({formatCurrency(invoiced)}) by{" "}
        <strong className="text-amber-200">{diff > 0 ? "+" : ""}{formatCurrency(diff)}</strong>.
        This may indicate an {diff > 0 ? "overpayment" : "underpayment"} or a data-entry error.
        P&amp;L uses the <em>paid</em> amount only.
      </span>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Freight Table
// ─────────────────────────────────────────────────────────────
const FreightTable = ({ rows, onDeleted }: { rows: ExpenseRow[]; onDeleted: () => void }) => {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const { deletingId, handleDelete }  = useDeleteExpense(onDeleted);
  const total      = rows.reduce((s, e) => s + Number(e.amount), 0);
  const mismatches = rows.filter(freightMismatch).length;

  return (
    <div className="space-y-3">
      {/* Mismatch summary banner — only shown when at least one row has a discrepancy */}
      {mismatches > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/8 border border-amber-500/25 text-xs text-amber-300">
          <span className="text-amber-400 text-base shrink-0">⚠</span>
          <span>
            <strong className="text-amber-200">{mismatches} freight payment{mismatches > 1 ? "s" : ""}</strong> differ from their
            invoice logistics values. Expand each row to review. P&amp;L is unaffected — it always
            uses actual paid amounts.
          </span>
        </div>
      )}

      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="px-3 py-3.5 w-8"></th>
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Linked Invoice</th>
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Payment Date</th>
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Transporter</th>
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Method</th>
                <th className="px-5 py-3.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Paid Amount</th>
                <th className="px-4 py-3.5 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const hasMismatch   = freightMismatch(row);
                const invoiceNo     = row.reference_invoice_no;
                const missingInvoice = !invoiceNo;
                return (
                  <React.Fragment key={row.id}>
                    <tr
                      className={`border-t border-white/[0.04] hover:bg-white/[0.03] transition-colors duration-150 cursor-pointer group ${hasMismatch ? "bg-amber-500/[0.03]" : ""}`}
                      onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}>
                      <td className="px-3 py-4 text-slate-600">
                        {expandedRow === row.id
                          ? <ChevronDown className="h-3.5 w-3.5 text-violet-400" />
                          : <ChevronRight className="h-3.5 w-3.5" />}
                      </td>
                      {/* Invoice link cell */}
                      <td className="px-5 py-4">
                        {invoiceNo
                          ? <InvoiceBadge invoiceNo={invoiceNo} />
                          : <span className="text-xs text-red-400 italic">⚠ No invoice linked</span>
                        }
                      </td>
                      <td className="px-5 py-4 text-slate-400 text-xs">{formatDate(row.expense_date)}</td>
                      <td className="px-5 py-4 text-slate-400 text-xs">
                        {row.reference_text ?? row.payee_name ?? "—"}
                      </td>
                      <td className="px-5 py-4">
                        {row.payment_method ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-800/60 border border-slate-700/40 text-slate-400 text-[11px] font-mono">{row.payment_method}</span>
                        ) : <span className="text-slate-600 text-xs">—</span>}
                      </td>
                      <td className="px-5 py-4 text-right font-bold text-violet-400 tabular-nums">
                        {formatCurrency(Number(row.amount))}
                        {hasMismatch && <span className="ml-1.5 text-amber-400 text-xs" title="Amount differs from invoice logistics value">⚠</span>}
                      </td>
                      <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                        <DeleteBtn id={row.id} deletingId={deletingId} onDelete={handleDelete} />
                      </td>
                    </tr>

                    {/* Expanded detail panel */}
                    {expandedRow === row.id && (
                      <tr className="border-t border-white/[0.04]">
                        <td colSpan={7} className="px-8 py-5 bg-slate-900/40">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 text-sm">
                            <div>
                              <p className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">Payment Date</p>
                              <p className="font-medium text-slate-300">{formatDate(row.expense_date)}</p>
                            </div>
                            <div>
                              <p className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">Linked Invoice</p>
                              {invoiceNo
                                ? <InvoiceBadge invoiceNo={invoiceNo} />
                                : <p className="text-xs text-red-400 italic">Not linked — record may be incomplete</p>
                              }
                            </div>
                            <div>
                              <p className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">Transporter</p>
                              <p className="font-medium text-slate-300">{row.reference_text ?? row.payee_name ?? "—"}</p>
                            </div>
                            <div>
                              <p className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">Paid Amount (P&amp;L)</p>
                              <p className="font-semibold text-violet-400">{formatCurrency(Number(row.amount))}</p>
                            </div>
                            {row.invoice_freight_amount != null && (
                              <div>
                                <p className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">Invoice Logistics Value</p>
                                <p className="font-medium text-slate-400">{formatCurrency(Number(row.invoice_freight_amount))}</p>
                              </div>
                            )}
                            <div>
                              <p className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">Payment Method</p>
                              <p className="font-medium text-slate-300">{row.payment_method ?? "—"}</p>
                            </div>
                            {row.notes && (
                              <div className="col-span-2 sm:col-span-4">
                                <p className="text-[11px] text-slate-600 uppercase tracking-wider mb-1">Notes</p>
                                <p className="text-sm text-slate-400">{row.notes}</p>
                              </div>
                            )}
                          </div>
                          {/* Inline mismatch warning */}
                          {hasMismatch && row.invoice_freight_amount != null && (
                            <MismatchWarning
                              paid={Number(row.amount)}
                              invoiced={Number(row.invoice_freight_amount)}
                            />
                          )}
                          {/* Missing invoice warning */}
                          {missingInvoice && (
                            <div className="mt-3 px-3.5 py-3 rounded-xl bg-red-500/8 border border-red-500/25 text-xs text-red-300">
                              ⚠ This freight expense has no linked invoice. Edit the record to add{" "}
                              <code className="font-mono text-red-200">reference_invoice_no</code> for full traceability.
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center text-slate-600 text-sm">
                    No freight payments recorded for this period.
                  </td>
                </tr>
              )}

              {/* Footer totals */}
              <tr className="border-t border-white/[0.07] bg-white/[0.02]">
                <td colSpan={5} className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Total Freight Paid
                </td>
                <td className="px-5 py-3.5 text-right font-bold text-violet-400 tabular-nums">
                  {formatCurrency(total)}
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Data-rule legend */}
      <p className="text-xs text-slate-600 px-1">
        <strong className="text-slate-500">Data rules:</strong> Every freight entry must have a linked invoice
        (reference_invoice_no). Amounts must be positive. Multiple payments per invoice are
        allowed. P&amp;L uses <em>paid amounts only</em> — invoice logistics values are reference data.
      </p>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────
const Expenses = () => {
  // ── Route metadata ────────────────────────────────────────
  const { pathname } = useLocation();
  const meta    = PAGE_META[pathname as keyof typeof PAGE_META] ?? PAGE_META["/expenses"];
  const Icon    = meta.icon;
  const section = meta.section as Section;

  // ── UI state ──────────────────────────────────────────────
  const [showRecordExpense, setShowRecordExpense] = useState(false);
  const [refreshKey,        setRefreshKey]        = useState(0);
  const [searchTerm,        setSearchTerm]        = useState("");

  // ── Date-range filter state ───────────────────────────────
  // Default: current month
  const now = new Date();
  const [startDate, setStartDate] = useState<Date>(() => startOfMonth(now.getFullYear(), now.getMonth()));
  const [endDate,   setEndDate  ] = useState<Date>(() => endOfMonth  (now.getFullYear(), now.getMonth()));
  const [rangePreset, setRangePreset] = useState<string>("this_month");

  const applyPreset = useCallback((preset: string) => {
    const n = new Date();
    setRangePreset(preset);
    if (preset === "this_month") {
      setStartDate(startOfMonth(n.getFullYear(), n.getMonth()));
      setEndDate(  endOfMonth  (n.getFullYear(), n.getMonth()));
    } else if (preset === "last_month") {
      const d = new Date(n.getFullYear(), n.getMonth() - 1, 1);
      setStartDate(startOfMonth(d.getFullYear(), d.getMonth()));
      setEndDate(  endOfMonth  (d.getFullYear(), d.getMonth()));
    } else if (preset === "last_3") {
      setStartDate(startOfMonth(n.getFullYear(), n.getMonth() - 2));
      setEndDate(  endOfMonth  (n.getFullYear(), n.getMonth()));
    } else if (preset === "this_year") {
      setStartDate(new Date(n.getFullYear(), 0, 1));
      setEndDate(  new Date(n.getFullYear(), 11, 31, 23, 59, 59, 999));
    } else if (preset === "all_time") {
      setStartDate(new Date(2000, 0, 1));
      setEndDate(  new Date(2099, 11, 31));
    }
  }, []);

  // ── Supabase fetch — ALL expenses, no source filter ──────
  const [allExpenses, setAllExpenses] = useState<ExpenseRow[]>([]);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .order("expense_date", { ascending: false });
      if (error) console.error("[Expenses] fetch error:", error);
      setAllExpenses((data ?? []) as ExpenseRow[]);
      setLoading(false);
    };
    load();
  }, [refreshKey]);

  // ── Single filtered dataset — drives ALL UI & calculations ─
  const filteredExpenses = useMemo(() => {
    return allExpenses.filter(e => {
      // Date-range gate
      const d = parseDate(e.expense_date);
      if (isNaN(d.getTime())) return true; // don't hide rows with bad dates, show them
      if (d < startDate || d > endDate) return false;

      // Section (category) gate on sub-pages
      if (section && e.category !== section) return false;

      // Search gate
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const hay = [
          e.payee_name, e.category, e.reference_text,
          e.reference_invoice_no, e.notes, e.expense_date,
          e.salary_month, e.billing_month,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [allExpenses, startDate, endDate, section, searchTerm]);

  // ── Single centralized summary — all cards, tables, charts read this ─
  const summary = useMemo(() => getExpensesSummary(filteredExpenses), [filteredExpenses]);

  // ── Derive per-category filtered rows for sub-page tables ─
  const salaryRows     = useMemo(() => filteredExpenses.filter(e => e.category === "Salaries"),   [filteredExpenses]);
  const commissionRows = useMemo(() => filteredExpenses.filter(e => e.category === "Commission"), [filteredExpenses]);
  const royaltyRows    = useMemo(() => filteredExpenses.filter(e => e.category === "Royalty"),    [filteredExpenses]);
  const utilitiesRows  = useMemo(() => filteredExpenses.filter(e => e.category === "Utilities"),  [filteredExpenses]);
  const freightRows    = useMemo(() => filteredExpenses.filter(e => e.category === "Freight"),    [filteredExpenses]);

  // ── Category totals (from summary — single source) ────────
  const totalSalaries   = summary.byCategory["Salaries"]   ?? 0;
  const totalCommission = summary.byCategory["Commission"] ?? 0;
  const totalRoyaltyNet = summary.byCategory["Royalty"]    ?? 0;
  const totalElec       = summary.byCategory["Utilities"]  ?? 0;
  const totalFrt        = summary.byCategory["Freight"]    ?? 0;
  const grandTotal      = summary.total;

  // ── KPI cards ─────────────────────────────────────────────
  const overviewCards = [
    { label: "Grand Total",   value: grandTotal,      color: "text-red-400" },
    { label: "Salaries",      value: totalSalaries,   color: "text-green-400",  sub: `${salaryRows.length} record(s)` },
    { label: "Commission",    value: totalCommission, color: "text-cyan-400",   sub: `${commissionRows.length} record(s)` },
    { label: "Royalty (Net)", value: totalRoyaltyNet, color: "text-yellow-400", sub: `${royaltyRows.length} record(s)` },
    { label: "Utilities",     value: totalElec,       color: "text-blue-400",   sub: `${utilitiesRows.length} record(s)` },
    { label: "Freight",       value: totalFrt,        color: "text-purple-400", sub: `${freightRows.length} record(s)` },
  ];

  const subCards: Record<NonNullable<Section>, { label: string; value: number; color: string; sub?: string }[]> = {
    Salaries: [
      { label: "Total Salaries",  value: totalSalaries,                                                   color: "text-green-400", sub: `${salaryRows.length} records` },
      { label: "Avg per Record",  value: salaryRows.length > 0 ? totalSalaries / salaryRows.length : 0,   color: "text-foreground" },
      { label: "Highest Salary",  value: salaryRows.length > 0 ? Math.max(...salaryRows.map(e => Number(e.amount))) : 0, color: "text-foreground" },
    ],
    Commission: [
      { label: "Total Commission", value: totalCommission,                                                          color: "text-cyan-400",   sub: `${commissionRows.length} records` },
      { label: "Avg per Record",   value: commissionRows.length > 0 ? totalCommission / commissionRows.length : 0,  color: "text-foreground" },
      { label: "Largest Payment",  value: commissionRows.length > 0 ? Math.max(...commissionRows.map(e => Number(e.amount))) : 0, color: "text-foreground" },
    ],
    Royalty: [
      { label: "Gross Royalty", value: summary.grossByCategory["Royalty"] ?? 0,    color: "text-foreground", sub: `${royaltyRows.length} records` },
      { label: "TDS Deducted",  value: summary.tdsByCategory["Royalty"]   ?? 0,    color: "text-amber-500" },
      { label: "Net Paid",      value: totalRoyaltyNet,                             color: "text-yellow-400" },
    ],
    Utilities: [
      { label: "Total Utilities", value: totalElec,                                                         color: "text-blue-400",   sub: `${utilitiesRows.length} bills` },
      { label: "Avg per Bill",    value: utilitiesRows.length > 0 ? totalElec / utilitiesRows.length : 0,   color: "text-foreground" },
      { label: "Latest Bill",     value: utilitiesRows.length > 0 ? Number(utilitiesRows[0].amount) : 0,    color: "text-foreground", sub: utilitiesRows[0] ? formatDate(utilitiesRows[0].expense_date) : "" },
    ],
    Freight: [
      { label: "Total Freight",
        value: totalFrt,
        color: "text-purple-400",
        sub: `${freightRows.length} payment(s)` },
      { label: "Avg per Payment",
        value: freightRows.length > 0 ? totalFrt / freightRows.length : 0,
        color: "text-foreground",
        sub: `${freightRows.filter(r => r.reference_invoice_no).length}/${freightRows.length} linked to invoices` },
      { label: "Mismatch Warnings",
        value: 0,   // sentinel — rendered separately below via sub
        color: freightRows.some(r => freightMismatch(r)) ? "text-amber-400" : "text-foreground",
        sub: (() => {
          const n = freightRows.filter(r => freightMismatch(r)).length;
          return n > 0 ? `${n} payment${n > 1 ? "s" : ""} — paid ≠ invoice value` : "✓ All amounts match";
        })(),
        count: freightRows.filter(r => freightMismatch(r)).length },
    ],
  };

  const cards = section === null ? overviewCards : subCards[section];

  // ── Date range display label ───────────────────────────────
  const fmtDate = (d: Date) =>
    isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const rangeLabel = fmtDate(startDate) + " → " + fmtDate(endDate);

  return (
    <div className="space-y-6 p-1">

      {/* Record Expense modal */}
      {showRecordExpense && (
        <RecordExpense
          onClose={() => setShowRecordExpense(false)}
          onSaved={() => setRefreshKey(k => k + 1)}
        />
      )}

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
              <Icon className="h-4 w-4 text-red-400" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-100">{meta.title}</h2>
          </div>
          <p className="text-sm text-slate-500 pl-0.5">Track, categorise, and analyse operational spending</p>
        </div>
        <button
          onClick={() => setShowRecordExpense(true)}
          className="flex items-center gap-2 h-9 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold shadow-lg shadow-violet-900/30 hover:shadow-violet-900/50 hover:-translate-y-px transition-all duration-200 shrink-0">
          <Plus className="h-4 w-4" /> Record Expense
        </button>
      </div>

      {/* ── Global date-range filter ────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm">
        <div className="flex items-center gap-2 mr-1">
          <CalendarRange className="h-3.5 w-3.5 text-slate-500" />
          <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-widest">Date Range</span>
        </div>

        {/* Preset selector */}
        <Select value={rangePreset} onValueChange={applyPreset}>
          <SelectTrigger className="h-7 text-xs w-36 rounded-lg border-white/[0.08] bg-white/[0.04] text-slate-300 hover:bg-white/[0.07] transition-colors">
            <SelectValue placeholder="Select range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="last_month">Last Month</SelectItem>
            <SelectItem value="last_3">Last 3 Months</SelectItem>
            <SelectItem value="this_year">This Year</SelectItem>
            <SelectItem value="all_time">All Time</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>

        {/* Custom date inputs — only shown when preset=custom */}
        {rangePreset === "custom" && (
          <>
            <input
              type="date"
              value={isNaN(startDate.getTime()) ? "" : startDate.toISOString().slice(0, 10)}
              onChange={e => { if (e.target.value) setStartDate(parseDate(e.target.value)); }}
              className="h-7 text-xs px-2.5 rounded-lg border border-white/[0.08] bg-white/[0.04] text-slate-300 outline-none focus:border-violet-500/50 transition-colors"
            />
            <span className="text-xs text-slate-600">→</span>
            <input
              type="date"
              value={isNaN(endDate.getTime()) ? "" : endDate.toISOString().slice(0, 10)}
              onChange={e => { if (e.target.value) setEndDate(parseDate(e.target.value)); }}
              className="h-7 text-xs px-2.5 rounded-lg border border-white/[0.08] bg-white/[0.04] text-slate-300 outline-none focus:border-violet-500/50 transition-colors"
            />
          </>
        )}

        {/* Active range label */}
        <p className="text-xs text-slate-600 ml-auto">
          {rangeLabel}
        </p>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-600" />
          <Input
            className="pl-7 h-7 text-xs w-48 rounded-lg border-white/[0.08] bg-white/[0.04] text-slate-300 placeholder:text-slate-600 focus:border-violet-500/50 focus:bg-white/[0.06] transition-all"
            placeholder="Search expenses…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* ── KPI Cards ───────────────────────────────────────────── */}
      {loading ? (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 animate-pulse">
              <div className="h-2.5 bg-white/[0.06] rounded w-2/3 mb-3" />
              <div className="h-5 bg-white/[0.08] rounded w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className={`grid gap-3 ${section === null ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" : "grid-cols-3"}`}>
          {cards.map((c, i) => (
            <div key={i} className="group relative rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 hover:bg-white/[0.04] hover:-translate-y-0.5 transition-all duration-200 cursor-default overflow-hidden">
              {/* top accent line */}
              <div className={`absolute top-0 left-4 right-4 h-px rounded-full ${
                c.color.includes("red") ? "bg-red-500/40" :
                c.color.includes("green") || c.color.includes("emerald") ? "bg-emerald-500/40" :
                c.color.includes("cyan") ? "bg-cyan-500/40" :
                c.color.includes("yellow") ? "bg-yellow-500/40" :
                c.color.includes("blue") ? "bg-blue-500/40" :
                c.color.includes("purple") ? "bg-violet-500/40" :
                c.color.includes("amber") ? "bg-amber-500/40" :
                "bg-white/10"
              }`} />
              <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-widest mb-2">{c.label}</p>
              {"count" in c
                ? <p className={`text-xl font-bold tabular-nums ${c.color}`}>{(c as any).count}</p>
                : <p className={`text-xl font-bold tabular-nums ${c.color}`}>{formatCurrency(c.value)}</p>
              }
              {c.sub && <p className="text-[11px] text-slate-600 mt-1">{c.sub}</p>}
            </div>
          ))}
        </div>
      )}

      {/* ── Overview analytics (only on /expenses root) ─────────── */}
      {section === null && !loading && (() => {
        // Month-by-month breakdown — derived entirely from filteredExpenses via summary
        const monthEntries = Object.entries(summary.byMonth)
          .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime());

        // Category share bars
        const CATEGORIES: { key: string; label: string; color: string; barColor: string }[] = [
          { key: "Salaries",   label: "Salaries",   color: "text-emerald-400",  barColor: "bg-emerald-400"  },
          { key: "Commission", label: "Commission", color: "text-cyan-400",     barColor: "bg-cyan-400"     },
          { key: "Royalty",    label: "Royalty",    color: "text-yellow-400",   barColor: "bg-yellow-400"   },
          { key: "Utilities",  label: "Utilities",  color: "text-blue-400",     barColor: "bg-blue-500"     },
          { key: "Freight",    label: "Freight",    color: "text-violet-400",   barColor: "bg-violet-500"   },
        ];

        const categoryTotals = CATEGORIES.map(c => ({
          ...c,
          value: summary.byCategory[c.key] ?? 0,
          pct:   grandTotal > 0 ? ((summary.byCategory[c.key] ?? 0) / grandTotal) * 100 : 0,
        }));

        return (
          <>
            {/* Month-by-month breakdown */}
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.05]">
                <h3 className="text-sm font-semibold text-slate-200">Month-wise Breakdown</h3>
              </div>
              {monthEntries.length === 0 ? (
                <p className="text-sm text-slate-600 py-10 text-center">No expenses in the selected date range.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.05]">
                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-600 uppercase tracking-widest">Month</th>
                        {CATEGORIES.map(c => (
                          <th key={c.key} className={`px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-widest ${c.color}`}>{c.label}</th>
                        ))}
                        <th className="px-5 py-3 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthEntries.map(([month, data]) => (
                        <tr key={month} className="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                          <td className="px-5 py-3.5 font-medium text-slate-300">{month}</td>
                          {CATEGORIES.map(c => {
                            const v = data.byCategory[c.key] ?? 0;
                            return (
                              <td key={c.key} className={`px-5 py-3.5 text-right tabular-nums ${v > 0 ? c.color : "text-slate-700"}`}>
                                {v > 0 ? formatCurrency(v) : "—"}
                              </td>
                            );
                          })}
                          <td className="px-5 py-3.5 text-right tabular-nums font-bold text-slate-200">{formatCurrency(data.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-white/[0.07] bg-white/[0.02]">
                        <td className="px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Total</td>
                        {CATEGORIES.map(c => (
                          <td key={c.key} className={`px-5 py-3 text-right font-bold tabular-nums ${c.color}`}>
                            {formatCurrency(summary.byCategory[c.key] ?? 0)}
                          </td>
                        ))}
                        <td className="px-5 py-3 text-right font-bold tabular-nums text-slate-200">{formatCurrency(grandTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Spend distribution */}
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-5">
              <h3 className="text-sm font-semibold text-slate-200 mb-5">Spend Distribution</h3>
              <div className="space-y-4">
                {categoryTotals.map(c => (
                  <div key={c.key}>
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="text-slate-400 font-medium">{c.label}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-slate-600 tabular-nums w-10 text-right">{c.pct.toFixed(1)}%</span>
                        <span className={`font-semibold tabular-nums w-28 text-right ${c.color}`}>{formatCurrency(c.value)}</span>
                      </div>
                    </div>
                    <div className="w-full bg-white/[0.04] rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full transition-all duration-700 ${c.barColor}`} style={{ width: `${c.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        );
      })()}

      {/* ── Sub-page tables ──────────────────────────────────────── */}
      {section === "Salaries"   && <SalariesTable   rows={salaryRows}     onDeleted={() => setRefreshKey(k => k + 1)} />}
      {section === "Commission" && <CommissionTable rows={commissionRows} onDeleted={() => setRefreshKey(k => k + 1)} />}
      {section === "Royalty"    && <RoyaltyTable    rows={royaltyRows}    onDeleted={() => setRefreshKey(k => k + 1)} />}
      {section === "Utilities"  && <UtilitiesTable  rows={utilitiesRows}  onDeleted={() => setRefreshKey(k => k + 1)} />}
      {section === "Freight"    && <FreightTable    rows={freightRows}    onDeleted={() => setRefreshKey(k => k + 1)} />}

    </div>
  );
};

export default Expenses;
