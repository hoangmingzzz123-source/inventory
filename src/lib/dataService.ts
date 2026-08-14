/**
 * Data service — returns mock data in demo mode, Supabase data in live mode.
 * Each function accepts { isDemo, orgId } and returns typed results.
 */
import { supabase } from "./supabase"
import * as mock from "../data/mockData"

type Ctx = { isDemo: boolean; orgId?: string }

function isSchemaMissingError(error: any) {
  const msg = String(error?.message ?? "")
  return msg.includes("Could not find the table") || msg.includes("Could not find the column") || msg.includes("schema cache")
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
  return { data: data as any[] ?? [], error }
}

export async function upsertCustomer(payload: Record<string, unknown>, { isDemo, orgId }: Ctx) {
  if (isDemo) return { error: null }
  const { error } = await supabase.from("customers").upsert([{ ...payload, org_id: orgId }] as any)
  return { error }
}

export async function bulkUpsertCustomers(payloads: Record<string, unknown>[], { isDemo, orgId }: Ctx) {
  if (isDemo) return { error: null }
  const rows = payloads.map(p => ({ ...p, org_id: orgId }))
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

// ─── Warehouses ──────────────────────────────────────────────
export async function fetchWarehouses({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: mock.warehouses, error: null }
  const { data, error } = await safeSelect("warehouses", "*", query => orgId ? query.eq("org_id", orgId) : query)
  return { data: data as any[] ?? [], error }
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

// ─── Sales Orders ────────────────────────────────────────────
export async function fetchSalesOrders({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: mock.salesOrders, error: null }
  const { data, error } = await safeSelect("sales_orders", "*", query => orgId ? query.eq("org_id", orgId).order("created_at", { ascending: false }) : query)
  return { data: data as any[] ?? [], error }
}

// ─── Inventory Balance ───────────────────────────────────────
export async function fetchInventoryBalance({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: mock.inventoryBalance, error: null }
  const { data, error } = await safeSelect("inventory_balance", "*", query => orgId ? query.eq("org_id", orgId).order("product_name") : query)
  return { data: data as any[] ?? [], error }
}

// ─── Categories, Brands, Units ──────────────────────────────
export async function fetchCategories({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: mock.categories, error: null }
  const { data, error } = await safeSelect("categories", "*", query => orgId ? query.eq("org_id", orgId) : query)
  return { data: data as any[] ?? [], error }
}

export async function fetchBrands({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: mock.brands, error: null }
  const { data, error } = await safeSelect("brands", "*", query => orgId ? query.eq("org_id", orgId) : query)
  return { data: data as any[] ?? [], error }
}

export async function fetchUnits({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: mock.units, error: null }
  const { data, error } = await safeSelect("units", "*", query => orgId ? query.eq("org_id", orgId) : query)
  return { data: data as any[] ?? [], error }
}

export async function upsertCategory(payload: Record<string, unknown>, { isDemo, orgId }: Ctx) {
  if (isDemo) return { error: null }
  const { error } = await supabase.from("categories").upsert([{ ...payload, org_id: orgId }] as any)
  return { error }
}

export async function bulkUpsertCategories(payloads: Record<string, unknown>[], { isDemo, orgId }: Ctx) {
  if (isDemo) return { error: null }
  const rows = payloads.map(p => ({ ...p, org_id: orgId }))
  const { error } = await supabase.from("categories").upsert(rows as any)
  return { error }
}

export async function deleteCategory(id: string, { isDemo }: Ctx) {
  if (isDemo) return { error: null }
  const { error } = await supabase.from("categories").delete().eq("code", id)
  return { error }
}

export async function upsertBrand(payload: Record<string, unknown>, { isDemo, orgId }: Ctx) {
  if (isDemo) return { error: null }
  const { error } = await supabase.from("brands").upsert([{ ...payload, org_id: orgId }] as any)
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
  const { error } = await supabase.from("units").upsert([{ ...payload, org_id: orgId }] as any)
  return { error }
}

export async function bulkUpsertUnits(payloads: Record<string, unknown>[], { isDemo, orgId }: Ctx) {
  if (isDemo) return { error: null }
  const rows = payloads.map(p => ({ ...p, org_id: orgId }))
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
  const { data, error } = await safeSelect("quotations", "*", [() => (orgId ? (this.query as any).eq("org_id", orgId).order("date", { ascending: false }) : this.query)])
  return {
    data: (data as any[] ?? []).map((row: any) => ({
      ...row,
      customer_name: row.customer_name ?? row.customer ?? "",
      customer_id: row.customer_id ?? row.customerId ?? "",
      valid_until: row.valid_until ?? row.validUntil ?? "",
      discount_val: row.discount_val ?? row.discount ?? 0,
      total: Number(row.total ?? 0),
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

export async function upsertSupplier(payload: Record<string, unknown>, { isDemo, orgId }: Ctx) {
  if (isDemo) return { error: null }
  const { error } = await supabase.from("suppliers").upsert([{ ...payload, org_id: orgId }] as any)
  return { error }
}

export async function bulkUpsertSuppliers(payloads: Record<string, unknown>[], { isDemo, orgId }: Ctx) {
  if (isDemo) return { error: null }
  const rows = payloads.map(p => ({ ...p, org_id: orgId }))
  const { error } = await supabase.from("suppliers").upsert(rows as any)
  return { error }
}

export async function deleteSupplier(id: string, { isDemo }: Ctx) {
  if (isDemo) return { error: null }
  const { error } = await supabase.from("suppliers").delete().eq("id", id)
  return { error }
}

export async function upsertWarehouse(payload: Record<string, unknown>, { isDemo, orgId }: Ctx) {
  if (isDemo) return { error: null }
  const { error } = await supabase.from("warehouses").upsert([{ ...payload, org_id: orgId }] as any)
  return { error }
}

export async function bulkUpsertWarehouses(payloads: Record<string, unknown>[], { isDemo, orgId }: Ctx) {
  if (isDemo) return { error: null }
  const rows = payloads.map(p => ({ ...p, org_id: orgId }))
  const { error } = await supabase.from("warehouses").upsert(rows as any)
  return { error }
}

export async function deleteWarehouse(id: string, { isDemo }: Ctx) {
  if (isDemo) return { error: null }
  const { error } = await supabase.from("warehouses").delete().eq("id", id)
  return { error }
}

export async function deletePurchaseOrder(id: string, { isDemo }: Ctx) {
  if (isDemo) return { error: null }
  const { error } = await supabase.from("purchase_orders").delete().eq("id", id)
  return { error }
}
