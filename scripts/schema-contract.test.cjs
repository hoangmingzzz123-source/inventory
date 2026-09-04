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

test("workflow seed includes every required master-data fixture", () => {
  for (const table of ["organizations", "warehouses", "categories", "brands", "units", "customers", "suppliers", "products"]) {
    assert.match(seed, new RegExp(`insert into ${table}`))
  }
  assert.match(seed, /delete from inventory_ledger/)
  assert.match(seed, /delete from goods_receipts/)
  assert.match(seed, /delete from quotations/)
})
