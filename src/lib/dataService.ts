/**
 * Data service — returns mock data in demo mode, Supabase data in live mode.
 * Each function accepts { isDemo, orgId } and returns typed results.
 */
import { supabase } from "./supabase"
import * as mock from "../data/mockData"
import { defaultCompanySettings, type CompanySettings } from "./companySettings"

type Ctx = { isDemo: boolean; orgId?: string }

export async function fetchCompanySettings({ isDemo, orgId }: Ctx) {
  if (isDemo || !orgId) return { data: defaultCompanySettings, error: null }
  const { data, error } = await safeSelect("company_settings", "*", query => query.eq("org_id", orgId).maybeSingle())
  const row = (data as any[])[0] ?? data as any
  return { data: row ? { ...defaultCompanySettings, ...row, taxId: row.tax_id ?? defaultCompanySettings.taxId } : defaultCompanySettings, error }
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
    updated_at: new Date().toISOString(),
  })
  return { error }
}

function toNumber(value: unknown, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function formatVnd(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value)
}

function isSchemaMissingError(error: any) {
  const msg = String(error?.message ?? "")
  return msg.includes("Could not find the table") || msg.includes("Could not find the column") || msg.includes("schema cache")
}

function normalizeNameField(row: Record<string, any>) {
  return row.name ?? row.name_vi ?? row.name_en ?? row.title ?? ""
}

function normalizeStatusValue(value: unknown) {
  if (value == null || value === "") return "Active"
  return String(value)
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
      if (isSchemaMissingError(error)) return { data: [], error: null }
      return { data: [], error }
    }
    return { data: data ?? [], error: null }
  } catch (error: any) {
    if (isSchemaMissingError(error)) return { data: [], error: null }
    return { data: [], error }
  }
}

// ─── Products ────────────────────────────────────────────────
export async function fetchProducts({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: mock.products, error: null }
  const { data, error } = await safeSelect("products", "*", query => orgId ? query.eq("org_id", orgId) : query)
  return { data: data as any[] ?? [], error }
}

export async function upsertProduct(payload: Record<string, unknown>, { isDemo, orgId }: Ctx) {
  if (isDemo) { demoUpsert(mock.products, { ...payload, cost: payload.cost ?? payload.purchase_price ?? 0, price: payload.price ?? payload.selling_price ?? 0 }); return { error: null } }
  const { error } = await supabase.from("products").upsert([{ ...payload, org_id: orgId }] as any)
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
  return {
    data: (data as any[] ?? []).map((row: any) => ({
      ...row,
      credit_limit: row.credit_limit ?? row.creditLimit ?? 0,
      tax_code: row.tax_code ?? row.taxCode ?? "",
      name: row.name ?? row.customer_name ?? "",
    })),
    error,
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
  return { data: data as any[] ?? [], error }
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
  return {
    data: (data as any[] ?? []).map((row: any) => ({
      ...row,
      location: row.location ?? row.address ?? "",
      address: row.address ?? row.location ?? "",
      stock_value: toNumber(row.stock_value ?? row.stockValue ?? 0),
      stockValue: toNumber(row.stock_value ?? row.stockValue ?? 0),
    })),
    error,
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
  return { data: rows.map((row: any) => ({
    ...row,
    items: itemsByPo[row.id] ?? [],
    createdBy: row.created_by ?? row.createdBy ?? "",
    supplier: row.supplier_name ?? row.supplier ?? "",
    warehouse: row.warehouse_name ?? row.warehouse ?? "",
  })), error }
}

export async function upsertPurchaseOrder(payload: Record<string, unknown>, { isDemo, orgId }: Ctx) {
  const normalized: Record<string, any> = {
    ...payload,
    ref: payload.ref ?? `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Date.now()}`,
    supplier_name: payload.supplier_name ?? payload.supplier ?? "Unknown Supplier",
    warehouse_name: payload.warehouse_name ?? payload.warehouse ?? "Unassigned",
    created_by: payload.created_by ?? payload.createdBy ?? "system",
    org_id: orgId,
  }
  delete normalized.supplier
  delete normalized.warehouse
  delete normalized.createdBy
  if (isDemo) { demoUpsert(mock.purchaseOrders, { ...normalized, supplier: normalized.supplier_name, warehouse: normalized.warehouse_name, createdBy: normalized.created_by, date: normalized.date ?? new Date().toISOString().slice(0, 10), items: payload.items ?? [] }); return { error: null } }
  const purchaseOrderResult = normalized.id
    ? await (supabase as any).from("purchase_orders").update(normalized).eq("id", normalized.id).eq("org_id", orgId)
    : await (supabase as any).from("purchase_orders").insert([normalized]).select("id").single()
  const error = purchaseOrderResult.error
  const purchaseOrderId = normalized.id ?? purchaseOrderResult.data?.id
  if (!error && purchaseOrderId && Array.isArray(payload.items)) {
    const deleteResult = await (supabase as any).from("purchase_order_items").delete().eq("po_id", purchaseOrderId)
    if (deleteResult.error) return { error: deleteResult.error }
    const itemRows = payload.items.map((item: any) => ({ po_id: purchaseOrderId, product_id: item.product_id ?? null, product_name: item.product_name ?? item.product ?? "", sku: item.sku ?? null, qty: Number(item.qty ?? 1), unit_cost: Number(item.unit_cost ?? item.price ?? 0) }))
    if (itemRows.length) {
      const itemResult = await (supabase as any).from("purchase_order_items").insert(itemRows)
      if (itemResult.error) return { error: itemResult.error }
    }
  }
  return { error }
}

export async function deletePurchaseOrder(id: string, { isDemo }: Ctx) {
  if (isDemo) { demoDelete(mock.purchaseOrders, id); return { error: null } }
  const { error } = await supabase.from("purchase_orders").delete().eq("id", id)
  return { error }
}

// ─── Sales Orders ────────────────────────────────────────────
export async function fetchSalesOrders({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: mock.salesOrders, error: null }
  const { data, error } = await safeSelect("sales_orders", "*", query => orgId ? query.eq("org_id", orgId).order("created_at", { ascending: false }) : query)
  return { data: data as any[] ?? [], error }
}

export async function upsertSalesOrder(payload: Record<string, unknown>, { isDemo, orgId }: Ctx) {
  if (isDemo) return { error: null }
  const { error } = await supabase.from("sales_orders").upsert([{ ...payload, org_id: orgId }] as any)
  return { error }
}

export async function deleteSalesOrder(id: string, { isDemo }: Ctx) {
  if (isDemo) return { error: null }
  const { error } = await supabase.from("sales_orders").delete().eq("id", id)
  return { error }
}

// ─── Inventory Balance ───────────────────────────────────────
export async function fetchInventoryBalance({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: mock.inventoryBalance, error: null }
  const { data, error } = await safeSelect("inventory_balance", "*", query => orgId ? query.eq("org_id", orgId).order("product_name") : query)
  return {
    data: (data as any[] ?? []).map((row: any) => ({
      ...row,
      unit_cost: toNumber(row.unit_cost ?? row.avgCost ?? 0),
      avgCost: toNumber(row.unit_cost ?? row.avgCost ?? 0),
      qty: toNumber(row.qty ?? 0),
      value: toNumber(row.value ?? (row.qty ?? 0) * (row.unit_cost ?? row.avgCost ?? 0)),
    })),
    error,
  }
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
  return {
    data: (data as any[] ?? []).map((row: any) => ({
      ...row,
      name: row.name_vi ?? row.name_en ?? row.name ?? "",
      users: 0,
      isSystem: Boolean(row.is_system),
      desc: row.description ?? "",
    })),
    error,
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
  const { data, error } = await safeSelect("inventory_adjustments", "*", query => orgId ? query.eq("org_id", orgId) : query)
  return { data: (data as any[] ?? []).map((row: any) => ({
    ...row,
    doc_no: row.doc_no ?? row.ref ?? "",
    warehouse: row.warehouse_name ?? row.warehouse ?? "",
    status: row.status ?? "Draft",
  })), error }
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
  return { data: data as any[] ?? [], error }
}

export async function fetchLatestImport(productId: string, { isDemo, orgId }: Ctx) {
  if (isDemo) {
    const rows = (mock.importRecords as any[])
      .filter(row => String(row.product_id) === String(productId))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return { data: rows[0] ?? null, error: null }
  }
  if (!orgId || !productId) return { data: null, error: null }

  const itemResult = await safeSelect("goods_receipt_items", "*", query =>
    query.eq("product_id", productId).order("created_at", { ascending: false }).limit(1),
  )
  const item = (itemResult.data as any[] ?? [])[0]
  if (!item) return { data: null, error: itemResult.error }

  const receiptResult = await safeSelect("goods_receipts", "*", query =>
    query.eq("id", item.receipt_id).eq("org_id", orgId).maybeSingle(),
  )
  const receipt = (receiptResult.data as any[] ?? [])[0] ?? receiptResult.data as any
  if (!receipt) return { data: null, error: receiptResult.error }
  const quotationResult = receipt.po_ref
    ? await safeSelect("quotations", "id, customer_id, customer_name", query => query.eq("id", receipt.po_ref).eq("org_id", orgId).maybeSingle())
    : { data: null, error: null }
  const quotation = (quotationResult.data as any[] ?? [])[0] ?? quotationResult.data as any

  return {
    data: {
      id: item.id,
      receipt_id: receipt.ref ?? receipt.id,
      product_id: item.product_id,
      product_name: item.product_name,
      supplier_name: receipt.supplier_name ?? "",
      cost_price: toNumber(item.unit_cost),
      unit: item.unit ?? "",
      quantity: toNumber(item.qty),
      date: receipt.created_at ?? item.created_at,
      quotation_id: receipt.po_ref ?? "",
      customer_id: quotation?.customer_id ?? "",
      customer_name: quotation?.customer_name ?? "",
    },
    error: receiptResult.error,
  }
}

export async function upsertGoodsReceipt(payload: Record<string, unknown>, { isDemo, orgId }: Ctx) {
  if (isDemo) { demoUpsert(demoGoodsReceipts, payload); return { error: null } }
  const { error } = await supabase.from("goods_receipts").upsert([{ ...payload, org_id: orgId }] as any)
  return { error }
}

export async function receiveQuotation(payload: { quotationId: string; warehouseId?: string; warehouseName: string; items: any[] }, { isDemo, orgId }: Ctx) {
  const receiptRef = `GR-${payload.quotationId}`
  if (isDemo) {
    if (demoGoodsReceipts.some((row: any) => row.ref === receiptRef)) return { error: new Error("Quotation has already been received") }
    const receipt = demoUpsert(demoGoodsReceipts, { ref: receiptRef, po_ref: payload.quotationId, warehouse_id: payload.warehouseId, warehouse_name: payload.warehouseName, supplier_name: payload.items[0]?.supplier_name ?? "", items: payload.items.length, status: "Completed" })
    for (const item of payload.items) {
      const product = mock.products.find((row: any) => row.id === item.product_id || row.sku === item.sku || row.id.replace(/^P0/, "P-") === item.product_id)
      if (product) {
        product.qty = Number(product.qty ?? 0) + Number(item.qty ?? 0)
        demoUpsert(demoGoodsReceiptItems, { receipt_id: receipt.id, product_id: product.id, product_name: product.name, sku: product.sku, qty: Number(item.qty ?? 0), unit_cost: Number(item.cost_price ?? product.cost ?? 0), unit: item.sell_unit ?? product.unit })
        demoUpsert(demoInventoryLedger, { ref: receiptRef, movement_type: "RECEIPT", product_id: product.id, product_name: product.name, sku: product.sku, warehouse_id: payload.warehouseId, warehouse_name: payload.warehouseName, qty_in: Number(item.qty ?? 0), qty_out: 0, unit_cost: Number(item.cost_price ?? product.cost ?? 0) })
      }
    }
    return { error: null }
  }
  const existing = await safeSelect("goods_receipts", "id", query => query.eq("ref", receiptRef).eq("org_id", orgId))
  if ((existing.data as any[]).length) return { error: new Error("Quotation has already been received") }
  const receiptResult = await (supabase as any).from("goods_receipts").insert([{
    ref: receiptRef,
    po_ref: payload.quotationId,
    warehouse_id: payload.warehouseId ?? null,
    warehouse_name: payload.warehouseName,
    supplier_name: payload.items[0]?.supplier_name ?? "Unknown Supplier",
    items: payload.items.length,
    status: "Completed",
    org_id: orgId,
  }]).select("id").single()
  if (receiptResult.error) return { error: receiptResult.error }
  for (const item of payload.items) {
    if (!item.product_id) continue
    const productQuery = (supabase as any).from("products").select("id, name, sku, qty, cost").eq("org_id", orgId)
    const productResult = await (item.product_id ? productQuery.eq("id", item.product_id) : productQuery.eq("sku", item.sku)).maybeSingle()
    if (productResult.error || !productResult.data) continue
    const product = productResult.data as any
    const quantity = Number(item.qty ?? 0)
    const newQty = Number(product.qty ?? 0) + quantity
    const productUpdate = await (supabase as any).from("products").update({ qty: newQty, updated_at: new Date().toISOString() }).eq("id", product.id).eq("org_id", orgId)
    if (productUpdate.error) return { error: productUpdate.error }
    const existingBalance = await (supabase as any).from("inventory_balance").select("id, qty").eq("org_id", orgId).eq("sku", product.sku).eq("warehouse_id", payload.warehouseId ?? null).maybeSingle()
    const balanceResult = existingBalance.data?.id
      ? await (supabase as any).from("inventory_balance").update({ qty: Number(existingBalance.data.qty ?? 0) + quantity, unit_cost: Number(item.cost_price ?? product.cost ?? 0), updated_at: new Date().toISOString() }).eq("id", existingBalance.data.id).eq("org_id", orgId)
      : await (supabase as any).from("inventory_balance").insert([{
      org_id: orgId,
      product_id: product.id,
      product_name: product.name,
      sku: product.sku,
      warehouse_id: payload.warehouseId ?? null,
      warehouse_name: payload.warehouseName,
      qty: quantity,
      unit_cost: Number(item.cost_price ?? product.cost ?? 0),
      }])
    if (balanceResult.error) return { error: balanceResult.error }
    const receiptItemResult = await (supabase as any).from("goods_receipt_items").insert([{ receipt_id: receiptResult.data.id, product_id: product.id, product_name: product.name, sku: product.sku, qty: quantity, unit_cost: Number(item.cost_price ?? product.cost ?? 0), unit: item.sell_unit ?? null }])
    if (receiptItemResult.error) return { error: receiptItemResult.error }
    const ledgerResult = await (supabase as any).from("inventory_ledger").insert([{ org_id: orgId, ref: receiptRef, movement_type: "RECEIPT", product_id: product.id, product_name: product.name, sku: product.sku, warehouse_id: payload.warehouseId ?? null, warehouse_name: payload.warehouseName, qty_in: quantity, qty_out: 0, unit_cost: Number(item.cost_price ?? product.cost ?? 0) }])
    if (ledgerResult.error) return { error: ledgerResult.error }
  }
  return { error: null }
}

export async function deleteGoodsReceipt(id: string, { isDemo }: Ctx) {
  if (isDemo) { demoDelete(demoGoodsReceipts, id); return { error: null } }
  const { error } = await supabase.from("goods_receipts").delete().eq("ref", id)
  return { error }
}

export async function fetchCashBook({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: [], error: null }
  const { data, error } = await safeSelect("cash_book", "*", query => orgId ? query.eq("org_id", orgId).order("created_at", { ascending: false }) : query)
  return { data: data as any[] ?? [], error }
}

export async function upsertCashBook(payload: Record<string, unknown>, { isDemo, orgId }: Ctx) {
  if (isDemo) return { error: null }
  const { error } = await supabase.from("cash_book").upsert([{ ...payload, org_id: orgId }] as any)
  return { error }
}

export async function deleteCashBook(id: string, { isDemo }: Ctx) {
  if (isDemo) return { error: null }
  const { error } = await supabase.from("cash_book").delete().eq("ref", id)
  return { error }
}

// --- Quotations ---
export async function fetchQuotations({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: mock.quotations, error: null }
  const { data, error } = await safeSelect("quotations", "*", query => orgId ? query.eq("org_id", orgId).order("date", { ascending: false }) : query)
  const quotationRows = data as any[] ?? []
  const quotationIds = quotationRows.map(row => row.id).filter(Boolean)
  const itemsResult = quotationIds.length
    ? await safeSelect("quotation_items", "*", query => query.in("quotation_id", quotationIds))
    : { data: [], error: null }
  const itemsByQuotation = (itemsResult.data as any[] ?? []).reduce((groups, item) => {
    ;(groups[item.quotation_id] ??= []).push(item)
    return groups
  }, {} as Record<string, any[]>)
  return {
    data: quotationRows.map((row: any) => ({
      ...row,
      items: itemsByQuotation[row.id] ?? [],
      customer_name: row.customer_name ?? row.customer ?? "",
      customer_id: row.customer_id ?? row.customerId ?? "",
      valid_until: row.valid_until ?? row.validUntil ?? "",
      discount_val: row.discount_val ?? row.discount ?? 0,
      total: toNumber(row.total ?? 0),
      status: row.status ?? "Draft",
    })),
    error,
  }
}

export async function fetchDashboardData({ isDemo, orgId }: Ctx) {
  if (isDemo) return null
  const [productsResult, inventoryResult, salesResult, purchaseResult, receiptResult, ledgerResult] = await Promise.all([
    safeSelect("products", "*", query => orgId ? query.eq("org_id", orgId) : query),
    safeSelect("inventory_balance", "*", query => orgId ? query.eq("org_id", orgId) : query),
    safeSelect("sales_orders", "*", query => orgId ? query.eq("org_id", orgId) : query),
    safeSelect("purchase_orders", "*", query => orgId ? query.eq("org_id", orgId) : query),
    safeSelect("goods_receipts", "*", query => orgId ? query.eq("org_id", orgId) : query),
    safeSelect("inventory_ledger", "*", query => orgId ? query.eq("org_id", orgId) : query),
  ])
  const products = productsResult.data as any[]
  const inventory = inventoryResult.data as any[]
  const sales = salesResult.data as any[]
  const purchases = purchaseResult.data as any[]
  const receipts = receiptResult.data as any[]
  const ledger = ledgerResult.data as any[]
  const receiptIds = receipts.map(row => row.id).filter(Boolean)
  const receiptItemsResult = receiptIds.length
    ? await safeSelect("goods_receipt_items", "*", query => query.in("receipt_id", receiptIds))
    : { data: [], error: null }
  const receiptItemsByReceipt = (receiptItemsResult.data as any[] ?? []).reduce((groups, item) => {
    ;(groups[item.receipt_id] ??= []).push(item)
    return groups
  }, {} as Record<string, any[]>)
  const today = new Date().toISOString().slice(0, 10)
  const activeSales = sales.filter(row => !["cancelled", "rejected"].includes(String(row.status).toLowerCase()))
  const activePurchases = purchases.filter(row => !["cancelled", "rejected"].includes(String(row.status).toLowerCase()))
  const todaySales = activeSales.filter(row => String(row.date ?? row.created_at ?? "").slice(0, 10) === today)
  const todayPurchases = activePurchases.filter(row => String(row.date ?? row.created_at ?? "").slice(0, 10) === today)
  const inventoryValue = inventory.length
    ? inventory.reduce((sum, row) => sum + toNumber(row.value ?? row.qty * row.unit_cost), 0)
    : products.reduce((sum, row) => sum + toNumber(row.qty) * toNumber(row.cost), 0)
  const categoryTotals = products.reduce((groups, product) => {
    const name = product.category || "Other"
    groups[name] = (groups[name] || 0) + toNumber(product.qty) * toNumber(product.cost)
    return groups
  }, {} as Record<string, number>)
  const categoryColors = ["#2563eb", "#059669", "#d97706", "#dc2626", "#64748b", "#0f766e"]
  const categoryData = Object.entries(categoryTotals).map(([name, value], index) => ({ name, value, fill: categoryColors[index % categoryColors.length] }))
  const monthTotals = Array.from({ length: 12 }, (_, index) => ({ date: new Date(2026, index, 1).toLocaleString("en", { month: "short" }), revenue: 0, purchase: 0, sales: 0 }))
  for (const row of activeSales) {
    const month = new Date(row.date ?? row.created_at).getMonth()
    if (month >= 0 && month < 12) { monthTotals[month].revenue += toNumber(row.total); monthTotals[month].sales += toNumber(row.total) }
  }
  for (const row of activePurchases) {
    const month = new Date(row.date ?? row.created_at).getMonth()
    if (month >= 0 && month < 12) monthTotals[month].purchase += toNumber(row.total)
  }
  const activityRows = [
    ...receipts.map(row => {
      const items = receiptItemsByReceipt[row.id] ?? []
      const itemSummary = items.length
        ? items.slice(0, 2).map((item: any) => `${item.product_name} x${toNumber(item.qty)}`).join(", ")
        : `${toNumber(row.items)} items`
      const extra = items.length > 2 ? ` +${items.length - 2} more` : ""
      return {
        type: "purchase",
        text: `Goods receipt ${row.ref || row.id} completed: ${itemSummary}${extra} at ${row.warehouse_name || "warehouse"}`,
        time: row.created_at,
        user: row.created_by || "System",
      }
    }),
    ...activePurchases.map(row => ({ type: "purchase", text: `Purchase order ${row.ref || row.id} created`, time: row.created_at || row.date, user: row.created_by || "System" })),
    ...activeSales.map(row => ({ type: "sales", text: `Sales order ${row.ref || row.id} created`, time: row.created_at || row.date, user: row.created_by || "System" })),
    ...ledger.map(row => ({ type: "inventory", text: `${row.movement_type || "Inventory"}: ${row.product_name || row.sku} (${toNumber(row.qty_in) - toNumber(row.qty_out)})`, time: row.created_at, user: row.created_by || "System" })),
  ].sort((a, b) => new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime()).slice(0, 6)
  const lowStock = products.filter(row => toNumber(row.qty) <= toNumber(row.min_qty ?? row.min_stock ?? 0)).map(row => ({ sku: row.sku, name: row.name, qty: toNumber(row.qty), min: toNumber(row.min_qty ?? row.min_stock ?? 0), warehouse: "All warehouses" }))
  return {
    kpis: [
      { label: "Doanh thu hôm nay", value: `₫${formatVnd(todaySales.reduce((sum, row) => sum + toNumber(row.total), 0))}`, change: "", trend: "up", sub: "theo dữ liệu thật" },
      { label: "Đơn bán hôm nay", value: String(todaySales.length), change: "", trend: "up", sub: "đơn bán hàng" },
      { label: "Mua hàng hôm nay", value: `₫${formatVnd(todayPurchases.reduce((sum, row) => sum + toNumber(row.total), 0))}`, change: "", trend: "up", sub: "theo dữ liệu thật" },
      { label: "Giá trị tồn kho", value: `₫${formatVnd(inventoryValue)}`, change: "", trend: "up", sub: "tổng giá trị kho" },
      { label: "Phải thu", value: "₫0", change: "", trend: "up", sub: "chưa có dữ liệu công nợ" },
      { label: "Phải trả", value: "₫0", change: "", trend: "up", sub: "chưa có dữ liệu công nợ" },
    ],
    revenueData: monthTotals.map(row => ({ ...row, revenue: row.revenue / 1000000, purchase: row.purchase / 1000000, sales: row.sales / 1000000 })),
    inventoryDonutData: categoryData.length ? categoryData.map(row => ({ ...row, value: inventoryValue ? Math.round(Number(row.value) / inventoryValue * 100) : 0 })) : [],
    lowStockItems: lowStock,
    recentActivities: activityRows,
  }
}

export async function upsertQuotation(payload: Record<string, unknown>, { isDemo, orgId }: Ctx) {
  if (isDemo) {
    const row = demoUpsert(mock.quotations, payload as Record<string, any>) as any
    if (Array.isArray(payload.items)) row.items = payload.items
    return { error: null }
  }
  const hasItems = Object.prototype.hasOwnProperty.call(payload, "items")
  const source = payload as Record<string, any>
  const row = {
    ...(source.id ? { id: source.id } : {}),
    ...(source.customer_id !== undefined ? { customer_id: source.customer_id } : {}),
    ...(source.customer_name !== undefined
      ? { customer_name: source.customer_name ?? "" }
      : !source.id
        ? { customer_name: source.customer ?? source.customerName ?? "" }
        : {}),
    ...(source.date !== undefined ? { date: source.date } : {}),
    ...(source.valid_until !== undefined ? { valid_until: source.valid_until } : {}),
    ...(source.status !== undefined ? { status: source.status } : {}),
    ...(source.discount_val !== undefined ? { discount_val: source.discount_val } : {}),
    ...(source.discount_type !== undefined ? { discount_type: source.discount_type } : {}),
    ...(source.notes !== undefined ? { notes: source.notes } : {}),
    ...(source.total !== undefined ? { total: source.total } : {}),
    ...(source.created_by !== undefined ? { created_by: source.created_by } : {}),
    org_id: orgId,
  }
    const quotationQuery = (supabase as any).from("quotations")
  const quotationResult = row.id
    ? await quotationQuery.update(row).eq("id", row.id).eq("org_id", orgId)
    : await quotationQuery.insert([row]).select("id").single()
  if (quotationResult.error) return { error: quotationResult.error }

  const quotationId = row.id ?? quotationResult.data?.id
  if (hasItems && quotationId) {
    const { error: deleteItemsError } = await supabase.from("quotation_items").delete().eq("quotation_id", quotationId)
    if (deleteItemsError) return { error: deleteItemsError }

    const itemRows = (Array.isArray(source.items) ? source.items : []).map((item: Record<string, any>) => ({
      quotation_id: quotationId,
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
    if (itemRows.length) {
      const { error: insertItemsError } = await supabase.from("quotation_items").insert(itemRows as any)
      if (insertItemsError) return { error: insertItemsError }
    }
  }

  return { error: null }
}

export async function deleteQuotation(id: string, { isDemo }: Ctx) {
  if (isDemo) return { error: null }
  const { error } = await supabase.from("quotations").delete().eq("id", id)
  return { error }
}
