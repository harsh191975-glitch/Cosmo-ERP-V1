import { useMemo } from "react";
import { financeData } from "@/data/financeData";
import { Card } from "@/components/ui/card";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

const Customers = () => {

    const navigate = useNavigate();
    const customers = useMemo(() => {
        const map: Record<string, any> = {};

        financeData.forEach(inv => {
            if (!map[inv.customerName]) {
                map[inv.customerName] = {
                    name: inv.customerName,
                    gstin: inv.gstin,
                    location: inv.placeOfSupply,
                    revenue: 0,
                    lastInvoice: inv.invoiceDate
                };
            }

            map[inv.customerName].revenue += inv.totalAmount;

            if (inv.invoiceDate > map[inv.customerName].lastInvoice) {
                map[inv.customerName].lastInvoice = inv.invoiceDate;
            }
        });

        return Object.values(map);
    }, []);

    return (
        <div className="p-8 space-y-6">

            <h1 className="text-2xl font-bold">Customers</h1>

            <Card className="p-4">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b">
                            <th className="text-left py-2">Name</th>
                            <th className="text-left py-2">GSTIN</th>
                            <th className="text-left py-2">Location</th>
                            <th className="text-left py-2">Total Revenue</th>
                            <th className="text-left py-2">Last Invoice</th>
                        </tr>
                    </thead>

                    <tbody>
                        {customers.map((c: any) => (
                            <tr
                                key={c.name}
                                className="border-b hover:bg-muted/30 cursor-pointer"
                                onClick={() => navigate(`/customers/${encodeURIComponent(c.name)}`)}
                            >
                                <td className="py-2">{c.name}</td>
                                <td className="py-2 font-mono">{c.gstin}</td>
                                <td className="py-2">{c.location}</td>
                                <td className="py-2">
                                    ₹{c.revenue.toLocaleString("en-IN")}
                                </td>
                                <td className="py-2">
                                    {format(new Date(c.lastInvoice), "dd MMM yyyy")}
                                </td>
                            </tr>
                        ))}
                    </tbody>

                </table>
            </Card>

        </div>
    );
};

export default Customers;