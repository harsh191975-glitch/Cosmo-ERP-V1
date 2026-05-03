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
import {
  getExpenses,
  deleteExpense,
  type ExpenseRow,
} from "@/data/expenseStore";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  TrendingDown, Users, BadgePercent, Star, Zap, Truck,
  ChevronDown, ChevronRight, Search, Plus, Trash2,
  CalendarRange, AlertTriangle, LinkIcon, BarChart3,
} from "lucide-react";
import { RecordExpense } from "@/components/RecordExpense";

// Types: ExpenseRow is imported from @/data/expenseStore — single source of truth.
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

const parseDate = (iso: string): Date => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
};

const isoToMonthYear = (iso: string) => {
  if (!iso) return "";
  return formatMonthLabel(iso);
};

const startOfMonth = (year: number, month: number) => new Date(year, month, 1);
const endOfMonth   = (year: number, month: number) => new Date(year, month + 1, 0, 23, 59, 59, 999);

// ─────────────────────────────────────────────────────────────
// Central summary function
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
// Category config
// ─────────────────────────────────────────────────────────────
const CAT_CONFIG: Record<string, { accent: string; bg: string; border: string; bar: string; glow: string; dot: string }> = {
  Salaries:   { accent: "text-emerald-400",  bg: "bg-emerald-500/10",  border: "border-emerald-500/25", bar: "bg-emerald-400",  glow: "shadow-emerald-900/30",  dot: "#34d399" },
  Commission: { accent: "text-cyan-400",     bg: "bg-cyan-500/10",     border: "border-cyan-500/25",    bar: "bg-cyan-400",     glow: "shadow-cyan-900/30",     dot: "#22d3ee" },
  Royalty:    { accent: "text-yellow-400",   bg: "bg-yellow-500/10",   border: "border-yellow-500/25",  bar: "bg-yellow-400",   glow: "shadow-yellow-900/30",   dot: "#facc15" },
  Utilities:  { accent: "text-blue-400",     bg: "bg-blue-500/10",     border: "border-blue-500/25",    bar: "bg-blue-500",     glow: "shadow-blue-900/30",     dot: "#60a5fa" },
  Freight:    { accent: "text-violet-400",   bg: "bg-violet-500/10",   border: "border-violet-500/25",  bar: "bg-violet-500",   glow: "shadow-violet-900/30",   dot: "#a78bfa" },
};

// ─────────────────────────────────────────────────────────────
// Shared delete hook
// ─────────────────────────────────────────────────────────────
const useDeleteExpense = (onDeleted: () => void) => {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const handleDelete = async (id: string) => {
    if (!confirm("Delete this expense record? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await deleteExpense(id);
    } catch (err) {
      console.error("[Expenses] deleteExpense failed:", err);
    }
    setDeletingId(null);
    onDeleted();
  };
  return { deletingId, handleDelete };
};

// ─────────────────────────────────────────────────────────────
// Shared sub-components
// ─────────────────────────────────────────────────────────────
const DeleteBtn = ({ id, deletingId, onDelete }: {
  id: string; deletingId: string | null; onDelete: (id: string) => void;
}) => (
  <button
    onClick={e => { e.stopPropagation(); onDelete(id); }}
    disabled={deletingId === id}
    title="Delete record"
    className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-700 hover:text-red-400 transition-all duration-150 opacity-0 group-hover:opacity-100 disabled:opacity-30 border border-transparent hover:border-red-500/20">
    <Trash2 className="h-3.5 w-3.5" />
  </button>
);

const MethodBadge = ({ method }: { method?: string | null }) =>
  method ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-800/70 border border-white/[0.06] text-slate-400 text-[11px] font-mono tracking-wide">
      {method}
    </span>
  ) : <span className="text-slate-700 text-xs">—</span>;

const DetailGrid = ({ children }: { children: React.ReactNode }) => (
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-4 text-sm">
    {children}
  </div>
);

const DetailCell = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <p className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.12em] mb-1.5">{label}</p>
    <div className="font-medium text-slate-300">{children}</div>
  </div>
);

const ExpandPanel = ({ colSpan, children }: { colSpan: number; children: React.ReactNode }) => (
  <tr>
    <td colSpan={colSpan} className="px-0 py-0">
      <div className="mx-2 mb-1 rounded-xl border border-white/[0.05] bg-[#060e1a] px-6 py-5">
        {children}
      </div>
    </td>
  </tr>
);

const EmptyRow = ({ colSpan, message = "No records found for this period" }: { colSpan: number; message?: string }) => (
  <tr>
    <td colSpan={colSpan} className="px-5 py-16 text-center">
      <div className="flex flex-col items-center gap-2">
        <BarChart3 className="h-8 w-8 text-slate-800" />
        <p className="text-sm text-slate-700">{message}</p>
      </div>
    </td>
  </tr>
);

const TH = ({ children, right = false, className = "" }: { children?: React.ReactNode; right?: boolean; className?: string }) => (
  <th className={`px-4 py-3.5 text-[10px] font-bold text-slate-600 uppercase tracking-[0.1em] whitespace-nowrap ${right ? "text-right" : "text-left"} ${className}`}>
    {children}
  </th>
);

// ─────────────────────────────────────────────────────────────
// Table shell
// ─────────────────────────────────────────────────────────────
const TableShell = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        {children}
      </table>
    </div>
  </div>
);

const TableFooter = ({ colSpan, label = "Total", value, colorClass }: {
  colSpan: number; label?: string; value: number; colorClass: string;
}) => (
  <tfoot>
    <tr className="border-t border-white/[0.07] bg-gradient-to-r from-white/[0.015] to-transparent">
      <td colSpan={colSpan} className="px-4 py-3.5 text-right text-[10px] font-bold text-slate-600 uppercase tracking-[0.1em]">{label}</td>
      <td className={`px-4 py-3.5 text-right font-bold tabular-nums ${colorClass}`}>{formatCurrency(value)}</td>
      <td className="w-10" />
    </tr>
  </tfoot>
);

// ─────────────────────────────────────────────────────────────
// Salaries Table
// ─────────────────────────────────────────────────────────────
const SalariesTable = ({ rows, onDeleted }: { rows: ExpenseRow[]; onDeleted: () => void }) => {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const { deletingId, handleDelete } = useDeleteExpense(onDeleted);
  const total = rows.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <TableShell>
      <thead>
        <tr className="border-b border-white/[0.05]">
          <TH className="w-8 px-3" />
          <TH>Date</TH>
          <TH>Employee</TH>
          <TH>Method</TH>
          <TH right>Net Salary</TH>
          <TH className="w-10" />
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <React.Fragment key={row.id}>
            <tr
              className="border-t border-white/[0.04] hover:bg-white/[0.025] transition-colors duration-100 cursor-pointer group"
              onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}>
              <td className="px-3 py-4 text-slate-700">
                {expandedRow === row.id
                  ? <ChevronDown className="h-3.5 w-3.5 text-emerald-400/80" />
                  : <ChevronRight className="h-3.5 w-3.5" />}
              </td>
              <td className="px-4 py-4 text-slate-500 text-xs tabular-nums">{row.salary_month ?? formatDate(row.expense_date)}</td>
              <td className="px-4 py-4 font-medium text-slate-200">{row.payee_name ?? "—"}</td>
              <td className="px-4 py-4"><MethodBadge method={row.payment_method} /></td>
              <td className="px-4 py-4 text-right font-bold text-emerald-400 tabular-nums">{formatCurrency(Number(row.amount))}</td>
              <td className="px-3 py-4" onClick={e => e.stopPropagation()}>
                <DeleteBtn id={row.id} deletingId={deletingId} onDelete={handleDelete} />
              </td>
            </tr>
            {expandedRow === row.id && (
              <ExpandPanel colSpan={6}>
                <DetailGrid>
                  <DetailCell label="Period">{row.salary_month ?? formatDate(row.expense_date)}</DetailCell>
                  <DetailCell label="Employee"><span className="text-slate-200">{row.payee_name ?? "—"}</span></DetailCell>
                  <DetailCell label="Payment Method"><MethodBadge method={row.payment_method} /></DetailCell>
                  <DetailCell label="Amount"><span className="text-emerald-400 font-bold">{formatCurrency(Number(row.amount))}</span></DetailCell>
                  {row.notes && (
                    <div className="col-span-4 mt-1 pt-4 border-t border-white/[0.05]">
                      <p className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.12em] mb-1.5">Notes</p>
                      <p className="text-xs text-slate-500 leading-relaxed">{row.notes}</p>
                    </div>
                  )}
                </DetailGrid>
              </ExpandPanel>
            )}
          </React.Fragment>
        ))}
        {rows.length === 0 && <EmptyRow colSpan={6} />}
      </tbody>
      {rows.length > 0 && <TableFooter colSpan={4} value={total} colorClass="text-emerald-400" />}
    </TableShell>
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
    <TableShell>
      <thead>
        <tr className="border-b border-white/[0.05]">
          <TH className="w-8 px-3" />
          <TH>Date</TH>
          <TH>Recipient</TH>
          <TH>Category</TH>
          <TH right>Amount</TH>
          <TH className="w-10" />
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <React.Fragment key={row.id}>
            <tr
              className="border-t border-white/[0.04] hover:bg-white/[0.025] transition-colors duration-100 cursor-pointer group"
              onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}>
              <td className="px-3 py-4 text-slate-700">
                {expandedRow === row.id
                  ? <ChevronDown className="h-3.5 w-3.5 text-cyan-400/80" />
                  : <ChevronRight className="h-3.5 w-3.5" />}
              </td>
              <td className="px-4 py-4 text-slate-500 text-xs tabular-nums">{row.salary_month ?? formatDate(row.expense_date)}</td>
              <td className="px-4 py-4 font-medium text-slate-200">{row.payee_name ?? "—"}</td>
              <td className="px-4 py-4">
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[11px] font-medium">
                  {row.reference_text ?? "Commission"}
                </span>
              </td>
              <td className="px-4 py-4 text-right font-bold text-cyan-400 tabular-nums">{formatCurrency(Number(row.amount))}</td>
              <td className="px-3 py-4" onClick={e => e.stopPropagation()}>
                <DeleteBtn id={row.id} deletingId={deletingId} onDelete={handleDelete} />
              </td>
            </tr>
            {expandedRow === row.id && (
              <ExpandPanel colSpan={6}>
                <DetailGrid>
                  <DetailCell label="Period">{row.salary_month ?? formatDate(row.expense_date)}</DetailCell>
                  <DetailCell label="Recipient"><span className="text-slate-200">{row.payee_name ?? "—"}</span></DetailCell>
                  <DetailCell label="Payment Method"><MethodBadge method={row.payment_method} /></DetailCell>
                  <DetailCell label="Amount"><span className="text-cyan-400 font-bold">{formatCurrency(Number(row.amount))}</span></DetailCell>
                  {row.reference_invoice_no && (
                    <DetailCell label="Linked Invoice">
                      <span className="font-mono text-xs text-slate-400">{row.reference_invoice_no}</span>
                    </DetailCell>
                  )}
                  {row.notes && (
                    <div className="col-span-4 mt-1 pt-4 border-t border-white/[0.05]">
                      <p className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.12em] mb-1.5">Notes</p>
                      <p className="text-xs text-slate-500 leading-relaxed">{row.notes}</p>
                    </div>
                  )}
                </DetailGrid>
              </ExpandPanel>
            )}
          </React.Fragment>
        ))}
        {rows.length === 0 && <EmptyRow colSpan={6} />}
      </tbody>
      {rows.length > 0 && <TableFooter colSpan={4} value={total} colorClass="text-cyan-400" />}
    </TableShell>
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
    <TableShell>
      <thead>
        <tr className="border-b border-white/[0.05]">
          <TH className="w-8 px-3" />
          <TH>Date</TH>
          <TH>Recipient</TH>
          <TH right>Gross</TH>
          <TH right>TDS</TH>
          <TH right>Net Paid</TH>
          <TH className="w-10" />
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
                className="border-t border-white/[0.04] hover:bg-white/[0.025] transition-colors duration-100 cursor-pointer group"
                onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}>
                <td className="px-3 py-4 text-slate-700">
                  {expandedRow === row.id
                    ? <ChevronDown className="h-3.5 w-3.5 text-yellow-400/80" />
                    : <ChevronRight className="h-3.5 w-3.5" />}
                </td>
                <td className="px-4 py-4 text-slate-500 text-xs tabular-nums">{row.salary_month ?? formatDate(row.expense_date)}</td>
                <td className="px-4 py-4 font-medium text-slate-200">{row.payee_name ?? "—"}</td>
                <td className="px-4 py-4 text-right tabular-nums text-slate-400">{formatCurrency(gross)}</td>
                <td className="px-4 py-4 text-right tabular-nums">
                  {tds > 0
                    ? <span className="text-amber-400">{formatCurrency(tds)}</span>
                    : <span className="text-slate-700">—</span>}
                </td>
                <td className="px-4 py-4 text-right font-bold text-yellow-400 tabular-nums">{formatCurrency(net)}</td>
                <td className="px-3 py-4" onClick={e => e.stopPropagation()}>
                  <DeleteBtn id={row.id} deletingId={deletingId} onDelete={handleDelete} />
                </td>
              </tr>
              {expandedRow === row.id && (
                <ExpandPanel colSpan={7}>
                  <DetailGrid>
                    <DetailCell label="Period">{row.salary_month ?? formatDate(row.expense_date)}</DetailCell>
                    <DetailCell label="Gross Amount"><span className="text-slate-300">{formatCurrency(gross)}</span></DetailCell>
                    <DetailCell label="TDS Deducted">
                      {tds > 0
                        ? <span className="text-amber-400">{((tds / gross) * 100).toFixed(1)}% — {formatCurrency(tds)}</span>
                        : <span className="text-slate-700">Nil</span>}
                    </DetailCell>
                    <DetailCell label="Net Payout"><span className="text-yellow-400 font-bold">{formatCurrency(net)}</span></DetailCell>
                    <DetailCell label="Payment Method"><MethodBadge method={row.payment_method} /></DetailCell>
                    {row.notes && (
                      <div className="col-span-4 mt-1 pt-4 border-t border-white/[0.05]">
                        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.12em] mb-1.5">Notes</p>
                        <p className="text-xs text-slate-500 leading-relaxed">{row.notes}</p>
                      </div>
                    )}
                  </DetailGrid>
                </ExpandPanel>
              )}
            </React.Fragment>
          );
        })}
        {rows.length === 0 && <EmptyRow colSpan={7} />}
      </tbody>
      {rows.length > 0 && (
        <tfoot>
          <tr className="border-t border-white/[0.07] bg-gradient-to-r from-white/[0.015] to-transparent">
            <td colSpan={3} className="px-4 py-3.5 text-right text-[10px] font-bold text-slate-600 uppercase tracking-[0.1em]">Totals</td>
            <td className="px-4 py-3.5 text-right tabular-nums font-medium text-slate-400">{formatCurrency(totalGross)}</td>
            <td className="px-4 py-3.5 text-right tabular-nums text-amber-400 font-medium">{formatCurrency(totalTds)}</td>
            <td className="px-4 py-3.5 text-right font-bold text-yellow-400 tabular-nums">{formatCurrency(totalNet)}</td>
            <td className="w-10" />
          </tr>
        </tfoot>
      )}
    </TableShell>
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
    <TableShell>
      <thead>
        <tr className="border-b border-white/[0.05]">
          <TH className="w-8 px-3" />
          <TH>Date</TH>
          <TH>Type</TH>
          <TH>Provider / Ref.</TH>
          <TH right>Amount</TH>
          <TH className="w-10" />
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <React.Fragment key={row.id}>
            <tr
              className="border-t border-white/[0.04] hover:bg-white/[0.025] transition-colors duration-100 cursor-pointer group"
              onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}>
              <td className="px-3 py-4 text-slate-700">
                {expandedRow === row.id
                  ? <ChevronDown className="h-3.5 w-3.5 text-blue-400/80" />
                  : <ChevronRight className="h-3.5 w-3.5" />}
              </td>
              <td className="px-4 py-4 text-slate-500 text-xs tabular-nums">{row.billing_month ?? formatDate(row.expense_date)}</td>
              <td className="px-4 py-4">
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[11px] font-medium">
                  {row.utility_type ?? "Utility"}
                </span>
              </td>
              <td className="px-4 py-4 text-slate-500 text-xs font-mono">{row.payee_name ?? row.reference_text ?? "—"}</td>
              <td className="px-4 py-4 text-right font-bold text-blue-400 tabular-nums">{formatCurrency(Number(row.amount))}</td>
              <td className="px-3 py-4" onClick={e => e.stopPropagation()}>
                <DeleteBtn id={row.id} deletingId={deletingId} onDelete={handleDelete} />
              </td>
            </tr>
            {expandedRow === row.id && (
              <ExpandPanel colSpan={6}>
                <DetailGrid>
                  <DetailCell label="Billing Month">{row.billing_month ?? formatDate(row.expense_date)}</DetailCell>
                  <DetailCell label="Utility Type"><span className="text-slate-200">{row.utility_type ?? "—"}</span></DetailCell>
                  <DetailCell label="Provider"><span className="text-slate-200">{row.payee_name ?? "—"}</span></DetailCell>
                  <DetailCell label="Amount"><span className="text-blue-400 font-bold">{formatCurrency(Number(row.amount))}</span></DetailCell>
                  {row.reference_text && (
                    <DetailCell label="Bill Reference">
                      <span className="font-mono text-xs text-slate-500">{row.reference_text}</span>
                    </DetailCell>
                  )}
                  {row.notes && (
                    <div className="col-span-4 mt-1 pt-4 border-t border-white/[0.05]">
                      <p className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.12em] mb-1.5">Notes</p>
                      <p className="text-xs text-slate-500 leading-relaxed">{row.notes}</p>
                    </div>
                  )}
                </DetailGrid>
              </ExpandPanel>
            )}
          </React.Fragment>
        ))}
        {rows.length === 0 && <EmptyRow colSpan={6} />}
      </tbody>
      {<TableFooter colSpan={4} value={total} colorClass="text-blue-400" />}
    </TableShell>
  );
};

// ─────────────────────────────────────────────────────────────
// Freight helpers
// ─────────────────────────────────────────────────────────────
const freightMismatch = (row: ExpenseRow): boolean => {
  if (row.invoice_freight_amount == null) return false;
  return Math.abs(Number(row.amount) - Number(row.invoice_freight_amount)) > 1;
};

const InvoiceBadge = ({ invoiceNo }: { invoiceNo: string }) => (
  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-violet-500/10 border border-violet-500/25 text-violet-300 font-mono text-[11px] font-medium">
    <LinkIcon className="h-2.5 w-2.5 shrink-0" />
    {invoiceNo}
  </span>
);

const MismatchWarning = ({ paid, invoiced }: { paid: number; invoiced: number }) => {
  const diff = paid - invoiced;
  return (
    <div className="flex items-start gap-3 mt-4 px-4 py-3.5 rounded-xl bg-amber-500/[0.06] border border-amber-500/25 text-xs text-amber-300/90">
      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-400" />
      <span>
        Paid ({formatCurrency(paid)}) differs from invoice logistics value ({formatCurrency(invoiced)}) by{" "}
        <strong className="text-amber-200">{diff > 0 ? "+" : ""}{formatCurrency(diff)}</strong>.
        {" "}This may indicate an {diff > 0 ? "overpayment" : "underpayment"} or data-entry error.
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
      {mismatches > 0 && (
        <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-amber-500/[0.06] border border-amber-500/20 text-xs text-amber-300/90">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <span>
            <strong className="text-amber-200">{mismatches} freight payment{mismatches > 1 ? "s" : ""}</strong>{" "}
            differ from their invoice logistics values. Expand each row to review.
            P&amp;L is unaffected — it uses actual paid amounts.
          </span>
        </div>
      )}

      <TableShell>
        <thead>
          <tr className="border-b border-white/[0.05]">
            <TH className="w-8 px-3" />
            <TH>Linked Invoice</TH>
            <TH>Payment Date</TH>
            <TH>Transporter</TH>
            <TH>Method</TH>
            <TH right>Paid Amount</TH>
            <TH className="w-10" />
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const hasMismatch    = freightMismatch(row);
            const invoiceNo      = row.reference_invoice_no;
            const missingInvoice = !invoiceNo;
            return (
              <React.Fragment key={row.id}>
                <tr
                  className={`border-t border-white/[0.04] hover:bg-white/[0.025] transition-colors duration-100 cursor-pointer group ${hasMismatch ? "bg-amber-500/[0.025]" : ""}`}
                  onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}>
                  <td className="px-3 py-4 text-slate-700">
                    {expandedRow === row.id
                      ? <ChevronDown className="h-3.5 w-3.5 text-violet-400/80" />
                      : <ChevronRight className="h-3.5 w-3.5" />}
                  </td>
                  <td className="px-4 py-4">
                    {invoiceNo
                      ? <InvoiceBadge invoiceNo={invoiceNo} />
                      : <span className="text-xs text-red-400/80 italic flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> No invoice</span>}
                  </td>
                  <td className="px-4 py-4 text-slate-500 text-xs tabular-nums">{formatDate(row.expense_date)}</td>
                  <td className="px-4 py-4 text-slate-400 text-xs">{row.reference_text ?? row.payee_name ?? "—"}</td>
                  <td className="px-4 py-4"><MethodBadge method={row.payment_method} /></td>
                  <td className="px-4 py-4 text-right font-bold text-violet-400 tabular-nums">
                    {formatCurrency(Number(row.amount))}
                    {hasMismatch && <span className="ml-1.5 text-amber-400 text-[10px]" title="Amount differs from invoice">⚠</span>}
                  </td>
                  <td className="px-3 py-4" onClick={e => e.stopPropagation()}>
                    <DeleteBtn id={row.id} deletingId={deletingId} onDelete={handleDelete} />
                  </td>
                </tr>
                {expandedRow === row.id && (
                  <ExpandPanel colSpan={7}>
                    <DetailGrid>
                      <DetailCell label="Payment Date">{formatDate(row.expense_date)}</DetailCell>
                      <DetailCell label="Linked Invoice">
                        {invoiceNo
                          ? <InvoiceBadge invoiceNo={invoiceNo} />
                          : <p className="text-xs text-red-400/80 italic">Not linked</p>}
                      </DetailCell>
                      <DetailCell label="Transporter">
                        <span className="text-slate-200">{row.reference_text ?? row.payee_name ?? "—"}</span>
                      </DetailCell>
                      <DetailCell label="Paid Amount (P&L)">
                        <span className="text-violet-400 font-bold">{formatCurrency(Number(row.amount))}</span>
                      </DetailCell>
                      {row.invoice_freight_amount != null && (
                        <DetailCell label="Invoice Logistics Value">
                          <span className="text-slate-400">{formatCurrency(Number(row.invoice_freight_amount))}</span>
                        </DetailCell>
                      )}
                      <DetailCell label="Payment Method"><MethodBadge method={row.payment_method} /></DetailCell>
                      {row.notes && (
                        <div className="col-span-4 mt-1 pt-4 border-t border-white/[0.05]">
                          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.12em] mb-1.5">Notes</p>
                          <p className="text-xs text-slate-500 leading-relaxed">{row.notes}</p>
                        </div>
                      )}
                    </DetailGrid>
                    {hasMismatch && row.invoice_freight_amount != null && (
                      <MismatchWarning paid={Number(row.amount)} invoiced={Number(row.invoice_freight_amount)} />
                    )}
                    {missingInvoice && (
                      <div className="flex items-start gap-3 mt-4 px-4 py-3.5 rounded-xl bg-red-500/[0.06] border border-red-500/20 text-xs text-red-300/90">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-red-400" />
                        <span>
                          No linked invoice. Edit this record to add{" "}
                          <code className="font-mono text-red-200 bg-red-500/10 px-1 py-0.5 rounded">reference_invoice_no</code>{" "}
                          for full traceability.
                        </span>
                      </div>
                    )}
                  </ExpandPanel>
                )}
              </React.Fragment>
            );
          })}
          {rows.length === 0 && <EmptyRow colSpan={7} message="No freight payments recorded for this period." />}
        </tbody>
        <TableFooter colSpan={5} label="Total Freight Paid" value={total} colorClass="text-violet-400" />
      </TableShell>

      <p className="text-xs text-slate-700 px-1">
        <strong className="text-slate-600">Data rules:</strong> Every freight entry must have a linked invoice.
        Amounts must be positive. Multiple payments per invoice are allowed. P&amp;L uses{" "}
        <em>paid amounts only</em> — invoice logistics values are reference data.
      </p>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Skeleton loader
// ─────────────────────────────────────────────────────────────
const KPISkeleton = ({ count }: { count: number }) => (
  <div className={`grid gap-3 grid-cols-2 sm:grid-cols-3 ${count === 6 ? "lg:grid-cols-6" : "lg:grid-cols-3"}`}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="rounded-2xl border border-white/[0.05] bg-white/[0.015] p-5 animate-pulse">
        <div className="h-2 bg-white/[0.05] rounded w-1/2 mb-4" />
        <div className="h-6 bg-white/[0.07] rounded w-3/4 mb-2" />
        <div className="h-2 bg-white/[0.04] rounded w-1/3" />
      </div>
    ))}
  </div>
);

// ─────────────────────────────────────────────────────────────
// KPI Card
// ─────────────────────────────────────────────────────────────
interface KPICard {
  label: string;
  value?: number;
  count?: number;
  color: string;
  accentLine: string;
  sub?: string;
}

const KPICard = ({ card }: { card: KPICard }) => (
  <div className={`relative rounded-2xl border border-white/[0.05] bg-white/[0.015] p-5 hover:bg-white/[0.03] hover:-translate-y-0.5 transition-all duration-200 cursor-default overflow-hidden group`}>
    {/* top accent line */}
    <div className={`absolute top-0 left-0 right-0 h-px ${card.accentLine} opacity-60`} />
    <p className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.12em] mb-3">{card.label}</p>
    {card.count !== undefined
      ? <p className={`text-2xl font-bold tabular-nums ${card.color}`}>{card.count}</p>
      : <p className={`text-2xl font-bold tabular-nums ${card.color}`}>{formatCurrency(card.value ?? 0)}</p>}
    {card.sub && <p className="text-[11px] text-slate-700 mt-1.5">{card.sub}</p>}
  </div>
);

// ─────────────────────────────────────────────────────────────
// Preset button
// ─────────────────────────────────────────────────────────────
const PresetBtn = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
      active
        ? "bg-indigo-500/20 border border-indigo-500/40 text-indigo-300"
        : "bg-white/[0.03] border border-white/[0.06] text-slate-500 hover:text-slate-300 hover:bg-white/[0.06]"
    }`}>
    {children}
  </button>
);

// ─────────────────────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────────────────────
const Expenses = () => {
  const { pathname } = useLocation();
  const meta    = PAGE_META[pathname as keyof typeof PAGE_META] ?? PAGE_META["/expenses"];
  const Icon    = meta.icon;
  const section = meta.section as Section;

  const [showRecordExpense, setShowRecordExpense] = useState(false);
  const [refreshKey,        setRefreshKey]        = useState(0);
  const [searchTerm,        setSearchTerm]        = useState("");

  const now = new Date();
  const [startDate,    setStartDate]    = useState<Date>(() => startOfMonth(now.getFullYear(), now.getMonth()));
  const [endDate,      setEndDate]      = useState<Date>(() => endOfMonth(now.getFullYear(), now.getMonth()));
  const [rangePreset,  setRangePreset]  = useState<string>("this_month");

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

  const [allExpenses, setAllExpenses] = useState<ExpenseRow[]>([]);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await getExpenses();
        setAllExpenses(data);
      } catch (err) {
        console.error("[Expenses] getExpenses failed:", err);
        setAllExpenses([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [refreshKey]);

  const filteredExpenses = useMemo(() => {
    return allExpenses.filter(e => {
      const d = parseDate(e.expense_date);
      if (isNaN(d.getTime())) return true;
      if (d < startDate || d > endDate) return false;
      if (section && e.category !== section) return false;
      if (searchTerm) {
        const q   = searchTerm.toLowerCase();
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

  const summary         = useMemo(() => getExpensesSummary(filteredExpenses), [filteredExpenses]);
  const salaryRows      = useMemo(() => filteredExpenses.filter(e => e.category === "Salaries"),   [filteredExpenses]);
  const commissionRows  = useMemo(() => filteredExpenses.filter(e => e.category === "Commission"), [filteredExpenses]);
  const royaltyRows     = useMemo(() => filteredExpenses.filter(e => e.category === "Royalty"),    [filteredExpenses]);
  const utilitiesRows   = useMemo(() => filteredExpenses.filter(e => e.category === "Utilities"),  [filteredExpenses]);
  const freightRows     = useMemo(() => filteredExpenses.filter(e => e.category === "Freight"),    [filteredExpenses]);

  const totalSalaries   = summary.byCategory["Salaries"]   ?? 0;
  const totalCommission = summary.byCategory["Commission"] ?? 0;
  const totalRoyaltyNet = summary.byCategory["Royalty"]    ?? 0;
  const totalElec       = summary.byCategory["Utilities"]  ?? 0;
  const totalFrt        = summary.byCategory["Freight"]    ?? 0;
  const grandTotal      = summary.total;

  // KPI card data
  const overviewCards: KPICard[] = [
    { label: "Grand Total",    value: grandTotal,      color: "text-red-400",    accentLine: "bg-red-500" },
    { label: "Salaries",       value: totalSalaries,   color: "text-emerald-400", accentLine: "bg-emerald-500",  sub: `${salaryRows.length} record(s)` },
    { label: "Commission",     value: totalCommission, color: "text-cyan-400",    accentLine: "bg-cyan-500",     sub: `${commissionRows.length} record(s)` },
    { label: "Royalty (Net)",  value: totalRoyaltyNet, color: "text-yellow-400",  accentLine: "bg-yellow-500",   sub: `${royaltyRows.length} record(s)` },
    { label: "Utilities",      value: totalElec,       color: "text-blue-400",    accentLine: "bg-blue-500",     sub: `${utilitiesRows.length} bills` },
    { label: "Freight",        value: totalFrt,        color: "text-violet-400",  accentLine: "bg-violet-500",   sub: `${freightRows.length} payment(s)` },
  ];

  const subCards: Record<NonNullable<Section>, KPICard[]> = {
    Salaries: [
      { label: "Total Salaries", value: totalSalaries, color: "text-emerald-400", accentLine: "bg-emerald-500", sub: `${salaryRows.length} records` },
      { label: "Avg per Record",  value: salaryRows.length > 0 ? totalSalaries / salaryRows.length : 0, color: "text-slate-300", accentLine: "bg-slate-600" },
      { label: "Highest Salary",  value: salaryRows.length > 0 ? Math.max(...salaryRows.map(e => Number(e.amount))) : 0, color: "text-slate-300", accentLine: "bg-slate-600" },
    ],
    Commission: [
      { label: "Total Commission", value: totalCommission, color: "text-cyan-400", accentLine: "bg-cyan-500", sub: `${commissionRows.length} records` },
      { label: "Avg per Record",   value: commissionRows.length > 0 ? totalCommission / commissionRows.length : 0, color: "text-slate-300", accentLine: "bg-slate-600" },
      { label: "Largest Payment",  value: commissionRows.length > 0 ? Math.max(...commissionRows.map(e => Number(e.amount))) : 0, color: "text-slate-300", accentLine: "bg-slate-600" },
    ],
    Royalty: [
      { label: "Gross Royalty", value: summary.grossByCategory["Royalty"] ?? 0, color: "text-slate-300", accentLine: "bg-slate-600", sub: `${royaltyRows.length} records` },
      { label: "TDS Deducted",  value: summary.tdsByCategory["Royalty"]   ?? 0, color: "text-amber-400", accentLine: "bg-amber-500" },
      { label: "Net Paid",      value: totalRoyaltyNet,                          color: "text-yellow-400", accentLine: "bg-yellow-500" },
    ],
    Utilities: [
      { label: "Total Utilities", value: totalElec, color: "text-blue-400", accentLine: "bg-blue-500", sub: `${utilitiesRows.length} bills` },
      { label: "Avg per Bill",    value: utilitiesRows.length > 0 ? totalElec / utilitiesRows.length : 0, color: "text-slate-300", accentLine: "bg-slate-600" },
      { label: "Latest Bill",     value: utilitiesRows.length > 0 ? Number(utilitiesRows[0].amount) : 0, color: "text-slate-300", accentLine: "bg-slate-600", sub: utilitiesRows[0] ? formatDate(utilitiesRows[0].expense_date) : "" },
    ],
    Freight: [
      { label: "Total Freight",    value: totalFrt, color: "text-violet-400", accentLine: "bg-violet-500", sub: `${freightRows.length} payment(s)` },
      { label: "Avg per Payment",  value: freightRows.length > 0 ? totalFrt / freightRows.length : 0, color: "text-slate-300", accentLine: "bg-slate-600", sub: `${freightRows.filter(r => r.reference_invoice_no).length}/${freightRows.length} linked to invoices` },
      {
        label: "Mismatch Warnings",
        count: freightRows.filter(r => freightMismatch(r)).length,
        color: freightRows.some(r => freightMismatch(r)) ? "text-amber-400" : "text-slate-600",
        accentLine: freightRows.some(r => freightMismatch(r)) ? "bg-amber-500" : "bg-slate-700",
        sub: (() => {
          const n = freightRows.filter(r => freightMismatch(r)).length;
          return n > 0 ? `${n} payment${n > 1 ? "s" : ""} — paid ≠ invoice value` : "✓ All amounts match";
        })(),
      },
    ],
  };

  const cards = section === null ? overviewCards : subCards[section];

  const fmtDate = (d: Date) =>
    isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  // ─── Render ────────────────────────────────────────────────
  return (
    <div className="space-y-5 p-1">

      {/* Record Expense modal */}
      {showRecordExpense && (
        <RecordExpense
          onClose={() => setShowRecordExpense(false)}
          onSaved={() => setRefreshKey(k => k + 1)}
        />
      )}

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/15">
              <Icon className="h-4 w-4 text-red-400" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-slate-100">{meta.title}</h2>
          </div>
          <p className="text-xs text-slate-600 pl-0.5">Track, categorise, and analyse operational spending</p>
        </div>
        <button
          onClick={() => setShowRecordExpense(true)}
          className="flex items-center gap-2 h-9 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-semibold shadow-lg shadow-violet-900/20 hover:shadow-violet-900/40 hover:-translate-y-px transition-all duration-200 shrink-0">
          <Plus className="h-3.5 w-3.5" /> Record Expense
        </button>
      </div>

      {/* ── Filter bar ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2.5 px-4 py-3 rounded-2xl border border-white/[0.05] bg-white/[0.015]">
        <div className="flex items-center gap-1.5 mr-1">
          <CalendarRange className="h-3.5 w-3.5 text-slate-600" />
          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.12em]">Range</span>
        </div>

        {/* Preset buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { id: "this_month", label: "This Month" },
            { id: "last_month", label: "Last Month" },
            { id: "last_3",     label: "Last 3M"    },
            { id: "this_year",  label: "This Year"  },
            { id: "all_time",   label: "All Time"   },
            { id: "custom",     label: "Custom"     },
          ].map(p => (
            <PresetBtn key={p.id} active={rangePreset === p.id} onClick={() => applyPreset(p.id)}>
              {p.label}
            </PresetBtn>
          ))}
        </div>

        {/* Custom date inputs */}
        {rangePreset === "custom" && (
          <>
            <div className="w-px h-4 bg-white/[0.08] mx-1" />
            <input
              type="date"
              value={isNaN(startDate.getTime()) ? "" : startDate.toISOString().slice(0, 10)}
              onChange={e => { if (e.target.value) setStartDate(parseDate(e.target.value)); }}
              className="h-7 text-xs px-2.5 rounded-lg border border-white/[0.08] bg-white/[0.04] text-slate-300 outline-none focus:border-indigo-500/50 transition-colors"
            />
            <span className="text-xs text-slate-700">→</span>
            <input
              type="date"
              value={isNaN(endDate.getTime()) ? "" : endDate.toISOString().slice(0, 10)}
              onChange={e => { if (e.target.value) setEndDate(parseDate(e.target.value)); }}
              className="h-7 text-xs px-2.5 rounded-lg border border-white/[0.08] bg-white/[0.04] text-slate-300 outline-none focus:border-indigo-500/50 transition-colors"
            />
          </>
        )}

        <div className="ml-auto flex items-center gap-2.5">
          {/* Active range label */}
          <span className="text-[11px] text-slate-700 tabular-nums hidden sm:block">
            {fmtDate(startDate)} → {fmtDate(endDate)}
          </span>
          <div className="w-px h-4 bg-white/[0.07]" />
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-600" />
            <input
              className="pl-7 pr-3 h-7 text-xs w-44 rounded-lg border border-white/[0.07] bg-white/[0.03] text-slate-300 placeholder:text-slate-700 focus:border-indigo-500/40 focus:bg-white/[0.05] transition-all outline-none"
              placeholder="Search expenses…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────── */}
      {loading
        ? <KPISkeleton count={section === null ? 6 : 3} />
        : (
          <div className={`grid gap-3 grid-cols-2 sm:grid-cols-3 ${section === null ? "lg:grid-cols-6" : ""}`}>
            {cards.map((c, i) => <KPICard key={i} card={c} />)}
          </div>
        )
      }

      {/* ── Overview analytics (/expenses root only) ────────── */}
      {section === null && !loading && (() => {
        const CATEGORIES = [
          { key: "Salaries",   label: "Salaries",   ...CAT_CONFIG.Salaries   },
          { key: "Commission", label: "Commission", ...CAT_CONFIG.Commission },
          { key: "Royalty",    label: "Royalty",    ...CAT_CONFIG.Royalty    },
          { key: "Utilities",  label: "Utilities",  ...CAT_CONFIG.Utilities  },
          { key: "Freight",    label: "Freight",    ...CAT_CONFIG.Freight    },
        ];

        const monthEntries = Object.entries(summary.byMonth)
          .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime());

        const categoryTotals = CATEGORIES.map(c => ({
          ...c,
          value: summary.byCategory[c.key] ?? 0,
          pct: grandTotal > 0 ? ((summary.byCategory[c.key] ?? 0) / grandTotal) * 100 : 0,
        }));

        return (
          <>
            {/* Month-by-month breakdown */}
            <div className="rounded-2xl border border-white/[0.05] bg-white/[0.015] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.05]">
                <h3 className="text-sm font-semibold text-slate-300">Month-wise Breakdown</h3>
              </div>
              {monthEntries.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-14">
                  <BarChart3 className="h-8 w-8 text-slate-800" />
                  <p className="text-sm text-slate-700">No expenses in the selected date range.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.05]">
                        <TH>Month</TH>
                        {CATEGORIES.map(c => (
                          <TH key={c.key} right className={c.accent}>{c.label}</TH>
                        ))}
                        <TH right className="text-slate-400">Total</TH>
                      </tr>
                    </thead>
                    <tbody>
                      {monthEntries.map(([month, data]) => (
                        <tr key={month} className="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3.5 font-medium text-slate-400 text-xs">{month}</td>
                          {CATEGORIES.map(c => {
                            const v = data.byCategory[c.key] ?? 0;
                            return (
                              <td key={c.key} className={`px-4 py-3.5 text-right tabular-nums text-xs ${v > 0 ? c.accent : "text-slate-800"}`}>
                                {v > 0 ? formatCurrency(v) : "—"}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3.5 text-right tabular-nums font-bold text-slate-300 text-xs">{formatCurrency(data.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-white/[0.07] bg-white/[0.015]">
                        <td className="px-4 py-3.5 text-[10px] font-bold text-slate-600 uppercase tracking-[0.1em]">Total</td>
                        {CATEGORIES.map(c => (
                          <td key={c.key} className={`px-4 py-3.5 text-right font-bold tabular-nums text-xs ${c.accent}`}>
                            {formatCurrency(summary.byCategory[c.key] ?? 0)}
                          </td>
                        ))}
                        <td className="px-4 py-3.5 text-right font-bold tabular-nums text-slate-200 text-xs">{formatCurrency(grandTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Spend distribution */}
            <div className="rounded-2xl border border-white/[0.05] bg-white/[0.015] p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-5">Spend Distribution</h3>
              <div className="space-y-4">
                {categoryTotals.map(c => (
                  <div key={c.key}>
                    <div className="flex items-center justify-between text-xs mb-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.dot }} />
                        <span className="text-slate-500 font-medium">{c.label}</span>
                      </div>
                      <div className="flex items-center gap-5">
                        <span className="text-slate-700 tabular-nums w-10 text-right">{c.pct.toFixed(1)}%</span>
                        <span className={`font-semibold tabular-nums w-28 text-right ${c.accent}`}>{formatCurrency(c.value)}</span>
                      </div>
                    </div>
                    <div className="w-full bg-white/[0.04] rounded-full h-1">
                      <div
                        className={`h-1 rounded-full transition-all duration-700 ${c.bar}`}
                        style={{ width: `${c.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        );
      })()}

      {/* ── Sub-page tables ──────────────────────────────────── */}
      {section === "Salaries"   && <SalariesTable   rows={salaryRows}     onDeleted={() => setRefreshKey(k => k + 1)} />}
      {section === "Commission" && <CommissionTable rows={commissionRows} onDeleted={() => setRefreshKey(k => k + 1)} />}
      {section === "Royalty"    && <RoyaltyTable    rows={royaltyRows}    onDeleted={() => setRefreshKey(k => k + 1)} />}
      {section === "Utilities"  && <UtilitiesTable  rows={utilitiesRows}  onDeleted={() => setRefreshKey(k => k + 1)} />}
      {section === "Freight"    && <FreightTable    rows={freightRows}    onDeleted={() => setRefreshKey(k => k + 1)} />}

    </div>
  );
};

export default Expenses;
