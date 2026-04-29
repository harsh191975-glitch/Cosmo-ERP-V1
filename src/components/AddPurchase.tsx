import { useState, useMemo, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  X, Plus, Trash2, RefreshCw, Check, AlertCircle,
  ShoppingCart, ChevronDown, ChevronUp,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────
interface InventoryItem {
  id: string;
  item_name: string;
  sku_code: string;
  category: string;
  unit_of_measure: string;
  buy_rate: number;
}

interface Supplier {
  id: string;
  name: string;
}

interface LineItemDraft {
  uid:               string;
  inventory_item_id: string;       // "" = custom / not linked
  product_name:      string;
  item_category:     string;
  quantity:          number | "";
  unit_of_measure:   string;
  rate:              number | "";
  gst_pct:           number;
  // calculated
  taxable_value:     number;
  gst_amount:        number;
  line_total:        number;
}

const GST_OPTIONS = [0, 5, 12, 18, 28];

const ITEM_CATEGORIES = [
  "Raw Material",
  "Packaging",
  "Finished Good",
  "Other",
];

const r2 = (n: number) => Math.round(n * 100) / 100;

function calcLine(quantity: number, rate: number, gst_pct: number) {
  const taxable_value = r2(quantity * rate);
  const gst_amount    = r2(taxable_value * gst_pct / 100);
  const line_total    = r2(taxable_value + gst_amount);
  return { taxable_value, gst_amount, line_total };
}

function blankLine(): LineItemDraft {
  return {
    uid:               crypto.randomUUID(),
    inventory_item_id: "",
    product_name:      "",
    item_category:     "Raw Material",
    quantity:          "",
    unit_of_measure:   "MT",
    rate:              "",
    gst_pct:           18,
    taxable_value:     0,
    gst_amount:        0,
    line_total:        0,
  };
}

// ── Label ──────────────────────────────────────────────────────
const L = ({ children, req }: { children: React.ReactNode; req?: boolean }) => (
  <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
    {children}{req && <span className="text-red-400 ml-0.5">*</span>}
  </label>
);

// ══════════════════════════════════════════════════════════════
// ADD PURCHASE MODAL
// ══════════════════════════════════════════════════════════════
interface AddPurchaseProps {
  onClose:  () => void;
  onSaved:  () => void;    // parent refreshes list after save
}

export const AddPurchase = ({ onClose, onSaved }: AddPurchaseProps) => {
  // ── Master data ────────────────────────────────────────────
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [suppliers,      setSuppliers]      = useState<Supplier[]>([]);
  const [loadingMaster,  setLoadingMaster]  = useState(true);

  useEffect(() => {
    const load = async () => {
      const [{ data: inv }, { data: sup }] = await Promise.all([
        supabase.from("inventory_items").select("id,item_name,sku_code,category,unit_of_measure,buy_rate").order("item_name"),
        supabase.from("purchase_suppliers").select("id,name").order("name"),
      ]);
      setInventoryItems(inv ?? []);
      setSuppliers(sup ?? []);
      setLoadingMaster(false);
    };
    load();
  }, []);

  // ── Form state ─────────────────────────────────────────────
  const [supplierId,  setSupplierId]  = useState("");
  const [supplierName,setSupplierName]= useState("");
  const [invoiceNo,   setInvoiceNo]   = useState("");
  const [date,        setDate]        = useState(new Date().toISOString().split("T")[0]);
  const [category,    setCategory]    = useState<"raw-materials" | "packaging">("raw-materials");
  const [freight,     setFreight]     = useState<number | "">(0);
  const [notes,       setNotes]       = useState("");
  const [lines,       setLines]       = useState<LineItemDraft[]>([blankLine()]);
  const [errors,      setErrors]      = useState<Record<string, string>>({});
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [showSummary, setShowSummary] = useState(true);

  // ── Line item handlers ─────────────────────────────────────
  const updateLine = useCallback((uid: string, key: keyof LineItemDraft, val: any) => {
    setLines(prev => prev.map(li => {
      if (li.uid !== uid) return li;
      const updated = { ...li, [key]: val };

      // Auto-fill from inventory selection
      if (key === "inventory_item_id") {
        const inv = inventoryItems.find(i => i.id === val);
        if (inv) {
          updated.product_name    = inv.item_name;
          updated.unit_of_measure = inv.unit_of_measure;
          updated.rate            = inv.buy_rate > 0 ? inv.buy_rate : li.rate;
          // Map inventory category to line item category
          updated.item_category   = inv.category === "Packaging" ? "Packaging"
                                  : inv.category === "Finished Good" ? "Finished Good"
                                  : "Raw Material";
        }
      }

      // Recalculate
      const qty  = Number(updated.quantity) || 0;
      const rate = Number(updated.rate)     || 0;
      const { taxable_value, gst_amount, line_total } = calcLine(qty, rate, updated.gst_pct);
      return { ...updated, taxable_value, gst_amount, line_total };
    }));
  }, [inventoryItems]);

  const addLine    = () => setLines(p => [...p, blankLine()]);
  const removeLine = (uid: string) => setLines(p => p.filter(l => l.uid !== uid));

  // ── Totals ─────────────────────────────────────────────────
  const totals = useMemo(() => {
    const taxable = r2(lines.reduce((s, l) => s + l.taxable_value, 0));
    const gst     = r2(lines.reduce((s, l) => s + l.gst_amount,    0));
    const cgst    = r2(gst / 2);
    const sgst    = cgst;
    const frt     = Number(freight) || 0;
    const grand   = r2(taxable + gst + frt);
    return { taxable, gst, cgst, sgst, grand };
  }, [lines, freight]);

  // ── Supplier select ────────────────────────────────────────
  const handleSupplierChange = (id: string) => {
    setSupplierId(id);
    const s = suppliers.find(s => s.id === id);
    setSupplierName(s?.name ?? "");
  };

  // ── Validation ─────────────────────────────────────────────
  const validate = () => {
    const e: Record<string, string> = {};
    if (!supplierId)      e.supplier  = "Select a supplier";
    if (!invoiceNo.trim())e.invoiceNo = "Invoice number required";
    if (!date)            e.date      = "Date required";
    if (lines.length === 0) e.lines   = "Add at least one item";
    lines.forEach((li, i) => {
      if (!li.product_name.trim())        e[`p${i}`]  = "Required";
      if (!li.quantity || Number(li.quantity) <= 0) e[`q${i}`] = "Required";
      if (!li.rate     || Number(li.rate)     <  0) e[`r${i}`] = "Required";
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Save ───────────────────────────────────────────────────
  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      // 1. Insert purchase header
      const { data: purchase, error: pErr } = await supabase
        .from("purchases")
        .insert({
          supplier_id:    supplierId,
          supplier_name:  supplierName,
          invoice_no:     invoiceNo.trim(),
          purchase_date:  date,
          category,
          freight:        Number(freight) || 0,
          taxable_amount: totals.taxable,
          cgst:           totals.cgst,
          sgst:           totals.sgst,
          igst:           0,
          total_amount:   totals.grand,
          notes:          notes || null,
          source:         "manual",
        })
        .select("id")
        .single();

      if (pErr || !purchase) throw new Error(pErr?.message ?? "Failed to save purchase header");

      // 2. Insert line items (trigger fires here → updates inventory)
      const lineInserts = lines.map(li => ({
        purchase_id:       purchase.id,
        inventory_item_id: li.inventory_item_id || null,
        product_name:      li.product_name.trim(),
        item_category:     li.item_category,
        quantity:          Number(li.quantity),
        unit_of_measure:   li.unit_of_measure,
        rate:              Number(li.rate),
        gst_pct:           li.gst_pct,
        taxable_value:     li.taxable_value,
        gst_amount:        li.gst_amount,
        line_total:        li.line_total,
      }));

      const { error: liErr } = await supabase.from("purchase_line_items").insert(lineInserts);
      if (liErr) throw new Error(liErr.message);

      setSaved(true);
      setTimeout(() => { onSaved(); onClose(); }, 1200);
    } catch (err: any) {
      setErrors({ submit: err.message ?? "Something went wrong" });
    } finally {
      setSaving(false);
    }
  };

  const fmt = (n: number) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

      {/* Modal — full screen with small margin */}
      <div className="relative z-10 w-full max-w-[98vw] min-h-[98vh] my-[1vh] mx-[1vw] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col">

        {/* Top accent */}
        <div className="h-0.5 w-full bg-gradient-to-r from-primary/60 via-primary to-primary/60" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <ShoppingCart className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-base">Record Purchase Bill</h2>
              <p className="text-xs text-muted-foreground">New purchase · inventory syncs automatically on save</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loadingMaster ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading master data…
          </div>
        ) : (
          <div className="p-6 space-y-6 flex-1 overflow-y-auto">

            {/* Global error */}
            {errors.submit && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-950/30 border border-red-700/40 text-sm text-red-400">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {errors.submit}
              </div>
            )}

            {/* ── SECTION 1: Bill Header ── */}
            <div className="grid grid-cols-4 gap-4">
              <div className="col-span-2">
                <L req>Supplier</L>
                <Select value={supplierId} onValueChange={handleSupplierChange}>
                  <SelectTrigger className={`h-9 text-sm ${errors.supplier ? "border-red-500" : ""}`}>
                    <SelectValue placeholder="Select supplier…" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {errors.supplier && <p className="text-xs text-red-400 mt-1">{errors.supplier}</p>}
              </div>

              <div>
                <L req>Supplier Invoice No.</L>
                <Input className={`h-9 text-sm font-mono ${errors.invoiceNo ? "border-red-500" : ""}`}
                  placeholder="e.g. SS10INV252601635"
                  value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} />
                {errors.invoiceNo && <p className="text-xs text-red-400 mt-1">{errors.invoiceNo}</p>}
              </div>

              <div>
                <L req>Purchase Date</L>
                <Input type="date" className={`h-9 text-sm ${errors.date ? "border-red-500" : ""}`}
                  value={date} onChange={e => setDate(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <L req>Category</L>
                <Select value={category} onValueChange={v => setCategory(v as any)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="raw-materials">Raw Materials</SelectItem>
                    <SelectItem value="packaging">Packaging</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <L>Freight / Cartage (₹)</L>
                <Input type="number" min="0" className="h-9 text-sm"
                  value={freight === "" ? "" : freight}
                  onChange={e => setFreight(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="0" />
              </div>
              <div>
                <L>Notes</L>
                <Input className="h-9 text-sm" placeholder="Optional remarks"
                  value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </div>

            {/* ── SECTION 2: Line Items ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Line Items ({lines.length})
                </p>
                <button onClick={addLine}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-colors">
                  <Plus className="h-3.5 w-3.5" /> Add Item
                </button>
              </div>

              {errors.lines && <p className="text-xs text-red-400 mb-2">{errors.lines}</p>}

              {/* Column headers */}
              <div className="grid gap-2 mb-1 px-1" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 0.8fr 0.8fr 0.8fr 2rem" }}>
                {["Product", "Category", "Qty", "UOM", "Rate (₹)", "GST %", "Taxable", "Total", ""].map(h => (
                  <p key={h} className="text-xs text-muted-foreground font-medium">{h}</p>
                ))}
              </div>

              <div className="space-y-2">
                {lines.map((li, idx) => (
                  <div key={li.uid} className="grid gap-2 items-center p-3 rounded-xl border border-border bg-muted/10 hover:bg-muted/20 transition-colors"
                    style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 0.8fr 0.8fr 0.8fr 2rem" }}>

                    {/* Product — linked to inventory or free text */}
                    <div>
                      {inventoryItems.length > 0 ? (
                        <Select
                          value={li.inventory_item_id || "__custom__"}
                          onValueChange={v => {
                            if (v === "__custom__") {
                              updateLine(li.uid, "inventory_item_id", "");
                            } else {
                              updateLine(li.uid, "inventory_item_id", v);
                            }
                          }}>
                          <SelectTrigger className={`h-8 text-xs ${errors[`p${idx}`] ? "border-red-500" : ""}`}>
                            <SelectValue placeholder="Select product…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__custom__">Custom / Not in inventory</SelectItem>
                            {inventoryItems.map(i => (
                              <SelectItem key={i.id} value={i.id}>
                                {i.item_name}
                                <span className="ml-1 text-muted-foreground text-xs">({i.sku_code})</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input className={`h-8 text-xs ${errors[`p${idx}`] ? "border-red-500" : ""}`}
                          placeholder="Product name"
                          value={li.product_name}
                          onChange={e => updateLine(li.uid, "product_name", e.target.value)} />
                      )}
                      {/* Show text input if custom selected */}
                      {!li.inventory_item_id && (
                        <Input className="h-7 text-xs mt-1" placeholder="Enter product name"
                          value={li.product_name}
                          onChange={e => updateLine(li.uid, "product_name", e.target.value)} />
                      )}
                    </div>

                    {/* Category — auto-fills from inventory, editable */}
                    <Select value={li.item_category} onValueChange={v => updateLine(li.uid, "item_category", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ITEM_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>

                    {/* Quantity */}
                    <Input type="number" min="0" step="0.001" className={`h-8 text-xs text-right ${errors[`q${idx}`] ? "border-red-500" : ""}`}
                      placeholder="0"
                      value={li.quantity}
                      onChange={e => updateLine(li.uid, "quantity", e.target.value === "" ? "" : Number(e.target.value))} />

                    {/* UOM */}
                    <Input className="h-8 text-xs" value={li.unit_of_measure}
                      onChange={e => updateLine(li.uid, "unit_of_measure", e.target.value)} />

                    {/* Rate */}
                    <Input type="number" min="0" step="0.01" className={`h-8 text-xs text-right ${errors[`r${idx}`] ? "border-red-500" : ""}`}
                      placeholder="0.00"
                      value={li.rate}
                      onChange={e => updateLine(li.uid, "rate", e.target.value === "" ? "" : Number(e.target.value))} />

                    {/* GST % */}
                    <Select value={String(li.gst_pct)} onValueChange={v => updateLine(li.uid, "gst_pct", Number(v))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {GST_OPTIONS.map(g => <SelectItem key={g} value={String(g)}>{g}%</SelectItem>)}
                      </SelectContent>
                    </Select>

                    {/* Taxable (calculated) */}
                    <div className="h-8 flex items-center px-2 rounded-md bg-muted/40 border border-border text-xs tabular-nums text-right">
                      {li.taxable_value > 0 ? "₹" + li.taxable_value.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "—"}
                    </div>

                    {/* Line Total (calculated) */}
                    <div className="h-8 flex items-center px-2 rounded-md bg-muted/40 border border-border text-xs tabular-nums font-semibold text-green-400 text-right">
                      {li.line_total > 0 ? "₹" + li.line_total.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "—"}
                    </div>

                    {/* Remove */}
                    {lines.length > 1 ? (
                      <button onClick={() => removeLine(li.uid)}
                        className="p-1.5 rounded hover:bg-red-950/40 text-muted-foreground hover:text-red-400 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : <div />}
                  </div>
                ))}
              </div>

              <button onClick={addLine}
                className="w-full mt-2 py-2.5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/20 rounded-xl border border-dashed border-border transition-colors">
                <Plus className="h-3.5 w-3.5" /> Add another line item
              </button>
            </div>

            {/* ── SECTION 3: Totals Summary ── */}
            <Card className="overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/20 transition-colors"
                onClick={() => setShowSummary(v => !v)}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bill Summary</p>
                {showSummary
                  ? <ChevronUp   className="h-4 w-4 text-muted-foreground" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>

              {showSummary && (
                <div className="border-t border-border px-5 py-4">
                  <div className="max-w-xs ml-auto space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Taxable Amount</span>
                      <span className="tabular-nums font-medium">{fmt(totals.taxable)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">CGST</span>
                      <span className="tabular-nums text-amber-400">{fmt(totals.cgst)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">SGST</span>
                      <span className="tabular-nums text-amber-400">{fmt(totals.sgst)}</span>
                    </div>
                    {Number(freight) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Freight</span>
                        <span className="tabular-nums">{fmt(Number(freight))}</span>
                      </div>
                    )}
                    <div className="border-t border-border pt-2 flex justify-between">
                      <span className="font-bold">Grand Total</span>
                      <span className="tabular-nums font-bold text-lg text-green-400">{fmt(totals.grand)}</span>
                    </div>
                  </div>
                </div>
              )}
            </Card>

            {/* ── Footer Buttons ── */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
              <button onClick={onClose}
                className="h-10 px-5 rounded-xl border border-border text-sm hover:bg-muted transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || saved}
                className="flex items-center gap-2 h-10 px-6 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {saving
                  ? <><RefreshCw className="h-4 w-4 animate-spin" />Saving…</>
                  : saved
                    ? <><Check className="h-4 w-4" />Saved! Inventory updated</>
                    : <><Check className="h-4 w-4" />Save Purchase</>}
              </button>
            </div>

          </div>
        )}
      </div>
    </div>
  );
};

export default AddPurchase;
