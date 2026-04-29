import { supabase } from "@/lib/supabaseClient";

export type CustomerStatus = "Active" | "Inactive" | "Blacklisted";

export interface CustomerRecord {
  id: string;
  customer_name: string;
  gstin: string;
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

const CUSTOMER_SELECT =
  "id, customer_name, gstin, location, contacts, trade_name, taxpayer_type, pan, contact_name, mobile, email, street, city, state, pin_code, district, credit_limit, payment_terms, status";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCustomer(row: any): CustomerRecord {
  return {
    id: row.id,
    customer_name: row.customer_name,
    gstin: row.gstin ?? "",
    location: row.location ?? null,
    contacts: row.contacts ?? null,
    trade_name: row.trade_name ?? null,
    taxpayer_type: row.taxpayer_type ?? null,
    pan: row.pan ?? null,
    contact_name: row.contact_name ?? null,
    mobile: row.mobile ?? null,
    email: row.email ?? null,
    street: row.street ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    pin_code: row.pin_code ?? null,
    district: row.district ?? null,
    credit_limit: row.credit_limit == null ? null : Number(row.credit_limit),
    payment_terms: row.payment_terms ?? null,
    status: row.status ?? null,
  };
}

function toPayload(customer: CustomerRecord) {
  return {
    id: customer.id || customer.gstin,
    customer_name: customer.customer_name,
    gstin: customer.gstin,
    location: customer.location,
    contacts: customer.contacts,
    trade_name: customer.trade_name,
    taxpayer_type: customer.taxpayer_type,
    pan: customer.pan,
    contact_name: customer.contact_name,
    mobile: customer.mobile,
    email: customer.email,
    street: customer.street,
    city: customer.city,
    state: customer.state,
    pin_code: customer.pin_code,
    district: customer.district,
    credit_limit: customer.credit_limit,
    payment_terms: customer.payment_terms,
    status: customer.status,
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

export async function upsertCustomer(customer: CustomerRecord): Promise<CustomerRecord> {
  const { data, error } = await supabase
    .from("customers")
    .upsert(toPayload({ ...customer, id: customer.id || customer.gstin }), { onConflict: "id" })
    .select(CUSTOMER_SELECT)
    .single();

  if (error || !data) {
    throw new Error(`[customerStore] upsertCustomer: ${error?.message ?? "No data returned"}`);
  }

  return rowToCustomer(data);
}

export async function deleteCustomer(id: string): Promise<void> {
  const { error } = await supabase
    .from("customers")
    .update({ status: "Inactive" })
    .eq("id", id);

  if (error) {
    throw new Error(`[customerStore] deleteCustomer: ${error.message}`);
  }
}
