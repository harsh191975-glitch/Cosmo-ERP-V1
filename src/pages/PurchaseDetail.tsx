/**
 * PurchaseDetail.tsx — Business-focused purchase detail view
 * Each card provides unique information. No duplication across sections.
 */

import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getPurchaseById,
  getPurchaseLineItems,
  getSupplierById,
  deletePurchase,
  type Purchase,
  type PurchaseLineItem,
  type PurchaseSupplierRecord,
} from "@/data/purchaseStore";
import {
  ArrowLeft, Printer, Trash2, RefreshCw,
  AlertCircle, XCircle, ShoppingCart,
  Building2, Package, FlaskConical,
  Layers, MapPin, Phone,
  Hash, CalendarDays, Clock, StickyNote,
  Star, Scale, BadgePercent, ExternalLink,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────

const fmt = (n: number) =>
  "₹" + (n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtQty = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 3 });

const fmtDate = (d: string) => {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const fmtDatetime = (d: string) => {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString("en-IN", {
        day: "numeric", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
};

// ── Number to Words (Indian system) ──────────────────────────────────

const ones = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine",
  "Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
const tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];

function numToWordsLessThanThousand(n: number): string {
  if (n === 0) return "";
  if (n < 20) return ones[n];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
  return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + numToWordsLessThanThousand(n % 100) : "");
}

function numberToWords(amount: number): string {
  const n = Math.round(amount);
  const paise = Math.round((amount - Math.floor(amount)) * 100);
  if (n === 0 && paise === 0) return "Zero Rupees Only";
  const crore = Math.floor(n / 10000000);
  const lakh  = Math.floor((n % 10000000) / 100000);
  const thou  = Math.floor((n % 100000) / 1000);
  const rest  = n % 1000;
  let words = "";
  if (crore) words += numToWordsLessThanThousand(crore) + " Crore ";
  if (lakh)  words += numToWordsLessThanThousand(lakh)  + " Lakh ";
  if (thou)  words += numToWordsLessThanThousand(thou)  + " Thousand ";
  if (rest)  words += numToWordsLessThanThousand(rest);
  words = words.trim() + " Rupees";
  if (paise) words += " and " + numToWordsLessThanThousand(paise) + " Paise";
  return words + " Only";
}

// ── Print styles ──────────────────────────────────────────────────────

const PURCHASE_PRINT_STYLES = `
@media print {
  body * { visibility: hidden !important; }
  #purchase-print-area, #purchase-print-area * { visibility: visible !important; }
  #purchase-print-area {
    position: fixed !important;
    left: 0 !important; top: 0 !important;
    width: 100% !important;
    background: white !important;
    padding: 8mm 10mm !important;
  }
  @page { margin: 0; size: A4 portrait; }
}
`;

function handlePrint() {
  if (!document.getElementById("purchase-print-style")) {
    const s = document.createElement("style");
    s.id = "purchase-print-style";
    s.textContent = PURCHASE_PRINT_STYLES;
    document.head.appendChild(s);
  }
  window.print();
}

// ── Print view ────────────────────────────────────────────────────────

const PurchasePrintView = ({
  purchase, lineItems,
}: {
  purchase: Purchase & { freight?: number; notes?: string };
  lineItems: PurchaseLineItem[];
}) => {
  const border = "1px solid #000";
  const td: React.CSSProperties = { border, padding: "3px 6px", fontSize: "11px", verticalAlign: "top" };
  const totalGst = (purchase.cgst ?? 0) + (purchase.sgst ?? 0) + (purchase.igst ?? 0);
  return (
    <div id="purchase-print-area" style={{ fontFamily: "Arial, sans-serif", fontSize: "11px", color: "#000", background: "#fff", width: "100%" }}>
      <div style={{ textAlign: "center", fontWeight: "bold", fontSize: "14px", marginBottom: "5px" }}>PURCHASE BILL</div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "4px" }}>
        <tbody>
          <tr>
            <td style={{ ...td, width: "50%" }}><div style={{ fontSize: "9px" }}>Supplier</div><div style={{ fontWeight: "bold" }}>{purchase.supplier_name}</div></td>
            <td style={{ ...td, width: "25%" }}><div style={{ fontSize: "9px" }}>Invoice No.</div><div style={{ fontWeight: "bold" }}>{purchase.invoice_no}</div></td>
            <td style={{ ...td, width: "25%" }}><div style={{ fontSize: "9px" }}>Purchase Date</div><div style={{ fontWeight: "bold" }}>{fmtDate(purchase.purchase_date)}</div></td>
          </tr>
          <tr>
            <td style={{ ...td }}><div style={{ fontSize: "9px" }}>Category</div><div>{purchase.category}</div></td>
            <td style={{ ...td }}><div style={{ fontSize: "9px" }}>Notes</div><div>{(purchase as any).notes || "—"}</div></td>
            <td style={{ ...td }}><div style={{ fontSize: "9px" }}>Total GST</div><div>{fmt(totalGst)}</div></td>
          </tr>
        </tbody>
      </table>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "4px" }}>
        <thead>
          <tr>{["#","Product","Category","Qty","UOM","Rate","GST%","Taxable","GST Amt","Total"].map((h,i)=>(
            <th key={h} style={{...td,fontWeight:"bold",textAlign:i>2?"right":"left",fontSize:"10px"}}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {lineItems.map((li,i)=>(
            <tr key={li.id??i}>
              <td style={{...td,textAlign:"center"}}>{i+1}</td>
              <td style={{...td}}>{li.product_name}</td>
              <td style={{...td}}>{li.item_category}</td>
              <td style={{...td,textAlign:"right"}}>{li.quantity}</td>
              <td style={{...td,textAlign:"right"}}>{li.unit_of_measure}</td>
              <td style={{...td,textAlign:"right"}}>{fmt(li.rate)}</td>
              <td style={{...td,textAlign:"right"}}>{li.gst_pct}%</td>
              <td style={{...td,textAlign:"right"}}>{fmt(li.taxable_value)}</td>
              <td style={{...td,textAlign:"right"}}>{fmt(li.gst_amount)}</td>
              <td style={{...td,textAlign:"right",fontWeight:"bold"}}>{fmt(li.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <tr><td style={{...td,textAlign:"right"}}>Taxable Amount:</td><td style={{...td,textAlign:"right",width:"100px"}}>{fmt(purchase.taxable_amount)}</td></tr>
          {purchase.cgst>0&&<tr><td style={{...td,textAlign:"right"}}>CGST:</td><td style={{...td,textAlign:"right"}}>{fmt(purchase.cgst)}</td></tr>}
          {purchase.sgst>0&&<tr><td style={{...td,textAlign:"right"}}>SGST:</td><td style={{...td,textAlign:"right"}}>{fmt(purchase.sgst)}</td></tr>}
          {purchase.igst>0&&<tr><td style={{...td,textAlign:"right"}}>IGST:</td><td style={{...td,textAlign:"right"}}>{fmt(purchase.igst)}</td></tr>}
          {((purchase as any).freight??0)>0&&<tr><td style={{...td,textAlign:"right"}}>Freight:</td><td style={{...td,textAlign:"right"}}>{fmt((purchase as any).freight)}</td></tr>}
          <tr><td style={{...td,textAlign:"right",fontWeight:"bold"}}>TOTAL:</td><td style={{...td,textAlign:"right",fontWeight:"bold"}}>{fmt(purchase.total_amount)}</td></tr>
        </tbody>
      </table>
    </div>
  );
};

// ── Category config ───────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, { color: string; bg: string; border: string; Icon: React.ElementType }> = {
  "raw-materials": { color: "text-green-400", bg: "bg-green-950/50", border: "border-green-700/40", Icon: FlaskConical },
  "packaging":     { color: "text-amber-400", bg: "bg-amber-950/50", border: "border-amber-700/40", Icon: Package },
};
const DEFAULT_CATEGORY_CFG = { color: "text-blue-400", bg: "bg-blue-950/50", border: "border-blue-700/40", Icon: ShoppingCart };

const catLabel = (cat: string) =>
  cat === "raw-materials" ? "Raw Materials" : cat === "packaging" ? "Packaging" : cat;

// ── Shared stat row ───────────────────────────────────────────────────

const StatRow = ({
  label, value, valueClass = "",
}: {
  label: string;
  value: string | React.ReactNode;
  valueClass?: string;
}) => (
  <div className="flex items-center justify-between text-sm gap-2">
    <span className="text-muted-foreground shrink-0">{label}</span>
    <span className={`font-medium text-right ${valueClass}`}>{value}</span>
  </div>
);

// ── Supplier Card — contact info only (history belongs on Supplier Profile) ──

const SupplierCard = ({
  purchase, supplier, supplierId,
}: {
  purchase: Purchase;
  supplier: PurchaseSupplierRecord | null;
  supplierId: string;
}) => {
  const navigate = useNavigate();
  const location = [supplier?.city, supplier?.state].filter(Boolean).join(", ");
  const hasContactInfo = supplier?.mobile || location || supplier?.gstin;

  return (
    <div className="rounded-xl border border-border p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center rounded-xl w-10 h-10 bg-blue-500/10 shrink-0 mt-0.5">
          <Building2 className="h-5 w-5 text-blue-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-foreground leading-tight">{purchase.supplier_name}</p>
          {supplier?.gstin && (
            <p className="text-xs text-muted-foreground font-mono mt-0.5 tracking-wide">{supplier.gstin}</p>
          )}
        </div>
      </div>

      {/* Contact & location — only rendered when data exists */}
      {hasContactInfo && (
        <div className="space-y-2">
          {supplier?.mobile && (
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-foreground font-mono text-xs">{supplier.mobile}</span>
            </div>
          )}
          {location && (
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground text-xs">{location}</span>
            </div>
          )}
        </div>
      )}

      {/* View Supplier Profile link — only rendered when supplierId is a valid UUID */}
      {supplierId && (
        <button
          onClick={() => navigate(`/purchases/suppliers/${supplierId}`)}
          className="flex items-center gap-1.5 text-xs text-primary/70 hover:text-primary transition-colors group"
        >
          <ExternalLink className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
          View Supplier Profile
        </button>
      )}
    </div>
  );
};

// ── Additional Details Card (Option A) — unique info not shown elsewhere ──

const AdditionalDetailsCard = ({
  purchase, lineItems,
}: {
  purchase: Purchase & { freight?: number; created_at?: string; updated_at?: string };
  lineItems: PurchaseLineItem[];
}) => {
  const isPackaging = purchase.category === "packaging";
  const freight = purchase.freight ?? 0;

  // Total quantity — summed across all line items
  const totalQty = lineItems.reduce((s, li) => s + li.quantity, 0);

  // Dominant UOM (highest total qty)
  const uomTotals: Record<string, number> = {};
  lineItems.forEach(li => {
    uomTotals[li.unit_of_measure] = (uomTotals[li.unit_of_measure] ?? 0) + li.quantity;
  });
  const dominantUom = Object.entries(uomTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

  // Weighted average rate = total taxable / total qty
  const avgRate = totalQty > 0
    ? lineItems.reduce((s, li) => s + li.rate * li.quantity, 0) / totalQty
    : 0;

  const hasAuditInfo = (purchase as any).created_at;

  return (
    <div className="rounded-xl border border-border p-5 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-muted/40">
          <Scale className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {isPackaging ? "Quantity & Cost" : "Quantity & Cost"}
        </p>
      </div>

      {/* Qty & Rate — unique values not in Financial Summary */}
      {totalQty > 0 && (
        <StatRow
          label="Total Qty Purchased"
          value={`${fmtQty(totalQty)} ${dominantUom}`}
        />
      )}
      {avgRate > 0 && (
        <div className="flex items-start justify-between text-sm gap-2">
          <span className="text-muted-foreground shrink-0">Avg Rate</span>
          <div className="text-right">
            <span className="font-medium">{fmt(avgRate)}</span>
            {dominantUom && (
              <span className="text-xs text-muted-foreground ml-1">/ {dominantUom}</span>
            )}
          </div>
        </div>
      )}

      {/* Freight — only if present */}
      {freight > 0 && (
        <StatRow
          label="Freight / Cartage"
          value={fmt(freight)}
          valueClass="text-purple-400"
        />
      )}

      {/* Audit info — creation and last update timestamps */}
      {hasAuditInfo && (
        <div className="border-t border-border/50 pt-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Audit</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays className="h-3 w-3 shrink-0" />
            <span>Created {fmtDatetime((purchase as any).created_at)}</span>
          </div>
          {(purchase as any).updated_at && (purchase as any).updated_at !== (purchase as any).created_at && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" />
              <span>Updated {fmtDatetime((purchase as any).updated_at)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────

const PurchaseDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [purchase,  setPurchase]  = useState<Purchase | null>(null);
  const [lineItems, setLineItems] = useState<PurchaseLineItem[]>([]);
  const [supplier,  setSupplier]  = useState<PurchaseSupplierRecord | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleting,  setDeleting]  = useState(false);

  const fetchPurchase = useCallback(async () => {
    if (!id) return;
    setLoading(true); setLoadError(null);
    try {
      const [p, items] = await Promise.all([getPurchaseById(id), getPurchaseLineItems(id)]);
      if (!p) { setLoadError("not_found"); setLoading(false); return; }
      setPurchase(p);
      setLineItems(items);

      // Fetch supplier details non-blocking (only contact info needed)
      getSupplierById(p.supplier_id).catch(() => null).then(sup => setSupplier(sup));
    } catch (err) {
      console.error("[PurchaseDetail] fetchPurchase:", err);
      setLoadError("fetch_error");
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchPurchase(); }, [fetchPurchase]);

  const handleDelete = async () => {
    if (!purchase) return;
    if (!confirm(`Delete purchase ${purchase.invoice_no}? This will also reverse inventory stock.`)) return;
    setDeleting(true);
    try {
      await deletePurchase(purchase.id);
      navigate("/purchases");
    } catch (err: any) {
      alert(err?.message ?? "Failed to delete purchase.");
    } finally { setDeleting(false); }
  };

  // ── Loading / error ────────────────────────────────────────────────
  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <RefreshCw className="h-6 w-6 text-muted-foreground animate-spin" />
      <p className="text-sm text-muted-foreground">Loading purchase…</p>
    </div>
  );
  if (loadError === "not_found" || !purchase) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <XCircle className="h-8 w-8 text-muted-foreground" />
      <p className="text-muted-foreground">Purchase not found</p>
      <button onClick={() => navigate("/purchases")} className="text-sm text-primary hover:underline">← Back to Purchases</button>
    </div>
  );
  if (loadError === "fetch_error") return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <AlertCircle className="h-8 w-8 text-red-400" />
      <p className="text-sm text-red-400">Failed to load purchase data</p>
      <button onClick={fetchPurchase} className="text-xs px-4 py-2 rounded-lg bg-muted border border-border hover:bg-muted/80 transition-colors">Retry</button>
      <button onClick={() => navigate("/purchases")} className="text-xs text-muted-foreground hover:underline">← Back</button>
    </div>
  );

  // ── Derived values ────────────────────────────────────────────────
  const p            = purchase as Purchase & { freight?: number; notes?: string; created_at?: string; updated_at?: string };
  const catCfg       = CATEGORY_CONFIG[p.category] ?? DEFAULT_CATEGORY_CFG;
  const CategoryIcon = catCfg.Icon;
  const freight      = p.freight ?? 0;
  const totalGst     = p.cgst + p.sgst + p.igst;
  const notes        = (p as any).notes as string | undefined;

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Hidden print target */}
      <div style={{ position: "fixed", left: "-9999px", top: "0", width: "210mm", zIndex: -1 }}>
        <PurchasePrintView purchase={p} lineItems={lineItems} />
      </div>

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/purchases")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="w-px h-5 bg-border" />
          <div>
            <h2 className="text-lg font-bold">{p.invoice_no}</h2>
            <p className="text-xs text-muted-foreground">{fmtDate(p.purchase_date)} · {p.supplier_name}</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border ${catCfg.bg} ${catCfg.border} ${catCfg.color}`}>
            <CategoryIcon className="h-3 w-3" />{catLabel(p.category)}
          </span>
        </div>
        {/* Top-right actions only */}
        <div className="flex items-center gap-2">
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
            <Printer className="h-4 w-4" /> Print / Save PDF
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className="flex items-center gap-1.5 h-9 px-4 rounded-lg border border-red-700/50 text-red-400 text-sm hover:bg-red-950/25 transition-colors disabled:opacity-40">
            {deleting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {deleting ? "Deleting…" : "Delete Purchase"}
          </button>
        </div>
      </div>

      {/* ── Main Grid ── */}
      <div className="grid grid-cols-3 gap-4">

        {/* ── Left: col-span-2 ── */}
        <div className="col-span-2 space-y-4">

          {/* Supplier + Purchase Details row */}
          <div className="grid grid-cols-2 gap-4">

            {/* Supplier card — contact info only */}
            <SupplierCard
              purchase={p}
              supplier={supplier}
              supplierId={p.supplier_id}
            />

            {/* Purchase Details */}
            <div className="rounded-xl border border-border p-5 space-y-2">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-muted/40">
                  <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Purchase Details
                </p>
              </div>
              <StatRow label="Invoice No." value={p.invoice_no} />
              <StatRow label="Purchase Date" value={fmtDate(p.purchase_date)} />
              <StatRow label="Category" value={catLabel(p.category)} />
            </div>
          </div>

          {/* Line Items table */}
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Line Items ({lineItems.length})
              </p>
              <span className="text-xs text-muted-foreground">
                {fmt(p.taxable_amount)} taxable · {fmt(totalGst)} GST
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 border-b border-border text-xs">
                    <th className="px-4 py-2.5 text-left text-muted-foreground w-8">#</th>
                    <th className="px-4 py-2.5 text-left text-muted-foreground">Product</th>
                    <th className="px-4 py-2.5 text-left text-muted-foreground">Category</th>
                    <th className="px-4 py-2.5 text-right text-muted-foreground">Qty</th>
                    <th className="px-4 py-2.5 text-center text-muted-foreground">UOM</th>
                    <th className="px-4 py-2.5 text-right text-muted-foreground">Rate</th>
                    <th className="px-4 py-2.5 text-center text-muted-foreground">GST%</th>
                    <th className="px-4 py-2.5 text-right text-muted-foreground">Taxable</th>
                    <th className="px-4 py-2.5 text-right text-muted-foreground">GST Amt</th>
                    <th className="px-4 py-2.5 text-right text-muted-foreground">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-5 py-8 text-center text-sm text-muted-foreground">
                        No line items found
                      </td>
                    </tr>
                  ) : (
                    lineItems.map((li, i) => (
                      <tr key={li.id ?? i} className="border-t border-border/50 hover:bg-muted/10">
                        <td className="px-4 py-3 text-muted-foreground text-xs">{i + 1}</td>
                        <td className="px-4 py-3 font-medium">{li.product_name}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            li.item_category === "Raw Material"
                              ? "bg-green-950/40 text-green-400 border border-green-800/40"
                              : li.item_category === "Packaging"
                              ? "bg-amber-950/40 text-amber-400 border border-amber-800/40"
                              : "bg-muted/30 text-muted-foreground border border-border"
                          }`}>{li.item_category}</span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs">{li.quantity}</td>
                        <td className="px-4 py-3 text-center text-xs text-muted-foreground">{li.unit_of_measure}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">{fmt(li.rate)}</td>
                        <td className="px-4 py-3 text-center text-xs text-amber-400">{li.gst_pct}%</td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">{fmt(li.taxable_value)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs text-amber-400">{fmt(li.gst_amount)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">{fmt(li.line_total)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {lineItems.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-border bg-muted/20">
                      <td colSpan={7} className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                        Totals ({lineItems.length} items)
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-xs text-muted-foreground font-medium">
                        {fmt(lineItems.reduce((s, li) => s + li.taxable_value, 0))}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-xs text-amber-400 font-medium">
                        {fmt(lineItems.reduce((s, li) => s + li.gst_amount, 0))}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-xs font-bold">
                        {fmt(lineItems.reduce((s, li) => s + li.line_total, 0))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

        </div>{/* end col-span-2 */}

        {/* ── Right Sidebar ── */}
        <div className="space-y-4">

          {/* Financial Summary */}
          <div className="rounded-xl border border-border p-5 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-muted/40">
                <Layers className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Financial Summary
              </p>
            </div>
            {[
              { label: "Taxable Amount", value: p.taxable_amount, color: "" },
              ...(p.cgst  > 0 ? [{ label: "CGST",    value: p.cgst,   color: "text-amber-400"  }] : []),
              ...(p.sgst  > 0 ? [{ label: "SGST",    value: p.sgst,   color: "text-amber-400"  }] : []),
              ...(p.igst  > 0 ? [{ label: "IGST",    value: p.igst,   color: "text-orange-400" }] : []),
              ...(freight > 0 ? [{ label: "Freight / Cartage", value: freight, color: "text-purple-400" }] : []),
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className={`tabular-nums font-medium ${color}`}>{fmt(value)}</span>
              </div>
            ))}
            <div className="border-t border-border pt-3 flex items-center justify-between">
              <span className="font-bold">Total Purchase</span>
              <span className="font-bold text-lg tabular-nums">{fmt(p.total_amount)}</span>
            </div>
          </div>

          {/* Additional Details — unique qty/cost/audit info not shown elsewhere */}
          <AdditionalDetailsCard purchase={p} lineItems={lineItems} />

          {/* Notes — shown only when notes exist */}
          {notes && notes.trim().length > 0 && (
            <div className="rounded-xl border border-border p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-muted/40">
                  <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes</p>
              </div>
              <p className="text-sm leading-relaxed text-foreground/80 italic">{notes}</p>
            </div>
          )}

          {/* Amount in Words */}
          <div className="rounded-xl border border-border p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Star className="h-3 w-3 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Amount in Words</p>
            </div>
            <p className="text-xs leading-relaxed italic">{numberToWords(p.total_amount)}</p>
          </div>

        </div>{/* end sidebar */}
      </div>{/* end grid */}
    </div>
  );
};

export default PurchaseDetail;
