/**
 * Data service — returns mock data in demo mode, Supabase data in live mode.
 * Each function accepts { isDemo, orgId } and returns typed results.
 */
import { supabase } from "./supabase"
import * as mock from "../data/mockData"
import { defaultCompanySettings, type CompanySettings } from "./companySettings"
import { formatDateKeyUtc7 } from "./dateUtils"
import { formatVnd } from "./numberFormat"

type Ctx = { isDemo: boolean; orgId?: string }

export type LookupKind =
  | "warehouses"
  | "categories"
  | "customers"
  | "suppliers"
  | "products"
  | "units"

export type LookupItem = {
  id: string
  code: string
  label: string
  source?: string
  demoRunId?: string | null
  categoryId?: string | null
  unit?: string | null
  price?: number
  referenceCost?: number
  averageCost?: number
  trackBatch?: boolean
  onHand?: number
  reserved?: number
  available?: number
  [key: string]: unknown
}

export type DemoScenario = {
  code: string
  name: string
  description: string
  finalStatus: string
}

export type DemoRun = {
  id: string
  scenario_code: string
  status: "RUNNING" | "SUCCESS" | "FAILED"
  created_by: string
  started_at: string
  completed_at: string | null
  error_message: string | null
  metadata: Record<string, any>
}

export type ProductPricing = {
  product_id: string
  product_name: string
  sku: string
  unit: string | null
  list_price: number
  costing_method: "FIFO" | "MOVING_AVERAGE"
  available_qty: number
  average_cost: number
  estimated_cost: number
  reference_cost: number
  suggested_price: number
  latest_cost: number | null
  previous_cost: number | null
  cost_change_pct: number | null
  receipt_ref: string | null
  receipt_date: string | null
  supplier_name: string | null
  receipt_qty: number | null
  receipt_unit: string | null
  batch_number: string | null
  manufacture_date: string | null
  expiry_date: string | null
  quotation_source_ref: string | null
  latest_customer_price: number | null
  latest_customer_quotation_id: string | null
  latest_customer_quotation_date: string | null
}

export type QuotationAllocationContext = {
  quotation: {
    id: string
    status: string
    customer_id: string
    customer_name: string
    warehouse_id: string
    warehouse_name: string
    total: number
  }
  items: Array<{
    id: string
    category_id: string
    category_name: string
    qty: number
    sell_unit: string | null
    selling_price: number
    vat_pct: number
  }>
  products: Array<{
    id: string
    category_id: string
    sku: string
    name: string
    unit: string | null
    price: number
    reference_cost: number
    track_batch: boolean
    on_hand: number
    reserved: number
    available: number
    average_cost: number
  }>
  allocations: Array<Record<string, any>>
}

export async function fetchCompanySettings({ isDemo, orgId }: Ctx) {
  if (isDemo || !orgId) return { data: defaultCompanySettings, error: null }
  const { data, error } = await safeSelect("company_settings", "*", query => query.eq("org_id", orgId).maybeSingle())
  const row = (data as any[])[0] ?? data as any
  return {
    data: row
      ? {
          ...defaultCompanySettings,
          ...row,
          taxId: row.tax_id ?? defaultCompanySettings.taxId,
          costingMethod: row.costing_method ?? defaultCompanySettings.costingMethod,
        }
      : defaultCompanySettings,
    error,
  }
}

export async function upsertCompanySettings(settings: CompanySettings, { isDemo, orgId }: Ctx) {
  if (isDemo || !orgId) return { error: null }
  const { error } = await (supabase as any).from("company_settings").upsert({
    org_id: orgId,
    name: settings.name,
    representative: settings.representative,
    tax_id: settings.taxId,
    address: settings.address,
    phone: settings.phone,
    website: settings.website,
    email: settings.email,
    logo_url: settings.logoUrl ?? null,
    costing_method: settings.costingMethod,
    updated_at: new Date().toISOString(),
  })
  return { error }
}

function toNumber(value: unknown, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function normalizeNameField(row: Record<string, any>) {
  return row.name ?? row.name_vi ?? row.name_en ?? row.title ?? ""
}

function normalizeStatusValue(value: unknown) {
  if (value == null || value === "") return "Active"
  return String(value)
}

function normalizeDemoId(value: unknown) {
  return String(value ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase()
}

function findDemoProduct(value: unknown) {
  const key = normalizeDemoId(value)
  return (mock.products as any[]).find(product =>
    normalizeDemoId(product.id) === key || normalizeDemoId(product.sku) === key,
  )
}

const demoGoodsReceipts: any[] = []
const demoGoodsReceiptItems: any[] = []
const demoInventoryLedger: any[] = []

function demoUpsert(collection: any[], payload: Record<string, any>) {
  const row: Record<string, any> = { ...payload, id: payload.id ?? payload.code ?? payload.ref ?? `DEMO-${Date.now()}` }
  const index = collection.findIndex((item: Record<string, any>) => String(item.id ?? item.code ?? item.ref) === String(row.id ?? row.code ?? row.ref))
  if (index >= 0) collection[index] = { ...collection[index], ...row }
  else collection.unshift(row)
  return row
}

function demoDelete(collection: any[], id: string) {
  const index = collection.findIndex((item: Record<string, any>) => String(item.id ?? item.code ?? item.ref) === String(id))
  if (index >= 0) collection.splice(index, 1)
}

async function safeSelect(table: string, columns = "*", configure?: (query: any) => any) {
  try {
    let query = supabase.from(table).select(columns)
    if (configure) query = configure(query) ?? query
    const { data, error } = await query
    if (error) {
      return { data: [], error }
    }
    return { data: data ?? [], error: null }
  } catch (error: any) {
    return { data: [], error }
  }
}

function demoLookupRows(kind: LookupKind) {
  if (kind === "warehouses") return mock.warehouses
  if (kind === "categories") return mock.categories
  if (kind === "customers") return mock.customers
  if (kind === "suppliers") return mock.suppliers
  if (kind === "units") return mock.units
  return mock.products
}

/** Compact tenant-scoped read model for dropdowns. Live requests go through a
 * guarded RPC; demo-preview requests use the equivalent in-memory fixtures. */
export async function fetchLookup(
  kind: LookupKind,
  options: Ctx & {
    search?: string
    limit?: number
    offset?: number
    categoryId?: string | null
    warehouseId?: string | null
    includeStock?: boolean
    includeDemo?: boolean
  },
) {
  const {
    isDemo,
    orgId,
    search = "",
    limit = 50,
    offset = 0,
    categoryId = null,
    warehouseId = null,
    includeStock = false,
    includeDemo = false,
  } = options
  if (isDemo) {
    const normalizedSearch = search.trim().toLocaleLowerCase("vi")
    const productRows = kind === "products"
      ? ((await fetchProducts({ isDemo: true, orgId })).data as any[])
      : demoLookupRows(kind)
    const rows = (productRows as any[])
      .filter(row => String(row.status ?? "Active").toLowerCase() === "active")
      .filter(row => kind !== "products" || !categoryId || String(row.category_id) === categoryId)
      .filter(row => !normalizedSearch || [row.code, row.sku, row.name, row.name_vi, row.name_en]
        .some(value => String(value ?? "").toLocaleLowerCase("vi").includes(normalizedSearch)))
      .slice(Math.max(0, offset), Math.max(0, offset) + Math.max(1, Math.min(limit, 200)))
      .map(row => ({
        id: String(row.id ?? row.code),
        code: String(row.code ?? row.sku ?? ""),
        label: String(row.name ?? row.name_vi ?? row.name_en ?? row.code ?? row.sku),
        categoryId: row.category_id ?? null,
        unit: row.unit ?? row.name_vi ?? null,
        price: toNumber(row.price),
        referenceCost: toNumber(row.cost),
        averageCost: toNumber(row.average_cost ?? row.cost),
        trackBatch: Boolean(row.track_batch),
        onHand: includeStock ? toNumber(row.qty) : undefined,
        reserved: includeStock ? toNumber(row.reserved) : undefined,
        available: includeStock ? toNumber(row.available ?? row.qty) : undefined,
        representative: row.representative ?? row.contact_person ?? row.contact_name ?? "",
        address: row.address ?? row.location ?? "",
        phone: row.phone ?? "",
        email: row.email ?? "",
        taxCode: row.tax_code ?? "",
      })) satisfies LookupItem[]
    return { data: rows, error: null }
  }
  if (!orgId) return { data: [] as LookupItem[], error: new Error("Authenticated organization is required") }
  const { data, error } = await (supabase as any).rpc("get_lookup_items", {
    p_entity: kind,
    p_search: search || null,
    p_limit: limit,
    p_offset: offset,
    p_category_id: categoryId,
    p_warehouse_id: warehouseId,
    p_include_stock: includeStock,
    p_include_demo: includeDemo,
  })
  return { data: ((data as any)?.items ?? []) as LookupItem[], error }
}

export async function fetchDemoScenarios({ isDemo, orgId }: Ctx) {
  if (isDemo || !orgId) return { data: [] as DemoScenario[], error: new Error("Authentication is required") }
  const { data, error } = await (supabase as any).rpc("get_demo_scenarios")
  return { data: ((data as any)?.items ?? []) as DemoScenario[], error }
}

export async function fetchDemoRuns({ isDemo, orgId }: Ctx) {
  if (isDemo || !orgId) return { data: [] as DemoRun[], error: new Error("Authentication is required") }
  const { data, error } = await safeSelect("demo_runs", "*", query =>
    query.eq("org_id", orgId).order("started_at", { ascending: false }).limit(30),
  )
  return { data: (data ?? []) as DemoRun[], error }
}

export async function runDemoScenario(
  scenario: string,
  idempotencyKey: string,
  { isDemo, orgId }: Ctx,
) {
  if (isDemo || !orgId) return { data: null, error: new Error("Authentication is required") }
  const { data, error } = await (supabase as any).rpc("run_demo_scenario", {
    p_scenario: scenario,
    p_idempotency_key: idempotencyKey,
  })
  const businessError = data?.status === "FAILED"
    ? new Error(data.error ?? "Demo scenario failed")
    : null
  return { data, error: error ?? businessError }
}

export async function cleanupDemoData(
  demoRunId: string | null,
  { isDemo, orgId }: Ctx,
) {
  if (isDemo || !orgId) return { data: null, error: new Error("Authentication is required") }
  const { data, error } = await (supabase as any).rpc("cleanup_demo_data", {
    p_demo_run_id: demoRunId,
  })
  return { data, error }
}

// ─── Products ────────────────────────────────────────────────
export async function fetchProducts({ isDemo, orgId }: Ctx) {
  if (isDemo) {
    const reservedByProduct = (mock.quotations as any[]).flatMap(quotation =>
      quotation.allocations ?? [],
    ).reduce<Record<string, number>>((totals, allocation) => {
      if (String(allocation.reservation_status).toUpperCase() === "ACTIVE" && allocation.product_id) {
        totals[allocation.product_id] = (totals[allocation.product_id] ?? 0) + toNumber(allocation.qty)
      }
      return totals
    }, {})
    return {
      data: mock.products.map((product: any) => {
      const category = mock.categories.find((row: any) =>
        [row.code, row.name_vi, row.name_en].some(value =>
          String(value).toLowerCase() === String(product.category).toLowerCase(),
        ),
      )
      const reserved = reservedByProduct[product.id] ?? 0
      return {
        ...product,
        category_id: category?.id ?? null,
        average_cost: toNumber(product.cost),
        reserved,
        available: toNumber(product.qty) - reserved,
      }
      }),
      error: null,
    }
  }
  const { data, error } = await safeSelect("products", "*", query => orgId ? query.eq("org_id", orgId) : query)
  const products = data as any[] ?? []
  const [ledgerResult, costLayerResult, reservationResult] = orgId
    ? await Promise.all([
        safeSelect("inventory_ledger", "product_id, qty_in, qty_out", query => query.eq("org_id", orgId)),
        safeSelect("inventory_cost_layers", "product_id, remaining_qty, unit_cost", query => query.eq("org_id", orgId).gt("remaining_qty", 0)),
        safeSelect("inventory_reservations", "product_id, qty", query => query.eq("org_id", orgId).eq("status", "ACTIVE")),
      ])
    : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }]
  const ledgerQty = (ledgerResult.data as any[] ?? []).reduce<Record<string, number>>((totals, row) => {
    if (row.product_id) totals[row.product_id] = (totals[row.product_id] ?? 0) + toNumber(row.qty_in) - toNumber(row.qty_out)
    return totals
  }, {})
  const costByProduct = (costLayerResult.data as any[] ?? []).reduce<Record<string, { qty: number; value: number }>>((totals, row) => {
    if (!row.product_id) return totals
    const current = totals[row.product_id] ?? { qty: 0, value: 0 }
    const qty = toNumber(row.remaining_qty)
    current.qty += qty
    current.value += qty * toNumber(row.unit_cost)
    totals[row.product_id] = current
    return totals
  }, {})
  const reservedByProduct = (reservationResult.data as any[] ?? []).reduce<Record<string, number>>((totals, row) => {
    if (row.product_id) totals[row.product_id] = (totals[row.product_id] ?? 0) + toNumber(row.qty)
    return totals
  }, {})
  return { data: products.map(product => ({
    ...product,
    qty: ledgerQty[product.id] ?? 0,
    reserved: reservedByProduct[product.id] ?? 0,
    available: (ledgerQty[product.id] ?? 0) - (reservedByProduct[product.id] ?? 0),
    average_cost: costByProduct[product.id]?.qty
      ? costByProduct[product.id].value / costByProduct[product.id].qty
      : toNumber(product.cost),
    updated: product.updated_at,
    updatedBy: product.updated_by,
  })), error: error ?? ledgerResult.error ?? costLayerResult.error ?? reservationResult.error }
}

export async function upsertProduct(payload: Record<string, unknown>, { isDemo, orgId }: Ctx) {
  const initialQty = toNumber(payload.qty)
  const normalized = { ...payload }
  delete normalized.qty
  delete normalized.warehouse_id
  delete normalized.warehouse_name
  if (isDemo) {
    const existing = mock.products.find((row: any) => (payload.id && String(row.id) === String(payload.id)) || (!payload.id && payload.sku && row.sku === payload.sku)) as any
    const product = demoUpsert(mock.products, { ...normalized, qty: existing ? existing.qty : 0, cost: normalized.cost ?? normalized.purchase_price ?? 0, price: normalized.price ?? normalized.selling_price ?? 0 }) as any
    if (!existing && initialQty > 0) {
      const receiptRef = `INIT-${product.sku || product.id}-${Date.now()}`
      const warehouseName = String(payload.warehouse_name ?? "")
      demoUpsert(demoGoodsReceipts, { ref: receiptRef, po_ref: "", warehouse_id: payload.warehouse_id ?? null, warehouse_name: warehouseName, supplier_name: "Opening Balance", items: 1, status: "Completed" })
      demoUpsert(demoGoodsReceiptItems, { receipt_id: receiptRef, product_id: product.id, product_name: product.name, sku: product.sku, qty: initialQty, unit_cost: toNumber(product.cost), unit: product.unit })
      demoUpsert(demoInventoryLedger, { ref: receiptRef, movement_type: "OPENING_BALANCE", product_id: product.id, product_name: product.name, sku: product.sku, warehouse_id: payload.warehouse_id ?? null, warehouse_name: warehouseName, qty_in: initialQty, qty_out: 0, unit_cost: toNumber(product.cost) })
      product.qty = initialQty
    }
    return { error: null }
  }

  if (!orgId) return { error: new Error("Authenticated organization is required") }
  const { error } = await (supabase as any).rpc("upsert_product_with_opening_stock", {
    p_id: payload.id ?? null,
    p_sku: String(payload.sku ?? "").trim(),
    p_barcode: payload.barcode ?? null,
    p_name: String(payload.name ?? "").trim(),
    p_category: payload.category ?? null,
    p_brand: payload.brand ?? null,
    p_unit: payload.unit ?? null,
    p_cost: toNumber(payload.cost ?? payload.purchase_price),
    p_price: toNumber(payload.price ?? payload.selling_price),
    p_status: payload.status ?? "Active",
    p_initial_qty: initialQty,
    p_warehouse_id: payload.warehouse_id ?? null,
    p_warehouse_name: payload.warehouse_name ?? null,
    p_updated_by: payload.updated_by ?? null,
    p_tax_pct: toNumber(payload.tax_pct ?? payload.tax),
    p_min_qty: toNumber(payload.min_qty ?? payload.min),
    p_max_qty: toNumber(payload.max_qty ?? payload.max),
    p_description: payload.description ?? null,
    p_track_inventory: payload.track_inventory ?? true,
    p_track_serial: payload.track_serial ?? false,
    p_track_batch: payload.track_batch ?? false,
    p_allow_negative: payload.allow_negative ?? false,
  })
  return { error }
}

export async function deleteProduct(id: string, { isDemo }: Ctx) {
  if (isDemo) { demoDelete(mock.products, id); return { error: null } }
  const { error } = await supabase.from("products").delete().eq("id", id)
  return { error }
}

// ─── Customers ───────────────────────────────────────────────
export async function fetchCustomers({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: mock.customers, error: null }
  const { data, error } = await safeSelect("customers", "*", query => orgId ? query.eq("org_id", orgId).order("created_at", { ascending: false }) : query)
  const invoiceResult = orgId
    ? await safeSelect("invoices", "customer_id, customer_name, outstanding_amount", query => query.eq("org_id", orgId))
    : { data: [], error: null }
  const debtByCustomer = (invoiceResult.data as any[] ?? []).reduce<Record<string, number>>((totals, invoice) => {
    const key = String(invoice.customer_id ?? invoice.customer_name ?? "").toLowerCase()
    if (key) totals[key] = (totals[key] ?? 0) + toNumber(invoice.outstanding_amount)
    return totals
  }, {})
  return {
    data: (data as any[] ?? []).map((row: any) => ({
      ...row,
      credit_limit: row.credit_limit ?? row.creditLimit ?? 0,
      tax_code: row.tax_code ?? row.taxCode ?? "",
      name: row.name ?? row.customer_name ?? "",
      debt: debtByCustomer[String(row.id).toLowerCase()] ?? debtByCustomer[String(row.name ?? "").toLowerCase()] ?? 0,
    })),
    error: error ?? invoiceResult.error,
  }
}

export async function upsertCustomer(payload: Record<string, unknown>, { isDemo, orgId }: Ctx) {
  if (isDemo) { demoUpsert(mock.customers, payload); return { error: null } }
    const normalized: Record<string, any> = { ...payload, org_id: orgId }
  if (normalized.credit_limit == null && normalized.creditLimit != null) normalized.credit_limit = normalized.creditLimit
  if (normalized.tax_code == null && normalized.taxCode != null) normalized.tax_code = normalized.taxCode
  delete normalized.creditLimit
  delete normalized.taxCode
  const { error } = await supabase.from("customers").upsert([normalized] as any)
  return { error }
}

export async function bulkUpsertCustomers(payloads: Record<string, unknown>[], { isDemo, orgId }: Ctx) {
  if (isDemo) return { error: null }
  const rows = payloads.map(p => {
     const normalized: Record<string, any> = { ...p, org_id: orgId }
    if (normalized.credit_limit == null && normalized.creditLimit != null) normalized.credit_limit = normalized.creditLimit
    if (normalized.tax_code == null && normalized.taxCode != null) normalized.tax_code = normalized.taxCode
    delete normalized.creditLimit
    delete normalized.taxCode
    return normalized
  })
  const { error } = await supabase.from("customers").upsert(rows as any)
  return { error }
}

export async function deleteCustomer(id: string, { isDemo }: Ctx) {
  if (isDemo) { demoDelete(mock.customers, id); return { error: null } }
  const { error } = await supabase.from("customers").delete().eq("id", id)
  return { error }
}

// ─── Suppliers ───────────────────────────────────────────────
export async function fetchSuppliers({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: mock.suppliers, error: null }
  const { data, error } = await safeSelect("suppliers", "*", query => orgId ? query.eq("org_id", orgId).order("created_at", { ascending: false }) : query)
  const purchaseResult = orgId
    ? await safeSelect("purchase_orders", "supplier_id, supplier_name, outstanding_amount", query => query.eq("org_id", orgId))
    : { data: [], error: null }
  const debtBySupplier = (purchaseResult.data as any[] ?? []).reduce<Record<string, number>>((totals, order) => {
    const key = String(order.supplier_id ?? order.supplier_name ?? "").toLowerCase()
    if (key) totals[key] = (totals[key] ?? 0) + toNumber(order.outstanding_amount)
    return totals
  }, {})
  return {
    data: (data as any[] ?? []).map((row: any) => ({
      ...row,
      debt: debtBySupplier[String(row.id).toLowerCase()] ?? debtBySupplier[String(row.name ?? "").toLowerCase()] ?? 0,
    })),
    error: error ?? purchaseResult.error,
  }
}

export async function upsertSupplier(payload: Record<string, unknown>, { isDemo, orgId }: Ctx) {
  if (isDemo) { demoUpsert(mock.suppliers, payload); return { error: null } }
  const { error } = await supabase.from("suppliers").upsert([{ ...payload, org_id: orgId }] as any)
  return { error }
}

export async function deleteSupplier(id: string, { isDemo }: Ctx) {
  if (isDemo) { demoDelete(mock.suppliers, id); return { error: null } }
  const { error } = await supabase.from("suppliers").delete().eq("id", id)
  return { error }
}

export async function bulkUpsertSuppliers(payloads: Record<string, unknown>[], { isDemo, orgId }: Ctx) {
  if (isDemo) return { error: null }
  const rows = payloads.map(p => ({ ...p, org_id: orgId }))
  const { error } = await supabase.from("suppliers").upsert(rows as any)
  return { error }
}

// ─── Warehouses ──────────────────────────────────────────────
export async function fetchWarehouses({ isDemo, orgId }: Ctx) {
  if (isDemo) {
    return {
      data: mock.warehouses.map((row: any) => ({
        ...row,
        stock_value: toNumber(row.stock_value ?? row.stockValue ?? 0),
        stockValue: toNumber(row.stock_value ?? row.stockValue ?? 0),
        location: row.location ?? row.address ?? "",
        address: row.address ?? row.location ?? "",
      })),
      error: null,
    }
  }
  const { data, error } = await safeSelect("warehouses", "*", query => orgId ? query.eq("org_id", orgId) : query)
  const costLayerResult = orgId
    ? await safeSelect("inventory_cost_layers", "warehouse_id, remaining_qty, unit_cost", query => query.eq("org_id", orgId).gt("remaining_qty", 0))
    : { data: [], error: null }
  const stockValueByWarehouse = (costLayerResult.data as any[] ?? []).reduce<Record<string, number>>((totals, layer) => {
    const warehouseId = String(layer.warehouse_id ?? "")
    totals[warehouseId] = (totals[warehouseId] ?? 0) + toNumber(layer.remaining_qty) * toNumber(layer.unit_cost)
    return totals
  }, {})
  return {
    data: (data as any[] ?? []).map((row: any) => ({
      ...row,
      location: row.location ?? row.address ?? "",
      address: row.address ?? row.location ?? "",
      stock_value: stockValueByWarehouse[String(row.id)] ?? 0,
      stockValue: stockValueByWarehouse[String(row.id)] ?? 0,
    })),
    error: error ?? costLayerResult.error,
  }
}

export async function upsertWarehouse(payload: Record<string, unknown>, { isDemo, orgId }: Ctx) {
  if (isDemo) { demoUpsert(mock.warehouses, payload); return { error: null } }
  const normalized: Record<string, any> = { ...payload, org_id: orgId }
  if (normalized.address == null && normalized.location != null) normalized.address = normalized.location
  delete normalized.location
  const { error } = await supabase.from("warehouses").upsert([normalized] as any)
  return { error }
}

export async function bulkUpsertWarehouses(payloads: Record<string, unknown>[], { isDemo, orgId }: Ctx) {
  if (isDemo) return { error: null }
  const rows = payloads.map(p => {
    const normalized: Record<string, unknown> = { ...p, org_id: orgId }
    if (normalized.address == null && normalized.location != null) normalized.address = normalized.location
    delete normalized.location
    return normalized
  })
  const { error } = await supabase.from("warehouses").upsert(rows as any)
  return { error }
}

export async function deleteWarehouse(id: string, { isDemo }: Ctx) {
  if (isDemo) { demoDelete(mock.warehouses, id); return { error: null } }
  const { error } = await supabase.from("warehouses").delete().eq("id", id)
  return { error }
}

// ─── Purchase Orders ─────────────────────────────────────────
export async function fetchPurchaseOrders({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: mock.purchaseOrders, error: null }
  const { data, error } = await safeSelect("purchase_orders", "*", query => orgId ? query.eq("org_id", orgId).order("created_at", { ascending: false }) : query)
  const rows = data as any[] ?? []
  const ids = rows.map(row => row.id).filter(Boolean)
  const itemResult = ids.length ? await safeSelect("purchase_order_items", "*", query => query.in("po_id", ids)) : { data: [], error: null }
  const itemsByPo = (itemResult.data as any[] ?? []).reduce((groups, item) => { ;(groups[item.po_id] ??= []).push(item); return groups }, {} as Record<string, any[]>)
  const refs = rows.map(row => row.ref).filter(Boolean)
  const receiptResult = refs.length ? await safeSelect("goods_receipts", "id, po_ref, ref", query => query.in("po_ref", refs).eq("org_id", orgId)) : { data: [], error: null }
  const receiptIds = (receiptResult.data as any[] ?? []).map(row => row.id).filter(Boolean)
  const receiptItemResult = receiptIds.length ? await safeSelect("goods_receipt_items", "receipt_id, product_id, sku, qty", query => query.in("receipt_id", receiptIds)) : { data: [], error: null }
  const receiptByPo = (receiptResult.data as any[] ?? []).reduce((groups, receipt) => { ;(groups[receipt.po_ref] ??= []).push(receipt); return groups }, {} as Record<string, any[]>)
  const receiptItemsByReceipt = (receiptItemResult.data as any[] ?? []).reduce((groups, item) => { ;(groups[item.receipt_id] ??= []).push(item); return groups }, {} as Record<string, any[]>)
  return { data: rows.map((row: any) => {
    const receivedByProduct = (receiptByPo[row.ref] ?? []).flatMap((receipt: any) => receiptItemsByReceipt[receipt.id] ?? []).reduce((totals: Record<string, number>, item: any) => {
      const key = String(item.product_id ?? item.sku ?? "")
      totals[key] = (totals[key] ?? 0) + toNumber(item.qty)
      return totals
    }, {} as Record<string, number>)
    const items = (itemsByPo[row.id] ?? []).map((item: any) => ({
      ...item,
      received_qty: receivedByProduct[String(item.product_id ?? item.sku ?? "")] ?? 0,
      remaining_qty: Math.max(0, toNumber(item.qty) - (receivedByProduct[String(item.product_id ?? item.sku ?? "")] ?? 0)),
    }))
    return {
    ...row,
    items,
    received_items: items.reduce((sum: number, item: any) => sum + toNumber(item.received_qty), 0),
    date: row.expected_date ?? row.created_at,
    due_date: row.due_date ?? row.expected_date ?? row.created_at,
    paid_amount: toNumber(row.paid_amount),
    outstanding_amount: toNumber(row.outstanding_amount ?? Math.max(0, toNumber(row.total) - toNumber(row.paid_amount))),
    payment_status: row.payment_status ?? (toNumber(row.paid_amount) >= toNumber(row.total) && toNumber(row.total) > 0 ? "Paid" : toNumber(row.paid_amount) > 0 ? "Partial" : "Unpaid"),
    createdBy: row.created_by ?? row.createdBy ?? "",
    supplier: row.supplier_name ?? row.supplier ?? "",
    warehouse: row.warehouse_name ?? row.warehouse ?? "",
  }
  }), error: error ?? itemResult.error ?? receiptResult.error ?? receiptItemResult.error }
}

export async function upsertPurchaseOrder(payload: Record<string, unknown>, { isDemo, orgId }: Ctx) {
  const normalized: Record<string, any> = {
    id: payload.id ?? null,
    ref: payload.ref ?? null,
    supplier_id: payload.supplier_id ?? null,
    supplier_name: payload.supplier_name ?? payload.supplier ?? null,
    warehouse_id: payload.warehouse_id ?? null,
    warehouse_name: payload.warehouse_name ?? payload.warehouse ?? null,
    status: payload.status ?? null,
    total: payload.total == null ? null : toNumber(payload.total),
    notes: payload.notes ?? null,
    expected_date: payload.expected_date ?? payload.date ?? null,
    created_by: payload.created_by ?? payload.createdBy ?? null,
    items: Array.isArray(payload.items) ? payload.items : null,
  }
  if (isDemo) { demoUpsert(mock.purchaseOrders, { ...normalized, supplier: normalized.supplier_name, warehouse: normalized.warehouse_name, createdBy: normalized.created_by, date: normalized.date ?? formatDateKeyUtc7(), items: payload.items ?? [] }); return { error: null } }
  if (!orgId) return { error: new Error("Authenticated organization is required") }
  const { error } = await (supabase as any).rpc("save_purchase_order", {
    p_id: normalized.id,
    p_ref: normalized.ref,
    p_supplier_id: normalized.supplier_id,
    p_supplier_name: normalized.supplier_name,
    p_warehouse_id: normalized.warehouse_id,
    p_warehouse_name: normalized.warehouse_name,
    p_status: normalized.status,
    p_total: normalized.total,
    p_notes: normalized.notes,
    p_expected_date: normalized.expected_date,
    p_items: normalized.items,
    p_created_by: normalized.created_by,
  })
  return { error }
}

export async function deletePurchaseOrder(id: string, { isDemo }: Ctx) {
  if (isDemo) { demoDelete(mock.purchaseOrders, id); return { error: null } }
  const { error } = await (supabase as any).rpc("delete_draft_document", { p_entity: "purchase_order", p_id: id })
  return { error }
}

// ─── Sales Orders ────────────────────────────────────────────
export async function fetchSalesOrders({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: mock.salesOrders, error: null }
  const { data, error } = await safeSelect("sales_orders", "*", query => orgId ? query.eq("org_id", orgId).order("created_at", { ascending: false }) : query)
  const orders = data as any[] ?? []
  const ids = orders.map(row => row.id).filter(Boolean)
  const itemResult = ids.length ? await safeSelect("sales_order_items", "*", query => query.in("sales_order_id", ids)) : { data: [], error: null }
  const deliveryResult = ids.length ? await safeSelect("delivery_notes", "id, sales_order_id, status", query => query.in("sales_order_id", ids).neq("status", "Reversed")) : { data: [], error: null }
  const deliveryIds = (deliveryResult.data as any[] ?? []).map(row => row.id).filter(Boolean)
  const deliveredItemResult = deliveryIds.length ? await safeSelect("delivery_note_items", "delivery_id, product_id, qty", query => query.in("delivery_id", deliveryIds)) : { data: [], error: null }
  const deliveryOrderById = Object.fromEntries((deliveryResult.data as any[] ?? []).map(row => [row.id, row.sales_order_id]))
  const deliveredByOrderProduct = (deliveredItemResult.data as any[] ?? []).reduce((totals, item) => {
    const key = `${deliveryOrderById[item.delivery_id]}:${item.product_id}`
    totals[key] = (totals[key] ?? 0) + toNumber(item.qty)
    return totals
  }, {} as Record<string, number>)
  const itemsByOrder = (itemResult.data as any[] ?? []).reduce((groups, item) => {
    ;(groups[item.sales_order_id] ??= []).push(item)
    return groups
  }, {} as Record<string, any[]>)
  return { data: orders.map(row => ({ ...row, items: (itemsByOrder[row.id] ?? []).map((item: any) => {
    const deliveredQty = deliveredByOrderProduct[`${row.id}:${item.product_id}`] ?? 0
    return { ...item, delivered_qty: deliveredQty, remaining_qty: Math.max(0, toNumber(item.qty) - deliveredQty) }
  }) })), error: error ?? itemResult.error ?? deliveryResult.error ?? deliveredItemResult.error }
}

export async function upsertSalesOrder(payload: Record<string, unknown>, { isDemo, orgId }: Ctx) {
  const source = payload as Record<string, any>
  const isUpdate = Boolean(source.id)
  const normalized = {
    ...(source.id ? { id: source.id } : {}),
    ref: source.ref ?? (isUpdate ? null : `SO-${formatDateKeyUtc7().replace(/-/g, "")}-${Date.now()}`),
    customer_id: source.customer_id ?? null,
    customer_name: source.customer_name ?? source.customer ?? null,
    warehouse_id: source.warehouse_id ?? null,
    warehouse_name: source.warehouse_name ?? source.warehouse ?? null,
    status: source.status ?? (isUpdate ? null : "Draft"),
    subtotal: source.subtotal == null ? null : Number(source.subtotal),
    tax: source.tax == null ? null : Number(source.tax),
    total: source.total == null ? null : Number(source.total),
    notes: source.notes ?? null,
    created_by: source.created_by ?? source.createdBy ?? "system",
    org_id: orgId,
  }
  if (isDemo) {
    demoUpsert(mock.salesOrders, { ...normalized, customer: normalized.customer_name, warehouse: normalized.warehouse_name, items: source.items ?? [] })
    return { error: null }
  }
  if (!orgId) return { error: new Error("Authenticated organization is required") }
  const items = Array.isArray(source.items) ? source.items.map((item: any) => ({
      product_id: item.product_id ?? item.productId ?? null,
      product_name: item.product_name ?? item.product ?? "",
      sku: item.sku ?? null,
      qty: Number(item.qty ?? 0),
      unit_price: Number(item.unit_price ?? item.price ?? 0),
      unit_cost: Number(item.unit_cost ?? item.cost ?? 0),
    })) : null
  const { error } = await (supabase as any).rpc("save_sales_order", {
    p_id: normalized.id ?? null,
    p_ref: normalized.ref,
    p_customer_id: normalized.customer_id,
    p_customer_name: normalized.customer_name,
    p_warehouse_id: normalized.warehouse_id,
    p_warehouse_name: normalized.warehouse_name,
    p_status: normalized.status,
    p_subtotal: normalized.subtotal,
    p_tax: normalized.tax,
    p_total: normalized.total,
    p_notes: normalized.notes,
    p_items: items,
    p_created_by: normalized.created_by,
  })
  return { error }
}

export async function deleteSalesOrder(id: string, { isDemo }: Ctx) {
  if (isDemo) return { error: null }
  const { error } = await (supabase as any).rpc("delete_draft_document", { p_entity: "sales_order", p_id: id })
  return { error }
}

export async function fetchDeliveryNotes({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: [], error: null }
  const { data, error } = await safeSelect("delivery_notes", "*", query => orgId ? query.eq("org_id", orgId).order("created_at", { ascending: false }) : query)
  const deliveries = data as any[] ?? []
  const ids = deliveries.map(row => row.id).filter(Boolean)
  const itemResult = ids.length ? await safeSelect("delivery_note_items", "*", query => query.in("delivery_id", ids)) : { data: [], error: null }
  const itemsByDelivery = (itemResult.data as any[] ?? []).reduce((groups, item) => {
    ;(groups[item.delivery_id] ??= []).push(item)
    return groups
  }, {} as Record<string, any[]>)
  return { data: deliveries.map(row => ({ ...row, items: itemsByDelivery[row.id] ?? [] })), error }
}

export async function deliverSalesOrder(payload: Record<string, any>, { isDemo, orgId }: Ctx) {
  if (isDemo) return { error: null }
  const items = (Array.isArray(payload.items) ? payload.items : []).map((item: any) => ({
    product_id: item.product_id ?? item.productId,
    product_name: item.product_name ?? item.product ?? "",
    qty: Number(item.qty ?? item.quantity ?? 0),
    unit_cost: Number(item.unit_cost ?? item.cost ?? 0),
    unit_price: Number(item.unit_price ?? item.price ?? 0),
  }))
  const { error } = await (supabase as any).rpc("deliver_sales_order", {
    p_ref: String(payload.ref ?? payload.doc_no ?? `DN-${Date.now()}`),
    p_sales_order_id: payload.sales_order_id ?? payload.salesOrderId ?? null,
    p_sales_order_ref: payload.sales_order_ref ?? payload.salesOrderRef ?? null,
    p_customer_id: payload.customer_id ?? null,
    p_customer_name: payload.customer_name ?? payload.customer ?? "",
    p_warehouse_id: payload.warehouse_id ?? payload.warehouseId ?? null,
    p_warehouse_name: payload.warehouse_name ?? payload.warehouse ?? "",
    p_items: items,
    p_created_by: payload.created_by ?? payload.createdBy ?? "system",
    p_note: payload.note ?? null,
  })
  return { error }
}

export async function reverseDeliveryNote(ref: string, { isDemo }: Ctx) {
  if (isDemo) return { error: null }
  const { error } = await (supabase as any).rpc("reverse_delivery_note", { p_ref: ref, p_created_by: "system" })
  return { error }
}

export async function createSalesReturn(payload: Record<string, any>, { isDemo }: Ctx) {
  if (isDemo) return { error: null }
  const items = (Array.isArray(payload.items) ? payload.items : []).map((item: any) => ({
    product_id: item.product_id ?? item.productId,
    qty: Number(item.qty ?? item.quantity ?? 0),
  }))
  const { error } = await (supabase as any).rpc("create_sales_return", {
    p_ref: String(payload.ref ?? payload.doc_no ?? `RET-${Date.now()}`),
    p_delivery_ref: payload.delivery_ref ?? payload.deliveryRef ?? "",
    p_warehouse_id: payload.warehouse_id ?? payload.warehouseId ?? null,
    p_warehouse_name: payload.warehouse_name ?? payload.warehouse ?? "",
    p_items: items,
    p_reason: payload.reason ?? "",
    p_created_by: payload.created_by ?? payload.createdBy ?? "system",
  })
  return { error }
}

export async function fetchSalesReturns({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: [], error: null }
  const { data, error } = await safeSelect("sales_returns", "*", query => orgId ? query.eq("org_id", orgId).order("created_at", { ascending: false }) : query)
  const returns = data as any[] ?? []
  const ids = returns.map(row => row.id).filter(Boolean)
  const itemResult = ids.length ? await safeSelect("sales_return_items", "*", query => query.in("return_id", ids)) : { data: [], error: null }
  const itemsByReturn = (itemResult.data as any[] ?? []).reduce((groups, item) => {
    ;(groups[item.return_id] ??= []).push(item)
    return groups
  }, {} as Record<string, any[]>)
  return {
    data: returns.map(row => ({ ...row, items: itemsByReturn[row.id] ?? [] })),
    error: error ?? itemResult.error,
  }
}

export async function reverseSalesReturn(ref: string, { isDemo }: Ctx) {
  if (isDemo) return { error: null }
  const { error } = await (supabase as any).rpc("reverse_sales_return", { p_ref: ref, p_created_by: null })
  return { error }
}

export async function fetchInvoices({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: [], error: null }
  const { data, error } = await safeSelect("invoices", "*", query => orgId ? query.eq("org_id", orgId).order("created_at", { ascending: false }) : query)
  return { data: data as any[] ?? [], error }
}

// ─── Inventory Balance ───────────────────────────────────────
export async function fetchInventoryBalance({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: mock.inventoryBalance, error: null }
  const [ledgerResult, costLayerResult, reservationResult] = await Promise.all([
    safeSelect("inventory_ledger", "*", query => orgId ? query.eq("org_id", orgId).order("created_at") : query),
    safeSelect("inventory_cost_layers", "product_id, warehouse_id, remaining_qty, unit_cost", query => orgId ? query.eq("org_id", orgId).gt("remaining_qty", 0) : query),
    safeSelect("inventory_reservations", "product_id, warehouse_id, qty", query => orgId ? query.eq("org_id", orgId).eq("status", "ACTIVE") : query),
  ])
  const data = ledgerResult.data
  const groups = new Map<string, any>()
  for (const row of data as any[] ?? []) {
    const key = `${row.product_id ?? row.sku}:${row.warehouse_id ?? row.warehouse_name ?? ""}`
    const current = groups.get(key) ?? {
      product_id: row.product_id,
      product_name: row.product_name,
      product: row.product_name,
      sku: row.sku,
      warehouse_id: row.warehouse_id,
      warehouse_name: row.warehouse_name,
      warehouse: row.warehouse_name,
      qty: 0,
      value: 0,
    }
    const delta = toNumber(row.qty_in) - toNumber(row.qty_out)
    current.qty += delta
    current.value += delta * toNumber(row.unit_cost)
    current.updated_at = row.created_at
    groups.set(key, current)
  }
  const layerCosts = new Map<string, { qty: number; value: number }>()
  for (const layer of costLayerResult.data as any[] ?? []) {
    const key = `${layer.product_id}:${layer.warehouse_id ?? ""}`
    const current = layerCosts.get(key) ?? { qty: 0, value: 0 }
    const qty = toNumber(layer.remaining_qty)
    current.qty += qty
    current.value += qty * toNumber(layer.unit_cost)
    layerCosts.set(key, current)
  }
  const reservedByStock = new Map<string, number>()
  for (const reservation of reservationResult.data as any[] ?? []) {
    const key = `${reservation.product_id}:${reservation.warehouse_id ?? ""}`
    reservedByStock.set(key, (reservedByStock.get(key) ?? 0) + toNumber(reservation.qty))
  }
  return { data: Array.from(groups.values()).map(row => ({
    ...row,
    available: row.qty - (reservedByStock.get(`${row.product_id}:${row.warehouse_id ?? ""}`) ?? 0),
    reserved: reservedByStock.get(`${row.product_id}:${row.warehouse_id ?? ""}`) ?? 0,
    incoming: 0,
    outgoing: 0,
    unit_cost: layerCosts.get(`${row.product_id}:${row.warehouse_id ?? ""}`)?.qty
      ? (layerCosts.get(`${row.product_id}:${row.warehouse_id ?? ""}`)?.value ?? 0) /
        (layerCosts.get(`${row.product_id}:${row.warehouse_id ?? ""}`)?.qty ?? 1)
      : row.qty ? row.value / row.qty : 0,
    avgCost: layerCosts.get(`${row.product_id}:${row.warehouse_id ?? ""}`)?.qty
      ? (layerCosts.get(`${row.product_id}:${row.warehouse_id ?? ""}`)?.value ?? 0) /
        (layerCosts.get(`${row.product_id}:${row.warehouse_id ?? ""}`)?.qty ?? 1)
      : row.qty ? row.value / row.qty : 0,
  })), error: ledgerResult.error ?? costLayerResult.error ?? reservationResult.error }
}

export async function fetchInventoryLedger({ isDemo, orgId }: Ctx) {
  if (isDemo) {
    const balances = new Map<string, number>()
    return {
      data: demoInventoryLedger.map((row: any) => {
        const key = `${row.product_id ?? row.sku}:${row.warehouse_id ?? row.warehouse_name ?? ""}`
        const balance = (balances.get(key) ?? 0) + toNumber(row.qty_in) - toNumber(row.qty_out)
        balances.set(key, balance)
        return { ...row, qty_in: toNumber(row.qty_in), qty_out: toNumber(row.qty_out), balance }
      }),
      error: null,
    }
  }

  const { data, error } = await safeSelect("inventory_ledger", "*", query =>
    orgId ? query.eq("org_id", orgId).order("created_at", { ascending: true }) : query,
  )
  const balances = new Map<string, number>()
  const rows = (data as any[] ?? []).map((row: any) => {
    const key = `${row.product_id ?? row.sku}:${row.warehouse_id ?? row.warehouse_name ?? ""}`
    const balance = (balances.get(key) ?? 0) + toNumber(row.qty_in) - toNumber(row.qty_out)
    balances.set(key, balance)
    return {
      ...row,
      qty_in: toNumber(row.qty_in),
      qty_out: toNumber(row.qty_out),
      unit_cost: toNumber(row.unit_cost),
      balance,
    }
  })
  return { data: rows.reverse(), error }
}

// ─── Categories, Brands, Units ──────────────────────────────
export async function fetchCategories({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: mock.categories, error: null }
  const { data, error } = await safeSelect("categories", "*", query => orgId ? query.eq("org_id", orgId) : query)
  return {
    data: (data as any[] ?? []).map((row: any) => ({
      ...row,
      name: row.name ?? row.name_vi ?? row.name_en ?? "",
    })),
    error,
  }
}

export async function fetchBrands({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: mock.brands, error: null }
  const { data, error } = await safeSelect("brands", "*", query => orgId ? query.eq("org_id", orgId) : query)
  return {
    data: (data as any[] ?? []).map((row: any) => ({
      ...row,
      name: normalizeNameField(row),
      status: normalizeStatusValue(row.status),
    })),
    error,
  }
}

export async function fetchUnits({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: mock.units, error: null }
  const { data, error } = await safeSelect("units", "*", query => orgId ? query.eq("org_id", orgId) : query)
  return {
    data: (data as any[] ?? []).map((row: any) => ({
      ...row,
      name: row.name ?? row.name_vi ?? row.name_en ?? "",
    })),
    error,
  }
}

export async function fetchRoles({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: [], error: null }
  const { data, error } = await safeSelect("roles", "*", query => orgId ? query.eq("org_id", orgId).order("created_at", { ascending: false }) : query)
  const profileResult = orgId
    ? await safeSelect("profiles", "role", query => query.eq("org_id", orgId))
    : { data: [], error: null }
  const usersByRole = (profileResult.data as any[] ?? []).reduce<Record<string, number>>((counts, row) => {
    const roleCode = String(row.role ?? "").toLowerCase()
    if (roleCode) counts[roleCode] = (counts[roleCode] ?? 0) + 1
    return counts
  }, {})
  return {
    data: (data as any[] ?? []).map((row: any) => ({
      ...row,
      name: row.name_vi ?? row.name_en ?? row.name ?? "",
      users: usersByRole[String(row.code ?? "").toLowerCase()] ?? 0,
      isSystem: Boolean(row.is_system),
      desc: row.description ?? "",
    })),
    error: error ?? profileResult.error,
  }
}

export async function upsertRole(payload: Record<string, unknown>, { isDemo, orgId }: Ctx) {
  if (isDemo) return { error: null }
  const normalized: Record<string, any> = { ...payload, org_id: orgId }
  if (normalized.name_vi == null && normalized.name != null) normalized.name_vi = String(normalized.name)
  if (normalized.name_en == null && normalized.name != null) normalized.name_en = String(normalized.name)
  if (normalized.is_system == null && normalized.isSystem != null) normalized.is_system = Boolean(normalized.isSystem)
  if (normalized.description == null && normalized.desc != null) normalized.description = String(normalized.desc)
  delete normalized.name
  delete normalized.isSystem
  delete normalized.desc
  const { error } = await supabase.from("roles").upsert([normalized] as any)
  return { error }
}

export async function deleteRole(id: string, { isDemo }: Ctx) {
  if (isDemo) return { error: null }
  const { error } = await supabase.from("roles").delete().eq("id", id)
  return { error }
}

export async function fetchRolePermissions({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: [], error: null }
  const roleIdsRes = await safeSelect("roles", "id", query => orgId ? query.eq("org_id", orgId) : query)
  const roleIds = (roleIdsRes.data ?? []).map((row: any) => row.id).filter(Boolean)

  let query = supabase.from("role_permissions").select("*")
  if (roleIds.length) query = query.in("role_id", roleIds)

  const { data, error } = await query
  return { data: (data as any[] ?? []).map((row: any) => ({ ...row, allowed: row.allowed ?? true })), error }
}

export async function upsertRolePermission(payload: Record<string, unknown>, { isDemo }: Ctx) {
  if (isDemo) return { error: null }
  const normalized = { ...payload }
  if (normalized.allowed == null && normalized.allow != null) normalized.allowed = Boolean(normalized.allow)
  delete normalized.allow
  const { error } = await supabase.from("role_permissions").upsert([normalized] as any)
  return { error }
}

export async function deleteRolePermission(roleId: string, module: string, action: string, { isDemo }: Ctx) {
  if (isDemo) return { error: null }
  const { error } = await supabase.from("role_permissions").delete().eq("role_id", roleId).eq("module", module).eq("action", action)
  return { error }
}

export async function fetchUsers({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: [], error: null }
  const { data, error } = await safeSelect("profiles", "id, email, full_name, role, created_at", query => orgId ? query.eq("org_id", orgId).order("created_at", { ascending: false }) : query)
  return { data: data as any[] ?? [], error }
}

export async function updateUserRole(userId: string, role: string, { isDemo }: Ctx) {
  if (isDemo) return { error: null }
  const { error } = await (supabase as any).rpc("set_organization_user_role", {
    p_user_id: userId,
    p_role: role,
  })
  return { error }
}

export async function createOrganizationInvitation(email: string, role: string, { isDemo }: Ctx) {
  if (isDemo) return { data: null, error: new Error("Invitation links require live mode.") }
  const { data, error } = await (supabase as any).rpc("create_organization_invitation", {
    p_email: email.trim(),
    p_role: role,
  })
  return { data: data as string | null, error }
}

export async function upsertCategory(payload: Record<string, unknown>, { isDemo, orgId }: Ctx) {
  if (isDemo) { demoUpsert(mock.categories, payload); return { error: null } }
  const normalized: Record<string, any> = { ...payload, org_id: orgId }
  const name = String(normalized.name ?? normalized.name_vi ?? normalized.name_en ?? "")
  if (normalized.name_vi == null && normalized.name == null && normalized.name_en == null) {
    normalized.name_vi = name
    normalized.name_en = name
  } else {
    if (normalized.name_vi == null) normalized.name_vi = String(normalized.name_vi ?? name)
    if (normalized.name_en == null) normalized.name_en = String(normalized.name_en ?? name)
  }
  delete normalized.name
  const { error } = await supabase.from("categories").upsert([normalized] as any)
  return { error }
}

export async function bulkUpsertCategories(payloads: Record<string, unknown>[], { isDemo, orgId }: Ctx) {
  if (isDemo) return { error: null }
  const rows = payloads.map(p => {
    const normalized: Record<string, any> = { ...p, org_id: orgId }
    const name = String(normalized.name ?? normalized.name_vi ?? normalized.name_en ?? "")
    if (normalized.name_vi == null && normalized.name == null && normalized.name_en == null) {
      normalized.name_vi = name
      normalized.name_en = name
    } else {
      if (normalized.name_vi == null) normalized.name_vi = String(normalized.name_vi ?? name)
      if (normalized.name_en == null) normalized.name_en = String(normalized.name_en ?? name)
    }
    delete normalized.name
    return normalized
  })
  const { error } = await supabase.from("categories").upsert(rows as any)
  return { error }
}

export async function deleteCategory(id: string, { isDemo }: Ctx) {
  if (isDemo) { demoDelete(mock.categories, id); return { error: null } }
  const { error } = await supabase.from("categories").delete().eq("id", id)
  return { error }
}

export async function fetchInventoryAdjustments({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: [], error: null }
  const { data, error } = await safeSelect("inventory_adjustments", "*", query => orgId ? query.eq("org_id", orgId).order("created_at", { ascending: false }) : query)
  return { data: (data as any[] ?? []).map((row: any) => ({
    ...row,
    doc_no: row.doc_no ?? row.ref ?? "",
    warehouse: row.warehouse_name ?? row.warehouse ?? "",
    status: row.status ?? "Draft",
  })), error }
}

export async function fetchInventoryTransfers({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: [], error: null }
  const { data, error } = await safeSelect("inventory_transfers", "*", query => orgId ? query.eq("org_id", orgId).order("created_at", { ascending: false }) : query)
  return {
    data: (data as any[] ?? []).map((row: any) => ({
      ...row,
      doc_no: row.doc_no ?? row.ref ?? "",
      from: row.from_warehouse_name ?? row.from_warehouse ?? "",
      to: row.to_warehouse_name ?? row.to_warehouse ?? "",
      status: row.status ?? "Draft",
    })),
    error,
  }
}

export async function upsertInventoryAdjustment(payload: Record<string, any>, { isDemo, orgId }: Ctx) {
  if (isDemo) return { error: null }
  const items = (Array.isArray(payload.items) ? payload.items : []).map((item: any) => ({
    product_id: item.product_id ?? item.productId,
    product_name: item.product_name ?? item.product ?? "",
    qty_delta: Number(item.qty_delta ?? item.delta ?? item.qty ?? 0),
    unit_cost: Number(item.unit_cost ?? item.cost_price ?? item.cost ?? 0),
  }))
  const { error } = await (supabase as any).rpc("create_inventory_adjustment", {
    p_ref: String(payload.ref ?? payload.doc_no ?? `ADJ-${Date.now()}`),
    p_warehouse_id: payload.warehouse_id ?? payload.warehouseId ?? null,
    p_warehouse_name: String(payload.warehouse_name ?? payload.warehouse ?? "").trim(),
    p_reason: payload.reason ?? payload.type ?? "Manual adjustment",
    p_items: items,
    p_created_by: payload.created_by ?? payload.createdBy ?? "system",
  })
  return { error }
}

export async function upsertInventoryTransfer(payload: Record<string, any>, { isDemo, orgId }: Ctx) {
  if (isDemo) return { error: null }
  const items = (Array.isArray(payload.items) ? payload.items : []).map((item: any) => ({
    product_id: item.product_id ?? item.productId,
    product_name: item.product_name ?? item.product ?? "",
    qty: Number(item.qty ?? item.quantity ?? 0),
    unit_cost: Number(item.unit_cost ?? item.cost_price ?? item.cost ?? 0),
  }))
  const { error } = await (supabase as any).rpc("create_inventory_transfer", {
    p_ref: String(payload.ref ?? payload.doc_no ?? `TRF-${Date.now()}`),
    p_from_warehouse_id: payload.from_warehouse_id ?? payload.fromWarehouseId ?? null,
    p_from_warehouse_name: String(payload.from_warehouse_name ?? payload.fromWarehouse ?? "").trim(),
    p_to_warehouse_id: payload.to_warehouse_id ?? payload.toWarehouseId ?? null,
    p_to_warehouse_name: String(payload.to_warehouse_name ?? payload.toWarehouse ?? "").trim(),
    p_items: items,
    p_created_by: payload.created_by ?? payload.createdBy ?? "system",
  })
  return { error }
}

export async function reverseInventoryAdjustment(ref: string, { isDemo }: Ctx) {
  if (isDemo) return { error: null }
  const { error } = await (supabase as any).rpc("reverse_inventory_adjustment", { p_ref: ref, p_created_by: "system" })
  return { error }
}

export async function reverseInventoryTransfer(ref: string, { isDemo }: Ctx) {
  if (isDemo) return { error: null }
  const { error } = await (supabase as any).rpc("reverse_inventory_transfer", { p_ref: ref, p_created_by: "system" })
  return { error }
}

export async function upsertBrand(payload: Record<string, unknown>, { isDemo, orgId }: Ctx) {
  if (isDemo) { demoUpsert(mock.brands, payload); return { error: null } }
  const normalized: Record<string, unknown> = { ...payload, org_id: orgId }
  if (normalized.name == null && normalized.name_vi != null) normalized.name = String(normalized.name_vi)
  if (normalized.status == null || normalized.status === "") normalized.status = "Active"
  const { error } = await supabase.from("brands").upsert([normalized] as any)
  return { error }
}

export async function bulkUpsertBrands(payloads: Record<string, unknown>[], { isDemo, orgId }: Ctx) {
  if (isDemo) return { error: null }
  const rows = payloads.map(p => ({ ...p, org_id: orgId }))
  const { error } = await supabase.from("brands").upsert(rows as any)
  return { error }
}

export async function deleteBrand(id: string, { isDemo }: Ctx) {
  if (isDemo) { demoDelete(mock.brands, id); return { error: null } }
  const { error } = await supabase.from("brands").delete().eq("id", id)
  return { error }
}

export async function upsertUnit(payload: Record<string, unknown>, { isDemo, orgId }: Ctx) {
  if (isDemo) { demoUpsert(mock.units, payload); return { error: null } }
   const normalized: Record<string, any> = { ...payload, org_id: orgId }
  const name = String(normalized.name ?? normalized.name_vi ?? normalized.name_en ?? "")
  if (normalized.name_vi == null && normalized.name == null && normalized.name_en == null) {
    normalized.name_vi = name
    normalized.name_en = name
  } else {
    if (normalized.name_vi == null) normalized.name_vi = String(normalized.name_vi ?? name)
    if (normalized.name_en == null) normalized.name_en = String(normalized.name_en ?? name)
  }
  delete normalized.name
  const { error } = await supabase.from("units").upsert([normalized] as any)
  return { error }
}

export async function bulkUpsertUnits(payloads: Record<string, unknown>[], { isDemo, orgId }: Ctx) {
  if (isDemo) return { error: null }
  const rows = payloads.map(p => {
     const normalized: Record<string, any> = { ...p, org_id: orgId }
    const name = String(normalized.name ?? normalized.name_vi ?? normalized.name_en ?? "")
    if (normalized.name_vi == null && normalized.name == null && normalized.name_en == null) {
      normalized.name_vi = name
      normalized.name_en = name
    } else {
      if (normalized.name_vi == null) normalized.name_vi = String(normalized.name_vi ?? name)
      if (normalized.name_en == null) normalized.name_en = String(normalized.name_en ?? name)
    }
    delete normalized.name
    return normalized
  })
  const { error } = await supabase.from("units").upsert(rows as any)
  return { error }
}

export async function deleteUnit(id: string, { isDemo }: Ctx) {
  if (isDemo) { demoDelete(mock.units, id); return { error: null } }
  const { error } = await supabase.from("units").delete().eq("id", id)
  return { error }
}

export async function fetchGoodsReceipts({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: demoGoodsReceipts, error: null }
  const { data, error } = await safeSelect("goods_receipts", "*", query => orgId ? query.eq("org_id", orgId).order("created_at", { ascending: false }) : query)
  const receipts = data as any[] ?? []
  const receiptIds = receipts.map(row => row.id).filter(Boolean)
  const itemResult = receiptIds.length ? await safeSelect("goods_receipt_items", "*", query => query.in("receipt_id", receiptIds)) : { data: [], error: null }
  const itemsByReceipt = (itemResult.data as any[] ?? []).reduce((groups, item) => {
    ;(groups[item.receipt_id] ??= []).push(item)
    return groups
  }, {} as Record<string, any[]>)
  return { data: receipts.map(row => ({ ...row, items_detail: itemsByReceipt[row.id] ?? [] })), error: error ?? itemResult.error }
}

export async function fetchPurchaseReturns({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: [], error: null }
  const { data, error } = await safeSelect("purchase_returns", "*", query => orgId ? query.eq("org_id", orgId).order("created_at", { ascending: false }) : query)
  const returns = data as any[] ?? []
  const ids = returns.map(row => row.id).filter(Boolean)
  const itemResult = ids.length ? await safeSelect("purchase_return_items", "*", query => query.in("return_id", ids)) : { data: [], error: null }
  const itemsByReturn = (itemResult.data as any[] ?? []).reduce((groups, item) => {
    ;(groups[item.return_id] ??= []).push(item)
    return groups
  }, {} as Record<string, any[]>)
  return { data: returns.map(row => ({ ...row, items: itemsByReturn[row.id] ?? [] })), error: error ?? itemResult.error }
}

export async function createPurchaseReturn(payload: Record<string, any>, { isDemo }: Ctx) {
  if (isDemo) return { error: null }
  const items = (Array.isArray(payload.items) ? payload.items : []).map((item: any) => ({
    product_id: item.product_id ?? item.productId,
    qty: toNumber(item.qty ?? item.quantity),
  }))
  const { error } = await (supabase as any).rpc("create_purchase_return", {
    p_ref: String(payload.ref ?? `PR-${Date.now()}`),
    p_receipt_ref: String(payload.receipt_ref ?? payload.receiptRef ?? ""),
    p_items: items,
    p_reason: payload.reason ?? null,
    p_created_by: payload.created_by ?? payload.createdBy ?? null,
  })
  return { error }
}

export async function reversePurchaseReturn(ref: string, { isDemo }: Ctx) {
  if (isDemo) return { error: null }
  const { error } = await (supabase as any).rpc("reverse_purchase_return", { p_ref: ref, p_created_by: null })
  return { error }
}

export async function fetchProductPricing(
  {
    productId,
    supplierId,
    customerId,
    warehouseId,
    qty = 1,
  }: {
    productId: string
    supplierId?: string
    customerId?: string
    warehouseId?: string
    qty?: number
  },
  { isDemo, orgId }: Ctx,
) {
  if (isDemo) {
    const product = (mock.products as any[]).find(row => String(row.id) === String(productId))
    const imports = (mock.importRecords as any[])
      .filter(row => String(row.product_id) === String(productId))
      .filter(row => !supplierId || String(row.supplier_id) === String(supplierId))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    const latest = imports[0]
    const previous = imports[1]
    const latestCustomerQuotation = (mock.quotations as any[])
      .filter(row => !customerId || String(row.customer_id) === String(customerId))
      .filter(row => (row.items ?? []).some((item: any) => String(item.product_id) === String(productId)))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
    const latestCustomerItem = latestCustomerQuotation?.items?.find((item: any) => String(item.product_id) === String(productId))
    const referenceCost = toNumber(latest?.cost_price ?? product?.cost)
    return {
      data: {
        product_id: productId,
        product_name: product?.name ?? latest?.product_name ?? "",
        sku: product?.sku ?? "",
        unit: product?.unit ?? latest?.unit ?? null,
        list_price: toNumber(product?.price),
        costing_method: "FIFO",
        available_qty: toNumber(product?.qty),
        average_cost: referenceCost,
        estimated_cost: referenceCost,
        reference_cost: referenceCost,
        suggested_price: toNumber(product?.price) || Math.round(referenceCost * 1.2),
        latest_cost: latest ? toNumber(latest.cost_price) : null,
        previous_cost: previous ? toNumber(previous.cost_price) : null,
        cost_change_pct: previous && toNumber(previous.cost_price) > 0
          ? (toNumber(latest.cost_price) - toNumber(previous.cost_price)) * 100 / toNumber(previous.cost_price)
          : null,
        receipt_ref: latest?.receipt_id ?? null,
        receipt_date: latest?.date ?? null,
        supplier_name: latest?.supplier_name ?? null,
        receipt_qty: latest ? toNumber(latest.quantity) : null,
        receipt_unit: latest?.unit ?? null,
        batch_number: latest?.batch_number ?? null,
        manufacture_date: latest?.manufacture_date ?? null,
        expiry_date: latest?.expiry_date ?? null,
        quotation_source_ref: latest?.quotation_id ?? null,
        latest_customer_price: latestCustomerItem ? toNumber(latestCustomerItem.selling_price) : null,
        latest_customer_quotation_id: latestCustomerQuotation?.id ?? null,
        latest_customer_quotation_date: latestCustomerQuotation?.date ?? null,
      } as ProductPricing,
      error: null,
    }
  }
  if (!orgId || !productId) return { data: null, error: null }
  const { data, error } = await (supabase as any).rpc("get_product_pricing", {
    p_product_id: productId,
    p_supplier_id: supplierId || null,
    p_customer_id: customerId || null,
    p_warehouse_id: warehouseId || null,
    p_qty: Math.max(toNumber(qty, 1), 0.01),
  })
  return { data: data as ProductPricing | null, error }
}

export async function fetchLatestImport(productId: string, { isDemo, orgId }: Ctx, supplierId?: string) {
  if (isDemo) {
    const rows = (mock.importRecords as any[])
      .filter(row => String(row.product_id) === String(productId))
      .filter(row => !supplierId || String(row.supplier_id) === String(supplierId))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return { data: rows[0] ?? null, error: null }
  }
  if (!orgId || !productId) return { data: null, error: null }
  const pricingResult = await fetchProductPricing({ productId, supplierId }, { isDemo, orgId })
  const pricing = pricingResult.data
  if (!pricing?.receipt_ref) return { data: null, error: pricingResult.error }
  return {
    data: {
      receipt_id: pricing.receipt_ref,
      product_id: pricing.product_id,
      product_name: pricing.product_name,
      supplier_name: pricing.supplier_name ?? "",
      cost_price: toNumber(pricing.latest_cost),
      previous_cost: pricing.previous_cost,
      cost_change_pct: pricing.cost_change_pct,
      average_cost: pricing.average_cost,
      estimated_cost: pricing.estimated_cost,
      costing_method: pricing.costing_method,
      available_qty: pricing.available_qty,
      unit: pricing.receipt_unit ?? pricing.unit ?? "",
      quantity: toNumber(pricing.receipt_qty),
      date: pricing.receipt_date,
      quotation_id: pricing.quotation_source_ref ?? "",
      batch_number: pricing.batch_number,
      manufacture_date: pricing.manufacture_date,
      expiry_date: pricing.expiry_date,
    },
    error: pricingResult.error,
  }
}

export async function receiveGoodsReceipt(payload: { sourceRef: string; receiptRef?: string; warehouseId?: string; warehouseName: string; items: any[] }, { isDemo, orgId }: Ctx) {
  const receiptRef = payload.receiptRef ?? `GR-${payload.sourceRef}`
  if (!payload.warehouseId || !payload.warehouseName.trim()) return { error: new Error("Receiving warehouse is required") }
  if (isDemo) {
    if (demoGoodsReceipts.some((row: any) => row.ref === receiptRef)) return { error: new Error("Goods receipt already exists") }
    const receipt = demoUpsert(demoGoodsReceipts, { ref: receiptRef, po_ref: payload.sourceRef, warehouse_id: payload.warehouseId, warehouse_name: payload.warehouseName, supplier_name: payload.items[0]?.supplier_name ?? "", items: payload.items.length, status: "Completed" })
    for (const item of payload.items) {
      const product = mock.products.find((row: any) => row.id === item.product_id || row.sku === item.sku || row.id.replace(/^P0/, "P-") === item.product_id)
      if (product) {
        product.qty = Number(product.qty ?? 0) + Number(item.qty ?? 0)
        demoUpsert(demoGoodsReceiptItems, { receipt_id: receipt.id, product_id: product.id, product_name: product.name, sku: product.sku, qty: Number(item.qty ?? 0), unit_cost: Number(item.cost_price ?? item.unit_cost ?? product.cost ?? 0), unit: item.sell_unit ?? item.unit ?? product.unit, supplier_id: item.supplier_id ?? null, supplier_name: item.supplier_name ?? null, batch_number: item.batch_number ?? null, manufacture_date: item.manufacture_date ?? null, expiry_date: item.expiry_date ?? null })
        demoUpsert(demoInventoryLedger, { ref: receiptRef, movement_type: "RECEIPT", product_id: product.id, product_name: product.name, sku: product.sku, warehouse_id: payload.warehouseId, warehouse_name: payload.warehouseName, qty_in: Number(item.qty ?? 0), qty_out: 0, unit_cost: Number(item.cost_price ?? item.unit_cost ?? product.cost ?? 0), batch_number: item.batch_number ?? null, manufacture_date: item.manufacture_date ?? null, expiry_date: item.expiry_date ?? null })
      }
    }
    return { error: null }
  }
  const rpcItems = payload.items.map(item => ({
    product_id: item.product_id ?? null,
    product_name: item.product_name ?? "",
    sku: item.sku ?? "",
    qty: Number(item.qty ?? 0),
    unit_cost: Number(item.cost_price ?? item.unit_cost ?? 0),
    unit: item.sell_unit ?? item.unit ?? null,
    supplier_id: item.supplier_id ?? null,
    supplier_name: item.supplier_name ?? null,
    batch_number: item.batch_number ?? null,
    manufacture_date: item.manufacture_date || null,
    expiry_date: item.expiry_date || null,
  }))
  const { error } = await (supabase as any).rpc("receive_goods_receipt", {
    p_ref: receiptRef,
    p_po_ref: payload.sourceRef,
    p_warehouse_id: payload.warehouseId ?? null,
    p_warehouse_name: payload.warehouseName,
    p_supplier_name: payload.items[0]?.supplier_name ?? "Unknown Supplier",
    p_items: rpcItems,
  })
  return { error }
}

export async function fetchCashBook({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: [], error: null }
  const { data, error } = await safeSelect("cash_book", "*", query => orgId ? query.eq("org_id", orgId).order("created_at", { ascending: true }) : query)
  let balance = 0
  const rows = (data as any[] ?? []).map(row => {
    balance += String(row.type).toLowerCase() === "receipt" ? toNumber(row.amount) : -toNumber(row.amount)
    return { ...row, balance }
  })
  return { data: rows.reverse(), error }
}

export async function fetchFinanceTransactions({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: [], error: null }
  const { data, error } = await safeSelect("finance_transactions", "*", query => orgId ? query.eq("org_id", orgId).order("created_at", { ascending: false }) : query)
  return { data: data as any[] ?? [], error }
}

export async function fetchAuditEvents({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: [], error: null }
  const { data, error } = await safeSelect("audit_events", "*", query => orgId ? query.eq("org_id", orgId).order("created_at", { ascending: false }) : query)
  return { data: data as any[] ?? [], error }
}

export async function recordFinanceTransaction(payload: Record<string, any>, { isDemo }: Ctx) {
  if (isDemo) return { error: null }
  const { error } = await (supabase as any).rpc("record_finance_transaction", {
    p_ref: String(payload.ref ?? payload.doc_no ?? `FIN-${Date.now()}`),
    p_transaction_type: payload.transaction_type,
    p_source_ref: payload.source_ref ?? payload.sourceRef ?? null,
    p_customer_id: payload.customer_id ?? null,
    p_customer_name: payload.customer_name ?? payload.customer ?? null,
    p_supplier_id: payload.supplier_id ?? null,
    p_supplier_name: payload.supplier_name ?? payload.supplier ?? null,
    p_amount: Number(payload.amount ?? 0),
    p_method: payload.method ?? "Cash",
    p_description: payload.description ?? null,
    p_created_by: payload.created_by ?? payload.createdBy ?? "system",
  })
  return { error }
}

// --- Quotations ---
export async function fetchQuotations({ isDemo, orgId }: Ctx) {
  if (isDemo) return {
    data: (mock.quotations as any[]).map(quotation => ({
      ...quotation,
      customer_id: quotation.customer_id ?? "",
      customer_name: quotation.customer_name ?? quotation.customer ?? "",
      warehouse_id: quotation.warehouse_id ?? mock.warehouses[0]?.code ?? "",
      warehouse_name: quotation.warehouse_name ?? mock.warehouses[0]?.name ?? "",
      discount_val: quotation.discount_val ?? quotation.discount_pct ?? 0,
      discount_type: quotation.discount_type ?? "pct",
      status: quotation.status ?? "Draft",
      items: (quotation.items ?? []).map((item: any, index: number) => {
        const product = findDemoProduct(item.product_id ?? item.sku)
        const category = mock.categories.find((row: any) => row.id === item.category_id)
          ?? mock.categories.find((row: any) => [row.code, row.name_vi, row.name_en]
            .some(value => String(value).toLowerCase() === String(product?.category ?? item.category_name ?? "").toLowerCase()))
        const qty = toNumber(item.qty ?? item.quantity, 1)
        const sellingPrice = toNumber(item.selling_price ?? item.unit_price)
        return {
          ...item,
          id: item.id ?? `${quotation.id}-ITEM-${index + 1}`,
          category_id: item.category_id ?? category?.id ?? "",
          category_name: item.category_name ?? category?.name_vi ?? category?.name_en ?? product?.category ?? item.name ?? "",
          product_id: item.category_id ? null : product?.id ?? item.product_id ?? null,
          product_name: item.product_name ?? product?.name ?? item.name ?? "",
          sell_unit: item.sell_unit ?? product?.unit ?? "Piece",
          qty,
          cost_price: toNumber(item.cost_price ?? product?.cost),
          selling_price: sellingPrice,
          vat_pct: toNumber(item.vat_pct ?? quotation.tax_pct),
          total: toNumber(item.total, qty * sellingPrice),
        }
      }),
      allocations: quotation.allocations ?? [],
    })),
    error: null,
  }
  const { data, error } = await safeSelect("quotations", "*", query => orgId ? query.eq("org_id", orgId).order("date", { ascending: false }) : query)
  const quotationRows = data as any[] ?? []
  const quotationIds = quotationRows.map(row => row.id).filter(Boolean)
  const [itemsResult, allocationResult, reservationResult] = quotationIds.length
    ? await Promise.all([
        safeSelect("quotation_items", "*", query => query.in("quotation_id", quotationIds)),
        safeSelect("quotation_allocations", "*", query => query.in("quotation_id", quotationIds)),
        safeSelect("inventory_reservations", "quotation_id, quotation_allocation_id, status, qty", query => query.in("quotation_id", quotationIds)),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ]
  const itemsByQuotation = (itemsResult.data as any[] ?? []).reduce((groups, item) => {
    ;(groups[item.quotation_id] ??= []).push(item)
    return groups
  }, {} as Record<string, any[]>)
  const reservationByAllocation = new Map(
    (reservationResult.data as any[] ?? []).map(reservation => [reservation.quotation_allocation_id, reservation]),
  )
  const allocationsByQuotation = (allocationResult.data as any[] ?? []).reduce((groups, allocation) => {
    ;(groups[allocation.quotation_id] ??= []).push({
      ...allocation,
      reservation_status: reservationByAllocation.get(allocation.id)?.status ?? null,
    })
    return groups
  }, {} as Record<string, any[]>)
  return {
    data: quotationRows.map((row: any) => ({
      ...row,
      items: itemsByQuotation[row.id] ?? [],
      allocations: allocationsByQuotation[row.id] ?? [],
      customer_name: row.customer_name ?? row.customer ?? "",
      customer_id: row.customer_id ?? row.customerId ?? "",
      valid_until: row.valid_until ?? row.validUntil ?? "",
      discount_val: row.discount_val ?? row.discount ?? 0,
      total: toNumber(row.total ?? 0),
      status: row.status ?? "Draft",
    })),
    error: error ?? itemsResult.error ?? allocationResult.error ?? reservationResult.error,
  }
}

export async function fetchDashboardData({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: null, error: null }
  const [productsResult, salesResult, purchaseResult, receiptResult, ledgerResult, invoiceResult, costLayerResult] = await Promise.all([
    safeSelect("products", "*", query => orgId ? query.eq("org_id", orgId) : query),
    safeSelect("sales_orders", "*", query => orgId ? query.eq("org_id", orgId) : query),
    safeSelect("purchase_orders", "*", query => orgId ? query.eq("org_id", orgId) : query),
    safeSelect("goods_receipts", "*", query => orgId ? query.eq("org_id", orgId) : query),
    safeSelect("inventory_ledger", "*", query => orgId ? query.eq("org_id", orgId) : query),
    safeSelect("invoices", "*", query => orgId ? query.eq("org_id", orgId) : query),
    safeSelect("inventory_cost_layers", "product_id, remaining_qty, unit_cost", query => orgId ? query.eq("org_id", orgId).gt("remaining_qty", 0) : query),
  ])
  const sourceError = [productsResult, salesResult, purchaseResult, receiptResult, ledgerResult, invoiceResult, costLayerResult].find(result => result.error)?.error
  if (sourceError) return { data: null, error: sourceError }
  const products = productsResult.data as any[]
  const sales = salesResult.data as any[]
  const purchases = purchaseResult.data as any[]
  const receipts = receiptResult.data as any[]
  const ledger = ledgerResult.data as any[]
  const invoices = invoiceResult.data as any[]
  const costLayers = costLayerResult.data as any[]
  const ledgerQtyByProduct = ledger.reduce<Record<string, number>>((totals, row) => {
    if (row.product_id) totals[row.product_id] = (totals[row.product_id] ?? 0) + toNumber(row.qty_in) - toNumber(row.qty_out)
    return totals
  }, {})
  const receiptIds = receipts.map(row => row.id).filter(Boolean)
  const receiptItemsResult = receiptIds.length
    ? await safeSelect("goods_receipt_items", "*", query => query.in("receipt_id", receiptIds))
    : { data: [], error: null }
  const receiptItemsByReceipt = (receiptItemsResult.data as any[] ?? []).reduce((groups, item) => {
    ;(groups[item.receipt_id] ??= []).push(item)
    return groups
  }, {} as Record<string, any[]>)
  const today = formatDateKeyUtc7()
  const activeSales = sales.filter(row => !["cancelled", "rejected"].includes(String(row.status).toLowerCase()))
  const activePurchases = purchases.filter(row => !["cancelled", "rejected"].includes(String(row.status).toLowerCase()))
  const todaySales = activeSales.filter(row => formatDateKeyUtc7(row.date ?? row.created_at) === today)
  const todayInvoices = invoices.filter(row => formatDateKeyUtc7(row.created_at) === today && String(row.status).toLowerCase() !== "cancelled")
  const todayPurchases = activePurchases.filter(row => formatDateKeyUtc7(row.date ?? row.created_at) === today)
  const receivable = invoices.reduce((sum, row) => sum + toNumber(row.outstanding_amount ?? Math.max(0, toNumber(row.total) - toNumber(row.paid_amount))), 0)
  const payable = activePurchases.reduce((sum, row) => sum + toNumber(row.outstanding_amount ?? Math.max(0, toNumber(row.total) - toNumber(row.paid_amount))), 0)
  const productCategory = new Map(products.map(product => [String(product.id), product.category || "Other"]))
  const categoryTotals = costLayers.reduce<Record<string, number>>((groups, layer) => {
    const name = productCategory.get(String(layer.product_id)) || "Other"
    groups[name] = (groups[name] || 0) + toNumber(layer.remaining_qty) * toNumber(layer.unit_cost)
    return groups
  }, {})
  const inventoryValue = Object.values(categoryTotals).reduce<number>((sum, value) => sum + value, 0)
  const categoryColors = ["#2563eb", "#059669", "#d97706", "#dc2626", "#64748b", "#0f766e"]
  const categoryData = Object.entries(categoryTotals).map(([name, value], index) => ({ name, value, fill: categoryColors[index % categoryColors.length] }))
  const currentYear = Number(today.slice(0, 4))
  const monthTotals = Array.from({ length: 12 }, (_, index) => ({ date: new Date(currentYear, index, 1).toLocaleString("en", { month: "short" }), revenue: 0, purchase: 0, sales: 0 }))
  for (const row of activeSales) {
    const dateKey = formatDateKeyUtc7(row.date ?? row.created_at)
    const month = Number(dateKey.slice(5, 7)) - 1
    if (Number(dateKey.slice(0, 4)) === currentYear && month >= 0 && month < 12) monthTotals[month].sales += toNumber(row.total)
  }
  for (const row of invoices) {
    const dateKey = formatDateKeyUtc7(row.created_at)
    const month = Number(dateKey.slice(5, 7)) - 1
    if (Number(dateKey.slice(0, 4)) === currentYear && month >= 0 && month < 12 && String(row.status).toLowerCase() !== "cancelled") monthTotals[month].revenue += toNumber(row.total)
  }
  for (const row of activePurchases) {
    const dateKey = formatDateKeyUtc7(row.date ?? row.created_at)
    const month = Number(dateKey.slice(5, 7)) - 1
    if (Number(dateKey.slice(0, 4)) === currentYear && month >= 0 && month < 12) monthTotals[month].purchase += toNumber(row.total)
  }
  const activityRows = [
    ...receipts.map(row => {
      const items = receiptItemsByReceipt[row.id] ?? []
      const itemSummaryVi = items.length
        ? items.slice(0, 2).map((item: any) => `${item.product_name} × ${toNumber(item.qty)}`).join(", ")
        : `${toNumber(row.items)} mặt hàng`
      const itemSummaryEn = items.length
        ? items.slice(0, 2).map((item: any) => `${item.product_name} × ${toNumber(item.qty)}`).join(", ")
        : `${toNumber(row.items)} items`
      const extraVi = items.length > 2 ? ` và ${items.length - 2} mặt hàng khác` : ""
      const extraEn = items.length > 2 ? ` and ${items.length - 2} more` : ""
      const reference = row.ref || row.id
      const warehouse = row.warehouse_name || "warehouse"
      return {
        type: "purchase",
        text: `Goods receipt ${reference} completed: ${itemSummaryEn}${extraEn} at ${warehouse}`,
        textEn: `Goods receipt ${reference} completed: ${itemSummaryEn}${extraEn} at ${warehouse}`,
        textVi: `Phiếu nhập kho ${reference} đã hoàn tất: ${itemSummaryVi}${extraVi} tại ${row.warehouse_name || "kho"}`,
        time: row.created_at,
        user: row.created_by || "System",
      }
    }),
    ...activePurchases.map(row => ({ type: "purchase", text: `Purchase order ${row.ref || row.id} created`, textEn: `Purchase order ${row.ref || row.id} created`, textVi: `Đơn mua hàng ${row.ref || row.id} đã được tạo`, time: row.created_at || row.date, user: row.created_by || "System" })),
    ...activeSales.map(row => ({ type: "sales", text: `Sales order ${row.ref || row.id} created`, textEn: `Sales order ${row.ref || row.id} created`, textVi: `Đơn bán hàng ${row.ref || row.id} đã được tạo`, time: row.created_at || row.date, user: row.created_by || "System" })),
    ...ledger.map(row => {
      const movementType = String(row.movement_type || "Inventory").toUpperCase()
      const movementVi: Record<string, string> = {
        OPENING_BALANCE: "Tồn đầu kỳ",
        RECEIPT: "Nhập kho",
        SALE: "Xuất bán",
        RETURN_IN: "Hàng trả nhập lại",
        RETURN_OUT: "Trả hàng nhà cung cấp",
        ADJUSTMENT_IN: "Điều chỉnh tăng",
        ADJUSTMENT_OUT: "Điều chỉnh giảm",
        TRANSFER_IN: "Nhập chuyển kho",
        TRANSFER_OUT: "Xuất chuyển kho",
      }
      const product = row.product_name || row.sku
      const quantity = toNumber(row.qty_in) - toNumber(row.qty_out)
      return {
        type: "inventory",
        text: `${row.movement_type || "Inventory"}: ${product} (${quantity})`,
        textEn: `${row.movement_type || "Inventory"}: ${product} (${quantity})`,
        textVi: `${movementVi[movementType] || "Biến động tồn kho"}: ${product} (${quantity})`,
        time: row.created_at,
        user: row.created_by || "System",
      }
    }),
  ].sort((a, b) => new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime()).slice(0, 6)
  const lowStock = products.filter(row => toNumber(ledgerQtyByProduct[row.id] ?? row.qty) <= toNumber(row.min_qty ?? row.min_stock ?? 0)).map(row => ({ sku: row.sku, name: row.name, qty: toNumber(ledgerQtyByProduct[row.id] ?? row.qty), min: toNumber(row.min_qty ?? row.min_stock ?? 0), warehouse: "All warehouses" }))
  return { data: {
    kpis: [
      { label: "Doanh thu hôm nay", value: `₫${formatVnd(todayInvoices.reduce((sum, row) => sum + toNumber(row.total), 0))}`, change: "", trend: "up", sub: "theo hóa đơn" },
      { label: "Đơn bán hôm nay", value: String(todaySales.length), change: "", trend: "up", sub: "đơn bán hàng" },
      { label: "Mua hàng hôm nay", value: `₫${formatVnd(todayPurchases.reduce((sum, row) => sum + toNumber(row.total), 0))}`, change: "", trend: "up", sub: "theo dữ liệu thật" },
      { label: "Giá trị tồn kho", value: `₫${formatVnd(inventoryValue)}`, change: "", trend: "up", sub: "tổng giá trị kho" },
      { label: "Phải thu", value: `₫${formatVnd(receivable)}`, change: "", trend: "up", sub: "còn phải thu" },
      { label: "Phải trả", value: `₫${formatVnd(payable)}`, change: "", trend: "up", sub: "còn phải trả" },
    ],
    revenueData: monthTotals.map(row => ({ ...row, revenue: row.revenue / 1000000, purchase: row.purchase / 1000000, sales: row.sales / 1000000 })),
    inventoryDonutData: categoryData.length ? categoryData.map(row => ({ ...row, value: inventoryValue ? Math.round(Number(row.value) / inventoryValue * 100) : 0 })) : [],
    lowStockItems: lowStock,
    recentActivities: activityRows,
    year: currentYear,
  }, error: receiptItemsResult.error }
}

export async function upsertQuotation(payload: Record<string, unknown>, { isDemo, orgId }: Ctx) {
  if (isDemo) {
    const row = demoUpsert(mock.quotations, payload as Record<string, any>) as any
    if (Array.isArray(payload.items)) row.items = payload.items
    return { error: null }
  }
  const source = payload as Record<string, any>
  if (!orgId) return { error: new Error("Authenticated organization is required") }
  if (source.id && !Object.prototype.hasOwnProperty.call(source, "items")) {
    const { error } = await (supabase as any).rpc("set_quotation_status", {
      p_id: source.id,
      p_status: source.status,
    })
    return { error }
  }
  const items = (Array.isArray(source.items) ? source.items : []).map((item: Record<string, any>) => ({
      category_id: item.category_id ?? null,
      category_name: item.category_name ?? item.categoryName ?? "",
      product_id: item.product_id ?? null,
      product_name: item.product_name ?? item.productName ?? "",
      supplier_id: item.supplier_id ?? null,
      supplier_name: item.supplier_name ?? item.supplierName ?? null,
      import_unit: item.import_unit ?? null,
      sell_unit: item.sell_unit ?? null,
      qty: item.qty ?? 1,
      cost_price: item.cost_price ?? 0,
      profit_pct: item.profit_pct ?? 0,
      selling_price: item.selling_price ?? 0,
      vat_pct: item.vat_pct ?? 0,
      total: item.total ?? 0,
  }))
  const { error } = await (supabase as any).rpc("save_quotation", {
    p_id: source.id ?? null,
    p_customer_id: source.customer_id ?? null,
    p_customer_name: source.customer_name ?? source.customer ?? source.customerName ?? "",
    p_warehouse_id: source.warehouse_id ?? null,
    p_date: source.date ?? null,
    p_valid_until: source.valid_until || null,
    p_status: source.status ?? "Draft",
    p_discount_val: Number(source.discount_val ?? 0),
    p_discount_type: source.discount_type ?? "pct",
    p_notes: source.notes ?? null,
    p_items: items,
    p_created_by: source.created_by ?? null,
  })
  return { error }
}

export async function fetchQuotationAllocationContext(
  quotationId: string,
  { isDemo, orgId }: Ctx,
) {
  if (isDemo) {
    const quotation = (mock.quotations as any[]).find(row => String(row.id) === String(quotationId))
    if (!quotation) return { data: null, error: new Error("Quotation was not found") }
    const products = (await fetchProducts({ isDemo, orgId })).data as any[]
    const items = (quotation.items ?? []).map((item: any, index: number) => {
      const product = products.find(row => normalizeDemoId(row.id) === normalizeDemoId(item.product_id))
      const category = mock.categories.find((row: any) => row.id === item.category_id)
        ?? mock.categories.find((row: any) => [row.code, row.name_vi, row.name_en]
          .some(value => String(value).toLowerCase() === String(product?.category ?? item.category_name ?? "").toLowerCase()))
      return {
        id: item.id ?? `${quotation.id}-ITEM-${index + 1}`,
        category_id: item.category_id ?? category?.id ?? "",
        category_name: item.category_name ?? category?.name_vi ?? category?.name_en ?? product?.category ?? "",
        qty: toNumber(item.qty ?? item.quantity, 1),
        sell_unit: item.sell_unit ?? product?.unit ?? "Piece",
        selling_price: toNumber(item.selling_price ?? item.unit_price),
        vat_pct: toNumber(item.vat_pct),
      }
    })
    return {
      data: {
        quotation: {
          id: quotation.id,
          status: quotation.status,
          customer_id: quotation.customer_id,
          customer_name: quotation.customer_name,
          warehouse_id: quotation.warehouse_id ?? "DEMO-WAREHOUSE",
          warehouse_name: quotation.warehouse_name ?? "Demo Warehouse",
          total: toNumber(quotation.total),
        },
        items,
        products: products.map(product => ({
          id: product.id,
          category_id: product.category_id,
          sku: product.sku,
          name: product.name,
          unit: product.unit,
          price: toNumber(product.price),
          reference_cost: toNumber(product.cost),
          track_batch: Boolean(product.track_batch),
          on_hand: toNumber(product.qty),
          reserved: toNumber(product.reserved),
          available: toNumber(product.available ?? product.qty),
          average_cost: toNumber(product.average_cost ?? product.cost),
        })),
        allocations: quotation.allocations ?? [],
      } as QuotationAllocationContext,
      error: null,
    }
  }
  if (!orgId) return { data: null, error: new Error("Authenticated organization is required") }
  const { data, error } = await (supabase as any).rpc("get_quotation_allocation_context_v2", {
    p_quotation_id: quotationId,
  })
  return { data: data as QuotationAllocationContext | null, error }
}

export async function convertQuotationAllocations(
  quotationId: string,
  allocations: Array<Record<string, any>>,
  { isDemo }: Ctx,
) {
  if (isDemo) {
    const quotation = (mock.quotations as any[]).find(row => String(row.id) === String(quotationId))
    if (quotation) {
      const normalizedAllocations = allocations.map((allocation, index) => {
        let product = findDemoProduct(allocation.product_id)
        if (!product && allocation.new_product) {
          const category = mock.categories.find((row: any) => row.id === allocation.category_id)
          product = {
            id: `P-DEMO-${Date.now()}-${index}`,
            sku: allocation.new_product.sku,
            barcode: allocation.new_product.barcode ?? "",
            name: allocation.new_product.name,
            category: category?.name_en ?? category?.code ?? "",
            brand: allocation.new_product.brand ?? "",
            unit: allocation.new_product.unit,
            cost: toNumber(allocation.unit_cost),
            price: toNumber(allocation.new_product.price),
            qty: 0,
            status: "Active",
            track_batch: Boolean(allocation.new_product.track_batch),
          }
          ;(mock.products as any[]).push(product)
        }
        if (product && allocation.source_type === "NEW_STOCK") {
          product.qty = toNumber(product.qty) + toNumber(allocation.qty)
          ;(mock.importRecords as any[]).push({
            id: `IMP-DEMO-${Date.now()}-${index}`,
            receipt_id: `ALLOC-IN-${quotationId}`,
            product_id: product.id,
            product_name: product.name,
            supplier_id: allocation.supplier_id,
            supplier_name: "Allocation supplier",
            cost_price: toNumber(allocation.unit_cost),
            unit: product.unit,
            quantity: toNumber(allocation.qty),
            date: formatDateKeyUtc7(),
            quotation_id: quotationId,
            batch_number: allocation.batch_number ?? null,
            manufacture_date: allocation.manufacture_date ?? null,
            expiry_date: allocation.expiry_date ?? null,
          })
        }
        return {
          ...allocation,
          id: `ALLOC-DEMO-${Date.now()}-${index}`,
          product_id: product?.id ?? allocation.product_id,
          reservation_status: "ACTIVE",
        }
      })
      quotation.status = "Awaiting Delivery"
      quotation.allocations = normalizedAllocations
    }
    return { error: null }
  }
  const { error } = await (supabase as any).rpc("convert_quotation_allocations", {
    p_quotation_id: quotationId,
    p_allocations: allocations,
  })
  return { error }
}

export async function deliverQuotationAllocation(
  quotationId: string,
  ref: string,
  { isDemo }: Ctx,
) {
  if (isDemo) {
    const quotation = (mock.quotations as any[]).find(row => String(row.id) === String(quotationId))
    if (quotation) {
      for (const allocation of quotation.allocations ?? []) {
        const product = findDemoProduct(allocation.product_id)
        if (product) product.qty = toNumber(product.qty) - toNumber(allocation.qty)
        allocation.reservation_status = "CONSUMED"
      }
      quotation.status = "Delivered"
    }
    return { error: null }
  }
  const { error } = await (supabase as any).rpc("deliver_quotation", {
    p_quotation_id: quotationId,
    p_ref: ref,
  })
  return { error }
}

export async function cancelQuotationAllocation(quotationId: string, { isDemo }: Ctx) {
  if (isDemo) {
    const quotation = (mock.quotations as any[]).find(row => String(row.id) === String(quotationId))
    if (quotation) {
      for (const allocation of quotation.allocations ?? []) {
        if (String(allocation.reservation_status).toUpperCase() === "ACTIVE") {
          allocation.reservation_status = "RELEASED"
        }
      }
      quotation.status = "Cancelled"
    }
    return { error: null }
  }
  const { error } = await (supabase as any).rpc("cancel_quotation_conversion", {
    p_quotation_id: quotationId,
  })
  return { error }
}

export async function deleteQuotation(id: string, { isDemo }: Ctx) {
  if (isDemo) return { error: null }
  const { error } = await (supabase as any).rpc("delete_draft_document", { p_entity: "quotation", p_id: id })
  return { error }
}
