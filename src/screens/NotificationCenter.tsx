import { useState } from "react"
import { Bell, AlertTriangle, CheckCircle, Info, Clock, Trash2, X, AlertCircle, Package, ShoppingCart, TrendingUp, CreditCard, Settings, Filter, Check } from "lucide-react"
import { useNotifications, type AppNotification, type NotifType } from "../contexts/NotificationContext"
import { useLang } from "../i18n/LangContext"

function NotifIcon({ type, size = 14 }: { type: NotifType; size?: number }) {
  if (type === "warning") return <AlertTriangle size={size} className="text-amber-500" />
  if (type === "success") return <CheckCircle size={size} className="text-emerald-500" />
  if (type === "pending") return <Clock size={size} className="text-blue-500" />
  if (type === "error") return <AlertCircle size={size} className="text-red-500" />
  return <Info size={size} className="text-slate-400" />
}

const typeBg: Record<NotifType, string> = {
  warning: "bg-amber-50 border-amber-100",
  success: "bg-emerald-50 border-emerald-100",
  pending: "bg-blue-50 border-blue-100",
  error: "bg-red-50 border-red-100",
  info: "bg-slate-50 border-slate-100",
}

const typeIconBg: Record<NotifType, string> = {
  warning: "bg-amber-100",
  success: "bg-emerald-100",
  pending: "bg-blue-100",
  error: "bg-red-100",
  info: "bg-slate-100",
}

const categoryIcon: Record<string, React.ReactNode> = {
  inventory: <Package size={12} />,
  purchase: <ShoppingCart size={12} />,
  sales: <TrendingUp size={12} />,
  finance: <CreditCard size={12} />,
  system: <Settings size={12} />,
}

const categoryColorVi: Record<string, string> = {
  inventory: "Tồn kho", purchase: "Mua hàng", sales: "Bán hàng", finance: "Tài chính", system: "Hệ thống",
}
const categoryColorEn: Record<string, string> = {
  inventory: "Inventory", purchase: "Purchase", sales: "Sales", finance: "Finance", system: "System",
}

function timeAgo(ts: number, lang: string) {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (lang === "vi") {
    if (m < 1) return "Vừa xong"
    if (m < 60) return `${m} phút trước`
    if (h < 24) return `${h} giờ trước`
    return `${d} ngày trước`
  }
  if (m < 1) return "Just now"
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  return `${d}d ago`
}

function NotifCard({ n, onRead, onDismiss, onNavigate, lang }: {
  n: AppNotification; onRead: () => void; onDismiss: () => void; onNavigate: (screen: string) => void; lang: string
}) {
  const title = lang === "vi" ? n.titleVi : n.titleEn
  const body = lang === "vi" ? n.bodyVi : n.bodyEn
  const action = lang === "vi" ? n.actionVi : n.actionEn
  const catLabel = lang === "vi" ? categoryColorVi[n.category] : categoryColorEn[n.category]

  const handleAction = (e: React.MouseEvent) => {
    e.stopPropagation()
    onRead()
    if (n.navigateTo) onNavigate(n.navigateTo)
  }

  const handleCardClick = () => {
    onRead()
    if (n.navigateTo) onNavigate(n.navigateTo)
  }

  return (
    <div
      className={`flex gap-3 p-4 rounded-xl border transition-all cursor-pointer group ${n.unread ? typeBg[n.type] : "bg-white border-slate-100 hover:border-slate-200"}`}
      onClick={handleCardClick}
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${n.unread ? typeIconBg[n.type] : "bg-slate-100"}`}>
        <NotifIcon type={n.type} size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              {n.unread && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />}
              <span className={`text-xs font-semibold ${n.unread ? "text-slate-900" : "text-slate-600"}`}>{title}</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-slate-400">
              <span className="flex items-center gap-0.5">{categoryIcon[n.category]} {catLabel}</span>
              <span>·</span>
              <span>{timeAgo(n.timestamp, lang)}</span>
            </div>
          </div>
          <button
            onClick={e => { e.stopPropagation(); onDismiss() }}
            className="w-5 h-5 flex items-center justify-center rounded-md text-slate-300 hover:text-slate-600 hover:bg-slate-100 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-all"
          >
            <X size={11} />
          </button>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed mt-1">{body}</p>
        {action && (
          <button onClick={handleAction} className="mt-2 text-[11px] font-semibold text-blue-600 hover:text-blue-700 hover:underline">
            {action} →
          </button>
        )}
      </div>
    </div>
  )
}

export default function NotificationCenter({ onNavigate }: { onNavigate?: (screen: string) => void }) {
  const { lang } = useLang()
  const { notifications, unreadCount, markRead, markAllRead, dismiss, dismissAll } = useNotifications()
  const [tab, setTab] = useState<"all" | "unread" | "inventory" | "purchase" | "sales" | "finance" | "system">("all")
  const [typeFilter, setTypeFilter] = useState<NotifType | "all">("all")

  const vi = lang === "vi"

  const tabs = [
    { key: "all" as const, label: vi ? "Tất cả" : "All", count: notifications.length },
    { key: "unread" as const, label: vi ? "Chưa đọc" : "Unread", count: unreadCount },
    { key: "inventory" as const, label: vi ? "Tồn kho" : "Inventory", count: notifications.filter(n => n.category === "inventory").length },
    { key: "purchase" as const, label: vi ? "Mua hàng" : "Purchase", count: notifications.filter(n => n.category === "purchase").length },
    { key: "sales" as const, label: vi ? "Bán hàng" : "Sales", count: notifications.filter(n => n.category === "sales").length },
    { key: "finance" as const, label: vi ? "Tài chính" : "Finance", count: notifications.filter(n => n.category === "finance").length },
    { key: "system" as const, label: vi ? "Hệ thống" : "System", count: notifications.filter(n => n.category === "system").length },
  ]

  const typeFilters: { key: NotifType | "all"; label: string }[] = [
    { key: "all", label: vi ? "Tất cả loại" : "All types" },
    { key: "warning", label: vi ? "Cảnh báo" : "Warning" },
    { key: "error", label: vi ? "Lỗi" : "Error" },
    { key: "pending", label: vi ? "Chờ xử lý" : "Pending" },
    { key: "success", label: vi ? "Thành công" : "Success" },
    { key: "info", label: vi ? "Thông tin" : "Info" },
  ]

  const filtered = notifications.filter(n => {
    const matchTab = tab === "all" ? true : tab === "unread" ? n.unread : n.category === tab
    const matchType = typeFilter === "all" ? true : n.type === typeFilter
    return matchTab && matchType
  })

  const summaryStats = [
    { label: vi ? "Tổng thông báo" : "Total", value: notifications.length, color: "text-slate-700", bg: "bg-slate-50" },
    { label: vi ? "Chưa đọc" : "Unread", value: unreadCount, color: "text-blue-700", bg: "bg-blue-50" },
    { label: vi ? "Cảnh báo" : "Warnings", value: notifications.filter(n => n.type === "warning" || n.type === "error").length, color: "text-amber-700", bg: "bg-amber-50" },
    { label: vi ? "Chờ xử lý" : "Pending action", value: notifications.filter(n => n.type === "pending").length, color: "text-violet-700", bg: "bg-violet-50" },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-5 py-3.5 bg-white border-b flex-shrink-0" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <Bell size={16} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-900">{vi ? "Trung tâm thông báo" : "Notification Center"}</h1>
            <div className="text-[10px] text-slate-400">{unreadCount > 0 ? `${unreadCount} ${vi ? "thông báo chưa đọc" : "unread"}` : vi ? "Tất cả đã đọc" : "All caught up"}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs text-slate-600 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
              <Check size={12} /> {vi ? "Đọc tất cả" : "Mark all read"}
            </button>
          )}
          {notifications.length > 0 && (
            <button onClick={dismissAll} className="flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs text-red-600 hover:bg-red-50" style={{ borderColor: "var(--border)" }}>
              <Trash2 size={12} /> {vi ? "Xóa tất cả" : "Clear all"}
            </button>
          )}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 px-5 py-3 bg-white border-b flex-shrink-0" style={{ borderColor: "var(--border)" }}>
        {summaryStats.map(s => (
          <div key={s.label} className={`rounded-xl p-3 ${s.bg}`}>
            <div className={`text-xl font-bold mono ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 px-5 py-2 bg-white border-b flex-shrink-0 overflow-x-auto" style={{ borderColor: "var(--border)" }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs whitespace-nowrap transition-colors ${tab === t.key ? "bg-blue-600 text-white font-medium" : "text-slate-500 hover:bg-slate-100"}`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`text-[10px] font-bold px-1 rounded-full ${tab === t.key ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
        <div className="flex-1 min-w-[120px]" />
        <div className="flex items-center gap-1.5 min-w-[160px]">
          <Filter size={12} className="text-slate-400" />
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as NotifType | "all")}
            className="h-7 w-full rounded-lg border text-xs outline-none bg-white" style={{ borderColor: "var(--border)" }}
          >
            {typeFilters.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </div>
      </div>

      {/* Notification list */}
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-20">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center">
              <Bell size={28} className="text-slate-300" />
            </div>
            <div className="text-sm font-medium text-slate-500">{vi ? "Không có thông báo" : "No notifications"}</div>
            <div className="text-xs text-slate-400">{vi ? "Tất cả thông báo đã được xử lý." : "You're all caught up!"}</div>
          </div>
        ) : (
          <div className="p-5 space-y-2 max-w-2xl">
            {filtered.map(n => (
              <NotifCard
                key={n.id}
                n={n}
                lang={lang}
                onRead={() => markRead(n.id)}
                onDismiss={() => dismiss(n.id)}
                onNavigate={screen => { onNavigate?.(screen) }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
