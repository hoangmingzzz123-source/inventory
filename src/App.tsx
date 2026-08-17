import { useState, useEffect } from "react"
import Quotations from "./screens/Quotations"
import Sidebar from "./components/Sidebar"
import Topbar from "./components/Topbar"
import DemoBanner from "./components/DemoBanner"
import Dashboard from "./screens/Dashboard"
import Products from "./screens/Products"
import PurchaseOrders from "./screens/PurchaseOrders"
import AuthScreen from "./screens/AuthScreen"
import {
  Customers, Suppliers, Warehouses, SalesOrders,
  StockBalance, StockLedger, InventoryAdjustment, InventoryTransfer,
  AuditLogs, Reports, Settings,
  Categories, Brands, Units, Users, Roles, Receivables,
  GoodsReceipt, PurchaseReturn, SupplierPayment,
  DeliveryNotes, Invoices, CustomerReceipts,
  Payables, CashBook,
} from "./screens/GenericList"
import { LangProvider, useLang } from "./i18n/LangContext"
import { NotificationProvider } from "./contexts/NotificationContext"
import { AuthProvider, useAuth } from "./contexts/AuthContext"
import { DemoProvider, useDemo } from "./contexts/DemoContext"
import NotificationCenter from "./screens/NotificationCenter"
import { fetchRolePermissions, fetchRoles } from "./lib/dataService"
import { Check, AlertCircle, Info, LogOut, User } from "lucide-react"

export type ToastPayload = { msg: string; type: "success" | "error" | "info" }

const breadcrumbKeys: Record<string, string[]> = {
  dashboard:          ["dashboard"],
  products:           ["masterData", "products"],
  categories:         ["masterData", "categories"],
  brands:             ["masterData", "brands"],
  units:              ["masterData", "units"],
  warehouses:         ["masterData", "warehouses"],
  customers:          ["masterData", "customers"],
  suppliers:          ["masterData", "suppliers"],
  "stock-balance":    ["inventory", "stockBalance"],
  "stock-ledger":     ["inventory", "stockLedger"],
  adjustment:         ["inventory", "adjustment"],
  transfer:           ["inventory", "transfer"],
  "purchase-orders":  ["purchase", "purchaseOrders"],
  "goods-receipt":    ["purchase", "goodsReceipt"],
  "purchase-return":  ["purchase", "purchaseReturn"],
  "supplier-payment": ["purchase", "supplierPayment"],
  "quotations":       ["sales", "quotations"],
  "sales-orders":     ["sales", "salesOrders"],
  delivery:           ["sales", "deliveryNotes"],
  invoices:           ["sales", "invoices"],
  "customer-receipt": ["sales", "customerReceipts"],
  receivable:         ["finance", "receivables"],
  payable:            ["finance", "payables"],
  cashbook:           ["finance", "cashBook"],
  reports:            ["reports"],
  users:              ["administration", "users"],
  roles:              ["administration", "roles"],
  "audit-logs":       ["administration", "auditLogs"],
  settings:           ["settings"],
  notifications:      ["notifications"],
}

function PlaceholderScreen({ id }: { id: string }) {
  const { lang } = useLang()
  return (
    <div className="flex-1 flex items-center justify-center p-8 h-full">
      <div className="text-center max-w-xs">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
          <div className="w-8 h-8 rounded-xl bg-blue-100" />
        </div>
        <h2 className="text-sm font-semibold text-slate-700 mb-1">{id}</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          {lang === "vi"
            ? "Màn hình này đang được phát triển."
            : "This screen is currently in development."}
        </p>
      </div>
    </div>
  )
}

function AppInner() {
  const { t, lang } = useLang()
  const { user, profile, signOut } = useAuth()
  const { isDemo, setDemo } = useDemo()
  const [active, setActive] = useState("dashboard")
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [toast, setToast] = useState<ToastPayload | null>(null)
  const [permissionMap, setPermissionMap] = useState<Record<string, boolean>>({})

  const role = String(profile?.role ?? "staff").toLowerCase()
  const screenToModule: Record<string, string> = {
    dashboard: "Dashboard",
    products: "Master Data",
    categories: "Master Data",
    brands: "Master Data",
    units: "Master Data",
    warehouses: "Master Data",
    customers: "Master Data",
    suppliers: "Master Data",
    "stock-balance": "Inventory",
    "stock-ledger": "Inventory",
    adjustment: "Inventory",
    transfer: "Inventory",
    "purchase-orders": "Purchase",
    "goods-receipt": "Purchase",
    "purchase-return": "Purchase",
    "supplier-payment": "Purchase",
    quotations: "Sales",
    "sales-orders": "Sales",
    delivery: "Sales",
    invoices: "Sales",
    "customer-receipt": "Sales",
    receivable: "Finance",
    payable: "Finance",
    cashbook: "Finance",
    reports: "Reports",
    users: "Administration",
    roles: "Administration",
    "audit-logs": "Administration",
    settings: "Dashboard",
    notifications: "Dashboard",
  }
  const defaultAllowedByRole: Record<string, string[]> = {
    admin: ["dashboard", "products", "categories", "brands", "units", "warehouses", "customers", "suppliers", "stock-balance", "stock-ledger", "adjustment", "transfer", "purchase-orders", "goods-receipt", "purchase-return", "supplier-payment", "quotations", "sales-orders", "delivery", "invoices", "customer-receipt", "receivable", "payable", "cashbook", "reports", "settings", "notifications", "users", "roles", "audit-logs"],
    manager: ["dashboard", "products", "categories", "brands", "units", "warehouses", "customers", "suppliers", "stock-balance", "stock-ledger", "adjustment", "transfer", "purchase-orders", "goods-receipt", "purchase-return", "supplier-payment", "quotations", "sales-orders", "delivery", "invoices", "customer-receipt", "receivable", "payable", "cashbook", "reports", "settings", "notifications"],
    staff: ["dashboard", "products", "categories", "brands", "units", "warehouses", "customers", "suppliers", "stock-balance", "stock-ledger", "adjustment", "transfer", "purchase-orders", "goods-receipt", "purchase-return", "supplier-payment", "quotations", "sales-orders", "delivery", "invoices", "customer-receipt", "receivable", "payable", "cashbook", "reports", "settings", "notifications"],
  }

  useEffect(() => {
    if (!user || isDemo) {
      setPermissionMap({})
      return
    }

    let active = true
    Promise.all([
      fetchRoles({ isDemo, orgId: profile?.org_id }),
      fetchRolePermissions({ isDemo, orgId: profile?.org_id }),
    ]).then(([rolesRes, permsRes]) => {
      if (!active) return
      const roles = rolesRes.data ?? []
      const currentRole = roles.find((row: any) => String(row.code ?? row.name ?? "").toLowerCase() === role || String(row.name ?? row.name_vi ?? row.name_en ?? "").toLowerCase() === role)
      const roleId = currentRole?.id
      if (!roleId) {
        setPermissionMap({})
        return
      }
      const map: Record<string, boolean> = {}
      for (const row of permsRes.data ?? []) {
        if (String(row.role_id) !== String(roleId)) continue
        if (row.allowed) map[`${row.module}:view`] = true
      }
      setPermissionMap(map)
    })

    return () => { active = false }
  }, [user, isDemo, profile?.org_id, role])

  const canAccess = (screen: string) => {
    if (!user) return true
    if (role === "admin") return true

    const module = screenToModule[screen]
    if (!module) return false

    const permissionKey = `${module}:view`
    if (Object.keys(permissionMap).length > 0) {
      return Boolean(permissionMap[permissionKey])
    }

    return defaultAllowedByRole[role]?.includes(screen) ?? false
  }

  useEffect(() => {
    const allowed = canAccess(active)
    if (user && !allowed) {
      setActive("dashboard")
      setToast({ msg: lang === "vi" ? "Bạn không có quyền truy cập màn hình này." : "You do not have access to this screen.", type: "error" })
    }
  }, [active, user, role, lang])

  // Sync demo mode with auth state
  useEffect(() => {
    setDemo(!user)
  }, [user, setDemo])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent("open-search"))
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  const keys = breadcrumbKeys[active] ?? ["dashboard"]
  const breadcrumbs = keys.length === 1
    ? ["WarehouseOS", t(keys[0] as any)]
    : [t(keys[0] as any), t(keys[1] as any)]

  function renderScreen() {
    switch (active) {
      case "dashboard":        return <Dashboard />
      case "quotations":       return canAccess("quotations") ? <Quotations /> : null
      case "products":         return canAccess("products") ? <Products /> : null
      case "purchase-orders":  return canAccess("purchase-orders") ? <PurchaseOrders /> : null
      case "customers":        return canAccess("customers") ? <Customers /> : null
      case "suppliers":        return canAccess("suppliers") ? <Suppliers /> : null
      case "warehouses":       return canAccess("warehouses") ? <Warehouses /> : null
      case "categories":       return canAccess("categories") ? <Categories /> : null
      case "brands":           return canAccess("brands") ? <Brands /> : null
      case "units":            return canAccess("units") ? <Units /> : null
      case "sales-orders":     return canAccess("sales-orders") ? <SalesOrders /> : null
      case "stock-balance":    return canAccess("stock-balance") ? <StockBalance /> : null
      case "stock-ledger":     return canAccess("stock-ledger") ? <StockLedger /> : null
      case "adjustment":       return canAccess("adjustment") ? <InventoryAdjustment /> : null
      case "transfer":         return canAccess("transfer") ? <InventoryTransfer /> : null
      case "audit-logs":       return canAccess("audit-logs") ? <AuditLogs /> : null
      case "reports":          return canAccess("reports") ? <Reports /> : null
      case "settings":         return canAccess("settings") ? <Settings /> : null
      case "users":            return canAccess("users") ? <Users /> : null
      case "roles":            return canAccess("roles") ? <Roles /> : null
      case "receivable":       return canAccess("receivable") ? <Receivables /> : null
      case "goods-receipt":    return canAccess("goods-receipt") ? <GoodsReceipt /> : null
      case "purchase-return":  return canAccess("purchase-return") ? <PurchaseReturn /> : null
      case "supplier-payment": return canAccess("supplier-payment") ? <SupplierPayment /> : null
      case "delivery":         return canAccess("delivery") ? <DeliveryNotes /> : null
      case "invoices":         return canAccess("invoices") ? <Invoices /> : null
      case "customer-receipt": return canAccess("customer-receipt") ? <CustomerReceipts /> : null
      case "payable":          return canAccess("payable") ? <Payables /> : null
      case "cashbook":         return canAccess("cashbook") ? <CashBook /> : null
      case "notifications":    return canAccess("notifications") ? <NotificationCenter onNavigate={setActive} /> : null
      default:                 return <PlaceholderScreen id={active} />
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--background)" }}>
      {/* Demo mode banner */}
      {isDemo && <DemoBanner onGoLive={() => window.location.search = "?auth"} />}

      <div className="flex flex-1 overflow-hidden min-h-0">
        <Sidebar active={active} onNavigate={setActive} collapsed={sidebarCollapsed} />

        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          <Topbar
            breadcrumbs={breadcrumbs}
            onToggleSidebar={() => setSidebarCollapsed(c => !c)}
            onNavigate={setActive}
            userMenu={
              user ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-slate-600">
                    <User size={13} className="text-slate-400" />
                    <span className="max-w-[120px] truncate">{profile?.full_name ?? user.email}</span>
                    {!isDemo && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold">Live</span>
                    )}
                  </div>
                  <button
                    onClick={() => signOut()}
                    title={lang === "vi" ? "Đăng xuất" : "Sign out"}
                    className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50"
                  >
                    <LogOut size={13} />
                  </button>
                </div>
              ) : null
            }
          />
          <main className="flex-1 overflow-auto">
            {renderScreen()}
          </main>
        </div>
      </div>

      {toast && (
        <div
          className="fixed bottom-5 right-5 z-[100] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-xs font-medium text-white"
          style={{ background: toast.type === "success" ? "#16a34a" : toast.type === "error" ? "#dc2626" : "#2563eb" }}
        >
          {toast.type === "success" ? <Check size={14} /> : toast.type === "error" ? <AlertCircle size={14} /> : <Info size={14} />}
          {toast.msg}
        </div>
      )}
    </div>
  )
}

function AppGate() {
  const { session, loading } = useAuth()
  const qs = window.location.search
  const isDemoRequested = qs.includes("demo=true")
  const isAuthRequested = qs.includes("auth") || qs.includes("login")

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center animate-pulse">
            <div className="w-5 h-5 bg-white rounded-lg" />
          </div>
          <div className="text-xs text-slate-400">Loading WarehouseOS...</div>
        </div>
      </div>
    )
  }

  // Show auth screen when explicitly requested (?auth / ?login) or when not demo and no query string and not logged in
  if (!session && (isAuthRequested || (!isDemoRequested && qs === ""))) {
    return <AuthScreen />
  }

  return (
    <NotificationProvider>
      <AppInner />
    </NotificationProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <DemoProvider>
        <LangProvider>
          <AppGate />
        </LangProvider>
      </DemoProvider>
    </AuthProvider>
  )
}
