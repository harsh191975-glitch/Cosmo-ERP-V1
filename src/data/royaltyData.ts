import rawData from "./royaltyData.json";

export interface Royalty {
  id: number;
  month: string;
  recipient: string;
  category: string;
  gross_amount: number;
  tds_amount: number;
  net_amount: number;
}

export const royaltyData: Royalty[] = rawData.map((item: any) => ({
  id: item.id,
  month: item.month,
  recipient: item.recipient,
  category: item.category,
  gross_amount: item.gross_amount,
  tds_amount: item.tds_amount,
  net_amount: item.net_amount,
}));
