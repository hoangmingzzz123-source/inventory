import { Bell, Search, PanelLeft, ChevronRight, Globe, X, AlertTriangle, CheckCircle, Info, Clock, AlertCircle, Trash2, Check } from "lucide-react"
import { useState, useEffect } from "react"
import { useLang } from "../i18n/LangContext"
import { useNotifications, type NotifType, type AppNotification } from "../contexts/NotificationContext"

interface TopbarProps {
  breadcrumbs: string[]
  onToggleSidebar: () => void
  onNavigate?: (screen: string) => void
  userMenu?: React.ReactNode
}

function NotifIcon({ type, size = 13 }: { type: NotifType; size?: number }) {
  if (type === "warning") return <AlertTriangle size={size} className="text-amber-500" />
  if (type === "success") return <CheckCircle size={size} className="text-emerald-500" />
  if (type === "pending") return <Clock size={size} className="text-blue-500" />
  if (type === "error") return <AlertCircle size={size} className="text-red-500" />
  return <Info size={size} className="text-slate-400" />
}

const notifBg: Record<NotifType, string> = {
  warning: "bg-amber-50",
  success: "bg-emerald-50",
  pending: "bg-blue-50",
  error: "bg-red-50",
  info: "bg-slate-50",
}

function timeAgo(ts: number, lang: string) {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  if (lang === "vi") {
    if (m < 1) return "Vừa xong"
    if (m < 60) return `${m} phút trước`
    return `${h} giờ trước`
  }
  if (m < 1) return "Just now"
  if (m < 60) return `${m}m ago`
  return `${h}h ago`
}

function NotifRow({ n, lang, onRead, onDismiss, onNavigate }: { n: AppNotification; lang: string; onRead: () => void; onDismiss: () => void; onNavigate?: (screen: string) => void }) {
  const title = lang === "vi" ? n.titleVi : n.titleEn
  const body = lang === "vi" ? n.bodyVi : n.bodyEn
  const action = lang === "vi" ? n.actionVi : n.actionEn

  const handleClick = () => {
    onRead()
    if (n.navigateTo) onNavigate?.(n.navigateTo)
  }
  const handleAction = (e: React.MouseEvent) => {
    e.stopPropagation()
    onRead()
    if (n.navigateTo) onNavigate?.(n.navigateTo)
  }

  return (
    <div
      onClick={handleClick}
      className={`flex items-start gap-3 px-4 py-3 border-b transition-colors cursor-pointer hover:bg-slate-50 group ${n.unread ? notifBg[n.type] : ""}`}
      style={{ borderColor: "var(--border)" }}
    >
      <div className="mt-0.5 flex-shrink-0"><NotifIcon type={n.type} /></div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {n.unread && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />}
            <span className={`text-xs font-semibold truncate ${n.unread ? "text-slate-900" : "text-slate-600"}`}>{title}</span>
          </div>
          <button
            onClick={e => { e.stopPropagation(); onDismiss() }}
            className="w-4 h-4 flex items-center justify-center rounded text-slate-300 hover:text-slate-600 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100"
          >
            <X size={11} />
          </button>
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed line-clamp-2">{body}</div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-slate-400">{timeAgo(n.timestamp, lang)}</span>
          {action && (
            <button onClick={handleAction} className="text-[10px] font-semibold text-blue-600 hover:underline">
              {action} →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Topbar({ breadcrumbs, onToggleSidebar, onNavigate, userMenu }: TopbarProps) {
  const { lang, setLang, t } = useLang()
  const { notifications, unreadCount, markRead, markAllRead, dismiss, dismissAll } = useNotifications()
  const [searchOpen, setSearchOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)

  useEffect(() => {
    const handler = () => setSearchOpen(true)
    window.addEventListener("open-search", handler)
    return () => window.removeEventListener("open-search", handler)
  }, [])

  const preview = notifications.slice(0, 5)

  return (
    <header className="flex items-center gap-3 px-4 border-b bg-white" style={{ height: 52, borderColor: "var(--border)", flexShrink: 0 }}>
      <button onClick={onToggleSidebar} className="w-8 h-8 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 transition-colors flex-shrink-0">
        <PanelLeft size={16} />
      </button>

      <nav className="flex items-center gap-1 text-sm flex-1 min-w-0">
        {breadcrumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1 min-w-0">
            {i > 0 && <ChevronRight size={13} className="text-slate-300 flex-shrink-0" />}
            <span className={`truncate ${i === breadcrumbs.length - 1 ? "text-slate-900 font-medium" : "text-slate-400"}`}>{crumb}</span>
          </span>
        ))}
      </nav>

      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Search */}
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2 h-8 px-3 rounded-md bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors text-xs"
        >
          <Search size={13} />
          <span className="hidden sm:inline">{t("search")}...</span>
          <span className="hidden sm:inline text-[10px] text-slate-400 border border-slate-300 rounded px-1">Ctrl+K</span>
        </button>

        {/* Notifications bell */}
        <div className="relative">
          <button
            onClick={() => setNotifOpen(v => !v)}
            className="w-8 h-8 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 transition-colors relative"
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[14px] h-[14px] bg-red-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center px-0.5">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 top-10 z-50 bg-white border rounded-xl shadow-xl overflow-hidden w-screen max-w-[92vw] sm:w-[380px]" style={{ borderColor: "var(--border)" }}>
                {/* Dropdown header */}
                <div className="flex flex-col gap-3 px-4 py-3 border-b sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">{lang === "vi" ? "Thông báo" : "Notifications"}</span>
                    {unreadCount > 0 && (
                      <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold leading-none">{unreadCount}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} className="flex items-center gap-1 text-[11px] text-blue-600 hover:underline">
                        <Check size={11} /> {lang === "vi" ? "Đọc tất cả" : "Mark all read"}
                      </button>
                    )}
                    <button onClick={dismissAll} title={lang === "vi" ? "Xóa tất cả" : "Clear all"} className="text-slate-400 hover:text-red-500">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Notification rows */}
                <div className="max-h-[80vh] overflow-y-auto">
                  {preview.length === 0 ? (
                    <div className="py-12 text-center">
                      <Bell size={28} className="text-slate-200 mx-auto mb-2" />
                      <div className="text-xs text-slate-400">{lang === "vi" ? "Không có thông báo mới" : "No notifications"}</div>
                    </div>
                  ) : (
                    preview.map(n => (
                      <NotifRow
                        key={n.id}
                        n={n}
                        lang={lang}
                        onRead={() => markRead(n.id)}
                        onDismiss={() => dismiss(n.id)}
                        onNavigate={screen => { setNotifOpen(false); onNavigate?.(screen) }}
                      />
                    ))
                  )}
                </div>

                {/* Footer */}
                <div className="px-4 py-2.5 border-t bg-slate-50 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--border)" }}>
                  <span className="text-[10px] text-slate-400">{notifications.length} {lang === "vi" ? "thông báo" : "notifications"}</span>
                  <button
                    onClick={() => { setNotifOpen(false); onNavigate?.("notifications") }}
                    className="text-xs font-semibold text-blue-600 hover:underline"
                  >
                    {lang === "vi" ? "Xem tất cả →" : "View all →"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Language Toggle */}
        <div className="relative ml-1">
          <button
            onClick={() => setLang(lang === "vi" ? "en" : "vi")}
            className="flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            style={{ borderColor: "var(--border)" }}
            title={lang === "vi" ? "Switch to English" : "Chuyển tiếng Việt"}
          >
            <Globe size={13} className="text-slate-400" />
            <span>{lang === "vi" ? "VI" : "EN"}</span>
          </button>
        </div>

        {/* User menu or avatar */}
        {userMenu ?? (
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-[11px] font-bold ml-1 flex-shrink-0">
            NA
          </div>
        )}
      </div>

      {/* Global Search Modal */}
      {searchOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-20 px-4" onClick={() => setSearchOpen(false)}>
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border overflow-hidden" style={{ borderColor: "var(--border)" }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 border-b" style={{ borderColor: "var(--border)", height: 52 }}>
              <Search size={16} className="text-slate-400 flex-shrink-0" />
              <input
                autoFocus
                placeholder={lang === "vi" ? "Tìm sản phẩm, khách hàng, đơn hàng..." : "Search products, customers, orders..."}
                className="flex-1 text-sm outline-none text-slate-800 placeholder-slate-400"
                onKeyDown={e => e.key === "Escape" && setSearchOpen(false)}
              />
              <button onClick={() => setSearchOpen(false)} className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 flex-shrink-0"><X size={14} /></button>
            </div>
            <div className="p-3">
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-2 px-2">{lang === "vi" ? "Truy cập nhanh" : "Quick Access"}</div>
              {[
                { label: lang === "vi" ? "Sản phẩm" : "Products", screen: "products" },
                { label: lang === "vi" ? "Đơn mua hàng" : "Purchase Orders", screen: "purchase-orders" },
                { label: lang === "vi" ? "Đơn bán hàng" : "Sales Orders", screen: "sales-orders" },
                { label: lang === "vi" ? "Khách hàng" : "Customers", screen: "customers" },
                { label: lang === "vi" ? "Tồn kho hiện tại" : "Stock Balance", screen: "stock-balance" },
              ].map(item => (
                <button
                  key={item.screen}
                  onClick={() => { setSearchOpen(false); onNavigate?.(item.screen) }}
                  className="w-full flex items-center gap-2.5 px-2 h-9 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
                >
                  <Search size={13} className="text-slate-400" />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
