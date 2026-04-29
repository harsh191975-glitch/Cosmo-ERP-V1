import rawData from "./purchasesData.json";

export type PurchaseCategory = "raw-materials" | "packaging";

export interface PurchaseItem {
  product_name: string;
  // Raw materials use MT, packaging uses units — one will be present
  quantity_mt?: number;
  rate_per_mt?: number;
  quantity_units?: number;
  rate_per_unit?: number;
  subtotal: number;
}

export interface Purchase {
  id: number;
  category: PurchaseCategory;
  invoice_no: string;
  date: string;
  supplier: string;
  tax_rate: number;
  taxable_amount: number;
  tax: number;
  total: number;
  items: PurchaseItem[];
}

export const purchasesData: Purchase[] = rawData.map((item: any) => ({
  id: item.id,
  category: (item.category?.toLowerCase().replace(" ", "-") ?? "raw-materials") as PurchaseCategory,
  invoice_no: item.invoice_no?.trim() ?? "",
  date: item.date?.trim() ?? "",
  supplier: item.supplier?.trim() ?? "",
  tax_rate: item.tax_rate ?? 18,
  taxable_amount: item.taxable_amount ?? 0,
  tax: item.tax ?? 0,
  total: item.total ?? 0,
  items: (item.items ?? []).map((i: any) => ({
    product_name: i.product_name?.trim() ?? "",
    // Preserve whichever quantity/rate fields are present
    ...(i.quantity_mt    !== undefined && { quantity_mt:    i.quantity_mt }),
    ...(i.rate_per_mt    !== undefined && { rate_per_mt:    i.rate_per_mt }),
    ...(i.quantity_units !== undefined && { quantity_units: i.quantity_units }),
    ...(i.rate_per_unit  !== undefined && { rate_per_unit:  i.rate_per_unit }),
    subtotal: i.subtotal ?? 0,
  })),
}));

export const rawMaterialsData = purchasesData.filter(p => p.category === "raw-materials");
export const packagingData    = purchasesData.filter(p => p.category === "packaging");
