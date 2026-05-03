import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import DashboardSidebar from "@/components/DashboardSidebar";
import ProtectedRoute from "@/components/auth/ProtectedRoute";

import Index from "@/pages/Index";
import Invoices from "@/pages/Invoices";
import Customers from "@/pages/Customers";
import CustomerProfile from "@/pages/CustomerProfile";
import Purchases from "@/pages/Purchases";
import Expenses from "@/pages/Expenses";
import Reports from "@/pages/Reports";
import Inventory from "@/pages/Inventory";
import InvoiceDetail from "@/pages/InvoiceDetail";
import ImportInvoice from "@/pages/ImportInvoice";
import CreateInvoice from "@/pages/CreateInvoice";
import CreditNotesTab from "@/pages/CreditNotes";
import CreateCreditNote from "@/pages/CreateCreditNote";
import CreditNoteDetail from "@/pages/CreditNoteDetail";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";

/**
 * Layout route for all protected pages.
 * ProtectedRoute handles the auth check + redirect to /login.
 * DashboardSidebar renders once here — not per-route.
 * <Outlet /> is where child routes render.
 */
const ProtectedLayout = () => (
  <ProtectedRoute>
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="px-6 py-5">
          <Outlet />
        </div>
      </main>
    </div>
  </ProtectedRoute>
);

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* ── Public ── */}
        <Route path="/login" element={<Login />} />

        {/* ── Protected: one layout parent, all dashboard routes as children ── */}
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<Index />} />

          <Route path="/invoices" element={<Invoices />} />
          <Route path="/invoices/line-items" element={<Invoices />} />
          <Route path="/invoices/logistics" element={<Invoices />} />
          <Route path="/invoices/import" element={<ImportInvoice />} />
          <Route path="/invoices/create" element={<CreateInvoice />} />
          {/* Credit Notes — must stay BEFORE /:invoiceNo to avoid param collision */}
          <Route path="/invoices/credit-notes" element={<CreditNotesTab />} />
          <Route path="/invoices/credit-notes/create" element={<CreateCreditNote />} />
          <Route path="/invoices/credit-notes/:cnNumber" element={<CreditNoteDetail />} />
          <Route path="/invoices/:invoiceNo" element={<InvoiceDetail />} />

          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/:customerName" element={<CustomerProfile />} />

          <Route path="/purchases" element={<Purchases />} />
          <Route path="/purchases/raw-materials" element={<Purchases />} />
          <Route path="/purchases/packaging" element={<Purchases />} />

          <Route path="/expenses" element={<Expenses />} />
          <Route path="/expenses/salaries" element={<Expenses />} />
          <Route path="/expenses/commission" element={<Expenses />} />
          <Route path="/expenses/royalty" element={<Expenses />} />
          <Route path="/expenses/utilities" element={<Expenses />} />
          <Route path="/expenses/freight" element={<Expenses />} />

          <Route path="/reports" element={<Reports />} />
          <Route path="/reports/sales" element={<Reports />} />
          <Route path="/reports/purchases" element={<Reports />} />
          <Route path="/reports/expenses" element={<Reports />} />
          <Route path="/reports/pnl" element={<Reports />} />
          <Route path="/reports/cashflow" element={<Reports />} />

          <Route path="/inventory/*" element={<Inventory />} />

          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
