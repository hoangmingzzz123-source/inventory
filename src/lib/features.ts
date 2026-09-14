/**
 * Central UI feature configuration. Permissions answer who may use a feature;
 * this file answers whether the deployment exposes that feature at all.
 *
 * The legacy sales-order screen is retained in source for compatibility, but
 * the Category quotation -> allocation -> delivery flow replaces it in the
 * current scope. Set VITE_FEATURE_SALES_ORDERS=true to opt back in.
 */
const envFlag = (value: unknown, fallback: boolean) => {
  if (value == null || value === "") return fallback
  return String(value).trim().toLowerCase() !== "false"
}

export const screenFeatures: Readonly<Record<string, boolean>> = {
  dashboard: true,
  "user-guide": true,
  products: true,
  categories: true,
  brands: true,
  units: true,
  warehouses: true,
  customers: true,
  suppliers: true,
  "stock-balance": true,
  "stock-ledger": true,
  adjustment: true,
  transfer: true,
  "purchase-orders": true,
  "goods-receipt": true,
  "purchase-return": true,
  "supplier-payment": true,
  quotations: true,
  "sales-orders": envFlag(import.meta.env.VITE_FEATURE_SALES_ORDERS, false),
  delivery: true,
  invoices: true,
  "customer-receipt": true,
  receivable: true,
  payable: true,
  cashbook: true,
  reports: true,
  users: true,
  roles: true,
  "audit-logs": true,
  settings: true,
  notifications: true,
  "system-demo": envFlag(import.meta.env.VITE_DEMO_FEATURE_ENABLED, true),
}

export function isScreenFeatureEnabled(screen: string) {
  return screenFeatures[screen] ?? false
}
