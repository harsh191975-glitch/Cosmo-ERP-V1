# 🚀 COSMO ERP

> A modern financial & inventory ERP powered by a real double-entry accounting engine.

COSMO is a full-stack ERP dashboard designed to manage business finances with accuracy, clarity, and real-time insights. It combines accounting, inventory, and operational tracking into a single, fast, and reliable interface.

---

## 📊 What COSMO Does

COSMO helps businesses manage:

* **Revenue (AR)** — invoices, payments, receivables
* **Purchases (AP)** — supplier tracking, cost of goods
* **Expenses (OPEX)** — categorized operational spending
* **Inventory** — stock tracking and movement
* **Financial Reports**:

  * Profit & Loss (P&L)
  * Cash Flow
  * Trial Balance

---

## 🧠 What Makes It Different

Unlike typical CRUD-based dashboards, COSMO is built around a **true accounting engine**:

* ⚖️ **Double-entry ledger system** (every transaction is balanced)
* 💰 **Integer-based calculations** (no floating-point precision errors)
* 📉 **Accrual-based financial logic**
* 🧪 **Data Quality Score (DQS)** to detect anomalies
* 🧱 **Strict architecture** (no direct DB calls in UI)

This makes COSMO closer to a real financial system than a basic dashboard.

---

## 🖥️ Tech Stack

* **Frontend:** React 18 + TypeScript + Vite
* **Styling:** Tailwind CSS + lucide-react
* **Routing:** React Router v6
* **Backend:** Supabase (PostgreSQL)
* **Testing:** Vitest + React Testing Library

---

## ⚡ Getting Started

```bash
git clone https://github.com/your-username/cosmo-erp
cd cosmo-erp
npm install
npm run dev
```

Create a `.env` file:

```env
VITE_SUPABASE_URL=your_url
VITE_SUPABASE_ANON_KEY=your_key
```

---

## 🏗️ Architecture Overview

COSMO follows a strict **Async Service Layer pattern**:

* UI components never call Supabase directly
* All data access flows through domain stores:

  * `invoiceStore.ts`
  * `purchaseStore.ts`
  * `expenseStore.ts`
  * `inventoryStore.ts`
* A centralized **Financial Engine** processes all data into reports

👉 Full details: see `ARCHITECTURE.md`

---

## 🧮 Financial Engine

Located in:

```
src/engine/financialEngine.ts
```

Core responsibilities:

* Builds a **double-entry ledger**
* Computes:

  * Net Profit
  * Cash Flow
  * Balance metrics
* Ensures:

  * Trial Balance always matches
* Uses **integer math (paise)** for accuracy

---

## 🧪 Testing

* **Unit tests:** Financial engine & store logic (fully mocked)
* **Integration tests:** Routing and layout validation

Run tests:

```bash
npm run test
```

---

## ⚠️ Project Status

> Currently in **private beta**

* Actively used in a real business environment
* Undergoing UI/UX refinement and real-world testing
* Focused on correctness, stability, and usability

---

## 📸 Screenshots

*(Add dashboard, expenses tab, and reports UI here — highly recommended)*

---

## 🔒 Important Design Principles

* No direct database calls inside UI components
* Financial engine is immutable and deterministic
* All financial calculations use integer precision
* System prioritizes **data correctness over visuals**

---

## 🚧 Roadmap (Short-Term)

* Improved UI/UX across modules
* Enhanced analytics & insights
* Error handling & edge-case coverage
* Performance optimizations

---

## 🤝 Contributing

Currently not open for external contributions.
If you're interested in the project, feel free to reach out.

---

## 📌 Final Note

COSMO is built with a focus on **financial correctness, system design, and real-world usability**.

It is not just a dashboard — it is a **foundational accounting system in progress**.
