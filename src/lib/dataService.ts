/**
 * Data service — returns mock data in demo mode, Supabase data in live mode.
 * Each function accepts { isDemo, orgId } and returns typed results.
 */
import { supabase } from "./supabase"
import * as mock from "../data/mockData"

type Ctx = { isDemo: boolean; orgId?: string }

// ─── Products ────────────────────────────────────────────────
export async function fetchProducts({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: mock.products, error: null }
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("org_id", orgId!)
    .order("updated_at", { ascending: false })
  return { data: data ?? [], error }
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
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("org_id", orgId!)
    .order("created_at", { ascending: false })
  return { data: data ?? [], error }
}

export async function upsertCustomer(payload: Record<string, unknown>, { isDemo, orgId }: Ctx) {
  if (isDemo) return { error: null }
  const { error } = await supabase.from("customers").upsert([{ ...payload, org_id: orgId }] as any)
  return { error }
}

// ─── Suppliers ───────────────────────────────────────────────
export async function fetchSuppliers({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: mock.suppliers, error: null }
  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("org_id", orgId!)
    .order("created_at", { ascending: false })
  return { data: data ?? [], error }
}

// ─── Warehouses ──────────────────────────────────────────────
export async function fetchWarehouses({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: mock.warehouses, error: null }
  const { data, error } = await supabase
    .from("warehouses")
    .select("*")
    .eq("org_id", orgId!)
  return { data: data ?? [], error }
}

// ─── Purchase Orders ─────────────────────────────────────────
export async function fetchPurchaseOrders({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: mock.purchaseOrders, error: null }
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("*")
    .eq("org_id", orgId!)
    .order("created_at", { ascending: false })
  return { data: data ?? [], error }
}

export async function upsertPurchaseOrder(payload: Record<string, unknown>, { isDemo, orgId }: Ctx) {
  if (isDemo) return { error: null }
  const { error } = await supabase.from("purchase_orders").upsert([{ ...payload, org_id: orgId }] as any)
  return { error }
}

// ─── Sales Orders ────────────────────────────────────────────
export async function fetchSalesOrders({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: mock.salesOrders, error: null }
  const { data, error } = await supabase
    .from("sales_orders")
    .select("*")
    .eq("org_id", orgId!)
    .order("created_at", { ascending: false })
  return { data: data ?? [], error }
}

// ─── Inventory Balance ───────────────────────────────────────
export async function fetchInventoryBalance({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: mock.inventoryBalance, error: null }
  const { data, error } = await supabase
    .from("inventory_balance")
    .select("*")
    .eq("org_id", orgId!)
    .order("product_name")
  return { data: data ?? [], error }
}

// ─── Categories, Brands, Units ──────────────────────────────
export async function fetchCategories({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: mock.categories, error: null }
  const { data, error } = await supabase.from("categories").select("*").eq("org_id", orgId!)
  return { data: data ?? [], error }
}

export async function fetchBrands({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: mock.brands, error: null }
  const { data, error } = await supabase.from("brands").select("*").eq("org_id", orgId!)
  return { data: data ?? [], error }
}

export async function fetchUnits({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: mock.units, error: null }
  const { data, error } = await supabase.from("units").select("*").eq("org_id", orgId!)
  return { data: data ?? [], error }
}

// --- Quotations ---
export async function fetchQuotations({ isDemo, orgId }: Ctx) {
  if (isDemo) return { data: mock.quotations, error: null }
  const { data, error } = await supabase
    .from("quotations")
    .select("*")
    .eq("org_id", orgId!)
    .order("created_at", { ascending: false })
  return { data: data ?? [], error }
}
