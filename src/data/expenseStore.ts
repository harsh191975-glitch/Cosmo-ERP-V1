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

import { supabase, getCurrentUserId } from "@/lib/supabaseClient";

// ── Canonical type ───────────────────────────────────────────────
export interface ExpenseRow {
  id: string;
  expense_date: string;        // "YYYY-MM-DD"
  category: string;            // one of EXPENSE_CATEGORIES
  amount: number;
  // Optional fields — populated depending on category
  payee_name?: string | null;
  payment_method?: string | null;
  salary_month?: string | null;
  billing_month?: string | null;
  utility_type?: string | null;
  reference_invoice_no?: string | null;
  invoice_freight_amount?: number | null;
  reference_text?: string | null;
  gross_amount?: number | null;
  tds_amount?: number | null;
  notes?: string | null;
  source?: string | null;
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
    .select(
      "id, expense_date, category, amount, " +
      "payee_name, payment_method, salary_month, billing_month, utility_type, " +
      "reference_invoice_no, reference_text, " +
      "gross_amount, tds_amount, notes, source"
    )
    .order("expense_date", { ascending: false });

  if (error) {
    console.error("[expenseStore] getExpenses failed:", error);
    return [];
  }

  return (data ?? []) as ExpenseRow[];
}

// ── Write functions ──────────────────────────────────────────────

export interface NewExpense {
  expense_date: string;   // "YYYY-MM-DD"
  category: ExpenseCategory;
  amount: number;
}

/**
 * Insert a new expense row.
 * Automatically attaches the current user's ID so RLS WITH CHECK passes.
 * Throws on failure — callers should catch and show an error message.
 */
export async function createExpense(expense: NewExpense): Promise<ExpenseRow> {
  if (!expense.expense_date)       throw new Error("Expense date is required.");
  if (!expense.category)           throw new Error("Category is required.");
  if (expense.amount <= 0)         throw new Error("Amount must be greater than 0.");

  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      user_id:      userId,
      expense_date: expense.expense_date,
      category:     expense.category,
      amount:       expense.amount,
    })
    .select("id, expense_date, category, amount")
    .single();

  if (error || !data) throw new Error(`[expenseStore] createExpense: ${error?.message}`);
  return data as ExpenseRow;
}

/**
 * Delete an expense by ID.
 * RLS USING policy ensures users can only delete their own rows.
 */
export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase
    .from("expenses")
    .delete()
    .eq("id", id);

  if (error) throw new Error(`[expenseStore] deleteExpense: ${error.message}`);
}


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
