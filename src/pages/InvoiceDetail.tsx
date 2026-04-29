import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getInvoiceByNo, getInvoiceStats, savePayment, deletePayment,
  Invoice, Payment, InvoiceStats,
} from "@/data/invoiceStore";
import {
  getCreditNotesForInvoice, deleteCreditNote, CreditNote,
} from "@/data/creditNoteStore";
import {
  ArrowLeft, Printer, Download, CheckCircle, Clock,
  AlertCircle, XCircle, Plus, Trash2, RefreshCw, Check, ReceiptText,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { fmtDate, PRINT_STYLES, InvoicePrintView, PrintInvoice, numberToWords } from "@/lib/invoiceConstants";

const fmt = (n: number) =>
  "₹" + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type InvoiceStatus = "Paid" | "Partial" | "Overdue" | "Pending";

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; color: string; bg: string; icon: any }> = {
  Paid:    { label: "Paid",    color: "text-green-400",  bg: "bg-green-950/60 border-green-700/40",  icon: CheckCircle },
  Partial: { label: "Partial", color: "text-amber-400",  bg: "bg-amber-950/60 border-amber-700/40",  icon: Clock       },
  Overdue: { label: "Overdue", color: "text-red-400",    bg: "bg-red-950/60 border-red-700/40",      icon: AlertCircle },
  Pending: { label: "Pending", color: "text-blue-400",   bg: "bg-blue-950/60 border-blue-700/40",    icon: Clock       },
};

const PAYMENT_METHODS = ["NEFT", "RTGS", "IMPS", "UPI", "Cheque", "Cash", "Transfer", "CLG", "Other"];

// ── Default stats — prevents null checks everywhere ───────────────────────────
const DEFAULT_STATS: InvoiceStats = {
  totalPaid: 0, totalCreditNotes: 0, outstanding: 0,
  status: "Pending", invoicePayments: [],
};

const InvoiceDetail = () => {
  const { invoiceNo } = useParams<{ invoiceNo: string }>();
  const navigate      = useNavigate();

  // ── Async data state ──────────────────────────────────────────
  const [invoice,     setInvoice]     = useState<Invoice | null>(null);
  const [stats,       setStats]       = useState<InvoiceStats>(DEFAULT_STATS);
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [loadError,   setLoadError]   = useState<string | null>(null);

  // ── UI state ──────────────────────────────────────────────────
  const [showPreview, setShowPreview] = useState(false);
  const [showPayForm, setShowPayForm] = useState(false);
  const [savingPay,   setSavingPay]   = useState(false);
  const [payError,    setPayError]    = useState<string | null>(null);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);
  const [deletingCN,  setDeletingCN]  = useState<string | null>(null);

  const [payForm, setPayForm] = useState({
    amountPaid:    "",
    paymentDate:   new Date().toISOString().split("T")[0],
    paymentMethod: "NEFT",
    reference:     "",
    notes:         "",
  });

  // ── Fetch invoice + stats + credit notes ──────────────────────
  const decodedNo = decodeURIComponent(invoiceNo ?? "");

  const fetchAll = useCallback(async () => {
    if (!decodedNo) return;
    setLoading(true);
    setLoadError(null);
    try {
      const inv = await getInvoiceByNo(decodedNo);
      if (!inv) { setLoadError("not_found"); setLoading(false); return; }

      const [invoiceStats, cns] = await Promise.all([
        getInvoiceStats(inv.invoiceNo, inv.totalAmount, inv.invoiceDate),
        Promise.resolve(getCreditNotesForInvoice(inv.invoiceNo)),
      ]);

      setInvoice(inv);
      setStats(invoiceStats);
      setCreditNotes(cns);
    } catch (err) {
      console.error("[InvoiceDetail] fetchAll:", err);
      setLoadError("fetch_error");
    } finally {
      setLoading(false);
    }
  }, [decodedNo]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Handlers ──────────────────────────────────────────────────

  const handlePrint = () => {
    if (!document.getElementById("invoice-print-style")) {
      const s = document.createElement("style");
      s.id = "invoice-print-style";
      s.textContent = PRINT_STYLES;
      document.head.appendChild(s);
    }
    window.print();
  };

  const handleMarkPaid = async () => {
    if (!invoice) return;
    const amount = parseFloat(payForm.amountPaid);
    if (!amount || amount <= 0) return;

    setSavingPay(true);
    setPayError(null);
    try {
      await savePayment({
        invoiceNo:     invoice.invoiceNo,
        customerName:  invoice.customerName,
        amountPaid:    amount,
        paymentDate:   payForm.paymentDate,
        paymentMethod: payForm.paymentMethod,
        reference:     payForm.reference,
        notes:         payForm.notes || undefined,
      });
      setPayForm({
        amountPaid: "", paymentDate: new Date().toISOString().split("T")[0],
        paymentMethod: "NEFT", reference: "", notes: "",
      });
      setShowPayForm(false);
      await fetchAll();      // re-fetch stats so balance updates immediately
    } catch (err) {
      console.error("[InvoiceDetail] savePayment:", err);
      setPayError("Failed to save payment. Please try again.");
    } finally {
      setSavingPay(false);
    }
  };

  const handleDeletePayment = async (id: string) => {
    if (!confirm("Delete this payment? This will update the outstanding balance.")) return;
    setDeletingId(id);
    try {
      await deletePayment(id);
      await fetchAll();
    } catch (err) {
      console.error("[InvoiceDetail] deletePayment:", err);
      alert("Failed to delete payment. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteCreditNote = async (cn: CreditNote) => {
    if (!confirm(`Delete credit note ${cn.creditNoteNumber}? The invoice balance will increase by ${fmt(cn.totalAmount)}.`)) return;
    setDeletingCN(cn.creditNoteNumber);
    try {
      await deleteCreditNote(cn.creditNoteNumber);
      await fetchAll();
    } catch (err) {
      console.error("[InvoiceDetail] deleteCreditNote:", err);
      alert("Failed to delete credit note.");
    } finally {
      setDeletingCN(null);
    }
  };

  // ── Loading state ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <RefreshCw className="h-6 w-6 text-muted-foreground animate-spin" />
        <p className="text-sm text-muted-foreground">Loading invoice…</p>
      </div>
    );
  }

  // ── Error / not found ─────────────────────────────────────────
  if (loadError === "not_found" || !invoice) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <XCircle className="h-8 w-8 text-muted-foreground" />
        <p className="text-muted-foreground">Invoice not found</p>
        <button onClick={() => navigate("/invoices")} className="text-sm text-primary hover:underline">← Back to Invoices</button>
      </div>
    );
  }

  if (loadError === "fetch_error") {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle className="h-8 w-8 text-red-400" />
        <p className="text-sm text-red-400">Failed to load invoice data</p>
        <button onClick={fetchAll} className="text-xs px-4 py-2 rounded-lg bg-muted border border-border hover:bg-muted/80 transition-colors">Retry</button>
        <button onClick={() => navigate("/invoices")} className="text-xs text-muted-foreground hover:underline">← Back</button>
      </div>
    );
  }

  const statusCfg    = STATUS_CONFIG[stats.status];
  const StatusIcon   = statusCfg.icon;
  const canAddPayment    = stats.outstanding > 0;
  const canAddCreditNote = stats.outstanding > 0;

  return (
    <div className="space-y-5">
      {/* Print target */}
      <div style={{ position: "fixed", left: "-9999px", top: "0", width: "210mm", zIndex: -1 }}>
        <InvoicePrintView invoice={invoice as PrintInvoice} />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/invoices")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="w-px h-5 bg-border" />
          <div>
            <h2 className="text-lg font-bold">{invoice.invoiceNo}</h2>
            <p className="text-xs text-muted-foreground">{fmtDate(invoice.invoiceDate)} · {invoice.customerName}</p>
          </div>
          <span className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border ${statusCfg.bg} ${statusCfg.color}`}>
            <StatusIcon className="h-3 w-3" />{statusCfg.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowPreview(v => !v)}
            className="flex items-center gap-1.5 h-9 px-4 rounded-lg border border-border text-sm hover:bg-muted transition-colors">
            {showPreview ? "Hide" : "Preview"}
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

      {/* Record Payment Form */}
      {showPayForm && (
        <Card className="p-5 border-green-700/30 bg-green-950/10">
          <p className="text-sm font-semibold mb-4">
            Record Payment — Outstanding: <span className="text-red-400">{fmt(stats.outstanding)}</span>
          </p>
          {payError && (
            <p className="text-xs text-red-400 mb-3 flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" />{payError}
            </p>
          )}
          <div className="grid grid-cols-5 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Amount (₹) *</label>
              <Input className="h-9 text-sm" type="number" min="0" max={stats.outstanding}
                placeholder={stats.outstanding.toFixed(2)}
                value={payForm.amountPaid}
                onChange={e => setPayForm(f => ({ ...f, amountPaid: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Date *</label>
              <Input className="h-9 text-sm" type="date"
                value={payForm.paymentDate}
                onChange={e => setPayForm(f => ({ ...f, paymentDate: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Method</label>
              <Select value={payForm.paymentMethod} onValueChange={v => setPayForm(f => ({ ...f, paymentMethod: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Reference No.</label>
              <Input className="h-9 text-sm font-mono" placeholder="e.g. V509573"
                value={payForm.reference}
                onChange={e => setPayForm(f => ({ ...f, reference: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Notes</label>
              <Input className="h-9 text-sm" placeholder="Optional"
                value={payForm.notes}
                onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => setPayForm(f => ({ ...f, amountPaid: stats.outstanding.toFixed(2) }))}
              className="text-xs px-3 py-1.5 rounded border border-green-700/40 text-green-400 hover:bg-green-950/40 transition-colors">
              Full Amount ({fmt(stats.outstanding)})
            </button>
            <div className="flex-1" />
            <button onClick={() => { setShowPayForm(false); setPayError(null); }}
              className="h-9 px-4 rounded-lg border border-border text-sm hover:bg-muted transition-colors">
              Cancel
            </button>
            <button
              disabled={savingPay || !payForm.amountPaid || parseFloat(payForm.amountPaid) <= 0}
              onClick={handleMarkPaid}
              className="flex items-center gap-2 h-9 px-5 rounded-lg bg-green-700 text-white text-sm font-semibold hover:bg-green-600 disabled:opacity-40 transition-colors">
              {savingPay
                ? <><RefreshCw className="h-4 w-4 animate-spin" />Saving…</>
                : <><Check className="h-4 w-4" />Save Payment</>}
            </button>
          </div>
        </Card>
      )}

      {/* Tally Preview */}
      {showPreview && (
        <div className="rounded-xl border border-border overflow-hidden shadow-xl">
          <div className="flex items-center justify-between px-5 py-2.5 bg-muted/30 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Print Preview</span>
            <div className="flex gap-2">
              <button onClick={handlePrint} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-border hover:bg-muted transition-colors">
                <Printer className="h-3 w-3" /> Print / Save PDF
              </button>
              <button onClick={() => setShowPreview(false)} className="text-muted-foreground hover:text-foreground">
                <XCircle className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="bg-gray-200 p-6 overflow-auto" style={{ maxHeight: "75vh" }}>
            <div className="bg-white shadow-lg mx-auto" style={{ width: "210mm", minHeight: "297mm", padding: "10mm 12mm" }}>
              <InvoicePrintView invoice={invoice as PrintInvoice} />
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">

          {/* Customer + Invoice meta */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-border p-5 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Bill To</p>
              <p className="font-bold text-foreground">{invoice.customerName}</p>
              <p className="text-xs text-muted-foreground font-mono">{invoice.gstin}</p>
              <p className="text-xs text-muted-foreground">{invoice.placeOfSupply}</p>
            </div>
            <div className="rounded-xl border border-border p-5 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Invoice Details</p>
              {[
                ["Invoice No.",  invoice.invoiceNo],
                ["Date",         fmtDate(invoice.invoiceDate)],
                ["e-Way Bill",   invoice.eWayBillNo        ?? "—"],
                ["Destination",  invoice.destination       ?? "—"],
                ["Transport",    invoice.dispatchedThrough ?? "—"],
                ...(invoice.bookedBy ? [["Booked By", invoice.bookedBy]] : []),
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-medium font-mono text-xs">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Line Items */}
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-muted/20">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Line Items ({invoice.lineItems.length})</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 border-b border-border text-xs">
                    <th className="px-4 py-2.5 text-left text-muted-foreground w-8">#</th>
                    <th className="px-4 py-2.5 text-left text-muted-foreground">Product</th>
                    <th className="px-4 py-2.5 text-center text-muted-foreground">UOM</th>
                    <th className="px-4 py-2.5 text-right text-muted-foreground">Qty</th>
                    <th className="px-4 py-2.5 text-right text-muted-foreground">Rate (Excl.)</th>
                    <th className="px-4 py-2.5 text-right text-muted-foreground">Rate (Incl.)</th>
                    <th className="px-4 py-2.5 text-right text-muted-foreground">Disc%</th>
                    <th className="px-4 py-2.5 text-right text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lineItems.map((li, i) => (
                    <tr key={i} className="border-t border-border/50 hover:bg-muted/10">
                      <td className="px-4 py-3 text-muted-foreground text-xs">{i + 1}</td>
                      <td className="px-4 py-3 font-medium">{li.productDescription}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground text-xs">{li.uom}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{li.quantity}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground text-xs">₹{li.rateExclTax.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs">₹{li.rateInclTax.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-right text-amber-400 text-xs">{li.discountPct}%</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">₹{li.lineAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payment History */}
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Payment History ({stats.invoicePayments.length})
              </p>
              {canAddPayment && (
                <button onClick={() => setShowPayForm(true)}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-green-700/20 border border-green-700/40 text-green-400 hover:bg-green-700/30 transition-colors">
                  <Plus className="h-3 w-3" /> Add Payment
                </button>
              )}
            </div>
            {stats.invoicePayments.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                No payments recorded yet
                {canAddPayment && (
                  <button onClick={() => setShowPayForm(true)} className="block mx-auto mt-2 text-xs text-green-400 hover:underline">
                    + Record first payment
                  </button>
                )}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 border-b border-border text-xs">
                    <th className="px-4 py-2.5 text-left text-muted-foreground">Date</th>
                    <th className="px-4 py-2.5 text-left text-muted-foreground">Method</th>
                    <th className="px-4 py-2.5 text-left text-muted-foreground">Reference</th>
                    <th className="px-4 py-2.5 text-left text-muted-foreground">Notes</th>
                    <th className="px-4 py-2.5 text-right text-muted-foreground">Amount</th>
                    <th className="px-4 py-2.5 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {stats.invoicePayments.map((p: Payment) => (
                    <tr key={p.id} className="border-t border-border/50 hover:bg-muted/10">
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDate(p.paymentDate)}</td>
                      <td className="px-4 py-2.5 text-xs">{p.paymentMethod}</td>
                      <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{p.reference || "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{p.notes || "—"}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-green-400">+{fmt(p.amountPaid)}</td>
                      <td className="px-2 py-2.5">
                        <button
                          onClick={() => handleDeletePayment(p.id)}
                          disabled={deletingId === p.id}
                          className="p-1.5 rounded hover:bg-red-950/40 text-muted-foreground hover:text-red-400 transition-colors disabled:opacity-40">
                          {deletingId === p.id
                            ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Credit Notes Section */}
          <div className="rounded-xl border border-purple-700/20 overflow-hidden">
            <div className="px-5 py-3 border-b border-purple-700/20 bg-purple-950/10 flex items-center justify-between">
              <p className="text-xs font-semibold text-purple-300/80 uppercase tracking-wider flex items-center gap-2">
                <ReceiptText className="h-3.5 w-3.5" />
                Credit Notes ({creditNotes.length})
              </p>
              {canAddCreditNote && (
                <button
                  onClick={() => navigate(`/invoices/credit-notes/create?invoiceNo=${encodeURIComponent(invoice.invoiceNo)}`)}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-purple-700/20 border border-purple-700/40 text-purple-400 hover:bg-purple-700/30 transition-colors">
                  <Plus className="h-3 w-3" /> Issue Credit Note
                </button>
              )}
            </div>
            {creditNotes.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                No credit notes issued against this invoice
                {canAddCreditNote && (
                  <button
                    onClick={() => navigate(`/invoices/credit-notes/create?invoiceNo=${encodeURIComponent(invoice.invoiceNo)}`)}
                    className="block mx-auto mt-2 text-xs text-purple-400 hover:underline">
                    + Issue first credit note
                  </button>
                )}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/20 border-b border-border text-xs">
                    <th className="px-4 py-2.5 text-left text-muted-foreground">CN Number</th>
                    <th className="px-4 py-2.5 text-left text-muted-foreground">Date</th>
                    <th className="px-4 py-2.5 text-left text-muted-foreground">Reason</th>
                    <th className="px-4 py-2.5 text-right text-muted-foreground">Taxable</th>
                    <th className="px-4 py-2.5 text-right text-muted-foreground">GST</th>
                    <th className="px-4 py-2.5 text-right text-muted-foreground">Total</th>
                    <th className="px-4 py-2.5 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {creditNotes.map(cn => (
                    <tr key={cn.creditNoteNumber} className="border-t border-border/50 hover:bg-muted/10">
                      <td className="px-4 py-2.5 font-mono text-xs font-semibold text-purple-400">{cn.creditNoteNumber}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDate(cn.date)}</td>
                      <td className="px-4 py-2.5 text-xs">{cn.reason}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-xs">{fmt(cn.taxableAmount)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-xs text-amber-400">{fmt(cn.cgst + cn.sgst)}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-purple-400">−{fmt(cn.totalAmount)}</td>
                      <td className="px-2 py-2.5">
                        <button
                          onClick={() => handleDeleteCreditNote(cn)}
                          disabled={deletingCN === cn.creditNoteNumber}
                          className="p-1.5 rounded hover:bg-red-950/40 text-muted-foreground hover:text-red-400 transition-colors disabled:opacity-40">
                          {deletingCN === cn.creditNoteNumber
                            ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Financial summary */}
          <div className="rounded-xl border border-border p-5 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Financial Summary</p>
            {[
              { label: "Taxable Amount",                  value: invoice.taxableAmount, color: "" },
              { label: `CGST @ ${invoice.gstRate / 2}%`, value: invoice.cgst,          color: "text-amber-400" },
              { label: `SGST @ ${invoice.gstRate / 2}%`, value: invoice.sgst,          color: "text-amber-400" },
              ...(invoice.freight  !== 0 ? [{ label: "Freight",   value: invoice.freight,  color: "text-purple-400" }] : []),
              ...(invoice.roundOff !== 0 ? [{ label: "Round Off", value: invoice.roundOff, color: "text-muted-foreground" }] : []),
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className={`tabular-nums font-medium ${color}`}>
                  {value < 0
                    ? `−₹${Math.abs(value).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                    : `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
                </span>
              </div>
            ))}
            <div className="border-t border-border pt-3 flex items-center justify-between">
              <span className="font-bold">Total Invoice</span>
              <span className="font-bold text-lg tabular-nums">₹{invoice.totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* Payment status */}
          <div className="rounded-xl border border-border p-5 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payment Status</p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Invoice Total</span>
              <span className="tabular-nums font-medium">{fmt(invoice.totalAmount)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Payments Received</span>
              <span className="tabular-nums font-medium text-green-400">− {fmt(stats.totalPaid)}</span>
            </div>
            {stats.totalCreditNotes > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Credit Notes</span>
                <span className="tabular-nums font-medium text-purple-400">− {fmt(stats.totalCreditNotes)}</span>
              </div>
            )}
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div className="h-2 bg-green-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, invoice.totalAmount > 0 ? ((stats.totalPaid + stats.totalCreditNotes) / invoice.totalAmount) * 100 : 0)}%` }} />
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="font-semibold text-sm">Balance Due</span>
              <span className={`tabular-nums font-bold text-lg ${stats.outstanding > 0 ? "text-red-400" : "text-green-400"}`}>
                {stats.outstanding > 0 ? fmt(stats.outstanding) : "₹0.00"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Status</span>
              <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${statusCfg.bg} ${statusCfg.color}`}>
                <StatusIcon className="h-3 w-3" />{statusCfg.label}
              </span>
            </div>
            {canAddPayment && (
              <button onClick={() => setShowPayForm(true)}
                className="w-full h-9 rounded-lg bg-green-700 text-white text-sm font-semibold hover:bg-green-600 transition-colors flex items-center justify-center gap-2">
                <Plus className="h-4 w-4" /> Record Payment
              </button>
            )}
            {canAddCreditNote && (
              <button
                onClick={() => navigate(`/invoices/credit-notes/create?invoiceNo=${encodeURIComponent(invoice.invoiceNo)}`)}
                className="w-full h-9 rounded-lg bg-purple-700/80 text-white text-sm font-semibold hover:bg-purple-700 transition-colors flex items-center justify-center gap-2">
                <ReceiptText className="h-4 w-4" /> Issue Credit Note
              </button>
            )}
          </div>

          {invoice.weightKg > 0 && (
            <div className="rounded-xl border border-border p-4">
              <p className="text-xs text-muted-foreground mb-1">Total Weight</p>
              <p className="text-xl font-bold tabular-nums">{invoice.weightKg.toLocaleString("en-IN")} <span className="text-sm text-muted-foreground">kg</span></p>
            </div>
          )}
          <div className="rounded-xl border border-border p-4">
            <p className="text-xs text-muted-foreground mb-2">Amount in Words</p>
            <p className="text-xs leading-relaxed italic">{numberToWords(invoice.totalAmount)}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceDetail;
