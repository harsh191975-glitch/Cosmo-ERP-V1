/**
 * CreateCreditNote.tsx
 *
 * Fixes:
 * 1. Input 0 auto-clears when user starts typing (NumInput component)
 * 2. Full print preview matching AHC credit note PDF format
 * 3. Print / Save PDF button after issue
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getAllInvoices, getInvoiceStats } from "@/data/invoiceStore";
import {
  saveCreditNote, getNextCreditNoteNumber, CreditNoteReason,
  CreditNoteLineItem, NewCreditNote, CreditNote,
} from "@/data/creditNoteStore";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Plus, Trash2, AlertTriangle, Check,
  RefreshCw, Info, Printer, Eye, EyeOff,
} from "lucide-react";

// ── Helpers ────────────────────────────────────────────────────
const fmt = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDatePrint = (d: string) =>
  new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

function numberToWords(amount: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  if (amount === 0) return "Zero";
  const rupees = Math.floor(amount);
  const paise  = Math.round((amount - rupees) * 100);
  function convert(n: number): string {
    if (n < 20)       return ones[n];
    if (n < 100)      return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    if (n < 1000)     return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + convert(n % 100) : "");
    if (n < 100000)   return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + convert(n % 1000) : "");
    if (n < 10000000) return convert(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + convert(n % 100000) : "");
    return convert(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + convert(n % 10000000) : "");
  }
  if (paise > 0) return "INR " + convert(rupees) + " and " + convert(paise) + " paise Only";
  return "INR " + convert(rupees) + " Only";
}

// ── Print styles ───────────────────────────────────────────────
const CN_PRINT_STYLES = `
@media print {
  body * { visibility: hidden !important; }
  #cn-print-area,
  #cn-print-area * { visibility: visible !important; }
  #cn-print-area {
    position: fixed !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    background: white !important;
    padding: 8mm 10mm !important;
  }
  #cn-preview-only { display: none !important; }
  @page { margin: 0; size: A4 portrait; }
}
`;

// ── Credit Note Print View — matches AHC PDF format ───────────
interface PrintCNProps {
  cn: CreditNote;
  invoice: { customerName: string; gstin: string; placeOfSupply: string } | null;
}

const CreditNotePrintView = ({ cn, invoice }: PrintCNProps) => {
  const taxTotal  = cn.cgst + cn.sgst;
  const rawTotal  = cn.totalAmount;
  const rounded   = Math.round(rawTotal);
  const roundOff  = parseFloat((rounded - rawTotal).toFixed(2));
  const gstRate   = cn.taxableAmount > 0 ? Math.round((cn.cgst / cn.taxableAmount) * 100) : 9;
  const cell      = (extra?: React.CSSProperties): React.CSSProperties => ({
    border: "1px solid #000", padding: "3px 5px", ...extra,
  });

  return (
    <div id="cn-print-area" style={{ fontFamily: "Arial, sans-serif", fontSize: "11px", color: "#000", background: "#fff", width: "100%" }}>

      {/* Company header */}
      <div style={{ textAlign: "center", marginBottom: "4px" }}>
        <div style={{ fontSize: "15px", fontWeight: "bold" }}>AMAN AND HARSHVARDHAN COMPANY</div>
        <div>B-10, Bela Industrial Area, Bela, Muzaffarpur, Bihar-842004</div>
        <div>GSTIN/UIN: 10ACKFA2426N1ZK &nbsp;|&nbsp; State Name: Bihar, Code: 10</div>
        <div>Contact: 72502 26777, +91-7070992326 &nbsp;|&nbsp; E-Mail: info.haindustries@gmail.com</div>
      </div>

      {/* Title bar */}
      <div style={{ textAlign: "center", fontWeight: "bold", fontSize: "13px", margin: "5px 0", borderTop: "2px solid #000", borderBottom: "2px solid #000", padding: "3px 0" }}>
        CREDIT NOTE
      </div>

      {/* Top meta */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "3px" }}>
        <tbody>
          <tr>
            <td style={cell({ width: "40%", verticalAlign: "top" })}>
              <strong>Credit Note No.</strong><br />
              <span style={{ fontSize: "12px", fontWeight: "bold" }}>{cn.creditNoteNumber}</span>
            </td>
            <td style={cell({ width: "30%" })}>
              <strong>Dated</strong><br />{fmtDatePrint(cn.date)}
            </td>
            <td style={cell({ width: "30%" })}>
              <strong>Reason</strong><br />{cn.reason}
            </td>
          </tr>
          <tr>
            <td style={cell()}>
              <strong>Original Invoice No.</strong><br />{cn.invoiceNo}
            </td>
            <td colSpan={2} style={cell()}>
              <strong>Mode/Terms of Payment</strong><br />—
            </td>
          </tr>
        </tbody>
      </table>

      {/* Buyer */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "3px" }}>
        <tbody>
          <tr>
            <td style={cell({ width: "50%", verticalAlign: "top" })}>
              <strong>Buyer (Bill to)</strong><br />
              <strong>{invoice?.customerName ?? cn.customerName}</strong><br />
              {invoice?.placeOfSupply && <span>{invoice.placeOfSupply}<br /></span>}
              {invoice?.gstin && <span>GSTIN/UIN: {invoice.gstin}<br /></span>}
              State Name: Bihar, Code: 10
            </td>
            <td style={cell({ width: "50%", verticalAlign: "top" })}>
              <strong>Place of Supply</strong><br />
              {invoice?.placeOfSupply ?? "Bihar (10)"}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Line items */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f0f0f0" }}>
            {["Sl No.", "Particulars", "HSN/SAC", "Quantity", "Rate", "per", "Disc.%", "Amount"].map((h, i) => (
              <th key={h} style={cell({ textAlign: i === 1 ? "left" : "center", fontWeight: "bold",
                width: ["5%","auto","10%","9%","9%","5%","7%","12%"][i] })}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cn.lineItems.map((li, i) => (
            <tr key={i}>
              <td style={cell({ textAlign: "center" })}>{i + 1}</td>
              <td style={cell()}>{li.description || "—"}</td>
              <td style={cell({ textAlign: "center" })}>997113</td>
              <td style={cell({ textAlign: "center" })}>{li.quantity > 0 ? li.quantity : ""}</td>
              <td style={cell({ textAlign: "right" })}>{li.rate > 0 ? li.rate.toFixed(2) : ""}</td>
              <td style={cell({ textAlign: "center" })}></td>
              <td style={cell({ textAlign: "right" })}>{li.discountPct > 0 ? li.discountPct + "%" : ""}</td>
              <td style={cell({ textAlign: "right" })}>{li.lineAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
            </tr>
          ))}
          {/* Padding rows */}
          {Array.from({ length: Math.max(0, 3 - cn.lineItems.length) }).map((_, i) => (
            <tr key={`pad-${i}`}>
              {Array.from({ length: 8 }).map((_, j) => (
                <td key={j} style={cell({ padding: "8px 5px" })}>&nbsp;</td>
              ))}
            </tr>
          ))}
          {/* CGST */}
          <tr>
            <td colSpan={7} style={cell({ textAlign: "right" })}>CGST</td>
            <td style={cell({ textAlign: "right" })}>{cn.cgst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
          </tr>
          {/* SGST */}
          <tr>
            <td colSpan={7} style={cell({ textAlign: "right" })}>SGST</td>
            <td style={cell({ textAlign: "right" })}>{cn.sgst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
          </tr>
          {/* Round off */}
          {Math.abs(roundOff) >= 0.01 && (
            <tr>
              <td colSpan={7} style={cell({ textAlign: "right" })}>Less: Round Off (-)</td>
              <td style={cell({ textAlign: "right" })}>{Math.abs(roundOff).toFixed(2)}</td>
            </tr>
          )}
          {/* Total */}
          <tr style={{ background: "#f0f0f0", fontWeight: "bold" }}>
            <td colSpan={3} style={cell()}>Total</td>
            <td style={cell({ textAlign: "center" })}></td>
            <td colSpan={3} style={cell()}></td>
            <td style={cell({ textAlign: "right" })}>
              ₹ {rounded.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Amount in words */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={cell({ width: "80%" })}>
              <strong>Amount Chargeable (in words)</strong><br />
              <strong>{numberToWords(rounded)}</strong>
            </td>
            <td style={cell({ textAlign: "right", fontSize: "10px" })}>E. &amp; O.E</td>
          </tr>
        </tbody>
      </table>

      {/* HSN/GST summary */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "5px" }}>
        <thead>
          <tr style={{ background: "#f0f0f0" }}>
            <th style={cell({ textAlign: "left" })}>HSN/SAC</th>
            <th style={cell({ textAlign: "right" })}>Total Taxable Value</th>
            <th colSpan={2} style={cell({ textAlign: "center" })}>CGST</th>
            <th colSpan={2} style={cell({ textAlign: "center" })}>SGST/UTGST</th>
            <th style={cell({ textAlign: "right" })}>Total Tax Amount</th>
          </tr>
          <tr style={{ background: "#f0f0f0", fontSize: "10px" }}>
            <th style={cell()}></th>
            <th style={cell()}></th>
            <th style={cell({ textAlign: "center" })}>Rate</th>
            <th style={cell({ textAlign: "right" })}>Amount</th>
            <th style={cell({ textAlign: "center" })}>Rate</th>
            <th style={cell({ textAlign: "right" })}>Amount</th>
            <th style={cell()}></th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={cell()}>997113</td>
            <td style={cell({ textAlign: "right" })}>{cn.taxableAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
            <td style={cell({ textAlign: "center" })}>{gstRate}%</td>
            <td style={cell({ textAlign: "right" })}>{cn.cgst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
            <td style={cell({ textAlign: "center" })}>{gstRate}%</td>
            <td style={cell({ textAlign: "right" })}>{cn.sgst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
            <td style={cell({ textAlign: "right" })}>{taxTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
          </tr>
          <tr style={{ fontWeight: "bold", background: "#f0f0f0" }}>
            <td style={cell()}>Total</td>
            <td style={cell({ textAlign: "right" })}>{cn.taxableAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
            <td style={cell()}></td>
            <td style={cell({ textAlign: "right" })}>{cn.cgst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
            <td style={cell()}></td>
            <td style={cell({ textAlign: "right" })}>{cn.sgst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
            <td style={cell({ textAlign: "right" })}>{taxTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
          </tr>
        </tbody>
      </table>

      {/* Tax in words */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "3px" }}>
        <tbody>
          <tr>
            <td style={cell()}>
              <strong>Tax Amount (in words):</strong> {numberToWords(taxTotal)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Bank + signature */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "3px" }}>
        <tbody>
          <tr>
            <td style={cell({ width: "60%", verticalAlign: "top" })}>
              <strong>Company's Bank Details</strong><br />
              A/c Holder's Name: AMAN AND HARSHVARDHAN COMPANY<br />
              Bank Name: UNION BANK OF INDIA<br />
              A/c No.: 902101010000029<br />
              Branch &amp; IFS Code: LS COLLEGE, MUZ. &amp; UBIN0590215
            </td>
            <td style={cell({ textAlign: "right", verticalAlign: "bottom" })}>
              <strong>for AMAN AND HARSHVARDHAN COMPANY</strong>
              <br /><br /><br />
              <strong>Authorised Signatory</strong>
            </td>
          </tr>
          <tr>
            <td colSpan={2} style={cell({ textAlign: "center", fontSize: "10px" })}>
              This is a Computer Generated Document
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

// ── NumInput — clears 0 on focus so typing replaces it ────────
const NumInput = ({ value, onChange, min, max, className }: {
  value: number; onChange: (v: number) => void;
  min?: number; max?: number; className?: string;
}) => {
  const [display, setDisplay] = useState(String(value));

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (parseFloat(e.target.value) === 0) setDisplay("");
    else e.target.select();
  };
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplay(e.target.value);
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) onChange(v);
  };
  const handleBlur = () => {
    if (display === "" || isNaN(parseFloat(display))) { setDisplay("0"); onChange(0); }
    else setDisplay(String(parseFloat(display)));
  };

  return (
    <Input type="number" min={min} max={max}
      value={display}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
      className={className} />
  );
};

// ── Constants ──────────────────────────────────────────────────
const REASONS: CreditNoteReason[] = [
  "Rate Difference", "Goods Return", "Discount Adjustment",
  "Quantity Difference", "Quality Issue", "Other",
];

const emptyLine = (): CreditNoteLineItem => ({
  description: "", quantity: 1, rate: 0, amount: 0, discountPct: 0, lineAmount: 0,
});

function recomputeLine(li: CreditNoteLineItem): CreditNoteLineItem {
  const amount     = li.quantity * li.rate;
  const lineAmount = amount * (1 - li.discountPct / 100);
  return { ...li, amount, lineAmount };
}

// ── Main component ─────────────────────────────────────────────
const CreateCreditNote = () => {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const [allInvoices,    setAllInvoices]    = useState<Awaited<ReturnType<typeof getAllInvoices>>>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);

  useEffect(() => {
    getAllInvoices()
      .then(data => setAllInvoices(data))
      .catch(err => console.error("[CreateCreditNote] getAllInvoices failed:", err))
      .finally(() => setInvoicesLoading(false));
  }, []);

  const [invoiceNo,   setInvoiceNo]   = useState(searchParams.get("invoiceNo") ?? "");
  const [date,        setDate]        = useState(new Date().toISOString().split("T")[0]);
  const [reason,      setReason]      = useState<CreditNoteReason>("Rate Difference");
  const [lineItems,   setLineItems]   = useState<CreditNoteLineItem[]>([emptyLine()]);
  const [notes,       setNotes]       = useState("");
  const [saving,      setSaving]      = useState(false);
  const [savedCN,     setSavedCN]     = useState<CreditNote | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [error,       setError]       = useState("");

  const [cnNumber, setCnNumber] = useState<string>("");
  useEffect(() => {
    getNextCreditNoteNumber(new Date(date))
      .then(n => setCnNumber(n))
      .catch(err => console.error("[CreateCreditNote] getNextCreditNoteNumber failed:", err));
  }, [date]);

  const selectedInvoice = useMemo(
    () => allInvoices.find(inv => inv.invoiceNo === invoiceNo) ?? null,
    [invoiceNo, allInvoices]
  );

  const [invoiceStats, setInvoiceStats] = useState<Awaited<ReturnType<typeof getInvoiceStats>> | null>(null);

  const fetchStats = useCallback(async () => {
    if (!selectedInvoice) { setInvoiceStats(null); return; }
    try {
      const stats = await getInvoiceStats(selectedInvoice.invoiceNo, selectedInvoice.totalAmount, selectedInvoice.invoiceDate);
      setInvoiceStats(stats);
    } catch (err) {
      console.error("[CreateCreditNote] getInvoiceStats failed:", err);
      setInvoiceStats(null);
    }
  }, [selectedInvoice]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const remainingBalance = invoiceStats?.outstanding ?? 0;
  const taxableAmount    = lineItems.reduce((s, li) => s + li.lineAmount, 0);
  const gstRate          = selectedInvoice?.gstRate ?? 18;
  const cgst             = taxableAmount * (gstRate / 2 / 100);
  const sgst             = taxableAmount * (gstRate / 2 / 100);
  const totalAmount      = taxableAmount + cgst + sgst;

  const hasLineItems   = lineItems.some(li => li.lineAmount > 0);
  const exceedsBalance = totalAmount > remainingBalance + 0.01;
  const isAlreadyPaid  = remainingBalance <= 0;
  const canSave        = !!selectedInvoice && hasLineItems && !exceedsBalance && !isAlreadyPaid && !saving && !savedCN;

  const updateLine = (idx: number, field: keyof CreditNoteLineItem, value: number | string) =>
    setLineItems(prev => {
      const next = [...prev];
      next[idx]  = recomputeLine({ ...next[idx], [field]: value });
      return next;
    });

  const handlePrint = () => {
    if (!document.getElementById("cn-print-style")) {
      const s = document.createElement("style");
      s.id = "cn-print-style";
      s.textContent = CN_PRINT_STYLES;
      document.head.appendChild(s);
    }
    window.print();
  };

  const handleSave = async () => {
    setError("");
    if (!selectedInvoice) { setError("Please select a linked invoice."); return; }
    if (!hasLineItems)    { setError("Add at least one line item with an amount."); return; }
    if (exceedsBalance)   { setError(`Total (${fmt(totalAmount)}) exceeds remaining balance (${fmt(remainingBalance)}).`); return; }
    if (isAlreadyPaid)    { setError("Invoice is already fully settled."); return; }

    setSaving(true);
    try {
      const cn = await saveCreditNote({
        invoiceNo: selectedInvoice.invoiceNo,
        customerName: selectedInvoice.customerName,
        date, reason, lineItems,
        taxableAmount: parseFloat(taxableAmount.toFixed(2)),
        cgst: parseFloat(cgst.toFixed(2)),
        sgst: parseFloat(sgst.toFixed(2)),
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        notes: notes || undefined,
      });
      setSavedCN(cn);
      setShowPreview(true);
    } catch (err) {
      console.error("[CreateCreditNote] saveCreditNote failed:", err);
      setError("Failed to save credit note. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Preview object — uses saved CN if exists, else live form state
  const previewCN: CreditNote = savedCN ?? {
    id: cnNumber, creditNoteNumber: cnNumber,
    invoiceNo, customerName: selectedInvoice?.customerName ?? "",
    date, reason, lineItems,
    taxableAmount: parseFloat(taxableAmount.toFixed(2)),
    cgst: parseFloat(cgst.toFixed(2)),
    sgst: parseFloat(sgst.toFixed(2)),
    totalAmount: parseFloat(totalAmount.toFixed(2)),
    notes, createdAt: new Date().toISOString(),
  };

  return (
    <div className="space-y-5">

      {/* Hidden print node — visibility controlled by @media print CSS */}
      <div style={{ position: "fixed", left: "-9999px", top: "0", width: "210mm", zIndex: -1 }}>
        <CreditNotePrintView cn={previewCN} invoice={selectedInvoice} />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/invoices/credit-notes")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="w-px h-5 bg-border" />
          <div>
            <h2 className="text-lg font-bold">New Credit Note</h2>
            <p className="text-xs text-muted-foreground font-mono">{cnNumber}</p>
          </div>
        </div>
        {selectedInvoice && (
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 h-9 px-4 rounded-lg border border-border text-sm hover:bg-muted transition-colors">
            <Printer className="h-4 w-4" /> Print / Save PDF
          </button>
        )}
      </div>

      {/* Success banner */}
      {savedCN && (
        <div className="flex items-center justify-between p-4 rounded-xl border border-green-700/40 bg-green-950/20 text-sm text-green-300">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4" />
            Credit note <strong className="font-mono">{savedCN.creditNoteNumber}</strong> issued.
          </div>
          <div className="flex gap-2">
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-green-700/30 border border-green-700/40 text-xs hover:bg-green-700/50 transition-colors">
              <Printer className="h-3.5 w-3.5" /> Print / PDF
            </button>
            <button onClick={() => navigate(`/invoices/${encodeURIComponent(savedCN.invoiceNo)}`)}
              className="h-8 px-3 rounded-lg bg-green-700 text-white text-xs font-medium hover:bg-green-600 transition-colors">
              View Invoice →
            </button>
          </div>
        </div>
      )}

      {/* Errors / warnings */}
      {isAlreadyPaid && selectedInvoice && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-700/40 bg-amber-950/20 text-sm text-amber-300">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          Invoice <strong>{selectedInvoice.invoiceNo}</strong> is already fully settled. Credit note cannot be applied.
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-red-700/40 bg-red-950/20 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Preview panel */}
      {showPreview && selectedInvoice && (
        <div className="rounded-xl border border-border overflow-hidden shadow-xl">
          <div className="flex items-center justify-between px-5 py-2.5 bg-muted/30 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Credit Note Preview</span>
            <div className="flex gap-2">
              <button onClick={handlePrint}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-border hover:bg-muted transition-colors">
                <Printer className="h-3 w-3" /> Print / Save PDF
              </button>
              <button onClick={() => setShowPreview(false)}
                className="text-xs px-2.5 py-1.5 rounded border border-border hover:bg-muted transition-colors">
                Hide
              </button>
            </div>
          </div>
          <div className="bg-gray-200 p-6 overflow-auto" style={{ maxHeight: "70vh" }}>
            <div className="bg-white shadow-lg mx-auto" style={{ width: "210mm" }} id="cn-preview-only">
              <CreditNotePrintView cn={previewCN} invoice={selectedInvoice} />
            </div>
          </div>
        </div>
      )}

      {/* Form + sidebar */}
      <div className="grid grid-cols-4 gap-4">
        <div className="col-span-3 space-y-4">

          {/* Meta */}
          <Card className="p-5 space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Credit Note Details</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Credit Note Number</label>
                <Input value={cnNumber} readOnly className="h-9 text-sm font-mono bg-muted/30" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Date *</label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Linked Invoice *</label>
                <Select value={invoiceNo} onValueChange={setInvoiceNo} disabled={invoicesLoading}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder={invoicesLoading ? "Loading invoices…" : "Select invoice…"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {allInvoices.map(inv => (
                      <SelectItem key={inv.invoiceNo} value={inv.invoiceNo}>
                        <span className="font-mono text-xs">{inv.invoiceNo}</span>
                        <span className="text-muted-foreground ml-2 text-xs">— {inv.customerName}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Customer</label>
                <Input value={selectedInvoice?.customerName ?? ""} readOnly
                  className="h-9 text-sm bg-muted/30" placeholder="Auto-filled from invoice" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground mb-1.5 block">Reason *</label>
                <Select value={reason} onValueChange={v => setReason(v as CreditNoteReason)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          {/* Balance info */}
          {selectedInvoice && invoiceStats && (
            <div className="flex items-center gap-3 p-3.5 rounded-xl border border-blue-700/30 bg-blue-950/15 text-xs text-blue-300">
              <Info className="h-4 w-4 flex-shrink-0" />
              <div className="flex gap-5">
                <span>Invoice: <strong className="text-foreground">{fmt(selectedInvoice.totalAmount)}</strong></span>
                <span>Paid: <strong className="text-green-400">{fmt(invoiceStats.totalPaid)}</strong></span>
                <span>Credit Notes: <strong className="text-purple-400">{fmt(invoiceStats.totalCreditNotes)}</strong></span>
                <span>Remaining: <strong className={remainingBalance > 0 ? "text-red-400" : "text-green-400"}>{fmt(remainingBalance)}</strong></span>
              </div>
            </div>
          )}

          {/* Line items */}
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Line Items</p>
              <button onClick={() => setLineItems(p => [...p, emptyLine()])}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border border-border hover:bg-muted transition-colors">
                <Plus className="h-3.5 w-3.5" /> Add Line
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs">
                  <th className="pb-2 text-left text-muted-foreground">Description</th>
                  <th className="pb-2 text-right text-muted-foreground w-16">Qty</th>
                  <th className="pb-2 text-right text-muted-foreground w-24">Rate (₹)</th>
                  <th className="pb-2 text-right text-muted-foreground w-16">Disc%</th>
                  <th className="pb-2 text-right text-muted-foreground w-24">Amount (₹)</th>
                  <th className="pb-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {lineItems.map((li, idx) => (
                  <tr key={idx}>
                    <td className="py-2 pr-2">
                      <Input className="h-8 text-xs" placeholder="e.g. Rate Difference"
                        value={li.description} onChange={e => updateLine(idx, "description", e.target.value)} />
                    </td>
                    <td className="py-2 px-1">
                      <NumInput className="h-8 text-xs text-right tabular-nums"
                        value={li.quantity} min={0} onChange={v => updateLine(idx, "quantity", v)} />
                    </td>
                    <td className="py-2 px-1">
                      <NumInput className="h-8 text-xs text-right tabular-nums"
                        value={li.rate} min={0} onChange={v => updateLine(idx, "rate", v)} />
                    </td>
                    <td className="py-2 px-1">
                      <NumInput className="h-8 text-xs text-right tabular-nums"
                        value={li.discountPct} min={0} max={100} onChange={v => updateLine(idx, "discountPct", v)} />
                    </td>
                    <td className="py-2 pl-1">
                      <Input className="h-8 text-xs text-right tabular-nums bg-muted/30 font-medium"
                        value={li.lineAmount.toFixed(2)} readOnly />
                    </td>
                    <td className="py-2 pl-1">
                      {lineItems.length > 1 && (
                        <button onClick={() => setLineItems(p => p.filter((_, i) => i !== idx))}
                          className="p-1.5 rounded hover:bg-red-950/40 text-muted-foreground hover:text-red-400 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Notes */}
          <Card className="p-5">
            <label className="text-xs text-muted-foreground mb-2 block">Notes / Remarks (Optional)</label>
            <textarea
              className="w-full h-20 bg-background border border-input rounded-md px-3 py-2 text-sm placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="e.g. Rate difference per revised price list, customer approval ref #XYZ"
              value={notes} onChange={e => setNotes(e.target.value)} />
          </Card>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <Card className="p-5 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Summary</p>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Taxable Amount</span>
                <span className="tabular-nums font-medium">{fmt(taxableAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">CGST @ {gstRate / 2}%</span>
                <span className="tabular-nums text-amber-400">{fmt(cgst)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">SGST @ {gstRate / 2}%</span>
                <span className="tabular-nums text-amber-400">{fmt(sgst)}</span>
              </div>
              <div className="border-t border-border pt-2.5 flex justify-between font-bold">
                <span>Credit Note Total</span>
                <span className={`tabular-nums text-lg ${exceedsBalance ? "text-red-400" : "text-purple-400"}`}>
                  {fmt(totalAmount)}
                </span>
              </div>
              {selectedInvoice && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Balance after this</span>
                  <span className={`tabular-nums font-medium ${remainingBalance - totalAmount <= 0.01 ? "text-green-400" : ""}`}>
                    {fmt(Math.max(0, remainingBalance - totalAmount))}
                  </span>
                </div>
              )}
            </div>

            {exceedsBalance && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg border border-red-700/40 bg-red-950/20 text-xs text-red-300">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                Exceeds remaining balance of {fmt(remainingBalance)}
              </div>
            )}

            {!savedCN ? (
              <button onClick={handleSave} disabled={!canSave}
                className="w-full flex items-center justify-center gap-2 h-10 rounded-lg bg-purple-700 text-white text-sm font-semibold hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors mt-2">
                {saving
                  ? <><RefreshCw className="h-4 w-4 animate-spin" /> Saving…</>
                  : <><Check className="h-4 w-4" /> Issue Credit Note</>}
              </button>
            ) : (
              <div className="space-y-2 pt-1">
                <button onClick={handlePrint}
                  className="w-full flex items-center justify-center gap-2 h-10 rounded-lg bg-blue-700 text-white text-sm font-semibold hover:bg-blue-600 transition-colors">
                  <Printer className="h-4 w-4" /> Print / Save PDF
                </button>
                <button onClick={() => setShowPreview(v => !v)}
                  className="w-full flex items-center justify-center gap-2 h-9 rounded-lg border border-border text-sm hover:bg-muted transition-colors">
                  {showPreview ? <><EyeOff className="h-4 w-4" /> Hide Preview</> : <><Eye className="h-4 w-4" /> Show Preview</>}
                </button>
                <button onClick={() => navigate(`/invoices/${encodeURIComponent(savedCN.invoiceNo)}`)}
                  className="w-full h-9 rounded-lg border border-border text-sm hover:bg-muted transition-colors">
                  View Invoice →
                </button>
              </div>
            )}
            <button onClick={() => navigate("/invoices/credit-notes")}
              className="w-full h-9 rounded-lg border border-border text-sm hover:bg-muted transition-colors">
              {savedCN ? "Back to Credit Notes" : "Cancel"}
            </button>
          </Card>

          <div className="p-3.5 rounded-xl border border-purple-700/20 bg-purple-950/10 text-xs text-purple-300 space-y-1">
            <p className="font-semibold text-purple-200">Accounting Note</p>
            <p>Credit notes reduce the invoice balance as an <strong>adjustment</strong>, not a payment.</p>
            <p className="mt-1 font-mono text-purple-400/80">Balance = Total − Payments − Credit Notes</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateCreditNote;
