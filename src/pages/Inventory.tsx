import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  getItems, getTransactions, addItem, updateItem, deleteItem,
  postTransaction, reverseTransaction,
} from "@/data/inventoryStore";
import type {
  InventoryItem, InventoryTransaction, ItemCategory, TransactionType,
} from "@/types/inventory";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Package, AlertTriangle, ChevronDown, ChevronRight,
  Search, SlidersHorizontal, RefreshCw, Plus, X, Check,
  Boxes, ClipboardList, Pencil, Trash2,
  ArrowDownToLine, ArrowUpFromLine,
  PackageSearch, Bell, PlusCircle,
} from "lucide-react";

// ── Page meta ──────────────────────────────────────────────────
const PAGE_META = {
  "/inventory":              { title: "Inventory",        icon: Boxes,         section: "products"     },
  "/inventory/products":     { title: "Products",         icon: Package,       section: "products"     },
  "/inventory/movement":     { title: "Stock Movement",   icon: PlusCircle,    section: "movement"     },
  "/inventory/transactions": { title: "Transaction Log",  icon: ClipboardList, section: "transactions" },
  "/inventory/alerts":       { title: "Low Stock Alerts", icon: Bell,     section: "alerts"       },
} as const;

const CATEGORY_OPTIONS: { label: string; value: ItemCategory }[] = [
  { label: "Raw Material", value: "raw_material" },
  { label: "Finished Good", value: "finished_good" },
  { label: "Packaging", value: "packaging" },
  { label: "Other", value: "other" },
];

const TX_TYPES: { value: TransactionType; label: string; dir: "in" | "out"; color: string }[] = [
  { value: "purchase_in",    label: "Purchase / In",    dir: "in",  color: "text-green-400"   },
  { value: "return_in",      label: "Return / In",      dir: "in",  color: "text-emerald-400" },
  { value: "production_out", label: "Production / Out", dir: "out", color: "text-amber-500"   },
  { value: "sales_out",      label: "Sales / Out",      dir: "out", color: "text-red-400"     },
  { value: "adjustment",     label: "Adjustment",       dir: "in",  color: "text-blue-400"    },
];
const txDir = (t: TransactionType) => TX_TYPES.find(x => x.value === t)?.dir ?? "in";
const txColor = (t: TransactionType) => TX_TYPES.find(x => x.value === t)?.color ?? "";
const getCategoryLabel = (category: ItemCategory) =>
  CATEGORY_OPTIONS.find(option => option.value === category)?.label ?? category;
const getTransactionLabel = (type: TransactionType) =>
  TX_TYPES.find(option => option.value === type)?.label ?? type;

const fmtQty  = (n: number, unit = "") => `${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}${unit ? " " + unit : ""}`;
const fmtRate = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const todayStr = () => new Date().toISOString().split("T")[0];

// ── Shared UI ──────────────────────────────────────────────────
const Spinner = () => (
  <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
    <RefreshCw className="h-5 w-5 animate-spin" /><span className="text-sm">Loading…</span>
  </div>
);

const DbError = ({ msg, retry }: { msg: string; retry: () => void }) => (
  <Card className="p-8 text-center space-y-3">
    <AlertTriangle className="h-8 w-8 text-red-400 mx-auto" />
    <p className="text-sm text-muted-foreground">{msg}</p>
    <button onClick={retry} className="text-xs px-4 py-1.5 rounded border border-border hover:bg-muted transition-colors">Retry</button>
  </Card>
);

function useToast() {
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const show = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };
  return { toast, show, clear: () => setToast(null) };
}

const ToastEl = ({ msg, type, onClose }: { msg: string; type: "success" | "error"; onClose: () => void }) => (
  <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-xl text-sm font-medium border
    ${type === "success" ? "bg-green-950 border-green-700 text-green-200" : "bg-red-950 border-red-700 text-red-200"}`}>
    {type === "success" ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
    <span>{msg}</span>
    <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100"><X className="h-3 w-3" /></button>
  </div>
);

const Btn = ({ onClick, disabled = false, variant = "primary", size = "md", children, className = "" }: {
  onClick?: () => void; disabled?: boolean;
  variant?: "primary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md"; children: React.ReactNode; className?: string;
}) => {
  const sz = size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-4 text-sm";
  const vr = variant === "primary" ? "bg-primary text-primary-foreground hover:bg-primary/90"
           : variant === "danger"  ? "bg-red-600 text-white hover:bg-red-700"
           : variant === "outline" ? "border border-border hover:bg-muted text-foreground"
           : "hover:bg-muted text-foreground";
  return (
    <button onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 font-medium rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${sz} ${vr} ${className}`}>
      {children}
    </button>
  );
};

// ── Product Form Modal ─────────────────────────────────────────
type PForm = {
  sku_code: string; product_code: string; item_name: string;
  category: ItemCategory; unit_of_measure: string;
  buy_rate: string; minimum_reorder_level: string; description: string;
};
const EMPTY: PForm = {
  sku_code: "", product_code: "", item_name: "",
  category: "raw_material", unit_of_measure: "kg",
  buy_rate: "", minimum_reorder_level: "", description: "",
};

const ProductModal = ({ initial, onSave, onClose }: {
  initial?: InventoryItem | null;
  onSave: (f: PForm) => Promise<void>;
  onClose: () => void;
}) => {
  const [f, setF] = useState<PForm>(initial ? {
    sku_code: initial.sku_code, product_code: initial.product_code ?? "",
    item_name: initial.item_name, category: initial.category,
    unit_of_measure: initial.unit_of_measure, buy_rate: String(initial.buy_rate ?? ""),
    minimum_reorder_level: String(initial.minimum_reorder_level), description: "",
  } : EMPTY);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof PForm, v: string) => setF(p => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <Card className="w-full max-w-md p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-base">{initial ? "Edit Product" : "Add Product"}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        {/* SKU + Display code */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Product ID *</label>
            <Input className="h-9 text-sm font-mono" placeholder="e.g. FIN-PRP-1IN"
              value={f.sku_code} onChange={e => set("sku_code", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Short Code</label>
            <Input className="h-9 text-sm font-mono" placeholder="e.g. 001"
              value={f.product_code} onChange={e => set("product_code", e.target.value)} />
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Product Name *</label>
          <Input className="h-9 text-sm" placeholder='e.g. 1/2" (13 MM) PRINCE'
            value={f.item_name} onChange={e => set("item_name", e.target.value)} />
        </div>

        {/* Category + Unit */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Category</label>
            <Select value={f.category} onValueChange={v => set("category", v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Unit</label>
            <Input className="h-9 text-sm" placeholder="kg / pcs / meters / MT"
              value={f.unit_of_measure} onChange={e => set("unit_of_measure", e.target.value)} />
          </div>
        </div>

        {/* Buy Rate + Reorder */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Buy Rate (₹)</label>
            <Input className="h-9 text-sm" type="number" min="0" step="0.01" placeholder="0.00"
              value={f.buy_rate} onChange={e => set("buy_rate", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Reorder Level</label>
            <Input className="h-9 text-sm" type="number" min="0" placeholder="0"
              value={f.minimum_reorder_level} onChange={e => set("minimum_reorder_level", e.target.value)} />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Btn variant="outline" onClick={onClose} className="flex-1">Cancel</Btn>
          <Btn variant="primary" disabled={saving || !f.item_name.trim() || !f.sku_code.trim()} className="flex-1"
            onClick={async () => { setSaving(true); await onSave(f); setSaving(false); }}>
            {saving ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Saving…</> : <><Check className="h-3.5 w-3.5" /> {initial ? "Save Changes" : "Add Product"}</>}
          </Btn>
        </div>
      </Card>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// TAB 1 — PRODUCTS
// ══════════════════════════════════════════════════════════════
const ProductsTab = () => {
  const [items, setItems]       = useState<InventoryItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState("");
  const [catFilter, setCat]     = useState<"all" | ItemCategory>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [modal, setModal]       = useState<"add" | InventoryItem | null>(null);
  const { toast, show, clear }  = useToast();

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await getItems();
      setItems(data);
    } catch (err: any) {
      setError(err.message ?? "Failed to load products");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => items.filter(i => {
    if (catFilter !== "all" && i.category !== catFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return i.item_name.toLowerCase().includes(s) || i.sku_code.toLowerCase().includes(s) || (i.product_code ?? "").toLowerCase().includes(s);
    }
    return true;
  }), [items, catFilter, search]);

  const handleSave = async (f: PForm) => {
    const payload = {
      sku_code: f.sku_code.trim(), product_code: f.product_code.trim(),
      item_name: f.item_name.trim(), category: f.category,
      unit_of_measure: f.unit_of_measure.trim() || "pcs",
      buy_rate: parseFloat(f.buy_rate) || 0,
      minimum_reorder_level: parseFloat(f.minimum_reorder_level) || 0,
    };
    if (modal === "add") {
      const { error } = await addItem(payload);
      if (error) { show(error, "error"); return; }
      show("Product added!", "success");
    } else if (modal && typeof modal === "object") {
      const { error } = await updateItem(modal.id, payload);
      if (error) { show(error, "error"); return; }
      show("Updated!", "success");
    }
    setModal(null); load();
  };

  const handleDelete = async (item: InventoryItem) => {
    if (!confirm(`Delete "${item.item_name}"? This cannot be undone.`)) return;
    const { error } = await deleteItem(item.id);
    if (error) show(error, "error");
    else { show("Deleted.", "success"); load(); }
  };

  const statusOf = (i: InventoryItem) =>
    i.current_stock === 0                         ? { label: "Out of Stock", variant: "destructive" as const } :
    i.current_stock <= i.minimum_reorder_level    ? { label: "Low Stock",    variant: "secondary"   as const } :
                                                    { label: "In Stock",     variant: "default"     as const };

  const lowCount = items.filter(i => i.current_stock <= i.minimum_reorder_level).length;

  return (
    <div className="space-y-5">
      {toast && <ToastEl msg={toast.msg} type={toast.type} onClose={clear} />}
      {modal && <ProductModal initial={modal === "add" ? null : modal} onSave={handleSave} onClose={() => setModal(null)} />}

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Total Products</p><p className="text-2xl font-bold">{items.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">In Stock</p><p className="text-2xl font-bold text-green-400">{items.filter(i => i.current_stock > i.minimum_reorder_level).length}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Low / Out of Stock</p>
          <p className={`text-2xl font-bold ${lowCount > 0 ? "text-red-400" : "text-green-400"}`}>{lowCount}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Total Value</p>
          <p className="text-2xl font-bold">{fmtRate(items.reduce((s,i) => s + i.current_stock * (i.buy_rate ?? 0), 0))}</p></Card>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filters</span>
          <button onClick={load} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ml-auto">
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
          <Btn variant="primary" size="sm" onClick={() => setModal("add")}><Plus className="h-3.5 w-3.5" /> Add Product</Btn>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select value={catFilter} onValueChange={setCat}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORY_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input className="pl-7 h-8 text-xs" placeholder="Search name, SKU or code…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </Card>

      {loading ? <Spinner /> : error ? <DbError msg={error} retry={load} /> : (
        <>
          {filtered.length === 0 ? (
            <Card className="p-10 text-center space-y-3">
              <Package className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">No products found</p>
              <Btn variant="primary" size="sm" onClick={() => setModal("add")}><Plus className="h-3.5 w-3.5" /> Add First Product</Btn>
            </Card>
          ) : (
            <div className="space-y-2">
              {filtered.map(item => {
                const st   = statusOf(item);
                const isEx = expanded === item.id;
                return (
                  <Card key={item.id} className={`overflow-hidden transition-all ${item.current_stock <= item.minimum_reorder_level && item.minimum_reorder_level > 0 ? "border-amber-500/20" : ""}`}>
                    <div className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-muted/20 transition-colors"
                      onClick={() => setExpanded(isEx ? null : item.id)}>
                      <div className="text-muted-foreground flex-shrink-0">
                        {isEx ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        {/* Name — SKU */}
                        <p className="text-sm font-semibold truncate">
                          {item.item_name}
                          <span className="ml-2 text-muted-foreground font-normal font-mono text-xs">
                            — {item.product_code || item.sku_code}
                          </span>
                        </p>
                        {/* IN / OUT = stock  (like screenshot) */}
                        <p className="text-sm mt-0.5">
                          <span className="text-green-400 font-semibold">IN {item.current_stock}</span>
                          <span className="mx-2 text-muted-foreground text-xs">OUT</span>
                          <span className="text-red-400 font-semibold">0</span>
                          <span className="mx-1.5 text-muted-foreground">=</span>
                          <span className="font-semibold">{item.current_stock}</span>
                          <span className="ml-1 text-muted-foreground text-xs">{item.unit_of_measure}</span>
                        </p>
                        {/* qty × rate = value */}
                        {(item.buy_rate ?? 0) > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {item.current_stock} × {fmtRate(item.buy_rate)} = <span className="text-foreground font-medium">{fmtRate(item.current_stock * item.buy_rate)}</span>
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <Badge variant={st.variant}>{st.label}</Badge>
                        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                          <Btn variant="ghost" size="sm" onClick={() => setModal(item)}><Pencil className="h-3.5 w-3.5" /></Btn>
                          <Btn variant="ghost" size="sm" onClick={() => handleDelete(item)} className="text-red-400 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></Btn>
                        </div>
                      </div>
                    </div>

                    {isEx && (
                      <div className="px-14 pb-4 border-t border-border bg-muted/10">
                        <div className="grid grid-cols-4 gap-4 pt-3 text-sm">
                          <div><p className="text-xs text-muted-foreground">SKU Code</p><p className="font-mono font-medium text-xs">{item.sku_code}</p></div>
                          <div><p className="text-xs text-muted-foreground">Category</p><p className="font-medium">{getCategoryLabel(item.category)}</p></div>
                          <div><p className="text-xs text-muted-foreground">Buy Rate</p><p className="font-medium">{fmtRate(item.buy_rate ?? 0)}</p></div>
                          <div><p className="text-xs text-muted-foreground">Reorder At</p>
                            <p className={`font-medium ${item.current_stock <= item.minimum_reorder_level ? "text-amber-500" : ""}`}>
                              {fmtQty(item.minimum_reorder_level, item.unit_of_measure)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// TAB 2 — STOCK MOVEMENT
// ══════════════════════════════════════════════════════════════
const MovementTab = () => {
  const [items, setItems]      = useState<InventoryItem[]>([]);
  const [loadingItems, setLI]  = useState(true);
  const [txType, setTxType]    = useState<TransactionType>("purchase_in");
  const [selectedId, setSelId] = useState("");
  const [qty, setQty]          = useState("");
  const [date, setDate]        = useState(todayStr());
  const [reference, setRef]    = useState("");
  const [notes, setNotes]      = useState("");
  const [submitting, setSub]   = useState(false);
  const [recentTxns, setRec]   = useState<InventoryTransaction[]>([]);
  const [loadingRec, setLR]    = useState(true);
  const { toast, show, clear } = useToast();

  const loadItems = useCallback(async () => {
    setLI(true);
    try {
      const data = await getItems();
      setItems(data.sort((a, b) => a.item_name.localeCompare(b.item_name)));
    } catch { setItems([]); }
    setLI(false);
  }, []);

  const loadRecent = useCallback(async () => {
    setLR(true);
    try {
      const data = await getTransactions(15);
      setRec(data);
    } catch { setRec([]); }
    setLR(false);
  }, []);

  useEffect(() => { loadItems(); loadRecent(); }, [loadItems, loadRecent]);

  const selectedItem = items.find(i => i.id === selectedId);
  const qtyNum       = parseFloat(qty) || 0;
  const isIn         = txDir(txType) === "in";

  const previewStock = selectedItem && qtyNum > 0
    ? isIn ? selectedItem.current_stock + qtyNum
           : Math.max(0, selectedItem.current_stock - qtyNum)
    : null;

  const handleSubmit = async () => {
    if (!selectedId || !qtyNum) { show("Select a product and enter quantity.", "error"); return; }
    if (!selectedItem) return;
    setSub(true);

    const result = await postTransaction({
      item_id:          selectedId,
      transaction_type: txType,
      quantity_changed: qtyNum,
      transaction_date: date,
      reference_number: reference || undefined,
      currentStock:     selectedItem.current_stock,
    });

    if (!result.success) {
      show(`Error: ${result.error}`, "error");
      setSub(false);
      return;
    }

    show(`Recorded! New stock: ${fmtQty(result.newStock, selectedItem.unit_of_measure)}`, "success");
    setSelId(""); setQty(""); setRef(""); setDate(todayStr());
    loadItems(); loadRecent();
    setSub(false);
  };

  const inTypes  = TX_TYPES.filter(t => t.dir === "in");
  const outTypes = TX_TYPES.filter(t => t.dir === "out");

  return (
    <div className="space-y-6">
      {toast && <ToastEl msg={toast.msg} type={toast.type} onClose={clear} />}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Form ── */}
        <Card className="p-6 space-y-5">
          <h3 className="text-sm font-semibold">Record Stock Movement</h3>

          {/* IN / OUT toggle */}
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Movement Type *</label>
            <div className="grid grid-cols-2 gap-2">
              {inTypes.map(t => (
                <button key={t.value} onClick={() => setTxType(t.value)}
                  className={`flex items-center justify-center gap-1.5 h-10 rounded-lg border text-xs font-semibold transition-all
                    ${txType === t.value ? "border-green-500 bg-green-950/40 text-green-400" : "border-border hover:bg-muted/40 text-muted-foreground"}`}>
                  <ArrowDownToLine className="h-3.5 w-3.5" />{t.label}
                </button>
              ))}
              {outTypes.map(t => (
                <button key={t.value} onClick={() => setTxType(t.value)}
                  className={`flex items-center justify-center gap-1.5 h-10 rounded-lg border text-xs font-semibold transition-all
                    ${txType === t.value ? "border-red-500 bg-red-950/40 text-red-400" : "border-border hover:bg-muted/40 text-muted-foreground"}`}>
                  <ArrowUpFromLine className="h-3.5 w-3.5" />{t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Product select */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Product *</label>
            <Select value={selectedId} onValueChange={setSelId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder={loadingItems ? "Loading…" : "Select a product"} />
              </SelectTrigger>
              <SelectContent>
                {items.map(i => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.item_name}
                    <span className="ml-1.5 text-muted-foreground font-mono text-xs">({fmtQty(i.current_stock, i.unit_of_measure)})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedItem && (
              <div className="mt-2 px-3 py-2.5 rounded-lg bg-muted/30 border border-border">
                <p className="text-sm font-semibold">{selectedItem.item_name}
                  <span className="ml-2 font-mono text-xs text-muted-foreground">— {selectedItem.product_code || selectedItem.sku_code}</span>
                </p>
                <p className="text-sm mt-0.5">
                  <span className="text-green-400 font-semibold">IN {selectedItem.current_stock}</span>
                  <span className="mx-2 text-muted-foreground text-xs">OUT 0 =</span>
                  <span className="font-semibold">{selectedItem.current_stock} {selectedItem.unit_of_measure}</span>
                </p>
                {(selectedItem.buy_rate ?? 0) > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {selectedItem.current_stock} × {fmtRate(selectedItem.buy_rate)} = {fmtRate(selectedItem.current_stock * selectedItem.buy_rate)}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Quantity */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              Quantity{selectedItem ? ` (${selectedItem.unit_of_measure})` : ""} *
            </label>
            <Input type="number" min="0.01" step="0.01" className="h-9 text-sm"
              placeholder="Enter quantity" value={qty} onChange={e => setQty(e.target.value)} />
            {previewStock !== null && (
              <p className="text-xs mt-1.5 text-muted-foreground">
                New stock after:{" "}
                <span className={`font-bold ${previewStock <= 0 ? "text-red-400" : previewStock <= (selectedItem?.minimum_reorder_level ?? 0) ? "text-amber-500" : "text-green-400"}`}>
                  {fmtQty(Math.max(0, previewStock), selectedItem?.unit_of_measure)}
                </span>
                {(selectedItem?.buy_rate ?? 0) > 0 && previewStock > 0 &&
                  <span className="ml-2">= {fmtRate(previewStock * selectedItem!.buy_rate)}</span>}
              </p>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Date *</label>
            <Input type="date" className="h-9 text-sm" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          {/* Reference */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Reference <span className="opacity-50">(optional)</span></label>
            <Input className="h-9 text-sm" placeholder="e.g. PO-2026-001" value={reference} onChange={e => setRef(e.target.value)} />
          </div>

          <Btn variant="primary" onClick={handleSubmit} disabled={submitting || !selectedId || !qty} className="w-full h-10">
            {submitting
              ? <><RefreshCw className="h-4 w-4 animate-spin" /> Recording…</>
              : <><Check className="h-4 w-4" /> Record {isIn ? "Stock IN" : "Stock OUT"}</>}
          </Btn>
        </Card>

        {/* ── Recent movements ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Recent Movements</h3>
            <button onClick={() => { loadItems(); loadRecent(); }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
          </div>
          {loadingRec ? <Spinner /> : recentTxns.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">No movements yet</Card>
          ) : recentTxns.map(t => {
            const dir  = txDir(t.transaction_type);
            const isIn = dir === "in";
            const unit = t.inventory_items?.unit_of_measure ?? "";
            const rate = t.inventory_items?.buy_rate ?? 0;
            return (
              <Card key={t.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${isIn ? "bg-green-950/60" : "bg-red-950/60"}`}>
                      {isIn ? <ArrowDownToLine className="h-4 w-4 text-green-400" /> : <ArrowUpFromLine className="h-4 w-4 text-red-400" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium leading-tight">{t.inventory_items?.item_name ?? `Item #${t.item_id}`}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(t.transaction_date ?? t.created_at).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" })}
                        {t.reference_number && <span className="ml-1.5 font-mono">· {t.reference_number}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-bold tabular-nums ${isIn ? "text-green-400" : "text-red-400"}`}>
                      {isIn ? "+" : "−"}{fmtQty(t.quantity_changed, unit)}
                    </p>
                    {rate > 0 && <p className="text-xs text-muted-foreground">{fmtRate(t.quantity_changed * rate)}</p>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// TAB 3 — TRANSACTION LOG
// ══════════════════════════════════════════════════════════════
const TransactionLogTab = () => {
  const [rows, setRows]         = useState<InventoryTransaction[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [typeFilter, setType]   = useState("all");
  const [search, setSearch]     = useState("");
  const [deleting, setDeleting] = useState<string | null>(null); // id of row being deleted
  const { toast, show, clear }  = useToast();

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await getTransactions(300);
      setRows(data);
    } catch (err: any) {
      setError(err.message ?? "Failed to load transactions");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (t: InventoryTransaction) => {
    if (!confirm(`Delete this transaction?\n\n${getTransactionLabel(t.transaction_type)} · ${t.quantity_changed} ${t.inventory_items?.unit_of_measure ?? ""} · ${t.inventory_items?.item_name}\n\nThis will reverse the stock change.`)) return;

    setDeleting(t.id);
    const currentStock = (t.inventory_items as any)?.current_stock ?? 0;
    const result = await reverseTransaction({
      transactionId:    t.id,
      item_id:          t.item_id,
      transaction_type: t.transaction_type,
      quantity_changed: t.quantity_changed,
      currentStock,
    });

    if (!result.success) {
      show(result.error ?? "Failed to delete transaction", "error");
    } else {
      show(`Transaction deleted · Stock updated to ${fmtQty(result.newStock, t.inventory_items?.unit_of_measure)}`, "success");
      load();
    }
    setDeleting(null);
  };

  const filtered = useMemo(() => rows.filter(t => {
    if (typeFilter !== "all" && t.transaction_type !== typeFilter) return false;
    const name = t.inventory_items?.item_name ?? "";
    if (search && !name.toLowerCase().includes(search.toLowerCase())
               && !(t.reference_number ?? "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [rows, typeFilter, search]);

  const totalIn  = filtered.filter(t => txDir(t.transaction_type) === "in").reduce((s,t) => s + t.quantity_changed, 0);
  const totalOut = filtered.filter(t => txDir(t.transaction_type) === "out").reduce((s,t) => s + t.quantity_changed, 0);

  return (
    <div className="space-y-5">
      {toast && <ToastEl msg={toast.msg} type={toast.type} onClose={clear} />}

      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Total Records</p><p className="text-2xl font-bold">{filtered.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Total IN</p>
          <div className="flex items-center gap-2 mt-1"><ArrowDownToLine className="h-4 w-4 text-green-400" /><p className="text-2xl font-bold text-green-400">{totalIn.toLocaleString("en-IN")}</p></div></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Total OUT</p>
          <div className="flex items-center gap-2 mt-1"><ArrowUpFromLine className="h-4 w-4 text-red-400" /><p className="text-2xl font-bold text-red-400">{totalOut.toLocaleString("en-IN")}</p></div></Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filters</span>
          <button onClick={load} className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><RefreshCw className="h-3 w-3" /> Refresh</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select value={typeFilter} onValueChange={setType}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {TX_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input className="pl-7 h-8 text-xs" placeholder="Search product or reference…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </Card>

      {loading ? <Spinner /> : error ? <DbError msg={error} retry={load} /> : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Product</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Qty</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Value</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Reference</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0
                  ? <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">No transactions found</td></tr>
                  : filtered.map(t => {
                    const dir      = txDir(t.transaction_type);
                    const isIn     = dir === "in";
                    const unit     = t.inventory_items?.unit_of_measure ?? "";
                    const rate     = t.inventory_items?.buy_rate ?? 0;
                    const isDeleting = deleting === t.id;
                    return (
                      <tr key={t.id} className={`border-t border-border transition-colors ${isDeleting ? "opacity-40" : "hover:bg-muted/20"}`}>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(t.transaction_date ?? t.created_at).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" })}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{t.inventory_items?.item_name ?? `#${t.item_id}`}</p>
                          <p className="text-xs text-muted-foreground font-mono">{t.inventory_items?.sku_code}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full
                            ${isIn ? "bg-green-950/60 text-green-400" : "bg-red-950/60 text-red-400"}`}>
                            {isIn ? <ArrowDownToLine className="h-3 w-3" /> : <ArrowUpFromLine className="h-3 w-3" />}
                            {getTransactionLabel(t.transaction_type)}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-right tabular-nums font-bold ${isIn ? "text-green-400" : "text-red-400"}`}>
                          {isIn ? "+" : "−"}{fmtQty(t.quantity_changed, unit)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">
                          {rate > 0 ? fmtRate(t.quantity_changed * rate) : "—"}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{t.reference_number || "—"}</td>
                        <td className="px-2 py-3">
                          <button
                            onClick={() => handleDelete(t)}
                            disabled={isDeleting}
                            className="p-1.5 rounded hover:bg-red-950/40 text-muted-foreground hover:text-red-400 transition-colors disabled:cursor-not-allowed">
                            {isDeleting
                              ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              : <Trash2 className="h-3.5 w-3.5" />}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// TAB 4 — LOW STOCK ALERTS
// ══════════════════════════════════════════════════════════════
const AlertsTab = () => {
  const [items, setItems]     = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await getItems();
      setItems(data.sort((a, b) => a.current_stock - b.current_stock));
    } catch (err: any) {
      setError(err.message ?? "Failed to load stock data");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const out     = items.filter(i => i.current_stock === 0);
  const low     = items.filter(i => i.current_stock > 0 && i.current_stock <= i.minimum_reorder_level);
  const healthy = items.filter(i => i.current_stock > i.minimum_reorder_level);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 border-red-500/20"><p className="text-xs text-muted-foreground">Out of Stock</p><p className="text-2xl font-bold text-red-400">{out.length}</p></Card>
        <Card className="p-4 border-amber-500/20"><p className="text-xs text-muted-foreground">Low Stock</p><p className="text-2xl font-bold text-amber-500">{low.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Healthy</p><p className="text-2xl font-bold text-green-400">{healthy.length}</p></Card>
      </div>
      <div className="flex justify-end">
        <button onClick={load} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><RefreshCw className="h-3 w-3" /> Refresh</button>
      </div>

      {loading ? <Spinner /> : error ? <DbError msg={error} retry={load} /> : (
        <>
          {out.length === 0 && low.length === 0 ? (
            <Card className="p-12 text-center space-y-2"><Check className="h-8 w-8 text-green-400 mx-auto" /><p className="font-semibold text-green-400">All items are well stocked</p></Card>
          ) : (
            <div className="space-y-4">
              {out.length > 0 && <div className="space-y-2">
                <p className="text-xs font-bold text-red-400 uppercase tracking-wider">Out of Stock ({out.length})</p>
                {out.map(item => (
                  <div key={item.id} className="flex items-center justify-between p-4 rounded-lg border border-red-500/30 bg-red-950/20">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
                      <div><p className="text-sm font-medium">{item.item_name}</p><p className="text-xs text-muted-foreground font-mono">{item.sku_code}</p></div>
                    </div>
                    <p className="text-sm font-bold text-red-400">OUT OF STOCK</p>
                  </div>
                ))}
              </div>}
              {low.length > 0 && <div className="space-y-2">
                <p className="text-xs font-bold text-amber-500 uppercase tracking-wider">Low Stock ({low.length})</p>
                {low.map(item => (
                  <div key={item.id} className="flex items-center justify-between p-4 rounded-lg border border-amber-500/30 bg-amber-950/20">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                      <div><p className="text-sm font-medium">{item.item_name}</p><p className="text-xs text-muted-foreground">{getCategoryLabel(item.category)} · Reorder at {fmtQty(item.minimum_reorder_level, item.unit_of_measure)}</p></div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-amber-500">{fmtQty(item.current_stock, item.unit_of_measure)}</p>
                      <p className="text-xs text-muted-foreground">{fmtQty(item.minimum_reorder_level - item.current_stock, item.unit_of_measure)} below reorder</p>
                    </div>
                  </div>
                ))}
              </div>}
            </div>
          )}
          {healthy.length > 0 && (
            <Card className="p-0 overflow-hidden">
              <div className="px-5 py-2.5 border-b border-border bg-muted/20">
                <p className="text-xs font-semibold text-green-400 uppercase tracking-wider">Healthy Stock ({healthy.length})</p>
              </div>
              <div className="divide-y divide-border/50">
                {healthy.map(item => (
                  <div key={item.id} className="flex items-center justify-between px-5 py-3">
                    <div><p className="text-sm font-medium">{item.item_name}</p><p className="text-xs text-muted-foreground">{getCategoryLabel(item.category)}</p></div>
                    <p className="text-sm font-bold text-green-400">{fmtQty(item.current_stock, item.unit_of_measure)}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════════════
type Section = "products" | "movement" | "transactions" | "alerts";

const TABS: { section: Section; label: string; icon: React.ElementType }[] = [
  { section: "products",     label: "Products",        icon: Package       },
  { section: "movement",     label: "Stock Movement",  icon: PlusCircle    },
  { section: "transactions", label: "Transaction Log", icon: ClipboardList },
  { section: "alerts",       label: "Low Stock Alerts",icon: Bell          },
];

const Inventory = () => {
  const { pathname } = useLocation();

  // Derive initial tab from URL, but then manage with state (no remount on nav)
  const getInitialTab = (): Section => {
    if (pathname.includes("movement"))     return "movement";
    if (pathname.includes("transactions")) return "transactions";
    if (pathname.includes("alerts"))       return "alerts";
    return "products";
  };

  const [section, setSection] = useState<Section>(getInitialTab);

  // Sync if user navigates via sidebar
  useEffect(() => {
    setSection(getInitialTab());
  }, [pathname]);

  const activeTab = TABS.find(t => t.section === section)!;
  const Icon = activeTab.icon;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-bold text-foreground">{activeTab.label}</h2>
        <span className="text-xs px-2 py-0.5 rounded-full border border-green-500/30 text-green-400 bg-green-950/30 font-medium">
          ● Live · Supabase
        </span>
      </div>

      {/* All tabs stay permanently mounted — switching is instant, no refetch */}
      <div className={section === "products"     ? "" : "hidden"}><ProductsTab /></div>
      <div className={section === "movement"     ? "" : "hidden"}><MovementTab /></div>
      <div className={section === "transactions" ? "" : "hidden"}><TransactionLogTab /></div>
      <div className={section === "alerts"       ? "" : "hidden"}><AlertsTab /></div>
    </div>
  );
};

export default Inventory;
