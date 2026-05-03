import { useState, useMemo, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  X, Plus, Trash2, RefreshCw, Check, AlertCircle,
  ShoppingCart, ChevronDown, ChevronUp, UserPlus,
} from "lucide-react";
import {
  getSuppliers,
  createSupplier,
  createPurchaseWithRpc,
  type Supplier,
} from "@/data/purchaseStore";
import { getItems } from "@/data/inventoryStore";

// ── Types ──────────────────────────────────────────────────────────

interface InventoryItem {
  id: string;
  item_name: string;
  sku_code: string;
  category: string;
  unit_of_measure: string;
  buy_rate: number;
}

interface LineItemDraft {
  uid:               string;
  inventory_item_id: string;
  product_name:      string;
  item_category:     string;
  quantity:          number | "";
  unit_of_measure:   string;
  rate:              number | "";
  gst_pct:           number;
  taxable_value:     number;
  gst_amount:        number;
  line_total:        number;
}

const GST_OPTIONS    = [0, 5, 12, 18, 28];
const ITEM_CATEGORIES = ["Raw Material", "Packaging", "Finished Good", "Other"];

const r2 = (n: number) => Math.round(n * 100) / 100;

function calcLine(quantity: number, rate: number, gst_pct: number) {
  const taxable_value = r2(quantity * rate);
  const gst_amount    = r2(taxable_value * gst_pct / 100);
  const line_total    = r2(taxable_value + gst_amount);
  return { taxable_value, gst_amount, line_total };
}

function generateUID(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch { /* fall through */ }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function blankLine(): LineItemDraft {
  return {
    uid:               generateUID(),
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

// ── Label ──────────────────────────────────────────────────────────

const L = ({ children, req }: { children: React.ReactNode; req?: boolean }) => (
  <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
    {children}{req && <span className="text-red-400 ml-0.5">*</span>}
  </label>
);

// ════════════════════════════════════════════════════════════════════
// SupplierField — dropdown ↔ inline quick-add
// ════════════════════════════════════════════════════════════════════

interface SupplierFieldProps {
  suppliers:  Supplier[];
  value:      string;                    // selected supplier id
  onChange:   (id: string) => void;
  onCreated:  (s: Supplier) => void;     // parent appends + re-sorts
  error?:     string;
  disabled:   boolean;
}

const SupplierField = ({
  suppliers, value, onChange, onCreated, error, disabled,
}: SupplierFieldProps) => {
  const [mode,        setMode]        = useState<"select" | "add">("select");
  const [draft,       setDraft]       = useState("");
  const [saving,      setSaving]      = useState(false);
  const [supplierErr, setSupplierErr] = useState<string | null>(null);

  // Normalise exactly as the DB unique index does
  const normalize = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

  // Computed once — drives duplicate guard + button disabled state
  const normalizedDraft = useMemo(() => normalize(draft), [draft]);
  const isDuplicate     = useMemo(
    () => draft.trim().length > 0 && suppliers.some(s => normalize(s.name) === normalizedDraft),
    [suppliers, normalizedDraft, draft]
  );

  const canSave = draft.trim().length > 0 && !isDuplicate && !saving;

  const handleDraftChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value);
    setSupplierErr(null);   // clear on every keystroke
  };

  const handleCancel = () => {
    setMode("select");
    setDraft("");
    setSupplierErr(null);
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setSupplierErr(null);
    try {
      const newSupplier = await createSupplier(draft);
      onCreated(newSupplier);          // parent appends + sorts
      onChange(newSupplier.id);        // auto-select
      setMode("select");
      setDraft("");
    } catch (err: any) {
      // 23505 = unique_supplier_name_per_user constraint
      if (err?.code === "23505") {
        setSupplierErr("This supplier already exists.");
      } else {
        setSupplierErr(err?.message ?? "Failed to save supplier.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter")  { e.preventDefault(); handleSave(); }
    if (e.key === "Escape") { handleCancel(); }
  };

  // ── Dropdown mode ────────────────────────────────────────────────
  if (mode === "select") {
    return (
      <div>
        <div className="flex gap-2">
          <div className="flex-1">
            <Select value={value} onValueChange={onChange} disabled={disabled}>
              <SelectTrigger className={`h-9 text-sm ${error ? "border-red-500" : ""}`}>
                <SelectValue placeholder="Select supplier…" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.length === 0 ? (
                  <p className="px-3 py-2.5 text-xs text-muted-foreground italic">
                    No suppliers yet — add one →
                  </p>
                ) : (
                  suppliers.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Toggle to add mode */}
          <button
            type="button"
            onClick={() => setMode("add")}
            disabled={disabled}
            title="Add new supplier"
            className="flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-semibold
                       bg-primary/10 border border-primary/30 text-primary
                       hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <UserPlus className="h-3.5 w-3.5" />
            New
          </button>
        </div>

        {error && (
          <p className="flex items-center gap-1 text-xs text-red-400 mt-1">
            <AlertCircle className="h-3 w-3" />{error}
          </p>
        )}
      </div>
    );
  }

  // ── Inline "add new supplier" mode ──────────────────────────────
  return (
    <div>
      <div className="flex gap-2">
        {/* Name input */}
        <div className="flex-1 relative">
          <Input
            autoFocus
            value={draft}
            onChange={handleDraftChange}
            onKeyDown={handleKeyDown}
            placeholder="Supplier name…"
            disabled={saving}
            className={`h-9 text-sm pr-14 ${
              supplierErr
                ? "border-red-500"
                : isDuplicate
                ? "border-amber-500/60"
                : "border-primary/40"
            }`}
          />
          {/* "exists" pill inside the input */}
          {isDuplicate && !supplierErr && (
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-medium
                             text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded pointer-events-none">
              exists
            </span>
          )}
        </div>

        {/* Save (✓) */}
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          title="Save supplier"
          className="h-9 w-9 flex items-center justify-center rounded-lg border transition-colors
                     disabled:cursor-not-allowed disabled:opacity-40
                     enabled:bg-green-950/30 enabled:border-green-700/40 enabled:text-green-400
                     enabled:hover:bg-green-950/50"
        >
          {saving
            ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            : <Check      className="h-3.5 w-3.5" />
          }
        </button>

        {/* Cancel (✕) */}
        <button
          type="button"
          onClick={handleCancel}
          disabled={saving}
          title="Cancel"
          className="h-9 w-9 flex items-center justify-center rounded-lg border border-border
                     text-muted-foreground hover:bg-red-950/20 hover:text-red-400
                     transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Error / duplicate hints */}
      {supplierErr && (
        <p className="flex items-center gap-1 text-xs text-red-400 mt-1">
          <AlertCircle className="h-3 w-3 flex-shrink-0" />{supplierErr}
        </p>
      )}
      {!supplierErr && isDuplicate && (
        <p className="flex items-center gap-1 text-xs text-amber-400 mt-1">
          <AlertCircle className="h-3 w-3 flex-shrink-0" />
          Already in your supplier list — select it from the dropdown instead.
        </p>
      )}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════
// AddPurchase — main modal
// ════════════════════════════════════════════════════════════════════

interface AddPurchaseProps {
  onClose: () => void;
  onSaved: () => void;
}

export const AddPurchase = ({ onClose, onSaved }: AddPurchaseProps) => {
  // ── Master data ──────────────────────────────────────────────────
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [suppliers,      setSuppliers]      = useState<Supplier[]>([]);
  const [loadingMaster,  setLoadingMaster]  = useState(true);

  useEffect(() => {
    const load = async () => {
      const [invItems, supplierRows] = await Promise.all([
        getItems(),       // inventory master — via store, never raw supabase
        getSuppliers(),   // supplier list — via store
      ]);
      setInventoryItems(invItems.map(i => ({
        id:              i.id,
        item_name:       i.item_name,
        sku_code:        i.sku_code,
        category:        i.category,
        unit_of_measure: i.unit_of_measure,
        buy_rate:        i.buy_rate ?? 0,
      })));
      setSuppliers(supplierRows);
      setLoadingMaster(false);
    };
    load();
  }, []);

  // ── Form state ───────────────────────────────────────────────────
  const [supplierId,   setSupplierId]   = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [invoiceNo,    setInvoiceNo]    = useState("");
  const [date,         setDate]         = useState(new Date().toISOString().split("T")[0]);
  const [category,     setCategory]     = useState<"raw-materials" | "packaging">("raw-materials");
  const [freight,      setFreight]      = useState<number | "">(0);
  const [notes,        setNotes]        = useState("");
  const [lines,        setLines]        = useState<LineItemDraft[]>(() => [blankLine()]);
  const [errors,       setErrors]       = useState<Record<string, string>>({});
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(false);
  const [showSummary,  setShowSummary]  = useState(true);

  // ── Supplier field handlers ──────────────────────────────────────

  // Called when user picks from the dropdown
  const handleSupplierChange = (id: string) => {
    setSupplierId(id);
    const s = suppliers.find(s => s.id === id);
    setSupplierName(s?.name ?? "");
    setErrors(e => ({ ...e, supplier: "" }));
  };

  // Called by SupplierField after a new supplier is successfully saved
  const handleSupplierCreated = (newSupplier: Supplier) => {
    setSuppliers(prev => {
      const merged = [...prev, newSupplier];
      merged.sort((a, b) => a.name.localeCompare(b.name));
      return merged;
    });
    // Auto-select the newly created supplier
    setSupplierId(newSupplier.id);
    setSupplierName(newSupplier.name);
    setErrors(e => ({ ...e, supplier: "" }));
  };

  // ── Line item handlers ───────────────────────────────────────────
  const updateLine = useCallback((uid: string, key: keyof LineItemDraft, val: any) => {
    setLines(prev => prev.map(li => {
      if (li.uid !== uid) return li;
      const updated = { ...li, [key]: val };

      if (key === "inventory_item_id") {
        const inv = inventoryItems.find(i => i.id === val);
        if (inv) {
          updated.product_name    = inv.item_name;
          updated.unit_of_measure = inv.unit_of_measure;
          updated.rate            = inv.buy_rate > 0 ? inv.buy_rate : li.rate;
          updated.item_category   = inv.category === "Packaging"     ? "Packaging"
                                  : inv.category === "Finished Good" ? "Finished Good"
                                  : "Raw Material";
        }
      }

      const qty  = Number(updated.quantity) || 0;
      const rate = Number(updated.rate)     || 0;
      const { taxable_value, gst_amount, line_total } = calcLine(qty, rate, updated.gst_pct);
      return { ...updated, taxable_value, gst_amount, line_total };
    }));
  }, [inventoryItems]);

  const addLine    = () => setLines(p => [...p, blankLine()]);
  const removeLine = (uid: string) => setLines(p => p.filter(l => l.uid !== uid));

  // ── Totals ───────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const taxable = r2(lines.reduce((s, l) => s + l.taxable_value, 0));
    const gst     = r2(lines.reduce((s, l) => s + l.gst_amount,    0));
    const cgst    = r2(gst / 2);
    const sgst    = cgst;
    const frt     = Number(freight) || 0;
    const grand   = r2(taxable + gst + frt);
    return { taxable, gst, cgst, sgst, grand };
  }, [lines, freight]);

  // ── Validation ───────────────────────────────────────────────────
  const validate = () => {
    const e: Record<string, string> = {};
    if (!supplierId)        e.supplier  = "Select a supplier";
    if (!invoiceNo.trim())  e.invoiceNo = "Invoice number required";
    if (!date)              e.date      = "Date required";
    if (lines.length === 0) e.lines     = "Add at least one item";
    lines.forEach((li, i) => {
      if (!li.product_name.trim())                   e[`p${i}`] = "Required";
      if (!li.quantity || Number(li.quantity) <= 0)  e[`q${i}`] = "Required";
      if (li.rate === "" || Number(li.rate) < 0)     e[`r${i}`] = "Required";
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Save ────────────────────────────────────────────────────────────────
  // Single atomic RPC call — DB owns all calculations and both inserts.
  // Frontend sends only raw inputs; no derived fields (taxable_amount,
  // cgst, sgst, total_amount) are computed or passed from here.
  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await createPurchaseWithRpc({
        p_supplier_id: supplierId,
        p_invoice_no:  invoiceNo.trim(),
        p_date:        date,
        p_category:    category,
        p_freight:     Number(freight) || 0,
        p_notes:       notes || null,
        p_line_items:  lines.map(li => ({
          product_name:      li.product_name.trim(),
          item_category:     li.item_category,
          quantity:          Number(li.quantity),
          unit_of_measure:   li.unit_of_measure,
          rate:              Number(li.rate),
          gst_pct:           li.gst_pct,
          // taxable_value, gst_amount, line_total omitted — DB calculates
          inventory_item_id: li.inventory_item_id || null,
        })),
      });

      setSaved(true);
      setTimeout(() => { onSaved(); onClose(); }, 1200);
    } catch (err: any) {
      setErrors({ submit: err.message ?? "Something went wrong" });
    } finally {
      setSaving(false);
    }
  };

  const fmt = (n: number) =>
    "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-[98vw] min-h-[98vh] my-[1vh] mx-[1vw]
                      rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col">

        <div className="h-0.5 w-full bg-gradient-to-r from-primary/60 via-primary to-primary/60" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <ShoppingCart className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-base">Record Purchase Bill</h2>
              <p className="text-xs text-muted-foreground">
                New purchase · inventory syncs automatically on save
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
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
              <div className="flex items-center gap-2 px-4 py-3 rounded-lg
                              bg-red-950/30 border border-red-700/40 text-sm text-red-400">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {errors.submit}
              </div>
            )}

            {/* ── SECTION 1: Bill Header ── */}
            <div className="grid grid-cols-4 gap-4">

              {/* Supplier — now uses SupplierField with inline quick-add */}
              <div className="col-span-2">
                <L req>Supplier</L>
                <SupplierField
                  suppliers={suppliers}
                  value={supplierId}
                  onChange={handleSupplierChange}
                  onCreated={handleSupplierCreated}
                  error={errors.supplier}
                  disabled={saving}
                />
              </div>

              <div>
                <L req>Supplier Invoice No.</L>
                <Input
                  className={`h-9 text-sm font-mono ${errors.invoiceNo ? "border-red-500" : ""}`}
                  placeholder="e.g. SS10INV252601635"
                  value={invoiceNo}
                  onChange={e => setInvoiceNo(e.target.value)}
                />
                {errors.invoiceNo && (
                  <p className="text-xs text-red-400 mt-1">{errors.invoiceNo}</p>
                )}
              </div>

              <div>
                <L req>Purchase Date</L>
                <Input
                  type="date"
                  className={`h-9 text-sm ${errors.date ? "border-red-500" : ""}`}
                  value={date}
                  onChange={e => setDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <L req>Category</L>
                <Select value={category} onValueChange={v => setCategory(v as any)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="raw-materials">Raw Materials</SelectItem>
                    <SelectItem value="packaging">Packaging</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <L>Freight / Cartage (₹)</L>
                <Input
                  type="number" min="0"
                  className="h-9 text-sm"
                  value={freight === "" ? "" : freight}
                  onChange={e => setFreight(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="0"
                />
              </div>
              <div>
                <L>Notes</L>
                <Input
                  className="h-9 text-sm"
                  placeholder="Optional remarks"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>
            </div>

            {/* ── SECTION 2: Line Items ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Line Items ({lines.length})
                </p>
                <button
                  onClick={addLine}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
                             bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Item
                </button>
              </div>

              {errors.lines && (
                <p className="text-xs text-red-400 mb-2">{errors.lines}</p>
              )}

              {/* Column headers */}
              <div
                className="grid gap-2 mb-1 px-1"
                style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 0.8fr 0.8fr 0.8fr 2rem" }}
              >
                {["Product", "Category", "Qty", "UOM", "Rate (₹)", "GST %", "Taxable", "Total", ""].map(h => (
                  <p key={h} className="text-xs text-muted-foreground font-medium">{h}</p>
                ))}
              </div>

              <div className="space-y-2">
                {lines.map((li, idx) => (
                  <div
                    key={li.uid}
                    className="grid gap-2 items-center p-3 rounded-xl border border-border
                               bg-muted/10 hover:bg-muted/20 transition-colors"
                    style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 0.8fr 0.8fr 0.8fr 2rem" }}
                  >
                    {/* Product */}
                    <div>
                      {inventoryItems.length > 0 ? (
                        <Select
                          value={li.inventory_item_id || "__custom__"}
                          onValueChange={v =>
                            updateLine(li.uid, "inventory_item_id", v === "__custom__" ? "" : v)
                          }
                        >
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
                        <Input
                          className={`h-8 text-xs ${errors[`p${idx}`] ? "border-red-500" : ""}`}
                          placeholder="Product name"
                          value={li.product_name}
                          onChange={e => updateLine(li.uid, "product_name", e.target.value)}
                        />
                      )}
                      {!li.inventory_item_id && (
                        <Input
                          className="h-7 text-xs mt-1"
                          placeholder="Enter product name"
                          value={li.product_name}
                          onChange={e => updateLine(li.uid, "product_name", e.target.value)}
                        />
                      )}
                    </div>

                    {/* Category */}
                    <Select value={li.item_category} onValueChange={v => updateLine(li.uid, "item_category", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ITEM_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>

                    {/* Qty */}
                    <Input
                      type="number" min="0" step="0.001"
                      className={`h-8 text-xs text-right ${errors[`q${idx}`] ? "border-red-500" : ""}`}
                      placeholder="0"
                      value={li.quantity}
                      onChange={e => updateLine(li.uid, "quantity", e.target.value === "" ? "" : Number(e.target.value))}
                    />

                    {/* UOM */}
                    <Input
                      className="h-8 text-xs"
                      value={li.unit_of_measure}
                      onChange={e => updateLine(li.uid, "unit_of_measure", e.target.value)}
                    />

                    {/* Rate */}
                    <Input
                      type="number" min="0" step="0.01"
                      className={`h-8 text-xs text-right ${errors[`r${idx}`] ? "border-red-500" : ""}`}
                      placeholder="0.00"
                      value={li.rate}
                      onChange={e => updateLine(li.uid, "rate", e.target.value === "" ? "" : Number(e.target.value))}
                    />

                    {/* GST % */}
                    <Select value={String(li.gst_pct)} onValueChange={v => updateLine(li.uid, "gst_pct", Number(v))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {GST_OPTIONS.map(g => <SelectItem key={g} value={String(g)}>{g}%</SelectItem>)}
                      </SelectContent>
                    </Select>

                    {/* Taxable (calculated) */}
                    <div className="h-8 flex items-center px-2 rounded-md bg-muted/40 border border-border text-xs tabular-nums text-right">
                      {li.taxable_value > 0
                        ? "₹" + li.taxable_value.toLocaleString("en-IN", { minimumFractionDigits: 2 })
                        : "—"}
                    </div>

                    {/* Line Total (calculated) */}
                    <div className="h-8 flex items-center px-2 rounded-md bg-muted/40 border border-border text-xs tabular-nums font-semibold text-green-400 text-right">
                      {li.line_total > 0
                        ? "₹" + li.line_total.toLocaleString("en-IN", { minimumFractionDigits: 2 })
                        : "—"}
                    </div>

                    {/* Remove */}
                    {lines.length > 1 ? (
                      <button
                        onClick={() => removeLine(li.uid)}
                        className="p-1.5 rounded hover:bg-red-950/40 text-muted-foreground hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : <div />}
                  </div>
                ))}
              </div>

              <button
                onClick={addLine}
                className="w-full mt-2 py-2.5 flex items-center justify-center gap-1.5 text-xs
                           text-muted-foreground hover:text-foreground hover:bg-muted/20
                           rounded-xl border border-dashed border-border transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Add another line item
              </button>
            </div>

            {/* ── SECTION 3: Totals Summary ── */}
            <Card className="overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/20 transition-colors"
                onClick={() => setShowSummary(v => !v)}
              >
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Bill Summary
                </p>
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
              <button
                onClick={onClose}
                className="h-10 px-5 rounded-xl border border-border text-sm hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || saved}
                className="flex items-center gap-2 h-10 px-6 rounded-xl bg-primary text-primary-foreground
                           text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
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
