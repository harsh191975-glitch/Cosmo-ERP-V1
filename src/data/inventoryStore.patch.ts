// ─────────────────────────────────────────────────────────────────────────────
// PATCH — append this block to the bottom of src/data/inventoryStore.ts
// Required by AddPurchase.tsx after the service-layer refactor.
// ─────────────────────────────────────────────────────────────────────────────

export interface Supplier {
  id: string;
  name: string;
}

/**
 * Fetches all purchase suppliers ordered alphabetically.
 * Used by AddPurchase to populate the supplier dropdown without
 * touching Supabase directly from a UI component.
 */
export async function getSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from("purchase_suppliers")
    .select("id, name")
    .order("name");

  if (error) {
    console.error("[COSMO] getSuppliers error:", error.message);
    return [];
  }

  return data ?? [];
}
