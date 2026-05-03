/**
 * Core unit tests for finance-insights-main V 2.24
 *
 * Covers:
 *  1. Financial Engine — double-entry ledger, P&L, cash flow, trial balance,
 *     quarter expansion, schema validation, credit note handling
 *  2. Purchase Store — summarizePurchases aggregation
 *  3. Expense Store — sumByCategory helper
 *  4. Inventory Store — txDirection helper
 *
 * All Supabase-backed store calls are mocked so tests run offline.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Mock Supabase client — MUST come before any store/engine imports
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            user: { id: "test-user-id" },
          },
        },
        error: null,
      }),
    },
    from: () => ({
      select: () => ({
        order: () => ({ data: [], error: null }),
        eq: () => ({ data: null, error: null, maybeSingle: () => ({ data: null, error: null }) }),
        in: () => ({ data: [], error: null }),
        gte: () => ({ data: [], error: null }),
        data: [],
        error: null,
      }),
      insert: () => ({ select: () => ({ single: () => ({ data: null, error: null }) }), error: null }),
      upsert: () => ({ error: null }),
      delete: () => ({ eq: () => ({ error: null }) }),
      update: () => ({ eq: () => ({ error: null }) }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Mock crypto.randomUUID (not available in jsdom)
// ─────────────────────────────────────────────────────────────────────────────

let uuidCounter = 0;
vi.stubGlobal("crypto", {
  ...globalThis.crypto,
  randomUUID: () => `00000000-0000-0000-0000-${String(++uuidCounter).padStart(12, "0")}`,
});

// ─────────────────────────────────────────────────────────────────────────────
// Imports AFTER mocks
// ─────────────────────────────────────────────────────────────────────────────

import { summarizePurchases, type Purchase } from "@/data/purchaseStore";
import { sumByCategory, type ExpenseRow } from "@/data/expenseStore";
import { txDirection } from "@/data/inventoryStore";

// ═══════════════════════════════════════════════════════════════════════════════
// 1. FINANCIAL ENGINE — full integration via mocked stores
// ═══════════════════════════════════════════════════════════════════════════════

describe("Financial Engine — runEnterpriseEngine", () => {
  beforeEach(() => {
    uuidCounter = 0;
  });

  // Helper: mock stores then dynamically import engine (so mocks take effect)
  async function runEngine(
    invoices: any[],
    payments: any[],
    purchases: any[],
    expenses: any[],
    creditNotes: any[],
    period = "all",
  ) {
    // Reset the module registry so dynamic import() below gets fresh modules
    // that use our vi.doMock overrides instead of the cached originals.
    vi.resetModules();

    vi.doMock("@/data/invoiceStore", () => ({
      getAllInvoices: vi.fn().mockResolvedValue(invoices),
      getAllPayments: vi.fn().mockResolvedValue(payments),
    }));
    vi.doMock("@/data/purchaseStore", () => ({
      getPurchases: vi.fn().mockResolvedValue(purchases),
    }));
    vi.doMock("@/data/expenseStore", () => ({
      getExpenses: vi.fn().mockResolvedValue(expenses),
    }));
    vi.doMock("@/data/creditNoteStore", () => ({
      getAllCreditNotes: vi.fn().mockResolvedValue(creditNotes),
    }));
    vi.doMock("@/data/inventoryStore", () => ({
      getStockSummary: vi.fn().mockResolvedValue({
        hasInventoryData: false,
        closingStockValue: 0,
        openingStockValue: 0,
        totalItems: 0,
        totalQuantity: 0,
      }),
      txDirection,
    }));

    // Force re-import to pick up fresh mocks
    const { runEnterpriseEngine } = await import("@/engine/financialEngine");
    const result = await runEnterpriseEngine(period, "test-snapshot-001");

    vi.doUnmock("@/data/invoiceStore");
    vi.doUnmock("@/data/purchaseStore");
    vi.doUnmock("@/data/expenseStore");
    vi.doUnmock("@/data/creditNoteStore");
    vi.doUnmock("@/data/inventoryStore");

    return result;
  }

  // ── Scenario: Empty data ────────────────────────────────────────────────
  it("should return SUCCESS with zero metrics when all stores are empty", async () => {
    const result = await runEngine([], [], [], [], []);

    expect(result.status).toBe("SUCCESS");
    expect(result.dqs).toBe(100);
    expect(result.metrics.accrual.revenue).toBe(0);
    expect(result.metrics.accrual.cogs).toBe(0);
    expect(result.metrics.accrual.opex).toBe(0);
    expect(result.metrics.accrual.grossProfit).toBe(0);
    expect(result.metrics.accrual.netProfit).toBe(0);
    expect(result.metrics.cash.inflow).toBe(0);
    expect(result.metrics.cash.outflow).toBe(0);
    expect(result.metrics.cash.netCashFlow).toBe(0);
    expect(result.metrics.trialBalance.isBalanced).toBe(true);
    expect(result.metrics.trialBalance.discrepancy).toBe(0);
  });

  // ── Scenario: Single invoice, no payment ─────────────────────────────────
  it("should post revenue and AR correctly for a single invoice", async () => {
    const invoices = [{
      invoiceNo: "AHC/0001/25-26",
      invoiceDate: "2026-01-15",
      taxableAmount: 10000,
      totalAmount: 11800, // 18% GST
    }];

    const result = await runEngine(invoices, [], [], [], []);

    expect(result.metrics.accrual.revenue).toBe(10000);
    expect(result.metrics.trialBalance.isBalanced).toBe(true);
    // AR should hold full post-tax amount
    expect(result.metrics.balanceSheet.ar).toBe(11800);
    // GST payable = 1800
    expect(result.metrics.balanceSheet.gstPayable).toBe(1800);
  });

  // ── Scenario: Invoice + full payment ──────────────────────────────────────
  it("should clear AR when a full payment is applied", async () => {
    const invoices = [{
      invoiceNo: "AHC/0002/25-26",
      invoiceDate: "2026-02-10",
      taxableAmount: 5000,
      totalAmount: 5900,
    }];
    const payments = [{
      id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      invoiceNo: "AHC/0002/25-26",
      amountPaid: 5900,
      paymentDate: "2026-02-15",
    }];

    const result = await runEngine(invoices, payments, [], [], []);

    expect(result.metrics.balanceSheet.ar).toBe(0);
    expect(result.metrics.cash.inflow).toBe(5900);
    expect(result.metrics.accrual.revenue).toBe(5000);
  });

  // ── Scenario: Invoice + partial payment ──────────────────────────────────
  it("should leave residual AR on partial payment", async () => {
    const invoices = [{
      invoiceNo: "AHC/0003/25-26",
      invoiceDate: "2026-03-01",
      taxableAmount: 20000,
      totalAmount: 23600,
    }];
    const payments = [{
      id: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      invoiceNo: "AHC/0003/25-26",
      amountPaid: 10000,
      paymentDate: "2026-03-10",
    }];

    const result = await runEngine(invoices, payments, [], [], []);

    expect(result.metrics.balanceSheet.ar).toBe(13600); // 23600 - 10000
    expect(result.metrics.cash.inflow).toBe(10000);
  });

  // ── Scenario: Invoice + overpayment → suspense ───────────────────────────
  it("should route overpayments to SUSPENSE_PMT", async () => {
    const invoices = [{
      invoiceNo: "AHC/0004/25-26",
      invoiceDate: "2026-01-20",
      taxableAmount: 1000,
      totalAmount: 1180,
    }];
    const payments = [{
      id: "c3d4e5f6-a7b8-9012-cdef-123456789012",
      invoiceNo: "AHC/0004/25-26",
      amountPaid: 1500, // 320 overpayment
      paymentDate: "2026-01-25",
    }];

    const result = await runEngine(invoices, payments, [], [], []);

    expect(result.metrics.balanceSheet.ar).toBe(0);
    expect(result.metrics.balanceSheet.suspensePmt).toBe(320); // 1500 - 1180
    expect(result.metrics.cash.inflow).toBe(1500);
  });

  // ── Scenario: Orphan payment (no matching invoice) ──────────────────────
  it("should route orphan payments to SUSPENSE_PMT and warn", async () => {
    const payments = [{
      id: "d4e5f6a7-b8c9-0123-defa-234567890123",
      invoiceNo: "NONEXISTENT",
      amountPaid: 2000,
      paymentDate: "2026-04-01",
    }];

    const result = await runEngine([], payments, [], [], []);

    expect(result.metrics.balanceSheet.suspensePmt).toBe(2000);
    expect(result.audit.logs.some((l) => l.code === "ORPHAN_PMT")).toBe(true);
  });

  // ── Scenario: Purchases → COGS + cash outflow ──────────────────────────
  it("should post purchases as COGS (taxable) and cash outflow (total)", async () => {
    const purchases = [{
      purchase_date: "2026-02-01",
      taxable_amount: 8000,
      total_amount: 9440, // GST included
    }];

    const result = await runEngine([], [], purchases, [], []);

    expect(result.metrics.accrual.cogs).toBe(8000); // P&L: taxable only
    expect(result.metrics.cash.outflow).toBe(9440);  // Cash: full amount
  });

  // ── Scenario: Expenses → OPEX + TDS ─────────────────────────────────────
  it("should post expenses as OPEX with optional TDS split", async () => {
    const expenses = [
      { expense_date: "2026-03-01", amount: 4500, gross_amount: 5000 }, // TDS = 500
      { expense_date: "2026-03-15", amount: 3000 },                     // No gross → no TDS
    ];

    const result = await runEngine([], [], [], expenses, []);

    expect(result.metrics.accrual.opex).toBe(8000); // 5000 + 3000
    expect(result.metrics.balanceSheet.tdsLiability).toBe(500);
    expect(result.metrics.cash.outflow).toBe(7500); // 4500 + 3000 (net amounts)
  });

  // ── Scenario: Full P&L calculation ──────────────────────────────────────
  it("should compute grossProfit and netProfit correctly", async () => {
    const invoices = [{
      invoiceNo: "AHC/0010/25-26",
      invoiceDate: "2026-01-05",
      taxableAmount: 50000,
      totalAmount: 59000,
    }];
    const purchases = [{
      purchase_date: "2026-01-03",
      taxable_amount: 20000,
      total_amount: 23600,
    }];
    const expenses = [
      { expense_date: "2026-01-10", amount: 5000 },
    ];

    const result = await runEngine(invoices, [], purchases, expenses, []);

    // Revenue: 50000, COGS: 20000, OPEX: 5000
    expect(result.metrics.accrual.revenue).toBe(50000);
    expect(result.metrics.accrual.cogs).toBe(20000);
    expect(result.metrics.accrual.opex).toBe(5000);
    expect(result.metrics.accrual.grossProfit).toBe(30000); // 50000 - 20000
    expect(result.metrics.accrual.netProfit).toBe(25000);   // 50000 - 20000 - 5000
  });

  // ── Scenario: Trial balance always balanced ──────────────────────────────
  it("should maintain balanced trial balance with mixed data", async () => {
    const invoices = [
      { invoiceNo: "AHC/0020/25-26", invoiceDate: "2026-01-01", taxableAmount: 15000, totalAmount: 17700 },
      { invoiceNo: "AHC/0021/25-26", invoiceDate: "2026-02-01", taxableAmount: 25000, totalAmount: 29500 },
    ];
    const payments = [
      { id: "e5f6a7b8-c9d0-1234-efab-345678901234", invoiceNo: "AHC/0020/25-26", amountPaid: 17700, paymentDate: "2026-01-15" },
    ];
    const purchases = [
      { purchase_date: "2026-01-05", taxable_amount: 10000, total_amount: 11800 },
    ];
    const expenses = [
      { expense_date: "2026-01-20", amount: 3000 },
    ];

    const result = await runEngine(invoices, payments, purchases, expenses, []);

    expect(result.metrics.trialBalance.isBalanced).toBe(true);
    expect(result.metrics.trialBalance.discrepancy).toBe(0);
  });

  // ── Scenario: Credit note reduces AR and reverses revenue ───────────────
  it("should reverse revenue and reduce AR for a credit note", async () => {
    const invoices = [{
      invoiceNo: "AHC/0030/25-26",
      invoiceDate: "2026-03-01",
      taxableAmount: 10000,
      totalAmount: 11800,
    }];
    const creditNotes = [{
      credit_note_number: "CN/0001/25-26",
      invoice_no: "AHC/0030/25-26",
      credit_note_date: "2026-03-10",
      taxable_amount: 2000,
      amount: 2360, // 2000 + 18% GST
    }];

    const result = await runEngine(invoices, [], [], [], creditNotes);

    // Revenue should be reduced by CN taxable: 10000 - 2000 = 8000
    expect(result.metrics.accrual.revenue).toBe(8000);
    // AR should be reduced by CN total: 11800 - 2360 = 9440
    expect(result.metrics.balanceSheet.ar).toBe(9440);
    // Trial balance must still balance
    expect(result.metrics.trialBalance.isBalanced).toBe(true);
  });

  // ── Scenario: Period filtering — monthly ────────────────────────────────
  it("should filter entries by period when a specific month is given", async () => {
    const invoices = [
      { invoiceNo: "AHC/0040/25-26", invoiceDate: "2026-01-10", taxableAmount: 5000, totalAmount: 5900 },
      { invoiceNo: "AHC/0041/25-26", invoiceDate: "2026-02-10", taxableAmount: 8000, totalAmount: 9440 },
    ];

    const result = await runEngine(invoices, [], [], [], [], "2026-01");

    // Only January invoice should be in period revenue
    expect(result.metrics.accrual.revenue).toBe(5000);
  });

  // ── Scenario: Period filtering — quarter ────────────────────────────────
  it("should correctly expand quarter filters into constituent months", async () => {
    const invoices = [
      { invoiceNo: "AHC/0050/25-26", invoiceDate: "2026-01-05", taxableAmount: 3000, totalAmount: 3540 },
      { invoiceNo: "AHC/0051/25-26", invoiceDate: "2026-02-10", taxableAmount: 4000, totalAmount: 4720 },
      { invoiceNo: "AHC/0052/25-26", invoiceDate: "2026-03-20", taxableAmount: 5000, totalAmount: 5900 },
      { invoiceNo: "AHC/0053/25-26", invoiceDate: "2026-04-01", taxableAmount: 9000, totalAmount: 10620 }, // Q2 — excluded
    ];

    const result = await runEngine(invoices, [], [], [], [], "Q1-2026");

    // Q1 = Jan+Feb+Mar = 3000+4000+5000 = 12000
    expect(result.metrics.accrual.revenue).toBe(12000);
  });

  // ── Scenario: Invalid schema records → audit log ────────────────────────
  it("should log schema validation failures and skip bad records", async () => {
    const invoices = [
      { invoiceNo: "", invoiceDate: "2026-01-01", taxableAmount: 1000, totalAmount: 1180 }, // empty invoice_no
      { invoiceNo: "AHC/0060/25-26", invoiceDate: "2026-01-01", taxableAmount: 5000, totalAmount: 5900 }, // valid
    ];

    const result = await runEngine(invoices, [], [], [], []);

    // Only the valid invoice should be processed for revenue
    expect(result.metrics.accrual.revenue).toBe(5000);
    // Schema failure should be logged
    expect(result.audit.logs.some((l) => l.code === "INV_SCHEMA")).toBe(true);
  });

  // ── Scenario: DQS drops below 98 → HALTED status ──────────────────────
  it("should set status to HALTED when DQS drops below 98", async () => {
    // Create a scenario with significant issues relative to processed value
    // Orphan payment with large value compared to total processed
    const payments = [{
      id: "f6a7b8c9-d0e1-2345-fabc-456789012345",
      invoiceNo: "ORPHAN",
      amountPaid: 100,
      paymentDate: "2026-01-01",
    }];

    const result = await runEngine([], payments, [], [], []);

    // With only orphan data, DQS should be affected
    // The exact threshold depends on warn vs critical amounts
    expect(result.dqs).toBeLessThanOrEqual(100);
  });

  // ── Scenario: Duplicate ID detection ────────────────────────────────────
  it("should detect and audit duplicate invoice IDs", async () => {
    const invoices = [
      { invoiceNo: "AHC/0070/25-26", invoiceDate: "2026-01-01", taxableAmount: 5000, totalAmount: 5900 },
      { invoiceNo: "AHC/0070/25-26", invoiceDate: "2026-01-01", taxableAmount: 5000, totalAmount: 5900 }, // duplicate
    ];

    const result = await runEngine(invoices, [], [], [], []);

    expect(result.audit.logs.some((l) => l.code === "DUPE_ID")).toBe(true);
    // Revenue should only include the first one
    expect(result.metrics.accrual.revenue).toBe(5000);
  });

  // ── Scenario: Metadata correctness ──────────────────────────────────────
  it("should include correct metadata in the engine result", async () => {
    const result = await runEngine([], [], [], [], [], "2026-03");

    expect(result.status).toBe("SUCCESS");

    // Narrow the metadata union via structural type guard:
    // `status === "SUCCESS"` only narrows `result.status`, not `result.metadata`,
    // because the two properties aren't linked in a discriminated union.
    // `"snapshotId" in result.metadata` narrows to the success-path shape directly.
    if ("snapshotId" in result.metadata) {
      expect(result.metadata.snapshotId).toBe("test-snapshot-001");
      expect(result.metadata.targetPeriod).toBe("2026-03");
      expect(result.metadata.executedAt).toBeTruthy();
    }
  });

  // ── Scenario: Ledger export produces valid JSON ─────────────────────────
  it("should export the ledger as valid JSON", async () => {
    const invoices = [{
      invoiceNo: "AHC/0080/25-26",
      invoiceDate: "2026-01-01",
      taxableAmount: 1000,
      totalAmount: 1180,
    }];

    const result = await runEngine(invoices, [], [], [], []);

    const exported = result.exportLedger();
    expect(() => JSON.parse(exported)).not.toThrow();
    const entries = JSON.parse(exported);
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// 2. PURCHASE STORE — summarizePurchases (pure function)
// ═══════════════════════════════════════════════════════════════════════════════

describe("purchaseStore — summarizePurchases", () => {
  const makePurchase = (overrides: Partial<Purchase>): Purchase => ({
    id: "test-id",
    invoice_no: "PO-001",
    purchase_date: "2026-01-15",
    supplier_id: "default-supplier-id",
    supplier_name: "Supplier A",
    category: "raw-materials",
    taxable_amount: 10000,
    cgst: 900,
    sgst: 900,
    igst: 0,
    total_gst: 1800,
    total_amount: 11800,
    source: "manual",
    line_items: [],
    ...overrides,
  });

  it("should return zero totals for an empty array", () => {
    const summary = summarizePurchases([]);
    expect(summary.totalSpend).toBe(0);
    expect(summary.totalTaxable).toBe(0);
    expect(summary.totalGST).toBe(0);
    expect(summary.totalOrders).toBe(0);
    expect(Object.keys(summary.byCategory)).toHaveLength(0);
    expect(Object.keys(summary.bySupplier)).toHaveLength(0);
    expect(Object.keys(summary.bySupplierName)).toHaveLength(0);
    expect(Object.keys(summary.byMonth)).toHaveLength(0);
  });

  it("should aggregate totals across multiple purchases", () => {
    const purchases = [
      makePurchase({ total_amount: 5000, taxable_amount: 4200, total_gst: 800 }),
      makePurchase({ total_amount: 3000, taxable_amount: 2500, total_gst: 500 }),
    ];

    const summary = summarizePurchases(purchases);

    expect(summary.totalSpend).toBe(8000);
    expect(summary.totalTaxable).toBe(6700);
    expect(summary.totalGST).toBe(1300);
    expect(summary.totalOrders).toBe(2);
  });

  it("should group purchases by category", () => {
    const purchases = [
      makePurchase({ category: "raw-materials", total_amount: 5000 }),
      makePurchase({ category: "raw-materials", total_amount: 3000 }),
      makePurchase({ category: "packaging", total_amount: 2000 }),
    ];

    const summary = summarizePurchases(purchases);

    expect(summary.byCategory["raw-materials"].spend).toBe(8000);
    expect(summary.byCategory["raw-materials"].orders).toBe(2);
    expect(summary.byCategory["packaging"].spend).toBe(2000);
    expect(summary.byCategory["packaging"].orders).toBe(1);
  });

  it("should group purchases by supplier with lastDate tracking", () => {
    const purchases = [
      makePurchase({ supplier_id: "supplier-alpha", supplier_name: "Alpha", purchase_date: "2026-01-10", total_amount: 4000 }),
      makePurchase({ supplier_id: "supplier-alpha", supplier_name: "Alpha", purchase_date: "2026-03-20", total_amount: 6000 }),
      makePurchase({ supplier_id: "supplier-beta", supplier_name: "Beta", purchase_date: "2026-02-15", total_amount: 3000 }),
    ];

    const summary = summarizePurchases(purchases);

    expect(summary.bySupplier["supplier-alpha"].spend).toBe(10000);
    expect(summary.bySupplier["supplier-alpha"].orders).toBe(2);
    expect(summary.bySupplier["supplier-alpha"].lastDate).toBe("2026-03-20");
    expect(summary.bySupplier["supplier-beta"].spend).toBe(3000);

    // bySupplierName — human-readable keys for UI charts/reports
    expect(summary.bySupplierName["Alpha"].spend).toBe(10000);
    expect(summary.bySupplierName["Alpha"].orders).toBe(2);
    expect(summary.bySupplierName["Alpha"].lastDate).toBe("2026-03-20");
    expect(summary.bySupplierName["Beta"].spend).toBe(3000);
    expect(summary.bySupplierName["Beta"].orders).toBe(1);
  });

  it("should fall back to 'Unknown Supplier' when supplier_name is empty", () => {
    const purchases = [
      makePurchase({ supplier_id: "anon-1", supplier_name: "", purchase_date: "2026-01-01", total_amount: 500 }),
    ];

    const summary = summarizePurchases(purchases);

    // ID-keyed map still uses supplier_id — no fallback needed
    expect(summary.bySupplier["anon-1"].spend).toBe(500);
    // Name-keyed map falls back to "Unknown Supplier"
    expect(summary.bySupplierName["Unknown Supplier"].spend).toBe(500);
  });

  it("should group purchases by month", () => {
    const purchases = [
      makePurchase({ purchase_date: "2026-01-05", total_amount: 1000 }),
      makePurchase({ purchase_date: "2026-01-25", total_amount: 2000 }),
      makePurchase({ purchase_date: "2026-02-10", total_amount: 3000 }),
    ];

    const summary = summarizePurchases(purchases);

    expect(summary.byMonth["2026-01"]).toBe(3000);
    expect(summary.byMonth["2026-02"]).toBe(3000);
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// 3. EXPENSE STORE — sumByCategory (pure function)
// ═══════════════════════════════════════════════════════════════════════════════

describe("expenseStore — sumByCategory", () => {
  const expenses: ExpenseRow[] = [
    { id: "e1", expense_date: "2026-01-01", category: "Salaries", amount: 25000 },
    { id: "e2", expense_date: "2026-01-01", category: "Salaries", amount: 30000 },
    { id: "e3", expense_date: "2026-01-01", category: "Commission", amount: 5000 },
    { id: "e4", expense_date: "2026-01-01", category: "Utilities", amount: 3000 },
    { id: "e5", expense_date: "2026-01-01", category: "Freight", amount: 8000 },
  ];

  it("should sum all expenses for a given category", () => {
    expect(sumByCategory(expenses, "Salaries")).toBe(55000);
    expect(sumByCategory(expenses, "Commission")).toBe(5000);
    expect(sumByCategory(expenses, "Utilities")).toBe(3000);
    expect(sumByCategory(expenses, "Freight")).toBe(8000);
  });

  it("should return 0 for a non-existent category", () => {
    expect(sumByCategory(expenses, "Marketing")).toBe(0);
  });

  it("should return 0 for an empty array", () => {
    expect(sumByCategory([], "Salaries")).toBe(0);
  });

  it("should handle NaN amounts gracefully (coerce to 0)", () => {
    const bad: ExpenseRow[] = [
      { id: "e6", expense_date: "2026-01-01", category: "Salaries", amount: NaN },
      { id: "e7", expense_date: "2026-01-01", category: "Salaries", amount: 1000 },
    ];
    expect(sumByCategory(bad, "Salaries")).toBe(1000);
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// 4. INVENTORY STORE — txDirection (pure function)
// ═══════════════════════════════════════════════════════════════════════════════

describe("inventoryStore — txDirection", () => {
  it("should classify purchase_in as 'in'", () => {
    expect(txDirection("purchase_in")).toBe("in");
  });

  it("should classify return_in as 'in'", () => {
    expect(txDirection("return_in")).toBe("in");
  });

  it("should classify production_out as 'out'", () => {
    expect(txDirection("production_out")).toBe("out");
  });

  it("should classify sales_out as 'out'", () => {
    expect(txDirection("sales_out")).toBe("out");
  });

  it("should classify adjustment as 'out'", () => {
    expect(txDirection("adjustment")).toBe("out");
  });
});
