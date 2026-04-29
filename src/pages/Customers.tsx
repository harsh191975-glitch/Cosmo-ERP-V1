import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { buildInvoicesWithPayments, EnrichedInvoice } from "@/data/invoiceStore";
import {
  CustomerRecord,
  CustomerStatus,
  deleteCustomer,
  getCustomers,
  upsertCustomer,
} from "@/data/customerStore";
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
  Check,
  ChevronRight,
  CreditCard,
  Plus,
  RefreshCw,
  Search,
  TrendingUp,
  UserPlus,
  Users,
  X,
} from "lucide-react";

type PaymentTerms = "Advance" | "Net 15" | "Net 30" | "Net 45" | "Net 60";

interface CustomerForm {
  id: string;
  gstin: string;
  legalName: string;
  tradeName: string;
  taxpayerType: string;
  gstStatus: "Active" | "Inactive";
  address: string;
  city: string;
  state: string;
  pinCode: string;
  district: string;
  primaryContact: string;
  primaryPhone: string;
  email: string;
  purchasingManager: string;
  accountsPayable: string;
  creditLimit: number;
  paymentTerms: PaymentTerms;
  openingBalance: number;
  status: CustomerStatus;
}

interface CustomerStats {
  totalRevenue: number;
  totalPaid: number;
  totalOutstanding: number;
  invoiceCount: number;
  lastInvoice: string;
  pendingCount: number;
}

interface EnrichedCustomer extends CustomerForm, CustomerStats {}

const formatCurrency = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

const STATUS_STYLE: Record<CustomerStatus, string> = {
  Active: "bg-green-950/60 text-green-400 border-green-700/40",
  Inactive: "bg-muted/60 text-muted-foreground border-border",
  Blacklisted: "bg-red-950/60 text-red-400 border-red-700/40",
};

const EMPTY_STATS: CustomerStats = {
  totalRevenue: 0,
  totalPaid: 0,
  totalOutstanding: 0,
  invoiceCount: 0,
  lastInvoice: "",
  pendingCount: 0,
};

const simulateGstinFetch = (gstin: string): Partial<CustomerForm> | null => {
  const known: Record<string, Partial<CustomerForm>> = {
    "10ACPPA9600B1ZD": { legalName: "Amit Pipe Centre", tradeName: "Amit Pipe Centre", taxpayerType: "Regular", gstStatus: "Active", city: "Begusarai", state: "Bihar", district: "Begusarai" },
    "10BMDPK0501L1ZQ": { legalName: "Kamakhya Traders", tradeName: "Kamakhya Traders", taxpayerType: "Regular", gstStatus: "Active", city: "Ara", state: "Bihar", district: "Bhojpur" },
    "10ALUPK0259J1Z1": { legalName: "Kamal Prasad Pawan Kumar", tradeName: "Kamal Prasad Pawan Kumar", taxpayerType: "Regular", gstStatus: "Active", city: "Sitamarhi", state: "Bihar", district: "Sitamarhi" },
    "10FKZPK2218G1Z5": { legalName: "L.P.B Agency", tradeName: "L.P.B Agency", taxpayerType: "Regular", gstStatus: "Active", city: "Purnea", state: "Bihar", district: "Purnea" },
    "10AAGFK9233K1ZD": { legalName: "M/s Krishi Auzar Bhandar, Buxar", tradeName: "Krishi Auzar Bhandar", taxpayerType: "Regular", gstStatus: "Active", city: "Buxar", state: "Bihar", district: "Buxar" },
    "10AKKPG2420Q1ZC": { legalName: "M/s Maa Bhawani Traders", tradeName: "Maa Bhawani Traders", taxpayerType: "Regular", gstStatus: "Active", city: "Ara", state: "Bihar", district: "Bhojpur" },
    "10BKPPK5111C2ZS": { legalName: "New Sharda Sanitary Mahal", tradeName: "New Sharda Sanitary", taxpayerType: "Regular", gstStatus: "Active", city: "Bhagwanpur", state: "Bihar", district: "Vaishali" },
    "10AFEPJ9289B1ZO": { legalName: "Pipe House", tradeName: "Pipe House", taxpayerType: "Regular", gstStatus: "Active", city: "Darbhanga", state: "Bihar", district: "Darbhanga" },
    "10AAGCC6589D1ZT": { legalName: "Shivshakti Stores Private Limited", tradeName: "Shivshakti Stores", taxpayerType: "Regular", gstStatus: "Active", city: "Samastipur", state: "Bihar", district: "Samastipur" },
    "10AAGHM4700H1ZS": { legalName: "Singhal Agency", tradeName: "Singhal Agency", taxpayerType: "Regular", gstStatus: "Active", city: "Katihar", state: "Bihar", district: "Katihar" },
    "10BOBPK0370R1Z1": { legalName: "Sri Sai Nath Traders", tradeName: "Sri Sai Nath Traders", taxpayerType: "Regular", gstStatus: "Active", city: "Sasaram", state: "Bihar", district: "Rohtas" },
    "10DLSPS9333A1Z2": { legalName: "Ganpati Traders", tradeName: "Ganpati Traders", taxpayerType: "Regular", gstStatus: "Active", city: "Raxaul", state: "Bihar", district: "East Champaran" },
  };

  return known[gstin.toUpperCase()] ?? null;
};

const EMPTY_FORM: CustomerForm = {
  id: "",
  gstin: "",
  legalName: "",
  tradeName: "",
  taxpayerType: "Regular",
  gstStatus: "Active",
  address: "",
  city: "",
  state: "Bihar",
  pinCode: "",
  district: "",
  primaryContact: "",
  primaryPhone: "",
  email: "",
  purchasingManager: "",
  accountsPayable: "",
  creditLimit: 500000,
  paymentTerms: "Net 30",
  openingBalance: 0,
  status: "Active",
};

function toCustomerForm(customer: CustomerRecord): CustomerForm {
  return {
    id: customer.id,
    gstin: customer.gstin,
    legalName: customer.customer_name,
    tradeName: customer.trade_name ?? "",
    taxpayerType: customer.taxpayer_type ?? "Regular",
    gstStatus: "Active",
    address: customer.street ?? "",
    city: customer.city ?? "",
    state: customer.state ?? "Bihar",
    pinCode: customer.pin_code ?? "",
    district: customer.district ?? "",
    primaryContact: customer.contact_name ?? "",
    primaryPhone: customer.mobile ?? "",
    email: customer.email ?? "",
    purchasingManager: "",
    accountsPayable: "",
    creditLimit: customer.credit_limit ?? 0,
    paymentTerms: (customer.payment_terms as PaymentTerms) ?? "Net 30",
    openingBalance: 0,
    status: customer.status ?? "Active",
  };
}

function toCustomerRecord(customer: CustomerForm): CustomerRecord {
  const extraContacts = [
    customer.purchasingManager && `Purchasing: ${customer.purchasingManager}`,
    customer.accountsPayable && `Accounts: ${customer.accountsPayable}`,
  ].filter(Boolean);

  return {
    id: customer.id || customer.gstin,
    customer_name: customer.legalName,
    gstin: customer.gstin,
    location: customer.city || customer.district || null,
    contacts: extraContacts.length > 0 ? extraContacts.join(" | ") : null,
    trade_name: customer.tradeName || null,
    taxpayer_type: customer.taxpayerType || null,
    pan: null,
    contact_name: customer.primaryContact || null,
    mobile: customer.primaryPhone || null,
    email: customer.email || null,
    street: customer.address || null,
    city: customer.city || null,
    state: customer.state || null,
    pin_code: customer.pinCode || null,
    district: customer.district || null,
    credit_limit: customer.creditLimit,
    payment_terms: customer.paymentTerms,
    status: customer.status,
  };
}

function buildStatsMap(invoices: EnrichedInvoice[]): Map<string, CustomerStats> {
  const map = new Map<string, CustomerStats>();

  invoices.forEach((invoice) => {
    const key = invoice.gstin || invoice.customerName.trim().toLowerCase();
    const current = map.get(key) ?? { ...EMPTY_STATS };
    current.totalRevenue += invoice.totalAmount;
    current.totalPaid += invoice.totalPaid;
    current.totalOutstanding += invoice.outstanding;
    current.invoiceCount += 1;
    if (invoice.outstanding > 0) current.pendingCount += 1;
    if (invoice.invoiceDate > current.lastInvoice) current.lastInvoice = invoice.invoiceDate;
    map.set(key, current);
  });

  return map;
}

type FormTab = "gst" | "contact" | "financial";

const AddCustomerModal = ({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (customer: CustomerForm) => Promise<void>;
}) => {
  const [tab, setTab] = useState<FormTab>("gst");
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM);
  const [fetching, setFetching] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof CustomerForm, value: string | number) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleFetch = () => {
    if (form.gstin.length !== 15) {
      setError("GSTIN must be exactly 15 characters.");
      return;
    }

    setFetching(true);
    setError(null);
    setFetched(false);

    setTimeout(() => {
      const result = simulateGstinFetch(form.gstin);
      if (result) {
        setForm((prev) => ({ ...prev, ...result }));
        setFetched(true);
        setTab("contact");
      } else {
        setError(`GSTIN ${form.gstin} not found in database. Please fill details manually.`);
        setFetched(false);
      }
      setFetching(false);
    }, 800);
  };

  const handleSave = async () => {
    if (!form.gstin || !form.legalName) {
      setError("GSTIN and Legal Name are required.");
      setTab("gst");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onSave({ ...form, id: form.id || form.gstin });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save customer.");
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: FormTab; label: string }[] = [
    { id: "gst", label: "GST Details" },
    { id: "contact", label: "Contacts" },
    { id: "financial", label: "Financials" },
  ];

  const labelCls = "block text-[10px] font-semibold text-muted-foreground/70 mb-2 uppercase tracking-widest";
  const inputCls = "h-10 text-sm bg-background/60 border-white/[0.08] focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/40";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />

      <div className="relative z-10 my-[1vh] mx-[1vw] flex min-h-[98vh] w-full max-w-[98vw] flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0d0f14] shadow-[0_32px_80px_rgba(0,0,0,0.7)]">
        <div className="h-px w-full flex-shrink-0 bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

        <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.06] bg-white/[0.01] px-8 py-5">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-gradient-to-br from-primary/20 to-primary/5 shadow-[0_0_16px_rgba(var(--primary),0.15)]">
              <UserPlus className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold tracking-tight text-foreground/95">Add New Customer</h2>
              <p className="mt-0.5 text-xs text-muted-foreground/60">Fill in details across the three sections below</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-muted-foreground/50 transition-colors hover:bg-white/[0.06] hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-shrink-0 border-b border-white/[0.06] bg-white/[0.01] px-8">
          {tabs.map((t, i) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px flex items-center gap-2.5 border-b-2 px-5 py-4 text-sm font-medium transition-all ${
                tab === t.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground/50 hover:text-muted-foreground"
              }`}
            >
              <span
                className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border text-[10px] font-bold transition-all ${
                  tab === t.id
                    ? "border-primary/30 bg-primary/20 text-primary"
                    : "border-white/[0.06] bg-white/[0.05] text-muted-foreground/40"
                }`}
              >
                {i + 1}
              </span>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="space-y-6 px-8 py-7">
            {error && (
              <div className="flex items-center gap-2.5 rounded-xl border border-red-500/20 bg-red-950/20 px-4 py-3 text-sm text-red-400/90">
                <X className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {tab === "gst" && (
              <div className="space-y-6">
                <div>
                  <label className={labelCls}>
                    GSTIN <span className="text-red-400">*</span>
                  </label>
                  <div className="flex max-w-xl gap-3">
                    <Input
                      className={`${inputCls} flex-1 font-mono uppercase`}
                      placeholder="15-character GSTIN"
                      maxLength={15}
                      value={form.gstin}
                      onChange={(e) => {
                        set("gstin", e.target.value.toUpperCase());
                        setFetched(false);
                      }}
                    />
                    <button
                      onClick={handleFetch}
                      disabled={fetching || form.gstin.length !== 15}
                      className="flex h-10 items-center gap-2 whitespace-nowrap rounded-lg bg-primary/90 px-5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary hover:shadow-[0_0_16px_rgba(var(--primary),0.3)] disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      {fetching ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          Fetching…
                        </>
                      ) : (
                        "Fetch Details"
                      )}
                    </button>
                  </div>
                  {fetched && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-green-400/80">
                      <Check className="h-3.5 w-3.5" />
                      Details populated from GST registry. Verify below.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-5">
                  <div className="col-span-2">
                    <label className={labelCls}>
                      Legal Name <span className="text-red-400">*</span>
                    </label>
                    <Input className={inputCls} placeholder="As per GST certificate" value={form.legalName} onChange={(e) => set("legalName", e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Trade Name</label>
                    <Input className={inputCls} placeholder="Common trading name" value={form.tradeName} onChange={(e) => set("tradeName", e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-5">
                  <div>
                    <label className={labelCls}>Taxpayer Type</label>
                    <Select value={form.taxpayerType} onValueChange={(v) => set("taxpayerType", v)}>
                      <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Regular">Regular</SelectItem>
                        <SelectItem value="Composition">Composition</SelectItem>
                        <SelectItem value="Unregistered">Unregistered</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className={labelCls}>GST Status</label>
                    <Select value={form.gstStatus} onValueChange={(v) => set("gstStatus", v as "Active" | "Inactive")}>
                      <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="Inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Address</label>
                  <Input className={inputCls} placeholder="Principal place of business" value={form.address} onChange={(e) => set("address", e.target.value)} />
                </div>

                <div className="grid grid-cols-4 gap-5">
                  <div>
                    <label className={labelCls}>City</label>
                    <Input className={inputCls} placeholder="City" value={form.city} onChange={(e) => set("city", e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>District</label>
                    <Input className={inputCls} placeholder="District" value={form.district} onChange={(e) => set("district", e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>State</label>
                    <Input className={inputCls} placeholder="State" value={form.state} onChange={(e) => set("state", e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>PIN Code</label>
                    <Input className={inputCls} placeholder="PIN" value={form.pinCode} onChange={(e) => set("pinCode", e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {tab === "contact" && (
              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-5">
                  <div>
                    <label className={labelCls}>Primary Contact Name</label>
                    <Input className={inputCls} placeholder="Owner / Director" value={form.primaryContact} onChange={(e) => set("primaryContact", e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Phone</label>
                    <Input className={inputCls} type="tel" placeholder="9876543210" value={form.primaryPhone} onChange={(e) => set("primaryPhone", e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Email</label>
                    <Input className={inputCls} type="email" placeholder="accounts@company.com" value={form.email} onChange={(e) => set("email", e.target.value)} />
                  </div>
                </div>

                <div className="border-t border-white/[0.05] pt-2">
                  <p className="mb-5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">Secondary Contacts</p>
                  <div className="grid grid-cols-3 gap-5">
                    <div>
                      <label className={labelCls}>Purchasing Manager</label>
                      <Input className={inputCls} placeholder="Name · Phone" value={form.purchasingManager} onChange={(e) => set("purchasingManager", e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Accounts Payable</label>
                      <Input className={inputCls} placeholder="Name · Phone" value={form.accountsPayable} onChange={(e) => set("accountsPayable", e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tab === "financial" && (
              <div className="space-y-6">
                <div className="grid grid-cols-4 gap-5">
                  <div>
                    <label className={labelCls}>Credit Limit (₹)</label>
                    <Input className={inputCls} type="number" min="0" placeholder="500000" value={form.creditLimit} onChange={(e) => set("creditLimit", parseFloat(e.target.value) || 0)} />
                  </div>
                  <div>
                    <label className={labelCls}>Payment Terms</label>
                    <Select value={form.paymentTerms} onValueChange={(v) => set("paymentTerms", v)}>
                      <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(["Advance", "Net 15", "Net 30", "Net 45", "Net 60"] as PaymentTerms[]).map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className={labelCls}>Opening Balance (₹)</label>
                    <Input className={inputCls} type="number" min="0" placeholder="0" value={form.openingBalance} onChange={(e) => set("openingBalance", parseFloat(e.target.value) || 0)} />
                  </div>
                </div>

                <div>
                  <label className={`${labelCls} mb-3`}>Customer Status</label>
                  <div className="flex max-w-sm gap-3">
                    {(["Active", "Inactive", "Blacklisted"] as CustomerStatus[]).map((status) => (
                      <button
                        key={status}
                        onClick={() => set("status", status)}
                        className={`h-10 flex-1 rounded-xl border text-sm font-semibold transition-all ${
                          form.status === status
                            ? `${STATUS_STYLE[status]} border shadow-sm`
                            : "border-white/[0.07] text-muted-foreground/50 hover:bg-white/[0.04] hover:text-foreground"
                        }`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center justify-between border-t border-white/[0.06] bg-white/[0.01] px-8 py-5">
          <div className="flex items-center gap-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-full transition-all duration-300 ${tab === t.id ? "h-1.5 w-6 bg-primary" : "h-1.5 w-1.5 bg-white/10 hover:bg-white/20"}`}
              />
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="h-10 rounded-xl border border-white/[0.08] px-5 text-sm text-muted-foreground transition-all hover:bg-white/[0.05] hover:text-foreground">
              Cancel
            </button>
            {tab !== "financial" ? (
              <button
                onClick={() => setTab(tab === "gst" ? "contact" : "financial")}
                className="flex h-10 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-[0_0_20px_rgba(var(--primary),0.35)]"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex h-10 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-[0_0_20px_rgba(var(--primary),0.35)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {saving ? "Saving..." : "Save Customer"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const Customers = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [customerRows, setCustomerRows] = useState<CustomerRecord[]>([]);
  const [enrichedInvoices, setEnrichedInvoices] = useState<EnrichedInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"revenue" | "outstanding" | "name">("revenue");
  const [statusFilter, setStatusFilter] = useState("all");

  const setCreateOpen = useCallback((open: boolean) => {
    const next = new URLSearchParams(searchParams);
    if (open) {
      next.set("create", "true");
    } else {
      next.delete("create");
    }
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    try {
      const [customers, invoices] = await Promise.all([
        getCustomers(),
        buildInvoicesWithPayments(),
      ]);
      setCustomerRows(customers);
      setEnrichedInvoices(invoices);
    } catch (err) {
      console.error("[Customers] fetchData failed:", err);
      setFetchError("Failed to load customer data. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const invoiceStats = useMemo(() => buildStatsMap(enrichedInvoices), [enrichedInvoices]);

  const allCustomers = useMemo<EnrichedCustomer[]>(() => {
    return customerRows
      .map((row) => {
        const key = row.gstin || row.customer_name.trim().toLowerCase();
        return {
          ...toCustomerForm(row),
          ...(invoiceStats.get(key) ?? EMPTY_STATS),
        };
      })
      .sort((a, b) => a.legalName.localeCompare(b.legalName));
  }, [customerRows, invoiceStats]);

  const filtered = useMemo(() => {
    const list = allCustomers.filter((customer) => {
      if (statusFilter !== "all" && customer.status !== statusFilter) return false;
      if (!searchTerm) return true;

      const term = searchTerm.toLowerCase();
      return (
        customer.legalName.toLowerCase().includes(term) ||
        customer.tradeName.toLowerCase().includes(term) ||
        customer.gstin.toLowerCase().includes(term) ||
        customer.city.toLowerCase().includes(term) ||
        customer.district.toLowerCase().includes(term)
      );
    });

    return list.sort((a, b) =>
      sortBy === "revenue"
        ? b.totalRevenue - a.totalRevenue
        : sortBy === "outstanding"
          ? b.totalOutstanding - a.totalOutstanding
          : a.legalName.localeCompare(b.legalName),
    );
  }, [allCustomers, searchTerm, sortBy, statusFilter]);

  const totalRevenue = allCustomers.reduce((sum, customer) => sum + customer.totalRevenue, 0);
  const totalOutstanding = allCustomers.reduce((sum, customer) => sum + customer.totalOutstanding, 0);
  const activeCount = allCustomers.filter((customer) => customer.status === "Active").length;
  const avgCredit = allCustomers.length
    ? allCustomers.reduce((sum, customer) => sum + customer.creditLimit, 0) / allCustomers.length
    : 0;

  const handleAdd = async (customer: CustomerForm) => {
    await upsertCustomer(toCustomerRecord(customer));
    await fetchData();
  };

  const handleDelete = async (customer: EnrichedCustomer) => {
    if (!confirm(`Mark ${customer.legalName} as inactive? This keeps invoices and history intact.`)) return;

    try {
      await deleteCustomer(customer.id);
      await fetchData();
    } catch (err) {
      console.error("[Customers] delete failed:", err);
      setFetchError(err instanceof Error ? err.message : "Failed to delete customer.");
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center gap-3 text-sm text-muted-foreground/50">
        <RefreshCw className="h-4 w-4 animate-spin text-primary/60" />
        <span className="tracking-wide">Loading customers...</span>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-red-500/20 bg-red-950/30">
          <AlertCircle className="h-6 w-6 text-red-400/70" />
        </div>
        <p className="text-sm text-muted-foreground/60">{fetchError}</p>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 rounded-xl bg-primary/90 px-4 py-2 text-sm text-primary-foreground transition-all hover:bg-primary hover:shadow-[0_0_16px_rgba(var(--primary),0.3)]"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {searchParams.get("create") === "true" && (
        <AddCustomerModal
          onClose={() => setCreateOpen(false)}
          onSave={handleAdd}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground/95">Customers</h2>
          <p className="mt-1 text-xs tracking-wide text-muted-foreground/50">
            {activeCount} active · {allCustomers.length} total
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="group flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-all duration-200 hover:-translate-y-px hover:bg-primary/90 hover:shadow-[0_0_20px_rgba(var(--primary),0.4)] active:translate-y-0"
        >
          <Plus className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
          Add Customer
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          {
            icon: Users,
            iconColor: "text-primary",
            iconBg: "bg-primary/10 border-primary/20",
            label: "Total Customers",
            value: allCustomers.length.toString(),
            valueColor: "text-foreground/90",
            sub: `${activeCount} active`,
          },
          {
            icon: TrendingUp,
            iconColor: "text-emerald-400",
            iconBg: "bg-emerald-500/10 border-emerald-500/20",
            label: "Total Revenue",
            value: formatCurrency(totalRevenue),
            valueColor: "text-foreground/90",
            sub: `${allCustomers.length} customers`,
          },
          {
            icon: AlertCircle,
            iconColor: "text-amber-400",
            iconBg: "bg-amber-500/10 border-amber-500/20",
            label: "Outstanding",
            value: formatCurrency(totalOutstanding),
            valueColor: totalOutstanding > 0 ? "text-amber-400" : "text-foreground/90",
            sub: `${allCustomers.filter((customer) => customer.totalOutstanding > 0).length} with balance`,
          },
          {
            icon: CreditCard,
            iconColor: "text-sky-400",
            iconBg: "bg-sky-500/10 border-sky-500/20",
            label: "Avg Credit Limit",
            value: formatCurrency(avgCredit),
            valueColor: "text-foreground/90",
            sub: "per customer",
          },
        ].map(({ icon: Icon, iconColor, iconBg, label, value, valueColor, sub }) => (
          <div
            key={label}
            className="group relative cursor-default overflow-hidden rounded-2xl border border-white/[0.07] bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.015] hover:border-white/[0.11]"
            style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 12px rgba(0,0,0,0.25)" }}
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
            <div className={`absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-lg border ${iconBg}`}>
              <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
            </div>
            <div className="relative pr-10">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">{label}</p>
              <p className={`mb-1.5 text-[26px] font-bold leading-none tracking-tight ${valueColor}`}>{value}</p>
              <p className="text-[11px] text-muted-foreground/40">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
          <Input
            className="h-9 rounded-xl border-white/[0.07] bg-white/[0.04] pl-9 text-sm transition-all placeholder:text-muted-foreground/30 focus:border-primary/40 focus:bg-white/[0.06] focus:ring-1 focus:ring-primary/15"
            placeholder="Search by name, GSTIN, city or district..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-36 rounded-xl border-white/[0.07] bg-white/[0.04] text-sm transition-colors hover:bg-white/[0.06]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Inactive">Inactive</SelectItem>
            <SelectItem value="Blacklisted">Blacklisted</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-1 rounded-xl border border-white/[0.06] bg-white/[0.04] p-0.5">
          {(["revenue", "outstanding", "name"] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => setSortBy(opt)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                sortBy === opt
                  ? "border border-primary/25 bg-primary/20 text-primary shadow-[0_0_8px_rgba(var(--primary),0.15)]"
                  : "text-muted-foreground/50 hover:bg-white/[0.04] hover:text-muted-foreground"
              }`}
            >
              {opt === "revenue" ? "By Revenue" : opt === "outstanding" ? "By Outstanding" : "A-Z"}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                {["Customer", "GSTIN", "Location", "Terms", "Invoices", "Revenue", "Outstanding", "Credit Limit", "Status", ""].map((header, index) => (
                  <th
                    key={header + index}
                    className={`whitespace-nowrap px-5 py-3.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40 ${
                      index >= 5 && index <= 7 ? "text-right" : "text-left"
                    }`}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-sm tracking-wide text-muted-foreground/40">
                    No customers found
                  </td>
                </tr>
              ) : filtered.map((customer, index) => {
                const overLimit = customer.creditLimit > 0 && customer.totalOutstanding > customer.creditLimit;

                return (
                  <tr
                    key={customer.id}
                    className="group relative cursor-pointer border-t border-white/[0.04] transition-all duration-150 hover:bg-gradient-to-r hover:from-primary/[0.05] hover:via-primary/[0.03] hover:to-transparent"
                    style={{ background: index % 2 === 0 ? "transparent" : "rgba(255,255,255,0.008)" }}
                    onClick={() => navigate(`/customers/${encodeURIComponent(customer.legalName)}`)}
                  >
                    <td className="relative px-5 py-4">
                      <div className="absolute left-0 top-0 bottom-0 w-px bg-primary/0 transition-all duration-150 group-hover:bg-primary/40" />
                      <p className="leading-tight text-foreground/90 transition-colors group-hover:text-foreground">{customer.legalName}</p>
                      {customer.tradeName && customer.tradeName !== customer.legalName && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground/40">{customer.tradeName}</p>
                      )}
                    </td>
                    <td className="px-5 py-4 font-mono text-[11px] tracking-wider text-muted-foreground/40">{customer.gstin}</td>
                    <td className="px-5 py-4">
                      <p className="text-sm text-foreground/80">{customer.city}</p>
                      {customer.district && <p className="mt-0.5 text-[11px] text-muted-foreground/40">{customer.district}</p>}
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded-md border border-white/[0.06] bg-white/[0.04] px-2 py-0.5 text-xs text-muted-foreground/50">
                        {customer.paymentTerms}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-semibold text-foreground/80">{customer.invoiceCount}</span>
                      {customer.pendingCount > 0 && (
                        <span className="ml-2 rounded-md border border-red-500/15 bg-red-950/30 px-1.5 py-0.5 text-[10px] font-medium text-red-400/70">
                          {customer.pendingCount} pending
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right font-semibold tabular-nums text-foreground/80">
                      {formatCurrency(customer.totalRevenue)}
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums">
                      {customer.totalOutstanding > 0 ? (
                        <span className={`font-semibold ${overLimit ? "text-red-400" : "text-amber-400/90"}`}>
                          {formatCurrency(customer.totalOutstanding)}
                        </span>
                      ) : (
                        <span className="font-medium text-emerald-500/80">₹0</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right text-xs tabular-nums text-muted-foreground/40">
                      {customer.creditLimit > 0 ? formatCurrency(customer.creditLimit) : "—"}
                      {overLimit && <span className="ml-1.5 text-xs text-red-400/80">⚠</span>}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide ${STATUS_STYLE[customer.status]}`}
                        style={customer.status === "Active" ? { boxShadow: "0 0 8px rgba(74,222,128,0.12)" } : {}}
                      >
                        {customer.status === "Active" && (
                          <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-400/80" />
                        )}
                        {customer.status}
                      </span>
                    </td>
                    <td className="px-3 py-4" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => void handleDelete(customer)}
                        className="rounded-lg p-1.5 text-muted-foreground/30 opacity-0 transition-all duration-150 hover:bg-red-950/50 hover:text-red-400/80 group-hover:opacity-100"
                        aria-label={`Mark ${customer.legalName} inactive`}
                        title="Mark inactive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Customers;
