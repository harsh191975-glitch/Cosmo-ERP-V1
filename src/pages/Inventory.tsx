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
  { label: "Raw Material", value: "Raw Material" },
  { label: "Finished Good", value: "Finished Good" },
  { label: "Packaging", value: "Packaging" },
  { label: "Other", value: "Other" },
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
  <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
    <div className="relative h-6 w-6">
      <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
      <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
    </div>
    <span className="text-sm font-medium">Loading…</span>
  </div>
);

const DbError = ({ msg, retry }: { msg: string; retry: () => void }) => (
  <div className="relative p-8 text-center space-y-4 rounded-xl border border-red-500/20 bg-gradient-to-b from-red-950/10 to-transparent backdrop-blur-sm">
    <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-950/40 border border-red-500/30 mx-auto">
      <AlertTriangle className="h-6 w-6 text-red-400" />
    </div>
    <p className="text-sm text-muted-foreground">{msg}</p>
    <button onClick={retry} className="text-xs px-5 py-2 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 hover:border-primary/30 transition-all duration-200 font-medium">
      Retry
    </button>
  </div>
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
  <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-2xl text-sm font-medium border backdrop-blur-md
    ${type === "success"
      ? "bg-green-950/80 border-green-500/30 text-green-200 shadow-green-900/30"
      : "bg-red-950/80 border-red-500/30 text-red-200 shadow-red-900/30"}`}>
    <div className={`h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 ${type === "success" ? "bg-green-500/20" : "bg-red-500/20"}`}>
      {type === "success" ? <Check className="h-3.5 w-3.5 text-green-400" /> : <X className="h-3.5 w-3.5 text-red-400" />}
    </div>
    <span>{msg}</span>
    <button onClick={onClose} className="ml-1 opacity-50 hover:opacity-100 transition-opacity"><X className="h-3 w-3" /></button>
  </div>
);

// ── Premium Button ─────────────────────────────────────────────
const Btn = ({ onClick, disabled = false, variant = "primary", size = "md", children, className = "" }: {
  onClick?: () => void; disabled?: boolean;
  variant?: "primary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md"; children: React.ReactNode; className?: string;
}) => {
  const sz = size === "sm" ? "h-7 px-3 text-xs" : "h-9 px-4 text-sm";
  const vr = variant === "primary"
    ? "bg-gradient-to-r from-blue-600 to-violet-600 text-white hover:from-blue-500 hover:to-violet-500 shadow-lg shadow-blue-900/30 hover:shadow-blue-900/50 hover:-translate-y-px"
    : variant === "danger"
    ? "bg-red-600/80 text-white hover:bg-red-500/90 border border-red-500/30 hover:-translate-y-px"
    : variant === "outline"
    ? "border border-border bg-transparent hover:bg-muted/40 hover:border-primary/30 text-foreground"
    : "hover:bg-white/5 text-foreground";
  return (
    <button onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 font-medium rounded-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${sz} ${vr} ${className}`}>
      {children}
    </button>
  );
};

// ── Premium KPI Card ───────────────────────────────────────────
const KpiCard = ({ label, value, color = "", icon: Icon, glow }: {
  label: string; value: React.ReactNode; color?: string; icon?: React.ElementType; glow?: string;
}) => (
  <div className={`relative overflow-hidden rounded-xl border p-4 bg-gradient-to-br from-card to-card/60 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg group
    ${glow ? `border-${glow}/20 hover:border-${glow}/30 hover:shadow-${glow}/10` : "border-border hover:border-white/10"}`}>
    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
    {Icon && (
      <div className={`inline-flex h-7 w-7 items-center justify-center rounded-lg mb-2 ${glow ? `bg-${glow}/10` : "bg-muted/40"}`}>
        <Icon className={`h-3.5 w-3.5 ${color || "text-muted-foreground"}`} />
      </div>
    )}
    <p className="text-xs text-muted-foreground font-medium">{label}</p>
    <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
  </div>
);

// ── Stock Progress Bar ─────────────────────────────────────────
const StockBar = ({ current, reorder, max }: { current: number; reorder: number; max: number }) => {
  const safeMax = max || reorder * 3 || 1;
  const pct = Math.min(100, (current / safeMax) * 100);
  const isOut = current === 0;
  const isLow = !isOut && current <= reorder;
  const color = isOut ? "from-red-600 to-red-500" : isLow ? "from-amber-500 to-amber-400" : "from-emerald-600 to-green-400";
  const glow  = isOut ? "shadow-red-500/40"        : isLow ? "shadow-amber-400/30"        : "shadow-green-500/20";

  return (
    <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
      <div
        className={`h-full rounded-full bg-gradient-to-r ${color} shadow-sm ${glow} transition-all duration-500`}
        style={{ width: `${Math.max(pct, isOut ? 0 : 2)}%` }}
      />
    </div>
  );
};

// ── Status Badge ───────────────────────────────────────────────
const StatusPill = ({ status }: { status: "out" | "low" | "ok" }) => {
  const cfg = {
    out: { label: "Out of Stock", cls: "bg-red-950/60 text-red-400 border-red-500/30 shadow-red-500/20" },
    low: { label: "Low Stock",    cls: "bg-amber-950/60 text-amber-400 border-amber-500/30 shadow-amber-500/20" },
    ok:  { label: "In Stock",     cls: "bg-emerald-950/60 text-emerald-400 border-emerald-500/30 shadow-emerald-500/10" },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full border shadow-sm ${cfg.cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {cfg.label}
    </span>
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
  category: "Raw Material", unit_of_measure: "kg",
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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="w-full max-w-md relative">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/5 to-violet-500/5 blur-xl" />
        <div className="relative rounded-2xl border border-white/10 bg-card/95 backdrop-blur-xl p-6 space-y-4 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-base">{initial ? "Edit Product" : "Add Product"}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Fill in the product details below</p>
            </div>
            <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Product ID *</label>
              <Input className="h-9 text-sm font-mono bg-muted/20 border-border/60 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all" placeholder="e.g. FIN-PRP-1IN"
                value={f.sku_code} onChange={e => set("sku_code", e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Short Code</label>
              <Input className="h-9 text-sm font-mono bg-muted/20 border-border/60 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all" placeholder="e.g. 001"
                value={f.product_code} onChange={e => set("product_code", e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Product Name *</label>
            <Input className="h-9 text-sm bg-muted/20 border-border/60 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all" placeholder='e.g. 1/2" (13 MM) PRINCE'
              value={f.item_name} onChange={e => set("item_name", e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Category</label>
              <Select value={f.category} onValueChange={v => set("category", v)}>
                <SelectTrigger className="h-9 text-sm bg-muted/20 border-border/60"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Unit</label>
              <Input className="h-9 text-sm bg-muted/20 border-border/60 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all" placeholder="kg / pcs / meters / MT"
                value={f.unit_of_measure} onChange={e => set("unit_of_measure", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Buy Rate (₹)</label>
              <Input className="h-9 text-sm bg-muted/20 border-border/60 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all" type="number" min="0" step="0.01" placeholder="0.00"
                value={f.buy_rate} onChange={e => set("buy_rate", e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Reorder Level</label>
              <Input className="h-9 text-sm bg-muted/20 border-border/60 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all" type="number" min="0" placeholder="0"
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
        </div>
      </div>
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

  const statusOf = (i: InventoryItem): "out" | "low" | "ok" =>
    i.current_stock === 0                         ? "out" :
    i.current_stock <= i.minimum_reorder_level    ? "low" : "ok";

  const lowCount = items.filter(i => i.current_stock <= i.minimum_reorder_level).length;
  const maxStock = items.length > 0 ? Math.max(...items.map(i => i.current_stock)) : 1;

  return (
    <div className="space-y-5">
      {toast && <ToastEl msg={toast.msg} type={toast.type} onClose={clear} />}
      {modal && <ProductModal initial={modal === "add" ? null : modal} onSave={handleSave} onClose={() => setModal(null)} />}

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Total Products" value={items.length} icon={Package} />
        <KpiCard label="In Stock" value={items.filter(i => i.current_stock > i.minimum_reorder_level).length}
          color="text-emerald-400" icon={Check} glow="emerald" />
        <KpiCard label="Low / Out of Stock" value={lowCount}
          color={lowCount > 0 ? "text-red-400" : "text-emerald-400"} icon={AlertTriangle} glow={lowCount > 0 ? "red" : "emerald"} />
        <KpiCard label="Total Value" value={fmtRate(items.reduce((s,i) => s + i.current_stock * (i.buy_rate ?? 0), 0))}
          icon={Boxes} />
      </div>

      {/* Filters */}
      <div className="relative rounded-xl border border-border/60 bg-gradient-to-br from-card to-card/60 backdrop-blur-sm p-4">
        <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
        <div className="relative flex items-center gap-2 mb-3">
          <div className="h-6 w-6 flex items-center justify-center rounded-md bg-muted/40">
            <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filters</span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={load} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
            <Btn variant="primary" size="sm" onClick={() => setModal("add")}><Plus className="h-3.5 w-3.5" /> Add Product</Btn>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select value={catFilter} onValueChange={setCat}>
            <SelectTrigger className="h-8 text-xs bg-muted/20 border-border/60"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORY_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input className="pl-8 h-8 text-xs bg-muted/20 border-border/60 focus:border-primary/40 transition-all" placeholder="Search name, SKU or code…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {loading ? <Spinner /> : error ? <DbError msg={error} retry={load} /> : (
        <>
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-border/60 p-10 text-center space-y-4 bg-gradient-to-br from-card to-card/60">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted/30 mx-auto">
                <Package className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No products found</p>
              <Btn variant="primary" size="sm" onClick={() => setModal("add")}><Plus className="h-3.5 w-3.5" /> Add First Product</Btn>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(item => {
                const st   = statusOf(item);
                const isEx = expanded === item.id;
                const accentColor = st === "out" ? "bg-red-500" : st === "low" ? "bg-amber-500" : "bg-emerald-500";
                const borderColor = st === "out" ? "hover:border-red-500/30" : st === "low" ? "hover:border-amber-500/30" : "hover:border-emerald-500/20";

                return (
                  <div key={item.id}
                    className={`group relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-card to-card/70 backdrop-blur-sm
                      transition-all duration-200 hover:-translate-y-px hover:shadow-lg hover:shadow-black/20 ${borderColor}
                      ${item.current_stock <= item.minimum_reorder_level && item.minimum_reorder_level > 0 ? "border-amber-500/20" : ""}`}>
                    {/* Left accent bar */}
                    <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${accentColor} opacity-70`} />
                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.015] to-transparent pointer-events-none" />

                    <div className="relative flex items-center gap-4 px-5 py-4 cursor-pointer"
                      onClick={() => setExpanded(isEx ? null : item.id)}>
                      <div className="text-muted-foreground flex-shrink-0 transition-transform duration-200 group-hover:text-foreground">
                        {isEx ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        {/* Name — SKU */}
                        <p className="text-sm font-semibold truncate leading-tight">
                          {item.item_name}
                          <span className="ml-2 text-muted-foreground font-normal font-mono text-xs">
                            — {item.product_code || item.sku_code}
                          </span>
                        </p>
                        {/* IN / OUT = stock */}
                        <p className="text-sm">
                          <span className="text-emerald-400 font-semibold">IN {item.current_stock}</span>
                          <span className="mx-2 text-muted-foreground text-xs">OUT</span>
                          <span className="text-red-400 font-semibold">0</span>
                          <span className="mx-1.5 text-muted-foreground">═</span>
                          <span className="font-bold text-base">{item.current_stock}</span>
                          <span className="ml-1 text-muted-foreground text-xs">{item.unit_of_measure}</span>
                        </p>
                        {/* Stock bar */}
                        <StockBar current={item.current_stock} reorder={item.minimum_reorder_level} max={maxStock} />
                        {/* qty × rate = value */}
                        {(item.buy_rate ?? 0) > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {item.current_stock} × {fmtRate(item.buy_rate)} = <span className="text-foreground font-medium">{fmtRate(item.current_stock * item.buy_rate)}</span>
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <StatusPill status={st} />
                        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                          <button onClick={() => setModal(item)}
                            className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleDelete(item)}
                            className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-950/30 transition-all">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {isEx && (
                      <div className="relative px-14 pb-4 border-t border-white/5 bg-gradient-to-br from-muted/10 to-transparent">
                        <div className="grid grid-cols-4 gap-4 pt-3 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5">SKU Code</p>
                            <p className="font-mono font-medium text-xs bg-muted/20 inline-block px-2 py-0.5 rounded">{item.sku_code}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5">Category</p>
                            <p className="font-medium text-sm">{getCategoryLabel(item.category)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5">Buy Rate</p>
                            <p className="font-medium text-sm">{fmtRate(item.buy_rate ?? 0)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5">Reorder At</p>
                            <p className={`font-medium text-sm ${item.current_stock <= item.minimum_reorder_level ? "text-amber-400" : ""}`}>
                              {fmtQty(item.minimum_reorder_level, item.unit_of_measure)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
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
        <div className="relative rounded-xl border border-border/60 bg-gradient-to-br from-card to-card/60 backdrop-blur-sm p-6 space-y-5 shadow-lg">
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
          <div className="relative">
            <h3 className="text-sm font-semibold">Record Stock Movement</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Track inbound and outbound inventory</p>
          </div>

          {/* IN / OUT toggle */}
          <div className="relative">
            <label className="text-xs text-muted-foreground mb-2.5 block font-medium uppercase tracking-wide">Movement Type *</label>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground/60 font-medium uppercase tracking-wider">Stock In</p>
              <div className="grid grid-cols-2 gap-2">
                {inTypes.map(t => (
                  <button key={t.value} onClick={() => setTxType(t.value)}
                    className={`relative flex items-center justify-center gap-2 h-10 rounded-lg border text-xs font-semibold transition-all duration-200
                      ${txType === t.value
                        ? "border-emerald-500/50 bg-gradient-to-br from-emerald-950/60 to-emerald-900/20 text-emerald-400 shadow-lg shadow-emerald-900/20"
                        : "border-border/60 bg-muted/10 hover:bg-muted/30 hover:border-border text-muted-foreground"}`}>
                    {txType === t.value && <div className="absolute inset-0 rounded-lg bg-emerald-400/5" />}
                    <ArrowDownToLine className="h-3.5 w-3.5" />{t.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground/60 font-medium uppercase tracking-wider pt-1">Stock Out</p>
              <div className="grid grid-cols-2 gap-2">
                {outTypes.map(t => (
                  <button key={t.value} onClick={() => setTxType(t.value)}
                    className={`relative flex items-center justify-center gap-2 h-10 rounded-lg border text-xs font-semibold transition-all duration-200
                      ${txType === t.value
                        ? "border-red-500/50 bg-gradient-to-br from-red-950/60 to-red-900/20 text-red-400 shadow-lg shadow-red-900/20"
                        : "border-border/60 bg-muted/10 hover:bg-muted/30 hover:border-border text-muted-foreground"}`}>
                    {txType === t.value && <div className="absolute inset-0 rounded-lg bg-red-400/5" />}
                    <ArrowUpFromLine className="h-3.5 w-3.5" />{t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Product select */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Product *</label>
            <Select value={selectedId} onValueChange={setSelId}>
              <SelectTrigger className="h-9 text-sm bg-muted/20 border-border/60 focus:border-primary/40">
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
              <div className="mt-2.5 px-4 py-3 rounded-xl bg-gradient-to-br from-muted/30 to-muted/10 border border-white/5">
                <p className="text-sm font-semibold">
                  {selectedItem.item_name}
                  <span className="ml-2 font-mono text-xs text-muted-foreground">— {selectedItem.product_code || selectedItem.sku_code}</span>
                </p>
                <p className="text-sm mt-1">
                  <span className="text-emerald-400 font-semibold">IN {selectedItem.current_stock}</span>
                  <span className="mx-2 text-muted-foreground text-xs">OUT 0 =</span>
                  <span className="font-bold">{selectedItem.current_stock} {selectedItem.unit_of_measure}</span>
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
            <label className="text-xs text-muted-foreground mb-1.5 block font-medium">
              Quantity{selectedItem ? ` (${selectedItem.unit_of_measure})` : ""} *
            </label>
            <Input type="number" min="0.01" step="0.01" className="h-9 text-sm bg-muted/20 border-border/60 focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all"
              placeholder="Enter quantity" value={qty} onChange={e => setQty(e.target.value)} />
            {previewStock !== null && (
              <div className="mt-2 px-3 py-2 rounded-lg bg-muted/20 border border-white/5">
                <p className="text-xs text-muted-foreground">
                  New stock after:{" "}
                  <span className={`font-bold ${previewStock <= 0 ? "text-red-400" : previewStock <= (selectedItem?.minimum_reorder_level ?? 0) ? "text-amber-400" : "text-emerald-400"}`}>
                    {fmtQty(Math.max(0, previewStock), selectedItem?.unit_of_measure)}
                  </span>
                  {(selectedItem?.buy_rate ?? 0) > 0 && previewStock > 0 &&
                    <span className="ml-2 text-muted-foreground">= {fmtRate(previewStock * selectedItem!.buy_rate)}</span>}
                </p>
              </div>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Date *</label>
            <Input type="date" className="h-9 text-sm bg-muted/20 border-border/60 focus:border-primary/40 transition-all" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          {/* Reference */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Reference <span className="opacity-40">(optional)</span></label>
            <Input className="h-9 text-sm bg-muted/20 border-border/60 focus:border-primary/40 transition-all" placeholder="e.g. PO-2026-001" value={reference} onChange={e => setRef(e.target.value)} />
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting || !selectedId || !qty}
            className={`w-full h-10 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2
              disabled:opacity-40 disabled:cursor-not-allowed
              ${isIn
                ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-900/30 hover:shadow-emerald-900/50 hover:-translate-y-px"
                : "bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-lg shadow-red-900/30 hover:shadow-red-900/50 hover:-translate-y-px"}`}>
            {submitting
              ? <><RefreshCw className="h-4 w-4 animate-spin" /> Recording…</>
              : <><Check className="h-4 w-4" /> Record {isIn ? "Stock IN" : "Stock OUT"}</>}
          </button>
        </div>

        {/* ── Recent movements ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Recent Movements</h3>
              <p className="text-xs text-muted-foreground">Last 15 stock events</p>
            </div>
            <button onClick={() => { loadItems(); loadRecent(); }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
          </div>
          {loadingRec ? <Spinner /> : recentTxns.length === 0 ? (
            <div className="rounded-xl border border-border/60 p-6 text-center text-sm text-muted-foreground bg-gradient-to-br from-card to-card/60">
              No movements yet
            </div>
          ) : recentTxns.map(t => {
            const dir  = txDir(t.transaction_type);
            const isIn = dir === "in";
            const unit = t.inventory_items?.unit_of_measure ?? "";
            const rate = t.inventory_items?.buy_rate ?? 0;
            return (
              <div key={t.id}
                className="group relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-card to-card/60 px-4 py-3.5
                  hover:-translate-y-px hover:shadow-md hover:shadow-black/20 hover:border-white/10 transition-all duration-200">
                {/* Timeline line */}
                <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${isIn ? "bg-emerald-500" : "bg-red-500"} opacity-60`} />
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.01] to-transparent pointer-events-none" />

                <div className="relative flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 border
                      ${isIn ? "bg-emerald-950/60 border-emerald-500/20 shadow-lg shadow-emerald-900/20" : "bg-red-950/60 border-red-500/20 shadow-lg shadow-red-900/20"}`}>
                      {isIn
                        ? <ArrowDownToLine className="h-3.5 w-3.5 text-emerald-400" />
                        : <ArrowUpFromLine className="h-3.5 w-3.5 text-red-400" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium leading-tight">{t.inventory_items?.item_name ?? `Item #${t.item_id}`}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <span className={`font-medium ${isIn ? "text-emerald-400/70" : "text-red-400/70"}`}>
                          {getTransactionLabel(t.transaction_type)}
                        </span>
                        <span className="mx-1.5">·</span>
                        {new Date(t.transaction_date ?? t.created_at).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" })}
                        {t.reference_number && <span className="ml-1.5 font-mono text-muted-foreground/60">· {t.reference_number}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-bold tabular-nums ${isIn ? "text-emerald-400" : "text-red-400"}`}>
                      {isIn ? "+" : "−"}{fmtQty(t.quantity_changed, unit)}
                    </p>
                    {rate > 0 && <p className="text-xs text-muted-foreground">{fmtRate(t.quantity_changed * rate)}</p>}
                  </div>
                </div>
              </div>
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
  const [deleting, setDeleting] = useState<string | null>(null);
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
        <KpiCard label="Total Records" value={filtered.length} icon={ClipboardList} />
        <KpiCard label="Total IN" value={totalIn.toLocaleString("en-IN")} color="text-emerald-400" icon={ArrowDownToLine} glow="emerald" />
        <KpiCard label="Total OUT" value={totalOut.toLocaleString("en-IN")} color="text-red-400" icon={ArrowUpFromLine} glow="red" />
      </div>

      <div className="relative rounded-xl border border-border/60 bg-gradient-to-br from-card to-card/60 backdrop-blur-sm p-4">
        <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
        <div className="relative flex items-center gap-2 mb-3">
          <div className="h-6 w-6 flex items-center justify-center rounded-md bg-muted/40">
            <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filters</span>
          <button onClick={load} className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select value={typeFilter} onValueChange={setType}>
            <SelectTrigger className="h-8 text-xs bg-muted/20 border-border/60"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {TX_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input className="pl-8 h-8 text-xs bg-muted/20 border-border/60 focus:border-primary/40 transition-all" placeholder="Search product or reference…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {loading ? <Spinner /> : error ? <DbError msg={error} retry={load} /> : (
        <div className="relative rounded-xl border border-border/60 bg-gradient-to-br from-card to-card/60 overflow-hidden shadow-sm">
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.01] to-transparent pointer-events-none" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-gradient-to-r from-muted/30 to-muted/10">
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Product</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                  <th className="px-5 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Qty</th>
                  <th className="px-5 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Value</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reference</th>
                  <th className="px-3 py-3.5 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0
                  ? <tr><td colSpan={7} className="py-12 text-center text-muted-foreground text-sm">No transactions found</td></tr>
                  : filtered.map((t, idx) => {
                    const dir      = txDir(t.transaction_type);
                    const isIn     = dir === "in";
                    const unit     = t.inventory_items?.unit_of_measure ?? "";
                    const rate     = t.inventory_items?.buy_rate ?? 0;
                    const isDeleting = deleting === t.id;
                    return (
                      <tr key={t.id}
                        className={`border-t border-white/5 transition-all duration-150
                          ${isDeleting ? "opacity-40" : "hover:bg-gradient-to-r hover:from-white/[0.02] hover:to-transparent"}
                          ${idx % 2 === 0 ? "" : "bg-white/[0.008]"}`}>
                        <td className="px-5 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(t.transaction_date ?? t.created_at).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" })}
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-sm">{t.inventory_items?.item_name ?? `#${t.item_id}`}</p>
                          <p className="text-xs text-muted-foreground font-mono">{t.inventory_items?.sku_code}</p>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border shadow-sm
                            ${isIn
                              ? "bg-emerald-950/60 text-emerald-400 border-emerald-500/20 shadow-emerald-900/10"
                              : "bg-red-950/60 text-red-400 border-red-500/20 shadow-red-900/10"}`}>
                            {isIn ? <ArrowDownToLine className="h-3 w-3" /> : <ArrowUpFromLine className="h-3 w-3" />}
                            {getTransactionLabel(t.transaction_type)}
                          </span>
                        </td>
                        <td className={`px-5 py-3.5 text-right tabular-nums font-bold text-sm ${isIn ? "text-emerald-400" : "text-red-400"}`}>
                          {isIn ? "+" : "−"}{fmtQty(t.quantity_changed, unit)}
                        </td>
                        <td className="px-5 py-3.5 text-right tabular-nums text-xs text-foreground/70 font-medium">
                          {rate > 0 ? fmtRate(t.quantity_changed * rate) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">
                          {t.reference_number
                            ? <span className="bg-muted/20 px-2 py-0.5 rounded">{t.reference_number}</span>
                            : "—"}
                        </td>
                        <td className="px-2 py-3.5">
                          <button
                            onClick={() => handleDelete(t)}
                            disabled={isDeleting}
                            className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-950/30 transition-all disabled:cursor-not-allowed">
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
        </div>
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
        <KpiCard label="Out of Stock" value={out.length} color="text-red-400" icon={AlertTriangle} glow="red" />
        <KpiCard label="Low Stock" value={low.length} color="text-amber-400" icon={AlertTriangle} glow="amber" />
        <KpiCard label="Healthy" value={healthy.length} color="text-emerald-400" icon={Check} glow="emerald" />
      </div>
      <div className="flex justify-end">
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      {loading ? <Spinner /> : error ? <DbError msg={error} retry={load} /> : (
        <>
          {out.length === 0 && low.length === 0 ? (
            <div className="relative rounded-xl border border-emerald-500/20 p-12 text-center space-y-3 bg-gradient-to-br from-emerald-950/10 to-transparent">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/[0.01] to-transparent pointer-events-none" />
              <div className="relative inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-950/40 border border-emerald-500/30 mx-auto">
                <Check className="h-6 w-6 text-emerald-400" />
              </div>
              <p className="relative font-semibold text-emerald-400">All items are well stocked</p>
            </div>
          ) : (
            <div className="space-y-5">
              {out.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                    <p className="text-xs font-bold text-red-400 uppercase tracking-wider">Out of Stock ({out.length})</p>
                  </div>
                  {out.map(item => (
                    <div key={item.id}
                      className="relative overflow-hidden flex items-center justify-between p-4 rounded-xl border border-red-500/30 bg-gradient-to-br from-red-950/20 to-red-950/5
                        hover:-translate-y-px hover:shadow-lg hover:shadow-red-900/20 hover:border-red-500/40 transition-all duration-200 group">
                      {/* Critical glow */}
                      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-red-500 shadow-lg shadow-red-500/50" />
                      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.01] to-transparent pointer-events-none" />
                      <div className="relative flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-red-950/60 border border-red-500/20 flex-shrink-0">
                          <AlertTriangle className="h-4 w-4 text-red-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{item.item_name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{item.sku_code}</p>
                        </div>
                      </div>
                      <div className="relative text-right">
                        <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-red-950/80 border border-red-500/30 text-red-400 shadow-sm shadow-red-900/20">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                          OUT OF STOCK
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {low.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    <p className="text-xs font-bold text-amber-500 uppercase tracking-wider">Low Stock ({low.length})</p>
                  </div>
                  {low.map(item => (
                    <div key={item.id}
                      className="relative overflow-hidden flex items-center justify-between p-4 rounded-xl border border-amber-500/25 bg-gradient-to-br from-amber-950/15 to-amber-950/5
                        hover:-translate-y-px hover:shadow-lg hover:shadow-amber-900/15 hover:border-amber-500/35 transition-all duration-200">
                      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-amber-500/70" />
                      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.01] to-transparent pointer-events-none" />
                      <div className="relative flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-amber-950/60 border border-amber-500/20 flex-shrink-0">
                          <AlertTriangle className="h-4 w-4 text-amber-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{item.item_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {getCategoryLabel(item.category)} · Reorder at {fmtQty(item.minimum_reorder_level, item.unit_of_measure)}
                          </p>
                        </div>
                      </div>
                      <div className="relative text-right">
                        <p className="text-sm font-bold text-amber-400">{fmtQty(item.current_stock, item.unit_of_measure)}</p>
                        <p className="text-xs text-muted-foreground">{fmtQty(item.minimum_reorder_level - item.current_stock, item.unit_of_measure)} below reorder</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {healthy.length > 0 && (
            <div className="relative rounded-xl border border-border/60 overflow-hidden bg-gradient-to-br from-card to-card/60">
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.01] to-transparent pointer-events-none" />
              <div className="relative px-5 py-3 border-b border-white/5 bg-gradient-to-r from-emerald-950/20 to-transparent flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Healthy Stock ({healthy.length})</p>
              </div>
              <div className="divide-y divide-white/5">
                {healthy.map(item => (
                  <div key={item.id}
                    className="relative flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.02] transition-colors group">
                    <div>
                      <p className="text-sm font-medium group-hover:text-foreground transition-colors">{item.item_name}</p>
                      <p className="text-xs text-muted-foreground">{getCategoryLabel(item.category)}</p>
                    </div>
                    <p className="text-sm font-bold text-emerald-400">{fmtQty(item.current_stock, item.unit_of_measure)}</p>
                  </div>
                ))}
              </div>
            </div>
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

  const getInitialTab = (): Section => {
    if (pathname.includes("movement"))     return "movement";
    if (pathname.includes("transactions")) return "transactions";
    if (pathname.includes("alerts"))       return "alerts";
    return "products";
  };

  const [section, setSection] = useState<Section>(getInitialTab);

  useEffect(() => {
    setSection(getInitialTab());
  }, [pathname]);

  const activeTab = TABS.find(t => t.section === section)!;
  const Icon = activeTab.icon;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 flex items-center justify-center rounded-lg bg-gradient-to-br from-blue-600/20 to-violet-600/20 border border-primary/20">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground leading-tight">{activeTab.label}</h2>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full border border-emerald-500/30 text-emerald-400 bg-emerald-950/30 font-medium flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Live · Supabase
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
