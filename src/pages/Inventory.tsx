import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  getItems, getTransactions, addItem, updateItem, deleteItem,
  postTransaction, reverseTransaction,
  ITEM_CATEGORIES, ITEM_CATEGORY_LABELS, ITEM_CATEGORY_META,
  entryToValuationQty, getMovementQtyLabel,
} from "@/data/inventoryStore";
import type {
  InventoryItem, InventoryTransaction, ProductType, TransactionType,
  RawMaterialProfile, ChemicalProfile, FinishedGoodsProfile,
  PackagingProfile, TradingGoodsProfile,
} from "@/data/inventory";
import { formatStockDisplay, getConversionFactor, valuationToPurchase, getInventoryItemValuationRate, getFinishedGoodValuationRate, getTotalWeightInStock, getTotalInventoryWeight } from "@/data/inventory";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Package, AlertTriangle, ChevronDown, ChevronRight,
  Search, SlidersHorizontal, RefreshCw, Plus, X, Check,
  Boxes, ClipboardList, Pencil, Trash2,
  ArrowDownToLine, ArrowUpFromLine,
  PackageSearch, Bell, PlusCircle,
  FlaskConical, ShoppingCart, Box, Beaker,
  Layers, Tag, Ruler, Palette, ChevronLeft,
  ArrowRightLeft,
} from "lucide-react";

// ── Page meta ──────────────────────────────────────────────────────
const PAGE_META = {
  "/inventory": { title: "Inventory", icon: Boxes, section: "products" },
  "/inventory/products": { title: "Products", icon: Package, section: "products" },
  "/inventory/movement": { title: "Stock Movement", icon: PlusCircle, section: "movement" },
  "/inventory/transactions": { title: "Transaction Log", icon: ClipboardList, section: "transactions" },
  "/inventory/alerts": { title: "Low Stock Alerts", icon: Bell, section: "alerts" },
} as const;

// ── Category icon map ──────────────────────────────────────────────
const CATEGORY_ICON_MAP: Record<ProductType, React.ElementType> = {
  "Raw Material":  FlaskConical,
  "Chemical":      Beaker,
  "Finished Good": Package,
  "Packaging":     Box,
  "Trading Goods": ShoppingCart,
};

// ── Transaction types ──────────────────────────────────────────────
const TX_TYPES: { value: TransactionType; label: string; dir: "in" | "out"; color: string }[] = [
  { value: "Purchase/In",    label: "Purchase / In",   dir: "in",  color: "text-green-400" },
  { value: "return_in",      label: "Return / In",     dir: "in",  color: "text-emerald-400" },
  { value: "Production/Out", label: "Production / Out",dir: "out", color: "text-amber-500" },
  { value: "Sales/Out",      label: "Sales / Out",     dir: "out", color: "text-red-400" },
  { value: "Adjustment",     label: "Adjustment",      dir: "in",  color: "text-blue-400" },
];
const txDir   = (t: TransactionType) => TX_TYPES.find(x => x.value === t)?.dir ?? "in";
const txColor = (t: TransactionType) => TX_TYPES.find(x => x.value === t)?.color ?? "";
const getTransactionLabel = (type: TransactionType) =>
  TX_TYPES.find(o => o.value === type)?.label ?? type;

const fmtQty  = (n: number, unit = "") =>
  `${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}${unit ? " " + unit : ""}`;
const fmtRate = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const todayStr = () => new Date().toISOString().split("T")[0];

// ── Shared UI primitives ───────────────────────────────────────────
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

const KpiCard = ({ label, value, color = "", icon: Icon, glow }: {
  label: string; value: React.ReactNode; color?: string; icon?: React.ElementType; glow?: string;
}) => (
  <div className={`relative overflow-hidden rounded-xl border p-4 bg-gradient-to-br from-card to-card/60 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg group
    ${glow ? `border-${glow}-500/20 hover:border-${glow}-500/30 hover:shadow-${glow}-500/10` : "border-border hover:border-white/10"}`}>
    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
    {Icon && (
      <div className={`inline-flex h-7 w-7 items-center justify-center rounded-lg mb-2 ${glow ? `bg-${glow}-500/10` : "bg-muted/40"}`}>
        <Icon className={`h-3.5 w-3.5 ${color || "text-muted-foreground"}`} />
      </div>
    )}
    <p className="text-xs text-muted-foreground font-medium">{label}</p>
    <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
  </div>
);

const StockBar = ({ current, reorder, max }: { current: number; reorder: number; max: number }) => {
  const safeMax = max || reorder * 3 || 1;
  const pct = Math.min(100, (current / safeMax) * 100);
  const isOut = current === 0;
  const isLow = !isOut && current <= reorder;
  const color = isOut ? "from-red-600 to-red-500" : isLow ? "from-amber-500 to-amber-400" : "from-emerald-600 to-green-400";

  return (
    <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
      <div
        className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-500`}
        style={{ width: `${Math.max(pct, isOut ? 0 : 2)}%` }}
      />
    </div>
  );
};

const StatusPill = ({ status }: { status: "out" | "low" | "ok" }) => {
  const cfg = {
    out: { label: "Out of Stock", cls: "bg-red-950/60 text-red-400 border-red-500/30" },
    low: { label: "Low Stock",    cls: "bg-amber-950/60 text-amber-400 border-amber-500/30" },
    ok:  { label: "In Stock",     cls: "bg-emerald-950/60 text-emerald-400 border-emerald-500/30" },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full border shadow-sm ${cfg.cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {cfg.label}
    </span>
  );
};

const CategoryBadge = ({ category }: { category: ProductType }) => {
  const meta = ITEM_CATEGORY_META[category] ?? ITEM_CATEGORY_META["Packaging"];
  const Icon = CATEGORY_ICON_MAP[category] ?? Package;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${meta.badge}`}>
      <Icon className="h-2.5 w-2.5" />
      {ITEM_CATEGORY_LABELS[category] ?? category}
    </span>
  );
};

// ══════════════════════════════════════════════════════════════════
// PRODUCT PROFILE MODAL — Step-based dynamic form
// ══════════════════════════════════════════════════════════════════

// ── Field shapes per profile type ─────────────────────────────────
interface RawMaterialForm {
  sku_code: string; product_code: string; item_name: string;
  purchase_unit: string; conversion_factor: string;
  buy_rate: string; minimum_reorder_level: string;
}
interface ChemicalForm {
  sku_code: string; product_code: string; item_name: string;
  purchase_unit: string; litres_per_drum: string;
  buy_rate: string; minimum_reorder_level: string;
}
interface FinishedGoodsForm {
  sku_code: string; product_code: string; item_name: string;
  mrp: string; dealer_discount_pct: string;
  valuation_rate: string;
  bundle_weight: string; pieces_per_bundle: string;
  diameter: string; pressure_grade: string; length: string; color: string;
  minimum_reorder_level: string;
}

interface PackagingForm {
  sku_code: string; product_code: string; item_name: string;
  unit_of_measure: string; buy_rate: string; minimum_reorder_level: string;
}
interface TradingGoodsForm {
  sku_code: string; product_code: string; item_name: string;
  unit_of_measure: string; buy_rate: string;
  mrp: string; dealer_discount_pct: string; minimum_reorder_level: string;
}

type AnyProfileForm = RawMaterialForm | ChemicalForm | FinishedGoodsForm | PackagingForm | TradingGoodsForm;

const EMPTY_RM: RawMaterialForm = { sku_code: "", product_code: "", item_name: "", purchase_unit: "Bag", conversion_factor: "25", buy_rate: "", minimum_reorder_level: "" };
const EMPTY_CH: ChemicalForm   = { sku_code: "", product_code: "", item_name: "", purchase_unit: "Drum", litres_per_drum: "220", buy_rate: "", minimum_reorder_level: "" };
const EMPTY_FG: FinishedGoodsForm = { sku_code: "", product_code: "", item_name: "", mrp: "", dealer_discount_pct: "", valuation_rate: "", bundle_weight: "", pieces_per_bundle: "", diameter: "", pressure_grade: "", length: "", color: "Grey", minimum_reorder_level: "" };

const EMPTY_PK: PackagingForm  = { sku_code: "", product_code: "", item_name: "", unit_of_measure: "pcs", buy_rate: "", minimum_reorder_level: "" };
const EMPTY_TG: TradingGoodsForm = { sku_code: "", product_code: "", item_name: "", unit_of_measure: "pcs", buy_rate: "", mrp: "", dealer_discount_pct: "", minimum_reorder_level: "" };

function getEmptyForm(type: ProductType): AnyProfileForm {
  if (type === "Raw Material")  return { ...EMPTY_RM };
  if (type === "Chemical")      return { ...EMPTY_CH };
  if (type === "Finished Good") return { ...EMPTY_FG };
  if (type === "Packaging")     return { ...EMPTY_PK };
  return { ...EMPTY_TG };
}

function buildPayload(type: ProductType, form: AnyProfileForm): Omit<InventoryItem, "id" | "created_at" | "updated_at" | "current_stock"> {
  const base = {
    sku_code:     (form as any).sku_code.trim(),
    product_code: (form as any).product_code.trim(),
    item_name:    (form as any).item_name.trim(),
    category:     type,
  };

  if (type === "Raw Material") {
    const f = form as RawMaterialForm;
    const cf = parseFloat(f.conversion_factor) || 1;
    const profile: RawMaterialProfile = {
      product_type: "Raw Material",
      base_unit: "KG",
      purchase_unit: f.purchase_unit.trim() || "Bag",
      conversion_factor: cf,
      rate_per_base_unit: parseFloat(f.buy_rate) || 0,
    };
    return {
      ...base,
      unit_of_measure: "KG",
      purchase_unit: f.purchase_unit.trim() || "Bag",
      conversion_factor: cf,
      valuation_unit: "KG",
      display_unit: "KG",
      buy_rate: parseFloat(f.buy_rate) || 0,
      minimum_reorder_level: parseFloat(f.minimum_reorder_level) || 0,
      profile_data: profile,
    };
  }

  if (type === "Chemical") {
    const f = form as ChemicalForm;
    const ratio = parseFloat(f.litres_per_drum) || 220;
    const profile: ChemicalProfile = {
      product_type: "Chemical",
      base_unit: "Litre",
      purchase_unit: f.purchase_unit.trim() || "Drum",
      conversion_ratio: ratio,
      rate_per_litre: parseFloat(f.buy_rate) || 0,
    };
    return {
      ...base,
      unit_of_measure: "Litre",
      purchase_unit: f.purchase_unit.trim() || "Drum",
      conversion_factor: ratio,
      valuation_unit: "Litre",
      display_unit: "Litre",
      buy_rate: parseFloat(f.buy_rate) || 0,
      minimum_reorder_level: parseFloat(f.minimum_reorder_level) || 0,
      profile_data: profile,
    };
  }

  if (type === "Finished Good") {
    const f = form as FinishedGoodsForm;
    const mrp = parseFloat(f.mrp) || 0;
    const discPct = parseFloat(f.dealer_discount_pct) || 0;
    const netDealer = mrp * (1 - discPct / 100);
    const valuationRate = parseFloat(f.valuation_rate) || 0;
    const profile: FinishedGoodsProfile = {
      product_type: "Finished Good",
      sales_unit: "BDL",
      mrp,
      dealer_discount_pct: discPct,
      net_dealer_price: netDealer,
      valuation_rate: valuationRate,
      bundle_weight: parseFloat(f.bundle_weight) || 0,
      pieces_per_bundle: parseInt(f.pieces_per_bundle) || 0,
      diameter: f.diameter.trim(),
      pressure_grade: f.pressure_grade.trim(),
      length: f.length.trim(),
      color: f.color.trim() || "Grey",
    };
    return {
      ...base,
      unit_of_measure: "BDL",
      purchase_unit: null,
      conversion_factor: 1,
      valuation_unit: "BDL",
      display_unit: "BDL",
      // Mirror valuation_rate into buy_rate so all WAC formulas work unchanged
      buy_rate: valuationRate,
      minimum_reorder_level: parseFloat(f.minimum_reorder_level) || 0,
      profile_data: profile,
    };
  }


  if (type === "Packaging") {
    const f = form as PackagingForm;
    const profile: PackagingProfile = {
      product_type: "Packaging",
      unit: f.unit_of_measure.trim() || "pcs",
    };
    return {
      ...base,
      unit_of_measure: f.unit_of_measure.trim() || "pcs",
      purchase_unit: null,
      conversion_factor: 1,
      valuation_unit: f.unit_of_measure.trim() || "pcs",
      display_unit: f.unit_of_measure.trim() || "pcs",
      buy_rate: parseFloat(f.buy_rate) || 0,
      minimum_reorder_level: parseFloat(f.minimum_reorder_level) || 0,
      profile_data: profile,
    };
  }

  // Trading Goods
  const f = form as TradingGoodsForm;
  const mrp = parseFloat(f.mrp) || 0;
  const discPct = parseFloat(f.dealer_discount_pct) || 0;
  const profile: TradingGoodsProfile = {
    product_type: "Trading Goods",
    sales_unit: f.unit_of_measure.trim() || "pcs",
    mrp: mrp || undefined,
    dealer_discount_pct: discPct || undefined,
  };
  return {
    ...base,
    unit_of_measure: f.unit_of_measure.trim() || "pcs",
    purchase_unit: null,
    conversion_factor: 1,
    valuation_unit: f.unit_of_measure.trim() || "pcs",
    display_unit: f.unit_of_measure.trim() || "pcs",
    buy_rate: parseFloat(f.buy_rate) || 0,
    minimum_reorder_level: parseFloat(f.minimum_reorder_level) || 0,
    profile_data: profile,
  };
}

// ── Step 1: Product Type Selector ──────────────────────────────────
const ProductTypeStep = ({ selected, onSelect }: { selected: ProductType | null; onSelect: (t: ProductType) => void }) => {
  const types: { type: ProductType; examples: string }[] = [
    { type: "Raw Material",  examples: "PVC Resin, CPVC Compound, PP Granules" },
    { type: "Chemical",      examples: "CPW Lubricant, Stabilizer, Pigment" },
    { type: "Finished Good", examples: "1\" Pipe Bundle, 2\" Pipe Bundle" },
    { type: "Packaging",     examples: "PP Bags, HDPE Shrink, Carton Box" },
    { type: "Trading Goods", examples: "Fittings, Joints, Accessories" },
  ];

  return (
    <div className="space-y-2">
      {types.map(({ type, examples }) => {
        const Icon = CATEGORY_ICON_MAP[type];
        const meta = ITEM_CATEGORY_META[type];
        const isSelected = selected === type;
        return (
          <button
            key={type}
            onClick={() => onSelect(type)}
            className={`w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all duration-200
              ${isSelected
                ? `border-primary/50 bg-gradient-to-br from-primary/10 to-primary/5 shadow-lg shadow-primary/10`
                : "border-border/60 bg-muted/10 hover:bg-muted/30 hover:border-border"}`}
          >
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 border
              ${isSelected ? "bg-primary/20 border-primary/30" : "bg-muted/30 border-border/50"}`}>
              <Icon className={`h-4.5 w-4.5 ${isSelected ? "text-primary" : meta.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${isSelected ? "text-foreground" : "text-foreground/80"}`}>
                {ITEM_CATEGORY_LABELS[type]}
              </p>
              <p className="text-xs text-muted-foreground truncate">{examples}</p>
            </div>
            {isSelected && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
          </button>
        );
      })}
    </div>
  );
};

// ── Form field helper ──────────────────────────────────────────────
const Field = ({ label, hint, children, span = 1 }: { label: string; hint?: string; children: React.ReactNode; span?: 1 | 2 }) => (
  <div className={span === 2 ? "col-span-2" : ""}>
    <label className="text-xs text-muted-foreground mb-1.5 block font-medium">{label}</label>
    {children}
    {hint && <p className="text-xs text-muted-foreground/60 mt-1">{hint}</p>}
  </div>
);

const FInput = ({ value, onChange, placeholder = "", type = "text", min, step, className = "" }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; min?: string; step?: string; className?: string;
}) => (
  <Input
    type={type} min={min} step={step}
    className={`h-9 text-sm bg-muted/20 border-border/60 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all ${className}`}
    placeholder={placeholder}
    value={value}
    onChange={e => onChange(e.target.value)}
  />
);

// ── Step 2: Profile-specific form fields ───────────────────────────
const RawMaterialFields = ({ f, setF }: { f: RawMaterialForm; setF: (f: RawMaterialForm) => void }) => {
  const set = (k: keyof RawMaterialForm) => (v: string) => setF({ ...f, [k]: v });
  const cf = parseFloat(f.conversion_factor) || 1;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Product ID *"><FInput value={f.sku_code} onChange={set("sku_code")} placeholder="e.g. RM-PVC-001" className="font-mono" /></Field>
        <Field label="Short Code"><FInput value={f.product_code} onChange={set("product_code")} placeholder="e.g. 001" className="font-mono" /></Field>
      </div>
      <Field label="Product Name *" span={2}><FInput value={f.item_name} onChange={set("item_name")} placeholder="e.g. PVC Resin K-67" /></Field>
      <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-4 space-y-3">
        <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
          <ArrowRightLeft className="h-3 w-3" /> Unit Conversion
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Purchase Unit" hint="What you buy in">
            <FInput value={f.purchase_unit} onChange={set("purchase_unit")} placeholder="Bag" />
          </Field>
          <Field label="KG per Purchase Unit" hint="Valuation conversion">
            <FInput value={f.conversion_factor} onChange={set("conversion_factor")} type="number" min="0.01" step="0.01" placeholder="25" />
          </Field>
        </div>
        {cf > 0 && (
          <div className="px-3 py-2 rounded-lg bg-amber-950/20 border border-amber-500/10 text-xs text-amber-300">
            1 {f.purchase_unit || "Bag"} = {cf} KG &nbsp;·&nbsp; Stock tracked in <strong>KG</strong>, displayed as <strong>KG + {f.purchase_unit || "Bags"}</strong>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Rate per KG (₹)"><FInput value={f.buy_rate} onChange={set("buy_rate")} type="number" min="0" step="0.01" placeholder="92.00" /></Field>
        <Field label="Reorder Level (KG)"><FInput value={f.minimum_reorder_level} onChange={set("minimum_reorder_level")} type="number" min="0" placeholder="500" /></Field>
      </div>
    </div>
  );
};

const ChemicalFields = ({ f, setF }: { f: ChemicalForm; setF: (f: ChemicalForm) => void }) => {
  const set = (k: keyof ChemicalForm) => (v: string) => setF({ ...f, [k]: v });
  const litres = parseFloat(f.litres_per_drum) || 220;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Product ID *"><FInput value={f.sku_code} onChange={set("sku_code")} placeholder="e.g. CH-CPW-001" className="font-mono" /></Field>
        <Field label="Short Code"><FInput value={f.product_code} onChange={set("product_code")} placeholder="e.g. 002" className="font-mono" /></Field>
      </div>
      <Field label="Product Name *" span={2}><FInput value={f.item_name} onChange={set("item_name")} placeholder="e.g. CPW Lubricant" /></Field>
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/10 p-4 space-y-3">
        <p className="text-xs font-semibold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
          <Beaker className="h-3 w-3" /> Drum / Litre Conversion
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Purchase Unit"><FInput value={f.purchase_unit} onChange={set("purchase_unit")} placeholder="Drum" /></Field>
          <Field label="Litres per Drum"><FInput value={f.litres_per_drum} onChange={set("litres_per_drum")} type="number" min="1" step="1" placeholder="220" /></Field>
        </div>
        {litres > 0 && (
          <div className="px-3 py-2 rounded-lg bg-cyan-950/20 border border-cyan-500/10 text-xs text-cyan-300">
            1 {f.purchase_unit || "Drum"} = {litres} Litres &nbsp;·&nbsp; Stock tracked in <strong>Litres</strong>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Rate per Litre (₹)"><FInput value={f.buy_rate} onChange={set("buy_rate")} type="number" min="0" step="0.01" placeholder="0.00" /></Field>
        <Field label="Reorder Level (Litres)"><FInput value={f.minimum_reorder_level} onChange={set("minimum_reorder_level")} type="number" min="0" placeholder="440" /></Field>
      </div>
    </div>
  );
};

const FinishedGoodsFields = ({ f, setF }: { f: FinishedGoodsForm; setF: (f: FinishedGoodsForm) => void }) => {
  const set = (k: keyof FinishedGoodsForm) => (v: string) => setF({ ...f, [k]: v });
  const mrp = parseFloat(f.mrp) || 0;
  const disc = parseFloat(f.dealer_discount_pct) || 0;
  const netDealer = mrp * (1 - disc / 100);
  const valRate = parseFloat(f.valuation_rate) || 0;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Product ID *"><FInput value={f.sku_code} onChange={set("sku_code")} placeholder="e.g. FG-PIPE-1IN" className="font-mono" /></Field>
        <Field label="Short Code"><FInput value={f.product_code} onChange={set("product_code")} placeholder="e.g. P001" className="font-mono" /></Field>
      </div>
      <Field label="Product Name *" span={2}><FInput value={f.item_name} onChange={set("item_name")} placeholder='e.g. 1" (25MM) CPVC Pipe Bundle' /></Field>

      {/* Pricing */}
      <div className="rounded-xl border border-violet-500/20 bg-violet-950/10 p-4 space-y-3">
        <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider flex items-center gap-1.5">
          <Tag className="h-3 w-3" /> Dealer Pricing (per BDL)
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="MRP (₹)"><FInput value={f.mrp} onChange={set("mrp")} type="number" min="0" step="0.01" placeholder="0.00" /></Field>
          <Field label="Dealer Discount %"><FInput value={f.dealer_discount_pct} onChange={set("dealer_discount_pct")} type="number" min="0" max="100" step="0.01" placeholder="0.00" /></Field>
        </div>
        {mrp > 0 && (
          <div className="px-3 py-2 rounded-lg bg-violet-950/20 border border-violet-500/10 text-xs text-violet-300">
            MRP: {fmtRate(mrp)} &nbsp;−&nbsp; {disc}% = Net Dealer: <strong>{fmtRate(netDealer)}</strong>
          </div>
        )}
      </div>

      {/* Production Cost / Valuation */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-4 space-y-3">
        <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
          <Boxes className="h-3 w-3" /> Inventory Valuation
        </p>
        <Field
          label="Production Cost per BDL (₹)"
          hint="Used for inventory value: Stock × Production Cost. Leave blank to temporarily use Net Dealer Price."
        >
          <FInput
            value={f.valuation_rate}
            onChange={set("valuation_rate")}
            type="number" min="0" step="0.01"
            placeholder={netDealer > 0 ? `e.g. ${netDealer.toFixed(2)} (auto-fill from dealer price)` : "e.g. 850.00"}
          />
        </Field>
        {(valRate > 0 || netDealer > 0) && (
          <div className="px-3 py-2 rounded-lg bg-amber-950/20 border border-amber-500/10 text-xs text-amber-300">
            {valRate > 0
              ? <>Valuation rate: <strong>{fmtRate(valRate)} / BDL</strong><br /><span className="opacity-70">Inventory value = Stock × {fmtRate(valRate)}</span></>
              : <>No production cost set — will use Net Dealer price <strong>{fmtRate(netDealer)}</strong> as estimate</>}
          </div>
        )}
      </div>

      {/* Bundle specs */}
      <div className="rounded-xl border border-border/60 bg-muted/10 p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Layers className="h-3 w-3" /> Bundle Specifications
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bundle Weight (KG)"><FInput value={f.bundle_weight} onChange={set("bundle_weight")} type="number" min="0" step="0.1" placeholder="0.0" /></Field>
          <Field label="Pieces per Bundle"><FInput value={f.pieces_per_bundle} onChange={set("pieces_per_bundle")} type="number" min="1" step="1" placeholder="6" /></Field>
        </div>
      </div>

      {/* Pipe specs */}
      <div className="rounded-xl border border-border/60 bg-muted/10 p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Ruler className="h-3 w-3" /> Pipe Specifications
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Diameter"><FInput value={f.diameter} onChange={set("diameter")} placeholder='e.g. 1 inch (25 MM)' /></Field>
          <Field label="Pressure Grade"><FInput value={f.pressure_grade} onChange={set("pressure_grade")} placeholder="e.g. Class 4 / SDR 11" /></Field>
          <Field label="Length per Piece"><FInput value={f.length} onChange={set("length")} placeholder="e.g. 3 Metres" /></Field>
          <Field label="Color">
            <Select value={f.color} onValueChange={set("color")}>
              <SelectTrigger className="h-9 text-sm bg-muted/20 border-border/60"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Grey", "White", "Blue", "Green", "Cream", "Black", "Red"].map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>

      <Field label="Reorder Level (BDL)"><FInput value={f.minimum_reorder_level} onChange={set("minimum_reorder_level")} type="number" min="0" placeholder="0" /></Field>
    </div>
  );
};


const PackagingFields = ({ f, setF }: { f: PackagingForm; setF: (f: PackagingForm) => void }) => {
  const set = (k: keyof PackagingForm) => (v: string) => setF({ ...f, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Product ID *"><FInput value={f.sku_code} onChange={set("sku_code")} placeholder="e.g. PK-BAG-001" className="font-mono" /></Field>
        <Field label="Short Code"><FInput value={f.product_code} onChange={set("product_code")} placeholder="e.g. 003" className="font-mono" /></Field>
      </div>
      <Field label="Product Name *" span={2}><FInput value={f.item_name} onChange={set("item_name")} placeholder="e.g. PP Woven Bag 50KG" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Unit"><FInput value={f.unit_of_measure} onChange={set("unit_of_measure")} placeholder="pcs / rolls / sheets" /></Field>
        <Field label="Buy Rate (₹)"><FInput value={f.buy_rate} onChange={set("buy_rate")} type="number" min="0" step="0.01" placeholder="0.00" /></Field>
      </div>
      <Field label="Reorder Level"><FInput value={f.minimum_reorder_level} onChange={set("minimum_reorder_level")} type="number" min="0" placeholder="0" /></Field>
    </div>
  );
};

const TradingGoodsFields = ({ f, setF }: { f: TradingGoodsForm; setF: (f: TradingGoodsForm) => void }) => {
  const set = (k: keyof TradingGoodsForm) => (v: string) => setF({ ...f, [k]: v });
  const mrp = parseFloat(f.mrp) || 0;
  const disc = parseFloat(f.dealer_discount_pct) || 0;
  const netDealer = mrp * (1 - disc / 100);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Product ID *"><FInput value={f.sku_code} onChange={set("sku_code")} placeholder="e.g. TG-FIT-001" className="font-mono" /></Field>
        <Field label="Short Code"><FInput value={f.product_code} onChange={set("product_code")} placeholder="e.g. 004" className="font-mono" /></Field>
      </div>
      <Field label="Product Name *" span={2}><FInput value={f.item_name} onChange={set("item_name")} placeholder='e.g. 1" CPVC Elbow' /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Unit"><FInput value={f.unit_of_measure} onChange={set("unit_of_measure")} placeholder="pcs / box / set" /></Field>
        <Field label="Buy Rate (₹)"><FInput value={f.buy_rate} onChange={set("buy_rate")} type="number" min="0" step="0.01" placeholder="0.00" /></Field>
      </div>
      <div className="rounded-xl border border-blue-500/20 bg-blue-950/10 p-4 space-y-3">
        <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider flex items-center gap-1.5"><Tag className="h-3 w-3" /> Dealer Pricing</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="MRP (₹) — optional"><FInput value={f.mrp} onChange={set("mrp")} type="number" min="0" step="0.01" placeholder="0.00" /></Field>
          <Field label="Dealer Discount % — optional"><FInput value={f.dealer_discount_pct} onChange={set("dealer_discount_pct")} type="number" min="0" max="100" step="0.01" placeholder="0.00" /></Field>
        </div>
        {mrp > 0 && <div className="px-3 py-2 rounded-lg bg-blue-950/20 border border-blue-500/10 text-xs text-blue-300">Net Dealer: <strong>{fmtRate(netDealer)}</strong></div>}
      </div>
      <Field label="Reorder Level"><FInput value={f.minimum_reorder_level} onChange={set("minimum_reorder_level")} type="number" min="0" placeholder="0" /></Field>
    </div>
  );
};

// ── Edit form: initialise from existing item ───────────────────────
function formFromItem(item: InventoryItem): { type: ProductType; form: AnyProfileForm } {
  const type = item.category;
  const pd = item.profile_data as any;

  if (type === "Raw Material") {
    const f: RawMaterialForm = {
      sku_code: item.sku_code, product_code: item.product_code ?? "",
      item_name: item.item_name,
      purchase_unit: item.purchase_unit || pd?.purchase_unit || "Bag",
      conversion_factor: String(item.conversion_factor ?? pd?.conversion_factor ?? 25),
      buy_rate: String(item.buy_rate ?? pd?.rate_per_base_unit ?? ""),
      minimum_reorder_level: String(item.minimum_reorder_level),
    };
    return { type, form: f };
  }

  if (type === "Chemical") {
    const f: ChemicalForm = {
      sku_code: item.sku_code, product_code: item.product_code ?? "",
      item_name: item.item_name,
      purchase_unit: item.purchase_unit || pd?.purchase_unit || "Drum",
      litres_per_drum: String(item.conversion_factor ?? pd?.conversion_ratio ?? 220),
      buy_rate: String(item.buy_rate ?? pd?.rate_per_litre ?? ""),
      minimum_reorder_level: String(item.minimum_reorder_level),
    };
    return { type, form: f };
  }

  if (type === "Finished Good") {
    const f: FinishedGoodsForm = {
      sku_code: item.sku_code, product_code: item.product_code ?? "",
      item_name: item.item_name,
      mrp: String(pd?.mrp ?? ""),
      dealer_discount_pct: String(pd?.dealer_discount_pct ?? ""),
      // Read valuation_rate: prefer buy_rate (source of truth), then profile_data.valuation_rate
      valuation_rate: String(item.buy_rate && item.buy_rate > 0 ? item.buy_rate : (pd?.valuation_rate ?? "")),
      bundle_weight: String(pd?.bundle_weight ?? ""),
      pieces_per_bundle: String(pd?.pieces_per_bundle ?? ""),
      diameter: pd?.diameter ?? "",
      pressure_grade: pd?.pressure_grade ?? "",
      length: pd?.length ?? "",
      color: pd?.color ?? "Grey",
      minimum_reorder_level: String(item.minimum_reorder_level),
    };
    return { type, form: f };
  }


  if (type === "Trading Goods") {
    const f: TradingGoodsForm = {
      sku_code: item.sku_code, product_code: item.product_code ?? "",
      item_name: item.item_name,
      unit_of_measure: item.unit_of_measure,
      buy_rate: String(item.buy_rate ?? ""),
      mrp: String(pd?.mrp ?? ""),
      dealer_discount_pct: String(pd?.dealer_discount_pct ?? ""),
      minimum_reorder_level: String(item.minimum_reorder_level),
    };
    return { type, form: f };
  }

  // Packaging / fallback
  const f: PackagingForm = {
    sku_code: item.sku_code, product_code: item.product_code ?? "",
    item_name: item.item_name,
    unit_of_measure: item.unit_of_measure,
    buy_rate: String(item.buy_rate ?? ""),
    minimum_reorder_level: String(item.minimum_reorder_level),
  };
  return { type: "Packaging", form: f };
}

// ── Product Profile Modal ──────────────────────────────────────────
const ProductProfileModal = ({ initial, onSave, onClose }: {
  initial?: InventoryItem | null;
  onSave: (type: ProductType, form: AnyProfileForm) => Promise<void>;
  onClose: () => void;
}) => {
  const [step, setStep] = useState<1 | 2>(initial ? 2 : 1);
  const [selectedType, setSelectedType] = useState<ProductType | null>(initial ? initial.category : null);
  const [form, setForm] = useState<AnyProfileForm>(() =>
    initial ? formFromItem(initial).form : EMPTY_RM
  );
  const [saving, setSaving] = useState(false);

  const handleTypeSelect = (t: ProductType) => {
    if (t !== selectedType) {
      setForm(getEmptyForm(t));
    }
    setSelectedType(t);
    setStep(2);
  };

  const canSave = () => {
    const f = form as any;
    return (f.sku_code?.trim() && f.item_name?.trim());
  };

  const Icon = selectedType ? CATEGORY_ICON_MAP[selectedType] : Package;
  const meta = selectedType ? ITEM_CATEGORY_META[selectedType] : null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="w-full max-w-xl relative">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/5 to-violet-500/5 blur-xl" />
        <div className="relative rounded-2xl border border-white/10 bg-card/95 backdrop-blur-xl shadow-2xl flex flex-col max-h-[90vh]">

          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/5 flex-shrink-0">
            <div className="flex items-center gap-3">
              {step === 2 && !initial && (
                <button onClick={() => setStep(1)}
                  className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all">
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              <div>
                <h3 className="font-semibold text-base">
                  {initial ? "Edit Product" : step === 1 ? "Select Product Type" : `Add ${ITEM_CATEGORY_LABELS[selectedType!]}`}
                </h3>
                {step === 2 && selectedType && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Icon className={`h-3 w-3 ${meta?.color}`} />
                    <p className="text-xs text-muted-foreground">{meta?.description}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!initial && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className={`h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold ${step >= 1 ? "bg-primary text-white" : "bg-muted/40"}`}>1</span>
                  <div className="w-5 h-px bg-border" />
                  <span className={`h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold ${step >= 2 ? "bg-primary text-white" : "bg-muted/40"}`}>2</span>
                </div>
              )}
              <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {step === 1 ? (
              <ProductTypeStep selected={selectedType} onSelect={handleTypeSelect} />
            ) : selectedType === "Raw Material" ? (
              <RawMaterialFields f={form as RawMaterialForm} setF={setForm} />
            ) : selectedType === "Chemical" ? (
              <ChemicalFields f={form as ChemicalForm} setF={setForm} />
            ) : selectedType === "Finished Good" ? (
              <FinishedGoodsFields f={form as FinishedGoodsForm} setF={setForm} />
            ) : selectedType === "Packaging" ? (
              <PackagingFields f={form as PackagingForm} setF={setForm} />
            ) : (
              <TradingGoodsFields f={form as TradingGoodsForm} setF={setForm} />
            )}
          </div>

          {/* Footer */}
          {step === 2 && (
            <div className="flex gap-2 px-6 py-4 border-t border-white/5 flex-shrink-0">
              <Btn variant="outline" onClick={onClose} className="flex-1">Cancel</Btn>
              <Btn variant="primary" disabled={saving || !canSave()} className="flex-1"
                onClick={async () => {
                  if (!selectedType) return;
                  setSaving(true);
                  await onSave(selectedType, form);
                  setSaving(false);
                }}>
                {saving
                  ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Saving…</>
                  : <><Check className="h-3.5 w-3.5" /> {initial ? "Save Changes" : "Add Product"}</>}
              </Btn>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// TAB 1 — PRODUCTS
// ══════════════════════════════════════════════════════════════════

const ProductsTab = () => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [catFilter, setCat] = useState<"all" | ProductType>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [modal, setModal] = useState<"add" | InventoryItem | null>(null);
  const { toast, show, clear } = useToast();

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setItems(await getItems()); }
    catch (err: any) { setError(err.message ?? "Failed to load products"); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => items.filter(i => {
    if (catFilter !== "all" && i.category !== catFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return i.item_name.toLowerCase().includes(s)
        || i.sku_code.toLowerCase().includes(s)
        || (i.product_code ?? "").toLowerCase().includes(s);
    }
    return true;
  }), [items, catFilter, search]);

  const handleSave = async (type: ProductType, form: AnyProfileForm) => {
    const payload = buildPayload(type, form);
    if (!payload.sku_code || !payload.item_name) { show("Product ID and name are required.", "error"); return; }
    if (modal === "add") {
      const { error } = await addItem(payload as any);
      if (error) { show(error, "error"); return; }
      show("Product added!", "success");
    } else if (modal && typeof modal === "object") {
      const { error } = await updateItem(modal.id, payload as any);
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
    i.current_stock === 0 ? "out" : i.current_stock <= i.minimum_reorder_level ? "low" : "ok";

  const lowCount = items.filter(i => i.current_stock <= i.minimum_reorder_level).length;
  const maxStock = items.length > 0 ? Math.max(...items.map(i => i.current_stock)) : 1;
  const totalValue = items.reduce((s, i) => s + i.current_stock * getInventoryItemValuationRate(i), 0);
  const totalInventoryWeight = getTotalInventoryWeight(items);


  return (
    <div className="space-y-5">
      {toast && <ToastEl msg={toast.msg} type={toast.type} onClose={clear} />}
      {modal && (
        <ProductProfileModal
          initial={modal === "add" ? null : modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-4">
        <KpiCard label="Total Products" value={items.length} icon={Package} />
        <KpiCard label="In Stock" value={items.filter(i => i.current_stock > i.minimum_reorder_level).length}
          color="text-emerald-400" icon={Check} glow="emerald" />
        <KpiCard label="Low / Out of Stock" value={lowCount}
          color={lowCount > 0 ? "text-red-400" : "text-emerald-400"} icon={AlertTriangle} glow={lowCount > 0 ? "red" : "emerald"} />
        <KpiCard label="Inventory Value" value={fmtRate(totalValue)} icon={Boxes} />
        <KpiCard
          label="Total Inventory Weight"
          value={`${totalInventoryWeight.toLocaleString("en-IN", { maximumFractionDigits: 2 })} KG`}
          icon={Layers} color="text-violet-400" glow="violet"
        />
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
          <Select value={catFilter} onValueChange={v => setCat(v as "all" | ProductType)}>
            <SelectTrigger className="h-8 text-xs bg-muted/20 border-border/60"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {ITEM_CATEGORIES.map(c => (
                <SelectItem key={c} value={c}>{ITEM_CATEGORY_LABELS[c]}</SelectItem>
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
                const st = statusOf(item);
                const isEx = expanded === item.id;
                const catMeta = ITEM_CATEGORY_META[item.category] ?? ITEM_CATEGORY_META["Packaging"];
                const CatIcon = CATEGORY_ICON_MAP[item.category] ?? Package;
                const accentColor = st === "out" ? "bg-red-500" : st === "low" ? "bg-amber-500" : "bg-emerald-500";
                const borderColor = st === "out" ? "hover:border-red-500/30" : st === "low" ? "hover:border-amber-500/30" : "hover:border-emerald-500/20";
                const stockDisplay = formatStockDisplay(item);
                const pd = item.profile_data as any;

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

                      {/* Category icon */}
                      <div className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 border ${catMeta.badge.includes("amber") ? "bg-amber-950/30 border-amber-500/20" : catMeta.badge.includes("cyan") ? "bg-cyan-950/30 border-cyan-500/20" : catMeta.badge.includes("violet") ? "bg-violet-950/30 border-violet-500/20" : catMeta.badge.includes("blue") ? "bg-blue-950/30 border-blue-500/20" : "bg-emerald-950/30 border-emerald-500/20"}`}>
                        <CatIcon className={`h-4 w-4 ${catMeta.color}`} />
                      </div>

                      <div className="flex-1 min-w-0 space-y-1.5">
                        {/* Name + code + category badge */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold truncate leading-tight">
                            {item.item_name}
                            <span className="ml-2 text-muted-foreground font-normal font-mono text-xs">
                              — {item.product_code || item.sku_code}
                            </span>
                          </p>
                          <CategoryBadge category={item.category} />
                        </div>

                        {/* Stock display — profile-aware */}
                        <p className="text-sm font-bold text-foreground">{stockDisplay}</p>

                        {/* Stock bar */}
                        <StockBar current={item.current_stock} reorder={item.minimum_reorder_level} max={maxStock} />

                        {/* Value row — unified for all types via getInventoryItemValuationRate */}
                        {(() => {
                          const vRate = getInventoryItemValuationRate(item);
                          const { isFallback } = item.category === "Finished Good"
                            ? getFinishedGoodValuationRate(item)
                            : { isFallback: false };
                          return vRate > 0 ? (
                            <p className="text-xs text-muted-foreground">
                              {item.current_stock.toLocaleString("en-IN")} {item.unit_of_measure} × {fmtRate(vRate)} = <span className="text-foreground font-medium">{fmtRate(item.current_stock * vRate)}</span>
                              {isFallback && <span className="ml-1.5 text-amber-400/70 italic">(Estimated from dealer price)</span>}
                            </p>
                          ) : null;
                        })()}

                        {/* Finished Good: MRP / dealer price preview */}
                        {item.category === "Finished Good" && pd?.mrp > 0 && (
                          <p className="text-xs text-muted-foreground">
                            MRP: <span className="text-foreground font-medium">{fmtRate(pd.mrp)}</span>
                            <span className="mx-1.5">·</span>
                            Dealer: <span className="text-violet-400 font-medium">{fmtRate(pd.net_dealer_price ?? pd.mrp)}</span>
                            {pd.dealer_discount_pct > 0 && <span className="ml-1 opacity-60">({pd.dealer_discount_pct}% off)</span>}
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

                    {/* Expanded profile-specific detail panel */}
                    {isEx && (
                      <div className="relative px-5 pb-5 border-t border-white/5 bg-gradient-to-br from-muted/10 to-transparent">
                        <div className="pt-4 space-y-3">
                          {/* Common row */}
                          <div className="grid grid-cols-4 gap-4 text-sm">
                            <div>
                              <p className="text-xs text-muted-foreground mb-0.5">SKU Code</p>
                              <p className="font-mono font-medium text-xs bg-muted/20 inline-block px-2 py-0.5 rounded">{item.sku_code}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-0.5">Profile Type</p>
                              <CategoryBadge category={item.category} />
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-0.5">Valuation Unit</p>
                              <p className="font-medium text-sm">{item.unit_of_measure}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-0.5">Reorder At</p>
                              <p className={`font-medium text-sm ${item.current_stock <= item.minimum_reorder_level ? "text-amber-400" : ""}`}>
                                {fmtQty(item.minimum_reorder_level, item.unit_of_measure)}
                              </p>
                            </div>
                          </div>

                          {/* Raw Material specific */}
                          {item.category === "Raw Material" && item.purchase_unit && (
                            <div className="grid grid-cols-4 gap-4 text-sm pt-2 border-t border-white/5">
                              <div>
                                <p className="text-xs text-muted-foreground mb-0.5">Purchase Unit</p>
                                <p className="font-medium">{item.purchase_unit}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-0.5">Conversion</p>
                                <p className="font-medium">1 {item.purchase_unit} = {getConversionFactor(item)} KG</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-0.5">Stock in Bags</p>
                                <p className="font-medium text-amber-400">{valuationToPurchase(item.current_stock, item).toLocaleString("en-IN", { maximumFractionDigits: 1 })} {item.purchase_unit}s</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-0.5">Rate / KG</p>
                                <p className="font-medium">{fmtRate(item.buy_rate ?? 0)}</p>
                              </div>
                            </div>
                          )}

                          {/* Chemical specific */}
                          {item.category === "Chemical" && item.purchase_unit && (
                            <div className="grid grid-cols-4 gap-4 text-sm pt-2 border-t border-white/5">
                              <div>
                                <p className="text-xs text-muted-foreground mb-0.5">Purchase Unit</p>
                                <p className="font-medium">{item.purchase_unit}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-0.5">Conversion</p>
                                <p className="font-medium">1 {item.purchase_unit} = {getConversionFactor(item)} L</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-0.5">Stock in Drums</p>
                                <p className="font-medium text-cyan-400">{valuationToPurchase(item.current_stock, item).toLocaleString("en-IN", { maximumFractionDigits: 1 })} {item.purchase_unit}s</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-0.5">Rate / Litre</p>
                                <p className="font-medium">{fmtRate(item.buy_rate ?? 0)}</p>
                              </div>
                            </div>
                          )}

                          {/* Finished Good specific */}
                          {item.category === "Finished Good" && pd && (
                            <>
                              {/* Row 1: Pricing */}
                              <div className="grid grid-cols-4 gap-4 text-sm pt-2 border-t border-white/5">
                                <div>
                                  <p className="text-xs text-muted-foreground mb-0.5">MRP</p>
                                  <p className="font-medium">{pd.mrp ? fmtRate(pd.mrp) : "—"}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground mb-0.5">Dealer Discount</p>
                                  <p className="font-medium">{pd.dealer_discount_pct ? `${pd.dealer_discount_pct}%` : "—"}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground mb-0.5">Net Dealer Price</p>
                                  <p className="font-medium text-violet-400">{pd.net_dealer_price ? fmtRate(pd.net_dealer_price) : "—"}</p>
                                </div>
                                {/* Production Cost / Valuation Rate */}
                                {(() => {
                                  const { rate: vRate, isFallback } = getFinishedGoodValuationRate(item);
                                  return (
                                    <div>
                                      <p className="text-xs text-muted-foreground mb-0.5">Production Cost / BDL</p>
                                      <p className="font-medium text-amber-400">{vRate > 0 ? fmtRate(vRate) : "—"}</p>
                                      {isFallback && <p className="text-xs text-amber-400/50 mt-0.5 italic">est. from dealer price</p>}
                                    </div>
                                  );
                                })()}
                              </div>

                              {/* Row 2: Stock, Weight & Inventory Value */}
                              <div className="grid grid-cols-4 gap-4 text-sm pt-2 border-t border-white/5">
                                <div>
                                  <p className="text-xs text-muted-foreground mb-0.5">Current Stock</p>
                                  <p className="font-bold text-foreground">{item.current_stock.toLocaleString("en-IN", { maximumFractionDigits: 2 })} BDL</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground mb-0.5">Bundle Weight</p>
                                  <p className="font-medium">{pd.bundle_weight ? `${pd.bundle_weight} KG` : "—"}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground mb-0.5">Total Weight in Stock</p>
                                  {(() => {
                                    const tw = getTotalWeightInStock(item);
                                    return tw !== null ? (
                                      <>
                                        <p className="font-bold text-violet-400">{tw.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KG</p>
                                        <p className="text-xs text-muted-foreground/60 mt-0.5">{item.current_stock.toLocaleString("en-IN", { maximumFractionDigits: 2 })} × {pd.bundle_weight} KG</p>
                                      </>
                                    ) : <p className="font-medium text-muted-foreground">—</p>;
                                  })()}
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground mb-0.5">Inventory Value</p>
                                  {(() => {
                                    const { rate: vRate, isFallback } = getFinishedGoodValuationRate(item);
                                    const invValue = item.current_stock * vRate;
                                    return vRate > 0 ? (
                                      <>
                                        <p className="font-bold text-emerald-400">{fmtRate(invValue)}</p>
                                        <p className="text-xs text-muted-foreground/60 mt-0.5">
                                          {item.current_stock.toLocaleString("en-IN", { maximumFractionDigits: 2 })} × {fmtRate(vRate)}
                                          {isFallback && <span className="text-amber-400/60 ml-1 italic">(est.)</span>}
                                        </p>
                                      </>
                                    ) : <p className="font-medium text-muted-foreground">—</p>;
                                  })()}
                                </div>
                              </div>

                              {/* Row 3: Pipe specs */}
                              <div className="grid grid-cols-4 gap-4 text-sm pt-2 border-t border-white/5">
                                <div>
                                  <p className="text-xs text-muted-foreground mb-0.5">Pieces/Bundle</p>
                                  <p className="font-medium">{pd.pieces_per_bundle || "—"}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground mb-0.5">Diameter</p>
                                  <p className="font-medium">{pd.diameter || "—"}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground mb-0.5">Pressure Grade</p>
                                  <p className="font-medium">{pd.pressure_grade || "—"}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground mb-0.5">Length · Color</p>
                                  <p className="font-medium">{[pd.length, pd.color].filter(Boolean).join(" · ") || "—"}</p>
                                </div>
                              </div>
                            </>
                          )}

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

// ══════════════════════════════════════════════════════════════════
// TAB 2 — STOCK MOVEMENT (UOM-aware)
// ══════════════════════════════════════════════════════════════════
const MovementTab = () => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loadingItems, setLI] = useState(true);
  const [txType, setTxType] = useState<TransactionType>("Purchase/In");
  const [selectedId, setSelId] = useState("");
  const [qty, setQty] = useState("");
  const [date, setDate] = useState(todayStr());
  const [reference, setRef] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSub] = useState(false);
  const [recentTxns, setRec] = useState<InventoryTransaction[]>([]);
  const [loadingRec, setLR] = useState(true);
  const [usesPurchaseUnit, setUsesPurchaseUnit] = useState(false);
  const { toast, show, clear } = useToast();

  const loadItems = useCallback(async () => {
    setLI(true);
    try { setItems((await getItems()).sort((a, b) => a.item_name.localeCompare(b.item_name))); }
    catch { setItems([]); }
    setLI(false);
  }, []);

  const loadRecent = useCallback(async () => {
    setLR(true);
    try { setRec(await getTransactions(15)); }
    catch { setRec([]); }
    setLR(false);
  }, []);

  useEffect(() => { loadItems(); loadRecent(); }, [loadItems, loadRecent]);

  const selectedItem = items.find(i => i.id === selectedId);
  const hasDualUnit = !!(selectedItem?.purchase_unit && getConversionFactor(selectedItem) > 1);
  const qtyNum = parseFloat(qty) || 0;
  const isIn = txDir(txType) === "in";

  // How many valuation units will actually be posted?
  const valuationQty = hasDualUnit && usesPurchaseUnit
    ? entryToValuationQty(qtyNum, selectedItem!, true)
    : qtyNum;

  const currentStock = selectedItem?.current_stock ?? 0;
  const previewStock = selectedItem && qtyNum > 0
    ? isIn ? currentStock + valuationQty
      : Math.max(0, currentStock - valuationQty)
    : null;

  // When a new item is selected, default to purchase unit if available
  useEffect(() => {
    if (selectedItem && hasDualUnit) {
      setUsesPurchaseUnit(true);
    } else {
      setUsesPurchaseUnit(false);
    }
    setQty("");
  }, [selectedId]);

  const handleSubmit = async () => {
    if (!selectedId || !qtyNum) { show("Select a product and enter quantity.", "error"); return; }
    if (!selectedItem) return;

    setSub(true);

    const result = await postTransaction({
      item_id: selectedId,
      transaction_type: txType,
      quantity_changed: valuationQty,
      transaction_date: date,
      reference_number: reference || undefined,
      notes: notes || undefined,
      currentStock: selectedItem.current_stock,
    });

    if (!result.success) { show(`Error: ${result.error}`, "error"); setSub(false); return; }

    const newStockDisplay = formatStockDisplay({ ...selectedItem, current_stock: result.newStock });
    show(`Recorded! New stock: ${newStockDisplay}`, "success");
    setSelId(""); setQty(""); setRef(""); setDate(todayStr()); setNotes(""); setUsesPurchaseUnit(false);
    loadItems(); loadRecent();
    setSub(false);
  };

  const inTypes = TX_TYPES.filter(t => t.dir === "in");
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
                    <span className="ml-1.5 text-muted-foreground font-mono text-xs">({formatStockDisplay(i)})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedItem && (
              <div className="mt-2.5 px-4 py-3 rounded-xl bg-gradient-to-br from-muted/30 to-muted/10 border border-white/5 space-y-1">
                <div className="flex items-center gap-2">
                  {(() => { const I = CATEGORY_ICON_MAP[selectedItem.category]; return <I className={`h-3.5 w-3.5 ${ITEM_CATEGORY_META[selectedItem.category]?.color}`} />; })()}
                  <p className="text-sm font-semibold">{selectedItem.item_name}
                    <span className="ml-2 font-mono text-xs text-muted-foreground">— {selectedItem.product_code || selectedItem.sku_code}</span>
                  </p>
                </div>
                <p className="text-sm font-bold">{formatStockDisplay(selectedItem)}</p>
                {(selectedItem.buy_rate ?? 0) > 0 || selectedItem.category === "Finished Good" ? (
                  (() => {
                    const vRate = getInventoryItemValuationRate(selectedItem);
                    const { isFallback } = selectedItem.category === "Finished Good"
                      ? getFinishedGoodValuationRate(selectedItem)
                      : { isFallback: false };
                    return vRate > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {selectedItem.current_stock.toLocaleString("en-IN")} {selectedItem.unit_of_measure} × {fmtRate(vRate)} = {fmtRate(selectedItem.current_stock * vRate)}
                        {isFallback && <span className="ml-1.5 text-amber-400/70 italic">(Estimated from dealer price)</span>}
                      </p>
                    ) : null;
                  })()
                ) : null}

              </div>
            )}
          </div>

          {/* Quantity with UOM toggle */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-muted-foreground font-medium">Quantity *</label>
              {hasDualUnit && (
                <div className="flex items-center gap-1 text-xs">
                  <button
                    onClick={() => setUsesPurchaseUnit(false)}
                    className={`px-2 py-0.5 rounded-md transition-all ${!usesPurchaseUnit ? "bg-primary/20 text-primary font-semibold" : "text-muted-foreground hover:text-foreground"}`}>
                    {selectedItem!.unit_of_measure}
                  </button>
                  <span className="text-muted-foreground/40">|</span>
                  <button
                    onClick={() => setUsesPurchaseUnit(true)}
                    className={`px-2 py-0.5 rounded-md transition-all ${usesPurchaseUnit ? "bg-primary/20 text-primary font-semibold" : "text-muted-foreground hover:text-foreground"}`}>
                    {selectedItem!.purchase_unit}s
                  </button>
                </div>
              )}
            </div>
            <Input type="number" min="0.01" step="0.01"
              className="h-9 text-sm bg-muted/20 border-border/60 focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all"
              placeholder={`Enter quantity in ${hasDualUnit && usesPurchaseUnit ? selectedItem?.purchase_unit + "s" : selectedItem?.unit_of_measure || "units"}`}
              value={qty} onChange={e => setQty(e.target.value)} />

            {hasDualUnit && usesPurchaseUnit && qtyNum > 0 && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                = <span className="font-bold text-amber-400">{valuationQty.toLocaleString("en-IN")} {selectedItem?.unit_of_measure}</span>
                <span className="ml-1 opacity-60">(1 {selectedItem?.purchase_unit} × {getConversionFactor(selectedItem!)} {selectedItem?.unit_of_measure})</span>
              </p>
            )}

            {previewStock !== null && (
              <div className="mt-2 px-3 py-2 rounded-lg bg-muted/20 border border-white/5">
                <p className="text-xs text-muted-foreground">
                  New stock after:{" "}
                  <span className={`font-bold ${previewStock <= 0 ? "text-red-400" : previewStock <= (selectedItem?.minimum_reorder_level ?? 0) ? "text-amber-400" : "text-emerald-400"}`}>
                    {formatStockDisplay({ ...selectedItem!, current_stock: Math.max(0, previewStock) })}
                  </span>
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
            const dir = txDir(t.transaction_type);
            const isIn = dir === "in";
            const unit = t.inventory_items?.unit_of_measure ?? "";
            const rate = t.inventory_items?.buy_rate ?? 0;
            const purchUnit = t.inventory_items?.purchase_unit;
            const cf = t.inventory_items?.conversion_factor;
            const purchQtyDisplay = purchUnit && cf && cf > 1
              ? ` (${(t.quantity_changed / cf).toLocaleString("en-IN", { maximumFractionDigits: 1 })} ${purchUnit}s)` : "";
            return (
              <div key={t.id}
                className="group relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-card to-card/60 px-4 py-3.5
                  hover:-translate-y-px hover:shadow-md hover:shadow-black/20 hover:border-white/10 transition-all duration-200">
                <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${isIn ? "bg-emerald-500" : "bg-red-500"} opacity-60`} />
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.01] to-transparent pointer-events-none" />
                <div className="relative flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 border
                      ${isIn ? "bg-emerald-950/60 border-emerald-500/20" : "bg-red-950/60 border-red-500/20"}`}>
                      {isIn ? <ArrowDownToLine className="h-3.5 w-3.5 text-emerald-400" /> : <ArrowUpFromLine className="h-3.5 w-3.5 text-red-400" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium leading-tight">{t.inventory_items?.item_name ?? `Item #${t.item_id}`}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <span className={`font-medium ${isIn ? "text-emerald-400/70" : "text-red-400/70"}`}>{getTransactionLabel(t.transaction_type)}</span>
                        <span className="mx-1.5">·</span>
                        {new Date(t.transaction_date ?? t.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        {t.reference_number && <span className="ml-1.5 font-mono text-muted-foreground/60">· {t.reference_number}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-bold tabular-nums ${isIn ? "text-emerald-400" : "text-red-400"}`}>
                      {isIn ? "+" : "−"}{fmtQty(t.quantity_changed, unit)}{purchQtyDisplay}
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

// ══════════════════════════════════════════════════════════════════
// TAB 3 — TRANSACTION LOG
// ══════════════════════════════════════════════════════════════════
const TransactionLogTab = () => {
  const [rows, setRows] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setType] = useState("all");
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const { toast, show, clear } = useToast();

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await getTransactions()); }
    catch (err: any) { setError(err.message ?? "Failed to load transactions"); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (t: InventoryTransaction) => {
    if (!confirm(`Delete this transaction?\n\n${getTransactionLabel(t.transaction_type)} · ${t.quantity_changed} ${t.inventory_items?.unit_of_measure ?? ""} · ${t.inventory_items?.item_name}\n\nThis will reverse the stock change.`)) return;
    setDeleting(t.id);
    const currentStock = (t.inventory_items as any)?.current_stock ?? 0;
    const result = await reverseTransaction({
      transactionId: t.id, item_id: t.item_id,
      transaction_type: t.transaction_type,
      quantity_changed: t.quantity_changed,
      currentStock,
    });
    if (!result.success) show(result.error ?? "Failed to delete", "error");
    else { show(`Transaction deleted · Stock updated to ${fmtQty(result.newStock, t.inventory_items?.unit_of_measure)}`, "success"); load(); }
    setDeleting(null);
  };

  const filtered = useMemo(() => rows.filter(t => {
    if (typeFilter !== "all" && t.transaction_type !== typeFilter) return false;
    const name = t.inventory_items?.item_name ?? "";
    if (search && !name.toLowerCase().includes(search.toLowerCase())
      && !(t.reference_number ?? "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [rows, typeFilter, search]);

  const totalIn  = filtered.filter(t => txDir(t.transaction_type) === "in").reduce((s, t) => s + t.quantity_changed, 0);
  const totalOut = filtered.filter(t => txDir(t.transaction_type) === "out").reduce((s, t) => s + t.quantity_changed, 0);

  return (
    <div className="space-y-5">
      {toast && <ToastEl msg={toast.msg} type={toast.type} onClose={clear} />}

      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="Total Records" value={filtered.length} icon={ClipboardList} />
        <KpiCard label="Total IN (valuation units)" value={totalIn.toLocaleString("en-IN")} color="text-emerald-400" icon={ArrowDownToLine} glow="emerald" />
        <KpiCard label="Total OUT (valuation units)" value={totalOut.toLocaleString("en-IN")} color="text-red-400" icon={ArrowUpFromLine} glow="red" />
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
                  <th className="px-5 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Qty (Valuation Unit)</th>
                  <th className="px-5 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Value</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reference</th>
                  <th className="px-3 py-3.5 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0
                  ? <tr><td colSpan={7} className="py-12 text-center text-muted-foreground text-sm">No transactions found</td></tr>
                  : filtered.map((t, idx) => {
                    const dir = txDir(t.transaction_type);
                    const isIn = dir === "in";
                    const unit = t.inventory_items?.unit_of_measure ?? "";
                    const rate = t.inventory_items?.buy_rate ?? 0;
                    const isDeleting = deleting === t.id;
                    const purchUnit = t.inventory_items?.purchase_unit;
                    const cf = t.inventory_items?.conversion_factor;
                    const purchDisplay = purchUnit && cf && cf > 1
                      ? ` (${(t.quantity_changed / cf).toLocaleString("en-IN", { maximumFractionDigits: 1 })} ${purchUnit}s)` : "";
                    return (
                      <tr key={t.id}
                        className={`border-t border-white/5 transition-all duration-150
                          ${isDeleting ? "opacity-40" : "hover:bg-gradient-to-r hover:from-white/[0.02] hover:to-transparent"}
                          ${idx % 2 === 0 ? "" : "bg-white/[0.008]"}`}>
                        <td className="px-5 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(t.transaction_date ?? t.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-sm">{t.inventory_items?.item_name ?? `#${t.item_id}`}</p>
                          <p className="text-xs text-muted-foreground font-mono">{t.inventory_items?.sku_code}</p>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border shadow-sm
                            ${isIn
                              ? "bg-emerald-950/60 text-emerald-400 border-emerald-500/20"
                              : "bg-red-950/60 text-red-400 border-red-500/20"}`}>
                            {isIn ? <ArrowDownToLine className="h-3 w-3" /> : <ArrowUpFromLine className="h-3 w-3" />}
                            {getTransactionLabel(t.transaction_type)}
                          </span>
                        </td>
                        <td className={`px-5 py-3.5 text-right tabular-nums font-bold text-sm ${isIn ? "text-emerald-400" : "text-red-400"}`}>
                          {isIn ? "+" : "−"}{fmtQty(t.quantity_changed, unit)}{purchDisplay}
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
                          <button onClick={() => handleDelete(t)} disabled={isDeleting}
                            className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-950/30 transition-all disabled:cursor-not-allowed">
                            {isDeleting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
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

// ══════════════════════════════════════════════════════════════════
// TAB 4 — LOW STOCK ALERTS
// ══════════════════════════════════════════════════════════════════
const AlertsTab = () => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setItems((await getItems()).sort((a, b) => a.current_stock - b.current_stock)); }
    catch (err: any) { setError(err.message ?? "Failed to load stock data"); }
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
                  {out.map(item => {
                    const CatIcon = CATEGORY_ICON_MAP[item.category] ?? Package;
                    return (
                      <div key={item.id}
                        className="relative overflow-hidden flex items-center justify-between p-4 rounded-xl border border-red-500/30 bg-gradient-to-br from-red-950/20 to-red-950/5
                          hover:-translate-y-px hover:shadow-lg hover:shadow-red-900/20 transition-all duration-200">
                        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-red-500 shadow-lg shadow-red-500/50" />
                        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.01] to-transparent pointer-events-none" />
                        <div className="relative flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-red-950/60 border border-red-500/20 flex-shrink-0">
                            <CatIcon className="h-4 w-4 text-red-400" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{item.item_name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <p className="text-xs text-muted-foreground font-mono">{item.sku_code}</p>
                              <CategoryBadge category={item.category} />
                            </div>
                          </div>
                        </div>
                        <div className="relative text-right">
                          <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-red-950/80 border border-red-500/30 text-red-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                            OUT OF STOCK
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {low.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    <p className="text-xs font-bold text-amber-500 uppercase tracking-wider">Low Stock ({low.length})</p>
                  </div>
                  {low.map(item => {
                    const CatIcon = CATEGORY_ICON_MAP[item.category] ?? Package;
                    return (
                      <div key={item.id}
                        className="relative overflow-hidden flex items-center justify-between p-4 rounded-xl border border-amber-500/25 bg-gradient-to-br from-amber-950/15 to-amber-950/5
                          hover:-translate-y-px hover:shadow-lg hover:shadow-amber-900/15 transition-all duration-200">
                        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-amber-500/70" />
                        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.01] to-transparent pointer-events-none" />
                        <div className="relative flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-amber-950/60 border border-amber-500/20 flex-shrink-0">
                            <CatIcon className="h-4 w-4 text-amber-400" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{item.item_name}</p>
                            <p className="text-xs text-muted-foreground">
                              <CategoryBadge category={item.category} />
                              <span className="ml-1.5">Reorder at {fmtQty(item.minimum_reorder_level, item.unit_of_measure)}</span>
                            </p>
                          </div>
                        </div>
                        <div className="relative text-right">
                          <p className="text-sm font-bold text-amber-400">{formatStockDisplay(item)}</p>
                          <p className="text-xs text-muted-foreground">{fmtQty(item.minimum_reorder_level - item.current_stock, item.unit_of_measure)} below reorder</p>
                        </div>
                      </div>
                    );
                  })}
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
                {healthy.map(item => {
                  const CatIcon = CATEGORY_ICON_MAP[item.category] ?? Package;
                  return (
                    <div key={item.id}
                      className="relative flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.02] transition-colors group">
                      <div className="flex items-center gap-3">
                        <CatIcon className={`h-3.5 w-3.5 ${ITEM_CATEGORY_META[item.category]?.color ?? "text-muted-foreground"}`} />
                        <div>
                          <p className="text-sm font-medium">{item.item_name}</p>
                          <CategoryBadge category={item.category} />
                        </div>
                      </div>
                      <p className="text-sm font-bold text-emerald-400">{formatStockDisplay(item)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════════════════
type Section = "products" | "movement" | "transactions" | "alerts";

const TABS: { section: Section; label: string; icon: React.ElementType }[] = [
  { section: "products",     label: "Products",         icon: Package },
  { section: "movement",     label: "Stock Movement",   icon: PlusCircle },
  { section: "transactions", label: "Transaction Log",  icon: ClipboardList },
  { section: "alerts",       label: "Low Stock Alerts", icon: Bell },
];

const sectionFromPathname = (pathname: string): Section => {
  if (pathname.includes("movement"))     return "movement";
  if (pathname.includes("transactions")) return "transactions";
  if (pathname.includes("alerts"))       return "alerts";
  return "products";
};

const Inventory = () => {
  const { pathname } = useLocation();
  const [section, setSection] = useState<Section>(() => sectionFromPathname(pathname));

  useEffect(() => { setSection(sectionFromPathname(pathname)); }, [pathname]);

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
          <p className="text-xs text-muted-foreground">Multi-Profile Inventory · Enterprise Grade</p>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full border border-emerald-500/30 text-emerald-400 bg-emerald-950/30 font-medium flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Live · Supabase
        </span>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted/20 border border-border/40 w-fit">
        {TABS.map(tab => {
          const TabIcon = tab.icon;
          return (
            <button key={tab.section} onClick={() => setSection(tab.section)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200
                ${section === tab.section
                  ? "bg-card border border-border/60 text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"}`}>
              <TabIcon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content — all stay mounted for instant switching */}
      <div className={section === "products"     ? "" : "hidden"}><ProductsTab /></div>
      <div className={section === "movement"     ? "" : "hidden"}><MovementTab /></div>
      <div className={section === "transactions" ? "" : "hidden"}><TransactionLogTab /></div>
      <div className={section === "alerts"       ? "" : "hidden"}><AlertsTab /></div>
    </div>
  );
};

export default Inventory;
