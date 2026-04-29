import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Upload, FileText, RefreshCw, Check, X,
  AlertCircle, ChevronDown, ChevronRight, Sparkles, Eye,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { saveInvoice, getAllInvoices } from "@/data/invoiceStore";
import { Invoice } from "@/data/financeData";

// ── Types ──────────────────────────────────────────────────────
interface ExtractedLineItem {
  "Product Description": string;
  "Quantity": number;
  "UOM": string;
  "Rate (Incl Tax)": number;
  "Rate (Excl Tax)"?: number;
  "Discount %": number;
  "Line Amount"?: number;
}

interface ExtractedInvoice {
  "Invoice Details": {
    "Invoice Number": string;
    "Invoice Date": string;
    "Booked By"?: string;
  };
  "Customer Details": {
    "Customer Name": string;
    "GSTIN": string;
    "Place of Supply": string;
  };
  "Shipping & Logistics": {
    "e-Way Bill No": string | null;
    "Dispatched Through": string | null;
    "Destination": string | null;
  };
  "Financial Summary": {
    "Taxable Amount": number;
    "CGST": number;
    "SGST": number;
    "Freight": number;
    "Round Off"?: number;
    "Total Invoice Amount": number;
    "Total Weight_KG": number | null;
  };
  "Line Items": ExtractedLineItem[];
}

// ── Helpers ────────────────────────────────────────────────────
const fmt = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string) => {
  try {
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return d; }
};

// Convert PDF file to base64
const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// ── Claude API extractor ───────────────────────────────────────
async function extractInvoiceFromPDF(file: File): Promise<ExtractedInvoice> {
  const base64 = await fileToBase64(file);

  const prompt = `You are an invoice data extraction expert. Extract ALL data from this Indian GST Tax Invoice PDF and return ONLY a valid JSON object with exactly this structure. No explanation, no markdown, just raw JSON.

{
  "Invoice Details": {
    "Invoice Number": "string - invoice number like AHC/0023/25-26",
    "Invoice Date": "string - ISO date YYYY-MM-DD",
    "Booked By": "string or null"
  },
  "Customer Details": {
    "Customer Name": "string - buyer name",
    "GSTIN": "string - buyer GSTIN",
    "Place of Supply": "string - city/place"
  },
  "Shipping & Logistics": {
    "e-Way Bill No": "string or null",
    "Dispatched Through": "string or null",
    "Destination": "string or null"
  },
  "Financial Summary": {
    "Taxable Amount": number,
    "CGST": number,
    "SGST": number,
    "Freight": number (negative if deducted, 0 if absent),
    "Round Off": number (negative if deducted, 0 if absent),
    "Total Invoice Amount": number,
    "Total Weight_KG": number or null
  },
  "Line Items": [
    {
      "Product Description": "string",
      "Quantity": number,
      "UOM": "string like BDL or KG",
      "Rate (Incl Tax)": number,
      "Rate (Excl Tax)": number,
      "Discount %": number,
      "Line Amount": number
    }
  ]
}

Rules:
- Dates must be YYYY-MM-DD format
- All monetary values must be plain numbers (no currency symbols)
- Freight is typically negative (deducted), e.g. -1600 not 1600
- Round Off is typically negative, e.g. -0.25
- If a field is missing, use null for strings or 0 for numbers
- Extract ALL line items including every product row`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64 },
          },
          { type: "text", text: prompt },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `API error ${response.status}`);
  }

  const data = await response.json();
  const text = data.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("");

  // Strip any markdown fences
  const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(clean) as ExtractedInvoice;
}

// ── Field editor row ───────────────────────────────────────────
const FieldRow = ({ label, value, onChange, type = "text" }: {
  label: string; value: string | number; type?: string;
  onChange: (v: string) => void;
}) => (
  <div className="flex items-center gap-3">
    <label className="text-xs text-muted-foreground w-36 flex-shrink-0">{label}</label>
    <Input
      className="h-8 text-sm flex-1"
      type={type}
      value={value ?? ""}
      onChange={e => onChange(e.target.value)}
    />
  </div>
);

// ══════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════
const ImportInvoice = () => {
  const navigate = useNavigate();
  const fileRef  = useRef<HTMLInputElement>(null);

  const [dragOver, setDragOver]         = useState(false);
  const [file, setFile]                 = useState<File | null>(null);
  const [extracting, setExtracting]     = useState(false);
  const [extracted, setExtracted]       = useState<ExtractedInvoice | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const [expandItems, setExpandItems]   = useState(true);
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);

  // ── File handlers ────────────────────────────────────────────
  const handleFile = useCallback((f: File) => {
    if (f.type !== "application/pdf") {
      setError("Please upload a PDF file.");
      return;
    }
    setFile(f);
    setExtracted(null);
    setError(null);
    setSaved(false);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleExtract = async () => {
    if (!file) return;
    setExtracting(true);
    setError(null);
    try {
      const result = await extractInvoiceFromPDF(file);
      setExtracted(result);
    } catch (err: any) {
      setError(err.message ?? "Failed to extract invoice data. Try again.");
    } finally {
      setExtracting(false);
    }
  };

  // ── Edit helpers ─────────────────────────────────────────────
  const setField = (path: string[], value: string) => {
    setExtracted(prev => {
      if (!prev) return prev;
      const next = JSON.parse(JSON.stringify(prev)) as ExtractedInvoice;
      let obj: any = next;
      for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
      const last = path[path.length - 1];
      // Auto-cast numbers
      const num = parseFloat(value);
      obj[last] = (!isNaN(num) && value.trim() !== "") ? num : value;
      return next;
    });
  };

  const setLineItem = (idx: number, key: keyof ExtractedLineItem, value: string) => {
    setExtracted(prev => {
      if (!prev) return prev;
      const next = JSON.parse(JSON.stringify(prev)) as ExtractedInvoice;
      const num = parseFloat(value);
      (next["Line Items"][idx] as any)[key] = (!isNaN(num) && value.trim() !== "") ? num : value;
      return next;
    });
  };

  // ── Save to store (instant, no file download needed) ──────────
  const handleSave = async () => {
    if (!extracted) return;
    setSaving(true);
    try {
      const invoiceNo = extracted["Invoice Details"]["Invoice Number"];

      // Check for duplicate
      const dup = getAllInvoices().find(i => i.invoiceNo === invoiceNo);
      if (dup) {
        setError(`Invoice ${invoiceNo} already exists.`);
        setSaving(false);
        return;
      }

      // Convert extracted JSON format → Invoice type
      const gstRate = 18;
      const taxable = extracted["Financial Summary"]["Taxable Amount"];
      const cgst    = extracted["Financial Summary"]["CGST"];

      const newInvoice: Invoice = {
        id:                getAllInvoices().length + 1,
        invoiceNo:         invoiceNo.trim(),
        invoiceDate:       extracted["Invoice Details"]["Invoice Date"],
        bookedBy:          extracted["Invoice Details"]["Booked By"] ?? "",
        customerName:      extracted["Customer Details"]["Customer Name"].trim(),
        gstin:             extracted["Customer Details"]["GSTIN"].trim(),
        placeOfSupply:     extracted["Customer Details"]["Place of Supply"].trim(),
        eWayBillNo:        extracted["Shipping & Logistics"]["e-Way Bill No"] ?? null,
        dispatchedThrough: extracted["Shipping & Logistics"]["Dispatched Through"] ?? null,
        destination:       extracted["Shipping & Logistics"]["Destination"] ?? null,
        taxableAmount:     taxable,
        cgst,
        sgst:              extracted["Financial Summary"]["SGST"],
        freight:           extracted["Financial Summary"]["Freight"] ?? 0,
        roundOff:          extracted["Financial Summary"]["Round Off"] ?? 0,
        totalAmount:       extracted["Financial Summary"]["Total Invoice Amount"],
        weightKg:          extracted["Financial Summary"]["Total Weight_KG"] ?? 0,
        gstRate:           taxable > 0 ? Math.round((cgst / taxable) * 200) : gstRate,
        lineItems:         (extracted["Line Items"] ?? []).map((li: any) => {
          const qty  = li["Quantity"] ?? 0;
          const rate = li["Rate (Incl Tax)"] ?? 0;
          const disc = li["Discount %"] ?? 0;
          const rateExclTax = li["Rate (Excl Tax)"] ?? Math.round((rate / 1.18) * 100) / 100;
          const lineAmount  = li["Line Amount"]    ?? Math.round(qty * rateExclTax * (1 - disc / 100) * 100) / 100;
          return {
            productDescription: (li["Product Description"] ?? "").trim(),
            quantity: qty, uom: li["UOM"] ?? "BDL",
            rateInclTax: rate, rateExclTax, discountPct: disc, lineAmount,
          };
        }),
      };

      saveInvoice(newInvoice);
      setSaved(true);

      // Navigate to the new invoice after short delay
      setTimeout(() => navigate(`/invoices/${encodeURIComponent(invoiceNo)}`), 800);
    } finally {
      setSaving(false);
    }
  };

  const inv = extracted;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/invoices")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to Invoices
          </button>
          <div className="w-px h-5 bg-border" />
          <div>
            <h2 className="text-lg font-bold">Import Invoice from PDF</h2>
            <p className="text-xs text-muted-foreground">Upload your Tally-generated invoice PDF — AI extracts all the data automatically</p>
          </div>
        </div>
        {inv && (
          <button onClick={handleSave} disabled={saving || saved}
            className="flex items-center gap-2 h-9 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
            {saving ? <><RefreshCw className="h-4 w-4 animate-spin" />Saving…</>
            : saved  ? <><Check className="h-4 w-4" />Saved!</>
            :          <><Check className="h-4 w-4" />Save Invoice</>}
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-950/30 border border-red-700/40 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {saved && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-green-950/30 border border-green-700/40 text-sm text-green-400">
          <Check className="h-4 w-4" />
          <span>
            <strong>Invoice saved!</strong> Redirecting to invoice detail…
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── LEFT: Upload + Extract ── */}
        <div className="space-y-4">
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileRef.current?.click()}
            className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed cursor-pointer transition-all p-10
              ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/20"}`}>
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
            <div className={`h-14 w-14 rounded-2xl flex items-center justify-center ${file ? "bg-green-950/40" : "bg-muted/50"}`}>
              {file
                ? <FileText className="h-7 w-7 text-green-400" />
                : <Upload className="h-7 w-7 text-muted-foreground" />}
            </div>
            {file ? (
              <div className="text-center">
                <p className="font-semibold text-sm text-green-400">{file.name}</p>
                <p className="text-xs text-muted-foreground mt-1">{(file.size / 1024).toFixed(1)} KB · Click to change</p>
              </div>
            ) : (
              <div className="text-center">
                <p className="font-medium text-sm">Drop your invoice PDF here</p>
                <p className="text-xs text-muted-foreground mt-1">or click to browse · PDF only</p>
              </div>
            )}
          </div>

          {/* Extract button */}
          <button
            onClick={handleExtract}
            disabled={!file || extracting}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
            {extracting ? (
              <><RefreshCw className="h-4 w-4 animate-spin" /> Extracting with AI…</>
            ) : (
              <><Sparkles className="h-4 w-4" /> Extract Invoice Data</>
            )}
          </button>

          {extracting && (
            <div className="rounded-xl border border-border p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reading your invoice…</p>
              {["Parsing PDF structure", "Identifying invoice fields", "Extracting line items", "Calculating totals"].map((step, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  {step}
                </div>
              ))}
            </div>
          )}

          {/* How it works */}
          {!file && (
            <Card className="p-5 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">How it works</p>
              {[
                ["1", "Upload", "Drop your Tally-generated invoice PDF"],
                ["2", "Extract", "Claude AI reads every field automatically"],
                ["3", "Review", "Check and edit the extracted data"],
                ["4", "Save", "Invoice saved instantly — no file replacement needed"],
              ].map(([n, title, desc]) => (
                <div key={n} className="flex items-start gap-3">
                  <div className="h-5 w-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">{n}</div>
                  <div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>

        {/* ── RIGHT: Extracted data preview + editor ── */}
        {inv ? (
          <div className="space-y-4 overflow-y-auto" style={{ maxHeight: "80vh" }}>
            {/* Header badge */}
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-950/30 border border-green-700/40">
              <Check className="h-4 w-4 text-green-400" />
              <span className="text-sm text-green-400 font-medium">Extraction complete — review and edit below</span>
            </div>

            {/* Invoice Details */}
            <Card className="p-5 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Invoice Details</p>
              <FieldRow label="Invoice Number" value={inv["Invoice Details"]["Invoice Number"]}
                onChange={v => setField(["Invoice Details","Invoice Number"], v)} />
              <FieldRow label="Invoice Date" value={inv["Invoice Details"]["Invoice Date"]} type="date"
                onChange={v => setField(["Invoice Details","Invoice Date"], v)} />
              <FieldRow label="Booked By" value={inv["Invoice Details"]["Booked By"] ?? ""}
                onChange={v => setField(["Invoice Details","Booked By"], v)} />
            </Card>

            {/* Customer Details */}
            <Card className="p-5 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Customer Details</p>
              <FieldRow label="Customer Name" value={inv["Customer Details"]["Customer Name"]}
                onChange={v => setField(["Customer Details","Customer Name"], v)} />
              <FieldRow label="GSTIN" value={inv["Customer Details"]["GSTIN"]}
                onChange={v => setField(["Customer Details","GSTIN"], v)} />
              <FieldRow label="Place of Supply" value={inv["Customer Details"]["Place of Supply"]}
                onChange={v => setField(["Customer Details","Place of Supply"], v)} />
            </Card>

            {/* Shipping */}
            <Card className="p-5 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Shipping & Logistics</p>
              <FieldRow label="e-Way Bill No" value={inv["Shipping & Logistics"]["e-Way Bill No"] ?? ""}
                onChange={v => setField(["Shipping & Logistics","e-Way Bill No"], v)} />
              <FieldRow label="Dispatched Through" value={inv["Shipping & Logistics"]["Dispatched Through"] ?? ""}
                onChange={v => setField(["Shipping & Logistics","Dispatched Through"], v)} />
              <FieldRow label="Destination" value={inv["Shipping & Logistics"]["Destination"] ?? ""}
                onChange={v => setField(["Shipping & Logistics","Destination"], v)} />
            </Card>

            {/* Financial Summary */}
            <Card className="p-5 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Financial Summary</p>
              <FieldRow label="Taxable Amount" value={inv["Financial Summary"]["Taxable Amount"]} type="number"
                onChange={v => setField(["Financial Summary","Taxable Amount"], v)} />
              <FieldRow label="CGST" value={inv["Financial Summary"]["CGST"]} type="number"
                onChange={v => setField(["Financial Summary","CGST"], v)} />
              <FieldRow label="SGST" value={inv["Financial Summary"]["SGST"]} type="number"
                onChange={v => setField(["Financial Summary","SGST"], v)} />
              <FieldRow label="Freight" value={inv["Financial Summary"]["Freight"]} type="number"
                onChange={v => setField(["Financial Summary","Freight"], v)} />
              <FieldRow label="Round Off" value={inv["Financial Summary"]["Round Off"] ?? 0} type="number"
                onChange={v => setField(["Financial Summary","Round Off"], v)} />
              <FieldRow label="Total Amount" value={inv["Financial Summary"]["Total Invoice Amount"]} type="number"
                onChange={v => setField(["Financial Summary","Total Invoice Amount"], v)} />
              <FieldRow label="Weight (KG)" value={inv["Financial Summary"]["Total Weight_KG"] ?? ""} type="number"
                onChange={v => setField(["Financial Summary","Total Weight_KG"], v)} />
            </Card>

            {/* Line Items */}
            <Card className="p-0 overflow-hidden">
              <button
                onClick={() => setExpandItems(v => !v)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/20 transition-colors">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Line Items ({inv["Line Items"].length})
                </p>
                {expandItems ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </button>
              {expandItems && (
                <div className="border-t border-border overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border">
                        <th className="px-3 py-2 text-left text-muted-foreground">#</th>
                        <th className="px-3 py-2 text-left text-muted-foreground">Description</th>
                        <th className="px-3 py-2 text-right text-muted-foreground">Qty</th>
                        <th className="px-3 py-2 text-center text-muted-foreground">UOM</th>
                        <th className="px-3 py-2 text-right text-muted-foreground">Rate (Incl)</th>
                        <th className="px-3 py-2 text-right text-muted-foreground">Disc%</th>
                        <th className="px-3 py-2 text-right text-muted-foreground">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inv["Line Items"].map((li, i) => (
                        <tr key={i} className="border-t border-border/50">
                          <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-2">
                            <Input className="h-7 text-xs min-w-40" value={li["Product Description"]}
                              onChange={e => setLineItem(i, "Product Description", e.target.value)} />
                          </td>
                          <td className="px-3 py-2">
                            <Input className="h-7 text-xs w-16 text-right" type="number" value={li["Quantity"]}
                              onChange={e => setLineItem(i, "Quantity", e.target.value)} />
                          </td>
                          <td className="px-3 py-2">
                            <Input className="h-7 text-xs w-14 text-center" value={li["UOM"]}
                              onChange={e => setLineItem(i, "UOM", e.target.value)} />
                          </td>
                          <td className="px-3 py-2">
                            <Input className="h-7 text-xs w-20 text-right" type="number" value={li["Rate (Incl Tax)"]}
                              onChange={e => setLineItem(i, "Rate (Incl Tax)", e.target.value)} />
                          </td>
                          <td className="px-3 py-2">
                            <Input className="h-7 text-xs w-14 text-right" type="number" value={li["Discount %"]}
                              onChange={e => setLineItem(i, "Discount %", e.target.value)} />
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-green-400">
                            {fmt(li["Line Amount"] ?? 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Save button at bottom too */}
            <button onClick={handleSave} disabled={saving || saved}
              className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {saving ? <><RefreshCw className="h-4 w-4 animate-spin" />Saving…</>
              : saved  ? <><Check className="h-4 w-4" />Saved! Redirecting…</>
              :          <><Check className="h-4 w-4" />Save Invoice</>}
            </button>
          </div>
        ) : (
          !extracting && file && (
            <div className="flex items-center justify-center h-64 rounded-xl border border-dashed border-border">
              <div className="text-center space-y-2">
                <Eye className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">Click "Extract Invoice Data" to analyse</p>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default ImportInvoice;
