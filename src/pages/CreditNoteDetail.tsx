/**
 * CreditNoteDetail.tsx
 *
 * Full-page credit note detail view.
 * Matches InvoiceDetail.tsx style exactly:
 * - Header with back, CN number, print/PDF buttons
 * - Left: meta cards + line items table
 * - Right sidebar: financial summary + linked invoice link
 * - Print uses same visibility CSS as invoiceConstants.tsx
 */

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getAllCreditNotes, deleteCreditNote, CreditNote } from "@/data/creditNoteStore";
import { getAllInvoices } from "@/data/invoiceStore";
import {
  COMPANY, fmtDate, fmtNum, numberToWords,
} from "@/lib/invoiceConstants";
import {
  ArrowLeft, Printer, Download, ExternalLink,
  XCircle, Trash2, ReceiptText, RefreshCw,
} from "lucide-react";
import { Card } from "@/components/ui/card";

// ── Helpers ────────────────────────────────────────────────────
const fmt = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const REASON_COLORS: Record<string, string> = {
  "Rate Difference":     "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "Goods Return":        "bg-red-500/20 text-red-400 border-red-500/30",
  "Discount Adjustment": "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "Quantity Difference": "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "Quality Issue":       "bg-pink-500/20 text-pink-400 border-pink-500/30",
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

function handlePrint() {
  if (!document.getElementById("cn-print-style")) {
    const s = document.createElement("style");
    s.id = "cn-print-style";
    s.textContent = CN_PRINT_STYLES;
    document.head.appendChild(s);
  }
  window.print();
}

// ── Print view — matches AHC credit note PDF format ────────────
const CreditNotePrintView = ({ cn, gstin, placeOfSupply }: {
  cn: CreditNote; gstin?: string; placeOfSupply?: string;
}) => {
  const taxTotal = cn.cgst + cn.sgst;
  const rounded  = Math.round(cn.totalAmount);
  const roundOff = parseFloat((rounded - cn.totalAmount).toFixed(2));
  const gstRate  = cn.taxableAmount > 0 ? Math.round((cn.cgst / cn.taxableAmount) * 100) : 9;
  const border   = "1px solid #000";
  const td: React.CSSProperties = { border, padding: "3px 5px", fontSize: "11px", verticalAlign: "top", lineHeight: "1.5" };

  return (
    <div id="cn-print-area" style={{ fontFamily: "Arial, sans-serif", fontSize: "11px", color: "#000", background: "#fff", width: "100%" }}>

      <div style={{ textAlign: "center", fontWeight: "bold", fontSize: "14px", marginBottom: "5px" }}>CREDIT NOTE</div>

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
          <tr>
            <td style={{ ...td, padding: "5px 7px" }}>
              <div style={{ fontSize: "8px" }}>Buyer (Bill to)</div>
              <div style={{ fontWeight: "bold" }}>{cn.customerName}</div>
              {placeOfSupply && <div>Place of Supply: {placeOfSupply}</div>}
              {gstin && <div>GSTIN/UIN &nbsp;&nbsp;: {gstin}</div>}
              <div>State Name &nbsp;&nbsp;: {COMPANY.state}, Code : {COMPANY.stateCode}</div>
            </td>
            <td style={{ ...td, padding: "5px 7px" }}>
              <div style={{ fontSize: "8px" }}>Place of Supply</div>
              <div>{placeOfSupply ?? COMPANY.state} ({COMPANY.stateCode})</div>
            </td>
          </tr>
        </tbody>
      </table>

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
          {Array.from({ length: Math.max(0, 2 - cn.lineItems.length) }).map((_, i) => (
            <tr key={`pad${i}`}>
              {Array.from({ length: 8 }).map((_, j) => (
                <td key={j} style={{ ...td, padding: "8px 5px" }}>&nbsp;</td>
              ))}
            </tr>
          ))}
          <tr>
            <td colSpan={7} style={{ border, textAlign: "right", padding: "3px 5px", fontStyle: "italic" }}>CGST</td>
            <td style={{ ...td, textAlign: "right" }}>{fmtNum(cn.cgst)}</td>
          </tr>
          <tr>
            <td colSpan={7} style={{ border, textAlign: "right", padding: "3px 5px", fontStyle: "italic" }}>SGST</td>
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

// ── Main page ──────────────────────────────────────────────────
const CreditNoteDetail = () => {
  const { cnNumber } = useParams<{ cnNumber: string }>();
  const navigate     = useNavigate();
  const [showPreview, setShowPreview] = useState(false);

  const [cn, setCn] = useState<CreditNote | undefined>(undefined);
  const [linkedInvoice, setLinkedInvoice] = useState<Awaited<ReturnType<typeof getAllInvoices>>[number] | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);

  useEffect(() => {
    const decoded = decodeURIComponent(cnNumber ?? "");
    const found = getAllCreditNotes().find(c => c.creditNoteNumber === decoded);
    setCn(found);
    if (found) {
      getAllInvoices()
        .then(invoices => setLinkedInvoice(invoices.find(inv => inv.invoiceNo === found.invoiceNo) ?? null))
        .catch(err => console.error("[CreditNoteDetail] getAllInvoices failed:", err))
        .finally(() => setDetailLoading(false));
    } else {
      setDetailLoading(false);
    }
  }, [cnNumber]);

  if (detailLoading) return (
    <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground">
      <RefreshCw className="h-5 w-5 animate-spin" />
      <span className="text-sm">Loading credit note…</span>
    </div>
  );

  if (!cn) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <XCircle className="h-8 w-8 text-muted-foreground" />
      <p className="text-muted-foreground">Credit note not found</p>
      <button onClick={() => navigate("/invoices/credit-notes")}
        className="text-sm text-primary hover:underline">← Back to Credit Notes</button>
    </div>
  );

  const reasonCls = REASON_COLORS[cn.reason] ?? REASON_COLORS["Other"];
  const taxTotal  = cn.cgst + cn.sgst;

  return (
    <div className="space-y-5">

      {/* Hidden print target */}
      <div style={{ position: "fixed", left: "-9999px", top: "0", width: "210mm", zIndex: -1 }}>
        <CreditNotePrintView
          cn={cn}
          gstin={linkedInvoice?.gstin}
          placeOfSupply={linkedInvoice?.placeOfSupply}
        />
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
            <h2 className="text-lg font-bold">{cn.creditNoteNumber}</h2>
            <p className="text-xs text-muted-foreground">{fmtDate(cn.date)} · {cn.customerName}</p>
          </div>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${reasonCls}`}>
            {cn.reason}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowPreview(v => !v)}
            className="flex items-center gap-1.5 h-9 px-4 rounded-lg border border-border text-sm hover:bg-muted transition-colors">
            {showPreview ? "Hide Preview" : "Preview"}
          </button>
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 h-9 px-4 rounded-lg border border-border text-sm hover:bg-muted transition-colors">
            <Printer className="h-4 w-4" /> Print
          </button>
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
            <Download className="h-4 w-4" /> Save PDF
          </button>
        </div>
      </div>

      {/* Print preview panel */}
      {showPreview && (
        <div className="rounded-xl border border-border overflow-hidden shadow-xl">
          <div className="flex items-center justify-between px-5 py-2.5 bg-muted/30 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Credit Note Preview</span>
            <div className="flex gap-2">
              <button onClick={handlePrint}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-border hover:bg-muted transition-colors">
                <Printer className="h-3 w-3" /> Print / Save PDF
              </button>
              <button onClick={() => setShowPreview(false)} className="text-muted-foreground hover:text-foreground">
                <XCircle className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="bg-gray-200 p-6 overflow-auto" style={{ maxHeight: "75vh" }}>
            <div className="bg-white shadow-lg mx-auto" style={{ width: "210mm", padding: "8mm 10mm" }}>
              <CreditNotePrintView
                cn={cn}
                gstin={linkedInvoice?.gstin}
                placeOfSupply={linkedInvoice?.placeOfSupply}
              />
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">

          {/* Meta cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-border p-5 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Bill To</p>
              <p className="font-bold text-foreground">{cn.customerName}</p>
              {linkedInvoice?.gstin && <p className="text-xs text-muted-foreground font-mono">{linkedInvoice.gstin}</p>}
              {linkedInvoice?.placeOfSupply && <p className="text-xs text-muted-foreground">{linkedInvoice.placeOfSupply}</p>}
            </div>
            <div className="rounded-xl border border-border p-5 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Credit Note Details</p>
              {[
                ["CN Number",    cn.creditNoteNumber],
                ["Date",         fmtDate(cn.date)],
                ["Reason",       cn.reason],
                ["Invoice Ref",  cn.invoiceNo],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-medium font-mono text-xs">{v}</span>
                </div>
              ))}
              {cn.notes && (
                <div className="flex items-start justify-between text-sm pt-1">
                  <span className="text-muted-foreground">Notes</span>
                  <span className="text-xs text-right max-w-[60%] italic text-muted-foreground">{cn.notes}</span>
                </div>
              )}
            </div>
          </div>

          {/* Line items */}
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-muted/20">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Line Items ({cn.lineItems.length})
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 border-b border-border text-xs">
                    <th className="px-4 py-2.5 text-left text-muted-foreground w-8">#</th>
                    <th className="px-4 py-2.5 text-left text-muted-foreground">Description</th>
                    <th className="px-4 py-2.5 text-right text-muted-foreground">Qty</th>
                    <th className="px-4 py-2.5 text-right text-muted-foreground">Rate (₹)</th>
                    <th className="px-4 py-2.5 text-right text-muted-foreground">Disc%</th>
                    <th className="px-4 py-2.5 text-right text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {cn.lineItems.map((li, i) => (
                    <tr key={i} className="border-t border-border/50 hover:bg-muted/10">
                      <td className="px-4 py-3 text-muted-foreground text-xs">{i + 1}</td>
                      <td className="px-4 py-3 font-medium">{li.description || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{li.quantity}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground text-xs">{fmt(li.rate)}</td>
                      <td className="px-4 py-3 text-right text-amber-400 text-xs">
                        {li.discountPct > 0 ? `${li.discountPct}%` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">{fmt(li.lineAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">

          {/* Financial summary */}
          <div className="rounded-xl border border-border p-5 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Financial Summary</p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Taxable Amount</span>
              <span className="tabular-nums font-medium">{fmt(cn.taxableAmount)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">CGST @ {cn.taxableAmount > 0 ? Math.round((cn.cgst / cn.taxableAmount) * 100) : 9}%</span>
              <span className="tabular-nums font-medium text-amber-400">{fmt(cn.cgst)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">SGST @ {cn.taxableAmount > 0 ? Math.round((cn.sgst / cn.taxableAmount) * 100) : 9}%</span>
              <span className="tabular-nums font-medium text-amber-400">{fmt(cn.sgst)}</span>
            </div>
            <div className="border-t border-border pt-3 flex items-center justify-between">
              <span className="font-bold">Total Credit Note</span>
              <span className="font-bold text-lg tabular-nums text-purple-400">{fmt(cn.totalAmount)}</span>
            </div>
          </div>

          {/* Linked invoice */}
          <div className="rounded-xl border border-border p-5 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Linked Invoice</p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Invoice No.</span>
              <button
                onClick={() => navigate(`/invoices/${encodeURIComponent(cn.invoiceNo)}`)}
                className="flex items-center gap-1 font-mono text-xs text-primary hover:text-primary/80 transition-colors">
                {cn.invoiceNo} <ExternalLink className="h-3 w-3" />
              </button>
            </div>
            {linkedInvoice && (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Invoice Total</span>
                  <span className="tabular-nums font-medium">{fmt(linkedInvoice.totalAmount)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Invoice Date</span>
                  <span className="text-xs">{fmtDate(linkedInvoice.invoiceDate)}</span>
                </div>
              </>
            )}
            <button
              onClick={() => navigate(`/invoices/${encodeURIComponent(cn.invoiceNo)}`)}
              className="w-full flex items-center justify-center gap-2 h-9 rounded-lg border border-border text-sm hover:bg-muted transition-colors mt-1">
              <ExternalLink className="h-4 w-4" /> View Invoice
            </button>
          </div>

          {/* Amount in words */}
          <div className="rounded-xl border border-border p-4">
            <p className="text-xs text-muted-foreground mb-2">Amount in Words</p>
            <p className="text-xs leading-relaxed italic">{numberToWords(cn.totalAmount)}</p>
          </div>

          {/* Accounting note */}
          <div className="p-3.5 rounded-xl border border-purple-700/20 bg-purple-950/10 text-xs text-purple-300 space-y-1">
            <p className="flex items-center gap-1.5 font-semibold text-purple-200">
              <ReceiptText className="h-3.5 w-3.5" /> Accounting Note
            </p>
            <p className="font-mono text-purple-400/80 mt-1">Balance = Total − Payments − Credit Notes</p>
            <p>This CN reduces the linked invoice balance by <strong className="text-purple-200">{fmt(cn.totalAmount)}</strong>.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreditNoteDetail;
