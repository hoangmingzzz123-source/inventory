export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; email: string; full_name: string | null; role: string; org_id: string; created_at: string }
        Insert: { id: string; email: string; full_name?: string | null; role?: string; org_id?: string }
        Update: { full_name?: string | null; role?: string }
      }
      roles: {
        Row: { id: string; org_id: string; code: string; name_vi: string; name_en: string; is_system: boolean; description: string | null; created_at: string }
        Insert: Omit<Database["public"]["Tables"]["roles"]["Row"], "id" | "created_at"> & { id?: string }
        Update: Partial<Database["public"]["Tables"]["roles"]["Insert"]>
      }
      role_permissions: {
        Row: { role_id: string; module: string; action: string; allowed: boolean }
        Insert: Database["public"]["Tables"]["role_permissions"]["Row"]
        Update: Partial<Database["public"]["Tables"]["role_permissions"]["Row"]>
      }
      organizations: {
        Row: { id: string; name: string; created_at: string }
        Insert: { name: string }
        Update: { name?: string }
      }
      products: {
        Row: { id: string; org_id: string; sku: string; barcode: string | null; name: string; category: string | null; brand: string | null; unit: string | null; cost: number; price: number; qty: number; status: string; updated_at: string; updated_by: string | null }
        Insert: Omit<Database["public"]["Tables"]["products"]["Row"], "id" | "updated_at"> & { id?: string }
        Update: Partial<Database["public"]["Tables"]["products"]["Insert"]>
      }
      categories: {
        Row: { id: string; org_id: string; code: string; name_vi: string; name_en: string; parent_id: string | null; description: string | null; status: string }
        Insert: Omit<Database["public"]["Tables"]["categories"]["Row"], "id"> & { id?: string }
        Update: Partial<Database["public"]["Tables"]["categories"]["Insert"]>
      }
      brands: {
        Row: { id: string; org_id: string; code: string; name: string; country: string | null; website: string | null; status: string }
        Insert: Omit<Database["public"]["Tables"]["brands"]["Row"], "id"> & { id?: string }
        Update: Partial<Database["public"]["Tables"]["brands"]["Insert"]>
      }
      units: {
        Row: { id: string; org_id: string; code: string; name_vi: string; name_en: string; type: string; status: string }
        Insert: Omit<Database["public"]["Tables"]["units"]["Row"], "id"> & { id?: string }
        Update: Partial<Database["public"]["Tables"]["units"]["Insert"]>
      }
      warehouses: {
        Row: { id: string; org_id: string; code: string; name: string; address: string | null; manager: string | null; phone: string | null; status: string; stock_value: number }
        Insert: Omit<Database["public"]["Tables"]["warehouses"]["Row"], "id"> & { id?: string }
        Update: Partial<Database["public"]["Tables"]["warehouses"]["Insert"]>
      }
      customers: {
        Row: { id: string; org_id: string; code: string; name: string; phone: string | null; email: string | null; tax_code: string | null; address: string | null; credit_limit: number; debt: number; status: string; created_at: string }
        Insert: Omit<Database["public"]["Tables"]["customers"]["Row"], "id" | "created_at"> & { id?: string }
        Update: Partial<Database["public"]["Tables"]["customers"]["Insert"]>
      }
      suppliers: {
        Row: { id: string; org_id: string; code: string; name: string; phone: string | null; email: string | null; tax_code: string | null; address: string | null; payment_terms: number; debt: number; status: string; created_at: string }
        Insert: Omit<Database["public"]["Tables"]["suppliers"]["Row"], "id" | "created_at"> & { id?: string }
        Update: Partial<Database["public"]["Tables"]["suppliers"]["Insert"]>
      }
      quotations: {
        Row: { id: string; org_id: string; customer_id: string | null; customer_name: string; date: string; valid_until: string | null; status: string; discount_val: number; discount_type: string; notes: string | null; total: number; created_by: string | null; created_at: string; updated_at: string }
        Insert: Omit<Database["public"]["Tables"]["quotations"]["Row"], "id" | "created_at" | "updated_at"> & { id?: string }
        Update: Partial<Database["public"]["Tables"]["quotations"]["Insert"]>
      }
      quotation_items: {
        Row: { id: string; quotation_id: string; product_id: string | null; product_name: string; supplier_id: string | null; supplier_name: string | null; import_unit: string | null; sell_unit: string | null; qty: number; cost_price: number; profit_pct: number; selling_price: number; vat_pct: number; total: number; created_at: string }
        Insert: Omit<Database["public"]["Tables"]["quotation_items"]["Row"], "id" | "created_at"> & { id?: string }
        Update: Partial<Database["public"]["Tables"]["quotation_items"]["Insert"]>
      }
      purchase_orders: {
        Row: { id: string; org_id: string; ref: string; supplier_id: string | null; supplier_name: string; warehouse_id: string | null; warehouse_name: string; status: string; total: number; notes: string | null; created_by: string | null; created_at: string; updated_at: string }
        Insert: Omit<Database["public"]["Tables"]["purchase_orders"]["Row"], "id" | "created_at" | "updated_at"> & { id?: string }
        Update: Partial<Database["public"]["Tables"]["purchase_orders"]["Insert"]>
      }
      sales_orders: {
        Row: { id: string; org_id: string; ref: string; customer_id: string | null; customer_name: string; warehouse_id: string | null; warehouse_name: string; status: string; subtotal: number; tax: number; total: number; notes: string | null; created_by: string | null; created_at: string; updated_at: string }
        Insert: Omit<Database["public"]["Tables"]["sales_orders"]["Row"], "id" | "created_at" | "updated_at"> & { id?: string }
        Update: Partial<Database["public"]["Tables"]["sales_orders"]["Insert"]>
      }
      inventory_balance: {
        Row: { id: string; org_id: string; product_id: string; product_name: string; sku: string; warehouse_id: string; warehouse_name: string; qty: number; min_qty: number; max_qty: number; unit_cost: number; updated_at: string }
        Insert: Omit<Database["public"]["Tables"]["inventory_balance"]["Row"], "id" | "updated_at"> & { id?: string }
        Update: Partial<Database["public"]["Tables"]["inventory_balance"]["Insert"]>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
