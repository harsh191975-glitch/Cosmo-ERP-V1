import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { getAllInvoices, getAllPayments } from "@/data/invoiceStore";
import { getCreditTotalsForInvoices } from "@/data/creditNoteStore";
import { getPurchases } from "@/data/purchaseStore";
import { getActiveSession } from "@/data/authStore";
import { getItems, getTransactions } from "@/data/inventoryStore";
import { runEnterpriseEngine } from "@/engine/financialEngine";
import { getExpenses, ExpenseRow } from "@/data/expenseStore";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp, ShoppingBag, DollarSign, BarChart3, ArrowLeftRight,
  TrendingDown, AlertCircle, Package, RefreshCw,
} from "lucide-react";

// ── Helpers ────────────────────────────────────────────────────
const fmt = (n: number) => "₹" + Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const fmtSigned = (n: number) => (n < 0 ? "−" : "+") + fmt(n);

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
// MONTH_MAP removed — freight/expense dates now come from Supabase as ISO strings;

// Parse various date formats → { year, month (1-12) }
const parseDate = (dateStr: string): { year: number; month: number } | null => {
  if (!dateStr) return null;
  // "2026-01-07" or "2026-1-7"
  const iso = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return { year: parseInt(iso[1]), month: parseInt(iso[2]) };
  return null;
};

// parseFreightDate / parseMonthYear removed — all dates from Supabase are ISO (YYYY-MM-DD)

const QUARTER_OF = (month: number) => Math.ceil(month / 3);

// Date filter options
const DATE_FILTER_OPTIONS = [
  { value: "all",    label: "All Time" },
  { value: "2025-12",label: "Dec 2025" },
  { value: "2026-01",label: "Jan 2026" },
  { value: "2026-02",label: "Feb 2026" },
  { value: "2026-03",label: "Mar 2026" },
  { value: "Q4-2025",label: "Q4 2025" },
  { value: "Q1-2026",label: "Q1 2026" },
  { value: "2025",   label: "FY 2025" },
  { value: "2026",   label: "FY 2026" },
];

const matchesFilter = (d: { year: number; month: number } | null, filter: string): boolean => {
  if (!d || filter === "all") return true;
  if (filter.startsWith("Q")) {
    const [q, y] = filter.split("-");
    const qNum = parseInt(q.replace("Q",""));
    return d.year === parseInt(y) && QUARTER_OF(d.month) === qNum;
  }
  if (filter.length === 4) return d.year === parseInt(filter);
  const [y, m] = filter.split("-");
  return d.year === parseInt(y) && d.month === parseInt(m);
};

// ── Shared Date Filter ─────────────────────────────────────────
const DateFilter = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger className="h-8 text-xs w-40">
      <SelectValue placeholder="Period" />
    </SelectTrigger>
    <SelectContent>
      {DATE_FILTER_OPTIONS.map(o => (
        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
      ))}
    </SelectContent>
  </Select>
);

// ── Engine period mapper ───────────────────────────────────────
// Maps DATE_FILTER_OPTIONS values → engine-compatible periods.
// [FIX-9] Engine now natively supports "all", "YYYY-MM", "YYYY", AND "Q1-2026" style quarters.
const toEnginePeriod = (filter: string): string => {
  if (filter === "all")               return "all";
  if (/^\d{4}-\d{2}$/.test(filter))  return filter; // "2026-03"
  if (/^\d{4}$/.test(filter))        return filter; // "2025" / "2026"
  if (/^Q[1-4]-\d{4}$/.test(filter)) return filter; // "Q1-2026" — engine handles quarter expansion
  return "all"; // unknown format — safe fallback
};

// ── Shared engine health badge ─────────────────────────────────
type EngineResult = Awaited<ReturnType<typeof runEnterpriseEngine>>;
const EngineHealthBadges = ({ engine }: { engine: EngineResult }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", padding: "2px 8px",
      borderRadius: 6, textTransform: "uppercase" as const,
      background: engine.status === "SUCCESS" ? "rgba(52,211,153,0.10)" : "rgba(248,113,113,0.10)",
      color:      engine.status === "SUCCESS" ? "#34d399"               : "#f87171",
      border:     `1px solid ${engine.status === "SUCCESS" ? "rgba(52,211,153,0.22)" : "rgba(248,113,113,0.22)"}`,
    }}>
      {engine.status === "SUCCESS" ? "✓ Engine OK" : "⚠ " + engine.status}
    </span>
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", padding: "2px 8px",
      borderRadius: 6,
      background: engine.dqs >= 98 ? "rgba(99,102,241,0.09)" : "rgba(245,158,11,0.09)",
      color:      engine.dqs >= 98 ? "#818cf8"                : "#f59e0b",
      border:     `1px solid ${engine.dqs >= 98 ? "rgba(99,102,241,0.20)" : "rgba(245,158,11,0.20)"}`,
    }}>
      DQS {engine.dqs.toFixed(1)}%
    </span>
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", padding: "2px 8px",
      borderRadius: 6,
      background: engine.metrics.trialBalance.isBalanced ? "rgba(52,211,153,0.07)" : "rgba(248,113,113,0.10)",
      color:      engine.metrics.trialBalance.isBalanced ? "#6ee7b7"               : "#f87171",
      border:     `1px solid ${engine.metrics.trialBalance.isBalanced ? "rgba(52,211,153,0.16)" : "rgba(248,113,113,0.22)"}`,
    }}>
      {engine.metrics.trialBalance.isBalanced ? "✓ Balanced" : "⚠ Ledger Drift"}
    </span>
  </div>
);

// ── KPI Card ───────────────────────────────────────────────────
const KPI = ({ label, value, color = "text-foreground", sub }: { label: string; value: string; color?: string; sub?: string }) => (
  <Card className="p-4">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className={`text-lg font-bold ${color}`}>{value}</p>
    {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
  </Card>
);

// ── Section Header ─────────────────────────────────────────────
const SectionHeader = ({ title }: { title: string }) => (
  <div className="px-5 py-2.5 border-b border-border bg-muted/30">
    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
  </div>
);

// ══════════════════════════════════════════════════════════════
// SALES REPORT — Premium SaaS Dashboard
// ══════════════════════════════════════════════════════════════
const SalesReport = () => {
  const [period, setPeriod] = useState("all");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAllInvoices, setShowAllInvoices] = useState(false);
  const [chartTooltip, setChartTooltip] = useState<{ idx: number; data: { label: string; revenue: number; collected: number; outstanding: number } } | null>(null);

  // ── Base data (async — Supabase) ────────────────────────────
  // Credit notes included per-invoice — same source as Invoices.tsx buildInvoicesWithPayments()
  interface SalesInvoiceRow {
    invoiceNo: string; invoiceDate: string; customerName: string; gstin: string;
    placeOfSupply: string; totalAmount: number; weightKg: number;
    totalPaid: number; creditNoteAmount: number; outstanding: number;
    status: string; [key: string]: unknown;
  }
  const [invoicesWithPayments, setInvoicesWithPayments] = useState<SalesInvoiceRow[]>([]);
  const [salesLoading, setSalesLoading] = useState(true);

  const fetchSalesData = useCallback(async () => {
    setSalesLoading(true);
    try {
      const [allInvoices, allPayments] = await Promise.all([
        getAllInvoices(),
        getAllPayments(),
      ]);
      const creditTotalsMap = await getCreditTotalsForInvoices(allInvoices.map(i => i.invoiceNo));
      const rows: SalesInvoiceRow[] = allInvoices.map(inv => {
        const paid             = allPayments.filter(p => p.invoiceNo === inv.invoiceNo).reduce((s, p) => s + p.amountPaid, 0);
        const creditNoteAmount = creditTotalsMap.get(inv.invoiceNo) ?? 0;
        const outstanding      = Math.max(0, inv.totalAmount - paid - creditNoteAmount);
        const status           = outstanding === 0 ? "paid" : (paid > 0 || creditNoteAmount > 0) ? "partial" : "unpaid";
        return { ...inv, totalPaid: paid, creditNoteAmount, outstanding, status };
      });
      setInvoicesWithPayments(rows);
    } catch (err) {
      console.error("[SalesReport] fetchSalesData failed:", err);
    } finally {
      setSalesLoading(false);
    }
  }, []);

  useEffect(() => { fetchSalesData(); }, [fetchSalesData]);

  // ── All customer names for filter dropdown ──────────────────
  const allCustomerNames = useMemo(() =>
    [...new Set(invoicesWithPayments.map(i => i.customerName))].sort(),
  [invoicesWithPayments]);

  // ── Period filter → then customer + status filter ───────────
  const periodFiltered = useMemo(() =>
    invoicesWithPayments.filter(inv => matchesFilter(parseDate(inv.invoiceDate), period)),
  [invoicesWithPayments, period]);

  const filteredInvoices = useMemo(() =>
    periodFiltered
      .filter(inv => customerFilter === "all" || inv.customerName === customerFilter)
      .filter(inv => statusFilter === "all" || inv.status === statusFilter),
  [periodFiltered, customerFilter, statusFilter]);

  // ── KPI totals ──────────────────────────────────────────────
  // ✅ PERMITTED: These reduce() calls are Sales Report drill-down KPIs — they aggregate
  // a FILTERED subset (by customer, status, period) that the engine does not expose.
  // ❌ These values must NEVER be used as canonical Dashboard / P&L / CashFlow totals.
  // For all-time canonical totals, always use engine.metrics.business / accrual / cash.
  // grossRevenue  = sum of invoice face values (kept for charts — visual stability)
  // creditNotesTotal = sum of per-invoice credit adjustments
  // netRevenue    = what the business actually earned after credit notes
  // collectionRate derived from netRevenue for accounting consistency
  const grossRevenue     = filteredInvoices.reduce((s, i) => s + i.totalAmount, 0);
  const creditNotesTotal = filteredInvoices.reduce((s, i) => s + i.creditNoteAmount, 0);
  const netRevenue       = grossRevenue - creditNotesTotal;
  const totalCollected   = filteredInvoices.reduce((s, i) => s + i.totalPaid, 0);
  const totalOutstanding = filteredInvoices.reduce((s, i) => s + i.outstanding, 0);
  const totalWeight      = filteredInvoices.reduce((s, i) => s + i.weightKg, 0);
  const collectionRate   = netRevenue > 0 ? (totalCollected / netRevenue) * 100 : 0;
  const outstandingPct   = netRevenue > 0 ? (totalOutstanding / netRevenue) * 100 : 0;

  // Prev-period comparison for trend arrows (simple: compare halves of "all")
  const prevPeriodRevenue = useMemo(() => {
    if (period !== "all") return null;
    const all = invoicesWithPayments;
    const mid = Math.floor(all.length / 2);
    return all.slice(0, mid).reduce((s, i) => s + i.totalAmount, 0);
  }, [invoicesWithPayments, period]);

  const revenueUp = prevPeriodRevenue === null ? null : netRevenue >= prevPeriodRevenue;

  // ── By customer ─────────────────────────────────────────────
  const byCustomer = useMemo(() => {
    const map = new Map<string, { revenue: number; invoices: number; collected: number; outstanding: number }>();
    filteredInvoices.forEach(inv => {
      const e = map.get(inv.customerName) ?? { revenue: 0, invoices: 0, collected: 0, outstanding: 0 };
      map.set(inv.customerName, {
        revenue:     e.revenue + inv.totalAmount,
        invoices:    e.invoices + 1,
        collected:   e.collected + inv.totalPaid,
        outstanding: e.outstanding + inv.outstanding,
      });
    });
    return [...map.entries()].map(([name, d]) => ({ name, ...d })).sort((a, b) => b.revenue - a.revenue);
  }, [filteredInvoices]);

  const maxCustomerRevenue = Math.max(...byCustomer.map(c => c.revenue), 1);

  // ── Monthly trend (revenue + collected per month) ───────────
  const monthlyTrend = useMemo(() => {
    const map = new Map<string, { ym: string; revenue: number; collected: number; outstanding: number }>();
    filteredInvoices.forEach(inv => {
      const d = parseDate(inv.invoiceDate);
      if (!d) return;
      const ym = `${d.year}-${String(d.month).padStart(2, "0")}`;
      const key = `${MONTH_NAMES[d.month - 1].slice(0, 3)} '${String(d.year).slice(2)}`;
      const e = map.get(ym) ?? { ym, revenue: 0, collected: 0, outstanding: 0 };
      map.set(ym, {
        ym,
        revenue:     e.revenue + inv.totalAmount,
        collected:   e.collected + inv.totalPaid,
        outstanding: e.outstanding + inv.outstanding,
      });
    });
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, v]) => ({ label: `${MONTH_NAMES[parseInt(v.ym.split("-")[1]) - 1].slice(0, 3)} '${v.ym.split("-")[0].slice(2)}`, ...v }));
  }, [filteredInvoices]);

  const maxMonthlyRevenue = Math.max(...monthlyTrend.map(r => r.revenue), 1);

  // ── At-risk: outstanding invoices ───────────────────────────
  const atRisk = filteredInvoices
    .filter(i => i.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding);

  // ── Invoice table (demoted, collapsible) ────────────────────
  const invoiceTableRows = [...filteredInvoices].sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));
  const visibleInvoices  = showAllInvoices ? invoiceTableRows : invoiceTableRows.slice(0, 8);

  if (salesLoading) return (
    <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
      <RefreshCw className="h-4 w-4 animate-spin" /><span className="text-sm">Loading sales data…</span>
    </div>
  );

  return (
    <div className="space-y-6">

      {/* ── Header + Filters ─────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium mb-0.5">Sales Report</p>
          <p className="text-xs text-muted-foreground">{filteredInvoices.length} invoices in period</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Customer filter */}
          <Select value={customerFilter} onValueChange={setCustomerFilter}>
            <SelectTrigger className="h-8 text-xs w-40 bg-background border-border/60">
              <SelectValue placeholder="All Customers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              {allCustomerNames.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Status filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-xs w-32 bg-background border-border/60">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
            </SelectContent>
          </Select>
          {/* Period filter */}
          <DateFilter value={period} onChange={setPeriod} />
        </div>
      </div>

      {/* ── KPI Strip ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Revenue */}
        <div className="relative rounded-xl p-4 border overflow-hidden"
          style={{ background: "linear-gradient(135deg,hsl(var(--card)) 0%,hsl(var(--muted)/0.3) 100%)", borderColor: "hsl(var(--border))", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full opacity-15 blur-xl" style={{ background: "#e2e8f0" }} />
          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center justify-between">
            Net Revenue
            {revenueUp !== null && <span className={`text-xs font-bold ${revenueUp ? "text-green-400" : "text-red-400"}`}>{revenueUp ? "↑" : "↓"}</span>}
          </p>
          <p className="text-2xl font-bold tracking-tight text-foreground">{fmt(netRevenue)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {creditNotesTotal > 0
              ? `${filteredInvoices.length} invoices · −${fmt(creditNotesTotal)} credit notes`
              : `${filteredInvoices.length} invoices`}
          </p>
        </div>

        {/* Collected */}
        <div className="relative rounded-xl p-4 border overflow-hidden"
          style={{ background: "linear-gradient(135deg,hsl(var(--card)) 0%,hsl(var(--muted)/0.3) 100%)", borderColor: "hsl(var(--border))", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full opacity-15 blur-xl" style={{ background: "#4ade80" }} />
          <p className="text-xs font-medium text-muted-foreground mb-2">Collected</p>
          <p className="text-2xl font-bold tracking-tight text-green-400">{fmt(totalCollected)}</p>
          <p className="text-xs text-muted-foreground mt-1">{collectionRate.toFixed(1)}% collection rate</p>
        </div>

        {/* Outstanding */}
        <div className="relative rounded-xl p-4 border overflow-hidden"
          style={{
            background: "linear-gradient(135deg,hsl(var(--card)) 0%,hsl(var(--muted)/0.3) 100%)",
            borderColor: outstandingPct > 30 ? "rgba(248,113,113,0.35)" : "hsl(var(--border))",
            boxShadow: outstandingPct > 30 ? "0 0 20px rgba(248,113,113,0.1),0 1px 3px rgba(0,0,0,0.1)" : "0 1px 3px rgba(0,0,0,0.1)",
          }}>
          <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full opacity-15 blur-xl" style={{ background: "#f87171" }} />
          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center justify-between">
            Outstanding
            {outstandingPct > 30 && <span className="text-xs text-red-400 font-bold">⚠</span>}
          </p>
          <p className="text-2xl font-bold tracking-tight text-red-400">{fmt(totalOutstanding)}</p>
          <p className="text-xs text-muted-foreground mt-1">{atRisk.length} invoices pending</p>
        </div>

        {/* Weight */}
        <div className="relative rounded-xl p-4 border overflow-hidden"
          style={{ background: "linear-gradient(135deg,hsl(var(--card)) 0%,hsl(var(--muted)/0.3) 100%)", borderColor: "hsl(var(--border))", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full opacity-15 blur-xl" style={{ background: "#818cf8" }} />
          <p className="text-xs font-medium text-muted-foreground mb-2">Total Weight</p>
          <p className="text-2xl font-bold tracking-tight text-foreground">{totalWeight.toLocaleString("en-IN")} kg</p>
          <p className="text-xs text-muted-foreground mt-1">across {filteredInvoices.length} shipments</p>
        </div>
      </div>

      {/* ── Hero: Sales Trend Chart ───────────────────────────── */}
      {monthlyTrend.length > 0 && (
        <Card className="p-5 rounded-xl border-border/60" onMouseLeave={() => setChartTooltip(null)}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold">Sales Trend</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Monthly revenue vs collections</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "hsl(var(--primary))" }} /> Revenue</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-400 inline-block" /> Collected</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-5 border-t-2 border-dashed border-red-400" /> Outstanding</span>
            </div>
          </div>

          <div className="relative">
            <div className="flex">
              {/* Y-axis */}
              <div className="w-14 flex flex-col justify-between text-right pr-2 pb-6" style={{ height: 220 }}>
                {[1, 0.75, 0.5, 0.25, 0].map(pct => (
                  <span key={pct} className="text-muted-foreground tabular-nums" style={{ fontSize: 10 }}>
                    {pct === 0 ? "0" : "₹" + Math.round(maxMonthlyRevenue * pct / 1000) + "k"}
                  </span>
                ))}
              </div>
              {/* Chart */}
              <div className="flex-1 relative" style={{ height: 220 }}>
                <div className="absolute inset-x-0 top-0 bottom-6">
                  {/* Grid */}
                  {[0, 0.25, 0.5, 0.75, 1].map(pct => (
                    <div key={pct} className="absolute left-0 right-0 border-t border-border/25" style={{ top: `${(1 - pct) * 100}%` }} />
                  ))}
                  {/* Bars */}
                  <div className="absolute inset-0 flex items-end gap-1.5 px-1">
                    {monthlyTrend.map((row, i) => (
                      <div key={row.ym} className="flex-1 flex items-end gap-0.5 relative group cursor-pointer"
                        style={{ height: "100%" }}
                        onMouseEnter={() => setChartTooltip({ idx: i, data: row })}>
                        {/* Revenue bar */}
                        <div className="flex-1 rounded-t-sm transition-all group-hover:brightness-125"
                          style={{
                            height: `${(row.revenue / maxMonthlyRevenue) * 100}%`,
                            background: "linear-gradient(180deg,hsl(var(--primary)) 0%,hsl(var(--primary)/0.7) 100%)",
                            minHeight: row.revenue > 0 ? 2 : 0,
                          }} />
                        {/* Collected bar */}
                        <div className="flex-1 rounded-t-sm transition-all group-hover:brightness-125"
                          style={{
                            height: `${(row.collected / maxMonthlyRevenue) * 100}%`,
                            background: "linear-gradient(180deg,#4ade80,#16a34a)",
                            minHeight: row.collected > 0 ? 2 : 0,
                          }} />
                        {/* Tooltip */}
                        {chartTooltip?.idx === i && (
                          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none" style={{ minWidth: 156 }}>
                            <div className="rounded-lg border border-border/80 shadow-xl text-xs p-2.5" style={{ background: "hsl(var(--popover))" }}>
                              <p className="font-semibold text-foreground mb-1.5">{row.label}</p>
                              <p className="text-foreground flex justify-between gap-3"><span>Revenue</span><span className="font-mono">{fmt(row.revenue)}</span></p>
                              <p className="text-green-400 flex justify-between gap-3"><span>Collected</span><span className="font-mono">{fmt(row.collected)}</span></p>
                              {row.outstanding > 0 && (
                                <p className="text-red-400 flex justify-between gap-3 border-t border-border/50 pt-1.5 mt-1.5 font-semibold">
                                  <span>Outstanding</span><span className="font-mono">{fmt(row.outstanding)}</span>
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* Outstanding dashed line */}
                  {monthlyTrend.length > 1 && (() => {
                    const VW = 1000, VH = 100;
                    const w = VW / monthlyTrend.length;
                    const pts = monthlyTrend.map((r, i) => {
                      const y = ((maxMonthlyRevenue - Math.min(r.outstanding, maxMonthlyRevenue)) / maxMonthlyRevenue) * VH;
                      return `${(i + 0.5) * w},${y}`;
                    }).join(" ");
                    return (
                      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" style={{ overflow: "visible" }}>
                        <polyline points={pts} fill="none" stroke="#f87171" strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" vectorEffect="non-scaling-stroke" />
                        {monthlyTrend.map((r, i) => r.outstanding > 0 && (
                          <circle key={i} cx={(i + 0.5) * w} cy={((maxMonthlyRevenue - Math.min(r.outstanding, maxMonthlyRevenue)) / maxMonthlyRevenue) * VH}
                            r="1" fill="#f87171" stroke="hsl(var(--card))" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
                        ))}
                      </svg>
                    );
                  })()}
                </div>
                {/* X labels */}
                <div className="absolute bottom-0 left-0 right-0 flex gap-1.5 px-1" style={{ height: 24 }}>
                  {monthlyTrend.map(row => (
                    <div key={row.ym} className="flex-1 text-center text-muted-foreground" style={{ fontSize: 10 }}>{row.label}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ── Split: Top Customers + Revenue Distribution ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* LEFT (60%): Top Revenue Customers */}
        <Card className="lg:col-span-3 p-0 overflow-hidden rounded-xl border-border/60">
          <div className="px-5 py-3.5 border-b border-border/60 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Top Revenue Customers</p>
              <p className="text-xs text-muted-foreground mt-0.5">Sorted by total sales</p>
            </div>
            <span className="text-xs text-muted-foreground">{byCustomer.length} customers</span>
          </div>
          <div className="divide-y divide-border/40">
            {byCustomer.map((c, i) => {
              const collPct = c.revenue > 0 ? (c.collected / c.revenue) * 100 : 0;
              const revShare = (c.revenue / (grossRevenue || 1)) * 100;
              return (
                <div key={c.name} className="px-5 py-3.5 hover:bg-muted/20 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-bold text-muted-foreground w-5 text-right flex-shrink-0">{i + 1}</span>
                      <span className="text-sm font-semibold truncate">{c.name}</span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">{c.invoices} inv</span>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0 ml-2">
                      <div className="text-right hidden sm:block">
                        <p className="text-xs text-muted-foreground">Collected</p>
                        <p className="text-xs font-semibold text-green-400 tabular-nums">{fmt(c.collected)}</p>
                      </div>
                      {c.outstanding > 0 && (
                        <div className="text-right hidden sm:block">
                          <p className="text-xs text-muted-foreground">Outstanding</p>
                          <p className="text-xs font-semibold text-red-400 tabular-nums">{fmt(c.outstanding)}</p>
                        </div>
                      )}
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Revenue</p>
                        <p className="text-sm font-bold tabular-nums">{fmt(c.revenue)}</p>
                      </div>
                    </div>
                  </div>
                  {/* Dual progress: collected (green) + outstanding (red) */}
                  <div className="flex items-center gap-2 pl-8">
                    <div className="flex-1 bg-muted/30 rounded-full h-1.5 overflow-hidden">
                      <div className="h-full flex">
                        <div className="h-full rounded-l-full transition-all duration-500"
                          style={{ width: `${collPct}%`, background: "linear-gradient(90deg,#16a34a,#4ade80)" }} />
                        <div className="h-full transition-all duration-500"
                          style={{ width: `${100 - collPct}%`, background: "linear-gradient(90deg,#dc2626,#f87171)", opacity: c.outstanding > 0 ? 1 : 0 }} />
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">{revShare.toFixed(1)}%</span>
                  </div>
                </div>
              );
            })}
            {byCustomer.length === 0 && (
              <div className="px-5 py-8 text-center text-xs text-muted-foreground">No data for selected filters</div>
            )}
          </div>
          {/* Totals footer */}
          <div className="px-5 py-3 border-t border-border/60 bg-muted/20 grid grid-cols-3 text-xs">
            <div><p className="text-muted-foreground">Gross Revenue</p><p className="font-bold tabular-nums mt-0.5">{fmt(grossRevenue)}</p></div>
            <div><p className="text-muted-foreground">Collected</p><p className="font-bold text-green-400 tabular-nums mt-0.5">{fmt(totalCollected)}</p></div>
            <div><p className="text-muted-foreground">Outstanding</p><p className="font-bold text-red-400 tabular-nums mt-0.5">{fmt(totalOutstanding)}</p></div>
          </div>
        </Card>

        {/* RIGHT (40%): Revenue Distribution */}
        <Card className="lg:col-span-2 p-5 rounded-xl border-border/60">
          <p className="text-sm font-semibold mb-0.5">Revenue Concentration</p>
          <p className="text-xs text-muted-foreground mb-5">Top {Math.min(byCustomer.length, 5)} customers by share</p>
          <div className="space-y-4">
            {byCustomer.slice(0, 5).map((c, i) => {
              const COLORS = ["#818cf8", "#4ade80", "#22d3ee", "#facc15", "#c084fc"];
              const pct = grossRevenue > 0 ? (c.revenue / grossRevenue) * 100 : 0;
              return (
                <div key={c.name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[i] }} />
                      <span className="truncate">{c.name}</span>
                    </span>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2 text-xs tabular-nums">
                      <span className="text-muted-foreground">{pct.toFixed(1)}%</span>
                      <span className="font-semibold" style={{ color: COLORS[i] }}>{fmt(c.revenue)}</span>
                    </div>
                  </div>
                  <div className="w-full bg-muted/30 rounded-full h-2 overflow-hidden">
                    <div className="h-2 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: `linear-gradient(90deg,${COLORS[i]}99,${COLORS[i]})` }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Collection health summary */}
          <div className="mt-6 pt-4 border-t border-border/50">
            <p className="text-xs text-muted-foreground mb-3">Collection Health</p>
            <div className="flex rounded-full overflow-hidden h-3">
              <div className="h-full transition-all duration-700"
                style={{ width: `${collectionRate}%`, background: "linear-gradient(90deg,#16a34a,#4ade80)" }} />
              <div className="h-full transition-all duration-700"
                style={{ width: `${100 - collectionRate}%`, background: "linear-gradient(90deg,#dc2626,#f87171)" }} />
            </div>
            <div className="flex justify-between text-xs mt-2">
              <span className="text-green-400 tabular-nums">{collectionRate.toFixed(1)}% collected</span>
              <span className="text-red-400 tabular-nums">{outstandingPct.toFixed(1)}% pending</span>
            </div>
          </div>
        </Card>
      </div>

      {/* ── At-Risk Revenue ───────────────────────────────────── */}
      {atRisk.length > 0 && (
        <Card className="p-0 overflow-hidden rounded-xl"
          style={{ borderColor: "rgba(248,113,113,0.3)", boxShadow: "0 0 20px rgba(248,113,113,0.06)" }}>
          <div className="px-5 py-3.5 border-b flex items-center gap-2.5" style={{ borderColor: "rgba(248,113,113,0.2)", background: "rgba(248,113,113,0.05)" }}>
            <span className="text-red-400 text-base">⚠</span>
            <div>
              <p className="text-sm font-semibold text-red-400">At-Risk Revenue</p>
              <p className="text-xs text-muted-foreground mt-0.5">{atRisk.length} invoices with outstanding balance · {fmt(totalOutstanding)} total at risk</p>
            </div>
          </div>
          <div className="overflow-auto" style={{ maxHeight: 320 }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 bg-muted/30">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Invoice</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Customer</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground hidden sm:table-cell">Date</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Invoice Total</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Collected</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Outstanding</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground w-24 hidden md:table-cell">Recovery</th>
                </tr>
              </thead>
              <tbody>
                {atRisk.map(inv => {
                  const recoveryPct = inv.totalAmount > 0 ? (inv.totalPaid / inv.totalAmount) * 100 : 0;
                  const riskLevel = recoveryPct === 0 ? "high" : recoveryPct < 50 ? "medium" : "low";
                  return (
                    <tr key={inv.id != null && inv.id !== "" ? String(inv.id) : inv.invoiceNo} className="border-t border-border/30 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{inv.invoiceNo}</td>
                      <td className="px-4 py-2.5 text-xs font-medium">{inv.customerName}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground hidden sm:table-cell">
                        {new Date(inv.invoiceDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-xs">{fmt(inv.totalAmount)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-xs text-green-400">{fmt(inv.totalPaid)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-xs font-bold text-red-400">{fmt(inv.outstanding)}</td>
                      <td className="px-4 py-2.5 hidden md:table-cell">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 bg-muted/30 rounded-full h-1.5 overflow-hidden">
                            <div className="h-1.5 rounded-full"
                              style={{ width: `${recoveryPct}%`, background: riskLevel === "high" ? "#dc2626" : riskLevel === "medium" ? "#f59e0b" : "#4ade80" }} />
                          </div>
                          <span className="text-xs text-muted-foreground tabular-nums w-8">{recoveryPct.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Invoice Table (demoted, collapsible) ─────────────── */}
      <Card className="p-0 overflow-hidden rounded-xl border-border/60">
        <button
          className="w-full px-5 py-3.5 border-b border-border/60 flex items-center justify-between hover:bg-muted/20 transition-colors"
          onClick={() => setShowAllInvoices(v => !v)}>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">All Invoices</p>
            <span className="text-xs text-muted-foreground">({invoiceTableRows.length} total)</span>
          </div>
          <span className="text-xs text-muted-foreground">{showAllInvoices ? "Show less ↑" : "Show all ↓"}</span>
        </button>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border/60">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Invoice</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Customer</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Amount</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Collected</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Outstanding</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleInvoices.map(inv => (
                <tr key={inv.id != null && inv.id !== "" ? String(inv.id) : inv.invoiceNo} className="border-t border-border/30 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{inv.invoiceNo}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(inv.invoiceDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-medium">{inv.customerName}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-xs font-semibold">{fmt(inv.totalAmount)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-xs text-green-400">{fmt(inv.totalPaid)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-xs text-red-400">{inv.outstanding > 0 ? fmt(inv.outstanding) : "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: inv.status === "paid" ? "rgba(74,222,128,0.1)" : inv.status === "partial" ? "rgba(245,158,11,0.1)" : "rgba(248,113,113,0.1)",
                        color:      inv.status === "paid" ? "#4ade80"               : inv.status === "partial" ? "#f59e0b"               : "#f87171",
                        border:     `1px solid ${inv.status === "paid" ? "rgba(74,222,128,0.2)" : inv.status === "partial" ? "rgba(245,158,11,0.2)" : "rgba(248,113,113,0.2)"}`,
                      }}>
                      {inv.status === "paid" ? "Paid" : inv.status === "partial" ? "Partial" : "Unpaid"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!showAllInvoices && invoiceTableRows.length > 8 && (
          <div className="px-5 py-3 border-t border-border/40 bg-muted/10 text-center">
            <button className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowAllInvoices(true)}>
              Show {invoiceTableRows.length - 8} more invoices ↓
            </button>
          </div>
        )}
      </Card>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// PURCHASES REPORT  — Premium SaaS Revamp
// Data logic 100% unchanged. Visual layer only.
// ══════════════════════════════════════════════════════════════
const PurchasesReport = () => {
  const [period, setPeriod] = useState("all");
  const [hoveredCat, setHoveredCat] = useState<string | null>(null);
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);
  const [hoveredVendor, setHoveredVendor] = useState<string | null>(null);

  // ── Data — async from Supabase via purchaseStore ─────────────
  // Field names match purchaseStore.ts canonical Purchase type exactly.
  interface PurchaseRow {
    id: string; purchase_date: string; supplier_name: string; category: string;
    taxable_amount: number; total_gst: number; total_amount: number;
    [key: string]: unknown;
  }
  const [allPurchases, setAllPurchases] = useState<PurchaseRow[]>([]);
  const [purchasesLoading, setPurchasesLoading] = useState(true);

  useEffect(() => {
    getPurchases()
      .then((data: any[]) => setAllPurchases(data as PurchaseRow[]))
      .catch(err => console.error("[PurchasesReport] getPurchases failed:", err))
      .finally(() => setPurchasesLoading(false));
  }, []);

  const filtered = useMemo(() =>
    allPurchases.filter(p => matchesFilter(parseDate(p.purchase_date), period)),
  [allPurchases, period]);

  const totalTaxable = filtered.reduce((s, p) => s + (p.taxable_amount ?? 0), 0);
  const totalGST     = filtered.reduce((s, p) => s + (p.total_gst ?? 0), 0);
  const totalSpend   = filtered.reduce((s, p) => s + (p.total_amount ?? 0), 0);

  const byVendor = useMemo(() => {
    const map = new Map<string, { taxable: number; tax: number; total: number; invoices: number }>();
    filtered.forEach(p => {
      const e = map.get(p.supplier_name) ?? { taxable: 0, tax: 0, total: 0, invoices: 0 };
      map.set(p.supplier_name, {
        taxable:  e.taxable  + (p.taxable_amount ?? 0),
        tax:      e.tax      + (p.total_gst     ?? 0),
        total:    e.total    + (p.total_amount   ?? 0),
        invoices: e.invoices + 1,
      });
    });
    return [...map.entries()].map(([name, d]) => ({ name, ...d })).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach(p => map.set(p.category, (map.get(p.category) ?? 0) + (p.total_amount ?? 0)));
    return [...map.entries()].map(([cat, total]) => ({ cat, total })).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const monthlyTrend = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach(p => {
      const d = parseDate(p.purchase_date);
      if (!d) return;
      const key = `${MONTH_NAMES[d.month - 1]} ${d.year}`;
      map.set(key, (map.get(key) ?? 0) + (p.total_amount ?? 0));
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, total]) => ({ month, total }));
  }, [filtered]);

  const maxMonthly = Math.max(...monthlyTrend.map(r => r.total), 1);

  // ── Shared card shell ─────────────────────────────────────────
  const card: React.CSSProperties = {
    borderRadius: "16px",
    border: "1px solid hsl(var(--border)/0.7)",
    boxShadow: "0 1px 4px rgba(0,0,0,0.08), 0 0 0 1px rgba(255,255,255,0.03) inset",
    background: "hsl(var(--card))",
    overflow: "hidden",
    transition: "box-shadow 150ms ease",
  };
  const cardHover = "0 4px 12px rgba(0,0,0,0.12), 0 0 0 1px rgba(255,255,255,0.04) inset";
  const cardRest  = "0 1px 4px rgba(0,0,0,0.08), 0 0 0 1px rgba(255,255,255,0.03) inset";

  const secTitle: React.CSSProperties = {
    fontSize: "13px", fontWeight: 600,
    color: "hsl(var(--foreground))", letterSpacing: "-0.01em",
  };
  const secSub: React.CSSProperties = {
    fontSize: "11px", color: "hsl(var(--muted-foreground))", marginTop: "2px",
  };

  // amber gradient colours
  const AMB1 = "#fbbf24";
  const AMB2 = "#f59e0b";

  if (purchasesLoading) return (
    <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
      <RefreshCw className="h-4 w-4 animate-spin" /><span className="text-sm">Loading purchases data…</span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <p style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em", color: "hsl(var(--muted-foreground))", textTransform: "uppercase", marginBottom: "2px" }}>
            Purchases Report
          </p>
          <p style={{ fontSize: "12px", color: "hsl(var(--muted-foreground))" }}>
            {filtered.length} purchase record{filtered.length !== 1 ? "s" : ""} in period
          </p>
        </div>
        <DateFilter value={period} onChange={setPeriod} />
      </div>

      {/* ── KPI Cards ───────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "16px" }}>

        {/* Taxable Amount */}
        <div
          style={{ ...card, padding: "22px 24px 20px", position: "relative", background: "linear-gradient(145deg,hsl(var(--card)) 0%,rgba(251,191,36,0.05) 100%)" }}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = cardHover)}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = cardRest)}
        >
          <div style={{ position: "absolute", top: -20, right: -20, width: 80, height: 80, borderRadius: "50%", background: "rgba(251,191,36,0.15)", filter: "blur(18px)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
            <div style={{ width: 28, height: 28, borderRadius: "8px", background: "rgba(251,191,36,0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: "14px", color: AMB1 }}>₹</span>
            </div>
            <span style={{ fontSize: "11px", fontWeight: 500, color: "hsl(var(--muted-foreground))" }}>Taxable Amount</span>
          </div>
          <p style={{ fontSize: "26px", fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", color: "hsl(var(--foreground))", marginBottom: "6px" }}>
            {fmt(totalTaxable)}
          </p>
          <p style={{ fontSize: "11px", color: "hsl(var(--muted-foreground))" }}>
            Pre-tax purchase value
          </p>
        </div>

        {/* GST Paid */}
        <div
          style={{ ...card, padding: "22px 24px 20px", position: "relative", background: "linear-gradient(145deg,hsl(var(--card)) 0%,rgba(251,191,36,0.07) 100%)" }}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = cardHover)}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = cardRest)}
        >
          <div style={{ position: "absolute", top: -20, right: -20, width: 80, height: 80, borderRadius: "50%", background: "rgba(251,191,36,0.18)", filter: "blur(18px)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
            <div style={{ width: 28, height: 28, borderRadius: "8px", background: "rgba(251,191,36,0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: "13px" }}>🧾</span>
            </div>
            <span style={{ fontSize: "11px", fontWeight: 500, color: "hsl(var(--muted-foreground))" }}>GST Paid</span>
          </div>
          <p style={{ fontSize: "26px", fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", color: AMB1, marginBottom: "6px" }}>
            {fmt(totalGST)}
          </p>
          <p style={{ fontSize: "11px", color: "hsl(var(--muted-foreground))" }}>
            18% GST · input credit eligible
          </p>
        </div>

        {/* Total Spend */}
        <div
          style={{ ...card, padding: "22px 24px 20px", position: "relative", background: "linear-gradient(145deg,hsl(var(--card)) 0%,rgba(251,191,36,0.05) 100%)" }}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = cardHover)}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = cardRest)}
        >
          <div style={{ position: "absolute", top: -20, right: -20, width: 80, height: 80, borderRadius: "50%", background: "rgba(251,191,36,0.12)", filter: "blur(18px)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
            <div style={{ width: 28, height: 28, borderRadius: "8px", background: "rgba(251,191,36,0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: "13px" }}>📦</span>
            </div>
            <span style={{ fontSize: "11px", fontWeight: 500, color: "hsl(var(--muted-foreground))" }}>Total Spend</span>
          </div>
          <p style={{ fontSize: "26px", fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", color: "hsl(var(--foreground))", marginBottom: "6px" }}>
            {fmt(totalSpend)}
          </p>
          <p style={{ fontSize: "11px", color: "hsl(var(--muted-foreground))" }}>
            {filtered.length} invoice{filtered.length !== 1 ? "s" : ""} · taxable + GST
          </p>
        </div>
      </div>

      {/* ── By Category  +  Monthly Trend ───────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>

        {/* By Category */}
        <div style={card}>
          <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid hsl(var(--border)/0.5)" }}>
            <p style={secTitle}>By Category</p>
            <p style={secSub}>Spend distribution across purchase categories</p>
          </div>
          <div style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
            {byCategory.map(c => {
              const pct = totalSpend > 0 ? (c.total / totalSpend) * 100 : 0;
              const isHov = hoveredCat === c.cat;
              return (
                <div
                  key={c.cat}
                  onMouseEnter={() => setHoveredCat(c.cat)}
                  onMouseLeave={() => setHoveredCat(null)}
                  style={{ cursor: "default" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "2px", background: `linear-gradient(135deg,${AMB1},${AMB2})`, flexShrink: 0 }} />
                      <span style={{ fontSize: "12px", fontWeight: 500, color: "hsl(var(--foreground))", textTransform: "capitalize" }}>
                        {c.cat.replace("-", " ")}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {isHov && (
                        <span style={{
                          fontSize: "10px", padding: "2px 8px", borderRadius: "20px",
                          background: "rgba(251,191,36,0.12)", color: AMB1,
                          border: "1px solid rgba(251,191,36,0.28)",
                          transition: "all 150ms ease",
                        }}>
                          {pct.toFixed(1)}% share
                        </span>
                      )}
                      <span style={{ fontSize: "12px", fontWeight: 700, color: AMB1, letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums" } as React.CSSProperties}>
                        {fmt(c.total)}
                      </span>
                    </div>
                  </div>
                  {/* Gradient bar */}
                  <div style={{ width: "100%", height: "6px", borderRadius: "9999px", background: "hsl(var(--muted)/0.4)", overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${pct}%`,
                      borderRadius: "9999px",
                      background: `linear-gradient(90deg,${AMB1}88,${AMB2})`,
                      transition: "width 600ms cubic-bezier(0.4,0,0.2,1)",
                      boxShadow: isHov ? `0 0 6px ${AMB1}60` : "none",
                    }} />
                  </div>
                  <div style={{ marginTop: "4px", display: "flex", justifyContent: "flex-end" }}>
                    <span style={{ fontSize: "10px", color: "hsl(var(--muted-foreground))", opacity: 0.65 }}>
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Monthly Trend */}
        {monthlyTrend.length > 0 && (
          <div style={card}>
            <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid hsl(var(--border)/0.5)" }}>
              <p style={secTitle}>Monthly Trend</p>
              <p style={secSub}>Total purchase spend per month</p>
            </div>
            <div style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: "16px" }}>
              {monthlyTrend.map((row, idx) => {
                const pct = (row.total / maxMonthly) * 100;
                const isHov = hoveredMonth === row.month;
                return (
                  <div
                    key={row.month}
                    onMouseEnter={() => setHoveredMonth(row.month)}
                    onMouseLeave={() => setHoveredMonth(null)}
                    style={{ cursor: "default" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <span style={{ fontSize: "12px", fontWeight: 500, color: "hsl(var(--foreground))" }}>{row.month}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {isHov && (
                          <span style={{
                            fontSize: "10px", padding: "2px 8px", borderRadius: "20px",
                            background: "rgba(251,191,36,0.12)", color: AMB1,
                            border: "1px solid rgba(251,191,36,0.25)",
                          }}>
                            {pct.toFixed(0)}% of peak
                          </span>
                        )}
                        <span style={{
                          fontSize: "12px", fontWeight: 700, letterSpacing: "-0.01em",
                          color: isHov ? AMB1 : "hsl(var(--foreground))",
                          transition: "color 150ms ease",
                          fontVariantNumeric: "tabular-nums",
                        } as React.CSSProperties}>
                          {fmt(row.total)}
                        </span>
                      </div>
                    </div>
                    <div style={{ width: "100%", height: "6px", borderRadius: "9999px", background: "hsl(var(--muted)/0.4)", overflow: "hidden" }}>
                      <div style={{
                        height: "100%",
                        width: `${pct}%`,
                        borderRadius: "9999px",
                        background: `linear-gradient(90deg,${AMB1}88,${AMB2})`,
                        transition: "width 600ms cubic-bezier(0.4,0,0.2,1)",
                        transitionDelay: `${idx * 50}ms`,
                        boxShadow: isHov ? `0 0 6px ${AMB1}55` : "none",
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Vendor-wise Table ────────────────────────────────────── */}
      <div style={card}>
        <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid hsl(var(--border)/0.5)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
          <div>
            <p style={secTitle}>Vendor-wise Purchases</p>
            <p style={secSub}>{byVendor.length} vendor{byVendor.length !== 1 ? "s" : ""} · ranked by total spend</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            {[
              { dot: "hsl(var(--foreground))", label: "Vendor" },
              { dot: AMB1,                     label: "GST" },
            ].map(l => (
              <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: l.dot }} />
                <span style={{ fontSize: "10px", color: "hsl(var(--muted-foreground))" }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "hsl(var(--muted)/0.35)", borderBottom: "1px solid hsl(var(--border)/0.6)" }}>
                {["Vendor", "Invoices", "Taxable", "GST", "Total", "% Share"].map((h, i) => (
                  <th key={h} style={{
                    padding: "10px 16px",
                    textAlign: i === 0 ? "left" : "right",
                    fontSize: "11px", fontWeight: 600,
                    color: "hsl(var(--muted-foreground))",
                    letterSpacing: "0.02em", whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byVendor.map(v => {
                const pct = totalSpend > 0 ? (v.total / totalSpend) * 100 : 0;
                const isHov = hoveredVendor === v.name;
                return (
                  <tr
                    key={v.name}
                    onMouseEnter={() => setHoveredVendor(v.name)}
                    onMouseLeave={() => setHoveredVendor(null)}
                    style={{
                      borderTop: "1px solid hsl(var(--border)/0.3)",
                      background: isHov ? "hsl(var(--muted)/0.2)" : "transparent",
                      transition: "background 150ms ease",
                      cursor: "default",
                    }}
                  >
                    {/* Vendor name */}
                    <td style={{ padding: "13px 16px", fontWeight: 600, fontSize: "12px", color: "hsl(var(--foreground))", whiteSpace: "nowrap" }}>
                      {v.name}
                    </td>
                    {/* Invoices */}
                    <td style={{ padding: "13px 16px", textAlign: "right", fontSize: "12px", color: "hsl(var(--muted-foreground))", fontVariantNumeric: "tabular-nums" } as React.CSSProperties}>
                      {v.invoices}
                    </td>
                    {/* Taxable */}
                    <td style={{ padding: "13px 16px", textAlign: "right", fontSize: "12px", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" } as React.CSSProperties}>
                      {fmt(v.taxable)}
                    </td>
                    {/* GST */}
                    <td style={{ padding: "13px 16px", textAlign: "right", fontSize: "12px", color: AMB1, fontWeight: 500, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" } as React.CSSProperties}>
                      {fmt(v.tax)}
                    </td>
                    {/* Total */}
                    <td style={{ padding: "13px 16px", textAlign: "right", fontSize: "12px", fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" } as React.CSSProperties}>
                      {fmt(v.total)}
                    </td>
                    {/* % Share → progress bar */}
                    <td style={{ padding: "13px 16px", minWidth: "120px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ flex: 1, height: "5px", borderRadius: "9999px", background: "hsl(var(--muted)/0.4)", overflow: "hidden" }}>
                          <div style={{
                            height: "100%",
                            width: `${pct}%`,
                            borderRadius: "9999px",
                            background: `linear-gradient(90deg,${AMB1}88,${AMB2})`,
                            transition: "width 500ms cubic-bezier(0.4,0,0.2,1)",
                            boxShadow: isHov ? `0 0 5px ${AMB1}55` : "none",
                          }} />
                        </div>
                        <span style={{
                          fontSize: "11px", fontWeight: 600, color: isHov ? AMB1 : "hsl(var(--muted-foreground))",
                          minWidth: "36px", textAlign: "right", letterSpacing: "-0.01em",
                          transition: "color 150ms ease",
                          fontVariantNumeric: "tabular-nums",
                        } as React.CSSProperties}>
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Totals footer */}
            <tfoot>
              <tr style={{ borderTop: "2px solid hsl(var(--border)/0.6)", background: "hsl(var(--muted)/0.3)" }}>
                <td style={{ padding: "11px 16px", fontWeight: 700, fontSize: "12px", color: "hsl(var(--muted-foreground))" }}>Total</td>
                <td style={{ padding: "11px 16px", textAlign: "right", fontWeight: 700, fontSize: "12px", fontVariantNumeric: "tabular-nums" } as React.CSSProperties}>
                  {filtered.length}
                </td>
                <td style={{ padding: "11px 16px", textAlign: "right", fontWeight: 700, fontSize: "12px", fontVariantNumeric: "tabular-nums" } as React.CSSProperties}>
                  {fmt(totalTaxable)}
                </td>
                <td style={{ padding: "11px 16px", textAlign: "right", fontWeight: 700, fontSize: "12px", color: AMB1, fontVariantNumeric: "tabular-nums" } as React.CSSProperties}>
                  {fmt(totalGST)}
                </td>
                <td style={{ padding: "11px 16px", textAlign: "right", fontWeight: 700, fontSize: "13px", fontVariantNumeric: "tabular-nums" } as React.CSSProperties}>
                  {fmt(totalSpend)}
                </td>
                <td style={{ padding: "11px 16px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "hsl(var(--muted-foreground))" }}>100%</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// EXPENSES REPORT  — Premium SaaS Visual Upgrade
// All data logic, layout order, and information is 100% unchanged.
// ══════════════════════════════════════════════════════════════
const ExpensesReport = () => {
  const [period, setPeriod] = useState("all");
  const [hoveredCat, setHoveredCat] = useState<string | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  // ── Data — async from expenseStore ────────────────────────────
  // Each row: { id, expense_date, category, amount } — matches ExpenseRow type.
  // Categories used: "Salaries", "Commission", "Royalty", "Utilities", "Freight"
  const [allExpenses, setAllExpenses] = useState<ExpenseRow[]>([]);
  const [expensesLoading, setExpensesLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setExpensesLoading(true);
      try {
        const data = await getExpenses();
        setAllExpenses(data);
      } finally {
        setExpensesLoading(false);
      }
    };
    load();
  }, []);

  const filtExpenses = useMemo(() =>
    allExpenses.filter(e => matchesFilter(parseDate(e.expense_date), period)),
  [allExpenses, period]);

  // Group by the 5 known categories — any unrecognised row goes to "Other"
  const sumCat = (cat: string) =>
    filtExpenses.filter(e => e.category === cat).reduce((s, e) => s + (e.amount ?? 0), 0);

  const totals = {
    salaries:   sumCat("Salaries"),
    commission: sumCat("Commission"),
    royalty:    sumCat("Royalty"),
    utilities:  sumCat("Utilities"),
    freight:    sumCat("Freight"),
  };
  const grandTotal = Object.values(totals).reduce((s, v) => s + v, 0);

  // Softened palette — same hues, lower saturation for premium feel
  const categories = [
    { name: "Salaries",   amount: totals.salaries,   hex: "#6ee7b7", grad: ["#6ee7b7", "#34d399"] },
    { name: "Commission", amount: totals.commission, hex: "#67e8f9", grad: ["#67e8f9", "#22d3ee"] },
    { name: "Royalty",    amount: totals.royalty,    hex: "#fde68a", grad: ["#fde68a", "#fbbf24"] },
    { name: "Utilities",  amount: totals.utilities,  hex: "#93c5fd", grad: ["#93c5fd", "#60a5fa"] },
    { name: "Freight",    amount: totals.freight,    hex: "#d8b4fe", grad: ["#d8b4fe", "#c084fc"] },
  ];

  const sortedCats = [...categories].sort((a, b) => b.amount - a.amount);
  const topCat = sortedCats[0];

  // Monthly breakdown — derived from filtExpenses rows
  const months = useMemo(() => {
    const s = new Set<string>();
    filtExpenses.forEach(e => {
      const d = parseDate(e.expense_date);
      if (d) s.add(`${MONTH_NAMES[d.month - 1]} ${d.year}`);
    });
    return [...s].sort();
  }, [filtExpenses]);

  const monthlyBreakdown = useMemo(() => months.map(m => {
    const inMonth = (e: any) => {
      const d = parseDate(e.expense_date);
      return d ? `${MONTH_NAMES[d.month - 1]} ${d.year}` === m : false;
    };
    const byCatInMonth = (cat: string) =>
      filtExpenses.filter(e => inMonth(e) && e.category === cat).reduce((s, e) => s + (e.amount ?? 0), 0);
    const sal  = byCatInMonth("Salaries");
    const comm = byCatInMonth("Commission");
    const roy  = byCatInMonth("Royalty");
    const elec = byCatInMonth("Utilities");
    const frt  = byCatInMonth("Freight");
    return { month: m, sal, comm, roy, elec, frt, total: sal + comm + roy + elec + frt };
  }), [months, filtExpenses]);

  // ── Shared style tokens ───────────────────────────────────────
  const cardBase: React.CSSProperties = {
    borderRadius: "16px",
    border: "1px solid hsl(var(--border)/0.6)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(255,255,255,0.03) inset",
    background: "hsl(var(--card))",
    overflow: "hidden",
    transition: "box-shadow 180ms ease, transform 180ms ease",
  };
  const cardHover = "0 6px 18px rgba(0,0,0,0.11), 0 0 0 1px rgba(255,255,255,0.05) inset";
  const cardRest  = "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(255,255,255,0.03) inset";

  // colour per category name → used in table
  const catHex: Record<string, string> = {
    Salaries: "#6ee7b7", Commission: "#67e8f9",
    Royalty: "#fde68a", Utilities: "#93c5fd", Freight: "#d8b4fe",
  };

  if (expensesLoading) return (
    <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
      <RefreshCw className="h-4 w-4 animate-spin" /><span className="text-sm">Loading expenses data…</span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", paddingBottom: "16px" }}>
          <div>
            <p style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))", marginBottom: "3px" }}>
              Expenses Report
            </p>
            <p style={{ fontSize: "12px", color: "hsl(var(--muted-foreground))" }}>
              Total expenses in period · {months.length} month{months.length !== 1 ? "s" : ""} covered
            </p>
          </div>
          <DateFilter value={period} onChange={setPeriod} />
        </div>
        {/* Subtle divider */}
        <div style={{ height: "1px", background: "hsl(var(--border)/0.5)" }} />
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "16px" }}>

        {/* Total Expenses */}
        <div
          style={{ ...cardBase, padding: "22px 24px 20px", position: "relative", background: "linear-gradient(145deg,hsl(var(--card)) 0%,rgba(248,113,113,0.05) 100%)" }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = cardHover; e.currentTarget.style.transform = "translateY(-1px)"; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = cardRest;  e.currentTarget.style.transform = "translateY(0)"; }}
        >
          <div style={{ position: "absolute", top: -18, right: -18, width: 72, height: 72, borderRadius: "50%", background: "rgba(248,113,113,0.13)", filter: "blur(18px)", pointerEvents: "none" }} />
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
            <div style={{ width: 28, height: 28, borderRadius: "8px", background: "rgba(248,113,113,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", color: "#fca5a5" }}>₹</div>
            <span style={{ fontSize: "11px", fontWeight: 500, color: "hsl(var(--muted-foreground))" }}>Total Expenses</span>
          </div>
          <p style={{ fontSize: "26px", fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", color: "#fca5a5", marginBottom: "6px" }}>
            {fmt(grandTotal)}
          </p>
          <p style={{ fontSize: "11px", color: "hsl(var(--muted-foreground))" }}>Total spend in period</p>
        </div>

        {/* Largest Category */}
        <div
          style={{ ...cardBase, padding: "22px 24px 20px", position: "relative", background: `linear-gradient(145deg,hsl(var(--card)) 0%,${topCat?.hex ?? "#888"}0d 100%)` }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = cardHover; e.currentTarget.style.transform = "translateY(-1px)"; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = cardRest;  e.currentTarget.style.transform = "translateY(0)"; }}
        >
          <div style={{ position: "absolute", top: -18, right: -18, width: 72, height: 72, borderRadius: "50%", background: `${topCat?.hex ?? "#888"}22`, filter: "blur(18px)", pointerEvents: "none" }} />
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
            <div style={{ width: 28, height: 28, borderRadius: "8px", background: `${topCat?.hex ?? "#888"}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px" }}>📊</div>
            <span style={{ fontSize: "11px", fontWeight: 500, color: "hsl(var(--muted-foreground))" }}>Largest Category</span>
          </div>
          <p style={{ fontSize: "26px", fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", color: topCat?.hex ?? "hsl(var(--foreground))", marginBottom: "6px" }}>
            {topCat?.name ?? "—"}
          </p>
          <p style={{ fontSize: "11px", color: "hsl(var(--muted-foreground))" }}>
            {topCat ? `${fmt(topCat.amount)} · top expense category` : "—"}
          </p>
        </div>

        {/* Months Covered */}
        <div
          style={{ ...cardBase, padding: "22px 24px 20px", position: "relative", background: "linear-gradient(145deg,hsl(var(--card)) 0%,rgba(147,197,253,0.05) 100%)" }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = cardHover; e.currentTarget.style.transform = "translateY(-1px)"; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = cardRest;  e.currentTarget.style.transform = "translateY(0)"; }}
        >
          <div style={{ position: "absolute", top: -18, right: -18, width: 72, height: 72, borderRadius: "50%", background: "rgba(147,197,253,0.15)", filter: "blur(18px)", pointerEvents: "none" }} />
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
            <div style={{ width: 28, height: 28, borderRadius: "8px", background: "rgba(147,197,253,0.13)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px" }}>📅</div>
            <span style={{ fontSize: "11px", fontWeight: 500, color: "hsl(var(--muted-foreground))" }}>Months Covered</span>
          </div>
          <p style={{ fontSize: "26px", fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", color: "#93c5fd", marginBottom: "6px" }}>
            {months.length}
          </p>
          <p style={{ fontSize: "11px", color: "hsl(var(--muted-foreground))" }}>
            {categories.filter(c => c.amount > 0).length} active expense categories
          </p>
        </div>
      </div>

      {/* ── Expenses by Category ────────────────────────────────── */}
      <div style={cardBase}>
        <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid hsl(var(--border)/0.45)" }}>
          <p style={{ fontSize: "13px", fontWeight: 600, color: "hsl(var(--foreground))", letterSpacing: "-0.01em" }}>Expenses by Category</p>
          <p style={{ fontSize: "11px", color: "hsl(var(--muted-foreground))", marginTop: "2px" }}>Spend distribution across all categories</p>
        </div>
        <div style={{ padding: "18px 22px 22px", display: "flex", flexDirection: "column", gap: "18px" }}>
          {sortedCats.map(c => {
            const pct = grandTotal > 0 ? (c.amount / grandTotal) * 100 : 0;
            const isHov = hoveredCat === c.name;
            return (
              <div
                key={c.name}
                onMouseEnter={() => setHoveredCat(c.name)}
                onMouseLeave={() => setHoveredCat(null)}
                style={{ cursor: "default" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "7px" }}>
                  {/* Left: dot + name */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "2px", background: `linear-gradient(135deg,${c.grad[0]},${c.grad[1]})`, flexShrink: 0 }} />
                    <span style={{ fontSize: "12px", fontWeight: 500, color: "hsl(var(--muted-foreground))" }}>{c.name}</span>
                  </div>
                  {/* Right: % + amount  — tooltip on hover */}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    {isHov && (
                      <span style={{
                        fontSize: "10px", padding: "2px 8px", borderRadius: "20px",
                        background: `${c.hex}18`, color: c.hex,
                        border: `1px solid ${c.hex}30`,
                        transition: "opacity 150ms ease",
                      }}>
                        {pct.toFixed(1)}% of total
                      </span>
                    )}
                    <span style={{ fontSize: "11px", color: "hsl(var(--muted-foreground)/0.7)", minWidth: "36px", textAlign: "right", fontVariantNumeric: "tabular-nums" } as React.CSSProperties}>
                      {pct.toFixed(1)}%
                    </span>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: c.hex, minWidth: "100px", textAlign: "right", letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums" } as React.CSSProperties}>
                      {fmt(c.amount)}
                    </span>
                  </div>
                </div>
                {/* Gradient bar */}
                <div style={{ width: "100%", height: "6px", borderRadius: "9999px", background: "hsl(var(--muted)/0.35)", overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${pct}%`,
                    borderRadius: "9999px",
                    background: `linear-gradient(90deg,${c.grad[0]}99,${c.grad[1]})`,
                    transition: "width 550ms cubic-bezier(0.4,0,0.2,1)",
                    boxShadow: isHov ? `0 0 7px ${c.hex}55` : "none",
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Monthly Expenses Breakdown ──────────────────────────── */}
      {monthlyBreakdown.length > 0 && (
        <div style={cardBase}>
          <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid hsl(var(--border)/0.45)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <p style={{ fontSize: "13px", fontWeight: 600, color: "hsl(var(--foreground))", letterSpacing: "-0.01em" }}>Monthly Expenses Breakdown</p>
              <p style={{ fontSize: "11px", color: "hsl(var(--muted-foreground))", marginTop: "2px" }}>Full breakdown by category per month</p>
            </div>
            {/* Colour legend */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              {[
                { label: "Salaries",   hex: "#6ee7b7" },
                { label: "Commission", hex: "#67e8f9" },
                { label: "Royalty",    hex: "#fde68a" },
                { label: "Utilities",  hex: "#93c5fd" },
                { label: "Freight",    hex: "#d8b4fe" },
              ].map(l => (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: l.hex }} />
                  <span style={{ fontSize: "10px", color: "hsl(var(--muted-foreground))" }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "hsl(var(--muted)/0.3)", borderBottom: "1px solid hsl(var(--border)/0.5)" }}>
                  {[
                    { label: "Month",      align: "left"  },
                    { label: "Salaries",   align: "right", hex: "#6ee7b7" },
                    { label: "Commission", align: "right", hex: "#67e8f9" },
                    { label: "Royalty",    align: "right", hex: "#fde68a" },
                    { label: "Utilities",  align: "right", hex: "#93c5fd" },
                    { label: "Freight",    align: "right", hex: "#d8b4fe" },
                    { label: "Total",      align: "right" },
                  ].map(h => (
                    <th key={h.label} style={{
                      padding: "10px 16px",
                      textAlign: h.align as "left" | "right",
                      fontSize: "11px", fontWeight: 600,
                      color: (h as any).hex ?? "hsl(var(--muted-foreground))",
                      letterSpacing: "0.02em", whiteSpace: "nowrap",
                    }}>
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthlyBreakdown.map(r => {
                  const isHov = hoveredRow === r.month;
                  return (
                    <tr
                      key={r.month}
                      onMouseEnter={() => setHoveredRow(r.month)}
                      onMouseLeave={() => setHoveredRow(null)}
                      style={{
                        borderTop: "1px solid hsl(var(--border)/0.25)",
                        background: isHov ? "hsl(var(--muted)/0.18)" : "transparent",
                        transition: "background 150ms ease",
                        cursor: "default",
                      }}
                    >
                      <td style={{ padding: "13px 16px", fontWeight: 600, fontSize: "12px", color: "hsl(var(--foreground))", whiteSpace: "nowrap" }}>{r.month}</td>
                      {[
                        { val: r.sal,  hex: "#6ee7b7" },
                        { val: r.comm, hex: "#67e8f9" },
                        { val: r.roy,  hex: "#fde68a" },
                        { val: r.elec, hex: "#93c5fd" },
                        { val: r.frt,  hex: "#d8b4fe" },
                      ].map((cell, i) => (
                        <td key={i} style={{
                          padding: "13px 16px", textAlign: "right",
                          fontSize: "12px",
                          fontWeight: cell.val > 0 ? 500 : 400,
                          color: cell.val > 0 ? cell.hex : "hsl(var(--muted-foreground)/0.35)",
                          fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em",
                        } as React.CSSProperties}>
                          {cell.val > 0 ? fmt(cell.val) : "—"}
                        </td>
                      ))}
                      <td style={{ padding: "13px 16px", textAlign: "right", fontWeight: 700, fontSize: "12px", color: "hsl(var(--foreground))", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" } as React.CSSProperties}>
                        {fmt(r.total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid hsl(var(--border)/0.55)", background: "hsl(var(--muted)/0.28)" }}>
                  <td style={{ padding: "11px 16px", fontWeight: 700, fontSize: "12px", color: "hsl(var(--muted-foreground))" }}>Total</td>
                  {[
                    { val: totals.salaries,   hex: "#6ee7b7" },
                    { val: totals.commission, hex: "#67e8f9" },
                    { val: totals.royalty,    hex: "#fde68a" },
                    { val: totals.utilities,  hex: "#93c5fd" },
                    { val: totals.freight,    hex: "#d8b4fe" },
                  ].map((cell, i) => (
                    <td key={i} style={{
                      padding: "11px 16px", textAlign: "right",
                      fontWeight: 700, fontSize: "12px",
                      color: cell.hex, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em",
                    } as React.CSSProperties}>
                      {fmt(cell.val)}
                    </td>
                  ))}
                  <td style={{ padding: "11px 16px", textAlign: "right", fontWeight: 700, fontSize: "13px", color: "hsl(var(--foreground))", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" } as React.CSSProperties}>
                    {fmt(grandTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
// PROFIT & LOSS REPORT  — Premium SaaS Financial Dashboard
// All data, calculations, and P&L structure are 100% unchanged.
// Visual layer only.
// ══════════════════════════════════════════════════════════════
const PnLReport = () => {
  const [period, setPeriod] = useState("all");

  // ── Engine — source of truth for P&L summary values ──────────
  const [engine,        setEngine]        = useState<EngineResult | null>(null);
  const [engineLoading, setEngineLoading] = useState(true);

  useEffect(() => {
    setEngineLoading(true);
    setEngine(null);
    // [AUTH-GUARD] Confirm session before engine run — via authStore, not raw supabase.
    getActiveSession().then(session => {
      if (!session) {
        console.warn("[PnLReport] No active session — skipping engine run.");
        setEngineLoading(false);
        return;
      }
      runEnterpriseEngine(toEnginePeriod(period), "reports-pnl")
        .then(data => setEngine(data))
        .catch(err => console.error("[PnLReport] engine failed:", err))
        .finally(() => setEngineLoading(false));
    });
  }, [period]);

  // ── Invoice data — kept ONLY for invoice count display in KPI sub-labels ──
  // No financial aggregation done here. All totals come from engine.metrics.accrual.
  const [pnlInvoices, setPnlInvoices] = useState<Awaited<ReturnType<typeof getAllInvoices>>>([]);
  const [pnlInvLoading, setPnlInvLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const invoices = await getAllInvoices();
        setPnlInvoices(invoices);
      } catch (err) {
        console.error("[PnLReport] getAllInvoices failed:", err);
      } finally {
        setPnlInvLoading(false);
      }
    };
    load();
  }, []);

  // ── Inventory UI data — kept for COGS formula card and inventory context display ──
  // The engine uses getStockSummary internally for COGS adjustment.
  // We fetch inventory items here only to show SKU count and the formula breakdown card.
  // No financial total is computed here.
  const [invItems, setInvItems]  = useState<any[]>([]);
  const [invTxns,  setInvTxns]   = useState<any[]>([]);
  const [invLoading, setInvLoad] = useState(true);

  useEffect(() => {
    const load = async () => {
      setInvLoad(true);
      const session = await getActiveSession();
      if (!session) {
        console.warn("[PnLReport] No active session — skipping inventory fetch.");
        setInvLoad(false);
        return;
      }
      const [items, txns] = await Promise.all([
        getItems(),
        getTransactions(),
      ]);
      setInvItems(items);
      setInvTxns(txns);
      setInvLoad(false);
    };
    load();
  }, []);

  // ── Invoice count for KPI sub-labels (display only, not financial) ──
  const filtInvoices = useMemo(() =>
    pnlInvoices.filter(inv => matchesFilter(parseDate(inv.invoiceDate), period)), [pnlInvoices, period]);

  // ── Inventory context for COGS formula card (display only) ──
  const filtTxns = useMemo(() => invTxns.filter(t => {
    const d = parseDate(t.transaction_date ?? t.created_at?.slice(0, 10));
    return matchesFilter(d, period);
  }), [invTxns, period]);

  const inventoryIn = filtTxns
    .filter(t => t.transaction_type === "Purchase/In")
    .reduce((s: number, t: any) => {
      const rate = t.inventory_items?.buy_rate ?? 0;
      return s + (t.quantity_changed * rate);
    }, 0);

  // Closing stock value for formula card — engine uses getStockSummary for actual COGS,
  // this local value is ONLY for rendering the formula breakdown UI card.
  const closingStockValue = invItems.reduce((s: number, item: any) =>
    s + (item.current_stock * (item.buy_rate ?? 0)), 0);

  const hasInventoryData = invItems.length > 0;

  // ── OPEX category breakdown — sourced from engine.metrics.accrual.opexByCategory ──
  // This replaces the previous local expense store re-aggregation (no reduce allowed for totals).
  // Used only for per-category line items in pnlRows — totals still come from engine.
  const opexByCategory = engine?.metrics.accrual.opexByCategory ?? {};
  const opex = {
    salaries:   opexByCategory["Salaries"]   ?? 0,
    commission: opexByCategory["Commission"] ?? 0,
    royalty:    opexByCategory["Royalty"]    ?? 0,
    utilities:  opexByCategory["Utilities"]  ?? 0,
    freight:    opexByCategory["Freight"]    ?? 0,
  };

  // [REF-3] ACCOUNTING VIEW - P&L
  // ALL financial totals sourced exclusively from engine.metrics.accrual.
  // No UI calculations. No reduce(). No store re-aggregation.
  const grossSales    = engine?.metrics.accrual.grossSales       ?? 0;
  const creditNotesPnL= engine?.metrics.accrual.creditNotesTotal ?? 0;
  const revenue       = engine?.metrics.accrual.revenue          ?? 0;
  const purchasesVal  = engine?.metrics.accrual.purchases        ?? 0;
  const closingStock  = engine?.metrics.accrual.closingStock      ?? 0;
  const openingStock  = engine?.metrics.accrual.openingStock      ?? 0;
  const cogs          = engine?.metrics.accrual.cogs              ?? 0;
  const totalOpex     = engine?.metrics.accrual.opex              ?? 0;
  const grossProfit   = engine?.metrics.accrual.grossProfit       ?? 0;
  const netProfit     = engine?.metrics.accrual.netProfit         ?? 0;
  const gstCollected  = engine?.metrics.accrual.gstCollected      ?? 0;
  const gstPaid       = engine?.metrics.accrual.gstPaid           ?? 0;

  const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  const netMargin   = revenue > 0 ? (netProfit / revenue) * 100 : 0;

  // ── P&L rows ───────────────────────────────────────────────
  // Revenue section follows accounting standard:
  //   Gross Sales → Less: Credit Notes → Net Revenue → COGS → Gross Profit → Opex → Net Profit
  const pnlRows = [
    { label: "Gross Sales",                value:  grossSales,         indent: 1, color: "text-green-400",        bold: false },
    ...(creditNotesPnL > 0 ? [
      { label: "Less: Credit Notes",       value: -creditNotesPnL,     indent: 1, color: "text-muted-foreground", bold: false },
    ] : []),
    { label: "Revenue (Ex GST)",            value:  revenue,            indent: 0, color: "text-green-400",        bold: true,  separator: true },
    { label: "Opening Stock (Asset)",      value:  openingStock,       indent: 1, color: "text-blue-400",         bold: false },
    { label: "Add: Purchases (Period)",    value:  purchasesVal,       indent: 1, color: "text-muted-foreground", bold: false },
    { label: "Less: Closing Stock (Asset)", value: -closingStock,      indent: 1, color: "text-blue-400",         bold: false },
    { label: "Cost of Goods Sold",           value: -cogs,              indent: 0, color: "text-red-400",          bold: false },
    { label: "Gross Profit",                 value:  grossProfit,       indent: 0, color: grossProfit >= 0 ? "text-green-400" : "text-red-400", bold: true,  separator: true },
    { label: "Operating Expenses (Total)",   value: -totalOpex,         indent: 0, color: "text-red-400",          bold: true,  separator: true },
    { label: "Net Profit",                   value:  netProfit,         indent: 0, color: netProfit >= 0 ? "text-green-400" : "text-red-400", bold: true, separator: true },
  ];

  // ── Design tokens ──────────────────────────────────────────
  const G = { pos: "#86efac", neg: "#fca5a5", blue: "#93c5fd", amber: "#fcd34d", muted: "hsl(var(--muted-foreground))" };

  const cardBase: React.CSSProperties = {
    borderRadius: "16px",
    border: "1px solid hsl(var(--border)/0.6)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(255,255,255,0.03) inset",
    background: "hsl(var(--card))",
    overflow: "hidden",
    transition: "box-shadow 180ms ease, transform 180ms ease",
  };
  const hover  = (e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.12), 0 0 0 1px rgba(255,255,255,0.05) inset"; e.currentTarget.style.transform = "translateY(-1px)"; };
  const unhover= (e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(255,255,255,0.03) inset";  e.currentTarget.style.transform = "translateY(0)"; };

  // label beneath a KPI value
  const MicroLabel = ({ children }: { children: React.ReactNode }) => (
    <p style={{ fontSize: "11px", color: G.muted, marginTop: "5px" }}>{children}</p>
  );

  if (pnlInvLoading || invLoading || engineLoading) return (
    <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
      <RefreshCw className="h-4 w-4 animate-spin" /><span className="text-sm">Loading P&amp;L data…</span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>

      {/* ── Header ──────────────────────────────────────────── */}
      <div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", paddingBottom: "16px" }}>
          <div>
            <p style={{ fontSize: "18px", fontWeight: 700, letterSpacing: "-0.02em", color: "hsl(var(--foreground))", marginBottom: "3px" }}>
              Profit &amp; Loss
            </p>
            <p style={{ fontSize: "12px", color: G.muted }}>Financial performance overview</p>
            {engine && !engineLoading && (
              <div style={{ marginTop: "8px" }}>
                <EngineHealthBadges engine={engine} />
              </div>
            )}
          </div>
          <DateFilter value={period} onChange={setPeriod} />
        </div>
        <div style={{ height: "1px", background: "hsl(var(--border)/0.5)" }} />
      </div>





      {/* ── Main KPI Strip ──────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "16px" }}>

        {/* Revenue */}
        <div style={{ ...cardBase, padding: "22px 22px 20px", position: "relative", background: "linear-gradient(145deg,hsl(var(--card)) 0%,rgba(134,239,172,0.06) 100%)" }}
          onMouseEnter={hover} onMouseLeave={unhover}>
          <div style={{ position: "absolute", top: -16, right: -16, width: 64, height: 64, borderRadius: "50%", background: "rgba(134,239,172,0.15)", filter: "blur(16px)", pointerEvents: "none" }} />
          <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "10px" }}>
            <div style={{ width: 26, height: 26, borderRadius: "7px", background: "rgba(134,239,172,0.14)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", color: G.pos }}>₹</div>
            <span style={{ fontSize: "11px", fontWeight: 500, color: G.muted }}>Revenue (Ex GST)</span>
          </div>
          <p style={{ fontSize: "24px", fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", color: G.pos, marginBottom: "2px" }}>{fmt(revenue)}</p>
          <MicroLabel>
            {creditNotesPnL > 0
              ? `Net of GST & credit notes · ${filtInvoices.length} inv`
              : `Net of GST · ${filtInvoices.length} invoices`}
          </MicroLabel>
        </div>

        {/* COGS */}
        <div style={{ ...cardBase, padding: "22px 22px 20px", position: "relative", background: "linear-gradient(145deg,hsl(var(--card)) 0%,rgba(252,165,165,0.06) 100%)" }}
          onMouseEnter={hover} onMouseLeave={unhover}>
          <div style={{ position: "absolute", top: -16, right: -16, width: 64, height: 64, borderRadius: "50%", background: "rgba(252,165,165,0.14)", filter: "blur(16px)", pointerEvents: "none" }} />
          <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "10px" }}>
            <div style={{ width: 26, height: 26, borderRadius: "7px", background: "rgba(252,165,165,0.13)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px" }}>📦</div>
            <span style={{ fontSize: "11px", fontWeight: 500, color: G.muted }}>COGS</span>
          </div>
          <p style={{ fontSize: "24px", fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", color: G.neg, marginBottom: "2px" }}>{fmt(cogs)}</p>
          <MicroLabel>Cost of Goods Sold{hasInventoryData ? " · stock-adjusted" : ""}</MicroLabel>
        </div>

        {/* Gross Margin */}
        <div style={{ ...cardBase, padding: "22px 22px 20px", position: "relative", background: `linear-gradient(145deg,hsl(var(--card)) 0%,${grossMargin >= 0 ? "rgba(134,239,172,0.05)" : "rgba(252,165,165,0.05)"} 100%)` }}
          onMouseEnter={hover} onMouseLeave={unhover}>
          <div style={{ position: "absolute", top: -16, right: -16, width: 64, height: 64, borderRadius: "50%", background: `${grossMargin >= 0 ? "rgba(134,239,172,0.13)" : "rgba(252,165,165,0.13)"}`, filter: "blur(16px)", pointerEvents: "none" }} />
          <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "10px" }}>
            <div style={{ width: 26, height: 26, borderRadius: "7px", background: `${grossMargin >= 0 ? "rgba(134,239,172,0.13)" : "rgba(252,165,165,0.12)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px" }}>📈</div>
            <span style={{ fontSize: "11px", fontWeight: 500, color: G.muted }}>
              Gross Margin
            </span>
          </div>
          <p style={{ fontSize: "24px", fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", color: grossMargin >= 0 ? G.pos : G.neg, marginBottom: "2px" }}>{grossMargin.toFixed(1)}%</p>
          <MicroLabel>{fmt(grossProfit)} gross profit</MicroLabel>
        </div>

        {/* Net Profit */}
        <div style={{ ...cardBase, padding: "22px 22px 20px", position: "relative", background: `linear-gradient(145deg,hsl(var(--card)) 0%,${netProfit >= 0 ? "rgba(134,239,172,0.07)" : "rgba(252,165,165,0.07)"} 100%)` }}
          onMouseEnter={hover} onMouseLeave={unhover}>
          <div style={{ position: "absolute", top: -16, right: -16, width: 64, height: 64, borderRadius: "50%", background: `${netProfit >= 0 ? "rgba(134,239,172,0.17)" : "rgba(252,165,165,0.17)"}`, filter: "blur(16px)", pointerEvents: "none" }} />
          <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "10px" }}>
            <div style={{ width: 26, height: 26, borderRadius: "7px", background: `${netProfit >= 0 ? "rgba(134,239,172,0.15)" : "rgba(252,165,165,0.14)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px" }}>🏦</div>
            <span style={{ fontSize: "11px", fontWeight: 500, color: G.muted }}>Net Profit</span>
          </div>
          <p style={{ fontSize: "24px", fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", color: netProfit >= 0 ? G.pos : G.neg, marginBottom: "2px" }}>{fmt(netProfit)}</p>
          <MicroLabel>{netMargin.toFixed(1)}% net margin</MicroLabel>
        </div>
      </div>

      {/* ── Inventory Context Block ──────────────────────────── */}
      {hasInventoryData && (
        <div style={{ ...cardBase, background: "hsl(var(--card))" }}>
          <div style={{ padding: "14px 20px 12px", borderBottom: "1px solid hsl(var(--border)/0.45)", display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: 22, height: 22, borderRadius: "6px", background: "rgba(147,197,253,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Package className="h-3.5 w-3.5" style={{ color: G.blue }} />
            </div>
            <p style={{ fontSize: "12px", fontWeight: 600, color: "hsl(var(--foreground))" }}>Inventory Context</p>
            <span style={{ fontSize: "10px", color: G.muted, marginLeft: "2px" }}>— feeds into COGS calculation</span>
            {invLoading && <RefreshCw className="h-3 w-3 animate-spin ml-auto" style={{ color: G.muted }} />}
          </div>
          <div style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>

            {/* Closing Stock */}
            <div style={{ borderRadius: "12px", border: "1px solid rgba(147,197,253,0.2)", background: "rgba(147,197,253,0.04)", padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                <Package className="h-3.5 w-3.5" style={{ color: G.blue }} />
                <span style={{ fontSize: "11px", color: G.muted }}>Closing Stock Value</span>
              </div>
              <p style={{ fontSize: "22px", fontWeight: 700, color: G.blue, letterSpacing: "-0.02em", marginBottom: "4px" }}>{fmt(closingStockValue)}</p>
              <p style={{ fontSize: "11px", color: G.muted }}>{invItems.length} SKUs · live from inventory</p>
              <p style={{ fontSize: "11px", color: "rgba(147,197,253,0.7)", marginTop: "3px" }}>↓ Deducted from COGS (active asset)</p>
            </div>

            {/* Inventory Purchased */}
            <div style={{ borderRadius: "12px", border: "1px solid hsl(var(--border)/0.4)", background: "hsl(var(--muted)/0.12)", padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                <Package className="h-3.5 w-3.5" style={{ color: G.muted }} />
                <span style={{ fontSize: "11px", color: G.muted }}>Inventory Purchased (Period)</span>
              </div>
              <p style={{ fontSize: "22px", fontWeight: 700, color: "hsl(var(--foreground))", letterSpacing: "-0.02em", marginBottom: "4px" }}>{fmt(inventoryIn)}</p>
              <p style={{ fontSize: "11px", color: G.muted }}>Purchase/In transactions this period</p>
            </div>
          </div>
        </div>
      )}

      {/* ── COGS Formula Card ────────────────────────────────── */}
      {hasInventoryData && (
        <div style={{
          borderRadius: "14px",
          border: "1px solid rgba(147,197,253,0.22)",
          background: "rgba(147,197,253,0.04)",
          padding: "16px 20px",
          display: "flex", alignItems: "flex-start", gap: "14px",
        }}>
          <div style={{ width: 32, height: 32, borderRadius: "9px", background: "rgba(147,197,253,0.14)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "1px" }}>
            <AlertCircle className="h-4 w-4" style={{ color: G.blue }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: "12px", fontWeight: 600, color: "hsl(var(--foreground))", marginBottom: "8px" }}>How COGS is calculated</p>
            {/* Visual equation */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "8px" }}>
              {[
                { label: "Purchases", value: fmt(purchasesVal), bg: "rgba(252,165,165,0.1)", color: G.neg, border: "rgba(252,165,165,0.2)" },
                { label: "−", value: "", bg: "transparent", color: G.muted, border: "transparent", isOp: true },
                { label: "Closing Stock", value: fmt(closingStockValue), bg: "rgba(147,197,253,0.1)", color: G.blue, border: "rgba(147,197,253,0.22)" },
                { label: "=", value: "", bg: "transparent", color: G.muted, border: "transparent", isOp: true },
                { label: "COGS", value: fmt(cogs), bg: "rgba(252,165,165,0.13)", color: G.neg, border: "rgba(252,165,165,0.25)" },
              ].map((part, i) =>
                part.isOp ? (
                  <span key={i} style={{ fontSize: "16px", fontWeight: 300, color: G.muted, lineHeight: 1 }}>{part.label}</span>
                ) : (
                  <div key={i} style={{ borderRadius: "8px", border: `1px solid ${part.border}`, background: part.bg, padding: "6px 12px", textAlign: "center" }}>
                    <p style={{ fontSize: "10px", color: G.muted, marginBottom: "2px" }}>{part.label}</p>
                    <p style={{ fontSize: "13px", fontWeight: 700, color: part.color, letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums" } as React.CSSProperties}>{part.value}</p>
                  </div>
                )
              )}
            </div>
            <p style={{ fontSize: "11px", color: G.muted, lineHeight: 1.6 }}>
              Closing stock ({invItems.length} SKUs — finished goods, raw materials, packaging) is an active asset.
              It reduces COGS because it hasn't been sold yet. Without this deduction, COGS would be overstated by{" "}
              <span style={{ color: G.blue, fontWeight: 600 }}>{fmt(closingStockValue)}</span>.
            </p>
          </div>
        </div>
      )}

      {/* ── P&L Statement ───────────────────────────────────── */}
      <div style={cardBase}>
        {/* Card header */}
        <div style={{ padding: "16px 22px 14px", borderBottom: "1px solid hsl(var(--border)/0.45)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
          <div>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "hsl(var(--foreground))", letterSpacing: "-0.01em" }}>Profit &amp; Loss Statement</p>
            <p style={{ fontSize: "11px", color: G.muted, marginTop: "2px" }}>Gross Sales → Credit Notes → Revenue (Ex GST) → COGS → Gross Profit → Expenses → Net Profit</p>
          </div>
          {!hasInventoryData && (
            <span style={{ fontSize: "11px", color: G.amber, display: "flex", alignItems: "center", gap: "5px" }}>
              <AlertCircle className="h-3 w-3" /> COGS from purchases only — add inventory for accuracy
            </span>
          )}
          {hasInventoryData && (
            <span style={{ fontSize: "11px", color: G.blue, display: "flex", alignItems: "center", gap: "5px" }}>
              <Package className="h-3 w-3" /> Closing stock deducted from COGS · {invLoading ? "syncing…" : "live"}
            </span>
          )}
        </div>

        {/* P&L rows */}
        <div>
          {pnlRows.map((row, i) => {
            const isGrossProfit = row.label === "Gross Profit";
            const isNetProfit   = row.label === "Net Profit";
            const isTotalOpex   = row.label === "Total Operating Expenses";
            const isRevenue     = row.label === "Revenue (Ex GST)";
            const isCOGS        = row.label === "Cost of Goods Sold";
            const valueColor    = row.color === "text-green-400" ? G.pos
                                : row.color === "text-red-400"   ? G.neg
                                : row.color === "text-blue-400"  ? G.blue
                                : G.muted;

            return (
              <React.Fragment key={i}>
                {/* Section separator before bold rows (except first) */}
                {row.separator && i > 0 && (
                  <div style={{ height: "1px", background: "hsl(var(--border)/0.4)", margin: "0" }} />
                )}

                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: isNetProfit ? "16px 22px" : isGrossProfit ? "14px 22px" : row.indent ? "10px 22px 10px 42px" : "12px 22px",
                  background: isNetProfit   ? (netProfit  >= 0 ? "rgba(134,239,172,0.06)" : "rgba(252,165,165,0.06)")
                            : isGrossProfit ? (grossProfit >= 0 ? "rgba(134,239,172,0.04)" : "rgba(252,165,165,0.04)")
                            : isTotalOpex   ? "hsl(var(--muted)/0.15)"
                            : "transparent",
                  borderBottom: isNetProfit || isGrossProfit || isTotalOpex ? "none" : "1px solid hsl(var(--border)/0.18)",
                }}>
                  {/* Label */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {row.indent > 0 && (
                      <span style={{ color: "hsl(var(--border)/0.8)", fontSize: "12px", lineHeight: 1 }}>·</span>
                    )}
                    <span style={{
                      fontSize:   isNetProfit ? "14px" : isGrossProfit ? "13px" : "12px",
                      fontWeight: isNetProfit ? 700    : isGrossProfit || isTotalOpex || isRevenue || isCOGS ? 600 : 400,
                      color:      row.indent > 0 ? G.muted : "hsl(var(--foreground))",
                      letterSpacing: isNetProfit ? "-0.02em" : "-0.01em",
                    }}>
                      {row.label}
                    </span>
                    {isNetProfit && (
                      <span style={{
                        fontSize: "10px", padding: "2px 8px", borderRadius: "20px",
                        background: netProfit >= 0 ? "rgba(134,239,172,0.15)" : "rgba(252,165,165,0.15)",
                        color: netProfit >= 0 ? G.pos : G.neg,
                        border: `1px solid ${netProfit >= 0 ? "rgba(134,239,172,0.25)" : "rgba(252,165,165,0.25)"}`,
                        fontWeight: 600,
                      }}>
                        {netMargin.toFixed(1)}% net margin
                      </span>
                    )}
                    {isGrossProfit && (
                      <span style={{
                        fontSize: "10px", padding: "2px 8px", borderRadius: "20px",
                        background: grossProfit >= 0 ? "rgba(134,239,172,0.12)" : "rgba(252,165,165,0.12)",
                        color: grossProfit >= 0 ? G.pos : G.neg,
                        border: `1px solid ${grossProfit >= 0 ? "rgba(134,239,172,0.2)" : "rgba(252,165,165,0.2)"}`,
                        fontWeight: 600,
                      }}>
                        {grossMargin.toFixed(1)}% margin
                      </span>
                    )}
                  </div>

                  {/* Value */}
                  <span style={{
                    fontSize:   isNetProfit ? "16px" : isGrossProfit ? "14px" : "13px",
                    fontWeight: isNetProfit ? 700    : isGrossProfit || isTotalOpex ? 700 : row.bold ? 600 : 500,
                    color: valueColor,
                    letterSpacing: "-0.02em",
                    fontVariantNumeric: "tabular-nums",
                  } as React.CSSProperties}>
                    {row.value < 0 ? `−${fmt(Math.abs(row.value))}` : fmt(row.value)}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* ── GST Summary — 3 mini cards ──────────────────────── */}
      <div style={cardBase}>
        <div style={{ padding: "16px 22px 12px", borderBottom: "1px solid hsl(var(--border)/0.45)" }}>
          <p style={{ fontSize: "13px", fontWeight: 600, color: "hsl(var(--foreground))", letterSpacing: "-0.01em" }}>GST Summary</p>
          <p style={{ fontSize: "11px", color: G.muted, marginTop: "2px" }}>Output tax collected vs input credit paid</p>
        </div>
        <div style={{ padding: "16px 20px 20px", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "14px" }}>

          {/* GST Collected */}
          <div style={{ borderRadius: "12px", border: "1px solid rgba(134,239,172,0.2)", background: "rgba(134,239,172,0.04)", padding: "16px 18px" }}>
            <p style={{ fontSize: "11px", color: G.muted, marginBottom: "8px" }}>GST Collected (Output)</p>
            <p style={{ fontSize: "22px", fontWeight: 700, color: G.pos, letterSpacing: "-0.02em" }}>{fmt(gstCollected)}</p>
            <p style={{ fontSize: "10px", color: "rgba(134,239,172,0.6)", marginTop: "4px" }}>From sales invoices</p>
          </div>

          {/* GST Paid */}
          <div style={{ borderRadius: "12px", border: "1px solid rgba(252,165,165,0.2)", background: "rgba(252,165,165,0.04)", padding: "16px 18px" }}>
            <p style={{ fontSize: "11px", color: G.muted, marginBottom: "8px" }}>GST Paid (Input)</p>
            <p style={{ fontSize: "22px", fontWeight: 700, color: G.neg, letterSpacing: "-0.02em" }}>{fmt(gstPaid)}</p>
            <p style={{ fontSize: "10px", color: "rgba(252,165,165,0.6)", marginTop: "4px" }}>Input credit on purchases</p>
          </div>

          {/* Net GST Payable */}
          <div style={{ borderRadius: "12px", border: `1px solid ${gstCollected - gstPaid >= 0 ? "rgba(252,211,77,0.22)" : "rgba(134,239,172,0.2)"}`, background: `${gstCollected - gstPaid >= 0 ? "rgba(252,211,77,0.05)" : "rgba(134,239,172,0.04)"}`, padding: "16px 18px" }}>
            <p style={{ fontSize: "11px", color: G.muted, marginBottom: "8px" }}>Net GST Payable</p>
            <p style={{ fontSize: "22px", fontWeight: 700, color: gstCollected - gstPaid >= 0 ? G.amber : G.pos, letterSpacing: "-0.02em" }}>
              {fmt(Math.abs(gstCollected - gstPaid))}
            </p>
            <p style={{ fontSize: "10px", color: G.muted, marginTop: "4px" }}>
              {gstCollected - gstPaid >= 0 ? "Payable to government" : "Net input credit surplus"}
            </p>
          </div>
        </div>
      </div>

    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// CASH FLOW REPORT — Premium SaaS Dashboard
// ══════════════════════════════════════════════════════════════
const CashFlowReport = () => {
  const [period, setPeriod] = useState("all");
  const [viewMode, setViewMode] = useState<"monthly" | "cumulative">("monthly");
  const [tooltip, setTooltip] = useState<{ idx: number; data: { label: string; ym: string; inflow: number; outflow: number; net: number; cumulative: number } } | null>(null);

  // ── Engine — source of truth for cash flow summary values ────
  const [engine,        setEngine]        = useState<EngineResult | null>(null);
  const [engineLoading, setEngineLoading] = useState(true);

  useEffect(() => {
    setEngineLoading(true);
    setEngine(null);
    // [AUTH-GUARD] Confirm session before engine run — via authStore, not raw supabase.
    getActiveSession().then(session => {
      if (!session) {
        console.warn("[CashFlowReport] No active session — skipping engine run.");
        setEngineLoading(false);
        return;
      }
      runEnterpriseEngine(toEnginePeriod(period), "reports-cashflow")
        .then(data => setEngine(data))
        .catch(err => console.error("[CashFlowReport] engine failed:", err))
        .finally(() => setEngineLoading(false));
    });
  }, [period]);

  // ── Payment data (async — Supabase) ──────────────────────
  const [allPaymentsData, setAllPaymentsData] = useState<Awaited<ReturnType<typeof getAllPayments>>>([]);
  const [cfLoading, setCfLoading] = useState(true);

  useEffect(() => {
    getAllPayments()
      .then(data => setAllPaymentsData(data))
      .catch(err => console.error("[CashFlowReport] getAllPayments failed:", err))
      .finally(() => setCfLoading(false));
  }, []);

  const filtPayments = useMemo(() =>
    allPaymentsData.filter(p => matchesFilter(parseDate(p.paymentDate), period)), [allPaymentsData, period]);

  // ── Purchases — async from Supabase ──────────────────────────
  const [cfPurchases, setCfPurchases] = useState<any[]>([]);
  const [cfPurchasesLoading, setCfPurchasesLoading] = useState(true);
  const [cfPurchasesError, setCfPurchasesError] = useState<string | null>(null);

  useEffect(() => {
    getPurchases()
      .then((data: any[]) => {
        setCfPurchases(data);
        // Field-name diagnostic: warn immediately in dev if the shape doesn't match
        // what the aggregation code expects, rather than silently producing zero outflow.
        if (process.env.NODE_ENV !== "production" && data.length > 0) {
          const sample = data[0];
          if (sample.purchase_date === undefined)
            console.warn("[CashFlowReport] purchases[0] has no 'purchase_date' field — date filter will drop all rows. Actual keys:", Object.keys(sample));
          if (sample.total_amount === undefined)
            console.warn("[CashFlowReport] purchases[0] has no 'total_amount' field — outflow will be 0. Actual keys:", Object.keys(sample));
        }
      })
      .catch(err => {
        console.error("[CashFlowReport] getPurchases failed:", err);
        setCfPurchasesError("Purchases data unavailable — outflow totals are incomplete.");
      })
      .finally(() => setCfPurchasesLoading(false));
  }, []);

  // ── Expenses — async from expenseStore ───────────────────────
  const [cfExpenses, setCfExpenses] = useState<ExpenseRow[]>([]);
  const [cfExpensesLoading, setCfExpensesLoading] = useState(true);
  const [cfExpensesError, setCfExpensesError] = useState<string | null>(null);

  useEffect(() => {
    getExpenses()
      .then(data => {
        if (!data.length) setCfExpensesError("Expenses data unavailable — outflow totals are incomplete.");
        setCfExpenses(data);
      })
      .catch(err => {
        console.error("[CashFlowReport] getExpenses failed:", err);
        setCfExpensesError("Expenses data unavailable — outflow totals are incomplete.");
      })
      .finally(() => setCfExpensesLoading(false));
  }, []);

  const filtPurchases = useMemo(() =>
    cfPurchases.filter((p: any) => matchesFilter(parseDate(p.purchase_date), period)), [cfPurchases, period]);
  const purchasesOut = filtPurchases.reduce((s: number, p: any) => s + (p.total_amount ?? 0), 0);

  const filtExpensesCF = useMemo(() =>
    cfExpenses.filter(e => matchesFilter(parseDate(e.expense_date), period)), [cfExpenses, period]);

  const sumExpCF = (cat: string) =>
    filtExpensesCF.filter(e => e.category === cat).reduce((s, e) => s + (e.amount ?? 0), 0);

  // ✅ PERMITTED: expensesOut / purchasesOut are used ONLY for:
  //   1. "Where Money Is Going" category breakdown bar (display-only)
  //   2. Monthly chart per-month bars and transaction table rows (display-only)
  // ❌ PROHIBITED: Do NOT use these for KPI card totals (totalIn / totalOut / netCashFlow).
  //   Those come exclusively from engine.metrics.cash — see [REF-4] below.
  const expensesOut = {
    salaries:   sumExpCF("Salaries"),
    commission: sumExpCF("Commission"),
    royalty:    sumExpCF("Royalty"),
    utilities:  sumExpCF("Utilities"),
    freight:    sumExpCF("Freight"),
  };
  // totalExpensesOut: display-only — used for category pie/bar proportions only.
  const totalExpensesOut = Object.values(expensesOut).reduce((s, v) => s + v, 0);

  // ── DISPLAY-ONLY: per-transaction data for monthly chart and transaction table ──
  // These store-derived values are NEVER used as KPI summary totals.
  // All summary totals (totalIn, totalOut, netCashFlow) come exclusively from engine.metrics.cash.
  // Rule: store data → chart/table display only. Engine → all financial summary KPIs.

  // storeTotalIn / storeTotalOut: used ONLY for monthly chart cumulative running balance display.
  // Do NOT use for KPI cards — engine values below are the single source of truth.
  const storeTotalIn  = filtPayments.reduce((s, p) => s + p.amountPaid, 0);
  const storeTotalOut = purchasesOut + totalExpensesOut;

  // [REF-4] CASH VIEW - CASH FLOW
  // Pure cash-based metrics from the financial engine.
  // Ensures consistency with Dashboard and P&L.
  const totalIn      = engine?.metrics.cash.inflow      ?? 0;
  const totalOut     = engine?.metrics.cash.outflow     ?? 0;
  const netCashFlow  = engine?.metrics.cash.netCashFlow ?? 0;
  const isPositive   = netCashFlow >= 0;

  const allMonths = useMemo(() => {
    const s = new Set<string>();
    const add = (d: { year: number; month: number } | null) => { if (d) s.add(`${d.year}-${String(d.month).padStart(2, "0")}`); };
    filtPayments.forEach(p => add(parseDate(p.paymentDate)));
    filtPurchases.forEach((p: any) => add(parseDate(p.purchase_date)));
    filtExpensesCF.forEach(e => add(parseDate(e.expense_date)));
    return [...s].sort();
  }, [filtPayments, filtPurchases, filtExpensesCF]);

  const monthlyCFwithCumulative = useMemo(() => {
    let running = 0;
    return allMonths.map(ym => {
      const match = (d: { year: number; month: number } | null) => d ? `${d.year}-${String(d.month).padStart(2, "0")}` === ym : false;
      const inflow = filtPayments.filter(p => match(parseDate(p.paymentDate))).reduce((s, p) => s + p.amountPaid, 0);
      const outflow =
        filtPurchases.filter((p: any) => match(parseDate(p.purchase_date))).reduce((s: number, p: any) => s + (p.total_amount ?? 0), 0) +
        filtExpensesCF.filter((e: any) => match(parseDate(e.expense_date))).reduce((s: number, e: any) => s + (e.amount ?? 0), 0);
      const net = inflow - outflow;
      running += net;
      const [y, m] = ym.split("-");
      return { label: `${MONTH_NAMES[parseInt(m) - 1].slice(0, 3)} '${y.slice(2)}`, ym, inflow, outflow, net, cumulative: running };
    });
  }, [allMonths, filtPayments, filtPurchases, filtExpensesCF]);

  const maxBar = Math.max(...monthlyCFwithCumulative.flatMap(r => [r.inflow, r.outflow]), 1);

  const allTransactions = useMemo(() => {
    const rows: { date: string; desc: string; category: string; method: string; amount: number; type: "in" | "out" }[] = [];
    filtPayments.forEach(p => rows.push({ date: p.paymentDate, desc: p.customerName, category: "Payment Received", method: p.paymentMethod || "—", amount: p.amountPaid, type: "in" }));
    filtPurchases.forEach((p: any) => rows.push({
      date:     p.purchase_date,
      desc:     p.supplier_name || "Purchase",
      category: "Raw Materials",
      method:   "Invoice",
      amount:   p.total_amount ?? 0,
      type:     "out",
    }));
    filtExpensesCF.forEach((e: any) => rows.push({
      date:     e.expense_date ?? "",
      desc:     e.category || "Expense",
      category: e.category ?? "Other",
      method:   "Bank Transfer",
      amount:   e.amount ?? 0,
      type:     "out",
    }));
    return rows.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  }, [filtPayments, filtPurchases, filtExpensesCF]);

  const categoryRows = [
    { label: "Raw Materials & Packaging", value: purchasesOut,          color: "#f59e0b" },
    { label: "Salaries",                  value: expensesOut.salaries,   color: "#4ade80" },
    { label: "Commission",                value: expensesOut.commission, color: "#22d3ee" },
    { label: "Royalty",                   value: expensesOut.royalty,    color: "#facc15" },
    { label: "Utilities",                 value: expensesOut.utilities,  color: "#60a5fa" },
    { label: "Freight",                   value: expensesOut.freight,    color: "#c084fc" },
  ].filter(r => r.value > 0).sort((a, b) => b.value - a.value);

  if (cfLoading || cfPurchasesLoading || cfExpensesLoading) return (
    <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
      <RefreshCw className="h-4 w-4 animate-spin" /><span className="text-sm">Loading cash flow data…</span>
    </div>
  );

  // Surface data-fetch errors prominently — a silent failure here means outflow is
  // understated and Net Cash Flow is inflated, which is a financial correctness issue.
  const fetchErrors = [cfPurchasesError, cfExpensesError].filter(Boolean);

  return (
    <div className="space-y-6">
      {fetchErrors.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/8 px-4 py-3 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-amber-300 mb-0.5">Cash flow data incomplete</p>
            {fetchErrors.map((e, i) => (
              <p key={i} className="text-xs text-amber-400/80">{e}</p>
            ))}
            <p className="text-xs text-muted-foreground mt-1">Outflow totals and Net Cash Flow may be understated. Check the browser console for details.</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium mb-0.5">Cash Flow Statement</p>
          {allMonths.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {MONTH_NAMES[parseInt(allMonths[0].split("-")[1]) - 1]} {allMonths[0].split("-")[0]}
              {allMonths.length > 1 && ` – ${MONTH_NAMES[parseInt(allMonths[allMonths.length-1].split("-")[1]) - 1]} ${allMonths[allMonths.length-1].split("-")[0]}`}
            </p>
          )}
          {engine && !engineLoading && (
            <div style={{ marginTop: "8px" }}>
              <EngineHealthBadges engine={engine} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-muted/40 rounded-lg p-0.5 border border-border/50">
            {(["monthly", "cumulative"] as const).map(v => (
              <button key={v} onClick={() => setViewMode(v)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {v === "monthly" ? "Monthly" : "Cumulative"}
              </button>
            ))}
          </div>
          <DateFilter value={period} onChange={setPeriod} />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {([
          { label: "Cash Inflow",    value: fmt(totalIn),                                           sub: `${filtPayments.length} payments from customers`,          accent: "#4ade80", glow: "rgba(74,222,128,0.12)",   icon: "↑", highlight: false },
          { label: "Cash Outflow",   value: fmt(totalOut),                                          sub: `${allTransactions.filter(t=>t.type==="out").length} purchases & expenses`, accent: "#f87171", glow: "rgba(248,113,113,0.12)", icon: "↓", highlight: false },
          { label: "Net Cash Flow",  value: (isPositive ? "+" : "−") + fmt(Math.abs(netCashFlow)), sub: isPositive ? "Positive · healthy" : "Negative · review spend", accent: isPositive ? "#4ade80" : "#f87171", glow: isPositive ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)", icon: "◆", highlight: true },
          { label: "Running Balance", value: (isPositive ? "+" : "−") + fmt(Math.abs(netCashFlow)), sub: "Inflow minus all outflows",  accent: "#818cf8", glow: "rgba(129,140,248,0.12)",  icon: "◎", highlight: false },
        ] as const).map((kpi, i) => (
          <div key={i} className="relative rounded-xl p-4 border overflow-hidden"
            style={{ background: "linear-gradient(135deg,hsl(var(--card)) 0%,hsl(var(--muted)/0.3) 100%)", borderColor: kpi.highlight ? kpi.accent + "40" : "hsl(var(--border))", boxShadow: kpi.highlight ? `0 0 24px ${kpi.glow},0 1px 3px rgba(0,0,0,0.2)` : "0 1px 3px rgba(0,0,0,0.1)" }}>
            <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full opacity-20 blur-xl" style={{ background: kpi.accent }} />
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center justify-between">{kpi.label}<span style={{ color: kpi.accent }}>{kpi.icon}</span></p>
            <p className="text-2xl font-bold tracking-tight" style={{ color: kpi.highlight ? kpi.accent : "hsl(var(--foreground))" }}>{kpi.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>
          </div>
        ))}
      </div>

      <Card className="p-5 rounded-xl border-border/60">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-sm font-semibold">{viewMode === "monthly" ? "Monthly Cash Flow" : "Cumulative Cash Position"}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{viewMode === "monthly" ? "Inflow vs outflow — all sources included" : "Running cash balance over time"}</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-400 inline-block" /> Inflow</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block" /> Outflow</span>
            {viewMode === "monthly" && <span className="flex items-center gap-1.5"><span className="inline-block w-5 border-t-2 border-dashed border-indigo-400" /> Net</span>}
          </div>
        </div>
        {monthlyCFwithCumulative.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No data for selected period</div>
        ) : viewMode === "monthly" ? (
          <div className="relative" onMouseLeave={() => setTooltip(null)}>
            <div className="flex">
              <div className="w-14 flex flex-col justify-between text-right pr-2 pb-6" style={{ height: 220 }}>
                {[1,0.75,0.5,0.25,0].map(pct => <span key={pct} className="text-muted-foreground tabular-nums" style={{ fontSize:10 }}>{pct===0?"0":"₹"+Math.round(maxBar*pct/1000)+"k"}</span>)}
              </div>
              <div className="flex-1 relative" style={{ height: 220 }}>
                <div className="absolute inset-x-0 top-0 bottom-6">
                  {[0,0.25,0.5,0.75,1].map(pct => <div key={pct} className="absolute left-0 right-0 border-t border-border/25" style={{ top:`${(1-pct)*100}%` }} />)}
                  <div className="absolute inset-0 flex items-end gap-1 px-1">
                    {monthlyCFwithCumulative.map((row, i) => (
                      <div key={row.ym} className="flex-1 flex items-end gap-0.5 relative group cursor-pointer" style={{ height:"100%" }}
                        onMouseEnter={() => setTooltip({ idx:i, data:row })}>
                        <div className="flex-1 rounded-t-sm transition-all group-hover:brightness-125" style={{ height:`${(row.inflow/maxBar)*100}%`, background:"linear-gradient(180deg,#4ade80,#16a34a)", minHeight:row.inflow>0?2:0 }} />
                        <div className="flex-1 rounded-t-sm transition-all group-hover:brightness-125" style={{ height:`${(row.outflow/maxBar)*100}%`, background:"linear-gradient(180deg,#f87171,#dc2626)", minHeight:row.outflow>0?2:0 }} />
                        {tooltip?.idx===i && (
                          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none" style={{ minWidth:148 }}>
                            <div className="rounded-lg border border-border/80 shadow-xl text-xs p-2.5" style={{ background:"hsl(var(--popover))" }}>
                              <p className="font-semibold text-foreground mb-1.5">{row.label}</p>
                              <p className="text-green-400 flex justify-between gap-3"><span>In</span><span className="font-mono">{fmt(row.inflow)}</span></p>
                              <p className="text-red-400 flex justify-between gap-3"><span>Out</span><span className="font-mono">{fmt(row.outflow)}</span></p>
                              <p className={`flex justify-between gap-3 font-semibold border-t border-border/50 pt-1.5 mt-1.5 ${row.net>=0?"text-green-400":"text-red-400"}`}>
                                <span>Net</span><span className="font-mono">{row.net>=0?"+":"−"}{fmt(Math.abs(row.net))}</span>
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {monthlyCFwithCumulative.length>1 && (() => {
                    const VW=1000, VH=100;
                    const w=VW/monthlyCFwithCumulative.length;
                    const pts=monthlyCFwithCumulative.map((r,i)=>{const c=Math.min(Math.max(r.net,-maxBar),maxBar);const y=((maxBar-c)/(2*maxBar))*VH;return `${(i+0.5)*w},${y}`;}).join(" ");
                    return (<svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" style={{ overflow:"visible" }}>
                      <polyline points={pts} fill="none" stroke="#818cf8" strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" strokeLinejoin="round" opacity="0.75" vectorEffect="non-scaling-stroke" />
                      {monthlyCFwithCumulative.map((r,i)=>{const c=Math.min(Math.max(r.net,-maxBar),maxBar);const y=((maxBar-c)/(2*maxBar))*VH;return <circle key={i} cx={(i+0.5)*w} cy={y} r="1" fill={r.net>=0?"#4ade80":"#f87171"} stroke="hsl(var(--card))" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />;})}
                    </svg>);
                  })()}
                </div>
                <div className="absolute bottom-0 left-0 right-0 flex gap-1 px-1" style={{ height:24 }}>
                  {monthlyCFwithCumulative.map(row => <div key={row.ym} className="flex-1 text-center text-muted-foreground" style={{ fontSize:10 }}>{row.label}</div>)}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="relative">
            <div className="flex">
              <div className="w-14 flex flex-col justify-between text-right pr-2 pb-6" style={{ height:220 }}>
                {[1,0.75,0.5,0.25,0].map((pct,i)=>{const vals=monthlyCFwithCumulative.map(r=>r.cumulative);const minV=Math.min(...vals,0),maxV=Math.max(...vals,1);const val=minV+(maxV-minV)*pct;return <span key={i} className="text-muted-foreground tabular-nums" style={{ fontSize:10 }}>{Math.abs(val)>=1000?(val<0?"−":"")+"₹"+Math.round(Math.abs(val)/1000)+"k":"₹0"}</span>;})}
              </div>
              <div className="flex-1 relative" style={{ height:220 }}>
                <div className="absolute inset-x-0 top-0 bottom-6">
                  {[0,0.25,0.5,0.75,1].map(pct=><div key={pct} className="absolute left-0 right-0 border-t border-border/25" style={{ top:`${(1-pct)*100}%` }} />)}
                  {(()=>{const VW=1000,VH=100;const vals=monthlyCFwithCumulative.map(r=>r.cumulative);const minV=Math.min(...vals,0),maxV=Math.max(...vals,1);const range=maxV-minV||1;const toY=(v:number)=>((maxV-v)/range)*VH;const w=VW/monthlyCFwithCumulative.length;const pts=monthlyCFwithCumulative.map((r,i)=>`${(i+0.5)*w},${toY(r.cumulative)}`).join(" ");const fillPts=[`${0.5*w},${VH}`,...monthlyCFwithCumulative.map((r,i)=>`${(i+0.5)*w},${toY(r.cumulative)}`),`${(monthlyCFwithCumulative.length-0.5)*w},${VH}`].join(" ");const lastVal=monthlyCFwithCumulative[monthlyCFwithCumulative.length-1]?.cumulative??0;const lc=lastVal>=0?"#4ade80":"#f87171";return(<svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" style={{ overflow:"visible" }}><defs><linearGradient id="cfCumGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={lc} stopOpacity="0.22"/><stop offset="100%" stopColor={lc} stopOpacity="0.02"/></linearGradient></defs><polygon points={fillPts} fill="url(#cfCumGrad)"/><polyline points={pts} fill="none" stroke={lc} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>{monthlyCFwithCumulative.map((r,i)=><circle key={i} cx={(i+0.5)*w} cy={toY(r.cumulative)} r="1.2" fill={r.cumulative>=0?"#4ade80":"#f87171"} stroke="hsl(var(--card))" strokeWidth="0.5" vectorEffect="non-scaling-stroke"/>)}</svg>);})()}
                </div>
                <div className="absolute bottom-0 left-0 right-0 flex gap-1 px-1" style={{ height:24 }}>
                  {monthlyCFwithCumulative.map(row=><div key={row.ym} className="flex-1 text-center text-muted-foreground" style={{ fontSize:10 }}>{row.label}</div>)}
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <Card className="lg:col-span-3 p-0 overflow-hidden rounded-xl border-border/60">
          <div className="px-5 py-3.5 border-b border-border/60 flex items-center justify-between">
            <div><p className="text-sm font-semibold">All Transactions</p><p className="text-xs text-muted-foreground mt-0.5">{allTransactions.length} records in period</p></div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-400" /> In</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400" /> Out</span>
            </div>
          </div>
          <div className="overflow-auto" style={{ maxHeight:400 }}>
            <table className="w-full text-sm">
              <thead><tr className="bg-muted/50 border-b border-border/60 sticky top-0 z-10">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Description</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Category</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground hidden sm:table-cell">Method</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Amount</th>
              </tr></thead>
              <tbody>
                {allTransactions.map((tx, i) => (
                  <tr key={i} className="border-t border-border/40 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{tx.date?new Date(tx.date).toLocaleDateString("en-IN",{day:"numeric",month:"short"}):"—"}</td>
                    <td className="px-4 py-2.5 text-xs font-medium max-w-[120px] truncate">{tx.desc}</td>
                    <td className="px-4 py-2.5"><span className="text-xs px-2 py-0.5 rounded-full" style={{ background:tx.type==="in"?"rgba(74,222,128,0.1)":"rgba(248,113,113,0.08)", color:tx.type==="in"?"#4ade80":"#fca5a5", border:`1px solid ${tx.type==="in"?"rgba(74,222,128,0.2)":"rgba(248,113,113,0.15)"}` }}>{tx.category}</span></td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground hidden sm:table-cell">{tx.method}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-xs font-semibold" style={{ color:tx.type==="in"?"#4ade80":"#f87171" }}>{tx.type==="in"?"+":"−"}{fmt(tx.amount)}</td>
                  </tr>
                ))}
                {allTransactions.length===0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-muted-foreground">No transactions in selected period</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-border/60 bg-muted/20 flex justify-between text-xs">
            <span className="text-muted-foreground">Net for period</span>
            <span className={`font-bold tabular-nums ${isPositive?"text-green-400":"text-red-400"}`}>{isPositive?"+":"−"}{fmt(Math.abs(netCashFlow))}</span>
          </div>
        </Card>

        <Card className="lg:col-span-2 p-5 rounded-xl border-border/60">
          <p className="text-sm font-semibold mb-0.5">Where Money Is Going</p>
          <p className="text-xs text-muted-foreground mb-4">Outflow by category · {fmt(totalOut)} total</p>
          <div className="space-y-4">
            {categoryRows.map(cat => {
              const pct = totalOut>0?(cat.value/totalOut)*100:0;
              return (<div key={cat.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium flex items-center gap-2"><span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background:cat.color }} />{cat.label}</span>
                  <div className="flex items-center gap-2 text-xs tabular-nums"><span className="text-muted-foreground">{pct.toFixed(1)}%</span><span className="font-semibold" style={{ color:cat.color }}>{fmt(cat.value)}</span></div>
                </div>
                <div className="w-full bg-muted/30 rounded-full h-1.5 overflow-hidden">
                  <div className="h-1.5 rounded-full transition-all duration-500" style={{ width:`${pct}%`, background:`linear-gradient(90deg,${cat.color}99,${cat.color})` }} />
                </div>
              </div>);
            })}
          </div>
          <div className="mt-6 pt-4 border-t border-border/50">
            <p className="text-xs text-muted-foreground mb-3">Inflow vs Outflow</p>
            <div className="flex rounded-full overflow-hidden h-3">
              <div className="h-full transition-all duration-700" style={{ width:totalIn+totalOut>0?`${(totalIn/(totalIn+totalOut))*100}%`:"50%", background:"linear-gradient(90deg,#16a34a,#4ade80)" }} />
              <div className="h-full transition-all duration-700" style={{ width:totalIn+totalOut>0?`${(totalOut/(totalIn+totalOut))*100}%`:"50%", background:"linear-gradient(90deg,#dc2626,#f87171)" }} />
            </div>
            <div className="flex justify-between text-xs mt-2">
              <span className="text-green-400 tabular-nums">{fmt(totalIn)}</span>
              <span className="text-red-400 tabular-nums">{fmt(totalOut)}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// PAGE_META + MAIN
// ══════════════════════════════════════════════════════════════
const PAGE_META = {
  "/reports":           { title: "Reports",       icon: BarChart3,      section: "overview" },
  "/reports/sales":     { title: "Sales",         icon: TrendingUp,     section: "sales" },
  "/reports/purchases": { title: "Purchases",     icon: ShoppingBag,    section: "purchases" },
  "/reports/expenses":  { title: "Expenses",      icon: DollarSign,     section: "expenses" },
  "/reports/pnl":       { title: "Profit & Loss", icon: BarChart3,      section: "pnl" },
  "/reports/cashflow":  { title: "Cash Flow",     icon: ArrowLeftRight, section: "cashflow" },
} as const;

const Reports = () => {
  const { pathname } = useLocation();
  const meta = PAGE_META[pathname as keyof typeof PAGE_META] ?? PAGE_META["/reports/sales"];
  const Icon = meta.icon;

  // Overview: redirect feel — just show sales by default
  const activeSection = meta.section === "overview" ? "sales" : meta.section;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-bold text-foreground">{meta.title}</h2>
      </div>

      {(activeSection === "sales")     && <SalesReport />}
      {activeSection === "purchases"   && <PurchasesReport />}
      {activeSection === "expenses"    && <ExpensesReport />}
      {activeSection === "pnl"         && <PnLReport />}
      {activeSection === "cashflow"    && <CashFlowReport />}
    </div>
  );
};

export default Reports;
