# WarehouseOS Deployment Guide

This guide assumes the existing Supabase project has already applied migrations through
`20260915000000_phase7_action_guards.sql`.

## 1. Back up and apply the new migration

1. Create a database backup or restore point in Supabase.
2. Apply `supabase/migrations/20260916000000_production_readiness.sql`,
   `supabase/migrations/20260917000000_inventory_lot_costing.sql`, then
   `supabase/migrations/20260918000000_quotation_category_allocation.sql`, and finally
   `supabase/migrations/20260919000000_demo_scenarios_lookups.sql` to staging first.
3. Do not edit or re-run the older migration files for this release.
4. Confirm the migration completed without an error before deploying the frontend.
5. Regenerate `src/lib/database.types.ts` from the staging schema with the team's normal
   Supabase type-generation workflow; this removes the remaining temporary `any` casts after the
   deployed schema becomes available.

The production-readiness migration adds the missing columns, atomic workflow RPCs, corrected RLS policies,
organization invitations, audit and permission guards, ledger reconciliation, balance cache
synchronization, indexes, and realtime publication entries.

The lot-costing migration adds receipt batch metadata, FIFO/moving-average cost layers,
server-computed COGS allocations, supplier-specific pricing history, and layer reconciliation. It
creates one `LEGACY_BASELINE` cost layer for each positive existing product/warehouse balance because
historical data cannot safely reconstruct exact old FIFO consumption.

The category-allocation migration changes new quotations from product lines to category promises.
Accepted quotations allocate existing or newly received SKUs, create active inventory reservations,
and move to `Awaiting Delivery`. Only delivery creates the outbound ledger movement and invoice;
cancellation releases reservations without removing stock that was physically received.

The Demo/lookup migration adds authenticated, tenant-scoped dropdown read models, filters Demo data
out of normal selection flows, and introduces tracked `demo_runs`. Demo scenarios reuse the real
quotation status/allocation/delivery RPCs, stamp every generated row with `source=dataDemo` and a
`demo_run_id`, and provide administrator-only transactional cleanup for the current user's runs or
one explicitly selected run in the same organization.

## 2. Configure the frontend

Set these values in the deployment environment:

```dotenv
VITE_SUPABASE_PROJECT_ID=your-project-id
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_DEMO_FEATURE_ENABLED=true
```

Set `VITE_DEMO_FEATURE_ENABLED=false` to remove the Business Demo module from the deployed frontend.
When enabled, each authenticated user can also hide or restore the tab from Settings. Scenario RPCs
remain authenticated and permission-checked regardless of menu visibility.

Use the public anon key only. Never expose the service-role key in the frontend or commit it
to the repository.

In Supabase Authentication URL Configuration, set the deployed application as the Site URL
and add its login/invitation URL to Redirect URLs. Test both a normal signup and an invited
signup with email confirmation enabled.

## 3. Run local checks

Use the repository's pinned pnpm toolchain:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm run build
```

The static test suite validates the migration contract and the frontend's guarded RPC usage.
The live test is skipped until staging credentials are supplied.

## 4. Run the authenticated staging workflow test

1. Run `supabase/seed_workflow_test.sql` in staging only.
2. Create a dedicated test user and update its profile as described at the top of the seed file.
3. Obtain that user's access token and run:

```bash
VITE_SUPABASE_PROJECT_ID=your-staging-project-id \
VITE_SUPABASE_ANON_KEY=your-staging-anon-key \
SUPABASE_TEST_ACCESS_TOKEN=your-admin-access-token \
pnpm run test:live
```

The live test verifies authenticated organization context, category allocation, receipt costing,
reservation lifecycle, delivery-only stock issue, actor anti-spoofing, legacy conversion rejection,
direct-ledger-write rejection, balance cache synchronization, and reconciliation.

Never run the seed file against production and never commit access tokens.

## 5. Reconcile existing data

Call `reconciliation_summary` as an authenticated administrator for each organization. All ten
values should be zero:

- `negative_stock_rows`
- `legacy_products_without_ledger`
- `invoice_payment_mismatches`
- `purchase_payment_mismatches`
- `inventory_balance_mismatches`
- `cost_layer_quantity_mismatches`
- `unlinked_product_categories`
- `unlinked_quotation_categories`
- `allocation_quantity_mismatches`
- `over_reserved_stock_rows`

For a legacy product reported without ledger history, first identify its real opening warehouse,
then call `backfill_legacy_product_opening_stock(product_id, warehouse_id)` once as an authorized
administrator. Do not guess the warehouse and do not backfill a product that already has ledger
history.

Review the generated `LEGACY_BASELINE` layer values before production cutover. The baseline cost uses
the available historical ledger value and falls back to the product reference cost when that value is
not usable. New receipts preserve their own actual unit cost and batch metadata exactly.

If either category-link count is nonzero, review the legacy product/quotation labels and map them to
the correct organization category before allowing conversion. Do not guess ambiguous categories;
quotation category snapshots are part of the commercial history.

## 6. Manual release matrix

Before production, test these flows with real staging accounts:

- Admin, manager, and staff permissions for view/create/update/delete/approve/export.
- A second organization that cannot read or change the first organization's data.
- New organization signup and a seven-day, email-bound, single-use invitation.
- Product opening stock with an explicit warehouse.
- Draft/approval, partial PO receipt, and over-receipt rejection.
- Receipt unit cost changes, batch-number enforcement, manufacture/expiry dates, FIFO allocation, and
  moving-average allocation after changing the Company Settings option.
- Category quotation with mixed existing/new stock, exact allocation validation, reservation release,
  and delivery-only inventory issue.
- Adjustment, warehouse transfer, delivery, purchase return, sales return, and every reversal.
- Customer receipt, supplier payment, invoice/PO outstanding amount, and cash-book balance.
- Concurrent stock-out attempts for the same product and warehouse.
- Dashboard, report filters, Excel/CSV export, dark mode, and realtime notification refresh.
- Lookup search, category/product dependency, warehouse-specific available stock, and empty/error
  dropdown states.
- Every Demo scenario, idempotent retry, per-run cleanup, Demo badges, and verification that normal
  dropdowns do not expose `source=dataDemo` records.

The Users screen currently creates and copies a secure invitation link; an administrator must
send that link through the company's approved communication channel. Automated invitation email
delivery requires a separately configured server-side email/Edge Function integration.

## 7. Production cutover

1. Apply all four new migrations to production in timestamp order during a maintenance window.
2. Run reconciliation for every organization.
3. Deploy the frontend only after database and permission checks pass.
4. Monitor Supabase database logs, authentication failures, RPC errors, and reconciliation counts
   during the first release window.
