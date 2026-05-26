import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getPurchasesBySupplierId,
  getSupplierById,
  updateSupplierRecord,
  type Purchase,
  type PurchaseSupplierInput,
  type PurchaseSupplierRecord,
} from "@/data/purchaseStore";
import { AddPurchase } from "@/components/AddPurchase";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COMPANY } from "@/lib/invoiceConstants";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Check,
  CreditCard,
  Edit2,
  FileText,
  IndianRupee,
  Mail,
  MapPin,
  Phone,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  User,
  X,
} from "lucide-react";

const fmt = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

const fmtPrintMoney = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const fmtLedgerDate = (d: string) =>
  new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

interface SupplierLedgerRow {
  date: string;
  reference: string;
  description: string;
  taxable: number;
  gst: number;
  total: number;
  runningTotal: number;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
const Toast = ({ type, msg }: { type: "success" | "error"; msg: string }) => (
  <div
    className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-2xl border text-sm font-medium ${
      type === "success"
        ? "bg-green-950 border-green-700/50 text-green-300"
        : "bg-red-950 border-red-700/50 text-red-300"
    }`}
  >
    {type === "success" ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
    {msg}
  </div>
);

// ── Inline Edit Panel (mirrors CustomerProfile EditPanel) ─────────────────────
const EditPanel = ({
  supplier,
  onSave,
  onCancel,
}: {
  supplier: PurchaseSupplierRecord;
  onSave: (updated: PurchaseSupplierRecord) => void;
  onCancel: () => void;
}) => {
  const [f, setF] = useState<PurchaseSupplierInput>({
    name: supplier.name,
    gstin: supplier.gstin ?? "",
    contact_name: supplier.contact_name ?? "",
    mobile: supplier.mobile ?? "",
    email: supplier.email ?? "",
    address: supplier.address ?? "",
    city: supplier.city ?? "",
    state: supplier.state ?? "Bihar",
    payment_terms: supplier.payment_terms ?? "Net 30",
    notes: supplier.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof PurchaseSupplierInput, v: string) =>
    setF((prev) => ({ ...prev, [k]: v }));

  const STATES = [
    "Bihar", "Jharkhand", "Uttar Pradesh", "West Bengal", "Delhi", "Maharashtra",
    "Gujarat", "Rajasthan", "Madhya Pradesh", "Karnataka", "Tamil Nadu",
    "Telangana", "Andhra Pradesh", "Other",
  ];

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateSupplierRecord(supplier.id, f);
      onSave(updated);
    } finally {
      setSaving(false);
    }
  };

  const L = ({ children, req }: { children: React.ReactNode; req?: boolean }) => (
    <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
      {children}
      {req && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );

  return (
    <Card className="border-primary/25 bg-primary/[0.02] overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Edit2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">Edit Supplier Profile</p>
            <p className="text-xs text-muted-foreground">Changes save directly to database</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="h-9 px-4 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 h-9 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving
              ? <><RefreshCw className="h-4 w-4 animate-spin" />Saving…</>
              : <><Check className="h-4 w-4" />Save Changes</>}
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Business Identity */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Business Identity</p>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <L req>Supplier Name</L>
              <Input
                className="h-9 text-sm"
                value={f.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </div>
            <div>
              <L>GSTIN</L>
              <div className="flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-muted/30 font-mono text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />
                {supplier.gstin ?? "Not set"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Cannot be changed (primary identity)</p>
            </div>
            <div>
              <L>Payment Terms</L>
              <Select value={f.payment_terms ?? "Net 30"} onValueChange={(v) => set("payment_terms", v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Advance">Advance</SelectItem>
                  <SelectItem value="Net 15">Net 15</SelectItem>
                  <SelectItem value="Net 30">Net 30</SelectItem>
                  <SelectItem value="Net 45">Net 45</SelectItem>
                  <SelectItem value="Net 60">Net 60</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Contact Details */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <User className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact Details</p>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <L>Contact Person</L>
              <Input className="h-9 text-sm" value={f.contact_name ?? ""} onChange={(e) => set("contact_name", e.target.value)} />
            </div>
            <div>
              <L>Mobile Number</L>
              <Input className="h-9 text-sm" value={f.mobile ?? ""} onChange={(e) => set("mobile", e.target.value)} />
            </div>
            <div>
              <L>Email Address</L>
              <Input className="h-9 text-sm" type="email" value={f.email ?? ""} onChange={(e) => set("email", e.target.value)} />
            </div>
          </div>
        </div>

        {/* Address */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Address</p>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="space-y-3">
            <div>
              <L>Street / Locality</L>
              <Input className="h-9 text-sm" value={f.address ?? ""} onChange={(e) => set("address", e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <L>City</L>
                <Input className="h-9 text-sm" value={f.city ?? ""} onChange={(e) => set("city", e.target.value)} />
              </div>
              <div>
                <L>State</L>
                <Select value={f.state ?? "Bihar"} onValueChange={(v) => set("state", v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-52">
                    {STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes</p>
            <div className="h-px flex-1 bg-border" />
          </div>
          <textarea
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
            rows={3}
            value={f.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>
      </div>
    </Card>
  );
};

// ── Print View ────────────────────────────────────────────────────────────────
const SUPPLIER_LEDGER_PRINT_STYLES = `
@media print {
  body * { visibility: hidden !important; }
  #supplier-ledger-print-area,
  #supplier-ledger-print-area * { visibility: visible !important; }
  #supplier-ledger-print-area {
    position: fixed !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    min-height: 100vh !important;
    background: white !important;
    padding: 10mm !important;
  }
  @page { margin: 0; size: A4 portrait; }
}
`;

const SupplierLedgerPrintView = ({
  supplier,
  rows,
  totalTaxable,
  totalGST,
  totalPurchases,
  generatedOn,
}: {
  supplier: PurchaseSupplierRecord;
  rows: SupplierLedgerRow[];
  totalTaxable: number;
  totalGST: number;
  totalPurchases: number;
  generatedOn: string;
}) => {
  const border = "1px solid #111827";
  const headerCell: React.CSSProperties = {
    border, padding: "8px 10px", fontSize: "10px", fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.04em", background: "#eef2ff",
  };
  const bodyCell: React.CSSProperties = {
    border, padding: "7px 10px", fontSize: "10px", verticalAlign: "top", lineHeight: 1.45,
  };

  return (
    <div
      id="supplier-ledger-print-area"
      style={{ fontFamily: "Arial, sans-serif", fontSize: "11px", color: "#111827", background: "#fff", width: "100%" }}
    >
      <div style={{ border, padding: "14px 16px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start" }}>
          <div style={{ maxWidth: "58%" }}>
            <div style={{ fontSize: "18px", fontWeight: 700 }}>{COMPANY.name}</div>
            <div style={{ marginTop: "4px", color: "#374151" }}>{COMPANY.address}</div>
            <div style={{ color: "#374151" }}>{COMPANY.city}</div>
            <div style={{ marginTop: "6px" }}>GSTIN: <strong>{COMPANY.gstin}</strong></div>
            <div>Contact: <strong>{COMPANY.contact}</strong></div>
            <div>Email: <strong>{COMPANY.email}</strong></div>
          </div>
          <div style={{ minWidth: "220px", textAlign: "right" }}>
            <div style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "0.05em" }}>SUPPLIER LEDGER</div>
            <div style={{ marginTop: "8px", color: "#374151" }}>Statement Date: {fmtLedgerDate(generatedOn)}</div>
            <div style={{ color: "#374151" }}>Supplier GSTIN: {supplier.gstin || "-"}</div>
            <div style={{ color: "#374151" }}>Payment Terms: {supplier.payment_terms || "-"}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "14px", marginTop: "16px" }}>
          <div style={{ border }}>
            <div style={{ padding: "8px 10px", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", background: "#f8fafc", borderBottom: border }}>Supplier Details</div>
            <div style={{ padding: "10px" }}>
              <div style={{ fontSize: "16px", fontWeight: 700 }}>{supplier.name}</div>
              <div style={{ marginTop: "8px" }}>{supplier.contact_name || "-"}</div>
              <div>{supplier.mobile || "-"}</div>
              <div>{supplier.email || "-"}</div>
              <div style={{ marginTop: "8px", color: "#374151" }}>
                {[supplier.address, supplier.city, supplier.state].filter(Boolean).join(", ") || "-"}
              </div>
            </div>
          </div>
          <div style={{ border }}>
            <div style={{ padding: "8px 10px", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", background: "#f8fafc", borderBottom: border }}>Summary</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {[
                  ["Taxable Purchases", totalTaxable],
                  ["GST Paid", totalGST],
                  ["Total Purchases", totalPurchases],
                  ["Current Payables", 0],
                ].map(([label, value], index) => (
                  <tr key={String(label)}>
                    <td style={{ padding: "8px 10px", borderBottom: index === 3 ? "none" : border, color: "#475569" }}>{label}</td>
                    <td style={{ padding: "8px 10px", borderBottom: index === 3 ? "none" : border, textAlign: "right", fontWeight: 700 }}>
                      Rs. {fmtPrintMoney(Number(value))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "14px" }}>
        <thead>
          <tr>
            <th style={{ ...headerCell, width: "12%" }}>Date</th>
            <th style={{ ...headerCell, width: "16%" }}>Invoice No.</th>
            <th style={headerCell}>Particulars</th>
            <th style={{ ...headerCell, width: "12%", textAlign: "right" }}>Taxable</th>
            <th style={{ ...headerCell, width: "12%", textAlign: "right" }}>GST</th>
            <th style={{ ...headerCell, width: "12%", textAlign: "right" }}>Total</th>
            <th style={{ ...headerCell, width: "14%", textAlign: "right" }}>Running Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.reference}-${index}`}>
              <td style={bodyCell}>{fmtLedgerDate(row.date)}</td>
              <td style={bodyCell}>{row.reference}</td>
              <td style={bodyCell}>{row.description}</td>
              <td style={{ ...bodyCell, textAlign: "right" }}>{fmtPrintMoney(row.taxable)}</td>
              <td style={{ ...bodyCell, textAlign: "right" }}>{fmtPrintMoney(row.gst)}</td>
              <td style={{ ...bodyCell, textAlign: "right" }}>{fmtPrintMoney(row.total)}</td>
              <td style={{ ...bodyCell, textAlign: "right", fontWeight: 700 }}>{fmtPrintMoney(row.runningTotal)}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...bodyCell, fontWeight: 700 }} colSpan={3}>Totals</td>
            <td style={{ ...bodyCell, textAlign: "right", fontWeight: 700 }}>{fmtPrintMoney(totalTaxable)}</td>
            <td style={{ ...bodyCell, textAlign: "right", fontWeight: 700 }}>{fmtPrintMoney(totalGST)}</td>
            <td style={{ ...bodyCell, textAlign: "right", fontWeight: 700 }}>{fmtPrintMoney(totalPurchases)}</td>
            <td style={{ ...bodyCell, textAlign: "right", fontWeight: 700 }}>{fmtPrintMoney(totalPurchases)}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: "14px", display: "flex", justifyContent: "space-between", gap: "16px" }}>
        <div style={{ maxWidth: "62%", color: "#475569", lineHeight: 1.5 }}>
          This statement reflects purchases recorded in the system as of the statement date.
          Current purchase flow is treated as cash-booked.
        </div>
        <div style={{ minWidth: "220px", textAlign: "right" }}>
          <div style={{ borderTop: border, paddingTop: "32px", fontWeight: 700 }}>For {COMPANY.name}</div>
          <div style={{ color: "#475569", marginTop: "4px" }}>Authorized Signatory</div>
        </div>
      </div>
    </div>
  );
};

// ── Main SupplierProfile Component ────────────────────────────────────────────
const SupplierProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [supplier, setSupplier] = useState<PurchaseSupplierRecord | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [showAddPurchase, setShowAddPurchase] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    if (!id) { setError("Supplier not found."); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [supplierRow, purchaseRows] = await Promise.all([
        getSupplierById(id),
        getPurchasesBySupplierId(id),
      ]);
      if (!supplierRow) { setError("Supplier not found."); setSupplier(null); setPurchases([]); return; }
      setSupplier(supplierRow);
      setPurchases(purchaseRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load supplier profile.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const stats = useMemo(() => {
    const totalPurchases = purchases.reduce((s, r) => s + r.total_amount, 0);
    const totalGST = purchases.reduce((s, r) => s + r.total_gst, 0);
    const totalTaxable = purchases.reduce((s, r) => s + r.taxable_amount, 0);
    const lastPurchase = purchases.reduce<string | null>((latest, r) => {
      if (!latest || r.purchase_date > latest) return r.purchase_date;
      return latest;
    }, null);
    return { totalPurchases, totalGST, totalTaxable, outstanding: 0, lastPurchase };
  }, [purchases]);

  const recentTransactions = useMemo(
    () => [...purchases].sort((a, b) => b.purchase_date.localeCompare(a.purchase_date)).slice(0, 5),
    [purchases]
  );

  const ledgerRows = useMemo<SupplierLedgerRow[]>(() => {
    let runningTotal = 0;
    return [...purchases]
      .sort((a, b) => a.purchase_date.localeCompare(b.purchase_date))
      .map((p) => {
        runningTotal += p.total_amount;
        return {
          date: p.purchase_date,
          reference: p.invoice_no,
          description: `${p.category} purchase from ${p.supplier_name}`,
          taxable: p.taxable_amount,
          gst: p.total_gst,
          total: p.total_amount,
          runningTotal,
        };
      });
  }, [purchases]);

  const handlePrintLedger = useCallback(() => {
    if (!supplier || purchases.length === 0) return;
    if (!document.getElementById("supplier-ledger-print-style")) {
      const style = document.createElement("style");
      style.id = "supplier-ledger-print-style";
      style.textContent = SUPPLIER_LEDGER_PRINT_STYLES;
      document.head.appendChild(style);
    }
    window.print();
  }, [purchases.length, supplier]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading supplier…</span>
      </div>
    );
  }

  if (error || !supplier) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate("/purchases/suppliers")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Suppliers
        </button>
        <Card className="p-10 text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted/40">
            <AlertCircle className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold">Supplier unavailable</p>
          <p className="text-xs text-muted-foreground">{error || "The supplier record could not be loaded."}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {toast && <Toast type={toast.type} msg={toast.msg} />}

      {showAddPurchase && (
        <AddPurchase
          initialSupplierId={supplier.id}
          onClose={() => setShowAddPurchase(false)}
          onSaved={() => { void load(); }}
        />
      )}

      {/* Hidden print area */}
      {purchases.length > 0 && (
        <div style={{ position: "fixed", left: "-9999px", top: 0, width: "210mm", zIndex: -1 }}>
          <SupplierLedgerPrintView
            supplier={supplier}
            rows={ledgerRows}
            totalTaxable={stats.totalTaxable}
            totalGST={stats.totalGST}
            totalPurchases={stats.totalPurchases}
            generatedOn={new Date().toISOString()}
          />
        </div>
      )}

      {/* Back nav */}
      <button
        onClick={() => navigate("/purchases/suppliers")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Suppliers
      </button>

      {/* ── Profile Header Card ─────────────────────────────────────────── */}
      <Card className="p-6">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
            <span className="text-xl font-bold text-primary">
              {supplier.name.charAt(0).toUpperCase()}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold leading-tight text-foreground">{supplier.name}</h2>

                {/* Identity chips */}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {/* GST verified chip — primary identity */}
                  {supplier.gstin ? (
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1">
                      <ShieldCheck className="h-3.5 w-3.5 text-green-400" />
                      <span className="font-mono text-xs font-semibold text-green-300 tracking-wide">
                        {supplier.gstin}
                      </span>
                      <span className="text-xs text-green-500/80 font-medium">· GST Verified</span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
                      <span className="text-xs font-medium text-amber-300">GSTIN not set</span>
                    </div>
                  )}

                  <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-400">
                    Supplier
                  </span>
                  <span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">
                    {purchases.length} purchases
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={handlePrintLedger}
                  disabled={purchases.length === 0}
                  className="flex h-9 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Printer className="h-4 w-4" /> Print Ledger
                </button>
                <button
                  onClick={() => setEditing((prev) => !prev)}
                  className={`flex h-9 items-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors ${
                    editing
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {editing ? <X className="h-4 w-4" /> : <Edit2 className="h-4 w-4" />}
                  {editing ? "Cancel Edit" : "Edit Supplier"}
                </button>
                <button
                  onClick={() => setShowAddPurchase(true)}
                  className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" /> Add Purchase
                </button>
              </div>
            </div>

            {/* Contact strip */}
            <div className="mt-4 flex flex-wrap gap-4">
              {supplier.mobile && (
                <a href={`tel:${supplier.mobile}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <Phone className="h-3.5 w-3.5" /> {supplier.mobile}
                </a>
              )}
              {supplier.email && (
                <a href={`mailto:${supplier.email}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <Mail className="h-3.5 w-3.5" /> {supplier.email}
                </a>
              )}
              {supplier.contact_name && (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" /> {supplier.contact_name}
                </span>
              )}
              {[supplier.address, supplier.city, supplier.state].filter(Boolean).length > 0 && (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {[supplier.address, supplier.city, supplier.state].filter(Boolean).join(", ")}
                </span>
              )}
            </div>

            {/* Footer strip */}
            <div className="mt-3 flex gap-4 border-t border-border/50 pt-3">
              <div className="text-xs">
                <span className="text-muted-foreground">Last Purchase: </span>
                <span className="font-medium">{fmtDate(stats.lastPurchase)}</span>
              </div>
              {supplier.payment_terms && (
                <div className="text-xs">
                  <span className="text-muted-foreground">Payment Terms: </span>
                  <span className="font-medium">{supplier.payment_terms}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* ── Inline Edit Panel — appears below header, no modal ────────────── */}
      {editing && (
        <EditPanel
          supplier={supplier}
          onSave={(updated) => {
            setSupplier(updated);
            setEditing(false);
            showToast("success", "Supplier profile updated successfully.");
          }}
          onCancel={() => setEditing(false)}
        />
      )}

      {/* ── Metrics ──────────────────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total Purchases", value: fmt(stats.totalPurchases), sub: `${purchases.length} purchase documents`, color: "text-foreground", icon: ShoppingBag },
          { label: "Taxable Amount", value: fmt(stats.totalTaxable), sub: "Excluding GST", color: "text-foreground", icon: IndianRupee },
          { label: "GST Paid", value: fmt(stats.totalGST), sub: "Input tax paid to supplier", color: "text-amber-400", icon: Receipt },
          { label: "Outstanding / Payables", value: fmt(stats.outstanding), sub: "Current purchase flow is cash-booked", color: "text-green-400", icon: Building2 },
        ].map((card) => (
          <Card key={card.label} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">{card.label}</p>
                <p className={`mt-1 text-lg font-bold ${card.color}`}>{card.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{card.sub}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
                <card.icon className="h-4 w-4 text-primary" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* ── Purchase History + Recent Transactions ───────────────────────── */}
      <div className={`grid gap-5 ${recentTransactions.length > 0 ? "xl:grid-cols-3" : "grid-cols-1"}`}>
        <Card className={`${recentTransactions.length > 0 ? "xl:col-span-2" : ""} overflow-hidden p-0`}>
          <div className="border-b border-border bg-muted/15 px-5 py-3.5 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Purchase History ({purchases.length})
            </p>
            <button
              onClick={() => setShowAddPurchase(true)}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <Plus className="h-3 w-3" /> New Purchase
            </button>
          </div>

          {purchases.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm text-muted-foreground">No purchases recorded for this supplier yet.</p>
              <button
                onClick={() => setShowAddPurchase(true)}
                className="mt-3 text-xs text-primary hover:underline"
              >
                Add first purchase →
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/25">
                    {["Invoice No.", "Date", "Category", "Taxable", "GST", "Total"].map((h) => (
                      <th key={h} className={`px-4 py-2.5 text-xs font-semibold text-muted-foreground ${["Taxable", "GST", "Total"].includes(h) ? "text-right" : "text-left"}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => navigate(`/purchases/${p.id}`)}
                      className="cursor-pointer border-t border-border/50 transition-colors hover:bg-muted/20"
                    >
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{p.invoice_no}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(p.purchase_date)}</td>
                      <td className="px-4 py-2.5">{p.category}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmt(p.taxable_amount)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-amber-400">{fmt(p.total_gst)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{fmt(p.total_amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border bg-muted/20">
                    <td colSpan={3} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">Totals ({purchases.length})</td>
                    <td className="px-4 py-2.5 text-right font-bold">{fmt(stats.totalTaxable)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-amber-400">{fmt(stats.totalGST)}</td>
                    <td className="px-4 py-2.5 text-right font-bold">{fmt(stats.totalPurchases)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {recentTransactions.length > 0 && (
          <Card className="overflow-hidden p-0">
            <div className="border-b border-border bg-muted/15 px-5 py-3.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Recent Transactions
              </p>
            </div>
            <div className="divide-y divide-border/40">
              {recentTransactions.map((p) => (
                <div
                  key={p.id}
                  onClick={() => navigate(`/purchases/${p.id}`)}
                  className="cursor-pointer px-4 py-3 transition-colors hover:bg-muted/15"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-mono text-muted-foreground">{p.invoice_no}</p>
                      <p className="mt-0.5 text-sm font-medium">{p.category}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{fmtDate(p.purchase_date)}</p>
                    </div>
                    <p className="text-sm font-bold tabular-nums">{fmt(p.total_amount)}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default SupplierProfile;
