import { useMemo, useState } from "react";
import { financeData, Invoice } from "@/data/financeData";
import KPICard from "@/components/KPICard";
import DashboardSidebar from "@/components/DashboardSidebar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { IndianRupee, FileText, TrendingUp, Search, Orbit, ChevronDown, ChevronRight, Building2 } from "lucide-react";
import {
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const CHART_COLORS = [
  "hsl(217, 91%, 60%)", "hsl(160, 60%, 45%)", "hsl(43, 96%, 56%)",
  "hsl(280, 65%, 60%)", "hsl(0, 84%, 60%)", "hsl(190, 70%, 50%)",
];

const formatCurrency = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

const Index = () => {
  const [selectedCustomer, setSelectedCustomer] = useState("all");
  const [selectedLocation, setSelectedLocation] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [selectedYear, setSelectedYear] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<keyof Invoice>("invoiceDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const customers = useMemo(() => [...new Set(financeData.map(d => d.customerName))].sort(), []);
  const locations = useMemo(() => [...new Set(financeData.map(d => d.placeOfSupply))].sort(), []);
  const years = useMemo(() => [...new Set(financeData.map(d => d.invoiceDate.slice(0, 4)))].sort(), []);

  const isCustomerSelected = selectedCustomer !== "all";
  const selectedCustomerInfo = isCustomerSelected
    ? financeData.find(c => c.customerName === selectedCustomer)
    : null;
  const filtered = useMemo(() => {
    return financeData.filter(d => {
      if (selectedCustomer !== "all" && d.customerName !== selectedCustomer) return false;
      if (selectedLocation !== "all" && d.placeOfSupply !== selectedLocation) return false;
      if (selectedMonth !== "all" && d.invoiceDate.slice(5, 7) !== selectedMonth) return false;
      if (selectedYear !== "all" && d.invoiceDate.slice(0, 4) !== selectedYear) return false;
      if (dateFrom && d.invoiceDate < dateFrom) return false;
      if (dateTo && d.invoiceDate > dateTo) return false;
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        if (
          !d.invoiceNo.toLowerCase().includes(s) &&
          !d.customerName.toLowerCase().includes(s) &&
          !d.placeOfSupply.toLowerCase().includes(s) &&
          !d.totalAmount.toString().includes(s) &&
          !d.invoiceDate.includes(s)
        ) return false;
      }
      return true;
    });
  }, [selectedCustomer, selectedLocation, selectedMonth, selectedYear, dateFrom, dateTo, searchTerm]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalRevenue = filtered.reduce((s, d) => s + d.totalAmount, 0);

  const growthPct = useMemo(() => {
    const months = [...new Set(filtered.map(d => d.invoiceDate.slice(0, 7)))].sort();
    if (months.length >= 2) {
      const lastMonth = months[months.length - 1];
      const prevM = months[months.length - 2];
      const lastRev = filtered.filter(d => d.invoiceDate.startsWith(lastMonth)).reduce((s, d) => s + d.totalAmount, 0);
      const prevMRev = filtered.filter(d => d.invoiceDate.startsWith(prevM)).reduce((s, d) => s + d.totalAmount, 0);
      if (prevMRev === 0) return 0;
      return ((lastRev - prevMRev) / prevMRev) * 100;
    }
    return 0;
  }, [filtered]);

  const monthlyData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(d => {
      const m = d.invoiceDate.slice(0, 7);
      map[m] = (map[m] || 0) + d.totalAmount;
    });
    return Object.entries(map).sort().map(([month, revenue]) => ({
      month: new Date(month + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      revenue,
    }));
  }, [filtered]);

  const handleSort = (key: keyof Invoice) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const resetFilters = () => {
    setSelectedCustomer("all");
    setSelectedLocation("all");
    setSelectedMonth("all");
    setSelectedYear("all");
    setDateFrom("");
    setDateTo("");
  };

  const SortIcon = ({ col }: { col: keyof Invoice }) =>
    sortKey === col ? <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span> : null;

  return (
    <div className="flex min-h-screen">
      <DashboardSidebar
        customers={customers} locations={locations} years={years}
        selectedCustomer={selectedCustomer} selectedLocation={selectedLocation}
        selectedMonth={selectedMonth} selectedYear={selectedYear}
        dateFrom={dateFrom} dateTo={dateTo}
        onCustomerChange={setSelectedCustomer} onLocationChange={setSelectedLocation}
        onMonthChange={setSelectedMonth} onYearChange={setSelectedYear}
        onDateFromChange={setDateFrom} onDateToChange={setDateTo}
        onReset={resetFilters}
      />

      <main className="flex-1 p-8 space-y-8 overflow-auto">
        <div className="flex items-center gap-3">
          <Orbit className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold text-foreground tracking-wide">COSMO</h1>
        </div>

        {/* Customer Detail Card - shown when a customer is selected */}
        {isCustomerSelected && selectedCustomerInfo && (
          <Card className="p-6 shadow-sm border-primary/20">
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-primary/10 p-3">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-foreground">{selectedCustomerInfo.name}</h2>
                <div className="flex flex-wrap gap-3 mt-2">
                  <Badge variant="secondary" className="text-xs font-mono">
                    GSTIN: {selectedCustomerInfo?.gstin}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {selectedCustomerInfo.placeOfSupply}
                  </Badge>
                </div>
                <div className="flex gap-6 mt-3 text-sm text-muted-foreground">
                  <span>Total Invoices: <strong className="text-foreground">{filtered.length}</strong></span>
                  <span>Total Revenue: <strong className="text-foreground">{formatCurrency(totalRevenue)}</strong></span>
                  <span>Total CGST: <strong className="text-foreground">{formatCurrency(filtered.reduce((s, d) => s + d.cgst, 0))}</strong></span>
                  <span>Total SGST: <strong className="text-foreground">{formatCurrency(filtered.reduce((s, d) => s + d.sgst, 0))}</strong></span>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* KPIs - show growth only when no specific customer */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${isCustomerSelected ? "" : "lg:grid-cols-3"} gap-4`}>
          <KPICard icon={IndianRupee} title="Total Revenue" value={formatCurrency(totalRevenue)} subtitle={`${filtered.length} invoices`} />
          <KPICard icon={FileText} title="Total Invoices" value={filtered.length.toString()} />
          {!isCustomerSelected && (
            <KPICard icon={TrendingUp} title="Revenue Growth" value={`${growthPct >= 0 ? "↑" : "↓"} ${Math.abs(growthPct).toFixed(1)}%`} subtitle="vs last month" />
          )}
        </div>

        {/* Chart - only when no specific customer selected */}
        {!isCustomerSelected && (
          <Card className="p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground mb-4">Monthly Revenue</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 18%)" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(215, 20%, 55%)" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(215, 20%, 55%)" tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ backgroundColor: 'hsl(222, 47%, 11%)', border: '1px solid hsl(222, 30%, 18%)', borderRadius: '8px', color: 'hsl(210, 40%, 92%)' }} />
                <Line type="monotone" dataKey="revenue" stroke={CHART_COLORS[0]} strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Data Table */}
        <Card className="p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Invoice Data</h3>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search invoices..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="px-2 py-3 w-8"></th>
                  {([
                    ["invoiceNo", "Invoice No."],
                    ["invoiceDate", "Date"],
                    ["customerName", "Customer"],
                    ["placeOfSupply", "Location"],
                    ["totalAmount", "Amount"],
                  ] as [keyof Invoice, string][]).map(([key, label]) => (
                    <th key={key} className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none" onClick={() => handleSort(key)}>
                      {label}<SortIcon col={key} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(d => (
                  <>
                    <tr
                      key={d.id}
                      className="border-t border-border hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => setExpandedRow(expandedRow === d.id ? null : d.id)}
                    >
                      <td className="px-2 py-3 text-muted-foreground">
                        {expandedRow === d.id
                          ? <ChevronDown className="h-4 w-4" />
                          : <ChevronRight className="h-4 w-4" />}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{d.invoiceNo}</td>
                      <td className="px-4 py-3">{new Date(d.invoiceDate).toLocaleDateString()}</td>
                      <td className="px-4 py-3 font-medium">{d.customerName}</td>
                      <td className="px-4 py-3">{d.placeOfSupply}</td>
                      <td className="px-4 py-3 font-medium">{formatCurrency(d.totalAmount)}</td>
                    </tr>
                    {expandedRow === d.id && (
                      <tr key={`${d.id}-detail`} className="bg-muted/20 border-t border-border">
                        <td colSpan={6} className="px-8 py-4">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground text-xs">GSTIN</p>
                              <p className="font-mono font-medium text-foreground">{d.gstin}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">Taxable Amount</p>
                              <p className="font-medium text-foreground">{formatCurrency(d.taxableAmount)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">CGST (9%)</p>
                              <p className="font-medium text-foreground">{formatCurrency(d.cgst)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">SGST (9%)</p>
                              <p className="font-medium text-foreground">{formatCurrency(d.sgst)}</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-3">{sorted.length} of {financeData.length} records</p>
        </Card>
      </main>
    </div>
  );
};

export default Index;
