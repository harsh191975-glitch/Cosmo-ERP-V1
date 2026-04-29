import { useMemo, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { runEnterpriseEngine } from "@/engine/financialEngine";
import {
  getAllPayments,
  buildInvoicesWithPayments,
  EnrichedInvoice,
  Payment,
} from "@/data/invoiceStore";
import { getPurchases } from "@/data/purchaseStore";
import { getExpenses, sumByCategory, ExpenseRow } from "@/data/expenseStore";
import {
  IndianRupee, TrendingUp, AlertCircle, CheckCircle,
  Clock, ArrowRight, RefreshCw, ArrowUpRight, Zap,
  BarChart3, Activity,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

// ── Types ───────────────────────────────────────────────────────
// ExpenseRow imported from @/data/expenseStore — single source of truth.

interface Purchase {
  total_amount: number;   // matches Supabase column — purchaseStore returns this field
  purchase_date: string;  // "YYYY-MM-DD"
  [key: string]: unknown;
}

// ── Formatters ──────────────────────────────────────────────────
const fmt  = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const fmt2 = (n: number) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtL = (n: number) => {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
  if (n >= 100000)   return `₹${(n / 100000).toFixed(2)}L`;
  if (n >= 1000)     return `₹${(n / 1000).toFixed(1)}K`;
  return fmt(n);
};

// ── Status Badge ────────────────────────────────────────────────
const StatusBadge = ({ status }: { status: string }) => {
  const cfg: Record<string, string> = {
    Paid:    "bg-emerald-500/15 text-emerald-400 ring-emerald-500/25",
    Partial: "bg-amber-500/15 text-amber-400 ring-amber-500/25",
    Overdue: "bg-red-500/15 text-red-400 ring-red-500/25",
    Pending: "bg-sky-500/15 text-sky-400 ring-sky-500/25",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full ring-1 font-semibold tracking-wide uppercase ${cfg[status] ?? cfg.Pending}`}>
      {status}
    </span>
  );
};

// ── Custom Tooltip ──────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const revenue   = payload.find((p: any) => p.dataKey === "revenue")?.value ?? 0;
  const collected = payload.find((p: any) => p.dataKey === "collected")?.value ?? 0;
  const gap       = revenue - collected;
  return (
    <div style={{
      background: "rgba(10,14,23,0.96)",
      border: "1px solid rgba(99,102,241,0.25)",
      borderRadius: 12,
      padding: "12px 16px",
      boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
      minWidth: 180,
    }}>
      <p style={{ color: "#94a3b8", fontSize: 11, marginBottom: 8, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 24 }}>
          <span style={{ color: "#60a5fa", fontSize: 12 }}>Invoiced</span>
          <span style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt2(revenue)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 24 }}>
          <span style={{ color: "#34d399", fontSize: 12 }}>Collected</span>
          <span style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt2(collected)}</span>
        </div>
        {gap > 0 && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", marginTop: 4, paddingTop: 6, display: "flex", justifyContent: "space-between", gap: 24 }}>
            <span style={{ color: "#f87171", fontSize: 12 }}>Gap</span>
            <span style={{ color: "#f87171", fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt2(gap)}</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Section Header ──────────────────────────────────────────────
const SectionLabel = ({ icon: Icon, label, accent }: { icon: any; label: string; accent: string }) => (
  <div className="flex items-center gap-2.5 mb-4">
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 28, height: 28, borderRadius: 8,
      background: `${accent}18`, border: `1px solid ${accent}30`,
    }}>
      <Icon size={13} style={{ color: accent }} />
    </span>
    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#64748b" }}>
      {label}
    </span>
  </div>
);

// ── Main Dashboard ──────────────────────────────────────────────
const Index = () => {
  const navigate = useNavigate();

  // ── State ────────────────────────────────────────────────────
  const [invoicesWithPayments, setInvoicesWithPayments] = useState<EnrichedInvoice[]>([]);
  const [payments,             setPayments]             = useState<Payment[]>([]);
  const [expenses,             setExpenses]             = useState<ExpenseRow[]>([]);
  const [purchases,            setPurchases]            = useState<Purchase[]>([]);

  const [loadingInvoices,  setLoadingInvoices]  = useState(true);
  const [loadingExpenses,  setLoadingExpenses]  = useState(true);
  const [loadingPurchases, setLoadingPurchases] = useState(true);

  // ── Engine state ─────────────────────────────────────────────
  type EngineResult = Awaited<ReturnType<typeof runEnterpriseEngine>>;
  const [engine,        setEngine]        = useState<EngineResult | null>(null);
  const [loadingEngine, setLoadingEngine] = useState(true);

  // ── Data fetchers ────────────────────────────────────────────
  const fetchInvoiceData = useCallback(async () => {
    setLoadingInvoices(true);
    try {
      const [enriched, allPayments] = await Promise.all([
        buildInvoicesWithPayments(),
        getAllPayments(),
      ]);
      setInvoicesWithPayments(enriched);
      setPayments(allPayments);
    } catch (err) {
      console.error("[Index] fetchInvoiceData failed:", err);
    } finally {
      setLoadingInvoices(false);
    }
  }, []);

  const fetchExpenses = useCallback(async () => {
    setLoadingExpenses(true);
    try {
      const data = await getExpenses();
      setExpenses(data ?? []);
    } catch (err) {
      console.error("[Index] fetchExpenses failed:", err);
      setExpenses([]);
    } finally {
      setLoadingExpenses(false);
    }
  }, []);

  const fetchPurchases = useCallback(async () => {
    setLoadingPurchases(true);
    try {
      const data = await getPurchases();
      setPurchases(data ?? []);
    } catch (err) {
      console.error("[Index] fetchPurchases failed:", err);
      setPurchases([]);
    } finally {
      setLoadingPurchases(false);
    }
  }, []);

  const fetchEngine = useCallback(async () => {
    setLoadingEngine(true);
    try {
      const result = await runEnterpriseEngine("all", "dashboard");
      setEngine(result);
    } catch (err) {
      console.error("[Index] runEnterpriseEngine failed:", err);
    } finally {
      setLoadingEngine(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoiceData();
    fetchExpenses();
    fetchPurchases();
    fetchEngine();
  }, [fetchInvoiceData, fetchExpenses, fetchPurchases, fetchEngine]);

  // ── Expense KPIs — 100% from Supabase expense store ─────────
  // sumByCategory is imported from expenseStore — no local reimplementation.
  const totalSalaries   = sumByCategory(expenses, "Salaries");
  const totalCommission = sumByCategory(expenses, "Commission");
  const totalRoyalty    = sumByCategory(expenses, "Royalty");
  const totalUtilities  = sumByCategory(expenses, "Utilities");
  const totalFreight    = sumByCategory(expenses, "Freight");

  const totalExpenses = totalSalaries + totalCommission + totalRoyalty + totalUtilities + totalFreight;

  // ── Purchase KPIs — 100% from Supabase purchase store ───────
  const totalPurchases = purchases.reduce((s, p) => s + (Number(p.total_amount) || 0), 0);

  // ── Revenue KPIs ─────────────────────────────────────────────
  // ENGINE is source of truth for: Amount Collected (cash.inflow) and Net Profit (accrual.netProfit).
  // Store-derived values used for: Net Revenue, Outstanding — because:
  //   - Net Revenue: engine.accrual.revenue is taxable-only (pre-GST). Dashboard shows
  //     gross invoiced total (totalAmount incl. GST+freight) per original display convention.
  //   - Outstanding: store per-invoice Math.max(0,...) is more accurate than AR journal balance
  //     which has minor rounding drift across 42 invoices.
  const grossRevenue     = invoicesWithPayments.reduce((s, d) => s + d.totalAmount,      0);
  const creditNotesTotal = invoicesWithPayments.reduce((s, d) => s + d.totalCreditNotes, 0);

  // STORE: gross invoiced total − credit notes (incl. GST + freight)
  const netRevenue       = grossRevenue - creditNotesTotal;
  // ENGINE: cash inflow — double-entry validated, correct source for collected amount
  const totalCollected   = engine ? engine.metrics.cash.inflow : invoicesWithPayments.reduce((s, d) => s + d.totalPaid, 0);
  // STORE: per-invoice outstanding sum — avoids AR journal rounding drift
  const totalOutstanding = invoicesWithPayments.reduce((s, d) => s + d.outstanding, 0);
  // ENGINE: accrual net profit — single source of truth, matches P&L exactly.
  // Uses taxable revenue (net of CNs), taxable COGS (excl. GST input credit), validated OPEX.
  // Falls back to cash-minus-costs only while engine is loading.
  const netProfit = (engine && !loadingEngine)
    ? engine.metrics.accrual.netProfit
    : totalCollected - totalPurchases - totalExpenses;

  const collectionRate = netRevenue > 0 ? (totalCollected / netRevenue) * 100 : 0;

  const paidCount    = invoicesWithPayments.filter(d => d.status === "Paid").length;
  const partialCount = invoicesWithPayments.filter(d => d.status === "Partial").length;
  const pendingCount = invoicesWithPayments.filter(d => d.status === "Pending").length;
  const overdueCount = invoicesWithPayments.filter(d => d.status === "Overdue").length;

  const growthPct = useMemo(() => {
    const months = [...new Set(invoicesWithPayments.map(d => d.invoiceDate.slice(0, 7)))].sort();
    if (months.length >= 2) {
      const last    = months[months.length - 1];
      const prev    = months[months.length - 2];
      const lastRev = invoicesWithPayments.filter(d => d.invoiceDate.startsWith(last)).reduce((s, d) => s + d.totalAmount, 0);
      const prevRev = invoicesWithPayments.filter(d => d.invoiceDate.startsWith(prev)).reduce((s, d) => s + d.totalAmount, 0);
      return prevRev === 0 ? 0 : ((lastRev - prevRev) / prevRev) * 100;
    }
    return 0;
  }, [invoicesWithPayments]);
  const monthlyChart = useMemo(() => {
    const revenueMap: Record<string, number> = {};
    invoicesWithPayments.forEach(d => {
      const m = d.invoiceDate.slice(0, 7);
      revenueMap[m] = (revenueMap[m] || 0) + d.totalAmount;
    });
    const collectedMap: Record<string, number> = {};
    payments.forEach(p => {
      const m = p.paymentDate.slice(0, 7);
      collectedMap[m] = (collectedMap[m] || 0) + p.amountPaid;
    });
    const months = [...new Set([...Object.keys(revenueMap), ...Object.keys(collectedMap)])].sort();
    return months.map(m => ({
      month:     new Date(m + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      revenue:   revenueMap[m]   ?? 0,
      collected: collectedMap[m] ?? 0,
    }));
  }, [invoicesWithPayments, payments]);

  // ── Expense breakdown ────────────────────────────────────────
  const expenseBreakdown = [
    { label: "Salaries",   value: totalSalaries,   color: "#34d399" },
    { label: "Commission", value: totalCommission,  color: "#22d3ee" },
    { label: "Royalty",    value: totalRoyalty,     color: "#f59e0b" },
    { label: "Utilities",  value: totalUtilities,   color: "#60a5fa" },
    { label: "Freight",    value: totalFreight,     color: "#a78bfa" },
  ];

  // ── Top outstanding ──────────────────────────────────────────
  const topOutstanding = useMemo(() =>
    [...invoicesWithPayments]
      .filter(d => d.outstanding > 0)
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 7),
  [invoicesWithPayments]);

  // ── Recent payments + invoices ───────────────────────────────
  const recentPayments = useMemo(() =>
    [...payments]
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
      .slice(0, 6),
  [payments]);

  const recentInvoices = useMemo(() =>
    [...invoicesWithPayments]
      .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate))
      .slice(0, 5),
  [invoicesWithPayments]);

  // ── Styles ───────────────────────────────────────────────────
  const card = {
    background: "rgba(15,20,35,0.7)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 16,
    backdropFilter: "blur(12px)",
  } as React.CSSProperties;

  const isLoading = loadingInvoices || loadingExpenses || loadingPurchases || loadingEngine;

  // ── Loading skeleton ─────────────────────────────────────────
  if (isLoading) {
    return (
      <div style={{ padding: "24px 24px 40px", fontFamily: "'DM Sans', 'Plus Jakarta Sans', system-ui, sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.02em", margin: 0 }}>
              Business Overview
            </h1>
            <p style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>
              {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "24px 0" }}>
          {[
            !loadingInvoices  && "✓ Invoices & payments",
            !loadingExpenses  && "✓ Expenses",
            !loadingPurchases && "✓ Purchases",
            !loadingEngine    && "✓ Financial engine",
          ].filter(Boolean).map(msg => (
            <p key={String(msg)} style={{ fontSize: 12, color: "#34d399", margin: 0 }}>{String(msg)}</p>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#475569", fontSize: 14, marginTop: 8 }}>
            <RefreshCw size={18} style={{ animation: "spin 1s linear infinite" }} />
            Loading dashboard…
          </div>
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{
      padding: "24px 24px 40px",
      fontFamily: "'DM Sans', 'Plus Jakarta Sans', system-ui, sans-serif",
      position: "relative",
      overflow: "hidden",
    }}>

      {/* ── Ambient glow ── */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
        background: `
          radial-gradient(ellipse 70% 50% at 20% 10%, rgba(99,102,241,0.05) 0%, transparent 65%),
          radial-gradient(ellipse 60% 40% at 80% 80%, rgba(16,185,129,0.04) 0%, transparent 65%)
        `,
      }} />

      <div style={{ position: "relative", zIndex: 1 }}>

        {/* ── Page header ─────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.02em", margin: 0 }}>
              Business Overview
            </h1>
            <p style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>
              {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>

            {/* ── Engine health indicators ── */}
            {engine && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                {/* Status pill */}
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                  padding: "3px 8px", borderRadius: 6,
                  background: engine.status === "SUCCESS" ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)",
                  color:      engine.status === "SUCCESS" ? "#34d399"               : "#f87171",
                  border:     `1px solid ${engine.status === "SUCCESS" ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.25)"}`,
                  textTransform: "uppercase",
                }}>
                  {engine.status === "SUCCESS" ? "✓ Engine OK" : "⚠ Engine " + engine.status}
                </span>

                {/* DQS score */}
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
                  padding: "3px 8px", borderRadius: 6,
                  background: engine.dqs >= 98 ? "rgba(99,102,241,0.10)" : "rgba(245,158,11,0.10)",
                  color:      engine.dqs >= 98 ? "#818cf8"                : "#f59e0b",
                  border:     `1px solid ${engine.dqs >= 98 ? "rgba(99,102,241,0.20)" : "rgba(245,158,11,0.20)"}`,
                }}>
                  DQS {engine.dqs.toFixed(1)}%
                </span>

                {/* Trial balance */}
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
                  padding: "3px 8px", borderRadius: 6,
                  background: engine.metrics.trialBalance.isBalanced ? "rgba(52,211,153,0.08)" : "rgba(248,113,113,0.12)",
                  color:      engine.metrics.trialBalance.isBalanced ? "#6ee7b7"               : "#f87171",
                  border:     `1px solid ${engine.metrics.trialBalance.isBalanced ? "rgba(52,211,153,0.18)" : "rgba(248,113,113,0.25)"}`,
                }}>
                  {engine.metrics.trialBalance.isBalanced ? "✓ Balanced" : "⚠ Ledger Drift"}
                </span>
              </div>
            )}
          </div>
          <button
            onClick={() => navigate("/invoices/create")}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "9px 18px", borderRadius: 10,
              background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
              border: "none", color: "#fff", fontSize: 13, fontWeight: 600,
              cursor: "pointer", boxShadow: "0 4px 20px rgba(99,102,241,0.35)",
              transition: "all 150ms ease",
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-1px)")}
            onMouseLeave={e => (e.currentTarget.style.transform = "translateY(0)")}
          >
            <Zap size={14} />
            New Invoice
          </button>
        </div>

        {/* ═══════════════════════════════════════════════════
            LAYER 1 — MONEY (Primary KPI Strip)
        ════════════════════════════════════════════════════ */}
        <SectionLabel icon={IndianRupee} label="Money" accent="#6366f1" />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, marginBottom: 36 }}>

          {/* Net Revenue */}
          <KpiTile
            label="Net Revenue"
            value={fmtL(netRevenue)}
            sub={creditNotesTotal > 0
              ? `${invoicesWithPayments.length} invoices · −${fmtL(creditNotesTotal)} credit notes`
              : `${invoicesWithPayments.length} invoices`}
            accent="#60a5fa"
            icon={<TrendingUp size={16} color="#60a5fa" />}
            glow="rgba(96,165,250,0.12)"
          />

          {/* Amount Collected */}
          <KpiTile
            label="Amount Collected"
            value={fmtL(totalCollected)}
            sub={`${collectionRate.toFixed(1)}% collection rate`}
            accent="#34d399"
            icon={<CheckCircle size={16} color="#34d399" />}
            glow="rgba(52,211,153,0.12)"
          />

          {/* Outstanding */}
          <KpiTile
            label="Outstanding"
            value={fmtL(totalOutstanding)}
            sub={overdueCount > 0 ? `⚠ ${overdueCount} overdue invoices` : `${partialCount + pendingCount} unpaid`}
            accent={totalOutstanding > netRevenue * 0.3 ? "#f87171" : "#f59e0b"}
            icon={<AlertCircle size={16} color={totalOutstanding > netRevenue * 0.3 ? "#f87171" : "#f59e0b"} />}
            glow={totalOutstanding > netRevenue * 0.3 ? "rgba(248,113,113,0.12)" : "rgba(245,158,11,0.12)"}
            urgent={totalOutstanding > netRevenue * 0.3}
          />

          {/* Net Profit */}
          <KpiTile
            label="Net Profit"
            value={fmtL(Math.abs(netProfit))}
            sub={netProfit >= 0 ? "After expenses & purchases (accrual)" : "Currently at a loss"}
            accent={netProfit >= 0 ? "#34d399" : "#f87171"}
            icon={<BarChart3 size={16} color={netProfit >= 0 ? "#34d399" : "#f87171"} />}
            glow={netProfit >= 0 ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)"}
            negative={netProfit < 0}
          />

          {/* Collection Rate */}
          <CollectionRateTile rate={collectionRate} />
        </div>

        {/* ═══════════════════════════════════════════════════
            LAYER 2 — CASH FLOW REALITY (Hero Chart)
        ════════════════════════════════════════════════════ */}
        <SectionLabel icon={Activity} label="Cash Flow Reality" accent="#34d399" />

        <div style={{ ...card, padding: "24px 24px 12px", marginBottom: 36 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0", margin: 0 }}>Revenue vs Collected</h2>
              <p style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>Monthly · Is revenue converting into cash?</p>
            </div>
            <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ width: 28, height: 3, borderRadius: 2, background: "#60a5fa" }} />
                <span style={{ fontSize: 12, color: "#94a3b8" }}>Invoiced</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ width: 28, height: 3, borderRadius: 2, background: "#34d399" }} />
                <span style={{ fontSize: 12, color: "#94a3b8" }}>Collected</span>
              </div>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={monthlyChart} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#60a5fa" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.01} />
                </linearGradient>
                <linearGradient id="colGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#34d399" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#34d399" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: "#475569" }}
                axisLine={false} tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#475569" }}
                axisLine={false} tickLine={false}
                tickFormatter={v => `₹${(v / 100000).toFixed(0)}L`}
                width={55}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone" dataKey="revenue"
                stroke="#60a5fa" strokeWidth={2.5}
                fill="url(#revGrad)" dot={false} activeDot={{ r: 5, fill: "#60a5fa" }}
              />
              <Area
                type="monotone" dataKey="collected"
                stroke="#34d399" strokeWidth={2.5}
                fill="url(#colGrad)" dot={false} activeDot={{ r: 5, fill: "#34d399" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* ═══════════════════════════════════════════════════
            LAYER 3 — RISK (Priority Action Area)
        ════════════════════════════════════════════════════ */}
        <SectionLabel icon={AlertCircle} label="Risk — Where Is My Money?" accent="#f87171" />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginBottom: 36 }}>

          {/* LEFT: Top Outstanding Customers */}
          <div style={{ ...card, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", margin: 0 }}>Top Outstanding Customers</h3>
              <button
                onClick={() => navigate("/invoices")}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  fontSize: 11, color: "#6366f1", background: "none", border: "none",
                  cursor: "pointer", fontWeight: 600, padding: 0,
                }}
              >
                View all <ArrowRight size={12} />
              </button>
            </div>

            {topOutstanding.length === 0 ? (
              <div style={{ textAlign: "center", padding: "28px 0", color: "#475569", fontSize: 13 }}>
                🎉 All invoices cleared!
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {topOutstanding.map((d, i) => (
                  <button
                    key={d.id}
                    onClick={() => navigate(`/invoices/${encodeURIComponent(d.invoiceNo)}`)}
                    style={{
                      display: "flex", alignItems: "center",
                      padding: "11px 12px", borderRadius: 10,
                      background: "transparent",
                      border: "1px solid transparent",
                      cursor: "pointer", textAlign: "left",
                      transition: "all 150ms ease",
                      width: "100%",
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)";
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.borderColor = "transparent";
                    }}
                  >
                    <span style={{
                      width: 22, height: 22, borderRadius: 6,
                      background: i < 3 ? "rgba(248,113,113,0.15)" : "rgba(255,255,255,0.05)",
                      color: i < 3 ? "#f87171" : "#64748b",
                      fontSize: 11, fontWeight: 700,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, marginRight: 12,
                    }}>{i + 1}</span>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {d.customerName}
                      </p>
                      <p style={{ fontSize: 11, color: "#475569", margin: 0, fontFamily: "monospace" }}>
                        {d.invoiceNo}
                      </p>
                    </div>

                    <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: d.status === "Overdue" ? "#f87171" : "#f59e0b", margin: 0, fontVariantNumeric: "tabular-nums" }}>
                        {fmt(d.outstanding)}
                      </p>
                      <StatusBadge status={d.status} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT: Invoice Status */}
          <div style={{ ...card, padding: 24 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", margin: "0 0 20px" }}>Invoice Status</h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { label: "Paid",    count: paidCount,    total: invoicesWithPayments.length, color: "#34d399", accent: "rgba(52,211,153,0.8)" },
                { label: "Partial", count: partialCount, total: invoicesWithPayments.length, color: "#f59e0b", accent: "rgba(245,158,11,0.8)" },
                { label: "Overdue", count: overdueCount, total: invoicesWithPayments.length, color: "#f87171", accent: "rgba(248,113,113,0.8)" },
                { label: "Pending", count: pendingCount, total: invoicesWithPayments.length, color: "#60a5fa", accent: "rgba(96,165,250,0.8)" },
              ].map(({ label, count, total, color, accent }) => {
                const pct = total > 0 ? (count / total) * 100 : 0;
                return (
                  <div key={label}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "block", flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>{label}</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", fontVariantNumeric: "tabular-nums" }}>
                        {count} <span style={{ fontSize: 11, color: "#475569", fontWeight: 400 }}>/ {total}</span>
                      </span>
                    </div>
                    <div style={{ height: 6, borderRadius: 4, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                      <div style={{
                        height: "100%", borderRadius: 4,
                        width: `${pct}%`, background: accent,
                        transition: "width 600ms ease",
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Collection rate summary */}
            <div style={{
              marginTop: 24, padding: "16px", borderRadius: 12,
              background: "rgba(99,102,241,0.08)",
              border: "1px solid rgba(99,102,241,0.15)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>Collection Rate</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: collectionRate >= 80 ? "#34d399" : "#f59e0b", fontVariantNumeric: "tabular-nums" }}>
                  {collectionRate.toFixed(1)}%
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 4, background: "rgba(255,255,255,0.06)" }}>
                <div style={{
                  height: "100%", borderRadius: 4,
                  width: `${Math.min(collectionRate, 100)}%`,
                  background: collectionRate >= 80
                    ? "linear-gradient(90deg, #34d399, #10b981)"
                    : "linear-gradient(90deg, #f59e0b, #f97316)",
                  transition: "width 600ms ease",
                }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                <span style={{ fontSize: 11, color: "#34d399" }}>{fmtL(totalCollected)} collected</span>
                <span style={{ fontSize: 11, color: "#f87171" }}>{fmtL(totalOutstanding)} pending</span>
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════
            LAYER 4 — OPERATIONS (Expense Breakdown)
        ════════════════════════════════════════════════════ */}
        <SectionLabel icon={BarChart3} label="Operations" accent="#60a5fa" />

        <div style={{ ...card, padding: 22, marginBottom: 36 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", margin: 0 }}>Expense Breakdown</h3>
              <p style={{ fontSize: 11, color: "#475569", marginTop: 3 }}>
                Total: <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{fmt(totalExpenses)}</span>
              </p>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <MiniStatBadge label="Purchases" value={fmtL(totalPurchases)} color="#a78bfa" />
              <MiniStatBadge label="Expenses"  value={fmtL(totalExpenses)}  color="#f59e0b" />
            </div>
          </div>

          {/* Stacked bar */}
          <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", marginBottom: 20, gap: 2 }}>
            {expenseBreakdown.map(e => (
              <div
                key={e.label}
                title={`${e.label}: ${fmt(e.value)} (${totalExpenses > 0 ? ((e.value / totalExpenses) * 100).toFixed(1) : 0}%)`}
                style={{
                  flex: totalExpenses > 0 ? e.value / totalExpenses : 0,
                  background: e.color,
                  borderRadius: 4,
                  minWidth: e.value > 0 ? 4 : 0,
                  transition: "flex 400ms ease",
                }}
              />
            ))}
          </div>

          {/* Category tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10 }}>
            {expenseBreakdown.map(e => (
              <div key={e.label} style={{
                padding: "14px 12px", borderRadius: 12,
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${e.color}22`,
                textAlign: "center",
              }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: e.color, margin: "0 auto 8px" }} />
                <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 6px", fontWeight: 500 }}>{e.label}</p>
                <p style={{ fontSize: 13, fontWeight: 700, color: e.color, margin: "0 0 3px", fontVariantNumeric: "tabular-nums" }}>
                  {fmtL(e.value)}
                </p>
                <p style={{ fontSize: 10, color: "#475569", margin: 0 }}>
                  {totalExpenses > 0 ? ((e.value / totalExpenses) * 100).toFixed(1) : 0}%
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════
            LAYER 5 — ACTIVITY (Bottom)
        ════════════════════════════════════════════════════ */}
        <SectionLabel icon={Clock} label="Recent Activity" accent="#94a3b8" />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>

          {/* Recent Payments */}
          <div style={{ ...card, padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", margin: 0 }}>Recent Payments</h3>
              <span style={{ fontSize: 11, color: "#475569" }}>{payments.length} total</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {recentPayments.length === 0 ? (
                <p style={{ fontSize: 12, color: "#475569", textAlign: "center", padding: "16px 0" }}>No payments recorded</p>
              ) : recentPayments.map(p => (
                <button
                  key={p.id}
                  onClick={() => navigate(`/invoices/${encodeURIComponent(p.invoiceNo)}`)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "9px 10px", borderRadius: 9,
                    background: "transparent", border: "none", cursor: "pointer",
                    textAlign: "left", width: "100%",
                    transition: "background 150ms ease",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "#cbd5e1", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>
                      {p.customerName}
                    </p>
                    <p style={{ fontSize: 10, color: "#475569", margin: 0, fontFamily: "monospace" }}>
                      {p.invoiceNo} · {new Date(p.paymentDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </p>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#34d399", flexShrink: 0, marginLeft: 8, fontVariantNumeric: "tabular-nums" }}>
                    +{fmt(p.amountPaid)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Recent Invoices */}
          <div style={{ ...card, padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", margin: 0 }}>Recent Invoices</h3>
              <button
                onClick={() => navigate("/invoices/create")}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  fontSize: 11, color: "#6366f1", background: "none", border: "none",
                  cursor: "pointer", fontWeight: 600, padding: 0,
                }}
              >
                + New <ArrowRight size={11} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {recentInvoices.map(d => (
                <button
                  key={d.id}
                  onClick={() => navigate(`/invoices/${encodeURIComponent(d.invoiceNo)}`)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "9px 10px", borderRadius: 9,
                    background: "transparent", border: "none", cursor: "pointer",
                    textAlign: "left", width: "100%",
                    transition: "background 150ms ease",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "#cbd5e1", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>
                      {d.customerName}
                    </p>
                    <p style={{ fontSize: 10, color: "#475569", margin: 0, fontFamily: "monospace" }}>
                      {d.invoiceNo} · {new Date(d.invoiceDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
                    </p>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", margin: "0 0 3px", fontVariantNumeric: "tabular-nums" }}>
                      {fmt(d.totalAmount)}
                    </p>
                    <StatusBadge status={d.status} />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* MoM Growth card */}
          <div style={{ ...card, padding: 22, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", margin: "0 0 16px" }}>Month-on-Month</h3>

            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              padding: "20px 0",
            }}>
              <div style={{
                width: 72, height: 72, borderRadius: "50%",
                background: growthPct >= 0 ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)",
                border: `2px solid ${growthPct >= 0 ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: 12,
              }}>
                <ArrowUpRight
                  size={28}
                  color={growthPct >= 0 ? "#34d399" : "#f87171"}
                  style={{ transform: growthPct < 0 ? "rotate(90deg)" : "none", transition: "transform 300ms" }}
                />
              </div>
              <p style={{ fontSize: 28, fontWeight: 800, color: growthPct >= 0 ? "#34d399" : "#f87171", margin: "0 0 4px", fontVariantNumeric: "tabular-nums" }}>
                {growthPct >= 0 ? "+" : ""}{growthPct.toFixed(1)}%
              </p>
              <p style={{ fontSize: 12, color: "#475569", margin: 0 }}>vs previous month</p>
            </div>

            <div style={{
              padding: "12px 14px", borderRadius: 10,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: "#64748b" }}>Paid invoices</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#34d399" }}>{paidCount}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: "#64748b" }}>Needs action</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: overdueCount > 0 ? "#f87171" : "#94a3b8" }}>
                  {overdueCount + partialCount + pendingCount}
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

// ── Sub-components ───────────────────────────────────────────────

interface KpiTileProps {
  label: string;
  value: string;
  sub: string;
  accent: string;
  icon: React.ReactNode;
  glow: string;
  urgent?: boolean;
  negative?: boolean;
}

const KpiTile = ({ label, value, sub, accent, icon, glow, urgent, negative }: KpiTileProps) => (
  <div
    style={{
      background: `linear-gradient(145deg, rgba(15,20,35,0.9) 0%, rgba(15,20,35,0.7) 100%)`,
      border: urgent ? `1px solid rgba(248,113,113,0.3)` : `1px solid rgba(255,255,255,0.06)`,
      borderRadius: 16,
      padding: "20px 20px 18px",
      backdropFilter: "blur(12px)",
      boxShadow: urgent ? `0 0 24px rgba(248,113,113,0.12), inset 0 1px 0 rgba(255,255,255,0.05)` : `inset 0 1px 0 rgba(255,255,255,0.04)`,
      transition: "transform 150ms ease, box-shadow 150ms ease",
      cursor: "default",
      position: "relative" as const,
      overflow: "hidden",
    }}
    onMouseEnter={e => {
      (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
      (e.currentTarget as HTMLDivElement).style.boxShadow = `0 12px 32px rgba(0,0,0,0.4), 0 0 0 1px ${accent}20`;
    }}
    onMouseLeave={e => {
      (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
      (e.currentTarget as HTMLDivElement).style.boxShadow = urgent
        ? `0 0 24px rgba(248,113,113,0.12), inset 0 1px 0 rgba(255,255,255,0.05)`
        : `inset 0 1px 0 rgba(255,255,255,0.04)`;
    }}
  >
    <div style={{
      position: "absolute", top: -20, right: -20,
      width: 80, height: 80, borderRadius: "50%",
      background: glow, filter: "blur(24px)",
      pointerEvents: "none",
    }} />

    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
      <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" as const }}>
        {label}
      </span>
      <span style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 30, height: 30, borderRadius: 9,
        background: `${accent}18`, border: `1px solid ${accent}25`,
        flexShrink: 0,
      }}>{icon}</span>
    </div>

    <p style={{
      fontSize: 22, fontWeight: 800, color: negative ? "#f87171" : "#f1f5f9",
      margin: "0 0 6px", fontVariantNumeric: "tabular-nums",
      letterSpacing: "-0.02em",
    }}>{value}</p>
    <p style={{ fontSize: 11, color: urgent ? "#f87171" : "#475569", margin: 0 }}>{sub}</p>
  </div>
);

const CollectionRateTile = ({ rate }: { rate: number }) => {
  const color = rate >= 80 ? "#34d399" : rate >= 60 ? "#f59e0b" : "#f87171";
  const circumference = 2 * Math.PI * 28;
  const offset = circumference * (1 - Math.min(rate, 100) / 100);

  return (
    <div
      style={{
        background: "linear-gradient(145deg, rgba(15,20,35,0.9) 0%, rgba(15,20,35,0.7) 100%)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 16,
        padding: "20px 20px 18px",
        backdropFilter: "blur(12px)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
        transition: "transform 150ms ease",
        display: "flex", flexDirection: "column" as const, alignItems: "center",
      }}
      onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-2px)")}
      onMouseLeave={e => (e.currentTarget.style.transform = "translateY(0)")}
    >
      <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" as const, alignSelf: "flex-start", marginBottom: 12 }}>
        Collection Rate
      </span>
      <div style={{ position: "relative", width: 72, height: 72 }}>
        <svg width={72} height={72} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={36} cy={36} r={28} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={6} />
          <circle
            cx={36} cy={36} r={28} fill="none"
            stroke={color} strokeWidth={6}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 800ms ease, stroke 300ms" }}
          />
        </svg>
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: 14, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>
            {rate.toFixed(0)}%
          </span>
        </div>
      </div>
      <p style={{ fontSize: 11, color: "#475569", margin: "10px 0 0", textAlign: "center" as const }}>of revenue collected</p>
    </div>
  );
};

const MiniStatBadge = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div style={{
    padding: "7px 12px", borderRadius: 9,
    background: `${color}10`, border: `1px solid ${color}20`,
    textAlign: "center" as const,
  }}>
    <p style={{ fontSize: 10, color: "#64748b", margin: "0 0 3px", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>{label}</p>
    <p style={{ fontSize: 13, fontWeight: 700, color, margin: 0, fontVariantNumeric: "tabular-nums" }}>{value}</p>
  </div>
);

export default Index;
