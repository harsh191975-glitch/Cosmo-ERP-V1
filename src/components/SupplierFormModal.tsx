import { useMemo, useState, type ReactNode } from "react";
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
  Building2,
  Check,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  User,
  X,
} from "lucide-react";
import {
  createSupplierRecord,
  updateSupplierRecord,
  type PurchaseSupplierInput,
  type PurchaseSupplierRecord,
} from "@/data/purchaseStore";

const L = ({ children, req }: { children: ReactNode; req?: boolean }) => (
  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
    {children}
    {req && <span className="ml-0.5 text-red-400">*</span>}
  </label>
);

export interface SupplierFormValues extends PurchaseSupplierInput {
  id?: string;
}

const toInitialValues = (initial?: PurchaseSupplierRecord | null): SupplierFormValues => ({
  id: initial?.id,
  name: initial?.name ?? "",
  gstin: initial?.gstin ?? "",
  contact_name: initial?.contact_name ?? "",
  mobile: initial?.mobile ?? "",
  email: initial?.email ?? "",
  address: initial?.address ?? "",
  city: initial?.city ?? "",
  state: initial?.state ?? "Bihar",
  payment_terms: initial?.payment_terms ?? "Net 30",
  notes: initial?.notes ?? "",
});

export const SupplierFormModal = ({
  mode,
  initialSupplier,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  initialSupplier?: PurchaseSupplierRecord | null;
  onClose: () => void;
  onSaved: (supplier: PurchaseSupplierRecord) => void;
}) => {
  const [form, setForm] = useState<SupplierFormValues>(() => toInitialValues(initialSupplier));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(
    () => (mode === "create" ? "Add Supplier" : "Edit Supplier"),
    [mode],
  );

  const set = (key: keyof SupplierFormValues, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError("Supplier name is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload: PurchaseSupplierInput = {
        name: form.name,
        gstin: form.gstin,
        contact_name: form.contact_name,
        mobile: form.mobile,
        email: form.email,
        address: form.address,
        city: form.city,
        state: form.state,
        payment_terms: form.payment_terms,
        notes: form.notes,
      };

      const supplier = mode === "create"
        ? await createSupplierRecord(payload)
        : await updateSupplierRecord(form.id ?? initialSupplier?.id ?? "", payload);

      onSaved(supplier);
      onClose();
    } catch (err: any) {
      if (err?.code === "23505") {
        setError("A supplier with this name already exists.");
      } else {
        setError(err?.message ?? "Failed to save supplier.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <Card className="relative z-10 w-full max-w-4xl overflow-hidden border-primary/20 bg-card shadow-2xl">
        <div className="h-0.5 w-full bg-gradient-to-r from-primary/60 via-primary to-primary/60" />
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <Building2 className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold">{title}</h2>
              <p className="text-xs text-muted-foreground">
                {mode === "create" ? "Create supplier master from purchase supplier table" : "Update supplier master details"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-6">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-700/40 bg-red-950/30 px-4 py-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div>
            <div className="mb-4 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Business Identity</p>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <L req>Supplier Name</L>
                <Input className="h-9 text-sm" value={form.name} onChange={(e) => set("name", e.target.value)} />
              </div>
              <div>
                <L>GSTIN</L>
                <Input className="h-9 text-sm font-mono uppercase" maxLength={15} value={form.gstin ?? ""} onChange={(e) => set("gstin", e.target.value.toUpperCase())} />
              </div>
              <div>
                <L>Payment Terms</L>
                <Select value={form.payment_terms ?? "Net 30"} onValueChange={(value) => set("payment_terms", value)}>
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

          <div>
            <div className="mb-4 flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contact Details</p>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <L>Contact Person</L>
                <Input className="h-9 text-sm" value={form.contact_name ?? ""} onChange={(e) => set("contact_name", e.target.value)} />
              </div>
              <div>
                <L>Mobile</L>
                <Input className="h-9 text-sm" value={form.mobile ?? ""} onChange={(e) => set("mobile", e.target.value)} />
              </div>
              <div>
                <L>Email</L>
                <Input className="h-9 text-sm" type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
              </div>
              <div>
                <L>State</L>
                <Input className="h-9 text-sm" value={form.state ?? ""} onChange={(e) => set("state", e.target.value)} />
              </div>
            </div>
          </div>

          <div>
            <div className="mb-4 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Address</p>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <L>Address</L>
                <Input className="h-9 text-sm" value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} />
              </div>
              <div>
                <L>City</L>
                <Input className="h-9 text-sm" value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} />
              </div>
            </div>
          </div>

          <div>
            <div className="mb-4 flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</p>
              <div className="h-px flex-1 bg-border" />
            </div>
            <textarea
              className="min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary"
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Optional supplier notes or terms..."
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            className="h-9 rounded-lg border border-border px-4 text-sm text-muted-foreground transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex h-9 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {mode === "create" ? "Save Supplier" : "Save Changes"}
          </button>
        </div>
      </Card>
    </div>
  );
};

export default SupplierFormModal;
