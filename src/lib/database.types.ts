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
      company_settings: {
        Row: { org_id: string; name: string; representative: string | null; tax_id: string | null; address: string | null; phone: string | null; website: string | null; email: string | null; logo_url: string | null; costing_method: string; updated_at: string }
        Insert: Omit<Database["public"]["Tables"]["company_settings"]["Row"], "updated_at"> & { updated_at?: string }
        Update: Partial<Database["public"]["Tables"]["company_settings"]["Insert"]>
      }
      products: {
        Row: { id: string; org_id: string; sku: string; barcode: string | null; name: string; category_id: string | null; category: string | null; brand: string | null; unit: string | null; cost: number; price: number; qty: number; tax_pct: number; min_qty: number; max_qty: number; description: string | null; track_inventory: boolean; track_serial: boolean; track_batch: boolean; allow_negative: boolean; status: string; updated_at: string; updated_by: string | null }
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
        Row: { id: string; org_id: string; customer_id: string | null; customer_name: string; date: string; valid_until: string | null; status: string; discount_val: number; discount_type: string; notes: string | null; total: number; converted_at: string | null; delivered_at: string | null; cancelled_at: string | null; created_by: string | null; created_at: string; updated_at: string }
        Insert: Omit<Database["public"]["Tables"]["quotations"]["Row"], "id" | "created_at" | "updated_at"> & { id?: string }
        Update: Partial<Database["public"]["Tables"]["quotations"]["Insert"]>
      }
      quotation_items: {
        Row: { id: string; quotation_id: string; category_id: string | null; category_name: string | null; product_id: string | null; product_name: string; supplier_id: string | null; supplier_name: string | null; import_unit: string | null; sell_unit: string | null; qty: number; cost_price: number; profit_pct: number; selling_price: number; vat_pct: number; total: number; created_at: string }
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
      goods_receipt_items: {
        Row: { id: string; receipt_id: string; product_id: string | null; product_name: string; sku: string | null; qty: number; unit_cost: number; unit: string | null; supplier_id: string | null; supplier_name: string | null; batch_number: string | null; manufacture_date: string | null; expiry_date: string | null; created_at: string }
        Insert: Omit<Database["public"]["Tables"]["goods_receipt_items"]["Row"], "id" | "created_at"> & { id?: string }
        Update: Partial<Database["public"]["Tables"]["goods_receipt_items"]["Insert"]>
      }
      inventory_ledger: {
        Row: { id: string; org_id: string; ref: string; movement_type: string; product_id: string | null; product_name: string; sku: string; warehouse_id: string | null; warehouse_name: string; qty_in: number; qty_out: number; unit_cost: number; source_item_id: string | null; quotation_id: string | null; batch_number: string | null; manufacture_date: string | null; expiry_date: string | null; created_by: string | null; created_at: string }
        Insert: Omit<Database["public"]["Tables"]["inventory_ledger"]["Row"], "id" | "created_at"> & { id?: string }
        Update: Partial<Database["public"]["Tables"]["inventory_ledger"]["Insert"]>
      }
      inventory_cost_layers: {
        Row: { id: string; org_id: string; product_id: string; warehouse_id: string | null; source_ledger_id: string | null; source_item_id: string | null; origin_layer_id: string | null; source_ref: string; source_type: string; batch_number: string | null; manufacture_date: string | null; expiry_date: string | null; received_qty: number; remaining_qty: number; unit_cost: number; received_at: string; created_at: string }
        Insert: Omit<Database["public"]["Tables"]["inventory_cost_layers"]["Row"], "id" | "created_at"> & { id?: string }
        Update: Partial<Database["public"]["Tables"]["inventory_cost_layers"]["Insert"]>
      }
      inventory_cost_allocations: {
        Row: { id: string; org_id: string; outbound_ledger_id: string; cost_layer_id: string; qty: number; unit_cost: number; created_at: string }
        Insert: Omit<Database["public"]["Tables"]["inventory_cost_allocations"]["Row"], "id" | "created_at"> & { id?: string }
        Update: Partial<Database["public"]["Tables"]["inventory_cost_allocations"]["Insert"]>
      }
      product_suppliers: {
        Row: { id: string; org_id: string; product_id: string; supplier_id: string; last_unit_cost: number; is_preferred: boolean; created_at: string; updated_at: string }
        Insert: Omit<Database["public"]["Tables"]["product_suppliers"]["Row"], "id" | "created_at" | "updated_at"> & { id?: string }
        Update: Partial<Database["public"]["Tables"]["product_suppliers"]["Insert"]>
      }
      quotation_allocations: {
        Row: { id: string; org_id: string; quotation_id: string; quotation_item_id: string; category_id: string; product_id: string; warehouse_id: string; source_type: "STOCK" | "NEW_STOCK"; qty: number; supplier_id: string | null; goods_receipt_item_id: string | null; created_by: string | null; created_at: string }
        Insert: Omit<Database["public"]["Tables"]["quotation_allocations"]["Row"], "id" | "created_at"> & { id?: string }
        Update: Partial<Database["public"]["Tables"]["quotation_allocations"]["Insert"]>
      }
      inventory_reservations: {
        Row: { id: string; org_id: string; quotation_id: string; quotation_allocation_id: string; product_id: string; warehouse_id: string; qty: number; status: "ACTIVE" | "CONSUMED" | "RELEASED"; created_at: string; updated_at: string }
        Insert: Omit<Database["public"]["Tables"]["inventory_reservations"]["Row"], "id" | "created_at" | "updated_at"> & { id?: string }
        Update: Partial<Database["public"]["Tables"]["inventory_reservations"]["Insert"]>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
