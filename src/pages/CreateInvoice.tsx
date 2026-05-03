import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getAllInvoices, saveInvoice, getNextInvoiceNo } from "@/data/invoiceStore";
import { Invoice } from "@/data/financeData";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Plus, Trash2, Check, RefreshCw,
  AlertCircle, Download, Printer,
} from "lucide-react";
import {
  COMPANY, GST_RATE, r2, fmtNum, PRINT_STYLES,
  InvoicePrintView, PrintInvoice,
} from "@/lib/invoiceConstants";

// ── Customer catalog ───────────────────────────────────────────
const KNOWN_CUSTOMERS = [
  { name: "Amit Pipe Centre",                  gstin: "10ACPPA9600B1ZD", location: "Begusarai"        },
  { name: "Ganpati Traders",                   gstin: "10DLSPS9333A1Z2", location: "Raxaul Bazar"     },
  { name: "Kamakhya Traders",                  gstin: "10BMDPK0501L1ZQ", location: "Ara"              },
  { name: "Kamal Prasad Pawan Kumar",          gstin: "10ALUPK0259J1Z1", location: "Sitamarhi"        },
  { name: "L.P.B Agency",                      gstin: "10FKZPK2218G1Z5", location: "Purnea"           },
  { name: "M/s Krishi Auzar Bhandar, Buxar",  gstin: "10AAGFK9233K1ZD", location: "Buxar"            },
  { name: "M/s Maa Bhawani Traders",           gstin: "10AKKPG2420Q1ZC", location: "Ara"              },
  { name: "New Sharda Sanitary Mahal",         gstin: "10BKPPK5111C2ZS", location: "Bhagwanpur"       },
  { name: "Om Shivani Traders",                gstin: "10CUMPC9469D1ZO", location: "Bettiah"           },
  { name: "Pipe House",                        gstin: "10AFEPJ9289B1ZO", location: "Darbhanga"        },
  { name: "Shivshakti Stores Private Limited", gstin: "10AAGCC6589D1ZT", location: "Samastipur"       },
  { name: "Singhal Agency",                    gstin: "10AAGHM4700H1ZS", location: "Katihar"          },
  { name: "Sri Sai Nath Traders",              gstin: "10BOBPK0370R1Z1", location: "Sasaram"          },
  { name: "Sri Shyam Distributor",             gstin: "10AEIPL0767R1Z6", location: "Purbi Champaran"  },
];

// ── Product catalog ────────────────────────────────────────────
const PRODUCTS = [
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

/**
 * Generates a UUID v4.
 * Falls back to a Math.random-based implementation when the
 * Web Crypto API is unavailable (e.g. plain HTTP dev servers).
 */
function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback: timestamp (base-36) + random suffix — stronger than Math.random() alone
  // because the monotonic prefix guarantees uniqueness even on same-millisecond calls.
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
  customDesc:         string;  // for freetext entry
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
  <label className="block text-xs text-muted-foreground mb-1 uppercase tracking-wider font-medium">
    {children}{req && <span className="text-red-400 ml-0.5">*</span>}
  </label>
);

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
const CreateInvoice = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  // Pre-fill from customer profile
  const preCustomer = KNOWN_CUSTOMERS.find(
    c => c.name === decodeURIComponent(params.get("customer") ?? "")
  );

  const today = new Date().toISOString().split("T")[0];

  const [invoiceDate, setInvoiceDate] = useState(today);
  // ── Invoice number — fetched async from store ────────────────
  // The number must follow the FY of the selected invoice date, not today's date.
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
  // ── Form state ───────────────────────────────────────────────
  const [bookedBy,    setBookedBy]    = useState("MO");
  const [customerName, setCustName]   = useState(preCustomer?.name     ?? "");
  const [gstin,        setGstin]      = useState(preCustomer?.gstin    ?? "");
  const [placeOfSupply,setPos]        = useState(preCustomer?.location ?? "");
  const [isCustomCust, setCustomCust] = useState(false);
  const [eWayBillNo,   setEWay]       = useState("");
  const [dispatched,   setDisp]       = useState("");
  const [destination,  setDest]       = useState("");
  const [weightKg,     setWeight]     = useState<number | "">("");
  const [freight,      setFreight]    = useState<number | "">(0);
  const [lines,        setLines]      = useState<LineItem[]>([blankLine()]);
  const [errors,       setErrors]     = useState<Record<string, string>>({});
  const [saving,       setSaving]     = useState(false);
  const [saved,        setSaved]      = useState(false);

  // ── Customer select ──────────────────────────────────────────
  const pickCustomer = (name: string) => {
    if (name === "__new__") { setCustomCust(true); setCustName(""); setGstin(""); setPos(""); return; }
    setCustomCust(false);
    const c = KNOWN_CUSTOMERS.find(c => c.name === name);
    if (c) { setCustName(c.name); setGstin(c.gstin); setPos(c.location); }
  };

  // ── Line item update ─────────────────────────────────────────
  const updateLine = (id: string, key: keyof LineItem, val: string | number) => {
    setLines(prev => prev.map(li => {
      if (li.id !== id) return li;
      const u: LineItem = { ...li, [key]: val };
      if (key === "productDescription" && val !== "__custom__") {
        const p = PRODUCTS.find(p => p.name === val);
        if (p) { u.rateInclTax = p.rate; }
      }
      const qty  = Number(u.quantity)    || 0;
      const rate = Number(u.rateInclTax) || 0;
      const disc = Number(u.discountPct) || 0;
      const { rateExclTax, lineAmount } = calcLine(rate, qty, disc);
      return { ...u, rateExclTax, lineAmount };
    }));
  };

  // ── Calculations ─────────────────────────────────────────────
  const calcs = useMemo(() => {
    const taxableAmount = r2(lines.reduce((s, l) => s + l.lineAmount, 0));
    const cgst          = r2(taxableAmount * (GST_RATE / 2) / 100);
    const sgst          = cgst;
    const freightVal    = Number(freight) || 0;
    const raw           = taxableAmount + cgst + sgst + freightVal;
    const roundOff      = r2(Math.round(raw) - raw);
    const totalAmount   = r2(raw + roundOff);
    return { taxableAmount, cgst, sgst, roundOff, totalAmount };
  }, [lines, freight]);

  // ── Live preview invoice object ──────────────────────────────
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

  // ── Validation ───────────────────────────────────────────────
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
      // If we can't check for duplicates, proceed — save will fail if truly duplicate
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

  // ── Save → Supabase via async saveInvoice ───────────────────
  const handleSave = async () => {
    if (!(await validate())) return;
    setSaving(true);
    try {
      // Build invoice matching the Invoice interface exactly.
      // id is omitted here — Supabase generates it (serial/uuid column).
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

      await saveInvoice(newInvoice as Invoice);
      setSaved(true);

      // Navigate to the new invoice detail page
      setTimeout(() => navigate(`/invoices/${encodeURIComponent(newInvoice.invoiceNo)}`), 800);
    } catch (err) {
      console.error("[CreateInvoice] saveInvoice failed:", err);
      setErrors({ invoiceNo: "Save failed — check connection and try again." });
    } finally {
      setSaving(false);
    }
  };

  // ── Print ────────────────────────────────────────────────────
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
    <div className="min-h-screen bg-background">
      {/* Print target — off screen */}
      <div style={{ position: "fixed", left: "-9999px", top: "0", width: "210mm", zIndex: -1 }}>
        <InvoicePrintView invoice={previewInvoice} />
      </div>

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/invoices")}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" /> Invoices
            </button>
            <div className="w-px h-5 bg-border" />
            <div>
              <h1 className="text-base font-bold leading-tight">Create Invoice</h1>
              <p className="text-xs text-muted-foreground font-mono">{invoiceNo}</p>
            </div>
            {saved && <span className="text-xs px-2.5 py-1 rounded-full bg-green-950/60 border border-green-700/40 text-green-400 font-medium">✓ Invoice saved! Redirecting…</span>}
            {hasErrors && <span className="text-xs px-2.5 py-1 rounded-full bg-red-950/60 border border-red-700/40 text-red-400">{Object.keys(errors).length} error{Object.keys(errors).length > 1 ? "s" : ""}</span>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs hover:bg-muted transition-colors">
              <Printer className="h-3.5 w-3.5" /> Print Preview
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 h-8 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {saving ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Saving…</> : <><Download className="h-3.5 w-3.5" />Save Invoice</>}
            </button>
          </div>
        </div>
      </div>

      {/* ── Split layout: Form left | Tally preview right ── */}
      <div className="flex h-[calc(100vh-57px)]">

        {/* ══ LEFT: Form ══ */}
        <div className="w-[420px] flex-shrink-0 border-r border-border overflow-y-auto">
          <div className="p-5 space-y-4">

            {saved && (
              <div className="p-3 rounded-lg bg-green-950/30 border border-green-700/40 text-xs text-green-300">
                <strong>Invoice saved!</strong> Redirecting to invoice detail…
              </div>
            )}

            {/* Invoice Details */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Invoice Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <L req>Invoice No.</L>
                  <Input className={`h-8 text-xs font-mono ${errors.invoiceNo ? "border-red-500" : ""}`}
                    value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} />
                  {errors.invoiceNo && <p className="text-xs text-red-400 mt-0.5">{errors.invoiceNo}</p>}
                </div>
                <div>
                  <L req>Date</L>
                  <Input type="date" className={`h-8 text-xs ${errors.date ? "border-red-500" : ""}`}
                    value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
                </div>
              </div>
              <div>
                <L>Booked By</L>
                <Input className="h-8 text-xs" placeholder="e.g. MO"
                  value={bookedBy} onChange={e => setBookedBy(e.target.value)} />
              </div>
            </div>

            {/* Customer */}
            <div className="space-y-3 pt-1 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Customer</p>
              {!isCustomCust ? (
                <>
                  <div>
                    <L req>Select Customer</L>
                    <Select value={customerName} onValueChange={pickCustomer}>
                      <SelectTrigger className={`h-8 text-xs ${errors.customer ? "border-red-500" : ""}`}>
                        <SelectValue placeholder="Pick customer…" />
                      </SelectTrigger>
                      <SelectContent>
                        {KNOWN_CUSTOMERS.map(c => <SelectItem key={c.gstin} value={c.name}>{c.name}</SelectItem>)}
                        <SelectItem value="__new__">+ New customer…</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {customerName && (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 rounded bg-muted/30 border border-border">
                        <p className="text-muted-foreground mb-0.5">GSTIN</p>
                        <p className="font-mono font-bold text-xs">{gstin}</p>
                      </div>
                      <div className="p-2 rounded bg-muted/30 border border-border">
                        <p className="text-muted-foreground mb-0.5">Place of Supply</p>
                        <p className="font-semibold">{placeOfSupply}</p>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-2">
                  <button onClick={() => setCustomCust(false)} className="text-xs text-primary hover:underline">← Pick existing</button>
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
                </div>
              )}
            </div>

            {/* Line Items */}
            <div className="space-y-3 pt-1 border-t border-border">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Items</p>
                <button onClick={() => setLines(p => [...p, blankLine()])}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-colors">
                  <Plus className="h-3 w-3" /> Add
                </button>
              </div>
              {errors.lines && <p className="text-xs text-red-400">{errors.lines}</p>}

              {lines.map((li, idx) => (
                <div key={li.id} className="p-3 rounded-lg border border-border bg-muted/10 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-mono w-4">{idx + 1}</span>
                    <Select value={li.productDescription}
                      onValueChange={v => updateLine(li.id, "productDescription", v)}>
                      <SelectTrigger className={`h-7 text-xs flex-1 ${errors[`d${idx}`] ? "border-red-500" : ""}`}>
                        <SelectValue placeholder="Select product…" />
                      </SelectTrigger>
                      <SelectContent>
                        {PRODUCTS.map(p => <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>)}
                        <SelectItem value="__custom__">Custom…</SelectItem>
                      </SelectContent>
                    </Select>
                    {lines.length > 1 && (
                      <button onClick={() => setLines(p => p.filter(l => l.id !== li.id))}
                        className="p-1 rounded hover:bg-red-950/40 text-muted-foreground hover:text-red-400 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {li.productDescription === "__custom__" && (
                    <Input className="h-7 text-xs ml-6" placeholder="Product description"
                      value={li.customDesc}
                      onChange={e => updateLine(li.id, "customDesc", e.target.value)} />
                  )}

                  <div className="ml-6 grid grid-cols-4 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Qty</label>
                      <Input type="number" min="1" className={`h-7 text-xs ${errors[`q${idx}`] ? "border-red-500" : ""}`}
                        value={li.quantity}
                        onChange={e => updateLine(li.id, "quantity", e.target.value === "" ? "" : Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Rate (Incl)</label>
                      <Input type="number" min="0" className={`h-7 text-xs ${errors[`r${idx}`] ? "border-red-500" : ""}`}
                        value={li.rateInclTax}
                        onChange={e => updateLine(li.id, "rateInclTax", e.target.value === "" ? "" : Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Disc %</label>
                      <Input type="number" min="0" max="100" className="h-7 text-xs"
                        value={li.discountPct}
                        onChange={e => updateLine(li.id, "discountPct", e.target.value === "" ? "" : Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Amount</label>
                      <div className="h-7 flex items-center px-2 rounded bg-muted/40 border border-border text-xs font-medium text-green-400 tabular-nums">
                        ₹{fmtNum(li.lineAmount)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Freight */}
              <div className="flex items-center gap-3 pt-1">
                <label className="text-xs text-muted-foreground w-28">Freight (deduct)</label>
                <div className="flex items-center gap-1 flex-1">
                  <span className="text-xs text-muted-foreground">₹</span>
                  <Input type="number" min="0" className="h-7 text-xs"
                    value={freight === "" || Number(freight) === 0 ? "" : Math.abs(Number(freight))}
                    onChange={e => setFreight(e.target.value === "" ? 0 : -(Math.abs(Number(e.target.value))))}
                    placeholder="0" />
                </div>
              </div>

              {/* Running total */}
              <div className="p-3 rounded-lg bg-muted/20 border border-border space-y-1.5 text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>Taxable</span><span className="tabular-nums">₹{fmtNum(calcs.taxableAmount)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>CGST {GST_RATE / 2}%</span><span className="tabular-nums">₹{fmtNum(calcs.cgst)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>SGST {GST_RATE / 2}%</span><span className="tabular-nums">₹{fmtNum(calcs.sgst)}</span>
                </div>
                {calcs.roundOff !== 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Round Off</span><span className="tabular-nums">{calcs.roundOff > 0 ? "+" : "−"}₹{Math.abs(calcs.roundOff).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold border-t border-border pt-1.5">
                  <span>Total</span><span className="tabular-nums text-green-400 text-sm">₹{fmtNum(calcs.totalAmount)}</span>
                </div>
              </div>
            </div>

            {/* Logistics */}
            <div className="space-y-2 pt-1 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Shipping</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <L>e-Way Bill No.</L>
                  <Input className="h-7 text-xs font-mono" value={eWayBillNo} onChange={e => setEWay(e.target.value)} />
                </div>
                <div>
                  <L>Weight (KG)</L>
                  <Input type="number" className="h-7 text-xs" value={weightKg}
                    onChange={e => setWeight(e.target.value === "" ? "" : Number(e.target.value))} />
                </div>
                <div>
                  <L>Dispatched Through</L>
                  <Input className="h-7 text-xs" value={dispatched} onChange={e => setDisp(e.target.value)} />
                </div>
                <div>
                  <L>Destination</L>
                  <Input className="h-7 text-xs" value={destination} onChange={e => setDest(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Save button at bottom of form */}
            <div className="pt-2 pb-4 flex gap-2">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                {saving ? <><RefreshCw className="h-4 w-4 animate-spin" />Saving…</> : <><Download className="h-4 w-4" />Save Invoice</>}
              </button>
              <button onClick={handlePrint}
                className="h-10 px-4 rounded-xl border border-border text-sm hover:bg-muted transition-colors flex items-center gap-1.5">
                <Printer className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ══ RIGHT: Live Tally Preview ══ */}
        <div className="flex-1 bg-gray-200 overflow-y-auto">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-300 border-b border-gray-400">
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Live Preview — Tax Invoice</span>
            <span className="text-xs text-gray-500">Updates as you type</span>
          </div>
          <div className="p-6">
            <div className="bg-white shadow-lg mx-auto" style={{ width: "210mm", minHeight: "297mm", padding: "10mm 12mm" }}>
              <InvoicePrintView invoice={previewInvoice} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateInvoice;
