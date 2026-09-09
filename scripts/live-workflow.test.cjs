const test = require("node:test")
const assert = require("node:assert/strict")

const projectId = process.env.VITE_SUPABASE_PROJECT_ID || "jvyclpseixkqojcdxujp"
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
const accessToken = process.env.SUPABASE_TEST_ACCESS_TOKEN
const baseUrl = `https://${projectId}.supabase.co/rest/v1`
const ids = {
  org: "11111111-1111-4111-8111-111111111111",
  warehouse: "22222222-2222-4222-8222-222222222222",
  customer: "66666666-6666-4666-8666-666666666666",
  supplier: "77777777-7777-4777-8777-777777777777",
  product: "88888888-8888-4888-8888-888888888888",
  category: "33333333-3333-4333-8333-333333333333",
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}/${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const responseText = await response.text()
  let data = null
  try {
    data = responseText ? JSON.parse(responseText) : null
  } catch {
    data = responseText
  }
  return { response, data }
}

async function api(path, options = {}) {
  const result = await request(path, options)
  assert.equal(
    result.response.ok,
    true,
    `${options.method || "GET"} ${path} failed: ${JSON.stringify(result.data)}`,
  )
  return result.data
}

test(
  "live quotation workflow uses authenticated guarded RPCs",
  {
    skip:
      (!anonKey || !accessToken) &&
      "Set VITE_SUPABASE_ANON_KEY and SUPABASE_TEST_ACCESS_TOKEN to run live workflow tests",
  },
  async () => {
    const tokenPayload = JSON.parse(
      Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8"),
    )
    const profiles = await api(
      `profiles?id=eq.${tokenPayload.sub}&select=id,org_id,role,full_name,email`,
    )
    assert.equal(
      profiles[0]?.org_id,
      ids.org,
      "The test user must belong to the seeded workflow organization",
    )
    assert.equal(
      String(profiles[0]?.role).toLowerCase(),
      "admin",
      "The live workflow test requires the seeded organization administrator",
    )

    const stamp = Date.now()
    const quotationId = await api("rpc/save_quotation", {
      method: "POST",
      body: {
        p_id: null,
        p_customer_id: ids.customer,
        p_customer_name: "Khách hàng kiểm thử",
        p_warehouse_id: ids.warehouse,
        p_date: new Date().toISOString().slice(0, 10),
        p_valid_until: null,
        p_status: "Accepted",
        p_discount_val: 0,
        p_discount_type: "pct",
        p_notes: `Live workflow ${stamp}`,
        p_items: [
          {
            category_id: ids.category,
            category_name: "Danh mục kiểm thử",
            sell_unit: "Piece",
            qty: 3,
            cost_price: 100000,
            profit_pct: 50,
            selling_price: 150000,
            vat_pct: 10,
          },
        ],
        p_created_by: "Live workflow test",
      },
    })

    await api("rpc/convert_quotation_allocations", {
      method: "POST",
      body: {
        p_quotation_id: quotationId,
        p_allocations: [
          {
            quotation_item_id: (
              await api(`quotation_items?quotation_id=eq.${quotationId}&select=id`)
            )[0].id,
            source_type: "NEW_STOCK",
            product_id: ids.product,
            qty: 3,
            supplier_id: ids.supplier,
            unit_cost: 100000,
            batch_number: `BATCH-${stamp}`,
          },
        ],
      },
    })

    const savedReceipts = await api(
      `goods_receipts?po_ref=eq.${quotationId}&select=id,ref,created_by`,
    )
    assert.equal(savedReceipts.length, 1)
    const receiptId = savedReceipts[0].id
    const receiptRef = savedReceipts[0].ref

    const savedQuotation = (
      await api(`quotations?id=eq.${quotationId}&select=id,status,created_by`)
    )[0]
    const savedReceipt = savedReceipts[0]
    const savedReceiptItems = await api(
      `goods_receipt_items?receipt_id=eq.${receiptId}&select=product_id,qty,unit_cost,batch_number`,
    )
    const savedLedger = await api(
      `inventory_ledger?ref=eq.${receiptRef}&select=product_id,qty_in,qty_out`,
    )
    const savedBalance = (
      await api(
        `inventory_balance?product_id=eq.${ids.product}&warehouse_id=eq.${ids.warehouse}&select=qty`,
      )
    )[0]
    assert.equal(savedQuotation.status, "Awaiting Delivery")
    assert.notEqual(
      savedQuotation.created_by,
      "Live workflow test",
      "Quotation actor must come from the authenticated profile",
    )
    assert.notEqual(
      savedReceipt.created_by,
      "Live workflow test",
      "Receipt actor must come from the authenticated profile",
    )
    assert.equal(savedReceiptItems.length, 1)
    assert.equal(Number(savedReceiptItems[0].qty), 3)
    assert.equal(Number(savedReceiptItems[0].unit_cost), 100000)
    assert.equal(savedReceiptItems[0].batch_number, `BATCH-${stamp}`)
    assert.equal(Number(savedLedger[0].qty_in), 3)
    assert.equal(Number(savedLedger[0].qty_out), 0)
    assert.equal(
      Number(savedBalance.qty),
      3,
      "Inventory balance cache must match the ledger movement",
    )
    const costLayers = await api(
      `inventory_cost_layers?source_ref=eq.${receiptRef}&select=product_id,remaining_qty,unit_cost,batch_number`,
    )
    assert.equal(costLayers.length, 1)
    assert.equal(Number(costLayers[0].remaining_qty), 3)
    assert.equal(Number(costLayers[0].unit_cost), 100000)
    assert.equal(costLayers[0].batch_number, `BATCH-${stamp}`)
    const activeReservations = await api(
      `inventory_reservations?quotation_id=eq.${quotationId}&select=product_id,qty,status`,
    )
    assert.equal(activeReservations.length, 1)
    assert.equal(activeReservations[0].status, "ACTIVE")
    assert.equal(Number(activeReservations[0].qty), 3)

    const pricing = await api("rpc/get_product_pricing", {
      method: "POST",
      body: {
        p_product_id: ids.product,
        p_supplier_id: ids.supplier,
        p_customer_id: ids.customer,
        p_warehouse_id: ids.warehouse,
        p_qty: 2,
      },
    })
    assert.equal(Number(pricing.latest_cost), 100000)
    assert.equal(Number(pricing.estimated_cost), 100000)
    assert.equal(pricing.batch_number, `BATCH-${stamp}`)

    const duplicate = await request("rpc/receive_goods_receipt", {
      method: "POST",
      body: {
        p_ref: receiptRef,
        p_po_ref: quotationId,
        p_warehouse_id: ids.warehouse,
        p_warehouse_name: "Workflow Test Warehouse",
        p_supplier_name: "Nhà cung cấp kiểm thử",
        p_items: [
          {
            product_id: ids.product,
            sku: "TEST-SKU-001",
            qty: 3,
            unit_cost: 100000,
            unit: "Piece",
          },
        ],
      },
    })
    assert.equal(
      duplicate.response.ok,
      false,
      "Legacy direct quotation receipt conversion must be rejected",
    )

    const directLedgerWrite = await request("inventory_ledger", {
      method: "POST",
      body: {
        org_id: ids.org,
        ref: `TEST-DIRECT-${stamp}`,
        movement_type: "RECEIPT",
        product_id: ids.product,
        product_name: "Sản phẩm kiểm thử",
        sku: "TEST-SKU-001",
        warehouse_id: ids.warehouse,
        warehouse_name: "Workflow Test Warehouse",
        qty_in: 1,
        qty_out: 0,
        unit_cost: 100000,
        created_by: "Unauthorized direct write",
      },
    })
    assert.equal(
      directLedgerWrite.response.ok,
      false,
      "Authenticated clients must not write directly to the inventory ledger",
    )

    const deliveryRef = `TEST-DN-${stamp}`
    const deliveryId = await api("rpc/deliver_quotation", {
      method: "POST",
      body: { p_quotation_id: quotationId, p_ref: deliveryRef },
    })
    const deliveredQuotation = (
      await api(`quotations?id=eq.${quotationId}&select=id,status`)
    )[0]
    assert.equal(deliveredQuotation.status, "Delivered")
    const consumedReservations = await api(
      `inventory_reservations?quotation_id=eq.${quotationId}&select=status,qty`,
    )
    assert.equal(consumedReservations[0].status, "CONSUMED")
    const deliveryLedger = await api(
      `inventory_ledger?ref=eq.${deliveryRef}&select=qty_in,qty_out,unit_cost`,
    )
    assert.equal(Number(deliveryLedger[0].qty_out), 3)
    assert.equal(Number(deliveryLedger[0].unit_cost), 100000)
    const deliveryInvoice = await api(
      `invoices?delivery_id=eq.${deliveryId}&select=status,total,outstanding_amount`,
    )
    assert.equal(deliveryInvoice.length, 1)
    assert.equal(deliveryInvoice[0].status, "Unpaid")

    const reconciliation = await api("rpc/reconciliation_summary", {
      method: "POST",
      body: {},
    })
    for (const key of [
      "negative_stock_rows",
      "legacy_products_without_ledger",
      "invoice_payment_mismatches",
      "purchase_payment_mismatches",
      "inventory_balance_mismatches",
      "cost_layer_quantity_mismatches",
      "unlinked_product_categories",
      "unlinked_quotation_categories",
      "allocation_quantity_mismatches",
      "over_reserved_stock_rows",
    ]) {
      assert.equal(
        Number(reconciliation?.[key]),
        0,
        `Reconciliation check ${key} must be zero`,
      )
    }
  },
)
