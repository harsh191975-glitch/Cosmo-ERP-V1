import rawData from "./freightData.json";

export interface FreightEntry {
  id: number;
  invoice_number: string;
  date: string;
  freight_amount: number;
}

export const freightData: FreightEntry[] = rawData.map((item: any) => ({
  id: item.id,
  invoice_number: item.invoice_number?.trim() ?? "",
  date: item.date?.trim() ?? "",
  freight_amount: Math.abs(parseFloat(item.freight_amount)), // store as positive
}));

export const totalFreight = freightData.reduce((s, d) => s + d.freight_amount, 0);
