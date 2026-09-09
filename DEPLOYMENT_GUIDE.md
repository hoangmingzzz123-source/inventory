# WarehouseOS Deployment Guide

This guide assumes the existing Supabase project has already applied migrations through
`20260915000000_phase7_action_guards.sql`.

## 1. Back up and apply the new migration

1. Create a database backup or restore point in Supabase.
2. Apply only `supabase/migrations/20260916000000_production_readiness.sql` to staging first.
3. Do not edit or re-run the older migration files for this release.
4. Confirm the migration completed without an error before deploying the frontend.
5. Regenerate `src/lib/database.types.ts` from the staging schema with the team's normal
   Supabase type-generation workflow; this removes the remaining temporary `any` casts after the
   deployed schema becomes available.

The new migration adds the missing columns, atomic workflow RPCs, corrected RLS policies,
organization invitations, audit and permission guards, ledger reconciliation, balance cache
synchronization, indexes, and realtime publication entries.

## 2. Configure the frontend

Set these values in the deployment environment:

```dotenv
VITE_SUPABASE_PROJECT_ID=your-project-id
VITE_SUPABASE_ANON_KEY=your-anon-key
```

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

The live test verifies authenticated organization context, atomic quotation receipt, actor
anti-spoofing, duplicate-conversion rejection, direct-ledger-write rejection, balance cache
synchronization, and the reconciliation summary.

Never run the seed file against production and never commit access tokens.

## 5. Reconcile existing data

Call `reconciliation_summary` as an authenticated administrator for each organization. All five
values should be zero:

- `negative_stock_rows`
- `legacy_products_without_ledger`
- `invoice_payment_mismatches`
- `purchase_payment_mismatches`
- `inventory_balance_mismatches`

For a legacy product reported without ledger history, first identify its real opening warehouse,
then call `backfill_legacy_product_opening_stock(product_id, warehouse_id)` once as an authorized
administrator. Do not guess the warehouse and do not backfill a product that already has ledger
history.

## 6. Manual release matrix

Before production, test these flows with real staging accounts:

- Admin, manager, and staff permissions for view/create/update/delete/approve/export.
- A second organization that cannot read or change the first organization's data.
- New organization signup and a seven-day, email-bound, single-use invitation.
- Product opening stock with an explicit warehouse.
- Draft/approval, partial PO receipt, and over-receipt rejection.
- Adjustment, warehouse transfer, delivery, purchase return, sales return, and every reversal.
- Customer receipt, supplier payment, invoice/PO outstanding amount, and cash-book balance.
- Concurrent stock-out attempts for the same product and warehouse.
- Dashboard, report filters, Excel/CSV export, dark mode, and realtime notification refresh.

The Users screen currently creates and copies a secure invitation link; an administrator must
send that link through the company's approved communication channel. Automated invitation email
delivery requires a separately configured server-side email/Edge Function integration.

## 7. Production cutover

1. Apply the same new migration to production during a maintenance window.
2. Run reconciliation for every organization.
3. Deploy the frontend only after database and permission checks pass.
4. Monitor Supabase database logs, authentication failures, RPC errors, and reconciliation counts
   during the first release window.
