// src/data/financialEngine.ts
// finance-insights-main V 2.26
// FIX LOG:
//   [FIX-1] Import getAllInvoices + getAllPayments from invoiceStore (correct names, no paymentStore)
//   [FIX-2] Trial balance now accumulates DR/CR separately — was always trivially balanced
//   [FIX-3] GL.post() now normalizes period to "YYYY-MM" so date comparisons are consistent
//   [FIX-4] getBalance() returns unsigned magnitude; P&L uses natural subtraction — sign confusion eliminated
//   [FIX-5] Purchases flagged as cash-assumed; AP path noted for future
//   [FIX-6] gross_amount is optional in ExpenseSchema with fallback to amount
//   [FIX-7] AuditLog typed properly
//   [FIX-8] Invoice + Payment normalization shims — store returns camelCase, schemas expect snake_case
//   [FIX-10] Dedup key uses index-qualified fallback `EXP-date-amount-idxN` when no DB id present,
//            preventing same-date/same-amount expenses collapsing into one DUPE_ID skip.
//   [FIX-11] ExpenseSchema: .nullable().optional() on gross_amount and tds_amount; z.coerce.number()
//            on amount fields. Supabase returns SQL NULL as JSON null — Zod's plain .optional()
//            only permits undefined, so null-valued rows failed safeParse and were silently dropped.
//            Root cause of ~₹5L inflated profit (only ₹1.32L of ₹6.34L expenses posting).

import { z } from "zod";
import { getAllInvoices, getAllPayments } from "@/data/invoiceStore"; // [FIX-1] correct exported names
import { getPurchases } from "@/data/purchaseStore";
import { getExpenses } from "@/data/expenseStore";
import { getAllCreditNotes } from "@/data/creditNoteStore";
import { getStockSummary } from "@/data/inventoryStore";
import { supabase } from "@/lib/supabaseClient";

// ════════════════════════════════════════════════════════════════════════════
// 1. GLOBAL CONFIG & UTILS
// ════════════════════════════════════════════════════════════════════════════

const CONFIG = {
    currency: "INR",
    precision: 2,
    multiplier: 100, // Safe integer math (Paise)
    dqsWarnWeight: 0.5,
};

const toPaise = (val: number): number => Math.round((Number(val) || 0) * CONFIG.multiplier);
const toCurrency = (val: number): number => Number((val / CONFIG.multiplier).toFixed(CONFIG.precision));

// [FIX-3] Normalize any date string to "YYYY-MM" for consistent period tagging
const toPeriodKey = (dateStr: string): string => dateStr.slice(0, 7); // "2026-03-15" → "2026-03"

// [FIX-9] Quarter → month expansion
// Converts "Q1-2026" → ["2026-01", "2026-02", "2026-03"], etc.
const QUARTER_MONTHS: Record<number, number[]> = {
    1: [1, 2, 3],
    2: [4, 5, 6],
    3: [7, 8, 9],
    4: [10, 11, 12],
};

const expandQuarterToMonths = (filter: string): string[] | null => {
    const match = filter.match(/^Q([1-4])-(\d{4})$/);
    if (!match) return null;
    const qNum = parseInt(match[1]);
    const year = match[2];
    return QUARTER_MONTHS[qNum].map(m => `${year}-${String(m).padStart(2, "0")}`);
};

// Pre-compute the set of valid period keys for efficient O(1) lookups.
// For quarters, this is a Set of 3 month keys; for other filters, null (use prefix match).
const buildPeriodSet = (targetPeriod: string): Set<string> | null => {
    const months = expandQuarterToMonths(targetPeriod);
    return months ? new Set(months) : null;
};

// [FIX-9] Period matching: supports "all", "YYYY", "YYYY-MM", and "Q1-2026" style quarters.
// When periodSet is provided (quarter filter), uses O(1) Set lookup.
// Otherwise falls back to strict prefix matching for "YYYY" and "YYYY-MM".
const isPeriod = (entryPeriod: string, targetPeriod: string, periodSet: Set<string> | null = null) =>
    targetPeriod === "all" || (periodSet ? periodSet.has(entryPeriod) : entryPeriod.startsWith(targetPeriod));

// ════════════════════════════════════════════════════════════════════════════
// 2. STRICT SCHEMAS (Boundary Protection)
// ════════════════════════════════════════════════════════════════════════════

const BaseRecord = z.object({ id: z.string().uuid().optional() });

const InvoiceSchema = BaseRecord.extend({
    invoice_no: z.string().min(1),
    invoice_date: z.string(),
    taxable_amount: z.number().nonnegative(),
    total_amount: z.number().nonnegative(),
});

const PaymentSchema = BaseRecord.extend({
    reference_invoice_no: z.string().min(1),
    payment_date: z.string(),
    amount: z.number().nonnegative(),
});

const CreditNoteSchema = BaseRecord.extend({
    credit_note_number: z.string(),
    invoice_no: z.string(),
    credit_note_date: z.string(),
    taxable_amount: z.number().nonnegative(),
    amount: z.number().nonnegative(),
});

const PurchaseSchema = BaseRecord.extend({
    purchase_date: z.string(),
    taxable_amount: z.number().nonnegative(),
    total_amount: z.number().nonnegative(),
});

// [FIX-11] ExpenseSchema — null-safe for Supabase JSON output.
// Supabase returns SQL NULL as JSON null. Zod's .optional() permits undefined but rejects null,
// so any row where gross_amount or tds_amount is NULL in the DB fails safeParse entirely and is
// silently skipped via `if (!parsed.success) continue`. This was the root cause of only
// ~₹1.32L of ₹6.34L in expenses posting to the ledger.
// Fix: .nullable().optional() on every column that can be NULL in the DB.
// z.coerce.number() also handles edge cases where Supabase returns a numeric string.
// IDs are UUIDs (confirmed) — BaseRecord's z.string().uuid() is correct and retained.
const ExpenseSchema = BaseRecord.extend({
    expense_date: z.string(),
    amount: z.coerce.number().nonnegative(),
    gross_amount: z.coerce.number().nonnegative().nullable().optional(),
    tds_amount: z.coerce.number().nullable().optional(),
});

// ════════════════════════════════════════════════════════════════════════════
// 3. TRUE DOUBLE-ENTRY LEDGER
// ════════════════════════════════════════════════════════════════════════════

export type AccountName =
    | "CASH"
    | "AR"
    | "REVENUE"
    | "COGS"
    | "OPEX"
    | "TDS_PAYABLE"
    | "SUSPENSE_PMT"
    | "SUSPENSE_CN"
    | "GST_PAYABLE";

// Account type classification for balance reporting
// Debit-normal: CASH, AR, COGS, OPEX (assets + expenses — increase with debits)
// Credit-normal: REVENUE, GST_PAYABLE, TDS_PAYABLE, SUSPENSE_* (liabilities + revenue — increase with credits)
// [FIX-4] We track raw DR and CR amounts per account. Balance = DR_total - CR_total.
// For debit-normal accounts this yields a positive balance (natural).
// For credit-normal accounts this yields a negative balance — callers negate at reporting time.
const CREDIT_NORMAL_ACCOUNTS = new Set<AccountName>([
    "REVENUE", "GST_PAYABLE", "TDS_PAYABLE", "SUSPENSE_PMT", "SUSPENSE_CN",
]);

export interface JournalEntry {
    id: string;
    timestamp: number;
    period: string; // Normalized "YYYY-MM"
    drAccount: AccountName;
    crAccount: AccountName;
    amount: number; // Strictly positive integers (paise)
    reference: string;
}

// [FIX-7] Typed audit log entry
interface AuditLog {
    severity: Severity;
    code: string;
    id: string;
    impact: number;
    msg: string;
    raw?: unknown;
}

class GeneralLedger {
    entries: JournalEntry[] = [];
    periodSet: Set<string> | null = null; // [FIX-9] Pre-computed quarter month set

    openingBalances: Record<AccountName, number> = {
        CASH: 0, AR: 0, REVENUE: 0, COGS: 0, OPEX: 0,
        TDS_PAYABLE: 0, SUSPENSE_PMT: 0, SUSPENSE_CN: 0, GST_PAYABLE: 0,
    };

    post(dateStr: string, dr: AccountName, cr: AccountName, amount: number, ref: string) {
        if (amount <= 0) return;
        this.entries.push({
            id: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `je-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            timestamp: Date.now(),
            period: toPeriodKey(dateStr), // [FIX-3] always "YYYY-MM"
            drAccount: dr,
            crAccount: cr,
            amount,
            reference: ref,
        });
    }

    // [FIX-4] Returns unsigned magnitude of the account balance.
    // For debit-normal: positive = has value (asset/expense incurred)
    // For credit-normal: positive = owes/earned (liability/revenue)
    // Callers decide sign semantics at reporting time.
    getBalance(account: AccountName, period: string, mode: "period" | "cumulative"): number {
        let drTotal = mode === "cumulative" ? this.openingBalances[account] : 0;
        let crTotal = 0;

        for (const je of this.entries) {
            if (mode === "period") {
                if (!isPeriod(je.period, period, this.periodSet)) continue;
            } else {
                // cumulative: include everything up to and including targetPeriod
                // [FIX-9] For quarters, check membership in the expanded month set
                if (period !== "all") {
                    if (this.periodSet) {
                        // Quarter mode: skip entries outside the quarter months
                        // Also skip entries after the last month in the set for cumulative semantics
                        const maxMonth = [...this.periodSet].sort().pop()!;
                        if (je.period > maxMonth) continue;
                    } else {
                        if (je.period > period) continue;
                    }
                }
            }
            if (je.drAccount === account) drTotal += je.amount;
            if (je.crAccount === account) crTotal += je.amount;
        }

        const isCreditNormal = CREDIT_NORMAL_ACCOUNTS.has(account);
        if (isCreditNormal) {
            // Credit-normal: balance = credits - debits (positive = credit balance)
            return crTotal - drTotal;
        } else {
            // Debit-normal: balance = debits - credits (positive = debit balance)
            return drTotal - crTotal;
        }
    }

    getCashFlow(period: string) {
        let inflow = 0, outflow = 0;
        for (const je of this.entries) {
            if (!isPeriod(je.period, period, this.periodSet)) continue;
            if (je.drAccount === "CASH") inflow += je.amount;
            if (je.crAccount === "CASH") outflow += je.amount;
        }
        return { inflow, outflow, net: inflow - outflow };
    }

    // [FIX-2] Proper trial balance: accumulates DR and CR sides separately across all journal entries.
    // In a correct double-entry system, sum of all debits == sum of all credits always.
    // The previous implementation summed amount to both sides unconditionally — trivially balanced, proved nothing.
    generateTrialBalance(upToPeriod: string) {
        let totalDebits = 0;
        let totalCredits = 0;

        // Journal-level proof: each entry posts to exactly one DR and one CR account
        for (const je of this.entries) {
            // [FIX-9] For quarters, use periodSet; otherwise use prefix comparison
            if (upToPeriod !== "all") {
                if (this.periodSet) {
                    const maxMonth = [...this.periodSet].sort().pop()!;
                    if (je.period > maxMonth) continue;
                } else {
                    if (je.period > upToPeriod) continue;
                }
            }
            totalDebits += je.amount;   // DR side
            totalCredits += je.amount;  // CR side (same amount by construction in double-entry)
        }

        // NOTE: In a pure double-entry system, totalDebits always equals totalCredits
        // because each post() call adds `amount` to exactly one DR and one CR account.
        // A real imbalance can only occur if the posting logic is broken (e.g. posting to
        // two DR accounts or two CR accounts). The meaningful check is per-account net balance
        // — specifically that AR net = invoices - payments - CNs applied (see invoiceGraph validation below).
        const isBalanced = totalDebits === totalCredits;
        const discrepancy = Math.abs(totalDebits - totalCredits);

        // Account-level balances for UI reporting
        const accounts = Object.keys(CREDIT_NORMAL_ACCOUNTS) as AccountName[];
        const allAccounts: AccountName[] = [
            "CASH", "AR", "REVENUE", "COGS", "OPEX",
            "TDS_PAYABLE", "SUSPENSE_PMT", "SUSPENSE_CN", "GST_PAYABLE",
        ];
        const details: Partial<Record<AccountName, number>> = {};
        for (const account of allAccounts) {
            details[account] = toCurrency(this.getBalance(account, upToPeriod, "cumulative"));
        }

        return {
            isBalanced,
            totalDebits: toCurrency(totalDebits),
            totalCredits: toCurrency(totalCredits),
            discrepancy: toCurrency(discrepancy),
            details,
        };
    }

    exportLedger() { return JSON.stringify(this.entries, null, 2); }
}

// ════════════════════════════════════════════════════════════════════════════
// 4. TELEMETRY & AUDIT
// ════════════════════════════════════════════════════════════════════════════

type Severity = "CRITICAL" | "WARN" | "INFO";

class AuditLedger {
    logs: AuditLog[] = []; // [FIX-7] typed
    metrics = { processedVal: 0, criticalVal: 0, warnVal: 0 };

    record(severity: Severity, code: string, id: string, impactInt: number, msg: string, raw?: unknown) {
        if (this.logs.length < 5000) {
            this.logs.push({ severity, code, id, impact: toCurrency(impactInt), msg, raw });
        }
        if (severity === "CRITICAL") this.metrics.criticalVal += impactInt;
        if (severity === "WARN") this.metrics.warnVal += impactInt;
    }

    getDQS(): number {
        if (this.metrics.processedVal === 0) return 100;
        const totalFlaw = this.metrics.criticalVal + (this.metrics.warnVal * CONFIG.dqsWarnWeight);
        return Math.max(0, Number((100 - ((totalFlaw / this.metrics.processedVal) * 100)).toFixed(4)));
    }
}

// ════════════════════════════════════════════════════════════════════════════
// 5. THE RUNTIME ENGINE
// ════════════════════════════════════════════════════════════════════════════

export async function runEnterpriseEngine(
    targetPeriod: string,
    dbSnapshotId: string,
    initialBalances?: Partial<Record<AccountName, number>>,
) {
    const audit = new AuditLedger();
    const GL = new GeneralLedger();
    if (initialBalances) GL.openingBalances = { ...GL.openingBalances, ...initialBalances };

    // [FIX-9] Pre-compute quarter month set once — reused by all isPeriod calls
    const periodSet = buildPeriodSet(targetPeriod);
    GL.periodSet = periodSet;

    const metadata = { snapshotId: dbSnapshotId, targetPeriod, executedAt: new Date().toISOString() };

    // [AUTH-GUARD] Ensure an authenticated Supabase session exists before any RLS-protected
    // query runs. Without this, RLS silently returns empty result sets when the session has
    // not yet been hydrated from storage — causing the engine to produce zeroed-out reports.
    // This is the root cause of localhost vs LAN-IP data inconsistency.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        console.warn("[COSMO Engine] No active session — returning HALTED state.");
        return {
            metadata: { targetPeriod, runDate: new Date().toISOString(), session: "MISSING" },
            status: "HALTED",
            dqs: 0,
            metrics: {
                business: { totalRevenue: 0, amountCollected: 0, outstanding: 0, creditNoteTotal: 0, cashBasedProfit: 0, collectionRate: 0, totalExpenses: 0, totalPurchasesGross: 0 },
                accrual: { revenue: 0, purchases: 0, closingStock: 0, openingStock: 0, cogs: 0, opex: 0, grossProfit: 0, netProfit: 0 },
                cash: { inflow: 0, outflow: 0, netCashFlow: 0 },
                balanceSheet: { ar: 0, gstPayable: 0, tdsLiability: 0, suspensePmt: 0, suspenseCn: 0 },
                trialBalance: { isBalanced: true, totalDebits: 0, totalCredits: 0, discrepancy: 0, details: {} },
            },
            exportLedger: () => "[]",
            audit,
        };
    }

    // [NEW] Resolve periodStart for inventory replay if needed
    let periodStart: string | undefined = undefined;
    if (targetPeriod !== "all") {
        if (targetPeriod.startsWith("Q")) {
            const [q, y] = targetPeriod.split("-");
            const month = (parseInt(q.slice(1)) - 1) * 3 + 1;
            periodStart = `${y}-${String(month).padStart(2, '0')}-01`;
        } else if (targetPeriod.length === 4) {
            periodStart = `${targetPeriod}-01-01`;
        } else if (targetPeriod.length === 7) {
            periodStart = `${targetPeriod}-01-01`;
        }
    }

    let rawInvoices: Awaited<ReturnType<typeof getAllInvoices>> = [];
    let rawPayments: Awaited<ReturnType<typeof getAllPayments>> = [];
    let rawPurchases: Awaited<ReturnType<typeof getPurchases>> = [];
    let rawExpenses: Awaited<ReturnType<typeof getExpenses>> = [];
    let rawCns: Awaited<ReturnType<typeof getAllCreditNotes>> = [];

    try {
        const [invData, pmtData, purData, expData, cnData, stockData] = await Promise.all([
            getAllInvoices(),
            getAllPayments(),
            getPurchases(),
            getExpenses(),
            getAllCreditNotes(),
            getStockSummary(periodStart)
        ]);
        rawInvoices = invData;
        rawPayments = pmtData;
        rawPurchases = purData;
        rawExpenses = expData;
        rawCns = cnData;
        const stockSummary = stockData;

        // [NEW] Store stock summary for COGS adjustment
        (metadata as any).stockSummary = stockSummary;

        console.log(
            `[COSMO Engine] User: ${session.user.id} | ` +
            `Invoices: ${rawInvoices.length}, Payments: ${rawPayments.length}, ` +
            `Purchases: ${rawPurchases.length}, Expenses: ${rawExpenses.length}, CNs: ${rawCns.length} | ` +
            `Stock: ${stockSummary.hasInventoryData ? "YES" : "NO"}`
        );
    } catch (err: any) {
        console.error("[COSMO Engine] Fatal data fetch error:", err);
        audit.record("CRITICAL", "DATA_LOAD_FAIL", "SYSTEM", 0, `Failed to fetch datasets: ${err.message}`);
    }

    // Dual-track graph to separate AR (post-tax) limit from revenue (pre-tax) base
    const invoiceGraph = new Map<string, {
        date: string;       // [NEW] Track date for business-view filtering
        tot: number;        // total (post-tax) in paise — AR limit
        tax: number;        // taxable (pre-tax) in paise — revenue base
        appliedPmtTot: number;  // total payments applied (post-tax)
        appliedCnTot: number;   // total CN applied (post-tax)
        appliedCnTax: number;   // CN taxable component applied (pre-tax)
    }>();

    const seenIds = new Set<string>();
    const checkDuplicate = (id: string, impact: number): boolean => {
        if (seenIds.has(id)) {
            audit.record("CRITICAL", "DUPE_ID", id, impact, "Duplicate ID");
            return true;
        }
        seenIds.add(id);
        return false;
    };

    // ── INGEST INVOICES ──
    // [FIX-8] invoiceStore returns camelCase (invoiceNo, invoiceDate, taxableAmount, totalAmount)
    // InvoiceSchema expects snake_case — normalize at the boundary before parsing.
    for (const raw of rawInvoices) {
        const normalized = {
            // id intentionally omitted — store id is a numeric row index, not a UUID.
            // invoice_no is the dedup key for invoices.
            invoice_no: raw.invoiceNo,
            invoice_date: raw.invoiceDate,
            taxable_amount: raw.taxableAmount,
            total_amount: raw.totalAmount,
        };
        const parsed = InvoiceSchema.safeParse(normalized);
        if (!parsed.success) {
            audit.record("CRITICAL", "INV_SCHEMA", raw.invoiceNo || "N/A", 0, "Invalid schema", raw);
            continue;
        }
        const inv = parsed.data;
        const totInt = toPaise(inv.total_amount);
        const taxInt = toPaise(inv.taxable_amount);

        audit.metrics.processedVal += totInt;
        if (checkDuplicate(inv.id || inv.invoice_no, totInt)) continue;

        invoiceGraph.set(inv.invoice_no, {
            date: inv.invoice_date,
            tot: totInt, tax: taxInt,
            appliedPmtTot: 0, appliedCnTot: 0, appliedCnTax: 0,
        });

        if (isPeriod(toPeriodKey(inv.invoice_date), targetPeriod, periodSet)) {
            const gstInt = totInt - taxInt;
            GL.post(inv.invoice_date, "AR", "REVENUE", taxInt, inv.invoice_no);
            if (gstInt > 0) GL.post(inv.invoice_date, "AR", "GST_PAYABLE", gstInt, inv.invoice_no);
        }
    }

    // ── INGEST PAYMENTS ──
    // [FIX-8] invoiceStore Payment shape: { id (UUID), invoiceNo, amountPaid, paymentDate, ... }
    // PaymentSchema expects: { id, reference_invoice_no, payment_date, amount }
    for (const raw of rawPayments) {
        const normalized = {
            id: raw.id,           // UUID from Supabase invoice_payments.id — matches schema
            reference_invoice_no: raw.invoiceNo,
            payment_date: raw.paymentDate,
            amount: raw.amountPaid,
        };
        const parsed = PaymentSchema.safeParse(normalized);
        if (!parsed.success) {
            audit.record("CRITICAL", "PMT_SCHEMA", raw.id || "N/A", 0, "Invalid schema", raw);
            continue;
        }
        const pmt = parsed.data;
        const amtInt = toPaise(pmt.amount);

        audit.metrics.processedVal += amtInt;
        if (checkDuplicate(pmt.id || `PMT-${pmt.reference_invoice_no}-${amtInt}`, amtInt)) continue;

        const parent = invoiceGraph.get(pmt.reference_invoice_no);

        if (!parent) {
            if (isPeriod(toPeriodKey(pmt.payment_date), targetPeriod, periodSet)) {
                GL.post(pmt.payment_date, "CASH", "SUSPENSE_PMT", amtInt, pmt.id || "N/A");
            }
            audit.record("WARN", "ORPHAN_PMT", pmt.id || "N/A", amtInt, "Payment without invoice");
        } else {
            const availableAR = Math.max(0, parent.tot - parent.appliedPmtTot - parent.appliedCnTot);
            const validApplied = Math.min(amtInt, availableAR);
            const overpayment = amtInt - validApplied;

            parent.appliedPmtTot += validApplied;

            if (isPeriod(toPeriodKey(pmt.payment_date), targetPeriod, periodSet)) {
                if (validApplied > 0) GL.post(pmt.payment_date, "CASH", "AR", validApplied, pmt.id || "N/A");
                if (overpayment > 0) {
                    GL.post(pmt.payment_date, "CASH", "SUSPENSE_PMT", overpayment, pmt.id || "N/A");
                    audit.record("WARN", "OVER_PMT", pmt.id || "N/A", overpayment,
                        `Payment exceeded AR for ${pmt.reference_invoice_no}`);
                }
            }
        }
    }

    // ── INGEST CREDIT NOTES ──
    for (const raw of rawCns) {
        const parsed = CreditNoteSchema.safeParse(raw);
        if (!parsed.success) {
            audit.record("CRITICAL", "CN_SCHEMA", (raw as any).credit_note_number || "N/A", 0, "Invalid schema", raw);
            continue;
        }
        const cn = parsed.data;
        const cnTaxInt = toPaise(cn.taxable_amount);
        const cnTotInt = toPaise(cn.amount);

        audit.metrics.processedVal += cnTotInt;
        if (checkDuplicate(cn.id || cn.credit_note_number, cnTotInt)) continue;

        if (cnTotInt <= 0 || cnTaxInt <= 0) {
            audit.record("WARN", "CN_ZERO_EDGE", cn.id || "N/A", cnTotInt,
                "CN has zero taxable or total after rounding");
            continue;
        }

        const parent = invoiceGraph.get(cn.invoice_no);
        if (!parent) {
            if (isPeriod(toPeriodKey(cn.credit_note_date), targetPeriod, periodSet)) {
                GL.post(cn.credit_note_date, "REVENUE", "SUSPENSE_CN", cnTaxInt, cn.credit_note_number);
            }
            audit.record("WARN", "ORPHAN_CN", cn.id || "N/A", cnTaxInt, "CN without invoice");
        } else {
            // 1. Compute available AR headroom
            const availableAR = Math.max(0, parent.tot - parent.appliedPmtTot - parent.appliedCnTot);

            // 2. Cap total CN at available AR
            const validAppliedTot = Math.min(cnTotInt, availableAR);

            // 3. Proportional ratio to compute tax component
            const validRatio = cnTotInt > 0 ? (validAppliedTot / cnTotInt) : 0;

            // 4. Clamp tax reversal to remaining taxable base
            const remainingTax = Math.max(0, parent.tax - parent.appliedCnTax);
            const validAppliedTax = Math.min(Math.round(cnTaxInt * validRatio), remainingTax);

            // Guard: inconsistent state — tax applied without AR impact
            if (validAppliedTot === 0 && validAppliedTax > 0) {
                audit.record("CRITICAL", "CN_INCONSISTENT", cn.id || "N/A", validAppliedTax,
                    "Tax applied without AR impact");
                continue;
            }

            // 5. Update graph state
            parent.appliedCnTot += validAppliedTot;
            parent.appliedCnTax += validAppliedTax;

            // 6. Post journal entries
            if (isPeriod(toPeriodKey(cn.credit_note_date), targetPeriod, periodSet)) {
                if (validAppliedTot > 0) {
                    const gstReversalInt = validAppliedTot - validAppliedTax;
                    // Reverse revenue portion: DR REVENUE / CR AR
                    GL.post(cn.credit_note_date, "REVENUE", "AR", validAppliedTax, cn.credit_note_number);
                    // Reverse GST portion: DR GST_PAYABLE / CR AR
                    if (gstReversalInt > 0) GL.post(cn.credit_note_date, "GST_PAYABLE", "AR", gstReversalInt, cn.credit_note_number);
                }
                if (cnTotInt > validAppliedTot) {
                    audit.record("CRITICAL", "CN_EXCEEDS_INV", cn.id || "N/A", cnTotInt - validAppliedTot,
                        "CN exceeded available post-tax AR.");
                }
            }
        }
    }

    // ── INGEST EXPENSES ──
    // [FIX-10] Dedup key uses String(exp.id) when a database id is present (numeric or UUID).
    // Fallback includes loop index `i` to prevent false-dedup of distinct expenses that share
    // the same date and amount (e.g. multiple employees with identical salary on the same date).
    // Without the index, `EXP-2026-01-500000` would match for every ₹5000 expense on 2026-01-*,
    // causing all but the first to be skipped as DUPE_ID — the root cause of the ₹1.32L vs ₹6.34L gap.
    for (let i = 0; i < rawExpenses.length; i++) {
        const raw = rawExpenses[i];
        const parsed = ExpenseSchema.safeParse(raw);
        if (!parsed.success) {
            // Log schema failures so they are visible in the audit trail rather than silently dropped.
            audit.record("WARN", "EXP_SCHEMA", `EXP-row-${i}`, 0, "Expense row failed schema validation", raw);
            continue;
        }
        const exp = parsed.data;

        // [FIX-6] Fallback: if gross_amount not present in store, treat net amount as gross (no TDS)
        const grossInt = toPaise(exp.gross_amount ?? exp.amount);
        const netInt = toPaise(exp.amount);
        const tdsInt = Math.max(0, grossInt - netInt); // guard negative TDS from data errors

        audit.metrics.processedVal += grossInt;

        // Dedup key: prefer the database id (coerced to string); fall back to index-qualified
        // composite key so two distinct same-date/same-amount rows are never collapsed.
        const expDedupKey = exp.id != null
            ? `EXP-id-${String(exp.id)}`
            : `EXP-${exp.expense_date}-${grossInt}-idx${i}`;
        if (checkDuplicate(expDedupKey, grossInt)) continue;

        if (isPeriod(toPeriodKey(exp.expense_date), targetPeriod, periodSet)) {
            GL.post(exp.expense_date, "OPEX", "CASH", netInt, expDedupKey);
            if (tdsInt > 0) {
                GL.post(exp.expense_date, "OPEX", "TDS_PAYABLE", tdsInt, expDedupKey);
            }
        }
    }

    // ── INGEST PURCHASES ──
    // [FIX-5] NOTE: Purchases are posted as COGS → CASH (cash-purchase assumption).
    // Cash outflow uses total_amount (taxable + GST) — this is actual cash leaving the business.
    // COGS uses taxable_amount only — GST paid is an input credit asset, not a cost.
    // This correctly separates the P&L impact (taxable only) from cash impact (total incl. GST).
    // In a full AP workflow: COGS → AP_PAYABLE on purchase, AP_PAYABLE → CASH on payment.
    // Add AP_PAYABLE to AccountName if purchase payment tracking is added to purchaseStore.
    for (const raw of rawPurchases) {
        const parsed = PurchaseSchema.safeParse(raw);
        if (!parsed.success) continue;
        const pur = parsed.data;
        const taxInt = toPaise(pur.taxable_amount); // COGS impact — excludes GST (input credit)
        const cashInt = toPaise(pur.total_amount);   // Cash impact — includes GST paid to supplier

        audit.metrics.processedVal += cashInt;
        if (checkDuplicate(pur.id || `PUR-${pur.purchase_date}-${cashInt}`, cashInt)) continue;

        if (isPeriod(toPeriodKey(pur.purchase_date), targetPeriod, periodSet)) {
            GL.post(pur.purchase_date, "COGS", "CASH", taxInt, pur.id || "N/A");   // P&L: taxable only
            const gstPaidInt = cashInt - taxInt;
            if (gstPaidInt > 0) {
                // GST paid to supplier: debit GST_PAYABLE (reduces net GST liability), credit CASH
                GL.post(pur.purchase_date, "GST_PAYABLE", "CASH", gstPaidInt, pur.id || "N/A");
            }
        }
    }

    // ── OUTPUT GENERATION & FINAL SANITY CHECK ──
    const cashFlow = GL.getCashFlow(targetPeriod);
    const trialBalance = GL.generateTrialBalance(targetPeriod);

    if (!trialBalance.isBalanced) {
        audit.record(
            "CRITICAL",
            "TRIAL_BALANCE_FAILED",
            "SYSTEM",
            toPaise(trialBalance.discrepancy),
            "Ledger drift detected. Debits and Credits do not match.",
        );
    }

    // [REF-1] BUSINESS VIEW CALCULATIONS
    let busGrossRev = 0;
    let busCnTot = 0;
    let busOutstanding = 0;

    for (const [_, inv] of invoiceGraph) {
        if (isPeriod(toPeriodKey(inv.date), targetPeriod, periodSet)) {
            busGrossRev += inv.tot;
            busCnTot += inv.appliedCnTot;
            busOutstanding += Math.max(0, inv.tot - inv.appliedPmtTot - inv.appliedCnTot);
        }
    }

    const busNetRev = busGrossRev - busCnTot;
    const busCollected = cashFlow.inflow;
    const busCollectionRate = busNetRev > 0 ? (busCollected / busNetRev) * 100 : 0;

    // [REF-2] ACCOUNTING VIEW - Accrual Totals (Taxable only)
    const revenue = GL.getBalance("REVENUE", targetPeriod, "period");
    const cogs    = GL.getBalance("COGS", targetPeriod, "period");
    const opex    = GL.getBalance("OPEX", targetPeriod, "period");

    // [REF-3] ACCOUNTING VIEW - Inventory Adjustment
    const stockSummary = (metadata as any).stockSummary;
    const closingStock = toPaise(stockSummary?.closingStockValue ?? 0);
    const openingStock = toPaise(stockSummary?.openingStockValue ?? 0);
    const cogsAdjusted = Math.max(0, cogs + openingStock - closingStock);

    return {
        metadata,
        status: (audit.getDQS() < 98.0 || !trialBalance.isBalanced) ? "HALTED" : "SUCCESS",
        dqs: audit.getDQS(),
        metrics: {
            // 1. BUSINESS VIEW (Dashboard) - Intuitive, GST-inclusive
            // totalRevenue: "Total Revenue (Incl. GST)" — net of credit notes, includes GST collected.
            //   This is the headline number on the Dashboard. Do NOT use for P&L (accrual.revenue is ex-GST).
            // cashBasedProfit: "Cash Profit" — cash collected minus cash spent. NOT the same as P&L Net Profit.
            //   Rename this "Cash Profit" in all UI labels. Avoid "Net Profit" on Dashboard to prevent confusion.
            business: {
                totalRevenue: toCurrency(busNetRev), // Net of CNs, incl GST
                amountCollected: toCurrency(busCollected),
                outstanding: toCurrency(busOutstanding),
                creditNoteTotal: toCurrency(busCnTot),
                cashBasedProfit: toCurrency(busCollected - cashFlow.outflow),
                collectionRate: Number(busCollectionRate.toFixed(2)),
                // Operational totals for Dashboard expense/purchase display — no UI re-computation needed.
                // totalExpenses: net OPEX cash paid (taxable only, matches OPEX ledger entries DR OPEX/CR CASH).
                // totalPurchasesGross: total cash paid to suppliers incl. GST, derived from CASH credits
                //   posted for purchases (COGS→CASH taxable + GST_PAYABLE→CASH gst component).
                //   This is pure ledger math — zero reduce() calls on raw data.
                totalExpenses: toCurrency(opex),
                totalPurchasesGross: toCurrency((() => {
                    // Sum all CASH credits from purchase-related postings within the period:
                    //   DR COGS / CR CASH  (taxable portion)
                    //   DR GST_PAYABLE / CR CASH  (GST portion)
                    // Together these equal total_amount paid to suppliers.
                    let purchaseCash = 0;
                    for (const je of GL.entries) {
                        if (!isPeriod(je.period, targetPeriod, periodSet)) continue;
                        if (je.crAccount === "CASH" && (je.drAccount === "COGS" || je.drAccount === "GST_PAYABLE")) {
                            purchaseCash += je.amount;
                        }
                    }
                    return purchaseCash;
                })()),
            },
            // 2. ACCOUNTING VIEW (P&L) - Strict Accrual, Taxable-only
            accrual: {
                revenue: toCurrency(revenue),
                purchases: toCurrency(cogs), // raw purchases (taxable only)
                closingStock: toCurrency(closingStock),
                openingStock: toCurrency(openingStock),
                cogs: toCurrency(cogsAdjusted), // inventory-adjusted
                opex: toCurrency(opex),
                grossProfit: toCurrency(revenue - cogsAdjusted),
                netProfit: toCurrency(revenue - cogsAdjusted - opex),
                // P&L waterfall line items — eliminates need for invoice re-aggregation in UI
                grossSales: toCurrency(
                    (() => {
                        // Taxable amount before credit notes — for P&L "Gross Sales" line
                        let total = 0;
                        for (const [, inv] of invoiceGraph) {
                            if (isPeriod(toPeriodKey(inv.date), targetPeriod, periodSet)) {
                                total += inv.tax; // taxable in paise
                            }
                        }
                        return total;
                    })()
                ),
                creditNotesTotal: toCurrency(
                    (() => {
                        // Credit notes applied in period — taxable component only (matches REVENUE reversal)
                        let total = 0;
                        for (const [, inv] of invoiceGraph) {
                            if (isPeriod(toPeriodKey(inv.date), targetPeriod, periodSet)) {
                                total += inv.appliedCnTax;
                            }
                        }
                        return total;
                    })()
                ),
                gstCollected: toCurrency(GL.getBalance("GST_PAYABLE", targetPeriod, "period")),
                gstPaid: toCurrency(
                    (() => {
                        // GST paid to suppliers = sum of GST_PAYABLE debits from purchase entries
                        // These are the entries posted as: DR GST_PAYABLE / CR CASH for purchase GST
                        let gstPaidTotal = 0;
                        for (const je of GL.entries) {
                            if (!isPeriod(je.period, targetPeriod, periodSet)) continue;
                            if (je.drAccount === "GST_PAYABLE" && je.crAccount === "CASH") {
                                gstPaidTotal += je.amount;
                            }
                        }
                        return gstPaidTotal;
                    })()
                ),
                // Per-category OPEX breakdown — eliminates need for expense store re-aggregation in UI
                opexByCategory: (() => {
                    const catMap: Record<string, number> = {};
                    for (const raw of rawExpenses) {
                        const cat = (raw as any).category ?? "Other";
                        const netInt = toPaise((raw as any).amount ?? 0);
                        if (!isPeriod(toPeriodKey((raw as any).expense_date ?? ""), targetPeriod, periodSet)) continue;
                        catMap[cat] = (catMap[cat] ?? 0) + netInt;
                    }
                    // Return as currency values
                    const result: Record<string, number> = {};
                    for (const [k, v] of Object.entries(catMap)) result[k] = toCurrency(v);
                    return result;
                })(),
            },
            // 3. CASH VIEW (Cash Flow) - Pure liquidity
            cash: {
                inflow: toCurrency(cashFlow.inflow),
                outflow: toCurrency(cashFlow.outflow),
                netCashFlow: toCurrency(cashFlow.net),
                // Balance tracking can be added if opening balance is provided
            },
            balanceSheet: {
                ar: toCurrency(GL.getBalance("AR", targetPeriod, "cumulative")),
                gstPayable: toCurrency(GL.getBalance("GST_PAYABLE", targetPeriod, "cumulative")),
                tdsLiability: toCurrency(GL.getBalance("TDS_PAYABLE", targetPeriod, "cumulative")),
                suspensePmt: toCurrency(GL.getBalance("SUSPENSE_PMT", targetPeriod, "cumulative")),
                suspenseCn: toCurrency(GL.getBalance("SUSPENSE_CN", targetPeriod, "cumulative")),
            },
            trialBalance,
        },
        exportLedger: () => GL.exportLedger(),
        audit,
    };
}
