import { lazy, Suspense, useState, useEffect } from "react"
import Sidebar from "./components/Sidebar"
import Topbar from "./components/Topbar"
import DemoBanner from "./components/DemoBanner"
import AppErrorBoundary from "./components/AppErrorBoundary"
import AuthScreen from "./screens/AuthScreen"
import { LangProvider, useLang } from "./i18n/LangContext"
import { NotificationProvider } from "./contexts/NotificationContext"
import { AuthProvider, useAuth } from "./contexts/AuthContext"
import { DemoProvider, useDemo } from "./contexts/DemoContext"
import { Check, AlertCircle, Info, LogOut, User } from "lucide-react"
import { APP_CONFIRM_EVENT, APP_TOAST_EVENT, type AppConfirmRequest } from "./lib/appEvents"
import { ThemeProvider } from "./contexts/ThemeContext"
import {
  DEMO_VISIBILITY_EVENT,
  demoFeatureEnabled,
  isDemoFeatureHidden,
  setDemoFeatureHidden,
} from "./lib/demoFeature"

const Dashboard = lazy(() => import("./screens/Dashboard"))
const Products = lazy(() => import("./screens/Products"))
const PurchaseOrders = lazy(() => import("./screens/PurchaseOrders"))
const Quotations = lazy(() => import("./screens/Quotations"))
const NotificationCenter = lazy(() => import("./screens/NotificationCenter"))
const UserGuide = lazy(() => import("./screens/UserGuide"))
const Customers = lazy(() => import("./screens/GenericList").then(module => ({ default: module.Customers })))
const Suppliers = lazy(() => import("./screens/GenericList").then(module => ({ default: module.Suppliers })))
const Warehouses = lazy(() => import("./screens/GenericList").then(module => ({ default: module.Warehouses })))
const SalesOrders = lazy(() => import("./screens/GenericList").then(module => ({ default: module.SalesOrders })))
const StockBalance = lazy(() => import("./screens/GenericList").then(module => ({ default: module.StockBalance })))
const StockLedger = lazy(() => import("./screens/GenericList").then(module => ({ default: module.StockLedger })))
const InventoryAdjustment = lazy(() => import("./screens/GenericList").then(module => ({ default: module.InventoryAdjustment })))
const InventoryTransfer = lazy(() => import("./screens/GenericList").then(module => ({ default: module.InventoryTransfer })))
const AuditLogs = lazy(() => import("./screens/GenericList").then(module => ({ default: module.AuditLogs })))
const Reports = lazy(() => import("./screens/GenericList").then(module => ({ default: module.Reports })))
const Settings = lazy(() => import("./screens/GenericList").then(module => ({ default: module.Settings })))
const Categories = lazy(() => import("./screens/GenericList").then(module => ({ default: module.Categories })))
const Brands = lazy(() => import("./screens/GenericList").then(module => ({ default: module.Brands })))
const Units = lazy(() => import("./screens/GenericList").then(module => ({ default: module.Units })))
const Users = lazy(() => import("./screens/GenericList").then(module => ({ default: module.Users })))
const Roles = lazy(() => import("./screens/GenericList").then(module => ({ default: module.Roles })))
const Receivables = lazy(() => import("./screens/GenericList").then(module => ({ default: module.Receivables })))
const GoodsReceipt = lazy(() => import("./screens/GenericList").then(module => ({ default: module.GoodsReceipt })))
const PurchaseReturn = lazy(() => import("./screens/GenericList").then(module => ({ default: module.PurchaseReturn })))
const SupplierPayment = lazy(() => import("./screens/GenericList").then(module => ({ default: module.SupplierPayment })))
const DeliveryNotes = lazy(() => import("./screens/GenericList").then(module => ({ default: module.DeliveryNotes })))
const Invoices = lazy(() => import("./screens/GenericList").then(module => ({ default: module.Invoices })))
const CustomerReceipts = lazy(() => import("./screens/GenericList").then(module => ({ default: module.CustomerReceipts })))
const Payables = lazy(() => import("./screens/GenericList").then(module => ({ default: module.Payables })))
const CashBook = lazy(() => import("./screens/GenericList").then(module => ({ default: module.CashBook })))
const SystemDemo = lazy(() => import("./screens/SystemDemo"))

export type ToastPayload = { msg: string; type: "success" | "error" | "info" }

const breadcrumbKeys: Record<string, string[]> = {
  dashboard:          ["dashboard"],
  "user-guide":       ["userGuide"],
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
  "system-demo":      ["systemDemo"],
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

function ScreenLoading() {
  return (
    <div role="status" aria-label="Loading" className="flex h-full items-center justify-center">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
    </div>
  )
}

function AppInner() {
  const { t, lang } = useLang()
  const { user, profile, signOut, can } = useAuth()
  const { isDemo, setDemo } = useDemo()
  const initialScreen = new URLSearchParams(window.location.search).get("screen") || "dashboard"
  const [active, setActive] = useState(initialScreen)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth < 768)
  const [toast, setToast] = useState<ToastPayload | null>(null)
  const [confirmation, setConfirmation] = useState<AppConfirmRequest | null>(null)
  const [demoFeatureHidden, setDemoFeatureHiddenState] = useState(false)

  useEffect(() => {
    setDemoFeatureHiddenState(isDemoFeatureHidden(user?.id))
    const syncVisibility = () => setDemoFeatureHiddenState(isDemoFeatureHidden(user?.id))
    window.addEventListener(DEMO_VISIBILITY_EVENT, syncVisibility)
    window.addEventListener("storage", syncVisibility)
    return () => {
      window.removeEventListener(DEMO_VISIBILITY_EVENT, syncVisibility)
      window.removeEventListener("storage", syncVisibility)
    }
  }, [user?.id])

  const showSystemDemo = Boolean(user && demoFeatureEnabled && !demoFeatureHidden)

  useEffect(() => {
    const handleToast = (event: Event) => {
      const payload = (event as CustomEvent<ToastPayload>).detail
      if (payload?.msg) setToast(payload)
    }
    window.addEventListener(APP_TOAST_EVENT, handleToast)
    return () => window.removeEventListener(APP_TOAST_EVENT, handleToast)
  }, [])

  useEffect(() => {
    const handleConfirmation = (event: Event) => {
      setConfirmation((event as CustomEvent<AppConfirmRequest>).detail)
    }
    window.addEventListener(APP_CONFIRM_EVENT, handleConfirmation)
    return () => window.removeEventListener(APP_CONFIRM_EVENT, handleConfirmation)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timeoutId = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(timeoutId)
  }, [toast])

  useEffect(() => {
    const handleViewportChange = () => setSidebarCollapsed(window.innerWidth < 768)
    window.addEventListener("resize", handleViewportChange)
    return () => window.removeEventListener("resize", handleViewportChange)
  }, [])

  const role = String(profile?.role ?? "staff").toLowerCase()
  const screenToModule: Record<string, string> = {
    dashboard: "Dashboard",
    "user-guide": "Dashboard",
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
    settings: "Administration",
    notifications: "Dashboard",
    "system-demo": "Dashboard",
  }
  const canAccess = (screen: string) => {
    if (!user) return true
    if (screen === "system-demo") return showSystemDemo
    if (role === "admin") return true
    if (["dashboard", "user-guide", "notifications", "settings"].includes(screen)) return true

    const module = screenToModule[screen]
    if (!module) return false
    return can(module, "view")
  }

  useEffect(() => {
    const allowed = canAccess(active)
    if (user && !allowed) {
      setActive("dashboard")
      setToast({ msg: lang === "vi" ? "Bạn không có quyền truy cập màn hình này." : "You do not have access to this screen.", type: "error" })
    }
  }, [active, user, role, lang, profile, can, showSystemDemo])

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

  const finishConfirmation = (confirmed: boolean) => {
    confirmation?.resolve(confirmed)
    setConfirmation(null)
  }

  function renderScreen() {
    switch (active) {
      case "dashboard":        return <Dashboard />
      case "user-guide":       return canAccess("user-guide") ? <UserGuide /> : null
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
      case "system-demo":      return canAccess("system-demo") ? <SystemDemo onNavigate={setActive} onHide={() => {
        setDemoFeatureHidden(true, user?.id)
        setActive("dashboard")
      }} /> : null
      default:                 return <PlaceholderScreen id={active} />
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--background)" }}>
      {/* Demo mode banner */}
      {isDemo && <DemoBanner onGoLive={() => window.location.search = "?auth"} />}

      <div className="flex flex-1 overflow-hidden min-h-0">
        <Sidebar active={active} onNavigate={setActive} collapsed={sidebarCollapsed} showSystemDemo={showSystemDemo} />

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
            <AppErrorBoundary key={active} scope="page">
              <Suspense fallback={<ScreenLoading />}>
                {renderScreen()}
              </Suspense>
            </AppErrorBoundary>
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

      {confirmation && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4" onClick={() => finishConfirmation(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="app-confirm-title" className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="p-5">
              <h2 id="app-confirm-title" className="text-sm font-semibold text-slate-900">{lang === "vi" ? "Xác nhận thao tác" : "Confirm action"}</h2>
              <p className="mt-2 text-xs leading-5 text-slate-500">{confirmation.message}</p>
            </div>
            <div className="flex justify-end gap-2 border-t bg-slate-50 px-5 py-3.5">
              <button type="button" autoFocus onClick={() => finishConfirmation(false)} className="h-8 rounded-lg border px-4 text-xs text-slate-600">{confirmation.cancelLabel ?? (lang === "vi" ? "Hủy" : "Cancel")}</button>
              <button type="button" onClick={() => finishConfirmation(true)} className={`h-8 rounded-lg px-4 text-xs text-white ${confirmation.destructive ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}>{confirmation.confirmLabel ?? (lang === "vi" ? "Xác nhận" : "Confirm")}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function AppGate() {
  const { session, profileError, loading, signOut } = useAuth()
  const qs = window.location.search
  const isDemoRequested = qs.includes("demo=true")
  const isAuthRequested = qs.includes("auth") || qs.includes("login")

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div role="status" aria-label="Loading WarehouseOS" className="flex flex-col items-center gap-3">
          <div className="flex h-10 w-10 animate-pulse items-center justify-center rounded-2xl bg-blue-600">
            <div className="h-5 w-5 rounded-lg bg-white" />
          </div>
        </div>
      </div>
    )
  }

  if (session && profileError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <section className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="mt-0.5 flex-shrink-0 text-amber-600" />
            <div>
              <h1 className="text-base font-semibold text-slate-900">Không tải được hồ sơ / Profile unavailable</h1>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Kiểm tra rằng các migration mới nhất đã được áp dụng trên Supabase, sau đó tải lại trang.
              </p>
              <pre className="mt-3 max-h-28 overflow-auto rounded-lg bg-amber-50 p-3 text-[10px] text-amber-800">{profileError}</pre>
              <div className="mt-4 flex gap-2">
                <button onClick={() => window.location.reload()} className="h-9 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700">Tải lại / Reload</button>
                <button onClick={() => void signOut()} className="h-9 rounded-lg border px-4 text-xs font-semibold text-slate-600 hover:bg-slate-50">Đăng xuất / Sign out</button>
              </div>
            </div>
          </div>
        </section>
      </main>
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
    <AppErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <DemoProvider>
            <LangProvider>
              <AppGate />
            </LangProvider>
          </DemoProvider>
        </AuthProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  )
}
