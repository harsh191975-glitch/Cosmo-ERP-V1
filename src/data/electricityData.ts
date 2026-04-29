import rawData from "./electricityData.json";

export interface ElectricityBill {
  id: number;
  month: string;
  electricity_bill_amount: number;
}

export const electricityData: ElectricityBill[] = rawData.map((item: any) => ({
  id: item.id,
  month: item.month,
  electricity_bill_amount: item.electricity_bill_amount,
}));

export const totalElectricity = electricityData.reduce((s, d) => s + d.electricity_bill_amount, 0);
