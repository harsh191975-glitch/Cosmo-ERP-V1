import rawData from "./financeData.json";

export interface LineItem {
  productDescription: string;
  quantity: number;
  uom: string;
  rateInclTax: number;
  rateExclTax: number;
  discountPct: number;
  lineAmount: number;
}

export interface Invoice {
  id: number;
  invoiceNo: string;
  invoiceDate: string;
  bookedBy: string;
  customerName: string;
  gstin: string;
  placeOfSupply: string;
  eWayBillNo: string | null;
  dispatchedThrough: string | null;
  destination: string | null;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  freight: number;
  roundOff: number;
  totalAmount: number;
  weightKg: number;
  lineItems: LineItem[];
  gstRate: number;
}

export const financeData: Invoice[] = rawData.map((item: any, index: number) => {
  const taxable = item["Financial Summary"]?.["Taxable Amount"] ?? 0;
  const cgst    = item["Financial Summary"]?.["CGST"] ?? 0;
  const gstRate = taxable > 0 ? Math.round((cgst / taxable) * 200) : 18;

  const lineItems: LineItem[] = (item["Line Items"] ?? []).map((li: any) => {
    const qty         = li["Quantity"] ?? 0;
    const rateInclTax = li["Rate (Incl Tax)"] ?? 0;
    const discountPct = li["Discount %"] ?? 0;
    const rateExclTax = li["Rate (Excl Tax)"] ?? parseFloat((rateInclTax / (1 + gstRate / 100)).toFixed(2));
    const lineAmount  = li["Line Amount"] ?? parseFloat((qty * rateExclTax * (1 - discountPct / 100)).toFixed(2));
    return {
      productDescription: li["Product Description"]?.trim() ?? "",
      quantity: qty,
      uom: li["UOM"]?.trim() ?? "",
      rateInclTax,
      rateExclTax,
      discountPct,
      lineAmount,
    };
  });

  return {
    id:                index + 1,
    invoiceNo:         item["Invoice Details"]?.["Invoice Number"]?.trim() ?? "",
    invoiceDate:       item["Invoice Details"]?.["Invoice Date"]?.trim() ?? "",
    bookedBy:          item["Invoice Details"]?.["Booked By"]?.trim() ?? "",
    customerName:      item["Customer Details"]?.["Customer Name"]?.trim() ?? "",
    gstin:             item["Customer Details"]?.["GSTIN"]?.trim() ?? "",
    placeOfSupply:     item["Customer Details"]?.["Place of Supply"]?.trim() ?? "",
    eWayBillNo:        item["Shipping & Logistics"]?.["e-Way Bill No"] ?? null,
    dispatchedThrough: item["Shipping & Logistics"]?.["Dispatched Through"] ?? null,
    destination:       item["Shipping & Logistics"]?.["Destination"] ?? null,
    taxableAmount:     taxable,
    cgst,
    sgst:              item["Financial Summary"]?.["SGST"] ?? 0,
    freight:           item["Financial Summary"]?.["Freight"] ?? 0,
    roundOff:          item["Financial Summary"]?.["Round Off"] ?? 0,
    totalAmount:       item["Financial Summary"]?.["Total Invoice Amount"] ?? 0,
    weightKg:          item["Financial Summary"]?.["Total Weight_KG"] ?? 0,
    lineItems,
    gstRate,
  };
});
