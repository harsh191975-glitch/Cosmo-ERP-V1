import { useParams } from "react-router-dom";
import { financeData } from "@/data/financeData";
import { Card } from "@/components/ui/card";

const CustomerProfile = () => {
    const { name } = useParams();

    const customerInvoices = financeData.filter(
        i => i.customerName === decodeURIComponent(name || "")
    );

    if (customerInvoices.length === 0) {
        return <div className="p-8">Customer not found</div>;
    }

    const customer = customerInvoices[0];

    const totalRevenue = customerInvoices.reduce(
        (s, i) => s + i.totalAmount,
        0
    );

    const lastInvoice = customerInvoices
        .map(i => i.invoiceDate)
        .sort()
        .reverse()[0];

    return (
        <div className="p-8 space-y-6">

            <h1 className="text-2xl font-bold">{customer.customerName}</h1>

            <Card className="p-6 space-y-3">
                <p><strong>GSTIN:</strong> {customer.gstin}</p>
                <p><strong>Location:</strong> {customer.placeOfSupply}</p>
                <p><strong>Total Revenue:</strong> ₹{totalRevenue.toLocaleString("en-IN")}</p>
                <p><strong>Total Invoices:</strong> {customerInvoices.length}</p>
                <p><strong>Last Invoice:</strong> {lastInvoice}</p>
            </Card>

            <Card className="p-6">
                <h2 className="text-lg font-semibold mb-4">Invoices</h2>

                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b">
                            <th className="text-left py-2">Invoice</th>
                            <th className="text-left py-2">Date</th>
                            <th className="text-left py-2">Amount</th>
                        </tr>
                    </thead>

                    <tbody>
                        {customerInvoices.map(i => (
                            <tr key={i.id} className="border-b">
                                <td className="py-2">{i.invoiceNo}</td>
                                <td className="py-2">{i.invoiceDate}</td>
                                <td className="py-2">
                                    ₹{i.totalAmount.toLocaleString("en-IN")}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Card>

        </div>
    );
};

export default CustomerProfile;