import rawData from "./commissionData.json";

export interface Commission {
  id: number;
  month: string;
  recipient: string;
  category: string;
  total_amount: number;
}

export const commissionData: Commission[] = rawData.map((item: any) => ({
  id: item.id,
  month: item.month,
  recipient: item.recipient,
  category: item.category,
  total_amount: item.total_amount,
}));
