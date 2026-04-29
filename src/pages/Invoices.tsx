import React, { useMemo, useState, useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  buildInvoicesWithPayments, deleteInvoice, EnrichedInvoice,
} from "@/data/invoiceStore";
import { getTotalCreditForInvoice } from "@/data/creditNoteStore";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Search, ChevronDown, ChevronRight, SlidersHorizontal,
  FileText, Layers, FileCheck2, Eye, Upload, Plus,
  Trash2, X, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown,
  IndianRupee, Scale, TrendingUp, Clock, Package, BarChart3, Truck,
  Zap, Target, AlertOctagon, TableIcon, Sparkles,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie,
} from "recharts";

// ─────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────
const formatCurrency = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

const MONTHS = [
  { value: "01", label: "January" }, { value: "02", label: "February" },
  { value: "03", label: "March" },   { value: "04", label: "April" },
  { value: "05", label: "May" },     { value: "06", label: "June" },
  { value: "07", label: "July" },    { value: "08", label: "August" },
  { value: "09", label: "September"},{ value: "10", label: "October" },
  { value: "11", label: "November" },{ value: "12", label: "December" },
];

const PAGE_META = {
  "/invoices":            { title: "All Invoices", icon: FileText,   section: "all"        },
  "/invoices/line-items": { title: "Product Intelligence", icon: BarChart3, section: "line-items" },
  "/invoices/logistics":  { title: "E-way Bills",  icon: FileCheck2, section: "logistics"  },
} as const;

// ─────────────────────────────────────────────────────────────────
// SHARED DESIGN ATOMS
// ─────────────────────────────────────────────────────────────────

/** Premium status pill — dot + label, color-coded with glow */
const STATUS_CFG = {
  Paid:    { cls: "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30", dot: "bg-emerald-400", glow: "shadow-[0_0_10px_rgba(52,211,153,0.20)]" },
  Partial: { cls: "bg-amber-500/15  text-amber-400  ring-1 ring-amber-500/30",    dot: "bg-amber-400",  glow: "shadow-[0_0_8px_rgba(251,191,36,0.15)]" },
  Pending: { cls: "bg-sky-500/15    text-sky-400    ring-1 ring-sky-500/30",      dot: "bg-sky-400",   glow: "" },
  Overdue: { cls: "bg-red-500/15    text-red-400    ring-1 ring-red-500/30",      dot: "bg-red-400",   glow: "shadow-[0_0_10px_rgba(248,113,113,0.20)]" },
} as const;

const StatusPill = ({ status }: { status: string }) => {
  const cfg = STATUS_CFG[status as keyof typeof STATUS_CFG] ?? STATUS_CFG.Pending;
  const isOverdue = status === "Overdue";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide ${cfg.cls} ${cfg.glow} transition-all duration-200`}>
      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${cfg.dot} ${isOverdue ? "animate-pulse" : ""}`} />
      {status}
    </span>
  );
};

/** Sort icon — three-state */
const SortIcon = ({ col, sortKey, sortDir }: { col: string; sortKey: string; sortDir: "asc" | "desc" }) =>
  sortKey !== col
    ? <ArrowUpDown className="ml-1.5 h-3 w-3 inline opacity-20 group-hover:opacity-60 transition-opacity" />
    : sortDir === "asc"
      ? <ArrowUp   className="ml-1.5 h-3 w-3 inline text-primary" />
      : <ArrowDown className="ml-1.5 h-3 w-3 inline text-primary" />;

/** Premium KPI card — icon + value + label + subtext + hover lift + gradient shift */
const KpiCard = ({ label, value, sub, accent, icon: Icon, iconBg }: {
  label: string; value: string; sub?: string;
  accent?: string; icon: React.ElementType; iconBg?: string;
}) => (
  <Card className={`
    relative overflow-hidden p-5 flex items-center gap-4
    border border-border/50 bg-gradient-to-br from-card via-card to-card/80
    backdrop-blur-sm
    hover:border-primary/25 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/20
    transition-all duration-200 ease-out group cursor-default
    shadow-sm shadow-black/10
  `}>
    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.035] via-transparent to-black/[0.04] pointer-events-none" />
    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-gradient-to-br from-primary/[0.04] to-transparent pointer-events-none" />
    <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />

    <div className={`
      flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl
      ${iconBg ?? "bg-primary/10"} border border-white/8
      shadow-inner shadow-black/10
      group-hover:scale-105 transition-transform duration-200
    `}>
      <Icon className={`h-5 w-5 ${accent ?? "text-primary"}`} />
    </div>

    <div className="min-w-0">
      <p className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-lg font-bold leading-tight tabular-nums ${accent ?? "text-foreground"}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground/60 mt-0.5">{sub}</p>}
    </div>
  </Card>
);

/** Filters container — premium command-center panel */
const FiltersPanel = ({ children, hasActive, onClear }: {
  children: React.ReactNode; hasActive?: boolean; onClear?: () => void;
}) => (
  <Card className={`
    overflow-hidden border transition-all duration-200
    ${hasActive
      ? "border-primary/20 bg-gradient-to-br from-card via-card to-primary/[0.02] shadow-[0_0_0_1px_hsl(var(--primary)/0.08)] shadow-primary/5"
      : "border-border/50 bg-gradient-to-br from-card/90 to-card/70"
    }
    backdrop-blur-sm
  `}>
    {hasActive && <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/40 to-transparent" />}
    <div className={`
      flex items-center justify-between px-5 py-3 border-b
      ${hasActive ? "border-primary/15 bg-primary/[0.025]" : "border-border/30 bg-muted/8"}
    `}>
      <div className="flex items-center gap-2">
        <SlidersHorizontal className={`h-3.5 w-3.5 transition-colors ${hasActive ? "text-primary" : "text-muted-foreground"}`} />
        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Filters</span>
        {hasActive && (
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse shadow-[0_0_4px_hsl(var(--primary)/0.6)]" />
        )}
      </div>
      {hasActive && onClear && (
        <button onClick={onClear}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-all duration-150 px-2.5 py-1 rounded-md hover:bg-muted/60 hover:shadow-sm border border-transparent hover:border-border/40">
          <X className="h-3 w-3" /> Clear all
        </button>
      )}
    </div>
    <div className="px-5 py-4">{children}</div>
  </Card>
);

/** Table header cell with optional sort */
const TH = ({ children, right, onClick, sortKey, col, sortDir, className = "" }: {
  children: React.ReactNode; right?: boolean; onClick?: () => void;
  sortKey?: string; col?: string; sortDir?: "asc" | "desc"; className?: string;
}) => (
  <th
    onClick={onClick}
    className={`
      px-4 py-3.5 text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider
      ${right ? "text-right" : "text-left"}
      ${onClick ? "cursor-pointer hover:text-foreground select-none group transition-colors duration-150" : ""}
      ${className}
    `}
  >
    {children}
    {onClick && col && sortKey !== undefined && sortDir !== undefined && (
      <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
    )}
  </th>
);

/** Table row wrapper — hover lift with left-border accent */
const TR = ({ children, onClick, className = "" }: {
  children: React.ReactNode; onClick?: () => void; className?: string;
}) => (
  <tr
    onClick={onClick}
    className={`
      border-t border-border/20
      hover:bg-gradient-to-r hover:from-primary/[0.04] hover:to-transparent
      hover:scale-[1.002] hover:shadow-[0_2px_8px_rgba(0,0,0,0.12)]
      hover:border-l-2 hover:border-l-primary/40
      transition-all duration-150 ease-out
      relative
      ${onClick ? "cursor-pointer" : ""}
      group ${className}
    `}
    style={{ willChange: "transform" }}
  >
    {children}
  </tr>
);

/** Shared table wrapper card */
const TableCard = ({ header, children }: { header?: React.ReactNode; children: React.ReactNode }) => (
  <Card className={`
    p-0 overflow-hidden
    border border-border/50
    bg-gradient-to-b from-card/95 to-card/85
    backdrop-blur-sm
    shadow-lg shadow-black/10
    [&_table]:scroll-smooth
  `}>
    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none" />
    {header && (
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/30 bg-gradient-to-r from-muted/15 to-transparent">
        {header}
      </div>
    )}
    <div className="overflow-x-auto [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border/40 [&::-webkit-scrollbar-thumb]:rounded-full">
      <table className="w-full text-sm">
        {children}
      </table>
    </div>
  </Card>
);

/** Table header row — sticky with blur */
const StickyThead = ({ children }: { children: React.ReactNode }) => (
  <thead className="sticky top-0 z-10">
    <tr className="border-b border-border/40 bg-muted/30 backdrop-blur-md shadow-sm">
      {children}
    </tr>
  </thead>
);

/** Section divider label */
const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-widest">{children}</p>
);

// ─────────────────────────────────────────────────────────────────
// DELETE MODAL
// ─────────────────────────────────────────────────────────────────
interface DeleteModalProps {
  invoice: { invoiceNo: string; customerName: string; totalAmount: number } | null;
  step: 1 | 2; confirmText: string;
  onConfirmTextChange: (v: string) => void;
  onNext: () => void; onClose: () => void; onDelete: () => void;
}

const DeleteConfirmModal = ({ invoice, step, confirmText, onConfirmTextChange, onNext, onClose, onDelete }: DeleteModalProps) => {
  if (!invoice) return null;
  const matches = confirmText.trim() === invoice.invoiceNo;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        <div className="h-px w-full bg-gradient-to-r from-red-700 via-red-500 to-red-700" />
        <div className="flex gap-1.5 px-6 pt-5">
          <div className="h-1 flex-1 rounded-full bg-red-500" />
          <div className={`h-1 flex-1 rounded-full transition-all duration-300 ${step === 2 ? "bg-red-500" : "bg-muted"}`} />
        </div>
        <div className="flex items-center justify-between px-6 pt-4 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <p className="font-semibold text-sm text-foreground">Delete Invoice</p>
              <p className="text-xs text-muted-foreground">Step {step} of 2 — {step === 1 ? "Confirm intent" : "Type to verify"}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mx-6 mb-4 rounded-xl border border-red-500/20 bg-red-950/20 px-4 py-3 flex items-center justify-between">
          <div>
            <p className="font-mono text-xs text-red-400 font-semibold tracking-wide">{invoice.invoiceNo}</p>
            <p className="text-sm font-medium text-foreground mt-0.5">{invoice.customerName}</p>
          </div>
          <p className="text-sm font-bold text-foreground">{formatCurrency(invoice.totalAmount)}</p>
        </div>
        <div className="px-6 pb-3">
          {step === 1 ? (
            <p className="text-sm text-muted-foreground leading-relaxed">
              This will <span className="text-foreground font-medium">permanently delete</span> this invoice.
              The action cannot be undone. Any recorded payments will also be deleted.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Type the invoice number exactly to confirm:</p>
              <code className="block text-xs font-mono bg-muted/60 px-3 py-2 rounded-lg text-foreground w-fit select-all">{invoice.invoiceNo}</code>
              <input
                autoFocus type="text" value={confirmText}
                onChange={e => onConfirmTextChange(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && matches) onDelete(); if (e.key === "Escape") onClose(); }}
                placeholder="Type invoice number…"
                className={`w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono outline-none transition-colors placeholder:text-muted-foreground/40
                  ${confirmText.length === 0 ? "border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                    : matches ? "border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
                    : "border-red-500/40 focus:ring-1 focus:ring-red-500/20"}`}
              />
              {confirmText.length > 0 && (
                <p className={`text-xs flex items-center gap-1 ${matches ? "text-emerald-400" : "text-red-400"}`}>
                  {matches ? "✓ Confirmed — ready to delete" : <><X className="h-3 w-3" /> Doesn't match</>}
                </p>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border/30 bg-muted/5">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          {step === 1 ? (
            <button onClick={onNext}
              className="px-4 py-2 rounded-lg text-sm bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-medium transition-colors flex items-center gap-2">
              <Trash2 className="h-3.5 w-3.5" /> Yes, continue
            </button>
          ) : (
            <button onClick={onDelete} disabled={!matches}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white disabled:opacity-40 disabled:cursor-not-allowed">
              <Trash2 className="h-3.5 w-3.5" /> Delete Forever
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// ALL INVOICES TAB
// ─────────────────────────────────────────────────────────────────
const AllInvoicesTab = () => {
  const navigate = useNavigate();
  const [selectedCustomer, setSelectedCustomer] = useState("all");
  const [selectedLocation, setSelectedLocation] = useState("all");
  const [selectedMonth,    setSelectedMonth]    = useState("all");
  const [selectedYear,     setSelectedYear]     = useState("all");
  const [selectedStatus,   setSelectedStatus]   = useState("all");
  const [searchTerm,       setSearchTerm]       = useState("");
  const [expandedRow,      setExpandedRow]      = useState<number | null>(null);
  const [sortKey,  setSortKey]  = useState("invoiceDate");
  const [sortDir,  setSortDir]  = useState<"asc" | "desc">("desc");

  // ── Async data state ───────────────────────────────────────────
  const [invoicesWithPayments, setInvoicesWithPayments] = useState<EnrichedInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await buildInvoicesWithPayments();
      setInvoicesWithPayments(data);
    } catch (err) {
      console.error("[Invoices] fetchData failed:", err);
      setFetchError("Failed to load invoices. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Delete modal state ──────────────────────────────────────────
  const [deleteTarget,  setDeleteTarget]  = useState<{ invoiceNo: string; customerName: string; totalAmount: number } | null>(null);
  const [deleteStep,    setDeleteStep]    = useState<1 | 2>(1);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting,      setDeleting]      = useState(false);

  const openDelete = useCallback((e: React.MouseEvent, inv: typeof deleteTarget) => {
    e.stopPropagation(); setDeleteTarget(inv); setDeleteStep(1); setDeleteConfirm("");
  }, []);

  const closeDelete = useCallback(() => {
    setDeleteTarget(null); setDeleteConfirm(""); setDeleteStep(1);
  }, []);

  const handleDeleteFinal = useCallback(async () => {
    if (!deleteTarget || deleteConfirm.trim() !== deleteTarget.invoiceNo) return;
    setDeleting(true);
    try {
      await deleteInvoice(deleteTarget.invoiceNo);
      closeDelete();
      await fetchData();
    } catch (err) {
      console.error("[Invoices] delete failed:", err);
      alert("Failed to delete invoice. Please try again.");
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, deleteConfirm, closeDelete, fetchData]);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const customers = useMemo(() => [...new Set(invoicesWithPayments.map(d => d.customerName))].sort(), [invoicesWithPayments]);
  const locations = useMemo(() => [...new Set(invoicesWithPayments.map(d => d.placeOfSupply))].sort(), [invoicesWithPayments]);
  const years     = useMemo(() => [...new Set(invoicesWithPayments.map(d => d.invoiceDate.slice(0, 4)))].sort(), [invoicesWithPayments]);

  const filtered = useMemo(() => invoicesWithPayments.filter(d => {
    if (selectedCustomer !== "all" && d.customerName !== selectedCustomer) return false;
    if (selectedLocation !== "all" && d.placeOfSupply !== selectedLocation) return false;
    if (selectedMonth !== "all" && d.invoiceDate.slice(5, 7) !== selectedMonth) return false;
    if (selectedYear !== "all" && d.invoiceDate.slice(0, 4) !== selectedYear) return false;
    if (selectedStatus !== "all" && d.status !== selectedStatus) return false;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      if (!d.invoiceNo.toLowerCase().includes(s) && !d.customerName.toLowerCase().includes(s) && !d.placeOfSupply.toLowerCase().includes(s)) return false;
    }
    return true;
  }), [invoicesWithPayments, selectedCustomer, selectedLocation, selectedMonth, selectedYear, selectedStatus, searchTerm]);

  const totalBilled      = filtered.reduce((s, d) => s + d.totalAmount, 0);
  const totalPaid        = filtered.reduce((s, d) => s + d.totalPaid, 0);
  const totalOutstanding = filtered.reduce((s, d) => s + d.outstanding, 0);
  const totalWeight      = filtered.reduce((s, d) => s + d.weightKg, 0);
  const collectionRate   = totalBilled > 0 ? (totalPaid / totalBilled) * 100 : 0;

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const av = (a as any)[sortKey] ?? "";
    const bv = (b as any)[sortKey] ?? "";
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  }), [filtered, sortKey, sortDir]);

  const hasActiveFilters = selectedCustomer !== "all" || selectedLocation !== "all" ||
    selectedMonth !== "all" || selectedYear !== "all" || selectedStatus !== "all" || !!searchTerm;

  const clearFilters = () => {
    setSelectedCustomer("all"); setSelectedLocation("all");
    setSelectedMonth("all"); setSelectedYear("all");
    setSelectedStatus("all"); setSearchTerm("");
  };

  // ── Loading / error states ──────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="p-5 h-24 animate-pulse bg-muted/30 border-border/30" />
          ))}
        </div>
        <Card className="p-8 text-center border-border/30">
          <p className="text-sm text-muted-foreground animate-pulse">Loading invoices from Supabase…</p>
        </Card>
      </div>
    );
  }

  if (fetchError) {
    return (
      <Card className="p-8 text-center border-red-500/20 bg-red-950/10">
        <p className="text-sm text-red-400 mb-3">{fetchError}</p>
        <button onClick={fetchData}
          className="text-xs px-4 py-2 rounded-lg bg-red-700/20 border border-red-700/40 text-red-400 hover:bg-red-700/30 transition-colors">
          Retry
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── KPIs + actions ───────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 flex-1">
          <KpiCard label="Total Billed"   value={formatCurrency(totalBilled)}
            sub={`${filtered.length} invoices`}
            icon={IndianRupee} />
          <KpiCard label="Collected"      value={formatCurrency(totalPaid)}
            sub={`${collectionRate.toFixed(1)}% collection rate`}
            accent="text-emerald-400" icon={TrendingUp} iconBg="bg-emerald-500/10" />
          <KpiCard label="Outstanding"    value={formatCurrency(totalOutstanding)}
            sub={`${filtered.filter(d => d.outstanding > 0).length} unpaid invoices`}
            accent={totalOutstanding > 0 ? "text-red-400" : "text-emerald-400"}
            icon={Clock}
            iconBg={totalOutstanding > 0 ? "bg-red-500/10" : "bg-emerald-500/10"} />
          <KpiCard label="Total Weight"   value={`${totalWeight.toLocaleString("en-IN")} kg`}
            sub="dispatched"
            icon={Scale} iconBg="bg-blue-500/10" accent="text-blue-400" />
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-2 flex-shrink-0 pt-0.5">
          <button onClick={() => navigate("/invoices/import")}
            className="flex items-center gap-2 h-9 px-4 rounded-lg border border-border/60 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 hover:border-border hover:shadow-sm transition-all duration-150 whitespace-nowrap">
            <Upload className="h-3.5 w-3.5" /> Import PDF
          </button>
          <button onClick={() => navigate("/invoices/create")}
            className="flex items-center gap-2 h-9 px-4 rounded-lg bg-gradient-to-r from-primary to-primary/90 text-primary-foreground text-sm font-medium hover:from-primary/90 hover:to-primary/80 hover:shadow-md hover:shadow-primary/25 hover:-translate-y-px transition-all duration-150 whitespace-nowrap">
            <Plus className="h-3.5 w-3.5" /> Create Invoice
          </button>
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────────────── */}
      <FiltersPanel hasActive={hasActiveFilters} onClear={clearFilters}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
            <SelectTrigger className="h-9 text-xs rounded-lg border-border/50 bg-muted/20 hover:bg-muted/40 focus:ring-1 focus:ring-primary/25 transition-all duration-150">
              <SelectValue placeholder="All Customers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              {customers.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={selectedLocation} onValueChange={setSelectedLocation}>
            <SelectTrigger className="h-9 text-xs rounded-lg border-border/50 bg-muted/20 hover:bg-muted/40 focus:ring-1 focus:ring-primary/25 transition-all duration-150">
              <SelectValue placeholder="All Locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {locations.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="h-9 text-xs rounded-lg border-border/50 bg-muted/20 hover:bg-muted/40 focus:ring-1 focus:ring-primary/25 transition-all duration-150">
              <SelectValue placeholder="All Months" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              {MONTHS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="h-9 text-xs rounded-lg border-border/50 bg-muted/20 hover:bg-muted/40 focus:ring-1 focus:ring-primary/25 transition-all duration-150">
              <SelectValue placeholder="All Years" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="h-9 text-xs rounded-lg border-border/50 bg-muted/20 hover:bg-muted/40 focus:ring-1 focus:ring-primary/25 transition-all duration-150">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Paid">Paid</SelectItem>
              <SelectItem value="Partial">Partial</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
            <Input
              className="pl-8 h-9 text-xs rounded-lg border-border/50 bg-muted/20 hover:bg-muted/40 focus:bg-card focus:ring-1 focus:ring-primary/25 transition-all duration-150 placeholder:text-muted-foreground/40"
              placeholder="Search invoice, customer…"
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </FiltersPanel>

      {/* ── Table ──────────────────────────────────────────────── */}
      <TableCard
        header={
          <>
            <SectionLabel>
              Showing{" "}
              <span className="text-foreground font-bold">{sorted.length}</span>
              {" "}of {invoicesWithPayments.length} invoices
            </SectionLabel>
          </>
        }
      >
        <StickyThead>
          <th className="px-2 py-3.5 w-8" />
          {([
            ["invoiceNo",    "Invoice No.",  false],
            ["invoiceDate",  "Date",         false],
            ["customerName", "Customer",     false],
            ["placeOfSupply","Location",     false],
            ["weightKg",     "Weight (kg)",  true ],
            ["totalAmount",  "Amount",       true ],
            ["totalPaid",    "Paid",         true ],
            ["outstanding",  "Outstanding",  true ],
          ] as [string, string, boolean][]).map(([key, label, right]) => (
            <TH key={key} right={right} onClick={() => handleSort(key)}
              sortKey={sortKey} col={key} sortDir={sortDir}>
              {label}
            </TH>
          ))}
          <TH>Status</TH>
          <th className="px-3 py-3.5 w-20" />
        </StickyThead>

        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={12} className="px-4 py-20 text-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/30 border border-border/30 shadow-inner">
                    <FileText className="h-7 w-7 text-muted-foreground/25" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">No invoices match your filters</p>
                  {hasActiveFilters && (
                    <button onClick={clearFilters} className="text-xs text-primary hover:underline">Clear filters</button>
                  )}
                </div>
              </td>
            </tr>
          ) : sorted.map((d, rowIdx) => (
            <React.Fragment key={d.id}>

              {/* ── Main row ── */}
              <TR
                onClick={() => setExpandedRow(expandedRow === d.id ? null : d.id)}
                className={rowIdx % 2 === 0 ? "" : "bg-muted/[0.025]"}
              >
                {/* Expand chevron */}
                <td className="px-2 py-4 text-muted-foreground/60">
                  {expandedRow === d.id
                    ? <ChevronDown className="h-4 w-4 text-primary transition-transform duration-150" />
                    : <ChevronRight className="h-4 w-4 group-hover:text-foreground transition-all duration-150 group-hover:translate-x-px" />}
                </td>

                {/* Invoice No. */}
                <td className="px-4 py-4">
                  <span className="font-mono text-xs text-muted-foreground group-hover:text-foreground transition-colors duration-150 font-semibold tracking-wide">
                    {d.invoiceNo}
                  </span>
                </td>

                {/* Date */}
                <td className="px-4 py-4 text-xs text-muted-foreground/70 whitespace-nowrap">
                  {new Date(d.invoiceDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </td>

                {/* Customer */}
                <td className="px-4 py-4">
                  <span className="font-bold text-sm text-foreground">{d.customerName}</span>
                </td>

                {/* Location */}
                <td className="px-4 py-4 text-sm text-muted-foreground/70">{d.placeOfSupply}</td>

                {/* Weight */}
                <td className="px-4 py-4 text-right tabular-nums text-sm text-muted-foreground/70">
                  {d.weightKg.toLocaleString("en-IN")}
                </td>

                {/* Amount */}
                <td className="px-4 py-4 text-right tabular-nums font-bold text-sm">
                  {formatCurrency(d.totalAmount)}
                </td>

                {/* Paid */}
                <td className="px-4 py-4 text-right tabular-nums text-emerald-400 font-semibold text-sm">
                  {d.totalPaid > 0 ? formatCurrency(d.totalPaid) : <span className="text-muted-foreground/30">₹0</span>}
                </td>

                {/* Outstanding */}
                <td className="px-4 py-4 text-right tabular-nums font-semibold text-sm">
                  {d.outstanding > 0
                    ? <span className="text-red-400">{formatCurrency(d.outstanding)}</span>
                    : <span className="text-emerald-400">₹0</span>}
                </td>

                {/* Status */}
                <td className="px-4 py-4">
                  <StatusPill status={d.status} />
                </td>

                {/* Actions */}
                <td className="px-3 py-4">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                    <button
                      onClick={e => { e.stopPropagation(); navigate(`/invoices/${encodeURIComponent(d.invoiceNo)}`); }}
                      className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all duration-150"
                      title="View invoice">
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={e => openDelete(e, { invoiceNo: d.invoiceNo, customerName: d.customerName, totalAmount: d.totalAmount })}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-all duration-150"
                      title="Delete invoice">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </TR>

              {/* ── Expanded row: payment mini-table ── */}
              {expandedRow === d.id && (
                <tr className="bg-muted/[0.04] border-t border-border/20">
                  <td colSpan={11} className="px-6 py-4">
                    <div className="rounded-xl border border-border/40 overflow-hidden">
                      <div className="px-4 py-2.5 bg-muted/30 border-b border-border/30">
                        <p className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-widest">
                          Payment History ({d.invoicePayments.length})
                        </p>
                      </div>
                      {d.invoicePayments.length === 0 ? (
                        <div className="px-4 py-5 text-center text-xs text-muted-foreground/50">
                          No payments recorded —{" "}
                          <button
                            onClick={e => { e.stopPropagation(); navigate(`/invoices/${encodeURIComponent(d.invoiceNo)}`); }}
                            className="text-primary hover:underline">record one
                          </button>
                        </div>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border/20 bg-muted/10 text-muted-foreground/60 uppercase tracking-wider text-[10px]">
                              <th className="px-4 py-2 text-left font-semibold">Date</th>
                              <th className="px-4 py-2 text-left font-semibold">Method</th>
                              <th className="px-4 py-2 text-left font-semibold">Reference</th>
                              <th className="px-4 py-2 text-right font-semibold">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {d.invoicePayments.map(p => (
                              <tr key={p.id} className="border-t border-border/20 hover:bg-muted/20 transition-colors">
                                <td className="px-4 py-2 text-muted-foreground/70">
                                  {new Date(p.paymentDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                                </td>
                                <td className="px-4 py-2 font-medium">{p.paymentMethod}</td>
                                <td className="px-4 py-2 font-mono text-muted-foreground/60">{p.reference || "—"}</td>
                                <td className="px-4 py-2 text-right font-semibold text-emerald-400 tabular-nums">
                                  +{formatCurrency(p.amountPaid)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                    {/* Quick actions */}
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={e => { e.stopPropagation(); navigate(`/invoices/${encodeURIComponent(d.invoiceNo)}`); }}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-150">
                        <Eye className="h-3 w-3" /> View Full Detail
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </TableCard>

      {/* Delete modal */}
      <DeleteConfirmModal
        invoice={deleteTarget}
        step={deleteStep}
        confirmText={deleteConfirm}
        onConfirmTextChange={setDeleteConfirm}
        onNext={() => setDeleteStep(2)}
        onClose={closeDelete}
        onDelete={handleDeleteFinal}
      />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// PRODUCT INTELLIGENCE TAB  (redesigned line items)
// ─────────────────────────────────────────────────────────────────

// Palette for charts — dark-premium colours
const CHART_COLORS = [
  "#6366f1", "#22d3ee", "#34d399", "#f59e0b",
  "#f472b6", "#a78bfa", "#fb923c", "#38bdf8",
  "#4ade80", "#facc15",
];

// Custom tooltip for recharts — matches dark theme
const DarkTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#0d0f14]/95 backdrop-blur px-3 py-2.5 shadow-2xl text-xs">
      {label && <p className="text-muted-foreground/60 mb-1.5 font-medium">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color ?? p.fill }} className="font-semibold tabular-nums">
          {p.name}: {typeof p.value === "number" && p.name?.toLowerCase().includes("revenue")
            ? "₹" + p.value.toLocaleString("en-IN", { maximumFractionDigits: 0 })
            : typeof p.value === "number" && p.name?.toLowerCase().includes("%")
            ? p.value.toFixed(1) + "%"
            : p.value?.toLocaleString?.("en-IN") ?? p.value}
        </p>
      ))}
    </div>
  );
};

const LineItemsTab = () => {
  const [invoices,    setInvoices]    = useState<import("@/data/invoiceStore").Invoice[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [activeTab,   setActiveTab]   = useState<"insights" | "table">("insights");
  const [sortKey,     setSortKey]     = useState("invoiceDate");
  const [sortDir,     setSortDir]     = useState<"asc" | "desc">("desc");
  const [searchTerm,  setSearchTerm]  = useState("");
  const [selCustomer, setSelCustomer] = useState("all");
  const [selProduct,  setSelProduct]  = useState("all");

  useEffect(() => {
    import("@/data/invoiceStore").then(({ getAllInvoices }) =>
      getAllInvoices().then(data => { setInvoices(data); setLoading(false); })
    );
  }, []);

  // ── Flatten all line items with invoice context ────────────────
  const allLineItems = useMemo(() =>
    invoices.flatMap(inv =>
      inv.lineItems.map((li, i) => ({
        ...li,
        invoiceNo: inv.invoiceNo,
        invoiceDate: inv.invoiceDate,
        customerName: inv.customerName,
        _key: `${inv.invoiceNo}-${i}`,
      }))
    ), [invoices]);

  const customers = useMemo(() => [...new Set(allLineItems.map(li => li.customerName))].sort(), [allLineItems]);
  const products  = useMemo(() => [...new Set(allLineItems.map(li => li.productDescription))].sort(), [allLineItems]);

  const filtered = useMemo(() => allLineItems.filter(li => {
    if (selCustomer !== "all" && li.customerName !== selCustomer) return false;
    if (selProduct  !== "all" && li.productDescription !== selProduct) return false;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      if (!li.productDescription.toLowerCase().includes(s) &&
          !li.invoiceNo.toLowerCase().includes(s) &&
          !li.customerName.toLowerCase().includes(s)) return false;
    }
    return true;
  }), [allLineItems, selCustomer, selProduct, searchTerm]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const av = (a as any)[sortKey] ?? "";
    const bv = (b as any)[sortKey] ?? "";
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  }), [filtered, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const totalQty    = filtered.reduce((s, li) => s + li.quantity, 0);
  const totalAmount = filtered.reduce((s, li) => s + li.lineAmount, 0);

  // ── Product-level aggregations ─────────────────────────────────
  const productStats = useMemo(() => {
    const map: Record<string, { revenue: number; qty: number; discountSum: number; count: number; discountedRevenue: number }> = {};
    filtered.forEach(li => {
      if (!map[li.productDescription]) map[li.productDescription] = { revenue: 0, qty: 0, discountSum: 0, count: 0, discountedRevenue: 0 };
      const p = map[li.productDescription];
      p.revenue  += li.lineAmount;
      p.qty      += li.quantity;
      p.discountSum += li.discountPct;
      p.count    += 1;
      // Approximate revenue lost to discount: lineAmount / (1 - disc/100) * disc/100
      if (li.discountPct > 0) {
        const grossRate = li.rateExclTax; // rate excl tax is already post-discount in typical invoicing
        p.discountedRevenue += li.quantity * grossRate * (li.discountPct / 100);
      }
    });
    return Object.entries(map)
      .map(([name, s]) => ({
        name,
        revenue: s.revenue,
        qty: s.qty,
        avgDiscount: s.count > 0 ? s.discountSum / s.count : 0,
        revenueLost: s.discountedRevenue,
        revenuePct: totalAmount > 0 ? (s.revenue / totalAmount) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filtered, totalAmount]);

  // ── KPI derivations ────────────────────────────────────────────
  const topProduct    = productStats[0];
  const top3Pct       = productStats.slice(0, 3).reduce((s, p) => s + p.revenuePct, 0);
  const avgDiscountAll = filtered.length > 0
    ? filtered.reduce((s, li) => s + li.discountPct, 0) / filtered.length
    : 0;
  const totalDiscountLost = productStats.reduce((s, p) => s + p.revenueLost, 0);

  // ── Chart data ─────────────────────────────────────────────────
  // Revenue contribution bar chart — top 10
  const revenueChartData = productStats.slice(0, 10).map(p => ({
    name: p.name.length > 22 ? p.name.slice(0, 21) + "…" : p.name,
    fullName: p.name,
    Revenue: p.revenue,
    "Rev %": p.revenuePct,
  }));

  // Donut chart — top 6 + Others
  const PIE_LIMIT = 6;
  const pieTop    = productStats.slice(0, PIE_LIMIT);
  const pieOthers = productStats.slice(PIE_LIMIT).reduce((s, p) => s + p.revenue, 0);
  const pieData   = [
    ...pieTop.map(p => ({ name: p.name.length > 18 ? p.name.slice(0, 17) + "…" : p.name, value: p.revenue })),
    ...(pieOthers > 0 ? [{ name: "Others", value: pieOthers }] : []),
  ];

  // ── AI-style insights ──────────────────────────────────────────
  const insights: { icon: any; color: string; bg: string; text: string }[] = [];
  if (topProduct) {
    insights.push({
      icon: Sparkles, color: "text-primary", bg: "bg-primary/10 border-primary/20",
      text: `Top 3 products contribute ${top3Pct.toFixed(0)}% of total revenue — classic 80/20 concentration.`,
    });
  }
  const highDiscountProduct = [...productStats].sort((a, b) => b.revenueLost - a.revenueLost)[0];
  if (highDiscountProduct && highDiscountProduct.revenueLost > 0) {
    insights.push({
      icon: AlertOctagon, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20",
      text: `"${highDiscountProduct.name.split(" ").slice(0, 4).join(" ")}" has the highest discount impact (−${formatCurrency(highDiscountProduct.revenueLost)} estimated lost revenue).`,
    });
  }
  const highVolLowRev = [...productStats].sort((a, b) => (b.qty / Math.max(b.revenue, 1)) - (a.qty / Math.max(a.revenue, 1)))[0];
  if (highVolLowRev && productStats.length > 1) {
    insights.push({
      icon: Zap, color: "text-sky-400", bg: "bg-sky-500/10 border-sky-500/20",
      text: `"${highVolLowRev.name.split(" ").slice(0, 4).join(" ")}" has high unit volume but low revenue per unit — consider pricing review.`,
    });
  }

  const hasActiveFilters = selCustomer !== "all" || selProduct !== "all" || !!searchTerm;

  if (loading) return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <Card key={i} className="p-5 h-24 animate-pulse bg-muted/30 border-border/30" />)}
      </div>
      <Card className="p-8 text-center border-border/30">
        <p className="text-sm text-muted-foreground animate-pulse">Loading product intelligence…</p>
      </Card>
    </div>
  );

  return (
    <div className="space-y-5">

      {/* ── KPI Cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Top Product Revenue Share */}
        <div className="group relative rounded-2xl border border-white/[0.07] bg-card p-5 transition-all duration-200 hover:scale-[1.015] hover:-translate-y-0.5 hover:border-white/[0.11] cursor-default overflow-hidden"
          style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 12px rgba(0,0,0,0.25)" }}>
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
          <div className="absolute top-4 right-4 h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Target className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="pr-10">
            <p className="text-[10px] font-semibold text-muted-foreground/50 tracking-widest uppercase mb-3">Top Product Share</p>
            <p className="text-[26px] font-bold tracking-tight leading-none mb-1.5 text-primary">
              {topProduct ? topProduct.revenuePct.toFixed(0) + "%" : "—"}
            </p>
            <p className="text-[11px] text-muted-foreground/40 truncate">
              {topProduct ? topProduct.name.split(" ").slice(0, 5).join(" ") : "No data"}
            </p>
          </div>
        </div>

        {/* Total Units Sold */}
        <div className="group relative rounded-2xl border border-white/[0.07] bg-card p-5 transition-all duration-200 hover:scale-[1.015] hover:-translate-y-0.5 hover:border-white/[0.11] cursor-default overflow-hidden"
          style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 12px rgba(0,0,0,0.25)" }}>
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
          <div className="absolute top-4 right-4 h-8 w-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
            <Package className="h-3.5 w-3.5 text-sky-400" />
          </div>
          <div className="pr-10">
            <p className="text-[10px] font-semibold text-muted-foreground/50 tracking-widest uppercase mb-3">Total Units Sold</p>
            <p className="text-[26px] font-bold tracking-tight leading-none mb-1.5 text-foreground/90">
              {totalQty.toLocaleString("en-IN")}
            </p>
            <p className="text-[11px] text-muted-foreground/40">{productStats.length} distinct products</p>
          </div>
        </div>

        {/* Avg Discount % */}
        <div className="group relative rounded-2xl border border-white/[0.07] bg-card p-5 transition-all duration-200 hover:scale-[1.015] hover:-translate-y-0.5 hover:border-white/[0.11] cursor-default overflow-hidden"
          style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 12px rgba(0,0,0,0.25)" }}>
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
          <div className="absolute top-4 right-4 h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <TrendingUp className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <div className="pr-10">
            <p className="text-[10px] font-semibold text-muted-foreground/50 tracking-widest uppercase mb-3">Avg Discount</p>
            <p className={`text-[26px] font-bold tracking-tight leading-none mb-1.5 ${avgDiscountAll > 50 ? "text-red-400" : avgDiscountAll > 30 ? "text-amber-400" : "text-foreground/90"}`}>
              {avgDiscountAll.toFixed(1)}%
            </p>
            <p className="text-[11px] text-muted-foreground/40">across all line items</p>
          </div>
        </div>

        {/* Top 3 Pareto */}
        <div className="group relative rounded-2xl border border-white/[0.07] bg-card p-5 transition-all duration-200 hover:scale-[1.015] hover:-translate-y-0.5 hover:border-white/[0.11] cursor-default overflow-hidden"
          style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 12px rgba(0,0,0,0.25)" }}>
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
          <div className="absolute top-4 right-4 h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <BarChart3 className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <div className="pr-10">
            <p className="text-[10px] font-semibold text-muted-foreground/50 tracking-widest uppercase mb-3">Top 3 Contribution</p>
            <p className="text-[26px] font-bold tracking-tight leading-none mb-1.5 text-emerald-400">
              {top3Pct.toFixed(0)}%
            </p>
            <p className="text-[11px] text-muted-foreground/40">of total revenue (Pareto)</p>
          </div>
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────────────── */}
      <FiltersPanel hasActive={hasActiveFilters}
        onClear={() => { setSelCustomer("all"); setSelProduct("all"); setSearchTerm(""); }}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Select value={selCustomer} onValueChange={setSelCustomer}>
            <SelectTrigger className="h-9 text-xs rounded-lg border-border/50 bg-muted/20 hover:bg-muted/40 focus:ring-1 focus:ring-primary/25 transition-all duration-150">
              <SelectValue placeholder="All Customers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              {customers.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={selProduct} onValueChange={setSelProduct}>
            <SelectTrigger className="h-9 text-xs rounded-lg border-border/50 bg-muted/20 hover:bg-muted/40 focus:ring-1 focus:ring-primary/25 transition-all duration-150">
              <SelectValue placeholder="All Products" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Products</SelectItem>
              {products.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
            <Input className="pl-8 h-9 text-xs rounded-lg border-border/50 bg-muted/20 placeholder:text-muted-foreground/40 focus:ring-1 focus:ring-primary/25 transition-all duration-150"
              placeholder="Search product, invoice, customer…"
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
        </div>
      </FiltersPanel>

      {/* ── AI Insights ─────────────────────────────────────────── */}
      {insights.length > 0 && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] overflow-hidden">
          <div className="px-5 py-3 border-b border-white/[0.05] flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-primary/70" />
            <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest">Product Intelligence</span>
          </div>
          <div className="px-5 py-4 flex flex-col sm:flex-row gap-3">
            {insights.map((ins, i) => (
              <div key={i} className={`flex items-start gap-2.5 flex-1 rounded-xl border ${ins.bg} px-3.5 py-3`}>
                <ins.icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${ins.color}`} />
                <p className="text-xs text-muted-foreground/80 leading-relaxed">{ins.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tabs: Insights / Raw Table ───────────────────────────── */}
      <div className="flex gap-1 p-1 rounded-xl border border-white/[0.06] bg-white/[0.02] w-fit">
        {([
          { id: "insights", label: "Insights",   icon: BarChart3  },
          { id: "table",    label: "Raw Data",   icon: TableIcon  },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
              activeTab === id
                ? "bg-primary/15 text-primary border border-primary/25 shadow-[0_0_8px_rgba(var(--primary),0.15)]"
                : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-white/[0.04]"
            }`}>
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════
          INSIGHTS VIEW
      ════════════════════════════════════════════════════════════ */}
      {activeTab === "insights" && (
        <div className="space-y-5">

          {/* ── Row 1: Revenue Contribution Bar + Donut ─────────── */}
          <div className="grid grid-cols-5 gap-5">

            {/* Revenue contribution — horizontal bars */}
            <div className="col-span-3 rounded-2xl border border-white/[0.06] bg-card overflow-hidden"
              style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03), 0 4px 24px rgba(0,0,0,0.25)" }}>
              <div className="px-5 py-4 border-b border-white/[0.05]">
                <p className="text-[11px] font-bold text-muted-foreground/50 uppercase tracking-widest">Revenue Contribution</p>
                <p className="text-xs text-muted-foreground/40 mt-0.5">Which products drive your revenue?</p>
              </div>
              <div className="p-5 space-y-3">
                {productStats.slice(0, 8).map((p, i) => {
                  const isTop = i === 0;
                  return (
                    <div key={p.name} className="group">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-medium truncate max-w-[55%] ${isTop ? "text-foreground" : "text-foreground/70"}`}>
                          {p.name}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] text-muted-foreground/50 tabular-nums">{formatCurrency(p.revenue)}</span>
                          <span className={`text-[11px] font-bold tabular-nums w-10 text-right ${isTop ? "text-primary" : "text-muted-foreground/70"}`}>
                            {p.revenuePct.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${p.revenuePct}%`,
                            background: `${CHART_COLORS[i % CHART_COLORS.length]}`,
                            boxShadow: isTop ? `0 0 6px ${CHART_COLORS[i]}80` : "none",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Product Mix Donut */}
            <div className="col-span-2 rounded-2xl border border-white/[0.06] bg-card overflow-hidden"
              style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03), 0 4px 24px rgba(0,0,0,0.25)" }}>
              <div className="px-5 py-4 border-b border-white/[0.05]">
                <p className="text-[11px] font-bold text-muted-foreground/50 uppercase tracking-widest">Product Mix</p>
                <p className="text-xs text-muted-foreground/40 mt-0.5">Revenue share by product</p>
              </div>
              <div className="p-4">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} opacity={0.85} />
                      ))}
                    </Pie>
                    <Tooltip content={<DarkTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Legend */}
                <div className="space-y-1 mt-1">
                  {pieData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="text-[10px] text-muted-foreground/60 truncate flex-1">{d.name}</span>
                      <span className="text-[10px] text-muted-foreground/40 tabular-nums">{formatCurrency(d.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Row 2: Volume vs Revenue Chart ──────────────────── */}
          <div className="rounded-2xl border border-white/[0.06] bg-card overflow-hidden"
            style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03), 0 4px 24px rgba(0,0,0,0.25)" }}>
            <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-muted-foreground/50 uppercase tracking-widest">Revenue by Product</p>
                <p className="text-xs text-muted-foreground/40 mt-0.5">Absolute revenue per product — top 10</p>
              </div>
            </div>
            <div className="p-5">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={revenueChartData} barCategoryGap="30%">
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)", fontFamily: "inherit" }}
                    axisLine={false} tickLine={false}
                    interval={0}
                    angle={-35}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis
                    tickFormatter={v => "₹" + (v >= 100000 ? (v / 100000).toFixed(0) + "L" : v >= 1000 ? (v / 1000).toFixed(0) + "K" : v)}
                    tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)", fontFamily: "inherit" }}
                    axisLine={false} tickLine={false} width={52}
                  />
                  <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                  <Bar dataKey="Revenue" radius={[4, 4, 0, 0]}>
                    {revenueChartData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} opacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Row 3: Discount Impact Table ────────────────────── */}
          <div className="rounded-2xl border border-white/[0.06] bg-card overflow-hidden"
            style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03), 0 4px 24px rgba(0,0,0,0.25)" }}>
            <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-muted-foreground/50 uppercase tracking-widest">Discount Impact Analysis</p>
                <p className="text-xs text-muted-foreground/40 mt-0.5">Where are discounts hurting margin?</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground/40 uppercase tracking-widest">Total Est. Lost</p>
                <p className="text-sm font-bold text-amber-400 tabular-nums">{formatCurrency(totalDiscountLost)}</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.05] bg-white/[0.02]">
                    <th className="px-5 py-3 text-left text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-widest">#</th>
                    <th className="px-5 py-3 text-left text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-widest">Product</th>
                    <th className="px-5 py-3 text-right text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-widest">Revenue</th>
                    <th className="px-5 py-3 text-right text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-widest">Units</th>
                    <th className="px-5 py-3 text-right text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-widest">Avg Disc%</th>
                    <th className="px-5 py-3 text-right text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-widest">Rev. Share</th>
                    <th className="px-5 py-3 text-right text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-widest">Disc Impact</th>
                  </tr>
                </thead>
                <tbody>
                  {productStats.map((p, i) => {
                    const discColor = p.avgDiscount > 60 ? "text-red-400" : p.avgDiscount > 40 ? "text-amber-400" : "text-muted-foreground/60";
                    return (
                      <tr key={p.name}
                        className="border-t border-white/[0.04] hover:bg-gradient-to-r hover:from-primary/[0.04] hover:to-transparent transition-all duration-150 group">
                        <td className="px-5 py-3.5">
                          <span className="text-[11px] text-muted-foreground/30 tabular-nums font-mono">{String(i + 1).padStart(2, "0")}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                            <span className={`text-sm font-medium ${i === 0 ? "text-foreground" : "text-foreground/80"}`}>{p.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-foreground/80">{formatCurrency(p.revenue)}</td>
                        <td className="px-5 py-3.5 text-right tabular-nums text-muted-foreground/60">{p.qty.toLocaleString("en-IN")}</td>
                        <td className={`px-5 py-3.5 text-right tabular-nums font-semibold ${discColor}`}>{p.avgDiscount.toFixed(1)}%</td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-1 rounded-full bg-white/[0.05] overflow-hidden">
                              <div className="h-full rounded-full bg-primary/60" style={{ width: `${Math.min(100, p.revenuePct)}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground/50 tabular-nums w-9 text-right">{p.revenuePct.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-right tabular-nums">
                          {p.revenueLost > 0
                            ? <span className="text-amber-400/80 font-medium text-xs">−{formatCurrency(p.revenueLost)}</span>
                            : <span className="text-muted-foreground/25 text-xs">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {productStats.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-white/[0.08] bg-white/[0.015]">
                      <td colSpan={2} className="px-5 py-3 text-[11px] font-bold text-muted-foreground/50 uppercase tracking-widest">Totals</td>
                      <td className="px-5 py-3 text-right font-bold tabular-nums text-sm">{formatCurrency(totalAmount)}</td>
                      <td className="px-5 py-3 text-right font-bold tabular-nums text-sm text-muted-foreground/60">{totalQty.toLocaleString("en-IN")}</td>
                      <td className="px-5 py-3 text-right font-bold tabular-nums text-amber-400/80 text-sm">{avgDiscountAll.toFixed(1)}%</td>
                      <td className="px-5 py-3 text-right text-muted-foreground/40 text-xs">100%</td>
                      <td className="px-5 py-3 text-right font-bold tabular-nums text-amber-400/80 text-sm">−{formatCurrency(totalDiscountLost)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          RAW TABLE VIEW
      ════════════════════════════════════════════════════════════ */}
      {activeTab === "table" && (
        <TableCard header={<SectionLabel>Line Items ({sorted.length})</SectionLabel>}>
          <StickyThead>
            {([
              ["invoiceNo",          "Invoice No.",  false],
              ["invoiceDate",        "Date",         false],
              ["customerName",       "Customer",     false],
              ["productDescription", "Product",      false],
              ["uom",                "UOM",          false],
              ["quantity",           "Qty",          true ],
              ["rateExclTax",        "Rate (Excl.)", true ],
              ["discountPct",        "Disc%",        true ],
              ["lineAmount",         "Amount",       true ],
            ] as [string, string, boolean][]).map(([key, label, right]) => (
              <TH key={key} right={right} onClick={() => handleSort(key)} sortKey={sortKey} col={key} sortDir={sortDir}>{label}</TH>
            ))}
          </StickyThead>
          <tbody>
            {sorted.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-14 text-center text-sm text-muted-foreground/60">No line items match your filters</td></tr>
            ) : sorted.map((li, i) => (
              <TR key={li._key} className={i % 2 === 1 ? "bg-muted/[0.025]" : ""}>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground/70 font-semibold">{li.invoiceNo}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground/60 whitespace-nowrap">
                  {new Date(li.invoiceDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </td>
                <td className="px-4 py-3 font-bold text-sm">{li.customerName}</td>
                <td className="px-4 py-3 text-sm">{li.productDescription}</td>
                <td className="px-4 py-3 text-center text-xs text-muted-foreground/60">{li.uom}</td>
                <td className="px-4 py-3 text-right tabular-nums text-sm font-semibold">{li.quantity.toLocaleString("en-IN")}</td>
                <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground/70">₹{li.rateExclTax.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3 text-right text-amber-400 text-xs">{li.discountPct}%</td>
                <td className="px-4 py-3 text-right tabular-nums font-bold text-sm">{formatCurrency(li.lineAmount)}</td>
              </TR>
            ))}
            {sorted.length > 0 && (
              <tr className="border-t-2 border-border/40 bg-gradient-to-r from-muted/30 to-muted/15">
                <td colSpan={5} className="px-4 py-3 text-right text-[11px] font-bold text-muted-foreground/70 uppercase tracking-widest">Totals</td>
                <td className="px-4 py-3 text-right font-bold tabular-nums text-sm">{totalQty.toLocaleString("en-IN")}</td>
                <td colSpan={2} />
                <td className="px-4 py-3 text-right font-bold tabular-nums text-sm">{formatCurrency(totalAmount)}</td>
              </tr>
            )}
          </tbody>
        </TableCard>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// LOGISTICS TAB  (async data fetch)
// ─────────────────────────────────────────────────────────────────
type EwayStatus = "Generated" | "Cancelled" | "Expired" | "Pending";
const EWAY_STATUS: EwayStatus[] = ["Generated", "Cancelled", "Expired", "Pending"];
const ewayStyle: Record<EwayStatus, string> = {
  Generated: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  Cancelled: "bg-red-500/10    text-red-400    border-red-500/30",
  Expired:   "bg-amber-500/10  text-amber-400  border-amber-500/30",
  Pending:   "bg-sky-500/10    text-sky-400    border-sky-500/30",
};

function getValidityDate(invoiceDate: string): string {
  const d = new Date(invoiceDate);
  d.setDate(d.getDate() + 15);
  return d.toISOString().split("T")[0];
}

const LogisticsTab = () => {
  const [invoices,          setInvoices]          = useState<import("@/data/invoiceStore").Invoice[]>([]);
  const [loading,           setLoading]           = useState(true);
  const [searchTerm,        setSearchTerm]        = useState("");
  const [selectedMonth,     setSelectedMonth]     = useState("all");
  const [selectedDestination, setSelectedDest]    = useState("all");
  const [selectedStatus,    setSelectedStatus]    = useState("all");
  const [statusOverrides,   setStatusOverrides]   = useState<Record<string, EwayStatus>>({});

  useEffect(() => {
    import("@/data/invoiceStore").then(({ getAllInvoices }) =>
      getAllInvoices().then(data => {
        setInvoices(data.filter(inv => inv.eWayBillNo));
        setLoading(false);
      })
    );
  }, []);

  const destinations = useMemo(() => [...new Set(invoices.map(d => d.destination).filter(Boolean) as string[])].sort(), [invoices]);

  const filtered = useMemo(() => invoices.filter(d => {
    if (selectedMonth !== "all" && d.invoiceDate.slice(5, 7) !== selectedMonth) return false;
    if (selectedDestination !== "all" && d.destination !== selectedDestination) return false;
    const status = statusOverrides[d.invoiceNo] ?? "Generated";
    if (selectedStatus !== "all" && status !== selectedStatus) return false;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      if (!d.invoiceNo.toLowerCase().includes(s) &&
          !d.customerName.toLowerCase().includes(s) &&
          !(d.eWayBillNo ?? "").toLowerCase().includes(s)) return false;
    }
    return true;
  }), [invoices, selectedMonth, selectedDestination, selectedStatus, searchTerm, statusOverrides]);

  const totalWeight  = filtered.reduce((s, d) => s + d.weightKg, 0);
  const totalFreight = filtered.reduce((s, d) => s + (d.freight < 0 ? Math.abs(d.freight) : 0), 0);

  if (loading) return (
    <Card className="p-8 text-center border-border/30">
      <p className="text-sm text-muted-foreground animate-pulse">Loading logistics data…</p>
    </Card>
  );

  return (
    <div className="space-y-5">

      {/* ── KPI Cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total E-way Bills", value: invoices.length.toString(),    sub: "with e-way bill no.",        iconColor: "text-primary",    iconBg: "bg-primary/10 border-primary/20",      icon: FileCheck2, valueColor: "text-foreground/90" },
          { label: "Generated",         value: filtered.filter(d => (statusOverrides[d.invoiceNo] ?? "Generated") === "Generated").length.toString(), sub: "active bills", iconColor: "text-emerald-400", iconBg: "bg-emerald-500/10 border-emerald-500/20", icon: TrendingUp,  valueColor: "text-emerald-400" },
          { label: "Total Freight",     value: formatCurrency(totalFreight),   sub: "logistics cost",             iconColor: "text-purple-400", iconBg: "bg-purple-500/10 border-purple-500/20", icon: Truck,      valueColor: "text-purple-400" },
          { label: "Total Weight",      value: totalWeight.toLocaleString("en-IN") + " kg", sub: "dispatched",  iconColor: "text-sky-400",    iconBg: "bg-sky-500/10 border-sky-500/20",      icon: Scale,      valueColor: "text-foreground/90" },
        ].map(({ label, value, sub, iconColor, iconBg, icon: Icon, valueColor }) => (
          <div key={label}
            className="group relative rounded-2xl border border-white/[0.07] bg-card p-5 transition-all duration-200 hover:scale-[1.015] hover:-translate-y-0.5 hover:border-white/[0.11] cursor-default overflow-hidden"
            style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 12px rgba(0,0,0,0.25)" }}>
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
            <div className={`absolute top-4 right-4 h-8 w-8 rounded-lg border ${iconBg} flex items-center justify-center`}>
              <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
            </div>
            <div className="pr-10">
              <p className="text-[10px] font-semibold text-muted-foreground/50 tracking-widest uppercase mb-3">{label}</p>
              <p className={`text-[26px] font-bold tracking-tight leading-none mb-1.5 ${valueColor}`}>{value}</p>
              <p className="text-[11px] text-muted-foreground/40">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      <FiltersPanel hasActive={selectedMonth !== "all" || selectedDestination !== "all" || selectedStatus !== "all" || !!searchTerm}
        onClear={() => { setSelectedMonth("all"); setSelectedDest("all"); setSelectedStatus("all"); setSearchTerm(""); }}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="h-9 text-xs rounded-lg border-border/50 bg-muted/20 hover:bg-muted/40 focus:ring-1 focus:ring-primary/25 transition-all duration-150">
              <SelectValue placeholder="All Months" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              {MONTHS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={selectedDestination} onValueChange={setSelectedDest}>
            <SelectTrigger className="h-9 text-xs rounded-lg border-border/50 bg-muted/20 hover:bg-muted/40 focus:ring-1 focus:ring-primary/25 transition-all duration-150">
              <SelectValue placeholder="All Destinations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Destinations</SelectItem>
              {destinations.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="h-9 text-xs rounded-lg border-border/50 bg-muted/20 hover:bg-muted/40 focus:ring-1 focus:ring-primary/25 transition-all duration-150">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {EWAY_STATUS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
            <Input className="pl-8 h-9 text-xs rounded-lg border-border/50 bg-muted/20 placeholder:text-muted-foreground/40 focus:ring-1 focus:ring-primary/25 transition-all duration-150"
              placeholder="Search invoice, e-Way, customer…"
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
        </div>
      </FiltersPanel>

      <TableCard header={<SectionLabel>E-way Bills ({filtered.length})</SectionLabel>}>
        <StickyThead>
          {["Invoice No.","Date","Customer","E-way Bill No.","Validity","Destination","Transporter / Vehicle"].map(h => (
            <th key={h} className="px-4 py-3.5 text-left text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider">{h}</th>
          ))}
          <th className="px-4 py-3.5 text-right text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider">Weight (kg)</th>
          <th className="px-4 py-3.5 text-right text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider">Freight</th>
          <th className="px-4 py-3.5 text-left  text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider">Status</th>
        </StickyThead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={10} className="px-4 py-14 text-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/30 border border-border/30 shadow-inner">
                    <Truck className="h-7 w-7 text-muted-foreground/25" />
                  </div>
                  <p className="text-sm text-muted-foreground/60">No e-way bills found</p>
                </div>
              </td>
            </tr>
          ) : filtered.map((d, i) => {
            const status = statusOverrides[d.invoiceNo] ?? "Generated";
            const validityDate = getValidityDate(d.invoiceDate);
            const isExpired = new Date(validityDate) < new Date() && status === "Generated";
            return (
              <TR key={d.id} className={i % 2 === 1 ? "bg-muted/[0.025]" : ""}>
                <td className="px-4 py-4 font-mono text-xs text-muted-foreground/70 font-semibold tracking-wide">{d.invoiceNo}</td>
                <td className="px-4 py-4 text-xs text-muted-foreground/60 whitespace-nowrap">
                  {new Date(d.invoiceDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </td>
                <td className="px-4 py-4 font-bold text-sm">{d.customerName}</td>
                <td className="px-4 py-4 font-mono text-xs font-bold">{d.eWayBillNo}</td>
                <td className="px-4 py-4 text-xs whitespace-nowrap">
                  <span className={isExpired ? "text-red-400 font-semibold" : "text-muted-foreground/70"}>
                    {new Date(validityDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    {isExpired && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 ring-1 ring-red-500/30">Expired</span>}
                  </span>
                </td>
                <td className="px-4 py-4 text-sm">{d.destination ?? <span className="text-muted-foreground/25">—</span>}</td>
                <td className="px-4 py-4 text-xs text-muted-foreground/70">
                  {d.dispatchedThrough ?? <span className="italic opacity-40">Not specified</span>}
                </td>
                <td className="px-4 py-4 text-right tabular-nums text-sm font-semibold">{d.weightKg.toLocaleString("en-IN")}</td>
                <td className="px-4 py-4 text-right tabular-nums text-purple-400 font-semibold text-sm">
                  {d.freight < 0 ? formatCurrency(Math.abs(d.freight)) : <span className="text-muted-foreground/25">—</span>}
                </td>
                <td className="px-4 py-4">
                  <Select value={status} onValueChange={v => setStatusOverrides(prev => ({ ...prev, [d.invoiceNo]: v as EwayStatus }))}>
                    <SelectTrigger className={`h-7 text-xs w-28 border font-semibold rounded-full transition-all duration-150 ${ewayStyle[status]}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EWAY_STATUS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
              </TR>
            );
          })}
          {filtered.length > 0 && (
            <tr className="border-t-2 border-border/40 bg-gradient-to-r from-muted/30 to-muted/15">
              <td colSpan={7} className="px-4 py-3 text-right text-[11px] font-bold text-muted-foreground/70 uppercase tracking-widest">Totals</td>
              <td className="px-4 py-3 text-right font-bold tabular-nums text-sm">{totalWeight.toLocaleString("en-IN")}</td>
              <td className="px-4 py-3 text-right font-bold tabular-nums text-purple-400 text-sm">{formatCurrency(totalFreight)}</td>
              <td />
            </tr>
          )}
        </tbody>
      </TableCard>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// MAIN PAGE SHELL
// ─────────────────────────────────────────────────────────────────
const Invoices = () => {
  const { pathname } = useLocation();
  const meta = PAGE_META[pathname as keyof typeof PAGE_META] ?? PAGE_META["/invoices"];
  const Icon = meta.icon;

  return (
    <div className="space-y-6">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between pb-5 border-b border-border/30">
        <div className="flex items-center gap-3">
          <div className={`
            flex h-9 w-9 items-center justify-center rounded-xl
            bg-gradient-to-br from-primary/15 to-primary/5
            border border-primary/15
            shadow-sm shadow-primary/10
          `}>
            <Icon className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">{meta.title}</h1>
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              {meta.section === "all"        && "Manage, filter and track all invoices"}
              {meta.section === "line-items" && "Understand product contribution, volume, and profitability"}
              {meta.section === "logistics"  && "Track dispatch and e-way bill status"}
            </p>
          </div>
        </div>
      </div>

      {/* ── Tab content ── */}
      {meta.section === "all"        && <AllInvoicesTab />}
      {meta.section === "line-items" && <LineItemsTab />}
      {meta.section === "logistics"  && <LogisticsTab />}
    </div>
  );
};

export default Invoices;
