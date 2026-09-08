# InventoryOS Implementation Plan

## Implementation Status

- [x] Phase 0/1 slice: product opening stock is ledger-backed and requires an explicit warehouse for create/import.
- [x] Product quantity remains readonly and is derived from ledger movements in live mode.
- [x] `npx tsc --noEmit` passes after the opening warehouse changes.
- [x] Phase 2: purchase order and goods receipt workflow. PO receiving resolves real product IDs by `product_id` or SKU, calculates `received_qty`/`remaining_qty`, creates unique receipt references for each batch, supports partial quantities in the UI, and uses an atomic Supabase RPC for live writes. The RPC migration must be applied to the target Supabase project before live use.
- [x] Phase 3: inventory adjustment and warehouse transfer. Atomic writes, ledger-derived adjustment delta, source-stock validation, creation UI, and reversal workflow are implemented.
- [~] Phase 4: sales and outbound stock. Sales order creation, partial delivery, invoice linkage, creation UI, returns, and reversal workflow are implemented; approval permissions and invoice settlement remain in Phase 6/7.
- [x] Phase 5: live reports and dashboard reconciliation. Inventory, sales, gross profit, purchasing, cash-flow report sources, period/warehouse/product/status filters, live receivable/payable aging, loading/error states, filtered summary export, shared report calculation helpers, and extracted report catalog are live. The remaining detailed static-definition extraction is internal cleanup only.
- [~] Phase 6: finance basics. Atomic customer receipts, supplier payments, cash-book posting, and invoice/PO settlement are implemented; finance permissions and final reconciliation tests remain.
- [~] Phase 7: permissions, audit, and quality hardening. Finance, inventory, sales, and ledger workflow triggers now enforce database permissions and emit persisted audit events; broader role/live workflow tests remain.

## 1. Context

InventoryOS is a React + Vite + Supabase inventory management application. The application supports demo mode and authenticated live mode. In live mode, data is isolated by `org_id` and protected by Supabase Row Level Security.

Current implementation status:

- Authentication, organization profile loading, role access, and demo mode are available.
- Product, customer, supplier, warehouse, category, brand, unit, quotation, purchase order, and goods receipt data services exist in different levels of completeness.
- `inventory_ledger`, `goods_receipts`, `goods_receipt_items`, and `inventory_balance` are available as the inventory foundation.
- Product quantity is being moved to a ledger-derived value instead of a user-editable field.
- Creating or importing a product with a positive initial quantity creates an opening goods receipt and an `OPENING_BALANCE` ledger movement.
- Quotation-to-goods-receipt conversion creates receipt details, updates inventory, and writes ledger movements.
- Stock ledger and inventory reports have started using live data.
- Several sales, finance, adjustment, transfer, and reporting screens are still placeholders, mock-driven, or only partially connected to Supabase.
- The application requires Node.js 22 and pnpm 10.34.3 for the current Vite toolchain.

Important existing files:

- `src/lib/dataService.ts`: live/demo data access and inventory movement logic.
- `src/screens/Products.tsx`: product CRUD and product import flow.
- `src/screens/Quotations.tsx`: quotation creation and quotation-to-receipt conversion.
- `src/screens/GenericList.tsx`: shared CRUD screens, stock ledger, reports, and Excel export.
- `src/screens/Dashboard.tsx`: dashboard KPIs, charts, and recent activities.
- `supabase/migrations/20260804000000_initial_schema.sql`: base schema.
- `supabase/migrations/20260904000000_receipt_items_inventory_ledger.sql`: receipt detail and ledger schema.
- `supabase/migrations/20260907000000_fix_inventory_ledger_history.sql`: ledger history constraint correction.

## 2. Mission

Deliver a reliable multi-organization inventory application in which every stock quantity is explainable through an auditable inventory ledger, every operational workflow uses real authenticated data, and every report is derived from persisted business records rather than hard-coded demo values.

The system must make it possible to answer these questions at any time:

1. What is the current quantity of a product in each warehouse?
2. Which documents caused that quantity to change?
3. Who created or approved the movement?
4. What was the quantity and value at a selected point in time?
5. Can the reported totals be reconciled back to source documents and ledger movements?

## 3. Product Principles

### 3.1 Ledger is the source of truth

`products.qty` must not be used as the authoritative inventory quantity. Product quantity is derived from ledger movements:

```text
Current quantity = SUM(qty_in) - SUM(qty_out)
```

The calculation must be scoped by organization, product, and warehouse where warehouse-level stock is required.

### 3.2 Documents create movements

Users must not edit ledger rows directly. Business documents create movements:

- Product opening quantity -> `OPENING_BALANCE`
- Goods receipt -> `RECEIPT`
- Sales delivery -> `SALE`
- Positive adjustment -> `ADJUSTMENT_IN`
- Negative adjustment -> `ADJUSTMENT_OUT`
- Warehouse transfer -> `TRANSFER_OUT` and `TRANSFER_IN`
- Purchase return -> `RETURN_OUT`
- Sales return -> `RETURN_IN`

### 3.3 Reversal instead of destructive deletion

Completed documents and their ledger impact must not be silently deleted. Cancellation or correction must create an explicit reversal movement and an audit record.

### 3.4 Live data after authentication

After login, screens must use the authenticated user's `org_id`. Mock data is allowed only in demo mode. Loading, empty, and error states must be visible and distinguishable.

### 3.5 Consistent time format

User-facing timestamps must use:

```text
HH:mm:ss dd/MM/YYYY UTC+7
```

The shared formatter is `src/lib/dateUtils.ts`.

## 4. Goals

### Goal A: Establish a correct inventory foundation

- Make receipt, ledger, and balance records consistent.
- Make all inventory quantities ledger-derived.
- Prevent duplicate or partial movement writes.
- Preserve a complete audit trail.

### Goal B: Complete the purchase and receiving workflow

- Support purchase orders with real line items.
- Support full and partial goods receipts.
- Validate warehouse, supplier, quantities, and duplicate receipts.
- Show the latest real import history in quotations and product details.

### Goal C: Complete outbound inventory workflows

- Implement sales order items and delivery notes.
- Validate available stock before delivery.
- Write outbound ledger movements.
- Support returns and reversals.

### Goal D: Replace mock reports with real reports

- Inventory reports must use balance and ledger data.
- Purchase reports must use purchase orders and receipts.
- Sales reports must use sales orders, deliveries, and invoices.
- Finance reports must use receivables, payables, payments, and cash book records.
- Excel exports must include data and chart information.

### Goal E: Make the system secure and testable

- Enforce organization isolation.
- Enforce action-level permissions.
- Add audit logs for important actions.
- Add workflow tests and schema contract tests.

## 5. Scope and Non-goals

### In scope

- Inventory, purchasing, receiving, sales delivery, returns, reporting, finance basics, permissions, auditability, and Excel export.
- Live Supabase data for authenticated users.
- Demo mode for preview and UX testing.
- Migration, backfill, and reconciliation tooling.

### Out of scope for the first production milestone

- Automated accounting journal posting.
- Complex multi-currency accounting.
- Advanced warehouse bin optimization.
- Offline-first synchronization.
- External ERP integrations.
- Full barcode hardware integration.

## 6. Delivery Phases

## Phase 0: Database and data integrity

### Tasks

1. Run all migrations in order on the target Supabase project.
2. Verify `goods_receipt_items` and `inventory_ledger` policies are idempotent.
3. Add or verify indexes for organization, product, warehouse, and timestamp queries.
4. Backfill existing receipt details where source data is available.
5. Create `OPENING_BALANCE` movements for legacy product quantities.
6. Reconcile product quantities, inventory balances, and ledger totals.
7. Require a real warehouse for opening stock instead of relying on `Default Warehouse`.
8. Move multi-step receipt writes to a database function or transaction boundary.

### Acceptance criteria

- Re-running migrations does not fail because of duplicate policies or constraints.
- Every live product with a positive quantity can be traced to ledger movements.
- A failed receipt operation does not leave partial receipt, item, or ledger data.
- Users from organization A cannot read organization B data.

## Phase 1: Product master data

### Tasks

1. Keep product quantity readonly in create, view, and update screens.
2. Create product with quantity zero by default.
3. Create an opening receipt when initial quantity is positive.
4. Import products using the same opening receipt behavior.
5. Ensure importing an existing SKU does not create a duplicate opening receipt.
6. Add warehouse selection for initial stock.
7. Refresh product quantities from ledger after create/import.
8. Display update timestamps using UTC+7 formatting.

### Acceptance criteria

- Creating a product with quantity 0 creates no ledger movement.
- Creating a product with quantity 10 creates exactly one receipt item and one `OPENING_BALANCE` movement.
- Updating name, price, category, or status does not change inventory quantity.
- Importing an existing SKU does not add stock accidentally.

## Phase 2: Purchase order and goods receipt

### Tasks

1. Implement purchase order line item persistence.
2. Validate supplier and receiving warehouse.
3. Support full and partial receiving.
4. Track ordered quantity, received quantity, and remaining quantity.
5. Prevent receiving more than the remaining quantity.
6. Prevent duplicate completion of the same receipt reference.
7. Create receipt header, receipt items, inventory balance, and ledger movement consistently.
8. Store the current user in `created_by`.
9. Display receipt history on quotation and product detail screens.
10. Add receipt filters by supplier, warehouse, date, and status.

### Acceptance criteria

- A PO can be received in multiple valid batches.
- A completed PO cannot be received beyond its remaining quantity.
- The same quotation or receipt cannot be converted twice.
- The resulting stock is visible in stock balance and stock ledger.

## Phase 3: Inventory adjustment and transfer

### Tasks

1. [x] Create adjustment forms with reason, warehouse, product, and actual quantity.
2. [x] Calculate adjustment delta against the ledger-derived quantity.
3. [x] Create `ADJUSTMENT_IN` or `ADJUSTMENT_OUT` movement.
4. [x] Create transfer forms with source and destination warehouses.
5. [x] Validate source stock before transfer.
6. [x] Create paired `TRANSFER_OUT` and `TRANSFER_IN` records.
7. [x] Link both records to one transfer reference.
8. [x] Add reversal support for completed adjustments and transfers.

### Acceptance criteria

- Adjustments record only the difference, not the full stock value.
- Transfers change stock in both warehouses by equal and opposite quantities.
- A transfer cannot use the same source and destination warehouse.
- A completed movement is not deleted without a reversal.

## Phase 4: Sales and outbound stock

### Tasks

1. [x] Add sales order item storage and retrieval.
2. [ ] Add approval status transitions and permission enforcement.
3. [x] Create delivery note workflow.
4. [x] Validate available ledger quantity before delivery.
5. [x] Write `SALE` ledger movements at delivery confirmation.
6. [x] Support partial delivery and remaining quantity validation.
7. [x] Create and link invoice records from delivered quantities.
8. [x] Implement sales return and reversal behavior.

### Acceptance criteria

- Draft orders do not affect inventory.
- Approved but undelivered orders do not reduce physical stock.
- Delivery reduces stock exactly once.
- Partial delivery leaves the correct remaining quantity.
- Returns restore stock through a new ledger movement.

### Current implementation

- `src/screens/GenericList.tsx` provides creation forms for adjustments, transfers, sales orders, deliveries, and sales returns.
- Completed adjustment, transfer, and delivery documents expose reversal actions that append compensating ledger movements.
- Delivery RPCs reject insufficient stock, duplicate references, and over-delivery; partial deliveries remain linked to the sales order.
- Each delivery creates a linked draft invoice through `delivery_id`, `delivery_ref`, and `invoice_ref`.
- Apply migrations `20260909000000_inventory_adjustment_transfer.sql`, `20260910000000_sales_outbound_workflow.sql`, and `20260911000000_sales_returns_reversals_invoice_link.sql` before live use.

## Phase 5: Reports and dashboard

### Tasks

1. [x] Create dedicated report services instead of expanding hard-coded `buildReportData()`. Shared filtering, ledger balance, aging, and cash helpers live in `src/lib/reportService.ts`, and the Reports Center catalog lives in `src/lib/reportCatalog.ts`; the remaining static definition map does not control live report calculations.
2. [x] Implement inventory balance report from ledger-derived data.
3. [x] Implement stock movement report from ledger.
4. [x] Implement purchase summary from purchase orders and receipts.
5. [x] Implement sales summary from deliveries and invoices.
6. [x] Implement gross profit using sales price and cost basis.
7. [x] Implement receivable and payable aging.
8. [x] Add report date range, warehouse, product, and status filters.
9. [x] Add loading, empty, and error states.
10. [x] Export report tables, chart datasets, and the filtered Reports Center summary to Excel.

### Acceptance criteria

- Report totals reconcile with source records.
- Changing the date range changes KPI, chart, and table data consistently.
- Exported Excel contains the selected report data and chart sheet.
- No authenticated report uses mock values as a fallback unless explicitly in demo mode.

### Current implementation

- `Reports` loads live inventory balance, ledger, sales orders, purchase orders, deliveries, invoices, and cash-book records using the authenticated `org_id`.
- Stock balance rows are rebuilt from ledger movements before report rendering, preventing stale `inventory_balance` snapshots from becoming the report source of truth.
- Revenue, gross profit, purchase summary, cash flow, and report-center summary KPIs use live persisted records; demo mode retains demo fixtures.
- Receivable and payable aging reports group open invoices and purchase orders into `0-30`, `31-60`, `61-90`, and `90+` day buckets.
- Report filters include date range presets, custom dates, warehouse, product, and status; filtered datasets feed report tables, charts, KPIs, and exports.
- Shared report calculations are centralized in `src/lib/reportService.ts` and reused by the report center.
- The Reports Center exports the currently filtered summary and displays an explicit empty state when a report has no matching rows.
- The Reports Center category/report navigation is defined in `src/lib/reportCatalog.ts` rather than inline in the screen.

## Phase 6: Finance basics

### Tasks

1. [x] Implement receivable records from invoices and customer receipts. Customer receipts validate and settle invoice balances atomically.
2. [x] Implement payable records from purchase documents and supplier payments. Supplier payments validate and settle purchase-order balances atomically.
3. [x] Implement cash book receipts and payments.
4. [x] Calculate outstanding balances from transactions.
5. [x] Add aging buckets.
6. [x] Link finance transactions back to source documents.

### Current implementation

- `finance_transactions` stores organization-scoped customer receipts and supplier payments.
- `record_finance_transaction` atomically writes the finance transaction and its corresponding cash-book entry.
- Customer receipt, supplier payment, and cash-book screens use live persisted data; demo mode remains available.
- Migration `20260912000000_finance_transactions.sql` must be applied before live finance use.
- Migration `20260913000000_finance_settlement.sql` adds paid/outstanding balances and source-document settlement validation.

### Acceptance criteria

- A customer receipt reduces the correct invoice balance.
- A supplier payment reduces the correct payable balance.
- Cash book balance reconciles with receipt and payment transactions.
- Finance reports do not depend on manually entered summary totals.

## Phase 7: Permissions, audit, and quality

### Tasks

1. [~] Enforce view/create/update/delete/approve/export actions. Database action guards now cover finance, inventory, sales, and ledger workflows; remaining UI action controls and export enforcement remain.
2. [~] Hide or disable controls the current role cannot execute. View routing and Finance.create UI gating are implemented; remaining document action controls remain.
3. [x] Enforce the same permission at the data/API boundary for finance, inventory, sales, and ledger workflow writes.
4. [x] Record audit events for finance, inventory, sales, and ledger workflow changes and expose them in authenticated audit logs.
5. [~] Add tests for organization isolation and role permissions. Schema contract coverage exists; live RLS/role tests remain.
6. [~] Add tests for duplicate, partial, reversal, and concurrent workflows. Contract coverage exists; live workflow coverage remains.
7. [x] Add user-facing error messages with actionable recovery guidance for finance RPC failures.

### Current implementation

- `audit_events` stores actor, entity, action, source reference, before/after JSON, and timestamp under organization RLS.
- `require_permission` reads the authenticated profile role and `role_permissions` before protected writes.
- Finance settlement calls `require_permission('Finance', 'create')` and `append_audit_event` inside the transaction.
- Migration `20260914000000_permissions_audit_hardening.sql` must be applied after the finance migrations.
- Migration `20260915000000_phase7_action_guards.sql` applies idempotent permission and audit triggers to existing workflow tables.

### Acceptance criteria

- A user cannot execute a forbidden action by bypassing the UI.
- Every stock-changing action has an audit trail.
- Tests cover the happy path and the main failure paths.

## 7. Recommended Immediate Work

The next implementation slice should be Phase 0 and the first half of Phase 2:

1. Require a warehouse when creating/importing opening stock.
2. Add a database transaction/function for goods receipt creation.
3. Add PO item persistence and received quantity tracking.
4. Implement partial receiving validation.
5. Add a live goods receipt detail screen.
6. Add reconciliation checks for ledger and inventory balance.

This order is important because reports, product quantities, dashboard KPIs, and later sales workflows all depend on trustworthy receiving and ledger data.

## 8. Technical Risks

### Risk: Multi-step writes from the browser

A receipt currently involves multiple client-side writes. A failure in the middle can leave inconsistent data.

Mitigation: move receipt creation into a Supabase RPC/database function with transaction semantics.

### Risk: Opening stock has no selected warehouse

Using a hard-coded default warehouse makes warehouse-level reporting unreliable.

Mitigation: require warehouse selection for positive initial quantity and import rows, or explicitly store a controlled opening warehouse configured for the organization.

### Risk: Legacy data has no ledger history

Existing product quantities and old receipts may not reconcile.

Mitigation: provide a one-time backfill migration and a reconciliation report before enabling strict ledger-only display.

### Risk: Mock fallback hides live data failures

A missing table or schema error can look like an empty report instead of a configuration problem.

Mitigation: distinguish schema errors, network errors, empty data, and demo mode in the UI.

### Risk: Reports drift from operational logic

Hard-coded report calculations can diverge from ledger and document behavior.

Mitigation: build report queries from persisted source tables and add reconciliation tests.

## 9. Definition of Done

The app is ready for the first production milestone when:

- All stock-in, stock-out, adjustment, transfer, and return movements are ledger-backed.
- Product quantities are never user-edited directly.
- Purchase and sales workflows use real authenticated organization data.
- Current stock and historical reports reconcile to ledger movements.
- RLS and role permissions are tested.
- Duplicate and partial workflows are handled safely.
- Migrations can be applied repeatedly without policy or constraint errors.
- `npx tsc --noEmit`, repository tests, and live workflow tests pass.
- `pnpm run build` succeeds on Node.js 22.
