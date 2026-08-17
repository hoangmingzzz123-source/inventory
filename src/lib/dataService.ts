/**
 * Data service — returns mock data in demo mode, Supabase data in live mode.
 * Each function accepts { isDemo, orgId } and returns typed results.
 */
import { supabase } from "./supabase"
import * as mock from "../data/mockData"

type Ctx = { isDemo: boolean; orgId?: string }

function toNumber(value: unknown, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
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
  if (isDemo) return { error: null }
  const { error } = await supabase.from("products").upsert([{ ...payload, org_id: orgId }] as any)
  return { error }
}

export async function deleteProduct(id: string, { isDemo }: Ctx) {
  if (isDemo) return { error: null }
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
  if (isDemo) return { error: null }
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
  if (isDemo) return { error: null }
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
  if (isDemo) return { error: null }
  const { error } = await supabase.from("suppliers").upsert([{ ...payload, org_id: orgId }] as any)
  return { error }
}

export async function deleteSupplier(id: string, { isDemo }: Ctx) {
  if (isDemo) return { error: null }
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
  if (isDemo) return { error: null }
  const normalized = { ...payload, org_id: orgId }
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
  if (isDemo) return { error: null }
  const { error } = await supabase.from("warehouses").delete().eq("id", id)
  return { error }
}

// ─── Purchase Orders ─────────────────────────────────────────
export async function fetchPurchaseOrders({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: mock.purchaseOrders, error: null }
  const { data, error } = await safeSelect("purchase_orders", "*", query => orgId ? query.eq("org_id", orgId).order("created_at", { ascending: false }) : query)
  return { data: (data as any[] ?? []).map((row: any) => ({
    ...row,
    createdBy: row.created_by ?? row.createdBy ?? "",
    supplier: row.supplier_name ?? row.supplier ?? "",
    warehouse: row.warehouse_name ?? row.warehouse ?? "",
  })), error }
}

export async function upsertPurchaseOrder(payload: Record<string, unknown>, { isDemo, orgId }: Ctx) {
  if (isDemo) return { error: null }
  const { error } = await supabase.from("purchase_orders").upsert([{ ...payload, org_id: orgId }] as any)
  return { error }
}

export async function deletePurchaseOrder(id: string, { isDemo }: Ctx) {
  if (isDemo) return { error: null }
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
  if (isDemo) return { error: null }
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
  if (isDemo) return { error: null }
  const { error } = await supabase.from("categories").delete().eq("code", id)
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
  if (isDemo) return { error: null }
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
  if (isDemo) return { error: null }
  const { error } = await supabase.from("brands").delete().eq("code", id)
  return { error }
}

export async function upsertUnit(payload: Record<string, unknown>, { isDemo, orgId }: Ctx) {
  if (isDemo) return { error: null }
  const normalized = { ...payload, org_id: orgId }
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
    const normalized = { ...p, org_id: orgId }
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
  if (isDemo) return { error: null }
  const { error } = await supabase.from("units").delete().eq("code", id)
  return { error }
}

export async function fetchGoodsReceipts({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: [], error: null }
  const { data, error } = await safeSelect("goods_receipts", "*", query => orgId ? query.eq("org_id", orgId).order("created_at", { ascending: false }) : query)
  return { data: data as any[] ?? [], error }
}

export async function upsertGoodsReceipt(payload: Record<string, unknown>, { isDemo, orgId }: Ctx) {
  if (isDemo) return { error: null }
  const { error } = await supabase.from("goods_receipts").upsert([{ ...payload, org_id: orgId }] as any)
  return { error }
}

export async function deleteGoodsReceipt(id: string, { isDemo }: Ctx) {
  if (isDemo) return { error: null }
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
  return {
    data: (data as any[] ?? []).map((row: any) => ({
      ...row,
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

export async function upsertQuotation(payload: Record<string, unknown>, { isDemo, orgId }: Ctx) {
  if (isDemo) return { error: null }
  const row = { ...payload, org_id: orgId }
  const { error } = await supabase.from("quotations").upsert([row] as any)
  return { error }
}

export async function deleteQuotation(id: string, { isDemo }: Ctx) {
  if (isDemo) return { error: null }
  const { error } = await supabase.from("quotations").delete().eq("id", id)
  return { error }
}
