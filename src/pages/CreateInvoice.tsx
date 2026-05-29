import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getAllInvoices, saveInvoice, getNextInvoiceNo } from "@/data/invoiceStore";
import { Invoice } from "@/data/invoiceStore";
import { getCustomers, upsertCustomer, CustomerRecord } from "@/data/customerStore";
import { getProducts, ProductRecord } from "@/data/productStore";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Plus, Trash2, Check, RefreshCw,
  AlertCircle, Download, Printer, ChevronDown, ChevronRight, X, Eye,
  FileText, Truck, User, Receipt, StickyNote, Clock, Shield,
  CreditCard, Hash, Calendar, Building2, MapPin, Tag,
} from "lucide-react";
import {
  COMPANY, GST_RATE, r2, fmtNum, PRINT_STYLES,
  InvoicePrintView, PrintInvoice,
} from "@/lib/invoiceConstants";

// ── Product catalog ────────────────────────────────────────────
// Products are now loaded from Supabase via productStore.
// The LEGACY_PRODUCTS fallback is used ONLY if Supabase returns zero
// rows (e.g. migration not yet run). Remove after verifying migration.
const LEGACY_PRODUCTS = [
  { name: '1/2" (13mm) Garden Pipe',          rate: 1125.00 },
  { name: '1/2" GARDEN PIPE',                 rate: 1125.00 },
  { name: '1/2" ECO + GARDEN PIPE',           rate: 1125.00 },
  { name: '1/2" Foam Garden Pipe',            rate: 1125.00 },
  { name: '3/4" (19mm) Garden Pipe 1x8',     rate: 1600.00 },
  { name: '3/4" GARDEN PIPE',                rate: 1600.00 },
  { name: '3/4" ECO + Garden Pipe (15 Mtr)', rate: 1600.00 },
  { name: '3/4" ECO+ GARDEN PIPE( 20mtr)',   rate: 1600.00 },
  { name: '3/4" Flexible Foam Pipe',         rate: 1600.00 },
  { name: '3/4(19mm) ECO+ GARDEN PIPE',      rate: 1600.00 },
  { name: '1"(25MM) GARDEN PIPE',            rate: 2423.00 },
  { name: '1" GARDEN PIPE',                  rate: 2423.00 },
  { name: '1" Eco + Garden Pipe',            rate: 2423.00 },
  { name: '1" Foam Flexible Garden Pipe',    rate: 2423.00 },
  { name: 'ECO + GARDEN PIPE 1"',            rate: 2423.00 },
  { name: '1 1/4" (32mm) Garden Pipe',       rate: 3514.00 },
  { name: '1 1/4" GARDEN PIPE',              rate: 3514.00 },
  { name: '1 1/4" (32mm) Eco + Garden Pipe', rate: 3514.00 },
  { name: '1/4" GARDEN PIPE',                rate:  800.00 },
];

// ── Helpers ────────────────────────────────────────────────────
function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

function calcLine(rateInclTax: number, qty: number, disc: number) {
  const rateExclTax = r2(rateInclTax / (1 + GST_RATE / 100));
  const lineAmount  = r2(qty * rateExclTax * (1 - disc / 100));
  return { rateExclTax, lineAmount };
}

// ── Types ──────────────────────────────────────────────────────
interface LineItem {
  id:                 string;
  productDescription: string;
  customDesc:         string;
  quantity:           number | "";
  uom:                string;
  rateInclTax:        number | "";
  discountPct:        number | "";
  rateExclTax:        number;
  lineAmount:         number;
}

const blankLine = (): LineItem => ({
  id: generateId(),
  productDescription: "", customDesc: "",
  quantity: "", uom: "BDL",
  rateInclTax: "", discountPct: 63,
  rateExclTax: 0, lineAmount: 0,
});

// ── Label ──────────────────────────────────────────────────────
const L = ({ children, req }: { children: React.ReactNode; req?: boolean }) => (
  <label className="block text-[11px] text-muted-foreground mb-0.5 uppercase tracking-wider font-medium">
    {children}{req && <span className="text-red-400 ml-0.5">*</span>}
  </label>
);

// ── Collapsible Section ────────────────────────────────────────
const Section = ({
  title, icon: Icon, children, defaultOpen = false, badge, noPad,
}: {
  title: string;
  icon?: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  noPad?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-muted/40 transition-colors"
      >
        {open
          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />}
        {Icon && <Icon className="h-3.5 w-3.5 text-primary/80 shrink-0" />}
        <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">{title}</span>
        {badge}
      </button>
      {open && (
        <div className={`border-t border-border/60 ${noPad ? "" : "px-4 py-4"}`}>
          {children}
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
const CreateInvoice = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [customerMaster, setCustomerMaster] = useState<CustomerRecord[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);

  // ── Product master from Supabase ──────────────────────────────
  const [productMaster, setProductMaster] = useState<ProductRecord[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);

  useEffect(() => {
    getCustomers()
      .then(setCustomerMaster)
      .catch(err => console.error("[CreateInvoice] getCustomers failed:", err))
      .finally(() => setCustomersLoading(false));
  }, []);

  // Load products from Supabase; fall back to legacy list if migration not yet run
  useEffect(() => {
    getProducts()
      .then(rows => {
        if (rows.length > 0) {
          setProductMaster(rows);
        } else {
          // Safety fallback — remove after verifying migration
          console.warn("[CreateInvoice] No products in Supabase — using LEGACY_PRODUCTS fallback");
          setProductMaster(
            LEGACY_PRODUCTS.map((p, i) => ({
              id:           `legacy-${i}`,
              user_id:      "",
              product_code: `LEGACY-${String(i + 1).padStart(4, "0")}`,
              product_name: p.name,
              rate:         p.rate,
              uom:          "BDL",
              status:       "active" as const,
              created_at:   "",
            }))
          );
        }
      })
      .catch(err => {
        console.error("[CreateInvoice] getProducts failed — using LEGACY_PRODUCTS fallback:", err);
        setProductMaster(
          LEGACY_PRODUCTS.map((p, i) => ({
            id:           `legacy-${i}`,
            user_id:      "",
            product_code: `LEGACY-${String(i + 1).padStart(4, "0")}`,
            product_name: p.name,
            rate:         p.rate,
            uom:          "BDL",
            status:       "Active" as const,
            created_at:   "",
          }))
        );
      })
      .finally(() => setProductsLoading(false));
  }, []);

  const urlCustomerName = decodeURIComponent(params.get("customer") ?? "");
  const today = new Date().toISOString().split("T")[0];

  const [invoiceDate, setInvoiceDate] = useState(today);
  const [invoiceNo,   setInvoiceNo]   = useState("");
  const fetchNextNo = useCallback(async (baseDate: string) => {
    try {
      const next = await getNextInvoiceNo(new Date(baseDate));
      setInvoiceNo(next);
    } catch (err) {
      console.error("[CreateInvoice] getNextInvoiceNo failed:", err);
    }
  }, []);
  useEffect(() => { fetchNextNo(invoiceDate); }, [fetchNextNo, invoiceDate]);

  const [bookedBy,    setBookedBy]    = useState("MO");
  const [customerName, setCustName]   = useState("");
  const [gstin,        setGstin]      = useState("");
  const [placeOfSupply,setPos]        = useState("");
  const [isCustomCust, setCustomCust] = useState(false);

  // Inter-state detection: GSTIN starts with state code.
  // Bihar = "10". Any other prefix means inter-state → IGST applies.
  // Falls back to false (intra-state) when gstin is empty/short.
  const isInterState = gstin.length >= 2 && !gstin.startsWith("10");

  useEffect(() => {
    if (!urlCustomerName || customersLoading) return;
    const match = customerMaster.find(c => c.customer_name === urlCustomerName);
    if (match) {
      setCustName(match.customer_name);
      setGstin(match.gstin);
      setPos(match.location ?? "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customersLoading]);

  const [eWayBillNo,   setEWay]       = useState("");
  const [dispatched,   setDisp]       = useState("");
  const [destination,  setDest]       = useState("");
  const [weightKg,     setWeight]     = useState<number | "">("");
  const [freight,      setFreight]    = useState<number | "">(0);
  const [lines,        setLines]      = useState<LineItem[]>([blankLine()]);
  const [errors,       setErrors]     = useState<Record<string, string>>({});
  const [saving,       setSaving]     = useState(false);
  const [saved,        setSaved]      = useState(false);
  const [showPreview,  setShowPreview] = useState(false);
  const [notes,        setNotes]       = useState("");
  const [terms,        setTerms]       = useState("");
  const [internalRemark, setRemark]    = useState("");

  const pickCustomer = (name: string) => {
    if (name === "__new__") { setCustomCust(true); setCustName(""); setGstin(""); setPos(""); return; }
    setCustomCust(false);
    const c = customerMaster.find(c => c.customer_name === name);
    if (c) {
      setCustName(c.customer_name);
      setGstin(c.gstin);
      setPos(c.location ?? "");
    }
  };

  const updateLine = (id: string, key: keyof LineItem, val: string | number) => {
    setLines(prev => prev.map(li => {
      if (li.id !== id) return li;
      const u: LineItem = { ...li, [key]: val };
      if (key === "productDescription" && val !== "__custom__") {
        const p = productMaster.find(p => p.product_name === val);
        if (p) { u.rateInclTax = p.rate; }
      }
      const qty  = Number(u.quantity)    || 0;
      const rate = Number(u.rateInclTax) || 0;
      const disc = Number(u.discountPct) || 0;
      const { rateExclTax, lineAmount } = calcLine(rate, qty, disc);
      return { ...u, rateExclTax, lineAmount };
    }));
  };

  const calcs = useMemo(() => {
    const taxableAmount = r2(lines.reduce((s, l) => s + l.lineAmount, 0));
    // Inter-state: full GST as IGST. Intra-state: split equally into CGST + SGST.
    const totalGst      = r2(taxableAmount * GST_RATE / 100);
    const igst          = isInterState ? totalGst : 0;
    const cgst          = isInterState ? 0 : r2(totalGst / 2);
    const sgst          = isInterState ? 0 : r2(totalGst / 2);
    const freightVal    = Number(freight) || 0;
    const raw           = taxableAmount + totalGst + freightVal;
    const roundOff      = r2(Math.round(raw) - raw);
    const totalAmount   = r2(raw + roundOff);
    return { taxableAmount, igst, cgst, sgst, roundOff, totalAmount };
  }, [lines, freight, isInterState]);

  const previewInvoice: PrintInvoice = {
    invoiceNo,
    invoiceDate,
    bookedBy,
    customerName,
    gstin,
    placeOfSupply,
    eWayBillNo:        eWayBillNo  || null,
    dispatchedThrough: dispatched  || null,
    destination:       destination || null,
    taxableAmount:     calcs.taxableAmount,
    cgst:              calcs.cgst,
    sgst:              calcs.sgst,
    igst:              calcs.igst,
    freight:           Number(freight) || 0,
    roundOff:          calcs.roundOff,
    totalAmount:       calcs.totalAmount,
    weightKg:          Number(weightKg) || 0,
    gstRate:           GST_RATE,
    lineItems: lines.map(li => ({
      productDescription: li.productDescription === "__custom__" ? li.customDesc : li.productDescription,
      quantity:           Number(li.quantity)    || 0,
      uom:                li.uom,
      rateInclTax:        Number(li.rateInclTax) || 0,
      rateExclTax:        li.rateExclTax,
      discountPct:        Number(li.discountPct) || 0,
      lineAmount:         li.lineAmount,
    })),
  };

  const validate = async () => {
    const e: Record<string, string> = {};
    if (!invoiceNo.trim())    e.invoiceNo = "Required";
    if (!invoiceDate)         e.date      = "Required";
    if (!customerName.trim()) e.customer  = "Required";
    if (!gstin.trim() || gstin.length !== 15) e.gstin = "15-char GSTIN required";
    if (lines.length === 0)   e.lines     = "Add at least one item";
    try {
      const existing = await getAllInvoices();
      const dup = existing.find(i => i.invoiceNo === invoiceNo.trim());
      if (dup) e.invoiceNo = `${invoiceNo} already exists`;
    } catch {
      // proceed
    }
    lines.forEach((li, i) => {
      const desc = li.productDescription === "__custom__" ? li.customDesc : li.productDescription;
      if (!desc)                                    e[`d${i}`] = "Required";
      if (!li.quantity || Number(li.quantity) <= 0) e[`q${i}`] = "Required";
      if (!li.rateInclTax)                          e[`r${i}`] = "Required";
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!(await validate())) return;
    setSaving(true);
    try {
      const newInvoice: Omit<Invoice, "id"> = {
        invoiceNo:         invoiceNo.trim(),
        invoiceDate,
        bookedBy:          bookedBy || "",
        customerName:      customerName.trim(),
        gstin:             gstin.trim().toUpperCase(),
        placeOfSupply:     placeOfSupply.trim(),
        eWayBillNo:        eWayBillNo  || null,
        dispatchedThrough: dispatched  || null,
        destination:       destination || null,
        taxableAmount:     calcs.taxableAmount,
        cgst:              calcs.cgst,
        sgst:              calcs.sgst,
        igst:              calcs.igst,
        freight:           Number(freight) || 0,
        roundOff:          calcs.roundOff,
        totalAmount:       calcs.totalAmount,
        weightKg:          Number(weightKg) || 0,
        gstRate:           GST_RATE,
        lineItems:         lines.map(li => ({
          productDescription: li.productDescription === "__custom__" ? li.customDesc : li.productDescription,
          quantity:           Number(li.quantity)    || 0,
          uom:                li.uom,
          rateInclTax:        Number(li.rateInclTax) || 0,
          rateExclTax:        li.rateExclTax,
          discountPct:        Number(li.discountPct) || 0,
          lineAmount:         li.lineAmount,
        })),
      };

      if (isCustomCust && customerName.trim() && gstin.trim().length === 15) {
        try {
          await upsertCustomer({
            user_id:       "",
            customer_name: customerName.trim(),
            gstin:         gstin.trim().toUpperCase(),
            location:      placeOfSupply.trim() || null,
            contacts:      null,
            trade_name:    null,
            taxpayer_type: null,
            pan:           null,
            contact_name:  null,
            mobile:        null,
            email:         null,
            street:        null,
            city:          placeOfSupply.trim() || null,
            state:         null,
            pin_code:      null,
            district:      null,
            credit_limit:  null,
            payment_terms: null,
            status:        "Active",
          });
        } catch (custErr) {
          console.warn("[CreateInvoice] Customer auto-sync to customerStore failed:", custErr);
        }
      }

      await saveInvoice(newInvoice as Invoice);
      setSaved(true);
      setTimeout(() => navigate(`/invoices/${encodeURIComponent(newInvoice.invoiceNo)}`), 800);
    } catch (err) {
      console.error("[CreateInvoice] saveInvoice failed:", err);
      setErrors({ invoiceNo: "Save failed — check connection and try again." });
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    if (!document.getElementById("invoice-print-style")) {
      const s = document.createElement("style");
      s.id = "invoice-print-style";
      s.textContent = PRINT_STYLES;
      document.head.appendChild(s);
    }
    window.print();
  };

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Print target — off screen */}
      <div style={{ position: "fixed", left: "-9999px", top: "0", width: "210mm", zIndex: -1 }}>
        <InvoicePrintView invoice={previewInvoice} />
      </div>

      {/* ── Fullscreen preview modal ── */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-sm">
          <div className="flex items-center justify-between px-6 py-2.5 bg-background border-b border-border shrink-0">
            <div className="flex items-center gap-3">
              <Eye className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Invoice Preview</span>
              <span className="text-[11px] text-muted-foreground">Live — updates as you type</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handlePrint}
                className="flex items-center gap-1.5 h-7 px-3 rounded-md border border-border text-xs hover:bg-muted transition-colors">
                <Printer className="h-3 w-3" /> Print / Save PDF
              </button>
              <button onClick={() => setShowPreview(false)}
                className="flex items-center gap-1.5 h-7 px-3 rounded-md border border-border text-xs hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" /> Close
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6 flex justify-center">
            <div className="bg-white shadow-2xl rounded-sm" style={{ width: "210mm", minHeight: "297mm", padding: "10mm 12mm" }}>
              <InvoicePrintView invoice={previewInvoice} />
            </div>
          </div>
        </div>
      )}

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="pl-0 pr-6 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/invoices")}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <div className="w-px h-4 bg-border" />
            <div className="leading-tight">
              <h1 className="text-sm font-bold flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5 text-primary" />
                New Invoice
              </h1>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-muted/50 border border-border text-muted-foreground">{invoiceNo}</span>
            {saved && <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-950/60 border border-green-700/40 text-green-400 font-medium animate-pulse">✓ Saved!</span>}
            {hasErrors && <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-950/60 border border-red-700/40 text-red-400">{Object.keys(errors).length} error{Object.keys(errors).length > 1 ? "s" : ""}</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setShowPreview(true)}
              className="flex items-center gap-1 h-7 px-2.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <Eye className="h-3 w-3" /> Preview
            </button>
            <button onClick={handlePrint}
              className="flex items-center gap-1 h-7 px-2.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <Printer className="h-3 w-3" /> Print
            </button>
          </div>
        </div>
      </div>

      {/* ── 2-zone layout: Form + Sticky Sidebar ── */}
      <div className="flex flex-1 gap-0 overflow-hidden min-h-0">

        {/* ══ LEFT: Form Area ══ */}
        <div className="flex-1 overflow-y-auto min-w-0">
          <div className="pr-6 pt-5 pb-8 space-y-4">

            {saved && (
              <div className="p-2.5 rounded-lg bg-green-950/30 border border-green-700/40 text-xs text-green-300">
                <strong>Invoice saved!</strong> Redirecting to invoice detail…
              </div>
            )}

            {/* ── Invoice Details + Customer — side by side ── */}
            <div className="grid grid-cols-5 gap-3">
              <div className="col-span-3">
                <Section title="Invoice Details" icon={FileText} defaultOpen>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <L req>Invoice No.</L>
                      <Input className={`h-8 text-xs font-mono ${errors.invoiceNo ? "border-red-500" : ""}`}
                        value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} />
                      {errors.invoiceNo && <p className="text-[10px] text-red-400 mt-0.5">{errors.invoiceNo}</p>}
                    </div>
                    <div>
                      <L req>Date</L>
                      <Input type="date" className={`h-8 text-xs ${errors.date ? "border-red-500" : ""}`}
                        value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
                    </div>
                    <div>
                      <L>Booked By</L>
                      <Input className="h-8 text-xs" placeholder="e.g. MO"
                        value={bookedBy} onChange={e => setBookedBy(e.target.value)} />
                    </div>
                  </div>
                </Section>
              </div>

              <div className="col-span-2">
                <Section title="Customer" icon={User} defaultOpen>
                  {!isCustomCust ? (
                    <div className="space-y-2">
                      <Select value={customerName} onValueChange={pickCustomer}>
                        <SelectTrigger className={`h-8 text-xs ${errors.customer ? "border-red-500" : ""}`}>
                          <SelectValue placeholder={customersLoading ? "Loading…" : "Pick customer…"} />
                        </SelectTrigger>
                        <SelectContent>
                          {customersLoading ? (
                            <SelectItem value="__loading__" disabled>Loading…</SelectItem>
                          ) : customerMaster.length === 0 ? (
                            <SelectItem value="__empty__" disabled>No customers found</SelectItem>
                          ) : (
                            customerMaster.map(c => (
                              <SelectItem key={c.id || c.gstin} value={c.customer_name}>
                                {c.customer_name}
                              </SelectItem>
                            ))
                          )}
                          <SelectItem value="__new__">+ New customer…</SelectItem>
                        </SelectContent>
                      </Select>
                      {customerName && (
                        <div className="grid grid-cols-2 gap-1.5">
                          <div className="px-2 py-1.5 rounded bg-muted/40 border border-border/50">
                            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">GSTIN</p>
                            <p className="font-mono font-semibold text-[11px] truncate">{gstin}</p>
                          </div>
                          <div className="px-2 py-1.5 rounded bg-muted/40 border border-border/50">
                            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Supply</p>
                            <p className="font-semibold text-[11px] truncate">{placeOfSupply}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <button onClick={() => setCustomCust(false)} className="text-[11px] text-primary hover:underline">← Pick existing</button>
                      <Input className={`h-8 text-xs ${errors.customer ? "border-red-500" : ""}`}
                        placeholder="Customer name" value={customerName}
                        onChange={e => setCustName(e.target.value)} />
                      <div className="grid grid-cols-2 gap-2">
                        <Input className={`h-8 text-xs font-mono uppercase ${errors.gstin ? "border-red-500" : ""}`}
                          placeholder="GSTIN" maxLength={15} value={gstin}
                          onChange={e => setGstin(e.target.value.toUpperCase())} />
                        <Input className="h-8 text-xs" placeholder="Place of Supply"
                          value={placeOfSupply} onChange={e => setPos(e.target.value)} />
                      </div>
                      <p className="text-[10px] text-muted-foreground/50">✓ Auto-saved on invoice save.</p>
                    </div>
                  )}
                </Section>
              </div>
            </div>

            {/* ── Items section — table-style ── */}
            <Section
              title="Line Items"
              icon={Receipt}
              defaultOpen
              badge={<span className="text-[10px] text-muted-foreground font-normal ml-auto">{lines.length} item{lines.length !== 1 ? "s" : ""}</span>}
              noPad
            >
              <div>
                {/* Table header */}
                <div className="grid items-center gap-0 bg-muted/40 border-b border-border text-[10px] text-muted-foreground uppercase tracking-widest font-bold"
                     style={{ gridTemplateColumns: "42px 1fr 80px 108px 72px 108px 40px" }}>
                  <span className="px-3 py-3 text-center">#</span>
                  <span className="px-3 py-3">Product / Description</span>
                  <span className="px-3 py-3 text-right">Qty</span>
                  <span className="px-3 py-3 text-right">Rate (Incl.)</span>
                  <span className="px-3 py-3 text-right">Disc %</span>
                  <span className="px-3 py-3 text-right">Amount</span>
                  <span />
                </div>

                {errors.lines && <p className="text-xs text-red-400 px-3 py-2">{errors.lines}</p>}

                {/* Rows */}
                {lines.map((li, idx) => (
                  <div key={li.id}>
                    <div className={`grid items-center gap-0 border-b border-border/50 hover:bg-muted/25 transition-colors ${idx % 2 === 0 ? "" : "bg-muted/8"}`}
                         style={{ gridTemplateColumns: "42px 1fr 80px 108px 72px 108px 40px" }}>
                      <span className="px-3 py-2.5 text-center text-[11px] text-muted-foreground/60 font-mono tabular-nums">{idx + 1}</span>
                      <div className="px-1.5 py-1.5">
                        <Select value={li.productDescription}
                          onValueChange={v => updateLine(li.id, "productDescription", v)}>
                          <SelectTrigger className={`h-8 text-xs border-0 bg-transparent shadow-none hover:bg-muted/40 ${errors[`d${idx}`] ? "ring-1 ring-red-500" : ""}`}>
                            <SelectValue placeholder="Select product…" />
                          </SelectTrigger>
                          <SelectContent>
                            {productsLoading ? (
                              <SelectItem value="__loading__" disabled>Loading products…</SelectItem>
                            ) : productMaster.length === 0 ? (
                              <SelectItem value="__empty__" disabled>No products found</SelectItem>
                            ) : (
                              productMaster.map(p => (
                                <SelectItem key={p.id} value={p.product_name}>
                                  {p.product_name}
                                </SelectItem>
                              ))
                            )}
                            <SelectItem value="__custom__">Custom…</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="px-1.5 py-1.5">
                        <Input type="number" min="1"
                          className={`h-8 text-xs text-right border-0 bg-transparent shadow-none hover:bg-muted/40 focus:bg-background focus:border focus:border-border ${errors[`q${idx}`] ? "ring-1 ring-red-500" : ""}`}
                          placeholder="0" value={li.quantity}
                          onChange={e => updateLine(li.id, "quantity", e.target.value === "" ? "" : Number(e.target.value))} />
                      </div>
                      <div className="px-1.5 py-1.5">
                        <Input type="number" min="0"
                          className={`h-8 text-xs text-right border-0 bg-transparent shadow-none hover:bg-muted/40 focus:bg-background focus:border focus:border-border ${errors[`r${idx}`] ? "ring-1 ring-red-500" : ""}`}
                          placeholder="0.00" value={li.rateInclTax}
                          onChange={e => updateLine(li.id, "rateInclTax", e.target.value === "" ? "" : Number(e.target.value))} />
                      </div>
                      <div className="px-1.5 py-1.5">
                        <Input type="number" min="0" max="100"
                          className="h-8 text-xs text-right border-0 bg-transparent shadow-none hover:bg-muted/40 focus:bg-background focus:border focus:border-border"
                          value={li.discountPct}
                          onChange={e => updateLine(li.id, "discountPct", e.target.value === "" ? "" : Number(e.target.value))} />
                      </div>
                      <div className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums text-green-400">
                        ₹{fmtNum(li.lineAmount)}
                      </div>
                      <div className="px-1 py-1.5 flex justify-center">
                        {lines.length > 1 ? (
                          <button onClick={() => setLines(p => p.filter(l => l.id !== li.id))}
                            className="p-1.5 rounded hover:bg-red-950/50 text-muted-foreground/30 hover:text-red-400 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : <span className="w-5" />}
                      </div>
                    </div>
                    {li.productDescription === "__custom__" && (
                      <div className="px-12 py-1.5 border-b border-border/40 bg-muted/10">
                        <Input className="h-7 text-xs border-dashed" placeholder="Enter product description…"
                          value={li.customDesc}
                          onChange={e => updateLine(li.id, "customDesc", e.target.value)} />
                      </div>
                    )}
                  </div>
                ))}

                {/* Add row + freight */}
                <div className="px-4 py-3 flex items-center justify-between border-t border-border/30 bg-muted/10">
                  <button onClick={() => setLines(p => [...p, blankLine()])}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md text-primary hover:bg-primary/10 transition-colors font-medium border border-primary/20 hover:border-primary/40">
                    <Plus className="h-3.5 w-3.5" /> Add Line Item
                  </button>
                  <div className="flex items-center gap-2.5 text-xs">
                    <span className="text-muted-foreground font-medium">Freight Deduction (−)</span>
                    <span className="text-muted-foreground">₹</span>
                    <Input type="number" min="0" className="h-8 text-xs w-28 text-right"
                      value={freight === "" || Number(freight) === 0 ? "" : Math.abs(Number(freight))}
                      onChange={e => setFreight(e.target.value === "" ? 0 : -(Math.abs(Number(e.target.value))))}
                      placeholder="0" />
                  </div>
                </div>
              </div>
            </Section>

            {/* ── Shipping & Logistics ── */}
            <Section title="Shipping & Logistics" icon={Truck} defaultOpen={false}>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <L>e-Way Bill No.</L>
                  <Input className="h-9 text-xs font-mono" value={eWayBillNo} onChange={e => setEWay(e.target.value)} />
                </div>
                <div>
                  <L>Weight (KG)</L>
                  <Input type="number" className="h-9 text-xs" value={weightKg}
                    onChange={e => setWeight(e.target.value === "" ? "" : Number(e.target.value))} />
                </div>
                <div>
                  <L>Dispatched Through</L>
                  <Input className="h-9 text-xs" value={dispatched} onChange={e => setDisp(e.target.value)} />
                </div>
                <div>
                  <L>Destination</L>
                  <Input className="h-9 text-xs" value={destination} onChange={e => setDest(e.target.value)} />
                </div>
              </div>
            </Section>

            {/* ── Notes & Terms ── */}
            <Section title="Notes & Terms" icon={StickyNote} defaultOpen={false}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <L>Customer-Facing Notes</L>
                  <textarea
                    rows={3}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                    placeholder="e.g. Thank you for your business. Goods once sold will not be returned…"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                  />
                </div>
                <div>
                  <L>Payment Terms</L>
                  <textarea
                    rows={3}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                    placeholder="e.g. Payment due within 30 days. Cheques in favour of Cosmo Industries…"
                    value={terms}
                    onChange={e => setTerms(e.target.value)}
                  />
                </div>
              </div>
            </Section>

            {/* ── Internal Remarks ── */}
            <Section title="Internal Remarks" icon={Shield} defaultOpen={false}>
              <div className="space-y-3">
                <div>
                  <L>Internal Note <span className="normal-case text-[10px] font-normal">(not printed on invoice)</span></L>
                  <textarea
                    rows={2}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                    placeholder="e.g. Customer requested urgent dispatch. Cross-check stock before printing…"
                    value={internalRemark}
                    onChange={e => setRemark(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-3 gap-3 pt-1">
                  <div className="px-3 py-2.5 rounded-lg border border-border/50 bg-muted/20">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Created By</p>
                    <p className="text-xs font-medium">{bookedBy || "—"}</p>
                  </div>
                  <div className="px-3 py-2.5 rounded-lg border border-border/50 bg-muted/20">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Invoice Date</p>
                    <p className="text-xs font-medium font-mono">{invoiceDate || "—"}</p>
                  </div>
                  <div className="px-3 py-2.5 rounded-lg border border-border/50 bg-muted/20">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Status</p>
                    <p className="text-xs font-medium text-amber-400">Draft</p>
                  </div>
                </div>
              </div>
            </Section>
          </div>
        </div>

        {/* ══ RIGHT: Full-height Workflow Sidebar ══ */}
        <div className="w-[272px] shrink-0 border-l border-border bg-card/60 overflow-y-auto flex flex-col">

          {/* ── Actions ── */}
          <div className="p-4 border-b border-border/60 space-y-2">
            <button onClick={handleSave} disabled={saving}
              className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-sm">
              {saving
                ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Saving…</>
                : <><Download className="h-3.5 w-3.5" />Save Invoice</>}
            </button>
            <button onClick={() => setShowPreview(true)}
              className="w-full h-8 rounded-lg border border-border text-xs hover:bg-muted transition-colors flex items-center justify-center gap-1.5 text-muted-foreground hover:text-foreground">
              <Eye className="h-3.5 w-3.5" /> Preview Invoice
            </button>
          </div>

          {/* ── Financial Summary ── */}
          <div className="p-4 border-b border-border/60">
            <div className="flex items-center gap-1.5 mb-3">
              <Receipt className="h-3 w-3 text-primary/70" />
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Invoice Summary</p>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-border/30">
                <span className="text-muted-foreground">Taxable Amount</span>
                <span className="tabular-nums font-semibold">₹{fmtNum(calcs.taxableAmount)}</span>
              </div>
              {isInterState ? (
                <div className="flex justify-between items-center pb-1 border-b border-border/30">
                  <span className="text-muted-foreground">IGST @ {GST_RATE}%</span>
                  <span className="tabular-nums text-amber-400">₹{fmtNum(calcs.igst)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">CGST @ {GST_RATE / 2}%</span>
                    <span className="tabular-nums text-amber-400">₹{fmtNum(calcs.cgst)}</span>
                  </div>
                  <div className="flex justify-between items-center pb-1 border-b border-border/30">
                    <span className="text-muted-foreground">SGST @ {GST_RATE / 2}%</span>
                    <span className="tabular-nums text-amber-400">₹{fmtNum(calcs.sgst)}</span>
                  </div>
                </>
              )}
              {Number(freight) !== 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Freight (−)</span>
                  <span className="tabular-nums text-red-400">−₹{fmtNum(Math.abs(Number(freight)))}</span>
                </div>
              )}
              {calcs.roundOff !== 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Round Off</span>
                  <span className="tabular-nums text-muted-foreground">{calcs.roundOff > 0 ? "+" : "−"}₹{Math.abs(calcs.roundOff).toFixed(2)}</span>
                </div>
              )}
            </div>
            <div className="mt-3 pt-3 border-t border-border">
              <div className="flex justify-between items-baseline">
                <span className="text-xs font-bold text-foreground">Grand Total</span>
                <span className="text-xl font-bold tabular-nums text-green-400">₹{fmtNum(calcs.totalAmount)}</span>
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground/60">
                <span>{lines.length} line item{lines.length !== 1 ? "s" : ""}</span>
                <span>{lines.filter(l => l.lineAmount > 0).length} priced</span>
              </div>
            </div>
          </div>

          {/* ── Invoice Meta ── */}
          <div className="p-4 border-b border-border/60 space-y-2.5">
            <div className="flex items-center gap-1.5 mb-2">
              <Hash className="h-3 w-3 text-primary/70" />
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Invoice Details</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] text-muted-foreground/70 mt-0.5 shrink-0">Invoice No.</span>
                <span className="text-[11px] font-mono font-semibold text-right truncate">{invoiceNo || "—"}</span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] text-muted-foreground/70 mt-0.5 shrink-0 flex items-center gap-1"><Calendar className="h-2.5 w-2.5" />Date</span>
                <span className="text-[11px] font-mono text-right">{invoiceDate || "—"}</span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] text-muted-foreground/70 mt-0.5 shrink-0">Booked By</span>
                <span className="text-[11px] font-semibold text-right">{bookedBy || "—"}</span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] text-muted-foreground/70 mt-0.5 shrink-0">GST Rate</span>
                <span className="text-[11px] font-mono text-right text-amber-400/80">{GST_RATE}%</span>
              </div>
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <span className="text-[10px] text-muted-foreground/70">Status</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950/50 border border-amber-700/40 text-amber-400 font-semibold">DRAFT</span>
              </div>
            </div>
          </div>

          {/* ── Bill To ── */}
          <div className="p-4 border-b border-border/60">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Building2 className="h-3 w-3 text-primary/70" />
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Bill To</p>
            </div>
            {customerName ? (
              <div className="space-y-2">
                <p className="text-xs font-bold leading-tight">{customerName}</p>
                {gstin && (
                  <div className="flex items-center gap-1.5">
                    <Tag className="h-2.5 w-2.5 text-muted-foreground/50 shrink-0" />
                    <p className="text-[10px] font-mono text-muted-foreground truncate">{gstin}</p>
                  </div>
                )}
                {placeOfSupply && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-2.5 w-2.5 text-muted-foreground/50 shrink-0" />
                    <p className="text-[10px] text-muted-foreground truncate">{placeOfSupply}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground/50 italic">No customer selected</p>
            )}
          </div>

          {/* ── Payment / Terms placeholder ── */}
          <div className="p-4 border-b border-border/60">
            <div className="flex items-center gap-1.5 mb-2.5">
              <CreditCard className="h-3 w-3 text-primary/70" />
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Payment</p>
            </div>
            <div className="space-y-2 text-[10px]">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground/70">Payment Due</span>
                <span className="text-muted-foreground italic">On Save</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground/70">Terms</span>
                <span className="text-muted-foreground italic">{terms ? "Custom" : "Standard"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground/70">Amount Due</span>
                <span className="font-semibold text-xs tabular-nums text-foreground/80">₹{fmtNum(calcs.totalAmount)}</span>
              </div>
            </div>
          </div>

          {/* ── Audit / Workflow trail ── */}
          <div className="p-4 flex-1">
            <div className="flex items-center gap-1.5 mb-3">
              <Clock className="h-3 w-3 text-primary/70" />
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Workflow</p>
            </div>
            <div className="space-y-3">
              {/* Timeline */}
              <div className="relative pl-6 space-y-3 text-[10px]">
                <div className="absolute left-2 top-1 bottom-1 w-px bg-border/50" />
                <div className="relative flex items-start gap-2">
                  <div className="absolute -left-[9px] top-1 w-2 h-2 rounded-full bg-primary/70 ring-2 ring-background" />
                  <div>
                    <p className="font-semibold text-foreground/80">Draft Created</p>
                    <p className="text-muted-foreground/60 mt-0.5">{invoiceDate || "Today"} · {bookedBy || "—"}</p>
                  </div>
                </div>
                <div className="relative flex items-start gap-2 opacity-40">
                  <div className="absolute -left-[9px] top-1 w-2 h-2 rounded-full bg-border ring-2 ring-background" />
                  <div>
                    <p className="font-medium text-muted-foreground">Saved to Records</p>
                    <p className="text-muted-foreground/60 mt-0.5">Pending save</p>
                  </div>
                </div>
                <div className="relative flex items-start gap-2 opacity-40">
                  <div className="absolute -left-[9px] top-1 w-2 h-2 rounded-full bg-border ring-2 ring-background" />
                  <div>
                    <p className="font-medium text-muted-foreground">Dispatched</p>
                    <p className="text-muted-foreground/60 mt-0.5">{dispatched || "Not set"}</p>
                  </div>
                </div>
                <div className="relative flex items-start gap-2 opacity-40">
                  <div className="absolute -left-[9px] top-1 w-2 h-2 rounded-full bg-border ring-2 ring-background" />
                  <div>
                    <p className="font-medium text-muted-foreground">Payment Received</p>
                    <p className="text-muted-foreground/60 mt-0.5">Awaiting</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateInvoice;
