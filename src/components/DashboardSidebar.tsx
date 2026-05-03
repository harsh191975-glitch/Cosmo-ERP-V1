import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Orbit, LayoutDashboard, FileText, Users,
  ShoppingCart, ChevronLeft, ChevronRight, ChevronDown,
  List, FlaskConical, Package, TrendingDown,
  BadgePercent, Star, Users2, Zap, Truck, Layers, MapPin,
  BarChart3, TrendingUp, ShoppingBag, DollarSign, ArrowLeftRight,
  Warehouse, PackageSearch, ClipboardList, PlusCircle, Bell,
  ReceiptText, LogOut,
} from "lucide-react";
import { logoutUser } from "@/data/authStore";

const DashboardSidebar = () => {
  const [collapsed, setCollapsed]         = useState(false);
  const [purchasesOpen, setPurchasesOpen] = useState(false);
  const [expensesOpen, setExpensesOpen]   = useState(false);
  const [reportsOpen, setReportsOpen]     = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [invoicesOpen, setInvoicesOpen]   = useState(false);
  const [signingOut, setSigningOut]       = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const isPurchasesActive = location.pathname.startsWith("/purchases");
  const isReportsActive   = location.pathname.startsWith("/reports");
  const isInventoryActive = location.pathname.startsWith("/inventory");
  const isExpensesActive  = location.pathname.startsWith("/expenses");

  const navItemClass = (active: boolean) =>
    `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
    } ${collapsed ? "justify-center" : ""}`;

  const subItemClass = (active: boolean) =>
    `w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-xs font-medium transition-colors ${
      active ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
    }`;

  /**
   * Delegates sign-out entirely to the service layer.
   * UI is responsible only for: showing loading state, handling errors,
   * and navigating away on success.
   * ProtectedRoute's onAuthStateChange listener will also fire independently
   * and redirect — this navigate() call ensures instant UX.
   */
  const handleSignOut = async () => {
    if (signingOut) return;           // Prevent double-clicks
    setSigningOut(true);
    try {
      await logoutUser();             // Service layer — no Supabase calls here
      navigate("/login", { replace: true });
    } catch (err) {
      console.error("[COSMO] Sign-out error:", err);
      // Keep the button enabled so the user can retry
      setSigningOut(false);
    }
  };

  return (
    <aside className={`relative flex flex-col min-h-screen bg-background border-r border-border transition-all duration-300 ${collapsed ? "w-16" : "w-56"}`}>
      {/* Logo */}
      <div className={`flex items-center gap-3 px-4 py-5 border-b border-border ${collapsed ? "justify-center" : ""}`}>
        <Orbit className="h-6 w-6 text-primary flex-shrink-0" />
        {!collapsed && <span className="text-lg font-bold text-foreground tracking-wide">COSMO</span>}
      </div>

      <nav className="flex-1 py-4 space-y-1 px-2">

        <button onClick={() => navigate("/")} className={navItemClass(isActive("/") && location.pathname === "/")}>
          <LayoutDashboard className="h-4 w-4 flex-shrink-0" />
          {!collapsed && <span>Dashboard</span>}
        </button>

        {/* Invoices */}
        <div>
          <button onClick={() => { if (collapsed) { navigate("/invoices"); } else { setInvoicesOpen(o => !o); if (!invoicesOpen) navigate("/invoices"); } }} className={navItemClass(isActive("/invoices"))}>
            <FileText className="h-4 w-4 flex-shrink-0" />
            {!collapsed && (<><span className="flex-1 text-left">Invoices</span><ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${invoicesOpen ? "rotate-180" : ""}`} /></>)}
          </button>
          {!collapsed && invoicesOpen && (
            <div className="mt-1 ml-3 pl-3 border-l border-border space-y-1">
              <button onClick={() => navigate("/invoices")} className={subItemClass(location.pathname === "/invoices")}>
                <List className="h-3.5 w-3.5 flex-shrink-0" />All Invoices
              </button>
              <button onClick={() => navigate("/invoices/line-items")} className={subItemClass(location.pathname === "/invoices/line-items")}>
                <Layers className="h-3.5 w-3.5 flex-shrink-0" />Line Items
              </button>
              <button onClick={() => navigate("/invoices/logistics")} className={subItemClass(location.pathname === "/invoices/logistics")}>
                <MapPin className="h-3.5 w-3.5 flex-shrink-0" />Logistics
              </button>
              <button onClick={() => navigate("/invoices/credit-notes")} className={subItemClass(location.pathname.startsWith("/invoices/credit-notes"))}>
                <ReceiptText className="h-3.5 w-3.5 flex-shrink-0" />Credit Notes
              </button>
            </div>
          )}
        </div>

        <button onClick={() => navigate("/customers")} className={navItemClass(isActive("/customers"))}>
          <Users className="h-4 w-4 flex-shrink-0" />
          {!collapsed && <span>Customers</span>}
        </button>

        {/* Purchases */}
        <div>
          <button onClick={() => { if (collapsed) { navigate("/purchases"); } else { setPurchasesOpen(o => !o); if (!purchasesOpen) navigate("/purchases"); } }} className={navItemClass(isPurchasesActive)}>
            <ShoppingCart className="h-4 w-4 flex-shrink-0" />
            {!collapsed && (<><span className="flex-1 text-left">Purchases</span><ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${purchasesOpen ? "rotate-180" : ""}`} /></>)}
          </button>
          {!collapsed && purchasesOpen && (
            <div className="mt-1 ml-3 pl-3 border-l border-border space-y-1">
              <button onClick={() => navigate("/purchases")} className={subItemClass(location.pathname === "/purchases")}><List className="h-3.5 w-3.5 flex-shrink-0" />All Purchases</button>
              <button onClick={() => navigate("/purchases/raw-materials")} className={subItemClass(location.pathname === "/purchases/raw-materials")}><FlaskConical className="h-3.5 w-3.5 flex-shrink-0" />Raw Materials</button>
              <button onClick={() => navigate("/purchases/packaging")} className={subItemClass(location.pathname === "/purchases/packaging")}><Package className="h-3.5 w-3.5 flex-shrink-0" />Packaging</button>
            </div>
          )}
        </div>

        {/* Expenses */}
        <div>
          <button onClick={() => { if (collapsed) { navigate("/expenses"); } else { setExpensesOpen(o => !o); if (!expensesOpen) navigate("/expenses"); } }} className={navItemClass(isExpensesActive)}>
            <TrendingDown className="h-4 w-4 flex-shrink-0" />
            {!collapsed && (<><span className="flex-1 text-left">Expenses</span><ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${expensesOpen ? "rotate-180" : ""}`} /></>)}
          </button>
          {!collapsed && expensesOpen && (
            <div className="mt-1 ml-3 pl-3 border-l border-border space-y-1">
              <button onClick={() => navigate("/expenses")} className={subItemClass(location.pathname === "/expenses")}><List className="h-3.5 w-3.5 flex-shrink-0" />All Expenses</button>
              <button onClick={() => navigate("/expenses/salaries")} className={subItemClass(location.pathname === "/expenses/salaries")}><Users2 className="h-3.5 w-3.5 flex-shrink-0" />Salaries</button>
              <button onClick={() => navigate("/expenses/commission")} className={subItemClass(location.pathname === "/expenses/commission")}><BadgePercent className="h-3.5 w-3.5 flex-shrink-0" />Commission</button>
              <button onClick={() => navigate("/expenses/royalty")} className={subItemClass(location.pathname === "/expenses/royalty")}><Star className="h-3.5 w-3.5 flex-shrink-0" />Royalty</button>
              <button onClick={() => navigate("/expenses/utilities")} className={subItemClass(location.pathname === "/expenses/utilities")}><Zap className="h-3.5 w-3.5 flex-shrink-0" />Utilities</button>
              <button onClick={() => navigate("/expenses/freight")} className={subItemClass(location.pathname === "/expenses/freight")}><Truck className="h-3.5 w-3.5 flex-shrink-0" />Freight</button>
            </div>
          )}
        </div>

        {/* Reports */}
        <div>
          <button onClick={() => { if (collapsed) { navigate("/reports"); } else { setReportsOpen(o => !o); if (!reportsOpen) navigate("/reports"); } }} className={navItemClass(isReportsActive)}>
            <BarChart3 className="h-4 w-4 flex-shrink-0" />
            {!collapsed && (<><span className="flex-1 text-left">Reports</span><ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${reportsOpen ? "rotate-180" : ""}`} /></>)}
          </button>
          {!collapsed && reportsOpen && (
            <div className="mt-1 ml-3 pl-3 border-l border-border space-y-1">
              <button onClick={() => navigate("/reports/sales")} className={subItemClass(location.pathname === "/reports/sales")}><TrendingUp className="h-3.5 w-3.5 flex-shrink-0" />Sales</button>
              <button onClick={() => navigate("/reports/purchases")} className={subItemClass(location.pathname === "/reports/purchases")}><ShoppingBag className="h-3.5 w-3.5 flex-shrink-0" />Purchases</button>
              <button onClick={() => navigate("/reports/expenses")} className={subItemClass(location.pathname === "/reports/expenses")}><DollarSign className="h-3.5 w-3.5 flex-shrink-0" />Expenses</button>
              <button onClick={() => navigate("/reports/pnl")} className={subItemClass(location.pathname === "/reports/pnl")}><BarChart3 className="h-3.5 w-3.5 flex-shrink-0" />Profit & Loss</button>
              <button onClick={() => navigate("/reports/cashflow")} className={subItemClass(location.pathname === "/reports/cashflow")}><ArrowLeftRight className="h-3.5 w-3.5 flex-shrink-0" />Cash Flow</button>
            </div>
          )}
        </div>

        {/* Inventory */}
        <div>
          <button onClick={() => { if (collapsed) { navigate("/inventory"); } else { setInventoryOpen(o => !o); if (!inventoryOpen) navigate("/inventory"); } }} className={navItemClass(isInventoryActive)}>
            <Warehouse className="h-4 w-4 flex-shrink-0" />
            {!collapsed && (<><span className="flex-1 text-left">Inventory</span><ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${inventoryOpen ? "rotate-180" : ""}`} /></>)}
          </button>
          {!collapsed && inventoryOpen && (
            <div className="mt-1 ml-3 pl-3 border-l border-border space-y-1">
              <button onClick={() => navigate("/inventory/products")} className={subItemClass(location.pathname === "/inventory/products" || location.pathname === "/inventory")}><PackageSearch className="h-3.5 w-3.5 flex-shrink-0" />Products</button>
              <button onClick={() => navigate("/inventory/movement")} className={subItemClass(location.pathname === "/inventory/movement")}><PlusCircle className="h-3.5 w-3.5 flex-shrink-0" />Stock Movement</button>
              <button onClick={() => navigate("/inventory/transactions")} className={subItemClass(location.pathname === "/inventory/transactions")}><ClipboardList className="h-3.5 w-3.5 flex-shrink-0" />Transaction Log</button>
              <button onClick={() => navigate("/inventory/alerts")} className={subItemClass(location.pathname === "/inventory/alerts")}><Bell className="h-3.5 w-3.5 flex-shrink-0" />Low Stock Alerts</button>
            </div>
          )}
        </div>

      </nav>

      {/* ── Logout ────────────────────────────────────────────────────────────── */}
      <div className="px-2 pb-4 border-t border-border pt-3">
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
            text-muted-foreground hover:bg-destructive/10 hover:text-destructive
            disabled:opacity-50 disabled:cursor-not-allowed
            ${collapsed ? "justify-center" : ""}`}
        >
          <LogOut className={`h-4 w-4 flex-shrink-0 ${signingOut ? "animate-pulse" : ""}`} />
          {!collapsed && (
            <span>{signingOut ? "Signing out…" : "Sign out"}</span>
          )}
        </button>
      </div>

      {/* Collapse toggle */}
      <button onClick={() => setCollapsed(c => !c)} className="absolute -right-3 top-6 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground shadow-sm transition-colors">
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>
    </aside>
  );
};

export default DashboardSidebar;
