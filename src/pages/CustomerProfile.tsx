import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getAllInvoices, getAllPayments } from "@/data/invoiceStore";
import { getCustomerByName, upsertCustomer } from "@/data/customerStore";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Building2, ArrowLeft, CheckCircle, AlertCircle, Edit2,
  Clock, RefreshCw, MapPin, Phone, Mail, Plus, Check, X,
  ShieldCheck, FileText, CreditCard, User,
} from "lucide-react";

const fmt = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });

// ── Status pill ────────────────────────────────────────────────
const STATUS_CFG: Record<string, { cls: string; dot: string }> = {
  Paid:    { cls: "bg-green-500/15 text-green-400 border-green-500/30",  dot: "bg-green-400"  },
  Partial: { cls: "bg-amber-500/15 text-amber-400 border-amber-500/30",  dot: "bg-amber-400"  },
  Overdue: { cls: "bg-red-500/15   text-red-400   border-red-500/30",    dot: "bg-red-400"    },
  Pending: { cls: "bg-blue-500/15  text-blue-400  border-blue-500/30",   dot: "bg-blue-400"   },
};
const StatusPill = ({ status }: { status: string }) => {
  const c = STATUS_CFG[status] ?? STATUS_CFG.Pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${c.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {status}
    </span>
  );
};

// ── DbCustomer shape (full, with all editable columns) ────────
interface DbCustomer {
  id:            string;
  customer_name: string;
  gstin:         string;
  location:      string | null;
  contacts:      string | null;
  trade_name:    string | null;
  taxpayer_type: string | null;
  pan:           string | null;
  contact_name:  string | null;
  mobile:        string | null;
  email:         string | null;
  street:        string | null;
  city:          string | null;
  state:         string | null;
  pin_code:      string | null;
  district:      string | null;
  credit_limit:  number | null;
  payment_terms: string | null;
  status:        string | null;
}

// ── Toast ──────────────────────────────────────────────────────
const Toast = ({ type, msg }: { type: "success" | "error"; msg: string }) => (
  <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-2xl border text-sm font-medium
    ${type === "success" ? "bg-green-950 border-green-700/50 text-green-300" : "bg-red-950 border-red-700/50 text-red-300"}`}>
    {type === "success" ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
    {msg}
  </div>
);

// ── Edit Panel ─────────────────────────────────────────────────
const EditPanel = ({ customer, onSave, onCancel }: {
  customer: DbCustomer;
  onSave: (updated: DbCustomer) => void;
  onCancel: () => void;
}) => {
  const [f, setF] = useState({ ...customer });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof DbCustomer, v: string | number | null) =>
    setF(prev => ({ ...prev, [k]: v }));

  const DISTRICTS = [
    "Sitamarhi","Darbhanga","Samastipur","Purnia","Katihar","Begusarai",
    "Bhojpur","Buxar","Rohtas","Muzaffarpur","Patna","Nalanda","Gaya",
    "Bhagalpur","Munger","Vaishali","Saran","Gopalganj","East Champaran",
    "West Champaran","Madhubani","Supaul","Saharsa","Madhepura","Araria",
    "Kishanganj","Sheohar","Lakhisarai","Jehanabad","Aurangabad","Nawada","Other",
  ];
  const STATES = [
    "Bihar","Jharkhand","Uttar Pradesh","West Bengal","Delhi","Maharashtra",
    "Gujarat","Rajasthan","Madhya Pradesh","Karnataka","Tamil Nadu",
    "Telangana","Andhra Pradesh","Other",
  ];

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      trade_name:    f.trade_name    || null,
      taxpayer_type: f.taxpayer_type || null,
      pan:           f.pan           || null,
      contact_name:  f.contact_name  || null,
      mobile:        f.mobile        || null,
      email:         f.email         || null,
      street:        f.street        || null,
      city:          f.city          || null,
      state:         f.state         || null,
      pin_code:      f.pin_code      || null,
      district:      f.district      || null,
      credit_limit:  f.credit_limit  ?? null,
      payment_terms: f.payment_terms || null,
      status:        f.status        || "Active",
      location:      f.city          || null,
      contacts:      [f.mobile, f.email].filter(Boolean).join(" · ") || null,
    };
    try {
      const updated = await upsertCustomer({ ...f, ...payload } as DbCustomer);
      onSave(updated as DbCustomer);
    } finally {
      setSaving(false);
    }
  };

  const L = ({ children, req }: { children: React.ReactNode; req?: boolean }) => (
    <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
      {children}{req && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );

  return (
    <Card className="border-primary/25 bg-primary/[0.02] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Edit2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">Edit Customer Profile</p>
            <p className="text-xs text-muted-foreground">Changes save directly to database</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onCancel}
            className="h-9 px-4 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 h-9 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
            {saving ? <><RefreshCw className="h-4 w-4 animate-spin" />Saving…</> : <><Check className="h-4 w-4" />Save Changes</>}
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">

        {/* Identity */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Business Identity</p>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <L>Legal Name</L>
              <Input className="h-9 text-sm bg-muted/30" value={f.customer_name} readOnly />
              <p className="text-xs text-muted-foreground mt-1">Cannot be changed (linked to invoices)</p>
            </div>
            <div>
              <L>Trade Name</L>
              <Input className="h-9 text-sm" placeholder="Common market name"
                value={f.trade_name ?? ""} onChange={e => set("trade_name", e.target.value)} />
            </div>
            <div>
              <L>GSTIN</L>
              <div className="flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-muted/30 font-mono text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />
                {f.gstin}
              </div>
            </div>
            <div>
              <L>PAN</L>
              <Input className="h-9 text-sm font-mono uppercase"
                value={f.pan ?? ""} onChange={e => set("pan", e.target.value.toUpperCase())} />
            </div>
            <div>
              <L>Taxpayer Type</L>
              <Select value={f.taxpayer_type ?? "Regular"} onValueChange={v => set("taxpayer_type", v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Regular">Regular</SelectItem>
                  <SelectItem value="Composition">Composition</SelectItem>
                  <SelectItem value="Unregistered">Unregistered</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <L>Status</L>
              <Select value={f.status ?? "Active"} onValueChange={v => set("status", v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                  <SelectItem value="Blacklisted">Blacklisted</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Contact */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <User className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact Details</p>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <L>Contact Person</L>
              <Input className="h-9 text-sm" placeholder="Owner / Director"
                value={f.contact_name ?? ""} onChange={e => set("contact_name", e.target.value)} />
            </div>
            <div>
              <L>Mobile Number</L>
              <Input className="h-9 text-sm" type="tel" placeholder="10-digit mobile"
                value={f.mobile ?? ""} onChange={e => set("mobile", e.target.value)} />
            </div>
            <div>
              <L>Email Address</L>
              <Input className="h-9 text-sm" type="email" placeholder="accounts@firm.com"
                value={f.email ?? ""} onChange={e => set("email", e.target.value)} />
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
              <L>Street Address</L>
              <Input className="h-9 text-sm" placeholder="Shop No., Street, Area"
                value={f.street ?? ""} onChange={e => set("street", e.target.value)} />
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <L>City</L>
                <Input className="h-9 text-sm" placeholder="City"
                  value={f.city ?? ""} onChange={e => set("city", e.target.value)} />
              </div>
              <div>
                <L>District</L>
                <Select value={f.district ?? "Other"} onValueChange={v => set("district", v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-52">
                    {DISTRICTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <L>State</L>
                <Select value={f.state ?? "Bihar"} onValueChange={v => set("state", v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-52">
                    {STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <L>PIN Code</L>
                <Input className="h-9 text-sm" placeholder="6-digit PIN" maxLength={6}
                  value={f.pin_code ?? ""} onChange={e => set("pin_code", e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        {/* Financial */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Financial Terms</p>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <L>Credit Limit (₹)</L>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                <Input className="h-9 text-sm pl-7" type="number" min="0"
                  value={f.credit_limit ?? ""} onChange={e => set("credit_limit", parseFloat(e.target.value) || 0)} />
              </div>
            </div>
            <div>
              <L>Payment Terms</L>
              <Select value={f.payment_terms ?? "Net 30"} onValueChange={v => set("payment_terms", v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Advance">Advance</SelectItem>
                  <SelectItem value="Net 15">Net 15 (15 days)</SelectItem>
                  <SelectItem value="Net 30">Net 30 (30 days)</SelectItem>
                  <SelectItem value="Net 45">Net 45 (45 days)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

// ══════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════
const CustomerProfile = () => {
  const { customerName } = useParams<{ customerName: string }>();
  const navigate = useNavigate();
  const name = decodeURIComponent(customerName ?? "");

  const [customer,  setCustomer]  = useState<DbCustomer | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [notFound,  setNotFound]  = useState(false);
  const [editing,   setEditing]   = useState(false);
  const [toast,     setToast]     = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await getCustomerByName(name);

        if (data) {
          setCustomer(data as DbCustomer);
        } else {
          // Fallback: build a minimal profile from invoice data so the page
          // still works for customers who exist in invoices but not in Supabase
          const invoiceMatch = (await getAllInvoices()).find(i => i.customerName === name);
          if (invoiceMatch) {
            setCustomer({
              id:            invoiceMatch.gstin,
              customer_name: invoiceMatch.customerName,
              gstin:         invoiceMatch.gstin,
              location:      invoiceMatch.placeOfSupply,
              contacts:      null,
              trade_name:    invoiceMatch.customerName,
              taxpayer_type: "Regular",
              pan:           null,
              contact_name:  null,
              mobile:        null,
              email:         null,
              street:        null,
              city:          invoiceMatch.placeOfSupply,
              state:         "Bihar",
              pin_code:      null,
              district:      invoiceMatch.placeOfSupply,
              credit_limit:  null,
              payment_terms: "Net 30",
              status:        "Active",
            });
          } else {
            setNotFound(true);
          }
        }
      } catch (err) {
        console.error("[CustomerProfile] load failed:", err);
        setNotFound(true);
      }
      setLoading(false);
    };
    load();
  }, [name]);

  // ── Invoice + payment data (async — Supabase) ───────────────
  const [invoices,    setInvoices]    = useState<ReturnType<typeof buildInvoiceRows>>([]);
  const [allPayments, setAllPayments] = useState<Awaited<ReturnType<typeof getAllPayments>>>([]);
  const [invoiceLoading, setInvoiceLoading] = useState(true);

  function buildInvoiceRows(
    rawInvoices: Awaited<ReturnType<typeof getAllInvoices>>,
    rawPayments: Awaited<ReturnType<typeof getAllPayments>>,
  ) {
    return rawInvoices
      .filter(d => d.customerName === name)
      .map(d => {
        const invPayments = rawPayments.filter(p => p.invoiceNo === d.invoiceNo);
        const totalPaid   = invPayments.reduce((s, p) => s + p.amountPaid, 0);
        const outstanding = Math.max(0, d.totalAmount - totalPaid);
        const days = (Date.now() - new Date(d.invoiceDate).getTime()) / 86400000;
        const status: "Paid" | "Partial" | "Overdue" | "Pending" =
          totalPaid >= d.totalAmount ? "Paid"
          : totalPaid > 0 ? "Partial"
          : days > 30 ? "Overdue" : "Pending";
        return { ...d, totalPaid, outstanding, status, invPayments };
      })
      .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));
  }

  useEffect(() => {
    if (!name) return;
    setInvoiceLoading(true);
    Promise.all([getAllInvoices(), getAllPayments()])
      .then(([rawInvoices, rawPayments]) => {
        setInvoices(buildInvoiceRows(rawInvoices, rawPayments));
        setAllPayments(
          rawPayments
            .filter(p => p.customerName === name)
            .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate)),
        );
      })
      .catch(err => console.error("[CustomerProfile] invoice/payment fetch failed:", err))
      .finally(() => setInvoiceLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  // ── States ────────────────────────────────────────────────
  const totalRevenue     = invoices.reduce((s, d) => s + d.totalAmount, 0);
  const totalPaid        = invoices.reduce((s, d) => s + d.totalPaid, 0);
  const totalOutstanding = invoices.reduce((s, d) => s + d.outstanding, 0);
  const paidCount        = invoices.filter(d => d.status === "Paid").length;
  const partialCount     = invoices.filter(d => d.status === "Partial").length;
  const pendingCount     = invoices.filter(d => d.status === "Pending").length;
  const overdueCount     = invoices.filter(d => d.status === "Overdue").length;
  const collectionRate   = totalRevenue > 0 ? (totalPaid / totalRevenue) * 100 : 0;

  // ── Loading ───────────────────────────────────────────────
  if (loading || invoiceLoading) return (
    <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground">
      <RefreshCw className="h-5 w-5 animate-spin" />
      <span className="text-sm">Loading customer…</span>
    </div>
  );

  if (notFound) return (
    <div className="space-y-4">
      <button onClick={() => navigate("/customers")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Customers
      </button>
      <Card className="p-10 text-center space-y-3">
        <div className="h-12 w-12 rounded-full bg-muted/40 flex items-center justify-center mx-auto">
          <AlertCircle className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-semibold">Customer not found</p>
        <p className="text-xs text-muted-foreground">"{name}" doesn't exist in the database.</p>
        <button onClick={() => navigate("/customers?create=true")}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus className="h-4 w-4" /> Add this customer
        </button>
      </Card>
    </div>
  );

  const statusColor = customer?.status === "Active" ? "text-green-400 border-green-500/30 bg-green-500/10"
    : customer?.status === "Blacklisted" ? "text-red-400 border-red-500/30 bg-red-500/10"
    : "text-muted-foreground border-border bg-muted/30";

  return (
    <div className="space-y-5">
      {toast && <Toast type={toast.type} msg={toast.msg} />}

      {/* Back */}
      <button onClick={() => navigate("/customers")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Customers
      </button>

      {/* ── Profile Header Card ── */}
      <Card className="p-6">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
            <span className="text-xl font-bold text-primary">
              {name.charAt(0).toUpperCase()}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            {/* Name + status + edit */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-foreground leading-tight">{name}</h2>
                {customer?.trade_name && customer.trade_name !== name && (
                  <p className="text-sm text-muted-foreground mt-0.5">{customer.trade_name}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {/* GSTIN */}
                  <span className="flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-full border border-border bg-muted/30">
                    <ShieldCheck className="h-3 w-3 text-green-400" />
                    {customer?.gstin}
                  </span>
                  {/* Status */}
                  {customer?.status && (
                    <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${statusColor}`}>
                      {customer.status}
                    </span>
                  )}
                  {/* Taxpayer type */}
                  {customer?.taxpayer_type && (
                    <span className="text-xs px-2 py-1 rounded-full border border-border text-muted-foreground">
                      {customer.taxpayer_type}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => setEditing(v => !v)}
                  className={`flex items-center gap-2 h-9 px-4 rounded-lg border text-sm font-medium transition-colors
                    ${editing ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                  {editing ? <X className="h-4 w-4" /> : <Edit2 className="h-4 w-4" />}
                  {editing ? "Cancel" : "Edit"}
                </button>
                <button
                  onClick={() => navigate(`/invoices/create?customer=${encodeURIComponent(name)}&gstin=${encodeURIComponent(customer?.gstin ?? "")}`)}
                  className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
                  <Plus className="h-4 w-4" /> Create Invoice
                </button>
              </div>
            </div>

            {/* Contact info row */}
            <div className="flex flex-wrap gap-4 mt-4">
              {customer?.mobile && (
                <a href={`tel:${customer.mobile}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <Phone className="h-3.5 w-3.5" /> {customer.mobile}
                </a>
              )}
              {customer?.email && (
                <a href={`mailto:${customer.email}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <Mail className="h-3.5 w-3.5" /> {customer.email}
                </a>
              )}
              {(customer?.city || customer?.state) && (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {[customer?.city, customer?.district, customer?.state].filter(Boolean).join(", ")}
                </span>
              )}
              {customer?.contact_name && (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" /> {customer.contact_name}
                </span>
              )}
            </div>

            {/* Financial terms strip */}
            {(customer?.payment_terms || customer?.credit_limit) && (
              <div className="flex gap-4 mt-3 pt-3 border-t border-border/50">
                {customer.payment_terms && (
                  <div className="text-xs">
                    <span className="text-muted-foreground">Payment Terms: </span>
                    <span className="font-medium">{customer.payment_terms}</span>
                  </div>
                )}
                {customer.credit_limit && (
                  <div className="text-xs">
                    <span className="text-muted-foreground">Credit Limit: </span>
                    <span className="font-medium">{fmt(customer.credit_limit)}</span>
                  </div>
                )}
                {customer.pan && (
                  <div className="text-xs">
                    <span className="text-muted-foreground">PAN: </span>
                    <span className="font-mono font-medium">{customer.pan}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* ── Edit Panel (inline, slides open) ── */}
      {editing && customer && (
        <EditPanel
          customer={customer}
          onSave={(updated) => {
            setCustomer(updated);
            setEditing(false);
            showToast("success", "Customer profile updated successfully.");
          }}
          onCancel={() => setEditing(false)}
        />
      )}

      {/* ── KPIs ── */}
      {invoices.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Revenue",    value: fmt(totalRevenue),     color: "text-foreground",  sub: `${invoices.length} invoices` },
            { label: "Collected",        value: fmt(totalPaid),        color: "text-green-400",   sub: `${collectionRate.toFixed(1)}% collection rate` },
            { label: "Outstanding",      value: fmt(totalOutstanding), color: totalOutstanding > 0 ? "text-red-400" : "text-green-400", sub: `${pendingCount + partialCount + overdueCount} unpaid` },
            { label: "Invoices",         value: `${paidCount}/${invoices.length} paid`, color: "text-foreground", sub: `${overdueCount > 0 ? overdueCount + " overdue" : ""}` },
          ].map(c => (
            <Card key={c.label} className="p-4">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className={`text-lg font-bold mt-0.5 ${c.color}`}>{c.value}</p>
              {c.sub && <p className="text-xs text-muted-foreground mt-0.5">{c.sub}</p>}
            </Card>
          ))}
        </div>
      )}

      {/* ── Invoice history + Payments in two columns ── */}
      <div className={`grid gap-5 ${allPayments.length > 0 ? "grid-cols-3" : "grid-cols-1"}`}>

        {/* Invoice History */}
        <Card className={`p-0 overflow-hidden ${allPayments.length > 0 ? "col-span-2" : "col-span-1"}`}>
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-muted/15">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Invoice History ({invoices.length})</p>
            <button onClick={() => navigate(`/invoices/create?customer=${encodeURIComponent(name)}&gstin=${encodeURIComponent(customer?.gstin ?? "")}`)}
              className="text-xs text-primary hover:underline flex items-center gap-1">
              <Plus className="h-3 w-3" /> New Invoice
            </button>
          </div>
          {invoices.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm text-muted-foreground">No invoices yet</p>
              <button onClick={() => navigate(`/invoices/create?customer=${encodeURIComponent(name)}&gstin=${encodeURIComponent(customer?.gstin ?? "")}`)}
                className="mt-3 text-xs text-primary hover:underline">Create first invoice →</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/25">
                    {["Invoice No.", "Date", "Amount", "Paid", "Outstanding", "Status"].map(h => (
                      <th key={h} className={`px-4 py-2.5 text-xs font-semibold text-muted-foreground ${["Amount","Paid","Outstanding"].includes(h) ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id}
                      onClick={() => navigate(`/invoices/${encodeURIComponent(inv.invoiceNo)}`)}
                      className="border-t border-border/50 hover:bg-muted/20 transition-colors cursor-pointer group">
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground group-hover:text-foreground transition-colors">{inv.invoiceNo}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(inv.invoiceDate)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">{fmt(inv.totalAmount)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-green-400">{fmt(inv.totalPaid)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {inv.outstanding > 0 ? <span className="text-red-400">{fmt(inv.outstanding)}</span> : <span className="text-green-400 text-xs">Cleared</span>}
                      </td>
                      <td className="px-4 py-2.5"><StatusPill status={inv.status} /></td>
                    </tr>
                  ))}
                  {/* Totals */}
                  <tr className="border-t-2 border-border bg-muted/20">
                    <td colSpan={2} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">Totals ({invoices.length})</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold">{fmt(totalRevenue)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-green-400">{fmt(totalPaid)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-red-400">{totalOutstanding > 0 ? fmt(totalOutstanding) : "—"}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Payment History */}
        {allPayments.length > 0 && (
          <Card className="p-0 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border bg-muted/15">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payments ({allPayments.length})</p>
            </div>
            <div className="divide-y divide-border/40">
              {allPayments.map(p => (
                <div key={p.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/15 transition-colors">
                  <div>
                    <p className="text-xs font-mono text-muted-foreground">{p.invoiceNo}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {p.paymentMethod} · {fmtDate(p.paymentDate)}
                    </p>
                    {p.reference && <p className="text-xs text-muted-foreground/60 font-mono mt-0.5">{p.reference}</p>}
                  </div>
                  <p className="text-sm font-bold text-green-400 tabular-nums">+{fmt(p.amountPaid)}</p>
                </div>
              ))}
              <div className="flex items-center justify-between px-4 py-3 bg-muted/20">
                <p className="text-xs font-semibold text-muted-foreground">Total Received</p>
                <p className="text-sm font-bold text-green-400 tabular-nums">{fmt(allPayments.reduce((s, p) => s + p.amountPaid, 0))}</p>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default CustomerProfile;
