import rawData from "./employeeData.json";

export interface Employee {
  id: string;
  month: string;
  job_description: string;
  monthly_salary_inr: number;
}

export const employeeData: Employee[] = rawData.map((item: any) => ({
  id: item.id,
  month: item.month,
  job_description: item.job_description,
  monthly_salary_inr: item.monthly_salary_inr,
}));

// Unique months present in data
export const employeeMonths = [...new Set(employeeData.map(d => d.month))];

// Total payroll per month (all employees in one month)
export const monthlyPayrollTotal = (month: string) =>
  employeeData.filter(d => d.month === month).reduce((s, d) => s + d.monthly_salary_inr, 0);

// Grand total across all months
export const totalMonthlyPayroll = monthlyPayrollTotal(employeeMonths[0] ?? "");
