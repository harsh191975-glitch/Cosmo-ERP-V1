import { useState, useEffect } from "react";
import { getInvoiceNosForFreight } from "@/data/invoiceStore";
import { insertExpense, type FullExpensePayload } from "@/data/expenseStore";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  X, Check, RefreshCw, AlertCircle,
  Users, BadgePercent, Star, Zap, Truck,
} from "lucide-react";

type Category = "Salaries" | "Commission" | "Royalty" | "Utilities" | "Freight";

const CATEGORIES: { value: Category; label: string; icon: React.ElementType; color: string }[] = [
  { value: "Salaries",   label: "Salaries",   icon: Users,        color: "text-green-400"  },
  { value: "Commission", label: "Commission", icon: BadgePercent, color: "text-cyan-400"   },
  { value: "Royalty",    label: "Royalty",    icon: Star,         color: "text-yellow-400" },
  { value: "Utilities",  label: "Utilities",  icon: Zap,          color: "text-blue-400"   },
  { value: "Freight",    label: "Freight",    icon: Truck,        color: "text-purple-400" },
];

const PAYMENT_METHODS = ["NEFT","RTGS","IMPS","UPI","Cash","Cheque","Transfer","Other"];
const UTILITY_TYPES   = ["Electricity","Internet","Water","Other"];
const MONTHS = [
  "January 2026","February 2026","March 2026","April 2026",
  "May 2026","June 2026","July 2026","August 2026",
  "September 2026","October 2026","November 2026","December 2026",
  "January 2025","February 2025","March 2025",
];
const KNOWN_PAYEES: Record<Category, string[]> = {
  Salaries:   ["Operator","Supervisor","Helper","Machine Operator","Manager/Admin","Other"],
  Commission: ["Cosmo","Other"],
  Royalty:    ["Mr. Piyush Chheda","Shital Industries","Other"],
  Utilities:  ["Electricity Board","Internet Provider","Water Board","Other"],
  Freight:    ["Transporter","Driver","Logistics Partner","Other"],
};

const L = ({ children, req }: { children: React.ReactNode; req?: boolean }) => (
  <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
    {children}{req && <span className="text-red-400 ml-0.5">*</span>}
  </label>
);

const Toast = ({ message, type }: { message: string; type: "success" | "error" }) => (
  <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-2xl border text-sm font-medium
    ${type === "success" ? "bg-green-950/90 border-green-700/50 text-green-300" : "bg-red-950/90 border-red-700/50 text-red-300"}`}>
    {type === "success" ? <Check className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
    {message}
  </div>
);

interface RecordExpenseProps { onClose: () => void; onSaved: () => void; }

export const RecordExpense = ({ onClose, onSaved }: RecordExpenseProps) => {
  const [category,      setCategory]      = useState<Category>("Salaries");
  const [date,          setDate]          = useState(new Date().toISOString().split("T")[0]);
  const [amount,        setAmount]        = useState<number | "">("");
  const [payee,         setPayee]         = useState("");
  const [customPayee,   setCustomPayee]   = useState("");
  const [paymentMethod, setPaymentMethod] = useState("NEFT");
  const [salaryMonth,   setSalaryMonth]   = useState(MONTHS[0]);
  const [utilityType,   setUtilityType]   = useState("Electricity");
  const [billingMonth,  setBillingMonth]  = useState(MONTHS[0]);
  const [refInvoice,    setRefInvoice]    = useState("__none__");
  const [refText,       setRefText]       = useState("");
  const [grossAmount,   setGrossAmount]   = useState<number | "">("");
  const [tdsAmount,     setTdsAmount]     = useState<number | "">(0);
  const [notes,         setNotes]         = useState("");
  const [errors,        setErrors]        = useState<Record<string, string>>({});
  const [saving,        setSaving]        = useState(false);
  const [toast,         setToast]         = useState<{ message: string; type: "success" | "error" } | null>(null);

  const [invoiceNos,        setInvoiceNos]        = useState<string[]>([]);
  const [invoiceFreightMap, setInvoiceFreightMap] = useState<Record<string, number>>({});

  // Fetch invoice numbers (and their logistics freight values) from the store
  useEffect(() => {
    getInvoiceNosForFreight().then(rows => {
      setInvoiceNos(rows.map(r => r.invoice_no).filter(Boolean));
      const map: Record<string, number> = {};
      for (const r of rows) {
        if (r.invoice_no) map[r.invoice_no] = r.freight;
      }
      setInvoiceFreightMap(map);
    });
  }, []);

  useEffect(() => {
    setAmount(""); setPayee(""); setCustomPayee(""); setRefInvoice("__none__"); setRefText("");
    setGrossAmount(""); setTdsAmount(0); setNotes(""); setErrors({});
  }, [category]);

  const royaltyNet = category === "Royalty"
    ? Math.max(0, (Number(grossAmount) || 0) - (Number(tdsAmount) || 0)) : 0;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!date) e.date = "Date required";
    const rp = payee === "Other" ? customPayee.trim() : payee;
    if (!rp) e.payee = "Payee required";
    if (category === "Royalty") {
      if (!grossAmount || Number(grossAmount) <= 0) e.gross = "Gross amount required";
    } else {
      if (!amount || Number(amount) <= 0) e.amount = "Amount required";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const rp = payee === "Other" ? customPayee.trim() : payee;
    const invoiceRef = refInvoice === "__none__" ? null : refInvoice || null;
    const record: FullExpensePayload = {
      expense_date: date, category,
      amount: category === "Royalty" ? royaltyNet : Number(amount),
      payee_name: rp, payment_method: paymentMethod,
      notes: notes || null, source: "manual",
    };
    if (category === "Salaries")   { record.salary_month = salaryMonth; }
    if (category === "Commission") { record.salary_month = salaryMonth; record.reference_invoice_no = invoiceRef; record.reference_text = refText || null; }
    if (category === "Royalty")    { record.salary_month = salaryMonth; record.reference_invoice_no = invoiceRef; record.gross_amount = Number(grossAmount)||0; record.tds_amount = Number(tdsAmount)||0; record.amount = royaltyNet; }
    if (category === "Utilities")  { record.utility_type = utilityType; record.billing_month = billingMonth; record.reference_text = refText || null; }
    if (category === "Freight")    {
      record.reference_invoice_no   = invoiceRef;
      record.reference_text         = refText || null;
      // Store the invoice's logistics freight value so the Freight table can
      // detect mismatches between what was invoiced and what was actually paid.
      if (invoiceRef && invoiceFreightMap[invoiceRef] != null) {
        record.invoice_freight_amount = invoiceFreightMap[invoiceRef];
      }
    }

    try {
      await insertExpense(record);
      setSaving(false);
      setToast({ message: `${category} expense recorded!`, type: "success" });
      setTimeout(() => { setToast(null); onSaved(); onClose(); }, 1200);
    } catch (err: unknown) {
      setSaving(false);
      const msg = err instanceof Error ? err.message : "Unknown error";
      setToast({ message: `Error: ${msg}`, type: "error" });
      setTimeout(() => setToast(null), 4000);
    }
  };

  const catCfg = CATEGORIES.find(c => c.value === category)!;
  const CatIcon = catCfg.icon;

  const catBorder =
    category === "Salaries"   ? "border-green-700/30 bg-green-950/10" :
    category === "Commission" ? "border-cyan-700/30 bg-cyan-950/10" :
    category === "Royalty"    ? "border-yellow-700/30 bg-yellow-950/10" :
    category === "Utilities"  ? "border-blue-700/30 bg-blue-950/10" :
                                "border-purple-700/30 bg-purple-950/10";

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} />}

      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto">
        <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

        <div className="relative z-10 w-full max-w-[98vw] min-h-[98vh] my-[1vh] mx-[1vw] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col">

          {/* Accent */}
          <div className="h-0.5 w-full bg-gradient-to-r from-red-700/60 via-red-500 to-red-700/60 flex-shrink-0" />

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-muted/40 flex items-center justify-center">
                <CatIcon className={`h-4 w-4 ${catCfg.color}`} />
              </div>
              <div>
                <p className="font-bold text-base">Record Expense</p>
                <p className="text-xs text-muted-foreground">New {category.toLowerCase()} entry</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-8">
            <div className="grid grid-cols-3 gap-8">

              {/* ── LEFT: form fields ── */}
              <div className="col-span-2 space-y-6">

                {/* Category pills */}
                <div>
                  <L req>Expense Category</L>
                  <div className="grid grid-cols-5 gap-3">
                    {CATEGORIES.map(c => {
                      const Icon = c.icon;
                      const active = category === c.value;
                      return (
                        <button key={c.value} onClick={() => setCategory(c.value)}
                          className={`flex flex-col items-center gap-1.5 px-3 py-4 rounded-xl border text-xs font-medium transition-all
                            ${active ? `border-primary/60 bg-primary/10 ${c.color}` : "border-border hover:bg-muted/20 text-muted-foreground"}`}>
                          <Icon className={`h-5 w-5 ${active ? c.color : ""}`} />
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Date + Method */}
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <L req>Date</L>
                    <Input type="date" className={`h-10 text-sm ${errors.date ? "border-red-500" : ""}`}
                      value={date} onChange={e => setDate(e.target.value)} />
                    {errors.date && <p className="text-xs text-red-400 mt-1">{errors.date}</p>}
                  </div>
                  <div>
                    <L>Payment Method</L>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Payee */}
                <div>
                  <L req>{category === "Salaries" ? "Employee Role" : category === "Utilities" ? "Provider" : "Recipient"}</L>
                  <Select value={payee} onValueChange={setPayee}>
                    <SelectTrigger className={`h-10 text-sm ${errors.payee ? "border-red-500" : ""}`}>
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>{KNOWN_PAYEES[category].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                  {payee === "Other" && (
                    <Input className="h-10 text-sm mt-2" placeholder="Enter name…"
                      value={customPayee} onChange={e => setCustomPayee(e.target.value)} />
                  )}
                  {errors.payee && <p className="text-xs text-red-400 mt-1">{errors.payee}</p>}
                </div>

                {/* SALARIES */}
                {category === "Salaries" && (
                  <div className="grid grid-cols-2 gap-5">
                    <div>
                      <L req>Salary Month</L>
                      <Select value={salaryMonth} onValueChange={setSalaryMonth}>
                        <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>{MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <L req>Amount (₹)</L>
                      <Input type="number" min="0" className={`h-10 text-sm ${errors.amount ? "border-red-500" : ""}`}
                        placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value === "" ? "" : Number(e.target.value))} />
                      {errors.amount && <p className="text-xs text-red-400 mt-1">{errors.amount}</p>}
                    </div>
                    <div className="col-span-2">
                      <L>Notes</L>
                      <Input className="h-10 text-sm" placeholder="Optional remarks" value={notes} onChange={e => setNotes(e.target.value)} />
                    </div>
                  </div>
                )}

                {/* COMMISSION */}
                {category === "Commission" && (
                  <div className="grid grid-cols-2 gap-5">
                    <div>
                      <L>Sales Period</L>
                      <Select value={salaryMonth} onValueChange={setSalaryMonth}>
                        <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>{MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <L req>Amount (₹)</L>
                      <Input type="number" min="0" className={`h-10 text-sm ${errors.amount ? "border-red-500" : ""}`}
                        placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value === "" ? "" : Number(e.target.value))} />
                      {errors.amount && <p className="text-xs text-red-400 mt-1">{errors.amount}</p>}
                    </div>
                    <div className="col-span-2">
                      <L>Associated Invoice (optional)</L>
                      <Select value={refInvoice} onValueChange={setRefInvoice}>
                        <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="Link to invoice…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— None —</SelectItem>
                          {invoiceNos.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <L>Notes</L>
                      <Input className="h-10 text-sm" placeholder="e.g. Q1 sales commission" value={notes} onChange={e => setNotes(e.target.value)} />
                    </div>
                  </div>
                )}

                {/* ROYALTY */}
                {category === "Royalty" && (
                  <div className="grid grid-cols-2 gap-5">
                    <div>
                      <L>Period</L>
                      <Select value={salaryMonth} onValueChange={setSalaryMonth}>
                        <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>{MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div />
                    <div>
                      <L req>Gross Amount (₹)</L>
                      <Input type="number" min="0" className={`h-10 text-sm ${errors.gross ? "border-red-500" : ""}`}
                        placeholder="0.00" value={grossAmount} onChange={e => setGrossAmount(e.target.value === "" ? "" : Number(e.target.value))} />
                      {errors.gross && <p className="text-xs text-red-400 mt-1">{errors.gross}</p>}
                    </div>
                    <div>
                      <L>TDS Deducted (₹)</L>
                      <Input type="number" min="0" className="h-10 text-sm"
                        placeholder="0.00" value={tdsAmount} onChange={e => setTdsAmount(e.target.value === "" ? "" : Number(e.target.value))} />
                    </div>
                    <div className="col-span-2">
                      <L>Associated Invoice (optional)</L>
                      <Select value={refInvoice} onValueChange={setRefInvoice}>
                        <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="Link to invoice…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— None —</SelectItem>
                          {invoiceNos.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <L>Notes</L>
                      <Input className="h-10 text-sm" placeholder="Optional" value={notes} onChange={e => setNotes(e.target.value)} />
                    </div>
                  </div>
                )}

                {/* UTILITIES */}
                {category === "Utilities" && (
                  <div className="grid grid-cols-2 gap-5">
                    <div>
                      <L req>Utility Type</L>
                      <Select value={utilityType} onValueChange={setUtilityType}>
                        <SelectTrigger className={`h-10 text-sm ${errors.utilityType ? "border-red-500" : ""}`}><SelectValue /></SelectTrigger>
                        <SelectContent>{UTILITY_TYPES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <L>Billing Month</L>
                      <Select value={billingMonth} onValueChange={setBillingMonth}>
                        <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>{MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <L req>Amount (₹)</L>
                      <Input type="number" min="0" className={`h-10 text-sm ${errors.amount ? "border-red-500" : ""}`}
                        placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value === "" ? "" : Number(e.target.value))} />
                      {errors.amount && <p className="text-xs text-red-400 mt-1">{errors.amount}</p>}
                    </div>
                    <div>
                      <L>Bill / Reference No.</L>
                      <Input className="h-10 text-sm font-mono" placeholder="e.g. BILL-2026-001"
                        value={refText} onChange={e => setRefText(e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      <L>Notes</L>
                      <Input className="h-10 text-sm" placeholder="Optional" value={notes} onChange={e => setNotes(e.target.value)} />
                    </div>
                  </div>
                )}

                {/* FREIGHT */}
                {category === "Freight" && (
                  <div className="grid grid-cols-2 gap-5">
                    <div>
                      <L req>Amount Paid (₹)</L>
                      <Input type="number" min="0" className={`h-10 text-sm ${errors.amount ? "border-red-500" : ""}`}
                        placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value === "" ? "" : Number(e.target.value))} />
                      {errors.amount && <p className="text-xs text-red-400 mt-1">{errors.amount}</p>}
                    </div>
                    <div>
                      <L req>Linked Sales Invoice</L>
                      <Select value={refInvoice} onValueChange={setRefInvoice}>
                        <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="Select invoice…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— None —</SelectItem>
                          {invoiceNos.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {/* Show invoice logistics freight value as a hint */}
                      {refInvoice !== "__none__" && invoiceFreightMap[refInvoice] != null && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Invoice logistics value: ₹{invoiceFreightMap[refInvoice].toLocaleString("en-IN")}
                        </p>
                      )}
                    </div>
                    {/* Live mismatch warning */}
                    {refInvoice !== "__none__" &&
                     invoiceFreightMap[refInvoice] != null &&
                     Number(amount) > 0 &&
                     Math.abs(Number(amount) - invoiceFreightMap[refInvoice]) > 1 && (
                      <div className="col-span-2 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
                        <span className="mt-0.5 shrink-0">⚠</span>
                        <span>
                          Paid amount (₹{Number(amount).toLocaleString("en-IN")}) differs from the
                          invoice logistics value (₹{invoiceFreightMap[refInvoice].toLocaleString("en-IN")}) by{" "}
                          ₹{Math.abs(Number(amount) - invoiceFreightMap[refInvoice]).toLocaleString("en-IN")}.
                          The paid amount will be saved and used for P&L.
                        </span>
                      </div>
                    )}
                    <div>
                      <L>Transporter / Vehicle No.</L>
                      <Input className="h-10 text-sm" placeholder="e.g. BR04-T-1234"
                        value={refText} onChange={e => setRefText(e.target.value)} />
                    </div>
                    <div>
                      <L>Notes</L>
                      <Input className="h-10 text-sm" placeholder="Optional" value={notes} onChange={e => setNotes(e.target.value)} />
                    </div>
                  </div>
                )}

                {/* Footer buttons */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                  <button onClick={onClose}
                    className="h-10 px-5 rounded-xl border border-border text-sm hover:bg-muted transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleSave} disabled={saving}
                    className="flex items-center gap-2 h-10 px-6 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
                    {saving ? <><RefreshCw className="h-4 w-4 animate-spin" />Saving…</> : <><Check className="h-4 w-4" />Record Expense</>}
                  </button>
                </div>
              </div>

              {/* ── RIGHT: live summary ── */}
              <div className="space-y-4">
                <div className={`rounded-xl border p-5 ${catBorder}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-9 w-9 rounded-xl bg-muted/40 flex items-center justify-center flex-shrink-0">
                      <CatIcon className={`h-4 w-4 ${catCfg.color}`} />
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${catCfg.color}`}>{category}</p>
                      <p className="text-xs text-muted-foreground">expense entry</p>
                    </div>
                  </div>
                  <div className="space-y-2.5 text-xs">
                    {date && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Date</span>
                        <span className="font-medium">{date}</span>
                      </div>
                    )}
                    {(payee === "Other" ? customPayee : payee) && (
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground flex-shrink-0">Payee</span>
                        <span className="font-medium text-right truncate">{payee === "Other" ? customPayee : payee}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Method</span>
                      <span className="font-medium">{paymentMethod}</span>
                    </div>
                    {category === "Royalty" && grossAmount && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Gross</span>
                        <span className="font-medium">₹{Number(grossAmount).toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    {category === "Royalty" && Number(tdsAmount) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">TDS</span>
                        <span className="text-amber-400 font-medium">−₹{Number(tdsAmount).toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    {refInvoice && refInvoice !== "__none__" && (
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground flex-shrink-0">Invoice</span>
                        <span className="font-mono text-right text-xs truncate">{refInvoice}</span>
                      </div>
                    )}
                  </div>
                </div>

                {(Number(amount) > 0 || royaltyNet > 0) && (
                  <div className="rounded-xl border border-border p-5 text-center">
                    <p className="text-xs text-muted-foreground mb-2">{category === "Royalty" ? "Net Payable" : "Amount"}</p>
                    <p className={`text-3xl font-bold tabular-nums ${catCfg.color}`}>
                      ₹{(category === "Royalty" ? royaltyNet : Number(amount) || 0)
                          .toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default RecordExpense;
