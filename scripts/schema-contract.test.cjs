const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")

const migration = fs.readFileSync("supabase/migrations/20260904000000_receipt_items_inventory_ledger.sql", "utf8")
const seed = fs.readFileSync("supabase/seed_workflow_test.sql", "utf8")

test("workflow migration defines receipt details and inventory ledger", () => {
  for (const table of ["goods_receipt_items", "inventory_ledger"]) {
    assert.match(migration, new RegExp(`create table if not exists ${table}`))
    assert.match(migration, new RegExp(`alter table ${table} enable row level security`))
  }
  assert.match(migration, /unique \(org_id, ref, product_id, warehouse_id\)/)
})

test("phase 3 migration defines adjustment and transfer ledger flows", () => {
  const phase3Migration = fs.existsSync("supabase/migrations/20260909000000_inventory_adjustment_transfer.sql")
    ? fs.readFileSync("supabase/migrations/20260909000000_inventory_adjustment_transfer.sql", "utf8")
    : ""

  for (const table of ["inventory_adjustments", "inventory_adjustment_items", "inventory_transfers", "inventory_transfer_items"]) {
    assert.match(phase3Migration, new RegExp(`create table if not exists ${table}`))
    assert.match(phase3Migration, new RegExp(`alter table ${table} enable row level security`))
  }

  assert.match(phase3Migration, /movement_type.*ADJUSTMENT_IN|ADJUSTMENT_OUT|TRANSFER_OUT|TRANSFER_IN/)
  assert.match(phase3Migration, /create or replace function create_inventory_adjustment/)
  assert.match(phase3Migration, /create or replace function create_inventory_transfer/)
  assert.match(phase3Migration, /Insufficient stock/)
})

test("phase 4 migration defines sales delivery and atomic SALE movement", () => {
  const phase4Migration = fs.existsSync("supabase/migrations/20260910000000_sales_outbound_workflow.sql")
    ? fs.readFileSync("supabase/migrations/20260910000000_sales_outbound_workflow.sql", "utf8")
    : ""

  for (const table of ["sales_order_items", "delivery_notes", "delivery_note_items"]) {
    assert.match(phase4Migration, new RegExp(`create table if not exists ${table}`))
    assert.match(phase4Migration, new RegExp(`alter table ${table} enable row level security`))
  }
  assert.match(phase4Migration, /create or replace function deliver_sales_order/)
  assert.match(phase4Migration, /'SALE'/)
  assert.match(phase4Migration, /Insufficient stock/)
})

test("sales completion migration defines partial delivery, invoice linkage, reversal, and returns", () => {
  const completionMigration = fs.existsSync("supabase/migrations/20260911000000_sales_returns_reversals_invoice_link.sql")
    ? fs.readFileSync("supabase/migrations/20260911000000_sales_returns_reversals_invoice_link.sql", "utf8")
    : ""
  for (const table of ["sales_returns", "sales_return_items"]) {
    assert.match(completionMigration, new RegExp(`create table if not exists ${table}`))
  }
  assert.match(completionMigration, /delivery_notes add column if not exists invoice_id/)
  assert.match(completionMigration, /create or replace function reverse_delivery_note/)
  assert.match(completionMigration, /create or replace function create_sales_return/)
  assert.match(completionMigration, /delivery_status := 'Partial'/)
  assert.match(completionMigration, /'RETURN_IN'/)
  assert.match(completionMigration, /'INV-' \|\| p_ref/)
})

test("phase 6 migration defines atomic finance transactions", () => {
  const financeMigration = fs.existsSync("supabase/migrations/20260912000000_finance_transactions.sql")
    ? fs.readFileSync("supabase/migrations/20260912000000_finance_transactions.sql", "utf8")
    : ""
  assert.match(financeMigration, /create table if not exists finance_transactions/)
  assert.match(financeMigration, /CUSTOMER_RECEIPT/)
  assert.match(financeMigration, /SUPPLIER_PAYMENT/)
  assert.match(financeMigration, /create or replace function record_finance_transaction/)
  assert.match(financeMigration, /insert into cash_book/)
})

test("phase 6 settlement migration links finance transactions to source balances", () => {
  const settlementMigration = fs.existsSync("supabase/migrations/20260913000000_finance_settlement.sql")
    ? fs.readFileSync("supabase/migrations/20260913000000_finance_settlement.sql", "utf8")
    : ""
  assert.match(settlementMigration, /alter table invoices add column if not exists paid_amount/)
  assert.match(settlementMigration, /alter table purchase_orders add column if not exists paid_amount/)
  assert.match(settlementMigration, /update invoices/)
  assert.match(settlementMigration, /update purchase_orders/)
  assert.match(settlementMigration, /Receipt exceeds invoice outstanding amount/)
  assert.match(settlementMigration, /Payment exceeds purchase order outstanding amount/)
})

test("phase 7 migration defines action permission guard and audit events", () => {
  const hardeningMigration = fs.existsSync("supabase/migrations/20260914000000_permissions_audit_hardening.sql")
    ? fs.readFileSync("supabase/migrations/20260914000000_permissions_audit_hardening.sql", "utf8")
    : ""
  assert.match(hardeningMigration, /create table if not exists audit_events/)
  assert.match(hardeningMigration, /create or replace function require_permission/)
  assert.match(hardeningMigration, /create or replace function append_audit_event/)
  assert.match(hardeningMigration, /role_permissions/)
})

test("phase 7 action guard migration applies triggers to workflow tables", () => {
  const guardMigration = fs.existsSync("supabase/migrations/20260915000000_phase7_action_guards.sql")
    ? fs.readFileSync("supabase/migrations/20260915000000_phase7_action_guards.sql", "utf8")
    : ""
  assert.match(guardMigration, /create or replace function enforce_workflow_permission/)
  assert.match(guardMigration, /create or replace function audit_workflow_change/)
  assert.match(guardMigration, /permission_guard_' \|\| table_name/)
  assert.match(guardMigration, /audit_change_' \|\| table_name/)
  assert.match(guardMigration, /inventory_ledger/)
})

test("workflow seed includes every required master-data fixture", () => {
  for (const table of ["organizations", "warehouses", "categories", "brands", "units", "customers", "suppliers", "products"]) {
    assert.match(seed, new RegExp(`insert into ${table}`))
  }
  assert.match(seed, /delete from inventory_ledger/)
  assert.match(seed, /delete from goods_receipts/)
  assert.match(seed, /delete from quotations/)
})
