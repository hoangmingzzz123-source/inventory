const test = require("node:test")
const assert = require("node:assert/strict")

const projectId = process.env.VITE_SUPABASE_PROJECT_ID || "jvyclpseixkqojcdxujp"
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const baseUrl = `https://${projectId}.supabase.co/rest/v1`
const ids = {
  org: "11111111-1111-4111-8111-111111111111",
  warehouse: "22222222-2222-4222-8222-222222222222",
  customer: "66666666-6666-4666-8666-666666666666",
  supplier: "77777777-7777-4777-8777-777777777777",
  product: "88888888-8888-4888-8888-888888888888",
}

async function api(table, options = {}) {
  const response = await fetch(`${baseUrl}/${table}${options.query || ""}`, {
    method: options.method || "GET",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: options.prefer || "return=representation" },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  assert.equal(response.ok, true, `${options.method || "GET"} ${table} failed: ${JSON.stringify(data)}`)
  return data
}

test("live quotation workflow: create, transition, receive, ledger, idempotency", { skip: !serviceKey && "Set SUPABASE_SERVICE_ROLE_KEY to run live Supabase workflow tests" }, async () => {
  const ref = `TEST-QT-${Date.now()}`
  const quotation = (await api("quotations", {
    method: "POST",
    body: { org_id: ids.org, customer_id: ids.customer, customer_name: "Khách hàng kiểm thử", date: new Date().toISOString().slice(0, 10), status: "Draft", total: 150000, discount_val: 0, discount_type: "pct" },
  }))[0]
  await api("quotation_items", { method: "POST", body: { quotation_id: quotation.id, product_id: ids.product, product_name: "Sản phẩm kiểm thử", supplier_id: ids.supplier, supplier_name: "Nhà cung cấp kiểm thử", sell_unit: "Piece", qty: 3, cost_price: 100000, selling_price: 150000, vat_pct: 10, total: 450000 } })
  await api(`quotations?id=eq.${quotation.id}`, { method: "PATCH", body: { status: "Sent" }, prefer: "return=minimal" })
  await api(`quotations?id=eq.${quotation.id}`, { method: "PATCH", body: { status: "Accepted" }, prefer: "return=minimal" })

  const receiptRef = `TEST-${ref}`
  const receipt = (await api("goods_receipts", { method: "POST", body: { org_id: ids.org, ref: receiptRef, po_ref: quotation.id, supplier_name: "Nhà cung cấp kiểm thử", warehouse_id: ids.warehouse, warehouse_name: "Workflow Test Warehouse", items: 1, status: "Completed" } }))[0]
  await api("goods_receipt_items", { method: "POST", body: { receipt_id: receipt.id, product_id: ids.product, product_name: "Sản phẩm kiểm thử", sku: "TEST-SKU-001", qty: 3, unit_cost: 100000, unit: "Piece" } })
  await api("inventory_ledger", { method: "POST", body: { org_id: ids.org, ref: receiptRef, movement_type: "RECEIPT", product_id: ids.product, product_name: "Sản phẩm kiểm thử", sku: "TEST-SKU-001", warehouse_id: ids.warehouse, warehouse_name: "Workflow Test Warehouse", qty_in: 3, qty_out: 0, unit_cost: 100000 } })
  await api(`quotations?id=eq.${quotation.id}`, { method: "PATCH", body: { status: "converted" }, prefer: "return=minimal" })

  const savedQuotation = (await api(`quotations?id=eq.${quotation.id}`))[0]
  const savedItems = await api(`quotation_items?quotation_id=eq.${quotation.id}`)
  const savedReceiptItems = await api(`goods_receipt_items?receipt_id=eq.${receipt.id}`)
  const savedLedger = await api(`inventory_ledger?ref=eq.${receiptRef}`)
  assert.equal(savedQuotation.status, "converted")
  assert.equal(savedItems.length, 1)
  assert.equal(savedReceiptItems[0].qty, 3)
  assert.equal(savedLedger[0].qty_in, 3)
  const duplicate = await fetch(`${baseUrl}/goods_receipts?ref=eq.${receiptRef}`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } })
  assert.equal((await duplicate.json()).length, 1)
})
