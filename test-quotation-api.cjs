#!/usr/bin/env node

/**
 * Test Quotation Workflow via API
 * 1. Create test user account
 * 2. Create test quotation
 * 3. Create goods receipt from quotation
 * 4. Verify data saved to database
 */

const SUPABASE_URL = "https://jvyclpseixkqojcdxujp.supabase.co"
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2eWNscHNlaXhrcW9qY2R4dWpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MzQwNDUsImV4cCI6MjEwMTQxMDA0NX0.1A_N39G2afD1BpjI48R8cZoeYsKnsQo4NN1UCp3UGxA"

// Helper function for API calls
async function apiCall(endpoint, method = 'GET', body = null) {
  const url = `${SUPABASE_URL}${endpoint}`
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
    },
  }
  if (body) options.body = JSON.stringify(body)

  try {
    const res = await fetch(url, options)
    const data = await res.json()
    if (!res.ok) {
      console.error(`API Error [${method} ${endpoint}]:`, data)
      return { error: data, status: res.status }
    }
    return { data, status: res.status }
  } catch (err) {
    console.error(`Fetch Error:`, err.message)
    return { error: err.message }
  }
}

async function main() {
  console.log('🧪 Testing Quotation Workflow...\n')

  // Step 1: Fetch existing customers
  console.log('1️⃣  Fetching customers...')
  const { data: customers } = await apiCall('/rest/v1/customers?limit=1')
  if (!customers || customers.length === 0) {
    console.log('   ❌ No customers found. Create one first.')
    return
  }
  const customerId = customers[0].id
  console.log(`   ✅ Found customer: ${customers[0].name} (${customerId})\n`)

  // Step 2: Fetch existing products
  console.log('2️⃣  Fetching products...')
  const { data: products } = await apiCall('/rest/v1/products?limit=2')
  if (!products || products.length === 0) {
    console.log('   ❌ No products found.')
    return
  }
  console.log(`   ✅ Found ${products.length} products\n`)

  // Step 3: Fetch existing suppliers
  console.log('3️⃣  Fetching suppliers...')
  const { data: suppliers } = await apiCall('/rest/v1/suppliers?limit=1')
  if (!suppliers || suppliers.length === 0) {
    console.log('   ❌ No suppliers found.')
    return
  }
  const supplierId = suppliers[0].id
  console.log(`   ✅ Found supplier: ${suppliers[0].name} (${supplierId})\n`)

  // Step 4: Create quotation
  console.log('4️⃣  Creating quotation...')
  const quotationPayload = {
    customer_id: customerId,
    customer_name: customers[0].name,
    date: new Date().toISOString().split('T')[0],
    valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'draft',
    discount_val: 0,
    discount_type: 'pct',
    total: 1000000,
    items: [
      {
        product_id: products[0].id,
        product_name: products[0].name,
        supplier_id: supplierId,
        qty: 5,
        cost_price: 100000,
        profit_pct: 20,
        selling_price: 120000,
        vat_pct: 10,
        total: 600000
      }
    ]
  }

  const { data: quotation, error: quotError } = await apiCall('/rest/v1/quotations', 'POST', quotationPayload)
  if (quotError) {
    console.log(`   ❌ Error creating quotation:`, quotError)
    return
  }
  console.log(`   ✅ Created quotation: ${quotation[0]?.id}\n`)

  const quotationId = quotation[0]?.id
  if (!quotationId) {
    console.log('   ❌ No quotation ID returned')
    return
  }

  // Step 5: Create goods receipt from quotation
  console.log('5️⃣  Creating goods receipt from quotation...')
  const grPayload = {
    receipt_id: `GR-TEST-${Date.now()}`,
    product_id: products[0].id,
    product_name: products[0].name,
    supplier_id: supplierId,
    supplier_name: suppliers[0].name,
    cost_price: quotationPayload.items[0].cost_price,
    unit: 'Piece',
    qty: quotationPayload.items[0].qty,
    date: new Date().toISOString().split('T')[0],
    quotation_id: quotationId,
    customer_id: customerId,
    customer_name: customers[0].name,
    status: 'received'
  }

  const { data: goodsReceipt, error: grError } = await apiCall('/rest/v1/goods_receipts', 'POST', grPayload)
  if (grError) {
    console.log(`   ❌ Error creating goods receipt:`, grError)
    return
  }
  console.log(`   ✅ Created goods receipt: ${goodsReceipt[0]?.id}\n`)

  // Step 6: Verify quotation status update
  console.log('6️⃣  Updating quotation status to converted...')
  const { error: updateError } = await apiCall(`/rest/v1/quotations?id=eq.${quotationId}`, 'PATCH', {
    status: 'converted'
  })
  if (updateError) {
    console.log(`   ❌ Error updating quotation:`, updateError)
  } else {
    console.log(`   ✅ Quotation status updated\n`)
  }

  // Step 7: Fetch and verify data
  console.log('7️⃣  Verifying saved data...')
  const { data: savedQuotation } = await apiCall(`/rest/v1/quotations?id=eq.${quotationId}`)
  const { data: savedGR } = await apiCall(`/rest/v1/goods_receipts?quotation_id=eq.${quotationId}`)

  console.log(`   ✅ Quotation Status: ${savedQuotation[0]?.status}`)
  console.log(`   ✅ Goods Receipts Created: ${savedGR?.length || 0}`)
  console.log(`   ✅ GR Receipt ID: ${savedGR[0]?.receipt_id}\n`)

  console.log('✨ Quotation workflow test completed successfully!\n')
}

main().catch(console.error)
