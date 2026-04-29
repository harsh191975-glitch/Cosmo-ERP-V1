import rawData from "./paymentsData.json";

export interface Payment {
  id: number;
  invoiceNo: string;
  customerName: string;
  paymentDate: string;
  amountPaid: number;
  paymentMethod: string;
  reference: string;
  status: string;
  notes?: string;
}

export const paymentsData: Payment[] = rawData.map((item: any) => ({
  id: item.id,
  invoiceNo: item.invoiceNo?.trim() ?? "",
  customerName: item.customerName?.trim() ?? "",
  paymentDate: item.paymentDate?.trim() ?? "",
  amountPaid: item.amountPaid ?? 0,
  paymentMethod: item.paymentMethod?.trim() ?? "",
  reference: item.reference?.trim() ?? "",
  status: item.status?.trim() ?? "",
  notes: item.notes?.trim(),
}));
