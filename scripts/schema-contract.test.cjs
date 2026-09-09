const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")

const migration = fs.readFileSync(
  "supabase/migrations/20260904000000_receipt_items_inventory_ledger.sql",
  "utf8",
)
const seed = fs.readFileSync("supabase/seed_workflow_test.sql", "utf8")
const productionMigration = fs.readFileSync(
  "supabase/migrations/20260916000000_production_readiness.sql",
  "utf8",
)
const costingMigration = fs.readFileSync(
  "supabase/migrations/20260917000000_inventory_lot_costing.sql",
  "utf8",
)
const allocationMigration = fs.readFileSync(
  "supabase/migrations/20260918000000_quotation_category_allocation.sql",
  "utf8",
)
const dataService = fs.readFileSync("src/lib/dataService.ts", "utf8")
const authContext = fs.readFileSync("src/contexts/AuthContext.tsx", "utf8")
const genericScreens = fs.readFileSync("src/screens/GenericList.tsx", "utf8")
const quotationScreen = fs.readFileSync("src/screens/Quotations.tsx", "utf8")
const purchaseOrderScreen = fs.readFileSync(
  "src/screens/PurchaseOrders.tsx",
  "utf8",
)
const notificationContext = fs.readFileSync(
  "src/contexts/NotificationContext.tsx",
  "utf8",
)
const themeContext = fs.readFileSync("src/contexts/ThemeContext.tsx", "utf8")
const interactiveScreens = [
  "src/screens/GenericList.tsx",
  "src/screens/Products.tsx",
  "src/screens/PurchaseOrders.tsx",
  "src/screens/Quotations.tsx",
]
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n")

test("workflow migration defines receipt details and inventory ledger", () => {
  for (const table of ["goods_receipt_items", "inventory_ledger"]) {
    assert.match(migration, new RegExp(`create table if not exists ${table}`))
    assert.match(
      migration,
      new RegExp(`alter table ${table} enable row level security`),
    )
  }
  assert.match(migration, /unique \(org_id, ref, product_id, warehouse_id\)/)
})

test("phase 3 migration defines adjustment and transfer ledger flows", () => {
  const phase3Migration = fs.existsSync(
    "supabase/migrations/20260909000000_inventory_adjustment_transfer.sql",
  )
    ? fs.readFileSync(
        "supabase/migrations/20260909000000_inventory_adjustment_transfer.sql",
        "utf8",
      )
    : ""

  for (const table of [
    "inventory_adjustments",
    "inventory_adjustment_items",
    "inventory_transfers",
    "inventory_transfer_items",
  ]) {
    assert.match(
      phase3Migration,
      new RegExp(`create table if not exists ${table}`),
    )
    assert.match(
      phase3Migration,
      new RegExp(`alter table ${table} enable row level security`),
    )
  }

  assert.match(
    phase3Migration,
    /movement_type.*ADJUSTMENT_IN|ADJUSTMENT_OUT|TRANSFER_OUT|TRANSFER_IN/,
  )
  assert.match(
    phase3Migration,
    /create or replace function create_inventory_adjustment/,
  )
  assert.match(
    phase3Migration,
    /create or replace function create_inventory_transfer/,
  )
  assert.match(phase3Migration, /Insufficient stock/)
})

test("phase 4 migration defines sales delivery and atomic SALE movement", () => {
  const phase4Migration = fs.existsSync(
    "supabase/migrations/20260910000000_sales_outbound_workflow.sql",
  )
    ? fs.readFileSync(
        "supabase/migrations/20260910000000_sales_outbound_workflow.sql",
        "utf8",
      )
    : ""

  for (const table of [
    "sales_order_items",
    "delivery_notes",
    "delivery_note_items",
  ]) {
    assert.match(
      phase4Migration,
      new RegExp(`create table if not exists ${table}`),
    )
    assert.match(
      phase4Migration,
      new RegExp(`alter table ${table} enable row level security`),
    )
  }
  assert.match(
    phase4Migration,
    /create or replace function deliver_sales_order/,
  )
  assert.match(phase4Migration, /'SALE'/)
  assert.match(phase4Migration, /Insufficient stock/)
})

test("sales completion migration defines partial delivery, invoice linkage, reversal, and returns", () => {
  const completionMigration = fs.existsSync(
    "supabase/migrations/20260911000000_sales_returns_reversals_invoice_link.sql",
  )
    ? fs.readFileSync(
        "supabase/migrations/20260911000000_sales_returns_reversals_invoice_link.sql",
        "utf8",
      )
    : ""
  for (const table of ["sales_returns", "sales_return_items"]) {
    assert.match(
      completionMigration,
      new RegExp(`create table if not exists ${table}`),
    )
  }
  assert.match(
    completionMigration,
    /delivery_notes add column if not exists invoice_id/,
  )
  assert.match(
    completionMigration,
    /create or replace function reverse_delivery_note/,
  )
  assert.match(
    completionMigration,
    /create or replace function create_sales_return/,
  )
  assert.match(completionMigration, /delivery_status := 'Partial'/)
  assert.match(completionMigration, /'RETURN_IN'/)
  assert.match(completionMigration, /'INV-' \|\| p_ref/)
})

test("phase 6 migration defines atomic finance transactions", () => {
  const financeMigration = fs.existsSync(
    "supabase/migrations/20260912000000_finance_transactions.sql",
  )
    ? fs.readFileSync(
        "supabase/migrations/20260912000000_finance_transactions.sql",
        "utf8",
      )
    : ""
  assert.match(
    financeMigration,
    /create table if not exists finance_transactions/,
  )
  assert.match(financeMigration, /CUSTOMER_RECEIPT/)
  assert.match(financeMigration, /SUPPLIER_PAYMENT/)
  assert.match(
    financeMigration,
    /create or replace function record_finance_transaction/,
  )
  assert.match(financeMigration, /insert into cash_book/)
})

test("phase 6 settlement migration links finance transactions to source balances", () => {
  const settlementMigration = fs.existsSync(
    "supabase/migrations/20260913000000_finance_settlement.sql",
  )
    ? fs.readFileSync(
        "supabase/migrations/20260913000000_finance_settlement.sql",
        "utf8",
      )
    : ""
  assert.match(
    settlementMigration,
    /alter table invoices add column if not exists paid_amount/,
  )
  assert.match(
    settlementMigration,
    /alter table purchase_orders add column if not exists paid_amount/,
  )
  assert.match(settlementMigration, /update invoices/)
  assert.match(settlementMigration, /update purchase_orders/)
  assert.match(
    settlementMigration,
    /Receipt exceeds invoice outstanding amount/,
  )
  assert.match(
    settlementMigration,
    /Payment exceeds purchase order outstanding amount/,
  )
})

test("phase 7 migration defines action permission guard and audit events", () => {
  const hardeningMigration = fs.existsSync(
    "supabase/migrations/20260914000000_permissions_audit_hardening.sql",
  )
    ? fs.readFileSync(
        "supabase/migrations/20260914000000_permissions_audit_hardening.sql",
        "utf8",
      )
    : ""
  assert.match(hardeningMigration, /create table if not exists audit_events/)
  assert.match(
    hardeningMigration,
    /create or replace function require_permission/,
  )
  assert.match(
    hardeningMigration,
    /create or replace function append_audit_event/,
  )
  assert.match(hardeningMigration, /role_permissions/)
})

test("phase 7 action guard migration applies triggers to workflow tables", () => {
  const guardMigration = fs.existsSync(
    "supabase/migrations/20260915000000_phase7_action_guards.sql",
  )
    ? fs.readFileSync(
        "supabase/migrations/20260915000000_phase7_action_guards.sql",
        "utf8",
      )
    : ""
  assert.match(
    guardMigration,
    /create or replace function enforce_workflow_permission/,
  )
  assert.match(
    guardMigration,
    /create or replace function audit_workflow_change/,
  )
  assert.match(guardMigration, /permission_guard_' \|\| table_name/)
  assert.match(guardMigration, /audit_change_' \|\| table_name/)
  assert.match(guardMigration, /inventory_ledger/)
})

test("workflow seed includes every required master-data fixture", () => {
  for (const table of [
    "organizations",
    "warehouses",
    "categories",
    "brands",
    "units",
    "customers",
    "suppliers",
    "products",
  ]) {
    assert.match(seed, new RegExp(`insert into ${table}`))
  }
  assert.match(seed, /delete from inventory_ledger/)
  assert.match(seed, /delete from goods_receipts/)
  assert.match(seed, /delete from quotations/)
})

test("production migration exposes atomic document commands and guarded reversals", () => {
  for (const fn of [
    "upsert_product_with_opening_stock",
    "backfill_legacy_product_opening_stock",
    "save_purchase_order",
    "save_sales_order",
    "receive_goods_receipt",
    "deliver_sales_order",
    "reverse_delivery_note",
    "create_purchase_return",
    "reverse_purchase_return",
    "create_sales_return",
    "reverse_sales_return",
    "record_finance_transaction",
    "save_quotation",
    "delete_draft_document",
    "create_inventory_adjustment",
    "create_inventory_transfer",
    "reverse_inventory_adjustment",
    "reverse_inventory_transfer",
    "create_organization_invitation",
  ]) {
    assert.match(
      productionMigration,
      new RegExp(`create or replace function ${fn}`),
    )
  }
  assert.match(
    productionMigration,
    /perform require_permission\('Purchase', 'approve'\)/,
  )
  assert.match(
    productionMigration,
    /perform require_permission\('Sales', 'approve'\)/,
  )
  assert.match(
    productionMigration,
    /A paid delivery invoice cannot be reversed/,
  )
  assert.match(productionMigration, /Quotation has already been converted/)
  assert.match(productionMigration, /Duplicate product lines are not allowed/)
  assert.match(productionMigration, /legacy_products_without_ledger/)
  assert.match(
    productionMigration,
    /This product already has ledger history; use an inventory adjustment instead/,
  )
})

test("production migration rebuilds generated purchase totals before changing quantity type", () => {
  assert.match(
    productionMigration,
    /alter table purchase_order_items drop column if exists total;[\s\S]{0,180}alter table purchase_order_items alter column qty type numeric\(18,2\) using qty::numeric;[\s\S]{0,180}add column if not exists total numeric\(18,0\)[\s\S]{0,80}generated always as \(qty \* unit_cost\) stored;/,
  )
})

test("lot-costing migration defines valuation layers and guarded allocation triggers", () => {
  for (const table of [
    "inventory_cost_layers",
    "inventory_cost_allocations",
  ]) {
    assert.match(costingMigration, new RegExp(`create table if not exists ${table}`))
    assert.match(
      costingMigration,
      new RegExp(`alter table ${table} enable row level security`),
    )
  }
  assert.match(costingMigration, /costing_method in \('FIFO', 'MOVING_AVERAGE'\)/)
  assert.match(costingMigration, /'LEGACY_BASELINE', stock\.qty, stock\.qty/)
  assert.match(costingMigration, /create or replace function apply_inventory_outbound_cost/)
  assert.match(costingMigration, /create or replace function apply_inventory_inbound_cost_and_sync/)
  assert.match(costingMigration, /create trigger cost_inventory_outbound_before_ledger/)
  assert.match(costingMigration, /create trigger zz_cost_inventory_after_ledger/)
  assert.match(costingMigration, /insert into inventory_cost_allocations/)
  assert.match(costingMigration, /new\.unit_cost := round\(total_cost \/ required_qty, 4\)/)
  assert.match(costingMigration, /cost_layer_quantity_mismatches/)
  assert.match(
    costingMigration,
    /revoke all on inventory_cost_layers, inventory_cost_allocations from anon, authenticated/,
  )
})

test("receiving and quotation screens capture actual cost and batch metadata", () => {
  for (const source of [purchaseOrderScreen, quotationScreen]) {
    assert.match(source, /batch_number|batchNumber/)
    assert.match(source, /manufacture_date|manufactureDate/)
    assert.match(source, /expiry_date|expiryDate/)
    assert.match(source, /unit_cost|unitCost/)
  }
  assert.match(costingMigration, /Batch number is required for product/)
  assert.match(dataService, /rpc\("get_product_pricing"/)
  assert.match(dataService, /latest_cost/)
  assert.match(quotationScreen, /averageCost/)
  assert.match(quotationScreen, /unit_cost/)
  assert.doesNotMatch(
    quotationScreen,
    /sheet\.addRow\(\[item\.productName[^\n]+item\.cost_price/,
  )
})

test("category quotations allocate SKUs, reserve stock, and issue only on delivery", () => {
  for (const table of [
    "product_suppliers",
    "quotation_allocations",
    "inventory_reservations",
  ]) {
    assert.match(allocationMigration, new RegExp(`create table if not exists ${table}`))
    assert.match(allocationMigration, new RegExp(`alter table ${table} enable row level security`))
  }
  assert.match(allocationMigration, /alter table quotation_items add column if not exists category_id/)
  assert.match(allocationMigration, /create or replace function convert_quotation_allocations/)
  assert.match(allocationMigration, /Every quotation category must be allocated exactly/)
  assert.match(allocationMigration, /create or replace function deliver_quotation/)
  assert.match(allocationMigration, /create or replace function cancel_quotation_conversion/)
  assert.match(allocationMigration, /status = 'ACTIVE'/)
  assert.match(allocationMigration, /status = 'CONSUMED'/)
  assert.match(allocationMigration, /status = 'RELEASED'/)
  assert.match(allocationMigration, /reserved_other_qty/)
  assert.match(allocationMigration, /unlinked_quotation_categories/)
  assert.match(allocationMigration, /Fixed discount cannot exceed quotation subtotal/)
  assert.match(dataService, /rpc\("convert_quotation_allocations"/)
  assert.match(dataService, /rpc\("deliver_quotation"/)
  assert.match(dataService, /rpc\("cancel_quotation_conversion"/)
  assert.match(quotationScreen, /category_id/)
  assert.match(quotationScreen, /NEW_STOCK/)
  assert.match(quotationScreen, /awaiting delivery/i)
})

test("production migration protects ledger, cash balance, and helper functions", () => {
  assert.match(
    productionMigration,
    /create or replace function get_org_id\(\)[\s\S]{0,180}set search_path = pg_catalog, public/,
  )
  assert.match(
    productionMigration,
    /revoke create on schema public from public/,
  )
  assert.match(
    productionMigration,
    /revoke execute on function get_org_id\(\) from public, anon/,
  )
  assert.match(
    productionMigration,
    /create or replace function enforce_nonnegative_inventory/,
  )
  assert.match(productionMigration, /pg_advisory_xact_lock/)
  assert.match(productionMigration, /create trigger prevent_negative_inventory/)
  assert.match(
    productionMigration,
    /create trigger sync_inventory_balance_after_ledger after insert on inventory_ledger/,
  )
  assert.match(
    productionMigration,
    /create trigger sync_product_metadata_to_inventory_balance[\s\S]{0,140}after update of sku, name, min_qty, max_qty on products/,
  )
  assert.match(
    productionMigration,
    /group by ledger\.org_id, ledger\.product_id, ledger\.warehouse_id,[\s\S]{0,90}ledger\.product_id is null then ledger\.sku/,
  )
  assert.match(productionMigration, /inventory_balance_mismatches/)
  assert.match(
    productionMigration,
    /sync_inventory_balance_from_ledger\(\)[\s\S]+from public, authenticated/,
  )
  assert.match(
    productionMigration,
    /revoke insert, update, delete on goods_receipts, goods_receipt_items, inventory_ledger,[\s\S]{0,120}inventory_balance/,
  )
  assert.match(
    productionMigration,
    /revoke insert, update on products from authenticated/,
  )
  assert.match(
    productionMigration,
    /previous_balance := coalesce\(previous_balance, 0\)/,
  )
  assert.match(
    productionMigration,
    /append_inventory_movement[\s\S]+from public, authenticated/,
  )
  assert.match(
    productionMigration,
    /append_audit_event[\s\S]+from public, authenticated/,
  )
  assert.match(
    productionMigration,
    /update purchase_orders set paid_amount = paid_amount \+ p_amount,[\s\S]{0,220}payment_status = case/,
  )
  assert.doesNotMatch(
    productionMigration,
    /actor_name := coalesce\(nullif\(trim\(p_(?:created|updated)_by\)/,
  )
  assert.doesNotMatch(productionMigration, /0, p_created_by\) returning id/)
})

test("production migration repairs organization policies in the new migration", () => {
  assert.match(
    productionMigration,
    /Repair the base migration's generic CRUD policies/,
  )
  assert.match(
    productionMigration,
    /create policy "org_insert_role_permissions" on role_permissions for insert with check/,
  )
  assert.match(
    productionMigration,
    /create policy "org_insert_quotation_items" on quotation_items for insert with check/,
  )
  assert.match(
    productionMigration,
    /create policy "org_insert_purchase_order_items" on purchase_order_items for insert with check/,
  )
  assert.match(
    productionMigration,
    /create policy "company_settings_update" on company_settings for update using \(org_id = get_org_id\(\)\)[\s\S]{0,80}with check \(org_id = get_org_id\(\)\)/,
  )
})

test("production migration reserves administrator assignment and system role identity", () => {
  assert.match(
    productionMigration,
    /Only an administrator can assign the administrator role/,
  )
  assert.match(
    productionMigration,
    /Only an administrator can invite another administrator/,
  )
  assert.match(
    productionMigration,
    /Role code already exists \(case-insensitive\)/,
  )
  assert.match(
    productionMigration,
    /System role code and type cannot be changed/,
  )
  assert.match(genericScreens, /const assignableRoles = isCurrentAdmin/)
})

test("production migration implements private, email-bound organization invitations", () => {
  assert.match(
    productionMigration,
    /create table if not exists organization_invitations/,
  )
  assert.match(
    productionMigration,
    /token uuid not null default uuid_generate_v4\(\) unique/,
  )
  assert.match(
    productionMigration,
    /expires_at timestamptz not null default \(now\(\) \+ interval '7 days'\)/,
  )
  assert.match(
    productionMigration,
    /revoke all on organization_invitations from anon, authenticated/,
  )
  assert.match(
    productionMigration,
    /invite_token_text text := nullif\(trim\(new\.raw_user_meta_data->>'invite_token'\)/,
  )
  assert.match(
    productionMigration,
    /lower\(trim\(invitation\.email\)\) <> lower\(trim\(coalesce\(new\.email, ''\)\)\)/,
  )
  assert.match(
    productionMigration,
    /invitation\.accepted_at is not null or invitation\.expires_at <= now\(\)/,
  )
  assert.match(
    productionMigration,
    /perform require_permission\('Administration', 'create'\)/,
  )
  assert.match(
    productionMigration,
    /revoke execute on function create_organization_invitation\(text, text\) from public/,
  )
})

test("frontend uses guarded RPCs and does not duplicate signup organization creation", () => {
  for (const rpc of [
    "save_purchase_order",
    "save_sales_order",
    "receive_goods_receipt",
    "deliver_sales_order",
    "record_finance_transaction",
    "save_quotation",
    "create_organization_invitation",
  ]) {
    assert.match(dataService, new RegExp(`rpc\\(\"${rpc}\"`))
  }
  assert.doesNotMatch(authContext, /from\(\"organizations\"\)\.insert/)
  assert.match(authContext, /org_name: orgName/)
  assert.match(authContext, /invite_token: inviteToken/)
  assert.match(genericScreens, /fetchSalesReturns/)
  assert.match(genericScreens, /reverseSalesReturn/)
  assert.match(genericScreens, /createOrganizationInvitation/)
  assert.doesNotMatch(genericScreens, /onCreate=\{\(\) => \{\}\}/)
})

test("interactive workflows use application toast and confirmation UI", () => {
  assert.doesNotMatch(
    interactiveScreens,
    /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/,
  )
  assert.match(interactiveScreens, /showAppToast/)
  assert.match(interactiveScreens, /confirmAppAction/)
})

test("theme and live notifications follow the application specification", () => {
  assert.match(themeContext, /"light" \| "dark" \| "system"/)
  assert.match(themeContext, /warehouseos-theme/)
  assert.match(themeContext, /prefers-color-scheme: dark/)
  assert.match(notificationContext, /\.channel\(`organization-notifications:/)
  assert.match(notificationContext, /"postgres_changes"/)
  assert.match(
    productionMigration,
    /alter publication supabase_realtime add table/,
  )
})
