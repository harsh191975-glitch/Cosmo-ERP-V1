import { supabase, getCurrentUserId } from "@/lib/supabaseClient";

export type CustomerStatus = "Active" | "Inactive" | "Blacklisted";

export interface CustomerRecord {
  id: string;             // UUID, system-generated — READ ONLY, never set on write
  user_id: string;        // Auth user UUID — required for RLS
  customer_name: string;
  gstin: string;          // Business key — unique, used for upsert conflict resolution
  location: string | null;
  contacts: string | null;
  trade_name: string | null;
  taxpayer_type: string | null;
  pan: string | null;
  contact_name: string | null;
  mobile: string | null;
  email: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  pin_code: string | null;
  district: string | null;
  credit_limit: number | null;
  payment_terms: string | null;
  status: CustomerStatus | null;
}

/**
 * Write-side type: id is intentionally excluded.
 * Postgres auto-generates the UUID on INSERT.
 * On conflict (same gstin), the existing row is UPDATE-d.
 */
export type CustomerInput = Omit<CustomerRecord, "id">;

const CUSTOMER_SELECT =
  "id, user_id, customer_name, gstin, location, contacts, trade_name, taxpayer_type, pan, contact_name, mobile, email, street, city, state, pin_code, district, credit_limit, payment_terms, status";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCustomer(row: any): CustomerRecord {
  return {
    id:             row.id,
    user_id:        row.user_id,
    customer_name:  row.customer_name,
    gstin:          row.gstin ?? "",
    location:       row.location ?? null,
    contacts:       row.contacts ?? null,
    trade_name:     row.trade_name ?? null,
    taxpayer_type:  row.taxpayer_type ?? null,
    pan:            row.pan ?? null,
    contact_name:   row.contact_name ?? null,
    mobile:         row.mobile ?? null,
    email:          row.email ?? null,
    street:         row.street ?? null,
    city:           row.city ?? null,
    state:          row.state ?? null,
    pin_code:       row.pin_code ?? null,
    district:       row.district ?? null,
    credit_limit:   row.credit_limit == null ? null : Number(row.credit_limit),
    payment_terms:  row.payment_terms ?? null,
    status:         row.status ?? null,
  };
}

/**
 * Builds the DB payload from a CustomerRecord or CustomerInput.
 * NEVER includes `id` — the UUID is always system-generated.
 * onConflict: "gstin" handles the insert-or-update logic in Postgres.
 */
function toPayload(customer: CustomerInput, userId: string) {
  return {
    // id is deliberately absent — Postgres generates it on INSERT,
    // and the conflict target (gstin) handles UPDATE automatically.
    user_id:        userId,
    customer_name:  customer.customer_name,
    gstin:          customer.gstin,
    location:       customer.location,
    contacts:       customer.contacts,
    trade_name:     customer.trade_name,
    taxpayer_type:  customer.taxpayer_type,
    pan:            customer.pan,
    contact_name:   customer.contact_name,
    mobile:         customer.mobile,
    email:          customer.email,
    street:         customer.street,
    city:           customer.city,
    state:          customer.state,
    pin_code:       customer.pin_code,
    district:       customer.district,
    credit_limit:   customer.credit_limit,
    payment_terms:  customer.payment_terms,
    status:         customer.status,
  };
}

export async function getCustomers(): Promise<CustomerRecord[]> {
  const { data, error } = await supabase
    .from("customers")
    .select(CUSTOMER_SELECT)
    .order("customer_name", { ascending: true });

  if (error) {
    throw new Error(`[customerStore] getCustomers: ${error.message}`);
  }

  return (data ?? []).map(rowToCustomer);
}

export async function getCustomerByName(name: string): Promise<CustomerRecord | null> {
  const { data, error } = await supabase
    .from("customers")
    .select(CUSTOMER_SELECT)
    .eq("customer_name", name)
    .maybeSingle();

  if (error) {
    throw new Error(`[customerStore] getCustomerByName: ${error.message}`);
  }

  return data ? rowToCustomer(data) : null;
}

/**
 * Upsert a customer using gstin as the business key.
 *
 * Requires a composite UNIQUE constraint (one-time migration):
 *   ALTER TABLE customers DROP CONSTRAINT customers_gstin_unique;
 *   ALTER TABLE customers ADD CONSTRAINT customers_user_gstin_unique UNIQUE (user_id, gstin);
 *
 * Behaviour:
 *   - New (user_id + gstin) pair → INSERT, Postgres auto-generates UUID for `id`
 *   - Known (user_id + gstin) pair → UPDATE all other fields on the existing row
 *   - Different user, same gstin → separate row, no conflict (multi-tenant safe)
 *   - `id` is never sent in the payload — no UUID type errors possible
 */
export async function upsertCustomer(customer: CustomerRecord | CustomerInput): Promise<CustomerRecord> {
  // Strip `id` from the payload regardless of whether it was passed in.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _discarded, ...rest } = customer as CustomerRecord;

  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("[customerStore] upsertCustomer: no authenticated user — RLS would reject the insert");
  }

  const { data, error } = await supabase
    .from("customers")
    .upsert(toPayload(rest, userId), {
      onConflict: "user_id,gstin", // composite key — multi-tenant safe
      ignoreDuplicates: false,     // false = UPDATE on conflict (not a silent skip)
    })
    .select(CUSTOMER_SELECT)
    .single();

  if (error || !data) {
    throw new Error(
      `[customerStore] upsertCustomer failed — code: ${error?.code}, message: ${error?.message}, hint: ${error?.hint}`,
    );
  }

  return rowToCustomer(data);
}

/**
 * Soft-delete: marks customer Inactive rather than hard-deleting.
 * Uses UUID `id` (the system key) — correct for row-level operations.
 */
export async function deleteCustomer(id: string): Promise<void> {
  const { error } = await supabase
    .from("customers")
    .update({ status: "Inactive" })
    .eq("id", id);

  if (error) {
    throw new Error(`[customerStore] deleteCustomer: ${error.message}`);
  }
}
