import {
  LayoutDashboard, Package, Warehouse, ShoppingCart, TrendingUp,
  DollarSign, BarChart2, Settings, Shield, ChevronRight,
  ChevronDown, Box, Users, Truck, Tag, Layers, ArrowLeftRight,
  ClipboardList, FileText, Receipt, CreditCard, UserCog,
  KeyRound, ScrollText, Building2, BookOpen,
} from "lucide-react"
import { useState } from "react"
import { useLang } from "../i18n/LangContext"

type NavChild = { id: string; labelKey: string; icon: React.ReactNode }
type NavItem = { id: string; labelKey: string; icon: React.ReactNode; children?: NavChild[] }

const navItems: NavItem[] = [
  { id: "dashboard", labelKey: "dashboard", icon: <LayoutDashboard size={16} /> },
  {
    id: "masterdata", labelKey: "masterData", icon: <Box size={16} />,
    children: [
      { id: "products", labelKey: "products", icon: <Package size={14} /> },
      { id: "categories", labelKey: "categories", icon: <Tag size={14} /> },
      { id: "brands", labelKey: "brands", icon: <Layers size={14} /> },
      { id: "units", labelKey: "units", icon: <BookOpen size={14} /> },
      { id: "warehouses", labelKey: "warehouses", icon: <Warehouse size={14} /> },
      { id: "customers", labelKey: "customers", icon: <Users size={14} /> },
      { id: "suppliers", labelKey: "suppliers", icon: <Truck size={14} /> },
    ]
  },
  {
    id: "inventory", labelKey: "inventory", icon: <Warehouse size={16} />,
    children: [
      { id: "stock-balance", labelKey: "stockBalance", icon: <ClipboardList size={14} /> },
      { id: "stock-ledger", labelKey: "stockLedger", icon: <ScrollText size={14} /> },
      { id: "adjustment", labelKey: "adjustment", icon: <ArrowLeftRight size={14} /> },
      { id: "transfer", labelKey: "transfer", icon: <ArrowLeftRight size={14} /> },
    ]
  },
  {
    id: "purchase", labelKey: "purchase", icon: <ShoppingCart size={16} />,
    children: [
      { id: "purchase-orders", labelKey: "purchaseOrders", icon: <ClipboardList size={14} /> },
      { id: "goods-receipt", labelKey: "goodsReceipt", icon: <Package size={14} /> },
      { id: "purchase-return", labelKey: "purchaseReturn", icon: <Receipt size={14} /> },
      { id: "supplier-payment", labelKey: "supplierPayment", icon: <CreditCard size={14} /> },
    ]
  },
  {
    id: "sales", labelKey: "sales", icon: <TrendingUp size={16} />,
    children: [
      { id: "sales-orders", labelKey: "salesOrders", icon: <FileText size={14} /> },
      { id: "delivery", labelKey: "deliveryNotes", icon: <Truck size={14} /> },
      { id: "invoices", labelKey: "invoices", icon: <Receipt size={14} /> },
      { id: "customer-receipt", labelKey: "customerReceipts", icon: <CreditCard size={14} /> },
    ]
  },
  {
    id: "finance", labelKey: "finance", icon: <DollarSign size={16} />,
    children: [
      { id: "receivable", labelKey: "receivables", icon: <Receipt size={14} /> },
      { id: "payable", labelKey: "payables", icon: <CreditCard size={14} /> },
      { id: "cashbook", labelKey: "cashBook", icon: <DollarSign size={14} /> },
    ]
  },
  { id: "reports", labelKey: "reports", icon: <BarChart2 size={16} /> },
  {
    id: "administration", labelKey: "administration", icon: <Shield size={16} />,
    children: [
      { id: "users", labelKey: "users", icon: <UserCog size={14} /> },
      { id: "roles", labelKey: "roles", icon: <KeyRound size={14} /> },
      { id: "audit-logs", labelKey: "auditLogs", icon: <ScrollText size={14} /> },
    ]
  },
  { id: "settings", labelKey: "settings", icon: <Settings size={16} /> },
]

interface SidebarProps {
  active: string
  onNavigate: (id: string) => void
  collapsed: boolean
}

export default function Sidebar({ active, onNavigate, collapsed }: SidebarProps) {
  const { t, lang } = useLang()

  // Auto-expand parent of active child
  const getInitialExpanded = () => {
    const state: Record<string, boolean> = {}
    navItems.forEach(item => {
      if (item.children) {
        state[item.id] = item.children.some(c => c.id === active)
      }
    })
    // Default: always show masterdata open
    if (!state.masterdata) state.masterdata = true
    return state
  }

  const [expanded, setExpanded] = useState<Record<string, boolean>>(getInitialExpanded)

  const toggle = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  const isChildActive = (item: NavItem) => item.children?.some(c => c.id === active) ?? false

  return (
    <aside
      className="flex flex-col border-r bg-white transition-all duration-200 flex-shrink-0"
      style={{ width: collapsed ? 52 : 236, minHeight: "100vh", borderColor: "var(--sidebar-border)" }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-3 border-b flex-shrink-0" style={{ height: 52, borderColor: "var(--border)" }}>
        <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
          <Building2 size={14} color="white" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900 leading-none">WarehouseOS</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Enterprise Edition</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 overflow-y-auto overflow-x-hidden">
        {navItems.map(item => {
          const hasChildren = !!item.children
          const isExpanded = expanded[item.id]
          const childActive = isChildActive(item)
          const selfActive = active === item.id

          return (
            <div key={item.id}>
              <button
                onClick={() => hasChildren ? toggle(item.id) : onNavigate(item.id)}
                className={`w-full flex items-center gap-2.5 mx-1 h-8 rounded-md text-left transition-colors text-xs
                  ${selfActive && !hasChildren ? "bg-blue-50 text-blue-700 font-semibold" : ""}
                  ${childActive && hasChildren ? "text-blue-700 font-semibold" : ""}
                  ${!selfActive && !childActive ? "text-slate-600 hover:bg-slate-50 hover:text-slate-900" : ""}
                  ${collapsed ? "justify-center px-0" : "px-2.5"}
                `}
                style={{ width: collapsed ? 40 : "calc(100% - 8px)" }}
                title={collapsed ? t(item.labelKey as any) : undefined}
              >
                <span className={`flex-shrink-0 ${selfActive || childActive ? "text-blue-600" : ""}`}>{item.icon}</span>
                {!collapsed && (
                  <>
                    <span className="flex-1 truncate">{t(item.labelKey as any)}</span>
                    {hasChildren && (
                      <span className="text-slate-400 flex-shrink-0">
                        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </span>
                    )}
                  </>
                )}
              </button>

              {hasChildren && isExpanded && !collapsed && (
                <div className="ml-5 mt-0.5 mb-1 border-l pl-2.5" style={{ borderColor: "#e2e8f0" }}>
                  {item.children!.map(child => (
                    <button
                      key={child.id}
                      onClick={() => onNavigate(child.id)}
                      className={`w-full flex items-center gap-2 h-7 px-2 rounded-md text-left text-[11px] transition-colors
                        ${active === child.id ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"}
                      `}
                    >
                      <span className={active === child.id ? "text-blue-500" : "text-slate-400"}>{child.icon}</span>
                      <span className="truncate">{t(child.labelKey as any)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* User */}
      {!collapsed && (
        <div className="border-t p-3 flex-shrink-0" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
              NA
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-800 truncate">Nguyễn Văn A</div>
              <div className="text-[10px] text-slate-400">{lang === "vi" ? "Quản trị viên" : "Administrator"}</div>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
