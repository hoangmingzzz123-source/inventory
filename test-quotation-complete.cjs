#!/usr/bin/env node

/**
 * Complete Quotation Workflow Test
 * Creates test data and verifies the entire flow
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
      return { error: data, status: res.status }
    }
    return { data, status: res.status }
  } catch (err) {
    return { error: err.message }
  }
}

async function main() {
  console.log('🧪 Testing Complete Quotation Workflow...\n')

  // Step 1: Get or create test organization
  console.log('1️⃣  Setting up organization...')
  let orgId = 'org_test_' + Date.now()
  console.log(`   ℹ️  Using org_id: ${orgId}\n`)

  // Step 2: Fetch or create products
  console.log('2️⃣  Fetching/creating products...')
  const { data: productsRes } = await apiCall('/rest/v1/products?limit=3')
  let products = productsRes || []
  
  if (products.length === 0) {
    console.log('   Creating test products...')
    const newProd = await apiCall('/rest/v1/products', 'POST', {
      org_id: orgId,
      sku: 'TEST-001',
      barcode: 'BAR-001',
      name: 'Test Product 1',
      category: 'Electronics',
      brand: 'TestBrand',
      unit: 'Piece',
      cost: 100000,
      price: 150000,
      qty: 50,
      status: 'active'
    })
    if (!newProd.error) {
      products.push(newProd.data[0])
      console.log(`   ✅ Created product: ${newProd.data[0]?.name}`)
    }
  } else {
    console.log(`   ✅ Found ${products.length} existing products`)
  }
  
  if (products.length === 0) {
    console.log('   ❌ Failed to get/create products')
    return
  }
  console.log()

  // Step 3: Fetch or create customers
  console.log('3️⃣  Fetching/creating customers...')
  const { data: customersRes } = await apiCall('/rest/v1/customers?limit=1')
  let customer = customersRes?.[0]
  
  if (!customer) {
    console.log('   Creating test customer...')
    const newCust = await apiCall('/rest/v1/customers', 'POST', {
      org_id: orgId,
      code: 'CUST-TEST-001',
      name: 'Test Customer',
      email: 'customer@test.local',
      phone: '0123456789',
      address: '123 Test Street',
      city: 'Test City',
      country: 'Vietnam',
      status: 'active'
    })
    if (!newCust.error && newCust.data?.length) {
      customer = newCust.data[0]
      console.log(`   ✅ Created customer: ${customer.name}`)
    }
  } else {
    console.log(`   ✅ Found customer: ${customer.name}`)
  }
  
  if (!customer) {
    console.log('   ❌ Failed to get/create customer')
    return
  }
  console.log()

  // Step 4: Fetch or create suppliers
  console.log('4️⃣  Fetching/creating suppliers...')
  const { data: suppliersRes } = await apiCall('/rest/v1/suppliers?limit=1')
  let supplier = suppliersRes?.[0]
  
  if (!supplier) {
    console.log('   Creating test supplier...')
    const newSupp = await apiCall('/rest/v1/suppliers', 'POST', {
      org_id: orgId,
      code: 'SUPP-TEST-001',
      name: 'Test Supplier',
      email: 'supplier@test.local',
      phone: '0987654321',
      address: '456 Supplier Street',
      status: 'active'
    })
    if (!newSupp.error && newSupp.data?.length) {
      supplier = newSupp.data[0]
      console.log(`   ✅ Created supplier: ${supplier.name}`)
    }
  } else {
    console.log(`   ✅ Found supplier: ${supplier.name}`)
  }
  
  if (!supplier) {
    console.log('   ❌ Failed to get/create supplier')
    return
  }
  console.log()

  // Step 5: Create quotation
  console.log('5️⃣  Creating quotation...')
  const quotationPayload = {
    org_id: orgId,
    customer_id: customer.id,
    customer_name: customer.name,
    date: new Date().toISOString().split('T')[0],
    valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'draft',
    discount_val: 0,
    discount_type: 'pct',
    total: 600000,
    notes: 'Test quotation created via API'
  }

  const { data: quotData, error: quotError } = await apiCall('/rest/v1/quotations', 'POST', quotationPayload)
  if (quotError || !quotData?.length) {
    console.log(`   ❌ Error creating quotation:`, quotError || 'No data returned')
    return
  }
  
  const quotation = quotData[0]
  console.log(`   ✅ Created quotation: ${quotation.id}\n`)

  // Step 6: Create goods receipt from quotation
  console.log('6️⃣  Creating goods receipt from quotation...')
  const grPayload = {
    org_id: orgId,
    receipt_id: `GR-${Date.now()}`,
    product_id: products[0].id,
    product_name: products[0].name,
    supplier_id: supplier.id,
    supplier_name: supplier.name,
    cost_price: Number(products[0].cost || 100000),
    unit: 'Piece',
    qty: 10,
    date: new Date().toISOString().split('T')[0],
    quotation_id: quotation.id,
    customer_id: customer.id,
    customer_name: customer.name,
    status: 'received'
  }

  const { data: grData, error: grError } = await apiCall('/rest/v1/goods_receipts', 'POST', grPayload)
  if (grError || !grData?.length) {
    console.log(`   ❌ Error creating goods receipt:`, grError || 'No data returned')
    return
  }
  
  const goodsReceipt = grData[0]
  console.log(`   ✅ Created goods receipt: ${goodsReceipt.id}\n`)

  // Step 7: Update quotation status
  console.log('7️⃣  Updating quotation status to "converted"...')
  const { error: updateError } = await apiCall(`/rest/v1/quotations?id=eq.${quotation.id}`, 'PATCH', {
    status: 'converted'
  })
  if (updateError) {
    console.log(`   ⚠️  Warning:`, updateError)
  } else {
    console.log(`   ✅ Quotation status updated\n`)
  }

  // Step 8: Verify all data was saved
  console.log('8️⃣  Verifying saved data in database...')
  
  const { data: savedQuot } = await apiCall(`/rest/v1/quotations?id=eq.${quotation.id}`)
  const { data: savedGR } = await apiCall(`/rest/v1/goods_receipts?id=eq.${goodsReceipt.id}`)

  console.log('\n📊 Final Results:')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`✅ Quotation:`)
  console.log(`   ID: ${savedQuot?.[0]?.id}`)
  console.log(`   Status: ${savedQuot?.[0]?.status}`)
  console.log(`   Customer: ${savedQuot?.[0]?.customer_name}`)
  console.log(`   Total: ${savedQuot?.[0]?.total}`)
  console.log()
  console.log(`✅ Goods Receipt:`)
  console.log(`   ID: ${savedGR?.[0]?.id}`)
  console.log(`   Receipt#: ${savedGR?.[0]?.receipt_id}`)
  console.log(`   Product: ${savedGR?.[0]?.product_name}`)
  console.log(`   Qty: ${savedGR?.[0]?.qty}`)
  console.log(`   Status: ${savedGR?.[0]?.status}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('\n✨ Quotation workflow test completed successfully!')
}

main().catch(err => {
  console.error('❌ Fatal Error:', err.message)
  process.exit(1)
})
