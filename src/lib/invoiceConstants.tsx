// ── Shared invoice constants, helpers and print layout ────────
// Used by both InvoiceDetail.tsx and CreateInvoice.tsx

export const COMPANY = {
  name:      "AMAN AND HARSHVARDHAN COMPANY",
  address:   "B-10, Bela Industrial Area, Bela,",
  city:      "Muzaffarpur, Bihar-842004",
  gstin:     "10ACKFA2426N1ZK",
  state:     "Bihar",
  stateCode: "10",
  contact:   "72502 26777, +91-7070992326",
  email:     "info.haindustries@gmail.com",
  bank: {
    accountName: "AMAN AND HARSHVARDHAN COMPANY",
    bankName:    "UNION BANK OF INDIA",
    accountNo:   "902101010000029",
    ifsc:        "UBIN0590215",
    branch:      "LS COLLEGE, MUZ.",
  },
};

export const HSN_CODE = "39173990";
export const GST_RATE = 18; // 9% CGST + 9% SGST

export const fmtDate = (d: string) => {
  try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return d; }
};

export const fmtNum = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const r2 = (n: number) => Math.round(n * 100) / 100;

export function numberToWords(num: number): string {
  const ones = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine",
                 "Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen",
                 "Seventeen","Eighteen","Nineteen"];
  const tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  if (num === 0) return "Zero";
  if (num < 0)   return "Minus " + numberToWords(-num);
  function convert(n: number): string {
    if (n < 20)       return ones[n];
    if (n < 100)      return tens[Math.floor(n/10)] + (n%10 ? " " + ones[n%10] : "");
    if (n < 1000)     return ones[Math.floor(n/100)] + " Hundred" + (n%100 ? " " + convert(n%100) : "");
    if (n < 100000)   return convert(Math.floor(n/1000)) + " Thousand" + (n%1000 ? " " + convert(n%1000) : "");
    if (n < 10000000) return convert(Math.floor(n/100000)) + " Lakh" + (n%100000 ? " " + convert(n%100000) : "");
    return convert(Math.floor(n/10000000)) + " Crore" + (n%10000000 ? " " + convert(n%10000000) : "");
  }
  const rupees = Math.floor(num);
  const paise  = Math.round((num - rupees) * 100);
  let result = "INR " + convert(rupees);
  if (paise > 0) result += " and " + convert(paise) + " paise";
  return result + " Only";
}

export const PRINT_STYLES = `
@media print {
  body * { visibility: hidden !important; }
  #invoice-print-area,
  #invoice-print-area * { visibility: visible !important; }
  #invoice-print-area {
    position: fixed !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    background: white !important;
    padding: 8mm 10mm !important;
  }
  @page { margin: 0; size: A4 portrait; }
}
`;

// ── Printable invoice data shape (used by both detail + create) ─
export interface PrintInvoice {
  invoiceNo:         string;
  invoiceDate:       string;
  bookedBy:          string;
  customerName:      string;
  gstin:             string;
  placeOfSupply:     string;
  eWayBillNo:        string | null;
  dispatchedThrough: string | null;
  destination:       string | null;
  taxableAmount:     number;
  cgst:              number;
  sgst:              number;
  freight:           number;
  roundOff:          number;
  totalAmount:       number;
  weightKg:          number;
  gstRate:           number;
  lineItems: {
    productDescription: string;
    quantity:           number;
    uom:                string;
    rateInclTax:        number;
    rateExclTax:        number;
    discountPct:        number;
    lineAmount:         number;
  }[];
}

// ── THE TALLY PRINT LAYOUT (shared) ───────────────────────────

// ── THE TALLY PRINT LAYOUT ────────────────────────────────────
export const InvoicePrintView = ({ invoice }: { invoice: PrintInvoice }) => {
  const cgstRate = invoice.gstRate / 2;
  const totalQty = invoice.lineItems.reduce((s, li) => s + li.quantity, 0);
  const totalTax = invoice.cgst + invoice.sgst;

  // ONE border value used everywhere — no variation possible
  const border = "1px solid #000";
  const tdBase: React.CSSProperties = {
    border, padding: "3px 5px", fontSize: "11px",
    verticalAlign: "top", lineHeight: "1.5",
  };

  return (
    <div id="invoice-print-area" style={{
      fontFamily: "Arial, sans-serif", fontSize: "11px",
      color: "#000", background: "#fff", width: "100%",
    }}>

      {/* ── TITLE ── */}
      <div style={{ textAlign: "center", fontWeight: "bold", fontSize: "14px", marginBottom: "5px" }}>
        TAX INVOICE
      </div>

      {/* ════════════════════════════════════════
          SECTION 1: Seller + Invoice Meta
          Using ONE table, cells side by side
          ════════════════════════════════════════ */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            {/* LEFT: Seller */}
            <td style={{ ...tdBase, width: "45%", padding: "5px 7px" }}>
              <div style={{ fontWeight: "bold", fontSize: "11px" }}>{COMPANY.name}</div>
              <div>{COMPANY.address}</div>
              <div>{COMPANY.city}</div>
              <div>GSTIN/UIN: {COMPANY.gstin}</div>
              <div>State Name : {COMPANY.state}, Code : {COMPANY.stateCode}</div>
              <div>Contact : {COMPANY.contact}</div>
              <div>E-Mail : {COMPANY.email}</div>
            </td>
            {/* RIGHT: Invoice meta — inner table shares same border so no doubling */}
            <td style={{ border, width: "55%", padding: 0, verticalAlign: "top" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  <tr>
                    <td style={{ ...tdBase, width: "34%", borderLeft: "none", borderTop: "none" }}>
                      <div style={{ fontSize: "8px" }}>Invoice No.</div>
                      <div style={{ fontWeight: "bold" }}>{invoice.invoiceNo}</div>
                    </td>
                    <td style={{ ...tdBase, width: "33%", borderTop: "none" }}>
                      <div style={{ fontSize: "8px" }}>e-Way Bill No</div>
                      <div style={{ fontWeight: "bold" }}>{invoice.eWayBillNo || "—"}</div>
                    </td>
                    <td style={{ ...tdBase, width: "33%", borderTop: "none", borderRight: "none" }}>
                      <div style={{ fontSize: "8px" }}>Dated</div>
                      <div style={{ fontWeight: "bold" }}>{invoice.invoiceDate ? fmtDate(invoice.invoiceDate) : "—"}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ ...tdBase, borderLeft: "none" }} colSpan={2}>
                      <div style={{ fontSize: "8px" }}>Delivery Note</div>&nbsp;
                    </td>
                    <td style={{ ...tdBase, borderRight: "none" }}>
                      <div style={{ fontSize: "8px" }}>Mode/Terms of Payment</div>&nbsp;
                    </td>
                  </tr>
                  <tr>
                    <td style={{ ...tdBase, borderLeft: "none" }} colSpan={2}>
                      <div style={{ fontSize: "8px" }}>Reference No. &amp; Date.</div>&nbsp;
                    </td>
                    <td style={{ ...tdBase, borderRight: "none" }}>
                      <div style={{ fontSize: "8px" }}>Other References</div>
                      {invoice.bookedBy
                        ? <div style={{ fontWeight: "bold" }}>Booked by {invoice.bookedBy}</div>
                        : <div>&nbsp;</div>}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ ...tdBase, borderLeft: "none" }} colSpan={2}>
                      <div style={{ fontSize: "8px" }}>Buyer's Order No.</div>&nbsp;
                    </td>
                    <td style={{ ...tdBase, borderRight: "none" }}>
                      <div style={{ fontSize: "8px" }}>Dated</div>&nbsp;
                    </td>
                  </tr>
                  <tr>
                    <td style={{ ...tdBase, borderLeft: "none" }} colSpan={2}>
                      <div style={{ fontSize: "8px" }}>Dispatch Doc No.</div>&nbsp;
                    </td>
                    <td style={{ ...tdBase, borderRight: "none" }}>
                      <div style={{ fontSize: "8px" }}>Delivery Note Date</div>&nbsp;
                    </td>
                  </tr>
                  <tr>
                    <td style={{ ...tdBase, borderLeft: "none" }} colSpan={2}>
                      <div style={{ fontSize: "8px" }}>Dispatched through</div>
                      <div>{invoice.dispatchedThrough || <>&nbsp;</>}</div>
                    </td>
                    <td style={{ ...tdBase, borderRight: "none" }}>
                      <div style={{ fontSize: "8px" }}>Destination</div>
                      <div>{invoice.destination || <>&nbsp;</>}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ ...tdBase, borderLeft: "none", borderBottom: "none" }} colSpan={3}>
                      <div style={{ fontSize: "8px" }}>Terms of Delivery</div>&nbsp;
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>

          {/* ── Buyer ── */}
          <tr>
            <td style={{ ...tdBase, padding: "5px 7px" }}>
              <div style={{ fontSize: "8px" }}>Buyer (Bill to)</div>
              <div style={{ fontWeight: "bold" }}>{invoice.customerName}</div>
              <div>Place of Supply: {invoice.placeOfSupply}</div>
              <div>GSTIN/UIN &nbsp;&nbsp;&nbsp;: {invoice.gstin}</div>
              <div>State Name &nbsp;&nbsp;: {COMPANY.state}, Code : {COMPANY.stateCode}</div>
            </td>
            <td style={{ ...tdBase, padding: "5px 7px" }}>
              <div style={{ fontSize: "8px" }}>Place of Supply</div>
              <div>{invoice.placeOfSupply}, {COMPANY.state} ({COMPANY.stateCode})</div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ════════════════════════════════════════
          SECTION 2: Line Items
          ════════════════════════════════════════ */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...tdBase, fontWeight: "bold", textAlign: "center", width: "22px" }}>Sl<br/>No.</th>
            <th style={{ ...tdBase, fontWeight: "bold", textAlign: "left" }}>Description of Goods</th>
            <th style={{ ...tdBase, fontWeight: "bold", textAlign: "center", width: "62px" }}>HSN/SAC</th>
            <th style={{ ...tdBase, fontWeight: "bold", textAlign: "right", width: "58px" }}>Quantity</th>
            <th style={{ ...tdBase, fontWeight: "bold", textAlign: "right", width: "68px" }}>Rate (Incl.<br/>of Tax)</th>
            <th style={{ ...tdBase, fontWeight: "bold", textAlign: "right", width: "63px" }}>Rate</th>
            <th style={{ ...tdBase, fontWeight: "bold", textAlign: "center", width: "30px" }}>per</th>
            <th style={{ ...tdBase, fontWeight: "bold", textAlign: "right", width: "38px" }}>Disc.%</th>
            <th style={{ ...tdBase, fontWeight: "bold", textAlign: "right", width: "72px" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lineItems.map((li, i) => (
            <tr key={i}>
              <td style={{ ...tdBase, textAlign: "center" }}>{i + 1}</td>
              <td style={{ ...tdBase, fontWeight: "bold" }}>{li.productDescription}</td>
              <td style={{ ...tdBase, textAlign: "center" }}>{HSN_CODE}</td>
              <td style={{ ...tdBase, textAlign: "right" }}>{li.quantity} {li.uom}</td>
              <td style={{ ...tdBase, textAlign: "right" }}>{fmtNum(li.rateInclTax)}</td>
              <td style={{ ...tdBase, textAlign: "right" }}>{fmtNum(li.rateExclTax)}</td>
              <td style={{ ...tdBase, textAlign: "center" }}>{li.uom}</td>
              <td style={{ ...tdBase, textAlign: "right" }}>{li.discountPct} %</td>
              <td style={{ ...tdBase, textAlign: "right" }}>{fmtNum(li.lineAmount)}</td>
            </tr>
          ))}
          {/* CGST */}
          <tr>
            <td colSpan={7} style={{ border }}></td>
            <td style={{ ...tdBase, textAlign: "right", fontStyle: "italic" }}>CGST</td>
            <td style={{ ...tdBase, textAlign: "right" }}>{fmtNum(invoice.cgst)}</td>
          </tr>
          {/* SGST */}
          <tr>
            <td colSpan={7} style={{ border }}></td>
            <td style={{ ...tdBase, textAlign: "right", fontStyle: "italic" }}>SGST</td>
            <td style={{ ...tdBase, textAlign: "right" }}>{fmtNum(invoice.sgst)}</td>
          </tr>
          {/* Freight */}
          {invoice.freight !== 0 && (
            <tr>
              <td colSpan={6} style={{ border, textAlign: "right", padding: "3px 5px", fontSize: "10px", fontStyle: "italic" }}>Less :</td>
              <td colSpan={2} style={{ border, textAlign: "right", padding: "3px 5px", fontSize: "10px", fontStyle: "italic" }}>Freight</td>
              <td style={{ ...tdBase, textAlign: "right" }}>(-){fmtNum(Math.abs(invoice.freight))}</td>
            </tr>
          )}
          {/* Round Off */}
          {invoice.roundOff !== 0 && (
            <tr>
              <td colSpan={6} style={{ border, textAlign: "right", padding: "3px 5px", fontSize: "10px", fontStyle: "italic" }}>Less :</td>
              <td colSpan={2} style={{ border, textAlign: "right", padding: "3px 5px", fontSize: "10px", fontStyle: "italic" }}>ROUND OFF</td>
              <td style={{ ...tdBase, textAlign: "right" }}>(-){Math.abs(invoice.roundOff).toFixed(2)}</td>
            </tr>
          )}
          {/* Total */}
          <tr>
            <td style={{ border }}></td>
            <td style={{ ...tdBase, fontWeight: "bold" }}>Total</td>
            <td style={{ border }}></td>
            <td style={{ ...tdBase, fontWeight: "bold", textAlign: "right" }}>{totalQty} {invoice.lineItems[0]?.uom ?? "BDL"}</td>
            <td colSpan={4} style={{ border }}></td>
            <td style={{ ...tdBase, textAlign: "right", fontWeight: "bold", fontSize: "11px" }}>&#x20B9; {fmtNum(invoice.totalAmount)}</td>
          </tr>
        </tbody>
      </table>

      {/* ════════════════════════════════════════
          SECTION 3: Amount in Words
          ════════════════════════════════════════ */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ ...tdBase, padding: "3px 7px" }}>
              <span style={{ fontWeight: "bold" }}>Amount Chargeable (in words)</span>
              <span style={{ float: "right", fontStyle: "italic" }}>E. &amp; O E</span>
              <div style={{ fontWeight: "bold", marginTop: "2px" }}>{numberToWords(invoice.totalAmount)}</div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ════════════════════════════════════════
          SECTION 4: HSN/GST Summary
          ════════════════════════════════════════ */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...tdBase, fontWeight: "bold", textAlign: "left" }}>HSN/SAC</th>
            <th style={{ ...tdBase, fontWeight: "bold", textAlign: "right" }}>Total Taxable<br/>Value</th>
            <th style={{ ...tdBase, fontWeight: "bold", textAlign: "center" }} colSpan={2}>CGST</th>
            <th style={{ ...tdBase, fontWeight: "bold", textAlign: "center" }} colSpan={2}>SGST/UTGST</th>
            <th style={{ ...tdBase, fontWeight: "bold", textAlign: "right" }}>Total Tax Amount</th>
          </tr>
          <tr>
            <th style={{ ...tdBase, fontWeight: "bold" }}></th>
            <th style={{ ...tdBase, fontWeight: "bold" }}></th>
            <th style={{ ...tdBase, fontWeight: "bold", textAlign: "center" }}>Rate</th>
            <th style={{ ...tdBase, fontWeight: "bold", textAlign: "right" }}>Amount</th>
            <th style={{ ...tdBase, fontWeight: "bold", textAlign: "center" }}>Rate</th>
            <th style={{ ...tdBase, fontWeight: "bold", textAlign: "right" }}>Amount</th>
            <th style={{ ...tdBase, fontWeight: "bold" }}></th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={tdBase}>{HSN_CODE}</td>
            <td style={{ ...tdBase, textAlign: "right" }}>{fmtNum(invoice.taxableAmount)}</td>
            <td style={{ ...tdBase, textAlign: "center" }}>{cgstRate}%</td>
            <td style={{ ...tdBase, textAlign: "right" }}>{fmtNum(invoice.cgst)}</td>
            <td style={{ ...tdBase, textAlign: "center" }}>{cgstRate}%</td>
            <td style={{ ...tdBase, textAlign: "right" }}>{fmtNum(invoice.sgst)}</td>
            <td style={{ ...tdBase, textAlign: "right" }}>{fmtNum(totalTax)}</td>
          </tr>
          <tr>
            <td style={{ ...tdBase, fontWeight: "bold", textAlign: "right" }}>Total</td>
            <td style={{ ...tdBase, fontWeight: "bold", textAlign: "right" }}>{fmtNum(invoice.taxableAmount)}</td>
            <td style={{ border }}></td>
            <td style={{ ...tdBase, fontWeight: "bold", textAlign: "right" }}>{fmtNum(invoice.cgst)}</td>
            <td style={{ border }}></td>
            <td style={{ ...tdBase, fontWeight: "bold", textAlign: "right" }}>{fmtNum(invoice.sgst)}</td>
            <td style={{ ...tdBase, fontWeight: "bold", textAlign: "right" }}>{fmtNum(totalTax)}</td>
          </tr>
        </tbody>
      </table>

      {/* Tax Amount in Words */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ ...tdBase, padding: "3px 7px" }}>
              <span style={{ fontWeight: "bold" }}>Tax Amount (in words) : </span>
              <span style={{ fontStyle: "italic" }}>{numberToWords(totalTax)}</span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ════════════════════════════════════════
          SECTION 5: Footer
          ════════════════════════════════════════ */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ ...tdBase, width: "50%", padding: "5px 7px" }}>
              {invoice.weightKg > 0 && (
                <div style={{ marginBottom: "4px" }}>
                  Remarks: <strong>TOTAL WEIGHT {invoice.weightKg.toLocaleString("en-IN")} KG</strong>
                </div>
              )}
              <div style={{ fontWeight: "bold", marginBottom: "2px" }}>Declaration</div>
              <div>We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</div>
            </td>
            <td style={{ ...tdBase, width: "50%", padding: "5px 7px" }}>
              <div style={{ fontWeight: "bold", marginBottom: "3px" }}>Company's Bank Details</div>
              <table style={{ borderCollapse: "collapse", fontSize: "11px" }}>
                <tbody>
                  <tr>
                    <td style={{ paddingRight: "4px", whiteSpace: "nowrap" }}>A/c Holder's Name</td>
                    <td style={{ paddingRight: "6px" }}>:</td>
                    <td><strong>{COMPANY.bank.accountName}</strong></td>
                  </tr>
                  <tr>
                    <td style={{ paddingRight: "4px" }}>Bank Name</td>
                    <td style={{ paddingRight: "6px" }}>:</td>
                    <td>{COMPANY.bank.bankName}</td>
                  </tr>
                  <tr>
                    <td style={{ paddingRight: "4px" }}>A/c No.</td>
                    <td style={{ paddingRight: "6px" }}>:</td>
                    <td>{COMPANY.bank.accountNo}</td>
                  </tr>
                  <tr>
                    <td style={{ paddingRight: "4px" }}>Branch &amp; IFS Code</td>
                    <td style={{ paddingRight: "6px" }}>:</td>
                    <td>{COMPANY.bank.branch} &amp; {COMPANY.bank.ifsc}</td>
                  </tr>
                </tbody>
              </table>
              <div style={{ marginTop: "10px", textAlign: "right" }}>
                for <strong>{COMPANY.name}</strong>
              </div>
              <div style={{ marginTop: "28px", textAlign: "right" }}>
                Authorised Signatory
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ textAlign: "center", fontSize: "10px", marginTop: "4px", fontWeight: "bold" }}>
        SUBJECT TO MUZAFFARPUR JURISDICTION
      </div>
      <div style={{ textAlign: "center", fontSize: "10px" }}>
        This is a Computer Generated Invoice
      </div>
    </div>
  );
};
