import { supabase, getCurrentUserId, withRetry } from "@/lib/supabaseClient";

export type ProductStatus = "active" | "inactive";

export interface ProductRecord {
  id:           string;   // UUID — READ ONLY, never set on write
  user_id:      string;   // Auth user UUID — required for RLS
  product_code: string;   // Human-readable key, e.g. "PIPE-0001"
  product_name: string;
  rate:         number;
  uom:          string;
  status:       ProductStatus;
  created_at:   string;
  updated_at:   string;
}

/**
 * Write-side type: id and created_at are system-generated, excluded from writes.
 */
export type ProductInput = Omit<ProductRecord, "id" | "created_at">;

const PRODUCT_SELECT =
  "id, user_id, product_code, product_name, rate, uom, status, created_at, updated_at";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToProduct(row: any): ProductRecord {
  return {
    id:           row.id,
    user_id:      row.user_id,
    product_code: row.product_code,
    product_name: row.product_name,
    rate:         row.rate == null ? 0 : Number(row.rate),
    uom:          row.uom ?? "BDL",
    status:       row.status ?? "active",
    created_at:   row.created_at,
    updated_at:   row.updated_at,
  };
}

function toPayload(product: ProductInput, userId: string) {
  return {
    // id intentionally absent — Postgres generates on INSERT
    user_id:      userId,
    product_code: product.product_code.trim().toUpperCase(),
    product_name: product.product_name.trim(),
    rate:         product.rate,
    uom:          product.uom ?? "BDL",
    status:       product.status ?? "active",
  };
}

/**
 * Fetch all Active products for the current user, ordered by product_code.
 * Used by invoice dropdowns — only shows Active products.
 */
export async function getProducts(): Promise<ProductRecord[]> {
  const { data, error } = await withRetry(() =>
    supabase
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("status", "active")
      .order("product_code", { ascending: true })
  );

  if (error) {
    throw new Error(`[productStore] getProducts: ${error.message}`);
  }

  return (data ?? []).map(rowToProduct);
}

/**
 * Fetch ALL products (Active + Inactive) for admin/management views.
 */
export async function getAllProducts(): Promise<ProductRecord[]> {
  const { data, error } = await withRetry(() =>
    supabase
      .from("products")
      .select(PRODUCT_SELECT)
      .order("product_code", { ascending: true })
  );

  if (error) {
    throw new Error(`[productStore] getAllProducts: ${error.message}`);
  }

  return (data ?? []).map(rowToProduct);
}

/**
 * Create a new product.
 * product_code must be unique per user — Postgres will throw on duplicate.
 */
export async function createProduct(product: Omit<ProductInput, "user_id">): Promise<ProductRecord> {
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("products")
    .insert(toPayload({ ...product, user_id: userId }, userId))
    .select(PRODUCT_SELECT)
    .single();

  if (error || !data) {
    throw new Error(
      `[productStore] createProduct failed — code: ${error?.code}, message: ${error?.message}`
    );
  }

  return rowToProduct(data);
}

/**
 * Update an existing product by UUID.
 * Never changes product_code or user_id.
 */
export async function updateProduct(
  id: string,
  updates: Partial<Pick<ProductRecord, "product_name" | "rate" | "uom" | "status">>
): Promise<ProductRecord> {
  const { data, error } = await supabase
    .from("products")
    .update(updates)
    .eq("id", id)
    .select(PRODUCT_SELECT)
    .single();

  if (error || !data) {
    throw new Error(
      `[productStore] updateProduct failed — code: ${error?.code}, message: ${error?.message}`
    );
  }

  return rowToProduct(data);
}

/**
 * Soft-delete: sets status to Inactive.
 * The product disappears from invoice dropdowns (getProducts filters Active only)
 * but historical invoices remain unaffected.
 */
export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase
    .from("products")
    .update({ status: "Inactive" })
    .eq("id", id);

  if (error) {
    throw new Error(`[productStore] deleteProduct: ${error.message}`);
  }
}

/**
 * Toggle a product between Active ↔ Inactive.
 */
export async function toggleProductStatus(
  id: string,
  currentStatus: ProductStatus
): Promise<ProductRecord> {
  const next: ProductStatus = currentStatus === "active" ? "inactive" : "active";
  return updateProduct(id, { status: next });
}
