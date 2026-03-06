import { Link } from "react-router-dom";
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Filter, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface DashboardSidebarProps {
  customers: string[];
  locations: string[];
  years: string[];
  selectedCustomer: string;
  selectedLocation: string;
  selectedMonth: string;
  selectedYear: string;
  dateFrom: string;
  dateTo: string;
  onCustomerChange: (v: string) => void;
  onLocationChange: (v: string) => void;
  onMonthChange: (v: string) => void;
  onYearChange: (v: string) => void;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  onReset: () => void;
}

const DashboardSidebar = ({
  customers, locations, years, selectedCustomer, selectedLocation,
  selectedMonth, selectedYear,
  dateFrom, dateTo, onCustomerChange, onLocationChange,
  onMonthChange, onYearChange,
  onDateFromChange, onDateToChange, onReset,
}: DashboardSidebarProps) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={`shrink-0 border-r border-border bg-card min-h-screen transition-all duration-300 relative ${collapsed ? "w-14" : "w-72 p-6"}`}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-6 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground transition-colors"
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
      </button>

      {collapsed ? (
        <div className="flex flex-col items-center pt-6 gap-4">
          <Filter className="h-5 w-5 text-primary" />
        </div>
      ) : (
        <div className="space-y-6">


          {/* Navigation */}
          <div className="space-y-2">
            <Link
              to="/"
              className="block px-3 py-2 rounded hover:bg-muted text-sm font-medium"
            >
              Dashboard
            </Link>

            <Link
              to="/customers"
              className="block px-3 py-2 rounded hover:bg-muted text-sm font-medium"
            >
              Customers
            </Link>
          </div>

          {/* Filters Title */}
          <div className="flex items-center gap-2 mb-2">
            <Filter className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Filters</h2>
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground text-sm">Customer</Label>
            <Select value={selectedCustomer} onValueChange={onCustomerChange}>
              <SelectTrigger><SelectValue placeholder="All Customers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Customers</SelectItem>
                {customers.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground text-sm">Place of Supply</Label>
            <Select value={selectedLocation} onValueChange={onLocationChange}>
              <SelectTrigger><SelectValue placeholder="All Locations" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                {locations.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground text-sm">Month</Label>
            <Select value={selectedMonth} onValueChange={onMonthChange}>
              <SelectTrigger><SelectValue placeholder="All Months" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Months</SelectItem>
                {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1).padStart(2, "0")}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground text-sm">Year</Label>
            <Select value={selectedYear} onValueChange={onYearChange}>
              <SelectTrigger><SelectValue placeholder="All Years" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground text-sm">Date From</Label>
            <Input type="date" value={dateFrom} onChange={e => onDateFromChange(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground text-sm">Date To</Label>
            <Input type="date" value={dateTo} onChange={e => onDateToChange(e.target.value)} />
          </div>

          <Button variant="outline" className="w-full" onClick={onReset}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset Filters
          </Button>
        </div>
      )
      }
    </aside >
  );
};

export default DashboardSidebar;
