import rawData from "./financeData.json";

export const financeData = rawData.map((row: any, index: number) => ({
  id: index + 1,

  invoiceNo: row["Invoice Number"],
  invoiceDate: row["Invoice Date"],
  customerName: row["Customer Name"],
  placeOfSupply: row["Place of Supply"],
  totalAmount: row["Total Amount"],
  gstin: row["GSTIN"],
  cgst: row["CGST"] || 0,
  sgst: row["SGST"] || 0,
  taxableAmount: row["Taxable Amount"] || 0
}));