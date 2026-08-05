/**
 * Data service — returns mock data in demo mode, Supabase data in live mode.
 * Each function accepts { isDemo, orgId } and returns typed results.
 */
import { supabase } from "./supabase"
import * as mock from "../data/mockData"

type Ctx = { isDemo: boolean; orgId?: string; role?: string }

function roleAllowed(ctx: Ctx | undefined, allowed: string[]) {
  if (!ctx) return false
  if (ctx.isDemo) return true
  if (!ctx.role) return false
  return allowed.includes(ctx.role)
}

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

export async function upsertProduct(payload: Record<string, unknown>, { isDemo, orgId, role }: Ctx) {
  if (isDemo) return { data: null, error: null }
  if (!roleAllowed({ isDemo, orgId, role }, ["admin", "manager"])) return { data: null, error: new Error("Not authorized") }
  const { data, error } = await supabase
    .from("products")
    .upsert([{ ...payload, org_id: orgId }] as any, { returning: "representation" })
    .select()
  return { data, error }
}

export async function deleteProduct(id: string, { isDemo, orgId, role }: Ctx) {
  if (isDemo) return { error: null }
  if (!roleAllowed({ isDemo, orgId, role }, ["admin", "manager"])) return { error: new Error("Not authorized") }
  const { error } = await supabase.from("products").delete().eq("id", id).eq("org_id", orgId!)
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

export async function upsertPurchaseOrder(payload: Record<string, unknown>, { isDemo, orgId, role }: Ctx) {
  if (isDemo) return { data: null, error: null }
  if (!roleAllowed({ isDemo, orgId, role }, ["admin", "manager"])) return { data: null, error: new Error("Not authorized") }
  const { data, error } = await supabase
    .from("purchase_orders")
    .upsert([{ ...payload, org_id: orgId }] as any, { returning: "representation" })
    .select()
  return { data, error }
}

export async function deletePurchaseOrder(id: string, { isDemo, orgId, role }: Ctx) {
  if (isDemo) return { error: null }
  if (!roleAllowed({ isDemo, orgId, role }, ["admin", "manager"])) return { error: new Error("Not authorized") }
  const { error } = await supabase.from("purchase_orders").delete().eq("id", id).eq("org_id", orgId!)
  return { error }
}

// ─── Purchase Order Items ───────────────────────────────────
export async function fetchPurchaseOrderItems(poId: string, { isDemo }: Ctx) {
  if (isDemo) return { data: [], error: null }
  const { data, error } = await supabase
    .from("purchase_order_items")
    .select("*")
    .eq("po_id", poId)
    .order("id", { ascending: true })
  return { data: data ?? [], error }
}

export async function upsertPurchaseOrderItems(items: Record<string, unknown>[], { isDemo, orgId, role }: Ctx) {
  if (isDemo) return { data: null, error: null }
  if (!roleAllowed({ isDemo, orgId, role }, ["admin", "manager"])) return { data: null, error: new Error("Not authorized") }
  // Ensure org_id is present on items if needed by policies (items reference po_id which belongs to an org)
  const payload = items.map(i => ({ ...i } as any))
  const { data, error } = await supabase
    .from("purchase_order_items")
    .upsert(payload as any, { returning: "representation" })
    .select()
  return { data, error }
}

export async function deletePurchaseOrderItem(id: string, { isDemo, role }: Ctx) {
  if (isDemo) return { error: null }
  if (!roleAllowed({ isDemo, role }, ["admin", "manager"])) return { error: new Error("Not authorized") }
  const { error } = await supabase.from("purchase_order_items").delete().eq("id", id)
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
