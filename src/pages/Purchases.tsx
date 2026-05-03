/**
 * Purchases.tsx — Premium UI Upgrade
 * ─────────────────────────────────────────────────────────────────
 * All backend logic, data structures, and core layout hierarchy are
 * preserved exactly. Only visual / styling layer has been elevated.
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

// ── Helpers (unchanged) ─────────────────────────────────────────────
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

// ── Design tokens (CSS-in-JS inline — zero new deps) ───────────────
//
//  All colours live here so they're easy to remap to CSS vars later.
//  If your project already has a Tailwind config, you can replace
//  the inline `style` props with custom utility classes.
//
const TOKEN = {
  // Surfaces
  cardBg:         "linear-gradient(145deg, rgba(15,23,42,0.95) 0%, rgba(20,30,55,0.95) 100%)",
  cardBorder:     "1px solid rgba(99,179,237,0.10)",
  cardShadow:     "0 4px 24px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.04)",
  cardHoverShadow:"0 8px 40px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)",

  // Icon containers
  iconBlueBg:  "rgba(59,130,246,0.15)",
  iconGreenBg: "rgba(16,185,129,0.15)",
  iconAmberBg: "rgba(245,158,11,0.15)",

  // Text
  textPrimary:  "#f0f6ff",
  textMuted:    "rgba(148,163,184,0.85)",
  textFaint:    "rgba(100,116,139,0.70)",

  // Accents
  blue:  "#60a5fa",
  green: "#34d399",
  amber: "#fbbf24",
} as const;

// ── Tiny noise texture overlay (SVG base64, < 1 KB) ────────────────
const noiseSvg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`;

// ── Shared card style (apply via inline style) ─────────────────────
const premiumCard: React.CSSProperties = {
  background: TOKEN.cardBg,
  border: TOKEN.cardBorder,
  boxShadow: TOKEN.cardShadow,
  borderRadius: "14px",
  position: "relative",
  overflow: "hidden",
  transition: "box-shadow 200ms ease, transform 200ms ease, border-color 200ms ease",
};

// ── Hover hook ──────────────────────────────────────────────────────
function useHover() {
  const [hovered, setHovered] = useState(false);
  return {
    hovered,
    handlers: {
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
    },
  };
}

// ── KPI Card (premium) ──────────────────────────────────────────────
const KPI = ({
  label, value, sub, accent, icon: Icon, iconVariant = "blue",
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  icon: React.ElementType;
  iconVariant?: "blue" | "green" | "amber";
}) => {
  const { hovered, handlers } = useHover();

  const iconBg = {
    blue:  TOKEN.iconBlueBg,
    green: TOKEN.iconGreenBg,
    amber: TOKEN.iconAmberBg,
  }[iconVariant];

  const iconColor = {
    blue:  TOKEN.blue,
    green: TOKEN.green,
    amber: TOKEN.amber,
  }[iconVariant];

  const valueColor = accent === "text-amber-400"
    ? TOKEN.amber
    : accent === "text-green-400"
    ? TOKEN.green
    : TOKEN.textPrimary;

  return (
    <div
      {...handlers}
      style={{
        ...premiumCard,
        padding: "18px 20px",
        display: "flex",
        alignItems: "center",
        gap: "16px",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        boxShadow: hovered ? TOKEN.cardHoverShadow : TOKEN.cardShadow,
        borderColor: hovered ? "rgba(99,179,237,0.20)" : "rgba(99,179,237,0.10)",
        cursor: "default",
        backgroundImage: noiseSvg,
      }}
    >
      {/* icon container */}
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 12,
          background: iconBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          boxShadow: hovered ? `0 0 14px ${iconColor}55` : "none",
          transition: "box-shadow 200ms ease",
        }}
      >
        <Icon style={{ width: 18, height: 18, color: iconColor }} />
      </div>

      <div>
        <p style={{ fontSize: 11, color: TOKEN.textMuted, letterSpacing: "0.04em", marginBottom: 2 }}>
          {label}
        </p>
        <p style={{ fontSize: 18, fontWeight: 700, color: valueColor, lineHeight: 1.2, letterSpacing: "-0.01em" }}>
          {value}
        </p>
        {sub && (
          <p style={{ fontSize: 11, color: TOKEN.textFaint, marginTop: 3 }}>{sub}</p>
        )}
      </div>
    </div>
  );
};

// ── Sort Icon (unchanged logic) ─────────────────────────────────────
const SortIcon = ({ col, sortKey, sortDir }: {
  col: string; sortKey: string; sortDir: "asc" | "desc";
}) =>
  sortKey !== col
    ? <ArrowUpDown className="ml-1.5 h-3 w-3 inline opacity-25" />
    : sortDir === "asc"
      ? <ArrowUp   style={{ marginLeft: 6, width: 12, height: 12, display: "inline", color: TOKEN.blue }} />
      : <ArrowDown style={{ marginLeft: 6, width: 12, height: 12, display: "inline", color: TOKEN.blue }} />;

// ── Error banner ────────────────────────────────────────────────────
const ErrorBanner = ({ message }: { message: string }) => (
  <div style={{
    display: "flex",
    alignItems: "center",
    gap: 10,
    borderRadius: 10,
    border: "1px solid rgba(239,68,68,0.25)",
    background: "rgba(127,29,29,0.30)",
    padding: "12px 16px",
    fontSize: 13,
    color: "#f87171",
  }}>
    <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
    <span>{message}</span>
  </div>
);

// ── Skeleton loader ─────────────────────────────────────────────────
const TableSkeleton = () => (
  <div style={{ ...premiumCard, padding: 16 }}>
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 38,
            borderRadius: 8,
            background: "rgba(148,163,184,0.07)",
            animation: "pulse 1.5s ease-in-out infinite",
            animationDelay: `${i * 80}ms`,
          }}
        />
      ))}
    </div>
  </div>
);

// ── Hook: fetch all (or category-filtered) purchases ───────────────
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

// ── Purchase detail panel (premium) ────────────────────────────────
const PurchaseDetail = ({ row, onClose }: { row: Purchase; onClose: () => void }) => (
  <div style={{
    ...premiumCard,
    marginBottom: 16,
    boxShadow: "0 8px 48px rgba(0,0,0,0.60)",
  }}>
    {/* Header bar */}
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "14px 20px",
      background: "rgba(59,130,246,0.06)",
      borderBottom: "1px solid rgba(99,179,237,0.10)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={onClose}
          style={{
            padding: 6,
            borderRadius: 8,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: TOKEN.textMuted,
            display: "flex",
            transition: "color 150ms",
          }}
          onMouseEnter={e => (e.currentTarget.style.color = TOKEN.textPrimary)}
          onMouseLeave={e => (e.currentTarget.style.color = TOKEN.textMuted)}
        >
          <ArrowLeft style={{ width: 16, height: 16 }} />
        </button>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: TOKEN.textPrimary }}>{row.invoice_no}</p>
          <p style={{ fontSize: 11, color: TOKEN.textMuted, marginTop: 1 }}>
            {row.supplier_name} · {fmtDate(row.purchase_date)}
          </p>
        </div>
      </div>
      <button
        onClick={onClose}
        style={{
          padding: 6,
          borderRadius: 8,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: TOKEN.textMuted,
          display: "flex",
        }}
        onMouseEnter={e => (e.currentTarget.style.color = TOKEN.textPrimary)}
        onMouseLeave={e => (e.currentTarget.style.color = TOKEN.textMuted)}
      >
        <XCircle style={{ width: 16, height: 16 }} />
      </button>
    </div>

    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header fields */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
        {([
          ["Supplier",    row.supplier_name],
          ["Invoice No.", row.invoice_no],
          ["Date",        fmtDate(row.purchase_date)],
          ["Category",    row.category],
        ] as [string, string][]).map(([l, v]) => (
          <div
            key={l}
            style={{
              borderRadius: 10,
              background: "rgba(148,163,184,0.06)",
              border: "1px solid rgba(148,163,184,0.08)",
              padding: "10px 14px",
            }}
          >
            <p style={{ fontSize: 10, color: TOKEN.textFaint, marginBottom: 4, letterSpacing: "0.04em" }}>{l}</p>
            <p style={{ fontSize: 13, fontWeight: 500, color: TOKEN.textPrimary, textTransform: "capitalize" }}>
              {v?.replace("-", " ")}
            </p>
          </div>
        ))}
      </div>

      {/* Line items table */}
      {row.line_items.length > 0 && (
        <div style={{ borderRadius: 10, border: "1px solid rgba(148,163,184,0.08)", overflow: "hidden" }}>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(148,163,184,0.06)", borderBottom: "1px solid rgba(148,163,184,0.08)" }}>
                {["Product","Category","Qty","UOM","Rate","Taxable","Total"].map(h => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 12px",
                      textAlign: ["Qty","Rate","Taxable","Total"].includes(h) ? "right" : "left",
                      fontWeight: 500,
                      color: TOKEN.textMuted,
                      letterSpacing: "0.03em",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {row.line_items.map((li, idx) => (
                <tr
                  key={li.id ?? idx}
                  style={{
                    borderTop: "1px solid rgba(148,163,184,0.06)",
                    background: idx % 2 === 1 ? "rgba(148,163,184,0.02)" : "transparent",
                    transition: "background 120ms",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(59,130,246,0.05)")}
                  onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 1 ? "rgba(148,163,184,0.02)" : "transparent")}
                >
                  <td style={{ padding: "9px 12px", fontWeight: 500, color: TOKEN.textPrimary }}>{li.product_name}</td>
                  <td style={{ padding: "9px 12px", color: TOKEN.textMuted }}>{li.item_category}</td>
                  <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: TOKEN.textPrimary }}>{li.quantity}</td>
                  <td style={{ padding: "9px 12px", color: TOKEN.textMuted }}>{li.unit_of_measure}</td>
                  <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: TOKEN.textPrimary }}>{fmtFull(li.rate)}</td>
                  <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: TOKEN.textPrimary }}>{fmtFull(li.taxable_value)}</td>
                  <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: TOKEN.blue }}>{fmtFull(li.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Totals footer */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 28,
        paddingTop: 12,
        borderTop: "1px solid rgba(148,163,184,0.08)",
        fontSize: 13,
      }}>
        <div style={{ color: TOKEN.textMuted }}>
          Taxable <span style={{ fontWeight: 600, color: TOKEN.textPrimary, marginLeft: 6 }}>{fmtFull(row.taxable_amount)}</span>
        </div>
        {(row.cgst > 0 || row.sgst > 0) && (
          <div style={{ color: TOKEN.textMuted }}>
            CGST+SGST <span style={{ fontWeight: 600, color: TOKEN.amber, marginLeft: 6 }}>{fmtFull(row.cgst + row.sgst)}</span>
          </div>
        )}
        {row.igst > 0 && (
          <div style={{ color: TOKEN.textMuted }}>
            IGST <span style={{ fontWeight: 600, color: TOKEN.amber, marginLeft: 6 }}>{fmtFull(row.igst)}</span>
          </div>
        )}
        <div style={{ color: TOKEN.textMuted }}>
          Total <span style={{ fontWeight: 700, fontSize: 16, color: TOKEN.textPrimary, marginLeft: 6 }}>{fmtFull(row.total_amount)}</span>
        </div>
      </div>
    </div>
  </div>
);

// ── Purchases table (premium) ───────────────────────────────────────
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

  const rightAligned = new Set(["taxable_amount","total_gst","total_amount"]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {deleteErr && <ErrorBanner message={deleteErr} />}
      {viewRow && <PurchaseDetail row={viewRow} onClose={() => setViewRow(null)} />}

      <div style={{ ...premiumCard, padding: 0 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{
                borderBottom: "1px solid rgba(148,163,184,0.10)",
                background: "rgba(148,163,184,0.04)",
              }}>
                {cols.map(([key, label]) => (
                  <th
                    key={key}
                    onClick={() => handleSort(key)}
                    style={{
                      padding: "13px 16px",
                      textAlign: rightAligned.has(key) ? "right" : "left",
                      fontSize: 11,
                      fontWeight: 600,
                      color: TOKEN.textMuted,
                      cursor: "pointer",
                      userSelect: "none",
                      letterSpacing: "0.05em",
                      whiteSpace: "nowrap",
                      transition: "color 120ms",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = TOKEN.textPrimary)}
                    onMouseLeave={e => (e.currentTarget.style.color = TOKEN.textMuted)}
                  >
                    {label}
                    <SortIcon col={key} sortKey={sortKey} sortDir={sortDir} />
                  </th>
                ))}
                <th style={{ padding: "13px 12px", width: 80, fontSize: 11, fontWeight: 600, color: TOKEN.textMuted, textAlign: "center", letterSpacing: "0.05em" }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={cols.length + 1}
                    style={{ padding: "48px 16px", textAlign: "center", fontSize: 13, color: TOKEN.textFaint }}
                  >
                    No records found
                  </td>
                </tr>
              ) : (
                sorted.map((d, idx) => {
                  const isDeleting = deletingId === d.id;
                  const isEven = idx % 2 === 0;
                  return (
                    <PurchaseRow
                      key={d.id}
                      d={d}
                      isEven={isEven}
                      isDeleting={isDeleting}
                      showSupplier={showSupplier}
                      viewRow={viewRow}
                      onView={() => setViewRow(viewRow?.id === d.id ? null : d)}
                      onDelete={() => handleDelete(d)}
                    />
                  );
                })
              )}

              {sorted.length > 0 && (
                <tr style={{
                  borderTop: "2px solid rgba(99,179,237,0.12)",
                  background: "rgba(59,130,246,0.04)",
                }}>
                  <td
                    colSpan={showSupplier ? 3 : 2}
                    style={{
                      padding: "12px 16px",
                      textAlign: "right",
                      fontSize: 11,
                      fontWeight: 700,
                      color: TOKEN.textMuted,
                      letterSpacing: "0.07em",
                      textTransform: "uppercase",
                    }}
                  >
                    Totals ({sorted.length})
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 13, fontWeight: 700, color: TOKEN.textPrimary }}>
                    {fmt(totalTaxable)}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 13, fontWeight: 700, color: TOKEN.amber }}>
                    {fmt(totalGST)}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 13, fontWeight: 700, color: TOKEN.blue }}>
                    {fmt(totalSpend)}
                  </td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ── Table row (extracted for per-row hover state) ───────────────────
const PurchaseRow = ({
  d, isEven, isDeleting, showSupplier, viewRow, onView, onDelete,
}: {
  d: Purchase;
  isEven: boolean;
  isDeleting: boolean;
  showSupplier: boolean;
  viewRow: Purchase | null;
  onView: () => void;
  onDelete: () => void;
}) => {
  const [hovered, setHovered] = useState(false);

  const rowBg = hovered
    ? "rgba(59,130,246,0.06)"
    : isEven
    ? "transparent"
    : "rgba(148,163,184,0.02)";

  return (
    <tr
      style={{
        borderTop: "1px solid rgba(148,163,184,0.06)",
        background: rowBg,
        transition: "background 120ms",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <td style={{ padding: "12px 16px", fontSize: 12, color: TOKEN.textMuted, whiteSpace: "nowrap" }}>
        {fmtDate(d.purchase_date)}
      </td>
      <td style={{ padding: "12px 16px", fontFamily: "monospace", fontSize: 12, color: TOKEN.textMuted }}>
        {d.invoice_no}
      </td>
      {showSupplier && (
        <td style={{ padding: "12px 16px", fontWeight: 500, fontSize: 13, color: TOKEN.textPrimary }}>
          {d.supplier_name}
        </td>
      )}
      <td style={{ padding: "12px 16px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 13, color: TOKEN.textPrimary }}>
        {fmt(d.taxable_amount)}
      </td>
      <td style={{ padding: "12px 16px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 13, color: TOKEN.amber, fontWeight: 500 }}>
        {fmt(d.total_gst)}
      </td>
      <td style={{ padding: "12px 16px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 13, fontWeight: 700, color: TOKEN.blue }}>
        {fmt(d.total_amount)}
      </td>
      <td style={{ padding: "12px 12px" }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          justifyContent: "center",
          opacity: hovered ? 1 : 0,
          transition: "opacity 150ms",
        }}>
          <button
            onClick={onView}
            title="View detail"
            style={{
              padding: 7,
              borderRadius: 8,
              background: viewRow?.id === d.id ? "rgba(59,130,246,0.20)" : "transparent",
              border: "none",
              cursor: "pointer",
              color: TOKEN.textMuted,
              display: "flex",
              transition: "background 120ms, color 120ms",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = "rgba(59,130,246,0.18)";
              e.currentTarget.style.color = TOKEN.blue;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = TOKEN.textMuted;
            }}
          >
            <Eye style={{ width: 14, height: 14 }} />
          </button>
          <button
            onClick={onDelete}
            disabled={isDeleting}
            title="Delete purchase"
            style={{
              padding: 7,
              borderRadius: 8,
              background: "transparent",
              border: "none",
              cursor: isDeleting ? "not-allowed" : "pointer",
              color: TOKEN.textMuted,
              display: "flex",
              opacity: isDeleting ? 0.4 : 1,
              transition: "background 120ms, color 120ms",
            }}
            onMouseEnter={e => {
              if (!isDeleting) {
                e.currentTarget.style.background = "rgba(239,68,68,0.15)";
                e.currentTarget.style.color = "#f87171";
              }
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = TOKEN.textMuted;
            }}
          >
            {isDeleting
              ? <RefreshCw style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
              : <Trash2    style={{ width: 14, height: 14 }} />
            }
          </button>
        </div>
      </td>
    </tr>
  );
};

// ── Supplier profile drill-down (premium) ───────────────────────────
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
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Back nav + supplier header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={onBack}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: TOKEN.textMuted,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "6px 10px",
            borderRadius: 8,
            transition: "color 150ms, background 150ms",
          }}
          onMouseEnter={e => { e.currentTarget.style.color = TOKEN.textPrimary; e.currentTarget.style.background = "rgba(148,163,184,0.08)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = TOKEN.textMuted; e.currentTarget.style.background = "transparent"; }}
        >
          <ArrowLeft style={{ width: 15, height: 15 }} /> All Suppliers
        </button>
        <div style={{ width: 1, height: 20, background: "rgba(148,163,184,0.15)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: TOKEN.iconBlueBg,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 0 16px ${TOKEN.blue}30`,
          }}>
            <Building2 style={{ width: 18, height: 18, color: TOKEN.blue }} />
          </div>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: TOKEN.textPrimary, letterSpacing: "-0.01em" }}>{supplier}</h2>
            <p style={{ fontSize: 11, color: TOKEN.textMuted, marginTop: 2 }}>
              {orders.length} purchase order{orders.length !== 1 ? "s" : ""} · Last order {fmtDate(lastDate)}
            </p>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        <KPI label="Total Spend"    value={fmt(totalSpend)}   sub={`${orders.length} orders`}   icon={ShoppingCart} iconVariant="blue"  />
        <KPI label="Taxable Amount" value={fmt(totalTaxable)} sub="excl. GST"                    icon={IndianRupee}  iconVariant="green" />
        <KPI label="GST Paid"       value={fmt(totalGST)}     sub="input tax credit"             icon={Receipt}      iconVariant="amber" accent="text-amber-400" />
        <KPI label="Avg. Order"     value={fmt(avgOrder)}     sub="per purchase"                 icon={TrendingDown} iconVariant="blue"  />
      </div>

      <div>
        <p style={{ fontSize: 11, fontWeight: 600, color: TOKEN.textFaint, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 12 }}>
          Purchase Orders ({orders.length})
        </p>
        <PurchaseTable rows={orders} onDeleted={onDeleted} showSupplier={false} />
      </div>
    </div>
  );
};

// ── Supplier card ───────────────────────────────────────────────────
const SupplierCard = ({
  s, maxSpend, onClick,
}: {
  s: { name: string; totalSpend: number; orderCount: number; lastDate: string; categories: string[] };
  maxSpend: number;
  onClick: () => void;
}) => {
  const { hovered, handlers } = useHover();
  const spendPct = maxSpend > 0 ? Math.min((s.totalSpend / maxSpend) * 100, 100) : 0;

  return (
    <div
      {...handlers}
      onClick={onClick}
      style={{
        ...premiumCard,
        padding: 20,
        cursor: "pointer",
        transform: hovered ? "translateY(-3px)" : "translateY(0)",
        boxShadow: hovered ? TOKEN.cardHoverShadow : TOKEN.cardShadow,
        borderColor: hovered ? "rgba(99,179,237,0.22)" : "rgba(99,179,237,0.10)",
        backgroundImage: noiseSvg,
      }}
    >
      {/* Top: icon + name */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 12,
          background: TOKEN.iconBlueBg,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
          boxShadow: hovered ? `0 0 18px ${TOKEN.blue}45` : "none",
          transition: "box-shadow 200ms",
        }}>
          <Building2 style={{ width: 19, height: 19, color: TOKEN.blue }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontWeight: 700,
            fontSize: 14,
            color: hovered ? TOKEN.blue : TOKEN.textPrimary,
            transition: "color 200ms",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            letterSpacing: "-0.01em",
          }}>
            {s.name}
          </p>
          <p style={{ fontSize: 11, color: TOKEN.textMuted, marginTop: 2 }}>
            {s.categories.join(" · ")} · {s.orderCount} order{s.orderCount > 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Spend + last order */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
        <div>
          <p style={{ fontSize: 10, color: TOKEN.textFaint, marginBottom: 3, letterSpacing: "0.04em" }}>Total Spend</p>
          <p style={{ fontSize: 18, fontWeight: 700, color: TOKEN.textPrimary, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>
            {fmt(s.totalSpend)}
          </p>
        </div>
        <div>
          <p style={{ fontSize: 10, color: TOKEN.textFaint, marginBottom: 3, letterSpacing: "0.04em" }}>Last Order</p>
          <p style={{ fontSize: 13, fontWeight: 500, color: TOKEN.textPrimary }}>{fmtDate(s.lastDate)}</p>
        </div>
      </div>

      {/* Spend contribution bar */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={{ fontSize: 10, color: TOKEN.textFaint, letterSpacing: "0.04em" }}>Spend share</span>
          <span style={{ fontSize: 10, color: TOKEN.textMuted, fontVariantNumeric: "tabular-nums" }}>{spendPct.toFixed(1)}%</span>
        </div>
        <div style={{ height: 4, borderRadius: 99, background: "rgba(148,163,184,0.10)", overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${spendPct}%`,
              borderRadius: 99,
              background: `linear-gradient(90deg, ${TOKEN.blue}, #818cf8)`,
              transition: "width 600ms cubic-bezier(.4,0,.2,1)",
              boxShadow: `0 0 8px ${TOKEN.blue}80`,
            }}
          />
        </div>
      </div>

      {/* Footer */}
      <div style={{
        paddingTop: 12,
        borderTop: "1px solid rgba(148,163,184,0.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{ fontSize: 11, color: TOKEN.textFaint }}>{s.orderCount} purchase orders</span>
        <span style={{
          fontSize: 11,
          color: hovered ? TOKEN.blue : TOKEN.textMuted,
          display: "flex",
          alignItems: "center",
          gap: 4,
          transition: "color 200ms",
        }}>
          View profile <Eye style={{ width: 12, height: 12 }} />
        </span>
      </div>
    </div>
  );
};

// ── All Purchases: supplier cards ───────────────────────────────────
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
  const maxSpend     = supplierStats[0]?.totalSpend ?? 1;

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
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {showAddPurchase && (
        <AddPurchase onClose={() => setShowAddPurchase(false)} onSaved={refresh} />
      )}

      {error && <ErrorBanner message={error} />}

      {/* KPIs + Add button */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, flex: 1 }}>
          <KPI
            label="Total Spend"
            value={fmt(totalSpend)}
            sub={`${supplierStats.length} supplier${supplierStats.length !== 1 ? "s" : ""}${loading ? " · syncing…" : ""}`}
            icon={ShoppingCart}
            iconVariant="blue"
          />
          <KPI label="Taxable Amount" value={fmt(totalTaxable)} sub="excl. GST"              icon={IndianRupee}  iconVariant="green" />
          <KPI label="GST Paid"       value={fmt(totalGST)}     sub="total input tax credit" icon={Receipt}      iconVariant="amber" accent="text-amber-400" />
          <KPI label="Total Orders"   value={String(rows.length)} sub="purchase orders"      icon={TrendingDown} iconVariant="blue"  />
        </div>

        {/* Add Purchase button */}
        <AddPurchaseButton onClick={() => setShowAddPurchase(true)} />
      </div>

      {/* Search */}
      <div style={{ position: "relative", maxWidth: 280 }}>
        <Search style={{
          position: "absolute", left: 10, top: "50%",
          transform: "translateY(-50%)", width: 13, height: 13, color: TOKEN.textFaint,
        }} />
        <input
          style={{
            width: "100%",
            paddingLeft: 30,
            paddingRight: 12,
            height: 34,
            borderRadius: 9,
            background: "rgba(148,163,184,0.07)",
            border: "1px solid rgba(148,163,184,0.10)",
            color: TOKEN.textPrimary,
            fontSize: 12,
            outline: "none",
            boxSizing: "border-box",
          }}
          placeholder="Search suppliers…"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Supplier grid */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              style={{
                ...premiumCard,
                height: 148,
                animation: "pulse 1.5s ease-in-out infinite",
                animationDelay: `${i * 100}ms`,
              }}
            />
          ))}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px,1fr))", gap: 16 }}>
          {filtered.length === 0 && !error && (
            <p style={{ fontSize: 13, color: TOKEN.textFaint, gridColumn: "1/-1", textAlign: "center", padding: "32px 0" }}>
              No suppliers found.
            </p>
          )}
          {filtered.map(s => (
            <SupplierCard
              key={s.name}
              s={s}
              maxSpend={maxSpend}
              onClick={() => setSelectedSupplier(s.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ── Add Purchase button (isolated for clean hover state) ─────────────
const AddPurchaseButton = ({ onClick }: { onClick: () => void }) => {
  const { hovered, handlers } = useHover();
  return (
    <button
      {...handlers}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 40,
        padding: "0 20px",
        borderRadius: 12,
        background: hovered
          ? "linear-gradient(135deg,#3b82f6,#6366f1)"
          : "linear-gradient(135deg,#2563eb,#4f46e5)",
        color: "#fff",
        fontSize: 13,
        fontWeight: 600,
        border: "none",
        cursor: "pointer",
        whiteSpace: "nowrap",
        flexShrink: 0,
        marginTop: 2,
        boxShadow: hovered
          ? "0 0 24px rgba(99,102,241,0.55)"
          : "0 4px 14px rgba(37,99,235,0.35)",
        transform: hovered ? "translateY(-1px)" : "translateY(0)",
        transition: "all 180ms ease",
        letterSpacing: "0.01em",
      }}
    >
      <Plus style={{ width: 15, height: 15 }} /> Add Purchase
    </button>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {error && <ErrorBanner message={error} />}

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        <KPI
          label="Total Spend"
          value={fmt(totalSpend)}
          sub={`${filtered.length} records${loading ? " · syncing…" : ""}`}
          icon={ShoppingCart}
          iconVariant="blue"
        />
        <KPI label="Taxable Amount" value={fmt(totalTaxable)} sub="excl. GST"     icon={IndianRupee}  iconVariant="green" />
        <KPI label="GST Paid"       value={fmt(totalGST)}     sub="18% input tax" icon={Receipt}      iconVariant="amber" accent="text-amber-400" />
        <KPI label="Avg. Order"     value={fmt(avgOrder)}     sub="per purchase"  icon={TrendingDown} iconVariant="blue"  />
      </div>

      {/* Filter card */}
      <div style={{ ...premiumCard, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <SlidersHorizontal style={{ width: 13, height: 13, color: TOKEN.textMuted }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: TOKEN.textMuted, textTransform: "uppercase", letterSpacing: "0.07em" }}>
              Filters
            </span>
            {hasActiveFilters && (
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: TOKEN.blue, boxShadow: `0 0 6px ${TOKEN.blue}` }} />
            )}
          </div>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              style={{
                fontSize: 11,
                color: TOKEN.textMuted,
                background: "none",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
                transition: "color 150ms",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = TOKEN.textPrimary)}
              onMouseLeave={e => (e.currentTarget.style.color = TOKEN.textMuted)}
            >
              <X style={{ width: 11, height: 11 }} /> Clear all
            </button>
          )}
        </div>

        {/* Shadcn selects + search — unchanged, just re-wrapped */}
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
      </div>

      {/* Table */}
      <div>
        <p style={{ fontSize: 11, color: TOKEN.textFaint, marginBottom: 10, paddingLeft: 2 }}>
          Showing{" "}
          <span style={{ fontWeight: 600, color: TOKEN.textPrimary }}>{filtered.length}</span>{" "}
          of{" "}
          <span style={{ fontWeight: 600, color: TOKEN.textPrimary }}>{rows.length}</span>{" "}
          {title.toLowerCase()} records
        </p>
        {loading ? <TableSkeleton /> : <PurchaseTable rows={filtered} onDeleted={refresh} showSupplier />}
      </div>
    </div>
  );
};

// ── Page header helper ──────────────────────────────────────────────
const PageHeader = ({
  icon: Icon, label, iconVariant = "blue",
}: {
  icon: React.ElementType;
  label: string;
  iconVariant?: "blue" | "green" | "amber";
}) => {
  const iconColor = { blue: TOKEN.blue, green: TOKEN.green, amber: TOKEN.amber }[iconVariant];
  const iconBg    = { blue: TOKEN.iconBlueBg, green: TOKEN.iconGreenBg, amber: TOKEN.iconAmberBg }[iconVariant];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: iconBg,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: `0 0 14px ${iconColor}40`,
      }}>
        <Icon style={{ width: 17, height: 17, color: iconColor }} />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: TOKEN.textPrimary, letterSpacing: "-0.02em" }}>
        {label}
      </h2>
    </div>
  );
};

// ── Main ────────────────────────────────────────────────────────────
const Purchases = () => {
  const { pathname } = useLocation();

  if (pathname === "/purchases/raw-materials") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader icon={FlaskConical} label="Raw Materials" iconVariant="green" />
      <SubTabTable category="raw-materials" title="Raw Materials" />
    </div>
  );

  if (pathname === "/purchases/packaging") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader icon={Package} label="Packaging" iconVariant="amber" />
      <SubTabTable category="packaging" title="Packaging" />
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader icon={ShoppingCart} label="All Purchases" iconVariant="blue" />
      <AllPurchasesTab />
    </div>
  );
};

export default Purchases;
