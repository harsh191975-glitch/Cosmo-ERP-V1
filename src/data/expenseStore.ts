/**
 * expenseStore.ts
 * ───────────────────────────────────────────────────────────────
 * Single data-access layer for the `expenses` Supabase table.
 *
 * All components that need expense data (Dashboard, ExpensesReport,
 * PnLReport, CashFlowReport) must import from here — never call
 * supabase.from("expenses") directly in a component or page.
 *
 * Schema (expenses table):
 *   id           uuid / string
 *   expense_date string  — ISO date "YYYY-MM-DD"
 *   category     string  — "Salaries" | "Commission" | "Royalty" | "Utilities" | "Freight"
 *   amount       number
 */

import { supabase } from "@/lib/supabaseClient";

// ── Canonical type ───────────────────────────────────────────────
export interface ExpenseRow {
  id: string;
  expense_date: string;  // "YYYY-MM-DD"
  category: string;      // one of EXPENSE_CATEGORIES
  amount: number;
}

// Known categories — kept here so every consumer can import the
// same constant rather than hard-coding strings independently.
export const EXPENSE_CATEGORIES = [
  "Salaries",
  "Commission",
  "Royalty",
  "Utilities",
  "Freight",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

// ── Store function ───────────────────────────────────────────────
/**
 * Fetch all expense rows from Supabase, ordered by date descending.
 * Returns an empty array (never throws) so callers can use the
 * result directly without a null-check.
 */
export async function getExpenses(): Promise<ExpenseRow[]> {
  const { data, error } = await supabase
    .from("expenses")
    .select("id, expense_date, category, amount")
    .order("expense_date", { ascending: false });

  if (error) {
    console.error("[expenseStore] getExpenses failed:", error);
    return [];
  }

  return (data ?? []) as ExpenseRow[];
}

// ── Convenience helpers ──────────────────────────────────────────
/**
 * Sum all expense rows matching a specific category.
 * Accepts the full unfiltered array so the caller controls
 * period-filtering before passing it in.
 */
export function sumByCategory(expenses: ExpenseRow[], category: string): number {
  return expenses
    .filter(e => e.category === category)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
}
