/**
 * useHydratedData.ts - Global ERP Data Hydration Layer
 *
 * The dashboard must render from one coherent snapshot. We therefore:
 *   1. Confirm auth before any RLS-backed reads
 *   2. Fetch dashboard datasets once in a coordinated burst
 *   3. Derive enriched invoices from the exact same raw data
 *   4. Run the financial engine against that same preloaded snapshot
 *   5. Publish one atomic context update so consumers never see mixed phases
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  buildEnrichedInvoices,
  getAllInvoices,
  getAllPayments,
  type EnrichedInvoice,
  type Payment,
} from "@/data/invoiceStore";
import { getAllCreditNotes, getCreditTotalsForInvoices } from "@/data/creditNoteStore";
import { getPurchases } from "@/data/purchaseStore";
import { getExpenses } from "@/data/expenseStore";
import { getStockSummary } from "@/data/inventoryStore";
import { runEnterpriseEngine } from "@/engine/financialEngine";

export type EngineResult = Awaited<ReturnType<typeof runEnterpriseEngine>>;

export interface HydratedData {
  invoicesWithPayments: EnrichedInvoice[];
  payments: Payment[];
  engine: EngineResult | null;
  loading: boolean;
  loadingInvoices: boolean;
  loadingEngine: boolean;
  hydrated: boolean;
  refresh: () => Promise<void>;
}

type HydratedState = Omit<HydratedData, "refresh">;

const DEFAULT_STATE: HydratedState = {
  invoicesWithPayments: [],
  payments: [],
  engine: null,
  loading: true,
  loadingInvoices: true,
  loadingEngine: true,
  hydrated: false,
};

const HydratedDataContext = createContext<HydratedData>({
  ...DEFAULT_STATE,
  refresh: async () => {},
});

export function useHydratedData(): HydratedData {
  return useContext(HydratedDataContext);
}

export function HydratedDataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HydratedState>(DEFAULT_STATE);
  const fetchInProgress = useRef(false);

  const hydrate = useCallback(async () => {
    if (fetchInProgress.current) return;
    fetchInProgress.current = true;

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        console.warn("[HydratedData] No active session - skipping hydration.");
        setState({
          invoicesWithPayments: [],
          payments: [],
          engine: null,
          loading: false,
          loadingInvoices: false,
          loadingEngine: false,
          hydrated: false,
        });
        return;
      }

      setState(prev => ({
        ...prev,
        loading: true,
        loadingInvoices: true,
        loadingEngine: true,
      }));

      const [invoices, payments, purchases, expenses, creditNotes, stockSummary] = await Promise.all([
        getAllInvoices(),
        getAllPayments(),
        getPurchases(),
        getExpenses(),
        getAllCreditNotes(),
        getStockSummary(),
      ]);

      const creditTotals = await getCreditTotalsForInvoices(
        invoices.map(invoice => invoice.invoiceNo),
      );

      const invoicesWithPayments = buildEnrichedInvoices(invoices, payments, creditTotals);
      const engine = await runEnterpriseEngine("all", "dashboard", undefined, {
        invoices,
        payments,
        purchases,
        expenses,
        creditNotes,
        stockSummary,
      });

      setState({
        invoicesWithPayments,
        payments,
        engine,
        loading: false,
        loadingInvoices: false,
        loadingEngine: false,
        hydrated: true,
      });
    } catch (err) {
      console.error("[HydratedData] Hydration failed:", err);
      setState({
        invoicesWithPayments: [],
        payments: [],
        engine: null,
        loading: false,
        loadingInvoices: false,
        loadingEngine: false,
        hydrated: false,
      });
    } finally {
      fetchInProgress.current = false;
    }
  }, []);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setState({
          invoicesWithPayments: [],
          payments: [],
          engine: null,
          loading: false,
          loadingInvoices: false,
          loadingEngine: false,
          hydrated: false,
        });
        return;
      }

      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        hydrate();
      }
    });

    return () => subscription.unsubscribe();
  }, [hydrate]);

  return (
    <HydratedDataContext.Provider
      value={{
        ...state,
        refresh: hydrate,
      }}
    >
      {children}
    </HydratedDataContext.Provider>
  );
}
