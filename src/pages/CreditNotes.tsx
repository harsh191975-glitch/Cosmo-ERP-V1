/**
 * CreditNotes.tsx
 *
 * Invoice-style list:
 * - Collapsible rows with chevron (click row to expand)
 * - Eye button navigates to linked invoice
 * - Expanded panel: CN meta, line items, GST summary, print button
 * - Delete confirm modal matching invoice pattern
 * - Print uses same visibility CSS as invoiceConstants.tsx
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAllCreditNotes, deleteCreditNote, CreditNote,
} from "@/data/creditNoteStore";
import {
  COMPANY, fmtDate, fmtNum, numberToWords,
} from "@/lib/invoiceConstants";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Search, Plus, ChevronRight, ChevronDown, Eye,
  Trash2, AlertTriangle, X, ReceiptText, TrendingDown,
  FileCheck2, SlidersHorizontal, Printer,
} from "lucide-react";

// ── Helpers ────────────────────────────────────────────────────
const formatCurrency = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

const fmt = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTHS = [
  { value: "01", label: "January" },  { value: "02", label: "February" },
  { value: "03", label: "March" },    { value: "04", label: "April" },
  { value: "05", label: "May" },      { value: "06", label: "June" },
  { value: "07", label: "July" },     { value: "08", label: "August" },
  { value: "09", label: "September" },{ value: "10", label: "October" },
  { value: "11", label: "November" }, { value: "12", label: "December" },
];

const REASON_COLORS: Record<string, string> = {
  "Rate Difference":     "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Goods Return":        "bg-red-500/15 text-red-400 border-red-500/30",
  "Discount Adjustment": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Quantity Difference": "bg-orange-500/15 text-orange-400 border-orange-500/30",
  "Quality Issue":       "bg-pink-500/15 text-pink-400 border-pink-500/30",
  "Other":               "bg-muted/40 text-muted-foreground border-border",
};

// ── Print styles — identical to invoiceConstants pattern ───────
const CN_PRINT_STYLES = `
@media print {
  body * { visibility: hidden !important; }
  #cn-print-area, #cn-print-area * { visibility: visible !important; }
  #cn-print-area {
    position: fixed !important;
    left: 0 !important; top: 0 !important;
    width: 100% !important;
    background: white !important;
    padding: 8mm 10mm !important;
  }
  @page { margin: 0; size: A4 portrait; }
}
`;

function injectPrintStyles() {
  if (!document.getElementById("cn-print-style")) {
    const s = document.createElement("style");
    s.id = "cn-print-style";
    s.textContent = CN_PRINT_STYLES;
    document.head.appendChild(s);
  }
}

// ── Credit Note print view ─────────────────────────────────────
const CreditNotePrintView = ({ cn, customerGstin, customerPlace }: {
  cn: CreditNote; customerGstin?: string; customerPlace?: string;
}) => {
  const taxTotal = cn.cgst + cn.sgst;
  const rounded  = Math.round(cn.totalAmount);
  const roundOff = parseFloat((rounded - cn.totalAmount).toFixed(2));
  const gstRate  = cn.taxableAmount > 0 ? Math.round((cn.cgst / cn.taxableAmount) * 100) : 9;
  const border   = "1px solid #000";
  const td: React.CSSProperties = { border, padding: "3px 5px", fontSize: "11px", verticalAlign: "top", lineHeight: "1.5" };

  return (
    <div id="cn-print-area" style={{ fontFamily: "Arial, sans-serif", fontSize: "11px", color: "#000", background: "#fff", width: "100%" }}>

      {/* Title */}
      <div style={{ textAlign: "center", fontWeight: "bold", fontSize: "14px", marginBottom: "5px" }}>CREDIT NOTE</div>

      {/* Seller + meta */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ ...td, width: "45%", padding: "5px 7px" }}>
              <div style={{ fontWeight: "bold" }}>{COMPANY.name}</div>
              <div>{COMPANY.address}</div>
              <div>{COMPANY.city}</div>
              <div>GSTIN/UIN: {COMPANY.gstin}</div>
              <div>State Name : {COMPANY.state}, Code : {COMPANY.stateCode}</div>
              <div>Contact : {COMPANY.contact}</div>
              <div>E-Mail : {COMPANY.email}</div>
            </td>
            <td style={{ border, width: "55%", padding: 0, verticalAlign: "top" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  <tr>
                    <td style={{ ...td, width: "40%", borderLeft: "none", borderTop: "none" }}>
                      <div style={{ fontSize: "8px" }}>Credit Note No.</div>
                      <div style={{ fontWeight: "bold" }}>{cn.creditNoteNumber}</div>
                    </td>
                    <td style={{ ...td, width: "30%", borderTop: "none" }}>
                      <div style={{ fontSize: "8px" }}>Dated</div>
                      <div style={{ fontWeight: "bold" }}>{fmtDate(cn.date)}</div>
                    </td>
                    <td style={{ ...td, width: "30%", borderTop: "none", borderRight: "none" }}>
                      <div style={{ fontSize: "8px" }}>Reason</div>
                      <div style={{ fontWeight: "bold" }}>{cn.reason}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ ...td, borderLeft: "none" }} colSpan={2}>
                      <div style={{ fontSize: "8px" }}>Original Invoice No. &amp; Date</div>
                      <div style={{ fontWeight: "bold" }}>{cn.invoiceNo}</div>
                    </td>
                    <td style={{ ...td, borderRight: "none" }}>
                      <div style={{ fontSize: "8px" }}>Mode/Terms of Payment</div>
                      <div>&nbsp;</div>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ ...td, borderLeft: "none" }} colSpan={2}>
                      <div style={{ fontSize: "8px" }}>Buyer's Order No.</div>&nbsp;
                    </td>
                    <td style={{ ...td, borderRight: "none" }}>
                      <div style={{ fontSize: "8px" }}>Other References</div>&nbsp;
                    </td>
                  </tr>
                  <tr>
                    <td style={{ ...td, borderLeft: "none", borderBottom: "none" }} colSpan={3}>
                      <div style={{ fontSize: "8px" }}>Terms of Delivery</div>&nbsp;
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
          {/* Buyer */}
          <tr>
            <td style={{ ...td, padding: "5px 7px" }}>
              <div style={{ fontSize: "8px" }}>Buyer (Bill to)</div>
              <div style={{ fontWeight: "bold" }}>{cn.customerName}</div>
              {customerPlace && <div>Place of Supply: {customerPlace}</div>}
              {customerGstin && <div>GSTIN/UIN &nbsp;&nbsp;: {customerGstin}</div>}
              <div>State Name &nbsp;&nbsp;: {COMPANY.state}, Code : {COMPANY.stateCode}</div>
            </td>
            <td style={{ ...td, padding: "5px 7px" }}>
              <div style={{ fontSize: "8px" }}>Place of Supply</div>
              <div>{customerPlace ?? COMPANY.state} ({COMPANY.stateCode})</div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Line items */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Sl No.", "Particulars", "HSN/SAC", "Quantity", "Rate", "per", "Disc.%", "Amount"].map((h, i) => (
              <th key={h} style={{ ...td, fontWeight: "bold", textAlign: i === 1 ? "left" : "center",
                width: ["22px","auto","62px","58px","68px","30px","38px","72px"][i] }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cn.lineItems.map((li, i) => (
            <tr key={i}>
              <td style={{ ...td, textAlign: "center" }}>{i + 1}</td>
              <td style={{ ...td, fontWeight: "bold" }}>{li.description || "—"}</td>
              <td style={{ ...td, textAlign: "center" }}>997113</td>
              <td style={{ ...td, textAlign: "right" }}>{li.quantity > 0 ? li.quantity : ""}</td>
              <td style={{ ...td, textAlign: "right" }}>{li.rate > 0 ? fmtNum(li.rate) : ""}</td>
              <td style={{ ...td, textAlign: "center" }}></td>
              <td style={{ ...td, textAlign: "right" }}>{li.discountPct > 0 ? li.discountPct + "%" : ""}</td>
              <td style={{ ...td, textAlign: "right" }}>{fmtNum(li.lineAmount)}</td>
            </tr>
          ))}
          {/* Padding rows */}
          {Array.from({ length: Math.max(0, 2 - cn.lineItems.length) }).map((_, i) => (
            <tr key={`pad${i}`}>
              {Array.from({ length: 8 }).map((_, j) => (
                <td key={j} style={{ ...td, padding: "8px 5px" }}>&nbsp;</td>
              ))}
            </tr>
          ))}
          <tr>
            <td colSpan={7} style={{ border, textAlign: "right", padding: "3px 5px", fontSize: "11px", fontStyle: "italic" }}>CGST</td>
            <td style={{ ...td, textAlign: "right" }}>{fmtNum(cn.cgst)}</td>
          </tr>
          <tr>
            <td colSpan={7} style={{ border, textAlign: "right", padding: "3px 5px", fontSize: "11px", fontStyle: "italic" }}>SGST</td>
            <td style={{ ...td, textAlign: "right" }}>{fmtNum(cn.sgst)}</td>
          </tr>
          {Math.abs(roundOff) >= 0.01 && (
            <tr>
              <td colSpan={6} style={{ border, textAlign: "right", padding: "3px 5px", fontSize: "10px", fontStyle: "italic" }}>Less :</td>
              <td colSpan={1} style={{ border, textAlign: "right", padding: "3px 5px", fontSize: "10px", fontStyle: "italic" }}>ROUND OFF</td>
              <td style={{ ...td, textAlign: "right" }}>(-){Math.abs(roundOff).toFixed(2)}</td>
            </tr>
          )}
          <tr>
            <td style={{ border }}></td>
            <td style={{ ...td, fontWeight: "bold" }}>Total</td>
            <td style={{ border }}></td>
            <td style={{ border }}></td>
            <td colSpan={3} style={{ border }}></td>
            <td style={{ ...td, textAlign: "right", fontWeight: "bold" }}>&#x20B9; {fmtNum(rounded)}</td>
          </tr>
        </tbody>
      </table>

      {/* Amount in words */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ ...td, padding: "3px 7px" }}>
              <span style={{ fontWeight: "bold" }}>Amount Chargeable (in words)</span>
              <span style={{ float: "right", fontStyle: "italic" }}>E. &amp; O E</span>
              <div style={{ fontWeight: "bold", marginTop: "2px" }}>{numberToWords(rounded)}</div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* HSN/GST summary */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...td, fontWeight: "bold", textAlign: "left" }}>HSN/SAC</th>
            <th style={{ ...td, fontWeight: "bold", textAlign: "right" }}>Total Taxable<br />Value</th>
            <th style={{ ...td, fontWeight: "bold", textAlign: "center" }} colSpan={2}>CGST</th>
            <th style={{ ...td, fontWeight: "bold", textAlign: "center" }} colSpan={2}>SGST/UTGST</th>
            <th style={{ ...td, fontWeight: "bold", textAlign: "right" }}>Total Tax Amount</th>
          </tr>
          <tr>
            <th style={{ ...td, fontWeight: "bold" }}></th>
            <th style={{ ...td, fontWeight: "bold" }}></th>
            <th style={{ ...td, fontWeight: "bold", textAlign: "center" }}>Rate</th>
            <th style={{ ...td, fontWeight: "bold", textAlign: "right" }}>Amount</th>
            <th style={{ ...td, fontWeight: "bold", textAlign: "center" }}>Rate</th>
            <th style={{ ...td, fontWeight: "bold", textAlign: "right" }}>Amount</th>
            <th style={{ ...td, fontWeight: "bold" }}></th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={td}>997113</td>
            <td style={{ ...td, textAlign: "right" }}>{fmtNum(cn.taxableAmount)}</td>
            <td style={{ ...td, textAlign: "center" }}>{gstRate}%</td>
            <td style={{ ...td, textAlign: "right" }}>{fmtNum(cn.cgst)}</td>
            <td style={{ ...td, textAlign: "center" }}>{gstRate}%</td>
            <td style={{ ...td, textAlign: "right" }}>{fmtNum(cn.sgst)}</td>
            <td style={{ ...td, textAlign: "right" }}>{fmtNum(taxTotal)}</td>
          </tr>
          <tr>
            <td style={{ ...td, fontWeight: "bold", textAlign: "right" }}>Total</td>
            <td style={{ ...td, fontWeight: "bold", textAlign: "right" }}>{fmtNum(cn.taxableAmount)}</td>
            <td style={{ border }}></td>
            <td style={{ ...td, fontWeight: "bold", textAlign: "right" }}>{fmtNum(cn.cgst)}</td>
            <td style={{ border }}></td>
            <td style={{ ...td, fontWeight: "bold", textAlign: "right" }}>{fmtNum(cn.sgst)}</td>
            <td style={{ ...td, fontWeight: "bold", textAlign: "right" }}>{fmtNum(taxTotal)}</td>
          </tr>
        </tbody>
      </table>

      {/* Tax in words */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ ...td, padding: "3px 7px" }}>
              <span style={{ fontWeight: "bold" }}>Tax Amount (in words) : </span>
              <span style={{ fontStyle: "italic" }}>{numberToWords(taxTotal)}</span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Bank + signature */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ ...td, width: "50%", padding: "5px 7px" }}>
              <div style={{ fontWeight: "bold", marginBottom: "3px" }}>Company's Bank Details</div>
              <table style={{ borderCollapse: "collapse", fontSize: "11px" }}>
                <tbody>
                  <tr><td style={{ paddingRight: "4px" }}>A/c Holder's Name</td><td style={{ paddingRight: "6px" }}>:</td><td><strong>{COMPANY.bank.accountName}</strong></td></tr>
                  <tr><td>Bank Name</td><td style={{ paddingRight: "6px" }}>:</td><td>{COMPANY.bank.bankName}</td></tr>
                  <tr><td>A/c No.</td><td style={{ paddingRight: "6px" }}>:</td><td>{COMPANY.bank.accountNo}</td></tr>
                  <tr><td>Branch &amp; IFS Code</td><td style={{ paddingRight: "6px" }}>:</td><td>{COMPANY.bank.branch} &amp; {COMPANY.bank.ifsc}</td></tr>
                </tbody>
              </table>
            </td>
            <td style={{ ...td, width: "50%", padding: "5px 7px" }}>
              <div style={{ marginTop: "10px", textAlign: "right" }}>for <strong>{COMPANY.name}</strong></div>
              <div style={{ marginTop: "28px", textAlign: "right" }}>Authorised Signatory</div>
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ textAlign: "center", fontSize: "10px", marginTop: "4px" }}>
        This is a Computer Generated Document
      </div>
    </div>
  );
};

// ── Delete Confirm Modal — same pattern as invoice ─────────────
const DeleteModal = ({ cn, confirmText, onConfirmChange, onDelete, onClose }: {
  cn: CreditNote | null;
  confirmText: string;
  onConfirmChange: (v: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) => {
  if (!cn) return null;
  const matches = confirmText.trim() === cn.creditNoteNumber;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        <div className="h-0.5 w-full bg-gradient-to-r from-red-700 via-red-500 to-red-700" />
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <p className="font-semibold text-sm">Delete Credit Note</p>
              <p className="text-xs text-muted-foreground">This cannot be undone</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mx-6 mb-4 rounded-xl border border-red-500/20 bg-red-950/20 px-4 py-3 flex items-center justify-between">
          <div>
            <p className="font-mono text-xs text-red-400 font-semibold">{cn.creditNoteNumber}</p>
            <p className="text-sm font-medium text-foreground mt-0.5">{cn.customerName}</p>
          </div>
          <p className="text-sm font-bold">{fmt(cn.totalAmount)}</p>
        </div>
        <div className="px-6 pb-3 space-y-3">
          <p className="text-sm text-muted-foreground">Type the credit note number to confirm deletion:</p>
          <code className="block text-xs font-mono bg-muted/60 px-3 py-2 rounded-lg w-fit select-all">{cn.creditNoteNumber}</code>
          <input
            autoFocus type="text" value={confirmText}
            onChange={e => onConfirmChange(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && matches) onDelete(); if (e.key === "Escape") onClose(); }}
            placeholder="Type credit note number…"
            className={`w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono outline-none transition-colors placeholder:text-muted-foreground/40
              ${confirmText.length === 0 ? "border-border"
                : matches ? "border-emerald-500/50"
                : "border-red-500/40"}`}
          />
          {confirmText.length > 0 && (
            <p className={`text-xs flex items-center gap-1 ${matches ? "text-emerald-400" : "text-red-400"}`}>
              {matches ? "✓ Confirmed" : <><X className="h-3 w-3" /> Doesn't match</>}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-border hover:bg-muted text-muted-foreground">Cancel</button>
          <button onClick={onDelete} disabled={!matches}
            className="px-4 py-2 rounded-lg text-sm bg-red-600 hover:bg-red-700 text-white font-medium flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
            <Trash2 className="h-3.5 w-3.5" /> Delete Forever
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────
const CreditNotesTab = () => {
  const navigate = useNavigate();
  const [search,       setSearch]       = useState("");
  const [month,        setMonth]        = useState("all");
  const [reasonFilter, setReasonFilter] = useState("all");
  const [expandedRow,  setExpandedRow]  = useState<string | null>(null);
  const [printCN,      setPrintCN]      = useState<CreditNote | null>(null);
  const [loading,      setLoading]      = useState(true);

  // Delete state
  const [deleteTarget,  setDeleteTarget]  = useState<CreditNote | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  // Async cloud data
  const [allCreditNotes, setAllCreditNotes] = useState<CreditNote[]>([]);

  const loadCreditNotes = useCallback(async () => {
    setLoading(true);
    try {
      const notes = await getAllCreditNotes();
      setAllCreditNotes(notes);
    } catch (err) {
      console.error("[CreditNotes] load failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCreditNotes(); }, [loadCreditNotes]);

  const reasons = useMemo(() =>
    [...new Set(allCreditNotes.map(cn => cn.reason))].sort(),
  [allCreditNotes]);

  const filtered = useMemo(() => allCreditNotes.filter(cn => {
    if (month        !== "all" && cn.date.slice(5, 7) !== month)  return false;
    if (reasonFilter !== "all" && cn.reason !== reasonFilter)      return false;
    if (search) {
      const q = search.toLowerCase();
      if (!cn.creditNoteNumber.toLowerCase().includes(q) &&
          !cn.customerName.toLowerCase().includes(q) &&
          !cn.invoiceNo.toLowerCase().includes(q) &&
          !cn.reason.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [allCreditNotes, month, reasonFilter, search]);

  // KPIs
  const totalIssued = allCreditNotes.length;
  const totalValue  = allCreditNotes.reduce((s, cn) => s + cn.totalAmount, 0);
  const uniqueInvs  = new Set(allCreditNotes.map(cn => cn.invoiceNo)).size;
  const filteredAmt = filtered.reduce((s, cn) => s + cn.totalAmount, 0);

  const handlePrint = (cn: CreditNote) => {
    setPrintCN(cn);
    injectPrintStyles();
    // Allow React to render the print node, then print
    setTimeout(() => window.print(), 80);
  };

  const handleDeleteConfirm = async () => {
    if (deleteTarget && deleteConfirm.trim() === deleteTarget.creditNoteNumber) {
      try {
        await deleteCreditNote(deleteTarget.creditNoteNumber);
      } catch (err) {
        console.error("[CreditNotes] delete failed:", err);
      }
      setDeleteTarget(null);
      setDeleteConfirm("");
      await loadCreditNotes();
    }
  };

  return (
    <div className="space-y-5">

      {/* Hidden print node */}
      {printCN && (
        <div style={{ position: "fixed", left: "-9999px", top: "0", width: "210mm", zIndex: -1 }}>
          <CreditNotePrintView cn={printCN} />
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10">
            <ReceiptText className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Issued</p>
            <p className="text-xl font-bold">{totalIssued}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10">
            <TrendingDown className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Value</p>
            <p className="text-xl font-bold text-red-400">{fmt(totalValue)}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
            <FileCheck2 className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Linked Invoices</p>
            <p className="text-xl font-bold">{uniqueInvs}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
            <SlidersHorizontal className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Filtered Value</p>
            <p className="text-xl font-bold text-amber-400">{fmt(filteredAmt)}</p>
          </div>
        </Card>
      </div>

      {/* Filters + New button */}
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-8 h-9 text-sm" placeholder="Search by CN#, invoice, customer…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="h-9 text-xs w-36"><SelectValue placeholder="Month" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              {MONTHS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={reasonFilter} onValueChange={setReasonFilter}>
            <SelectTrigger className="h-9 text-xs w-44"><SelectValue placeholder="Reason" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Reasons</SelectItem>
              {reasons.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <button
            onClick={() => navigate("/invoices/credit-notes/create")}
            className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-purple-700 text-white text-sm font-medium hover:bg-purple-600 transition-colors">
            <Plus className="h-4 w-4" /> New Credit Note
          </button>
        </div>
      </Card>

      {/* Table */}
      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/15">
          <p className="text-xs text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{filtered.length}</span> of {allCreditNotes.length} credit notes
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/25">
                <th className="px-2 py-3 w-8" />
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">CN Number</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Linked Invoice</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Reason</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Taxable</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Tax (GST)</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Total</th>
                <th className="px-3 py-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                      <p className="text-sm">Loading credit notes…</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center">
                    <ReceiptText className="h-8 w-8 text-muted-foreground/25 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {allCreditNotes.length === 0 ? "No credit notes yet" : "No credit notes match your filters"}
                    </p>
                    {allCreditNotes.length === 0 && (
                      <button onClick={() => navigate("/invoices/credit-notes/create")}
                        className="mt-2 text-xs text-purple-400 hover:underline">
                        + Create first credit note
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map(cn => {
                  const reasonCls = REASON_COLORS[cn.reason] ?? REASON_COLORS["Other"];
                  const isExpanded = expandedRow === cn.creditNoteNumber;

                  return (
                    <React.Fragment key={cn.creditNoteNumber}>
                      {/* Main row */}
                      <tr
                        className="border-t border-border/50 hover:bg-muted/20 transition-colors cursor-pointer group"
                        onClick={() => setExpandedRow(isExpanded ? null : cn.creditNoteNumber)}>
                        <td className="px-2 py-3 text-muted-foreground">
                          {isExpanded
                            ? <ChevronDown className="h-4 w-4 text-purple-400" />
                            : <ChevronRight className="h-4 w-4 group-hover:text-foreground transition-colors" />}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-semibold text-purple-400">{cn.creditNoteNumber}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(cn.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </td>
                        <td className="px-4 py-3 font-medium text-sm">{cn.customerName}</td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-muted-foreground">{cn.invoiceNo}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${reasonCls}`}>
                            {cn.reason}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-sm">{fmt(cn.taxableAmount)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs text-amber-400">{fmt(cn.cgst + cn.sgst)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-red-400">{fmt(cn.totalAmount)}</td>

                        {/* Hover actions — eye expands row, trash deletes */}
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => navigate(`/invoices/credit-notes/${encodeURIComponent(cn.creditNoteNumber)}`)}
                              title="View credit note details"
                              className="p-1.5 rounded-lg hover:bg-primary/15 text-muted-foreground hover:text-primary transition-colors">
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => { setDeleteTarget(cn); setDeleteConfirm(""); }}
                              title="Delete credit note"
                              className="p-1.5 rounded-lg hover:bg-red-500/15 text-muted-foreground hover:text-red-400 transition-colors">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded detail panel */}
                      {isExpanded && (
                        <tr className="border-t border-border/30 bg-muted/8">
                          <td colSpan={10} className="px-8 py-5">

                            {/* Meta summary chips */}
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
                              {[
                                ["CN Number",      <span className="font-mono text-xs">{cn.creditNoteNumber}</span>],
                                ["Taxable Amount", <span className="font-semibold">{fmt(cn.taxableAmount)}</span>],
                                ["CGST",           <span className="font-semibold text-amber-400">{fmt(cn.cgst)}</span>],
                                ["SGST",           <span className="font-semibold text-amber-400">{fmt(cn.sgst)}</span>],
                                ["Total Amount",   <span className="font-semibold text-red-400">{fmt(cn.totalAmount)}</span>],
                              ].map(([label, val], i) => (
                                <div key={i} className="rounded-lg bg-muted/30 border border-border/40 px-3 py-2.5">
                                  <p className="text-xs text-muted-foreground mb-1">{label as string}</p>
                                  <div className="text-sm">{val as React.ReactNode}</div>
                                </div>
                              ))}
                            </div>

                            {/* Line items */}
                            <div className="mb-4">
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                Line Items ({cn.lineItems.length})
                              </p>
                              <div className="rounded-lg border border-border/40 overflow-hidden">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="bg-muted/40 border-b border-border/40">
                                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Description</th>
                                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Qty</th>
                                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Rate</th>
                                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Disc%</th>
                                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {cn.lineItems.map((li, i) => (
                                      <tr key={i} className="border-t border-border/30 hover:bg-muted/20">
                                        <td className="px-3 py-2 font-medium">{li.description || "—"}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{li.quantity}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{fmt(li.rate)}</td>
                                        <td className="px-3 py-2 text-right text-amber-500">{li.discountPct > 0 ? `${li.discountPct}%` : "—"}</td>
                                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmt(li.lineAmount)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            {/* Notes */}
                            {cn.notes && (
                              <div className="mb-4 p-3 rounded-lg bg-muted/20 border border-border/40 text-xs text-muted-foreground">
                                <span className="font-semibold text-foreground">Notes: </span>{cn.notes}
                              </div>
                            )}

                            {/* Actions footer */}
                            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border/30">
                              <button
                                onClick={() => navigate(`/invoices/${encodeURIComponent(cn.invoiceNo)}`)}
                                className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs hover:bg-muted transition-colors">
                                <Eye className="h-3.5 w-3.5" /> View Linked Invoice
                              </button>
                              <button
                                onClick={() => handlePrint(cn)}
                                className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-blue-700/20 border border-blue-700/30 text-blue-400 text-xs hover:bg-blue-700/30 transition-colors">
                                <Printer className="h-3.5 w-3.5" /> Print Credit Note
                              </button>
                              <button
                                onClick={() => navigate(`/invoices/credit-notes/create?invoiceNo=${encodeURIComponent(cn.invoiceNo)}`)}
                                className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-purple-700/20 border border-purple-700/30 text-purple-400 text-xs hover:bg-purple-700/30 transition-colors">
                                <ReceiptText className="h-3.5 w-3.5" /> New CN for same Invoice
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}

              {/* Totals row */}
              {filtered.length > 0 && (
                <tr className="border-t-2 border-border bg-muted/25">
                  <td colSpan={6} className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Totals ({filtered.length})
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-sm">
                    {fmt(filtered.reduce((s, cn) => s + cn.taxableAmount, 0))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-sm text-amber-400">
                    {fmt(filtered.reduce((s, cn) => s + cn.cgst + cn.sgst, 0))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-sm text-red-400">
                    {fmt(filteredAmt)}
                  </td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Delete modal */}
      <DeleteModal
        cn={deleteTarget}
        confirmText={deleteConfirm}
        onConfirmChange={setDeleteConfirm}
        onDelete={handleDeleteConfirm}
        onClose={() => { setDeleteTarget(null); setDeleteConfirm(""); }}
      />
    </div>
  );
};

export default CreditNotesTab;
