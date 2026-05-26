import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createSupplierRecord,
  getPurchases,
  getSupplierRecords,
  type Purchase,
  type PurchaseSupplierInput,
  type PurchaseSupplierRecord,
} from "@/data/purchaseStore";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Check,
  ChevronRight,
  CreditCard,
  IndianRupee,
  MapPin,
  Phone,
  Mail,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  User,
  X,
} from "lucide-react";

const fmt = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

interface SupplierMetrics {
  supplier: PurchaseSupplierRecord;
  totalSpend: number;
  gstPaid: number;
  purchaseCount: number;
  outstanding: number;
  lastPurchaseDate: string | null;
}

// ── Toast ────────────────────────────────────────────────────────────────────
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

// ── Shared form primitives (must be outside any component to avoid remount) ───
const L = ({ children, req }: { children: React.ReactNode; req?: boolean }) => (
  <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
    {children}
    {req && <span className="text-red-400 ml-0.5">*</span>}
  </label>
);

const Field = ({ error, children }: { error?: string; children: React.ReactNode }) => (
  <div>
    {children}
    {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
  </div>
);

// ── Full-page Add Supplier Flow ───────────────────────────────────────────────
const AddSupplierPage = ({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (supplier: PurchaseSupplierRecord) => void;
}) => {
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [f, setF] = useState<PurchaseSupplierInput>({
    name: "",
    gstin: "",
    contact_name: "",
    mobile: "",
    email: "",
    address: "",
    city: "",
    state: "Bihar",
    payment_terms: "Net 30",
    notes: "",
  });

  const set = (k: keyof PurchaseSupplierInput, v: string) =>
    setF((prev) => ({ ...prev, [k]: v }));

  const STATES = [
    "Bihar", "Jharkhand", "Uttar Pradesh", "West Bengal", "Delhi", "Maharashtra",
    "Gujarat", "Rajasthan", "Madhya Pradesh", "Karnataka", "Tamil Nadu",
    "Telangana", "Andhra Pradesh", "Other",
  ];

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!f.name.trim()) errs.name = "Supplier name is required.";
    if (!f.gstin?.trim()) {
      errs.gstin = "GSTIN is required for business identity.";
    } else if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(f.gstin.toUpperCase().trim())) {
      errs.gstin = "Enter a valid 15-character GSTIN.";
    }
    return errs;
  };

  const handleSave = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setSaving(true);
    try {
      const supplier = await createSupplierRecord({
        ...f,
        gstin: f.gstin?.toUpperCase().trim(),
      });
      onSaved(supplier);
    } catch (err) {
      setErrors({ _root: err instanceof Error ? err.message : "Failed to create supplier." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header nav */}
      <div className="flex items-center gap-3">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Suppliers
        </button>
      </div>

      {/* Page title */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Building2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Add New Supplier</h1>
          <p className="text-sm text-muted-foreground">Create a verified supplier profile with GST-based business identity.</p>
        </div>
      </div>

      {errors._root && (
        <Card className="p-4 border-red-500/20 bg-red-950/20 text-red-300 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{errors._root}</span>
        </Card>
      )}

      {/* ── Section 1: Business Identity ─────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-muted/10">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">Business Identity</p>
          </div>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field error={errors.name}>
              <L req>Supplier / Legal Name</L>
              <Input
                className={`h-9 text-sm ${errors.name ? "border-red-500/60" : ""}`}
                placeholder="M/s Example Traders"
                value={f.name}
                onChange={(e) => { set("name", e.target.value); setErrors((p) => ({ ...p, name: "" })); }}
              />
            </Field>

            <Field error={errors.gstin}>
              <L req>GSTIN</L>
              <div className="relative">
                <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className={`h-9 text-sm pl-9 font-mono uppercase ${errors.gstin ? "border-red-500/60" : ""}`}
                  placeholder="22AAAAA0000A1Z5"
                  maxLength={15}
                  value={f.gstin ?? ""}
                  onChange={(e) => { set("gstin", e.target.value.toUpperCase()); setErrors((p) => ({ ...p, gstin: "" })); }}
                />
              </div>
            </Field>

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
      </Card>

      {/* ── Section 2: Contact Details ────────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-muted/10">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <User className="h-3.5 w-3.5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">Contact Details</p>
            <p className="text-xs text-muted-foreground">Point of contact for this supplier.</p>
          </div>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <L>Contact Person</L>
              <Input className="h-9 text-sm" placeholder="Ramesh Kumar" value={f.contact_name ?? ""} onChange={(e) => set("contact_name", e.target.value)} />
            </div>
            <div>
              <L>Mobile Number</L>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input className="h-9 text-sm pl-9" placeholder="9876543210" value={f.mobile ?? ""} onChange={(e) => set("mobile", e.target.value)} />
              </div>
            </div>
            <div>
              <L>Email Address</L>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input className="h-9 text-sm pl-9" placeholder="supplier@example.com" type="email" value={f.email ?? ""} onChange={(e) => set("email", e.target.value)} />
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ── Section 3: Address ───────────────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-muted/10">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <MapPin className="h-3.5 w-3.5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">Business Address</p>
            <p className="text-xs text-muted-foreground">Registered place of business.</p>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <L>Street / Locality</L>
            <Input className="h-9 text-sm" placeholder="Shop No. 12, Gandhi Market" value={f.address ?? ""} onChange={(e) => set("address", e.target.value)} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <L>City</L>
              <Input className="h-9 text-sm" placeholder="Patna" value={f.city ?? ""} onChange={(e) => set("city", e.target.value)} />
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
      </Card>

      {/* ── Section 4: Notes ─────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-muted/10">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <CreditCard className="h-3.5 w-3.5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">Additional Notes</p>
            <p className="text-xs text-muted-foreground">Internal remarks, special terms, or sourcing notes.</p>
          </div>
        </div>
        <div className="p-6">
          <textarea
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
            rows={3}
            placeholder="E.g. preferred supplier for raw materials, net-30 cash only…"
            value={f.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>
      </Card>

      {/* ── Action Bar ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 pb-4">
        <button
          onClick={onClose}
          className="h-10 px-5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 h-10 px-6 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving
            ? <><RefreshCw className="h-4 w-4 animate-spin" /> Saving…</>
            : <><Check className="h-4 w-4" /> Create Supplier</>}
        </button>
      </div>
    </div>
  );
};

// ── Main Suppliers List Page ──────────────────────────────────────────────────
const Suppliers = () => {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<PurchaseSupplierRecord[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [supplierRows, purchaseRows] = await Promise.all([
          getSupplierRecords(),
          getPurchases(),
        ]);
        if (!active) return;
        setSuppliers(supplierRows);
        setPurchases(purchaseRows);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed to load suppliers.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  const supplierMetrics = useMemo<SupplierMetrics[]>(() => {
    const purchaseMap = new Map<string, Purchase[]>();
    purchases.forEach((p) => {
      const cur = purchaseMap.get(p.supplier_id) ?? [];
      cur.push(p);
      purchaseMap.set(p.supplier_id, cur);
    });

    return suppliers.map((supplier) => {
      const rows = purchaseMap.get(supplier.id) ?? [];
      const lastPurchaseDate = rows.reduce<string | null>((latest, row) => {
        if (!latest || row.purchase_date > latest) return row.purchase_date;
        return latest;
      }, null);
      return {
        supplier,
        totalSpend: rows.reduce((s, r) => s + r.total_amount, 0),
        gstPaid: rows.reduce((s, r) => s + r.total_gst, 0),
        purchaseCount: rows.length,
        outstanding: 0,
        lastPurchaseDate,
      };
    }).sort((a, b) => b.totalSpend - a.totalSpend || a.supplier.name.localeCompare(b.supplier.name));
  }, [purchases, suppliers]);

  const filteredSuppliers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return supplierMetrics;
    return supplierMetrics.filter(({ supplier }) =>
      supplier.name.toLowerCase().includes(term) ||
      (supplier.gstin ?? "").toLowerCase().includes(term) ||
      (supplier.mobile ?? "").toLowerCase().includes(term) ||
      (supplier.email ?? "").toLowerCase().includes(term)
    );
  }, [search, supplierMetrics]);

  const totals = useMemo(() => ({
    spend: supplierMetrics.reduce((s, i) => s + i.totalSpend, 0),
    gst: supplierMetrics.reduce((s, i) => s + i.gstPaid, 0),
    purchases: supplierMetrics.reduce((s, i) => s + i.purchaseCount, 0),
    payables: 0,
  }), [supplierMetrics]);

  // ── Full-page Add Supplier view ─────────────────────────────────────────
  if (showAddSupplier) {
    return (
      <AddSupplierPage
        onClose={() => setShowAddSupplier(false)}
        onSaved={(supplier) => {
          setSuppliers((prev) =>
            [...prev, supplier].sort((a, b) => a.name.localeCompare(b.name))
          );
          setShowAddSupplier(false);
          showToast("success", `${supplier.name} added successfully.`);
        }}
      />
    );
  }

  // ── Normal list view ────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {toast && <Toast type={toast.type} msg={toast.msg} />}

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Suppliers</h1>
            <p className="text-sm text-muted-foreground">
              Vendor master, purchase history, and supplier-side spend overview.
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowAddSupplier(true)}
          className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Add Supplier
        </button>
      </div>

      {error && (
        <Card className="p-4 border-red-500/20 bg-red-950/20 text-red-300 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Suppliers",
            value: String(supplierMetrics.length),
            sub: loading ? "Syncing supplier master…" : "Active purchase suppliers",
            icon: Building2,
            color: "text-foreground",
          },
          {
            label: "Total Spend",
            value: fmt(totals.spend),
            sub: `${totals.purchases} purchase entries`,
            icon: IndianRupee,
            color: "text-foreground",
          },
          {
            label: "GST Paid",
            value: fmt(totals.gst),
            sub: "Input tax on purchases",
            icon: Receipt,
            color: "text-amber-400",
          },
          {
            label: "Payables",
            value: fmt(totals.payables),
            sub: "Current purchase flow is cash-booked",
            icon: ShoppingBag,
            color: "text-green-400",
          },
        ].map((card) => (
          <Card key={card.label} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">{card.label}</p>
                <p className={`mt-1 text-lg font-bold ${card.color}`}>{card.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{card.sub}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <card.icon className="h-4 w-4 text-primary" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9 h-10"
            placeholder="Search supplier, GSTIN, phone, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex h-48 items-center justify-center gap-2 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading suppliers…</span>
          </div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-medium">No suppliers found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Try a different search or add a supplier first.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  {["Supplier", "GSTIN", "Purchases", "Total Spend", "Payables", "Last Purchase", ""].map((h) => (
                    <th
                      key={h}
                      className={`px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground ${
                        ["Purchases", "Total Spend", "Payables"].includes(h) ? "text-right" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.map(({ supplier, totalSpend, gstPaid: _g, purchaseCount, outstanding, lastPurchaseDate }) => (
                  <tr
                    key={supplier.id}
                    onClick={() => navigate(`/purchases/suppliers/${supplier.id}`)}
                    className="border-t border-border/50 cursor-pointer transition-colors hover:bg-muted/20"
                  >
                    <td className="px-5 py-4">
                      <div className="font-semibold">{supplier.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {[supplier.contact_name, supplier.mobile || supplier.email]
                          .filter(Boolean)
                          .join(" · ") || "Supplier profile"}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {supplier.gstin ? (
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-green-500/25 bg-green-500/8 px-2.5 py-1">
                          <ShieldCheck className="h-3 w-3 text-green-400 flex-shrink-0" />
                          <span className="font-mono text-xs text-green-300">{supplier.gstin}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/60">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right font-medium">{purchaseCount}</td>
                    <td className="px-5 py-4 text-right font-semibold">{fmt(totalSpend)}</td>
                    <td className="px-5 py-4 text-right text-green-400">{fmt(outstanding)}</td>
                    <td className="px-5 py-4 text-muted-foreground">{fmtDate(lastPurchaseDate)}</td>
                    <td className="px-5 py-4 text-right text-muted-foreground">
                      <ChevronRight className="ml-auto h-4 w-4" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default Suppliers;
