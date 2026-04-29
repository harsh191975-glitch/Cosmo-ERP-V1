/**
 * Purchases.tsx
 * ─────────────────────────────────────────────────────────────────
 * Supabase-only. No JSON seeds, no purchasesData import, no localStorage.
 * All data flows through purchaseStore.ts.
 * UI / layout unchanged from original.
 * ─────────────────────────────────────────────────────────────────
 */

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import {
  getPurchases,
  getPurchasesByCategory,
  deletePurchase,
  type Purchase,
} from "@/data/purchaseStore";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  SlidersHorizontal, Search, ShoppingCart, IndianRupee,
  Receipt, TrendingDown, ArrowUpDown, ArrowUp, ArrowDown,
  X, Package, FlaskConical, Building2, ArrowLeft, Eye,
  XCircle, Plus, Trash2, RefreshCw, AlertCircle,
} from "lucide-react";
import { AddPurchase } from "@/components/AddPurchase";

// ── Helpers ────────────────────────────────────────────────────────
const fmt = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const fmtFull = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string) => {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const MONTHS = [
  { value: "01", label: "January"   }, { value: "02", label: "February" },
  { value: "03", label: "March"     }, { value: "04", label: "April"    },
  { value: "05", label: "May"       }, { value: "06", label: "June"     },
  { value: "07", label: "July"      }, { value: "08", label: "August"   },
  { value: "09", label: "September" }, { value: "10", label: "October"  },
  { value: "11", label: "November"  }, { value: "12", label: "December" },
];

// ── KPI Card ───────────────────────────────────────────────────────
const KPI = ({ label, value, sub, accent, icon: Icon }: {
  label: string; value: string; sub?: string; accent?: string; icon: React.ElementType;
}) => (
  <Card className="p-4 flex items-center gap-3.5 hover:border-primary/25 transition-colors">
    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
      <Icon className="h-5 w-5 text-primary" />
    </div>
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-base font-bold leading-tight ${accent ?? "text-foreground"}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  </Card>
);

// ── Sort Icon ──────────────────────────────────────────────────────
const SortIcon = ({ col, sortKey, sortDir }: {
  col: string; sortKey: string; sortDir: "asc" | "desc";
}) =>
  sortKey !== col
    ? <ArrowUpDown className="ml-1.5 h-3 w-3 inline opacity-25" />
    : sortDir === "asc"
      ? <ArrowUp   className="ml-1.5 h-3 w-3 inline text-primary" />
      : <ArrowDown className="ml-1.5 h-3 w-3 inline text-primary" />;

// ── Error banner ───────────────────────────────────────────────────
const ErrorBanner = ({ message }: { message: string }) => (
  <div className="flex items-center gap-2 rounded-lg border border-red-800/40 bg-red-950/30 px-4 py-3 text-sm text-red-400">
    <AlertCircle className="h-4 w-4 flex-shrink-0" />
    <span>{message}</span>
  </div>
);

// ── Skeleton loader ────────────────────────────────────────────────
const TableSkeleton = () => (
  <Card className="p-0 overflow-hidden">
    <div className="p-4 space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-9 rounded bg-muted/40 animate-pulse" />
      ))}
    </div>
  </Card>
);

// ── Hook: fetch all (or category-filtered) purchases ──────────────
function usePurchases(refreshKey: number, category?: string) {
  const [rows,    setRows]    = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const fetchFn = category
      ? () => getPurchasesByCategory(category)
      : () => getPurchases();

    fetchFn()
      .then(data => {
        if (!cancelled) { setRows(data); setLoading(false); }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err?.message ?? "Failed to load purchases.");
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [refreshKey, category]);

  return { rows, loading, error };
}

// ── Purchase detail panel ──────────────────────────────────────────
const PurchaseDetail = ({ row, onClose }: { row: Purchase; onClose: () => void }) => (
  <div className="rounded-xl border border-primary/20 overflow-hidden shadow-xl mb-4">
    <div className="flex items-center justify-between px-5 py-3 bg-primary/5 border-b border-border">
      <div className="flex items-center gap-3">
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <p className="text-sm font-semibold">{row.invoice_no}</p>
          <p className="text-xs text-muted-foreground">
            {row.supplier_name} · {fmtDate(row.purchase_date)}
          </p>
        </div>
      </div>
      <button
        onClick={onClose}
        className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
      >
        <XCircle className="h-4 w-4" />
      </button>
    </div>

    <div className="p-5 space-y-4">
      {/* Header fields */}
      <div className="grid grid-cols-4 gap-3">
        {([
          ["Supplier",    row.supplier_name],
          ["Invoice No.", row.invoice_no],
          ["Date",        fmtDate(row.purchase_date)],
          ["Category",    row.category],
        ] as [string, string][]).map(([l, v]) => (
          <div key={l} className="rounded-lg bg-muted/30 border border-border/40 px-3 py-2.5">
            <p className="text-xs text-muted-foreground mb-1">{l}</p>
            <p className="text-sm font-medium capitalize">{v?.replace("-", " ")}</p>
          </div>
        ))}
      </div>

      {/* Line items table */}
      {row.line_items.length > 0 && (
        <div className="rounded-lg border border-border/40 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/40 border-b border-border/40">
                <th className="px-3 py-2.5 text-left  font-medium text-muted-foreground">Product</th>
                <th className="px-3 py-2.5 text-left  font-medium text-muted-foreground">Category</th>
                <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Qty</th>
                <th className="px-3 py-2.5 text-left  font-medium text-muted-foreground">UOM</th>
                <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Rate</th>
                <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Taxable</th>
                <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {row.line_items.map((li, idx) => (
                <tr key={li.id ?? idx} className="border-t border-border/30 hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">{li.product_name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{li.item_category}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{li.quantity}</td>
                  <td className="px-3 py-2 text-muted-foreground">{li.unit_of_measure}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtFull(li.rate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtFull(li.taxable_value)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtFull(li.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Totals footer */}
      <div className="flex items-center justify-end gap-8 pt-2 border-t border-border/30 text-sm">
        <div className="text-muted-foreground">
          Taxable <span className="font-semibold text-foreground ml-1.5">{fmtFull(row.taxable_amount)}</span>
        </div>
        {(row.cgst > 0 || row.sgst > 0) && (
          <div className="text-muted-foreground">
            CGST+SGST <span className="font-semibold text-amber-400 ml-1.5">{fmtFull(row.cgst + row.sgst)}</span>
          </div>
        )}
        {row.igst > 0 && (
          <div className="text-muted-foreground">
            IGST <span className="font-semibold text-amber-400 ml-1.5">{fmtFull(row.igst)}</span>
          </div>
        )}
        <div className="text-muted-foreground">
          Total <span className="font-bold text-base text-foreground ml-1.5">{fmtFull(row.total_amount)}</span>
        </div>
      </div>
    </div>
  </div>
);

// ── Purchases table ────────────────────────────────────────────────
interface PurchaseTableProps {
  rows:         Purchase[];
  onDeleted:    () => void;
  showSupplier?: boolean;
}

const PurchaseTable = ({ rows, onDeleted, showSupplier = true }: PurchaseTableProps) => {
  const [viewRow,    setViewRow]    = useState<Purchase | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteErr,  setDeleteErr]  = useState<string | null>(null);
  const [sortKey,    setSortKey]    = useState("purchase_date");
  const [sortDir,    setSortDir]    = useState<"asc" | "desc">("desc");

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const handleDelete = async (row: Purchase) => {
    if (!confirm(`Delete purchase ${row.invoice_no}? This will also reverse inventory stock.`)) return;
    setDeletingId(row.id);
    setDeleteErr(null);
    try {
      await deletePurchase(row.id);
      if (viewRow?.id === row.id) setViewRow(null);
      onDeleted();
    } catch (err: any) {
      setDeleteErr(err?.message ?? "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  };

  const sorted = useMemo(() => [...rows].sort((a, b) => {
    if (sortKey === "purchase_date") {
      return sortDir === "asc"
        ? a.purchase_date.localeCompare(b.purchase_date)
        : b.purchase_date.localeCompare(a.purchase_date);
    }
    const an = (a as any)[sortKey] ?? 0;
    const bn = (b as any)[sortKey] ?? 0;
    return sortDir === "asc" ? an - bn : bn - an;
  }), [rows, sortKey, sortDir]);

  const totalTaxable = rows.reduce((s, d) => s + d.taxable_amount, 0);
  const totalGST     = rows.reduce((s, d) => s + d.total_gst, 0);
  const totalSpend   = rows.reduce((s, d) => s + d.total_amount, 0);

  const cols: [string, string][] = showSupplier
    ? [
        ["purchase_date",  "Date"],
        ["invoice_no",     "Invoice No."],
        ["supplier_name",  "Supplier"],
        ["taxable_amount", "Taxable"],
        ["total_gst",      "GST"],
        ["total_amount",   "Total"],
      ]
    : [
        ["purchase_date",  "Date"],
        ["invoice_no",     "Invoice No."],
        ["taxable_amount", "Taxable"],
        ["total_gst",      "GST"],
        ["total_amount",   "Total"],
      ];

  return (
    <div className="space-y-3">
      {deleteErr && <ErrorBanner message={deleteErr} />}
      {viewRow && <PurchaseDetail row={viewRow} onClose={() => setViewRow(null)} />}

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/25">
                {cols.map(([key, label]) => (
                  <th
                    key={key}
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground select-none transition-colors"
                    onClick={() => handleSort(key)}
                  >
                    {label}<SortIcon col={key} sortKey={sortKey} sortDir={sortDir} />
                  </th>
                ))}
                <th className="px-3 py-3 w-20 text-xs font-semibold text-muted-foreground text-center">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={cols.length + 1} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No records found
                  </td>
                </tr>
              ) : (
                sorted.map(d => {
                  const isDeleting = deletingId === d.id;
                  return (
                    <tr
                      key={d.id}
                      className="border-t border-border/50 hover:bg-muted/20 transition-colors group"
                    >
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {fmtDate(d.purchase_date)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {d.invoice_no}
                      </td>
                      {showSupplier && (
                        <td className="px-4 py-3 font-medium text-sm">{d.supplier_name}</td>
                      )}
                      <td className="px-4 py-3 text-right tabular-nums text-sm">
                        {fmt(d.taxable_amount)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-sm text-amber-400">
                        {fmt(d.total_gst)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-sm text-primary/90">
                        {fmt(d.total_amount)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-center">
                          <button
                            onClick={() => setViewRow(viewRow?.id === d.id ? null : d)}
                            title="View detail"
                            className="p-1.5 rounded-lg hover:bg-primary/15 text-muted-foreground hover:text-primary transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(d)}
                            disabled={isDeleting}
                            title="Delete purchase"
                            className="p-1.5 rounded-lg hover:bg-red-950/40 text-muted-foreground hover:text-red-400 transition-colors disabled:opacity-40"
                          >
                            {isDeleting
                              ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              : <Trash2    className="h-3.5 w-3.5" />
                            }
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}

              {sorted.length > 0 && (
                <tr className="border-t-2 border-border bg-muted/25">
                  <td
                    colSpan={showSupplier ? 3 : 2}
                    className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                  >
                    Totals ({sorted.length})
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm font-bold">
                    {fmt(totalTaxable)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm font-bold text-amber-400">
                    {fmt(totalGST)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm font-bold">
                    {fmt(totalSpend)}
                  </td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

// ── Supplier profile drill-down ────────────────────────────────────
const SupplierProfile = ({
  supplier, allRows, onBack, onDeleted,
}: {
  supplier: string; allRows: Purchase[]; onBack: () => void; onDeleted: () => void;
}) => {
  const orders = useMemo(
    () => allRows.filter(d => d.supplier_name === supplier),
    [allRows, supplier]
  );

  const totalSpend   = orders.reduce((s, d) => s + d.total_amount, 0);
  const totalTaxable = orders.reduce((s, d) => s + d.taxable_amount, 0);
  const totalGST     = orders.reduce((s, d) => s + d.total_gst, 0);
  const avgOrder     = orders.length > 0 ? totalSpend / orders.length : 0;
  const lastDate     = orders.length > 0
    ? [...orders].sort((a, b) => b.purchase_date.localeCompare(a.purchase_date))[0].purchase_date
    : "";

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> All Suppliers
        </button>
        <div className="w-px h-5 bg-border" />
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold">{supplier}</h2>
            <p className="text-xs text-muted-foreground">
              {orders.length} purchase order{orders.length !== 1 ? "s" : ""} · Last order {fmtDate(lastDate)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <KPI label="Total Spend"    value={fmt(totalSpend)}   sub={`${orders.length} orders`} icon={ShoppingCart} />
        <KPI label="Taxable Amount" value={fmt(totalTaxable)} sub="excl. GST"                 icon={IndianRupee}  />
        <KPI label="GST Paid"       value={fmt(totalGST)}     sub="input tax credit"          icon={Receipt}      accent="text-amber-400" />
        <KPI label="Avg. Order"     value={fmt(avgOrder)}     sub="per purchase"              icon={TrendingDown} />
      </div>

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Purchase Orders ({orders.length})
        </p>
        <PurchaseTable rows={orders} onDeleted={onDeleted} showSupplier={false} />
      </div>
    </div>
  );
};

// ── All Purchases: supplier cards ──────────────────────────────────
const AllPurchasesTab = () => {
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const [searchTerm,       setSearchTerm]       = useState("");
  const [showAddPurchase,  setShowAddPurchase]  = useState(false);
  const [refreshKey,       setRefreshKey]       = useState(0);

  const { rows, loading, error } = usePurchases(refreshKey);
  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const supplierStats = useMemo(() => {
    const map = new Map<string, {
      totalSpend: number; orderCount: number; lastDate: string; categories: Set<string>;
    }>();

    for (const d of rows) {
      const e = map.get(d.supplier_name) ?? { totalSpend: 0, orderCount: 0, lastDate: "", categories: new Set() };
      e.totalSpend  += d.total_amount;
      e.orderCount  += 1;
      if (d.purchase_date > e.lastDate) e.lastDate = d.purchase_date;
      e.categories.add(d.category);
      map.set(d.supplier_name, e);
    }

    return [...map.entries()]
      .map(([name, s]) => ({ name, ...s, categories: [...s.categories] }))
      .sort((a, b) => b.totalSpend - a.totalSpend);
  }, [rows]);

  const totalSpend   = rows.reduce((s, d) => s + d.total_amount, 0);
  const totalGST     = rows.reduce((s, d) => s + d.total_gst, 0);
  const totalTaxable = rows.reduce((s, d) => s + d.taxable_amount, 0);

  const filtered = supplierStats.filter(s =>
    !searchTerm || s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (selectedSupplier) {
    return (
      <SupplierProfile
        supplier={selectedSupplier}
        allRows={rows}
        onBack={() => setSelectedSupplier(null)}
        onDeleted={refresh}
      />
    );
  }

  return (
    <div className="space-y-5">
      {showAddPurchase && (
        <AddPurchase onClose={() => setShowAddPurchase(false)} onSaved={refresh} />
      )}

      {error && <ErrorBanner message={error} />}

      <div className="flex items-start gap-4">
        <div className="grid grid-cols-4 gap-3 flex-1">
          <KPI
            label="Total Spend"
            value={fmt(totalSpend)}
            sub={`${supplierStats.length} supplier${supplierStats.length !== 1 ? "s" : ""}${loading ? " · syncing…" : ""}`}
            icon={ShoppingCart}
          />
          <KPI label="Taxable Amount" value={fmt(totalTaxable)} sub="excl. GST"              icon={IndianRupee}  />
          <KPI label="GST Paid"       value={fmt(totalGST)}     sub="total input tax credit" icon={Receipt}      accent="text-amber-400" />
          <KPI label="Total Orders"   value={String(rows.length)} sub="purchase orders"      icon={TrendingDown} />
        </div>
        <button
          onClick={() => setShowAddPurchase(true)}
          className="flex items-center gap-2 h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors whitespace-nowrap flex-shrink-0 mt-0.5"
        >
          <Plus className="h-4 w-4" /> Add Purchase
        </button>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
        <Input
          className="pl-7 h-8 text-xs"
          placeholder="Search suppliers…"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-5 h-36 animate-pulse bg-muted/20" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.length === 0 && !error && (
            <p className="text-sm text-muted-foreground col-span-3 py-8 text-center">
              No suppliers found.
            </p>
          )}
          {filtered.map(s => (
            <Card
              key={s.name}
              className="p-5 cursor-pointer hover:border-primary/40 hover:bg-muted/10 transition-all group"
              onClick={() => setSelectedSupplier(s.name)}
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm leading-tight group-hover:text-primary transition-colors truncate">
                    {s.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {s.categories.join(" · ")} · {s.orderCount} order{s.orderCount > 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Total Spend</p>
                  <p className="text-base font-bold tabular-nums">{fmt(s.totalSpend)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last Order</p>
                  <p className="text-sm font-medium">{fmtDate(s.lastDate)}</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{s.orderCount} purchase orders</span>
                <span className="text-xs text-primary group-hover:underline flex items-center gap-1">
                  View profile <Eye className="h-3 w-3" />
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Sub-tab (Raw Materials / Packaging) ───────────────────────────
const SubTabTable = ({
  category, title,
}: {
  category: "raw-materials" | "packaging"; title: string;
}) => {
  const [selectedSupplier, setSelectedSupplier] = useState("all");
  const [selectedMonth,    setSelectedMonth]    = useState("all");
  const [selectedYear,     setSelectedYear]     = useState("all");
  const [searchTerm,       setSearchTerm]       = useState("");
  const [refreshKey,       setRefreshKey]       = useState(0);

  const { rows, loading, error } = usePurchases(refreshKey, category);
  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const suppliers = useMemo(
    () => [...new Set(rows.map(d => d.supplier_name))].filter(Boolean).sort(),
    [rows]
  );
  const years = useMemo(
    () => [...new Set(rows.map(d => d.purchase_date.slice(0, 4)))].sort(),
    [rows]
  );

  const filtered = useMemo(() => rows.filter(d => {
    if (selectedSupplier !== "all" && d.supplier_name !== selectedSupplier) return false;
    if (selectedMonth    !== "all" && d.purchase_date.slice(5, 7) !== selectedMonth) return false;
    if (selectedYear     !== "all" && d.purchase_date.slice(0, 4) !== selectedYear)  return false;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      if (!d.invoice_no.toLowerCase().includes(s) && !d.supplier_name.toLowerCase().includes(s)) return false;
    }
    return true;
  }), [rows, selectedSupplier, selectedMonth, selectedYear, searchTerm]);

  const totalTaxable = filtered.reduce((s, d) => s + d.taxable_amount, 0);
  const totalGST     = filtered.reduce((s, d) => s + d.total_gst, 0);
  const totalSpend   = filtered.reduce((s, d) => s + d.total_amount, 0);
  const avgOrder     = filtered.length > 0 ? totalSpend / filtered.length : 0;

  const hasActiveFilters =
    selectedSupplier !== "all" || selectedMonth !== "all" ||
    selectedYear     !== "all" || !!searchTerm;

  const clearFilters = () => {
    setSelectedSupplier("all");
    setSelectedMonth("all");
    setSelectedYear("all");
    setSearchTerm("");
  };

  return (
    <div className="space-y-5">
      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-4 gap-3">
        <KPI
          label="Total Spend"
          value={fmt(totalSpend)}
          sub={`${filtered.length} records${loading ? " · syncing…" : ""}`}
          icon={ShoppingCart}
        />
        <KPI label="Taxable Amount" value={fmt(totalTaxable)} sub="excl. GST"      icon={IndianRupee}  />
        <KPI label="GST Paid"       value={fmt(totalGST)}     sub="18% input tax"  icon={Receipt}      accent="text-amber-400" />
        <KPI label="Avg. Order"     value={fmt(avgOrder)}     sub="per purchase"   icon={TrendingDown} />
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filters</span>
            {hasActiveFilters && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
          </div>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <X className="h-3 w-3" /> Clear all
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All Suppliers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Suppliers</SelectItem>
              {suppliers.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All Months" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              {MONTHS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All Years" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              className="pl-7 h-8 text-xs"
              placeholder="Search invoice, supplier…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </Card>

      <div>
        <p className="text-xs text-muted-foreground mb-2 px-1">
          Showing{" "}
          <span className="font-semibold text-foreground">{filtered.length}</span> of{" "}
          <span className="font-semibold text-foreground">{rows.length}</span>{" "}
          {title.toLowerCase()} records
        </p>
        {loading
          ? <TableSkeleton />
          : <PurchaseTable rows={filtered} onDeleted={refresh} showSupplier />
        }
      </div>
    </div>
  );
};

// ── Main ───────────────────────────────────────────────────────────
const Purchases = () => {
  const { pathname } = useLocation();

  if (pathname === "/purchases/raw-materials") return (
    <div className="space-y-5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <FlaskConical className="h-4 w-4 text-primary" />
        </div>
        <h2 className="text-xl font-bold">Raw Materials</h2>
      </div>
      <SubTabTable category="raw-materials" title="Raw Materials" />
    </div>
  );

  if (pathname === "/purchases/packaging") return (
    <div className="space-y-5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Package className="h-4 w-4 text-primary" />
        </div>
        <h2 className="text-xl font-bold">Packaging</h2>
      </div>
      <SubTabTable category="packaging" title="Packaging" />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <ShoppingCart className="h-4 w-4 text-primary" />
        </div>
        <h2 className="text-xl font-bold">All Purchases</h2>
      </div>
      <AllPurchasesTab />
    </div>
  );
};

export default Purchases;
