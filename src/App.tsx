import { useState, useEffect } from "react"
import Sidebar from "./components/Sidebar"
import Topbar from "./components/Topbar"
import DemoBanner from "./components/DemoBanner"
import Dashboard from "./screens/Dashboard"
import Products from "./screens/Products"
import PurchaseOrders from "./screens/PurchaseOrders"
import AuthScreen from "./screens/AuthScreen"
import UserRoles from "./screens/UserRoles"
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
  const { user, profile, signOut, hasRole } = useAuth()
  const { isDemo, setDemo } = useDemo()
  const [active, setActive] = useState("dashboard")
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [toast, setToast] = useState<ToastPayload | null>(null)

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
      case "products":         return <Products />
      case "purchase-orders":  return <PurchaseOrders />
      case "customers":        return <Customers />
      case "suppliers":        return <Suppliers />
      case "warehouses":       return <Warehouses />
      case "categories":       return <Categories />
      case "brands":           return <Brands />
      case "units":            return <Units />
      case "sales-orders":     return <SalesOrders />
      case "stock-balance":    return <StockBalance />
      case "stock-ledger":     return <StockLedger />
      case "adjustment":       return <InventoryAdjustment />
      case "transfer":         return <InventoryTransfer />
      case "audit-logs":       return <AuditLogs />
      case "reports":          return <Reports />
      case "settings":         return <Settings />
      case "users":            return <Users />
      case "roles":            return hasRole(["admin", "manager"]) ? <UserRoles /> : <PlaceholderScreen id={lang === "vi" ? "Không có quyền" : "No permission"} />
      case "receivable":       return <Receivables />
      case "purchase-return":  return <PurchaseReturn />
      case "supplier-payment": return <SupplierPayment />
      case "delivery":         return <DeliveryNotes />
      case "invoices":         return <Invoices />
      case "customer-receipt": return <CustomerReceipts />
      case "payable":          return <Payables />
      case "cashbook":         return <CashBook />
      case "notifications":    return <NotificationCenter onNavigate={setActive} />
      default:                 return <PlaceholderScreen id={active} />
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--background)" }}>
      {/* Demo mode banner */}
      {isDemo && <DemoBanner onGoLive={() => window.location.search = ""} />}

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

  // Show auth screen when explicitly requested via `?auth` (or `?login`),
  // or when not demo and no query string — and the user is not logged in.
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
