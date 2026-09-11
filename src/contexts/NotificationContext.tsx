import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react"
import { useAuth } from "./AuthContext"
import { useDemo } from "./DemoContext"
import { fetchInvoices, fetchProducts, fetchPurchaseOrders, fetchQuotations, fetchSalesOrders } from "../lib/dataService"
import { formatDateKeyUtc7 } from "../lib/dateUtils"
import { formatVnd } from "../lib/numberFormat"
import { supabase } from "../lib/supabase"

export type NotifType = "warning" | "success" | "info" | "pending" | "error"

export interface AppNotification {
  id: number
  type: NotifType
  titleVi: string
  titleEn: string
  bodyVi: string
  bodyEn: string
  timeVi: string
  timeEn: string
  unread: boolean
  actionVi?: string
  actionEn?: string
  navigateTo?: string
  navigateId?: string
  navigateSearch?: string
  category: "inventory" | "purchase" | "sales" | "finance" | "system"
  timestamp: number
}

const INITIAL: AppNotification[] = [
  { id: 1, type: "warning", category: "inventory", titleVi: "Tồn kho thấp", titleEn: "Low Stock Alert", bodyVi: "MacBook Pro M3 còn 5 chiếc (tối thiểu: 10). Cần đặt hàng ngay.", bodyEn: "MacBook Pro M3 has 5 units (min: 10). Reorder required.", timeVi: "2 phút", timeEn: "2 min", unread: true, actionVi: "Xem tồn kho", actionEn: "View Stock", navigateTo: "stock-balance", timestamp: Date.now() - 2 * 60 * 1000 },
  { id: 2, type: "warning", category: "inventory", titleVi: "Tồn kho thấp", titleEn: "Low Stock Alert", bodyVi: "Logitech MX Keys còn 2 chiếc (tối thiểu: 10). Nguy cơ hết hàng.", bodyEn: "Logitech MX Keys has 2 units (min: 10). Risk of stockout.", timeVi: "8 phút", timeEn: "8 min", unread: true, actionVi: "Tạo PO", actionEn: "Create PO", navigateTo: "purchase-orders", timestamp: Date.now() - 8 * 60 * 1000 },
  { id: 3, type: "pending", category: "purchase", titleVi: "PO chờ duyệt", titleEn: "PO Pending Approval", bodyVi: "PO-202608-000004 (Apple Vietnam — 2.25 tỷ ₫) cần được phê duyệt.", bodyEn: "PO-202608-000004 (Apple Vietnam — 2.25B ₫) needs approval.", timeVi: "15 phút", timeEn: "15 min", unread: true, actionVi: "Duyệt ngay", actionEn: "Approve", navigateTo: "purchase-orders", timestamp: Date.now() - 15 * 60 * 1000 },
  { id: 4, type: "success", category: "sales", titleVi: "Đơn hàng hoàn tất", titleEn: "Order Completed", bodyVi: "SO-202608-000048 đã hoàn tất — FPT Telecom. Doanh thu: 52.000.000 ₫.", bodyEn: "SO-202608-000048 completed — FPT Telecom. Revenue: 52,000,000 ₫.", timeVi: "1 giờ", timeEn: "1 hr", unread: false, navigateTo: "sales-orders", timestamp: Date.now() - 60 * 60 * 1000 },
  { id: 5, type: "warning", category: "finance", titleVi: "Hóa đơn quá hạn", titleEn: "Invoice Overdue", bodyVi: "INV-202608-003 (Nguyen Kim Corp — 47.3 triệu ₫) đã quá hạn 3 ngày.", bodyEn: "INV-202608-003 (Nguyen Kim Corp — 47.3M ₫) is 3 days overdue.", timeVi: "5 giờ", timeEn: "5 hrs", unread: true, actionVi: "Xem hóa đơn", actionEn: "View Invoice", navigateTo: "invoices", timestamp: Date.now() - 5 * 60 * 60 * 1000 },
  { id: 6, type: "info", category: "system", titleVi: "Báo cáo sẵn sàng", titleEn: "Report Ready", bodyVi: "Báo cáo doanh thu tháng 7/2026 đã được tạo và sẵn sàng tải xuống.", bodyEn: "July 2026 revenue report has been generated and is ready to download.", timeVi: "3 giờ", timeEn: "3 hrs", unread: false, actionVi: "Xem báo cáo", actionEn: "View Report", navigateTo: "reports", timestamp: Date.now() - 3 * 60 * 60 * 1000 },
  { id: 7, type: "success", category: "purchase", titleVi: "Nhập kho hoàn tất", titleEn: "GRN Completed", bodyVi: "GRN-202608-0012 (Tech Distributor VN) đã nhập kho hoàn tất — 3 sản phẩm.", bodyEn: "GRN-202608-0012 (Tech Distributor VN) completed — 3 items received.", timeVi: "6 giờ", timeEn: "6 hrs", unread: false, navigateTo: "goods-receipt", timestamp: Date.now() - 6 * 60 * 60 * 1000 },
  { id: 8, type: "error", category: "system", titleVi: "Đồng bộ thất bại", titleEn: "Sync Failed", bodyVi: "Kết nối ERP bị gián đoạn lúc 02:15. Dữ liệu sẽ được đồng bộ lại tự động.", bodyEn: "ERP connection interrupted at 02:15. Data will resync automatically.", timeVi: "Hôm nay 02:15", timeEn: "Today 02:15", unread: true, navigateTo: "audit-logs", timestamp: Date.now() - 8 * 60 * 60 * 1000 },
]

interface NotifCtx {
  notifications: AppNotification[]
  unreadCount: number
  markRead: (id: number) => void
  markAllRead: () => void
  dismiss: (id: number) => void
  dismissAll: () => void
  add: (n: Omit<AppNotification, "id" | "timestamp">) => void
}

const Ctx = createContext<NotifCtx | null>(null)

type NotificationMemory = { read: string[]; dismissed: string[] }

function notificationSignature(notification: AppNotification) {
  return `${notification.category}:${notification.titleEn}:${notification.bodyEn}`
}

function notificationStorageKey(scope: string) {
  return `warehouseos-notifications:${scope}`
}

function loadNotificationMemory(scope: string): NotificationMemory {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(notificationStorageKey(scope)) ?? "{}")
    return {
      read: Array.isArray(parsed.read) ? parsed.read.filter((value: unknown) => typeof value === "string").slice(-500) : [],
      dismissed: Array.isArray(parsed.dismissed) ? parsed.dismissed.filter((value: unknown) => typeof value === "string").slice(-500) : [],
    }
  } catch {
    return { read: [], dismissed: [] }
  }
}

function saveNotificationMemory(scope: string, memory: NotificationMemory) {
  try {
    window.localStorage.setItem(notificationStorageKey(scope), JSON.stringify({
      read: Array.from(new Set(memory.read)).slice(-500),
      dismissed: Array.from(new Set(memory.dismissed)).slice(-500),
    }))
  } catch {
    // Storage can be unavailable in private/restricted browser contexts.
  }
}

function applyNotificationMemory(notifications: AppNotification[], scope: string) {
  const memory = loadNotificationMemory(scope)
  const read = new Set(memory.read)
  const dismissed = new Set(memory.dismissed)
  return notifications
    .filter(notification => !dismissed.has(notificationSignature(notification)))
    .map(notification => ({
      ...notification,
      unread: notification.unread && !read.has(notificationSignature(notification)),
    }))
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>(INITIAL)
  const { profile } = useAuth()
  const { isDemo } = useDemo()
  const [refreshVersion, setRefreshVersion] = useState(0)
  const realtimeIssueRef = useRef<string | null>(null)
  const scope = isDemo ? "demo" : profile?.org_id ? `org:${profile.org_id}` : "anonymous"

  useEffect(() => {
    if (isDemo) {
      setNotifications(applyNotificationMemory(INITIAL, scope))
      return
    }
    if (!profile?.org_id) {
      setNotifications([])
      return
    }
    let cancelled = false
    void Promise.all([
      fetchProducts({ isDemo: false, orgId: profile.org_id }),
      fetchPurchaseOrders({ isDemo: false, orgId: profile.org_id }),
      fetchInvoices({ isDemo: false, orgId: profile.org_id }),
      fetchSalesOrders({ isDemo: false, orgId: profile.org_id }),
      fetchQuotations({ isDemo: false, orgId: profile.org_id }),
    ]).then(([productResult, purchaseResult, invoiceResult, salesResult, quotationResult]) => {
      if (cancelled) return
      const today = formatDateKeyUtc7()
      const next: AppNotification[] = []
      const timestamp = Date.now()
      for (const product of (productResult.data ?? []).filter((row: any) => Number(row.min_qty ?? 0) > 0 && Number(row.qty ?? 0) <= Number(row.min_qty ?? 0)).slice(0, 10)) {
        next.push({ id: timestamp + next.length, type: "warning", category: "inventory", titleVi: "Tồn kho thấp", titleEn: "Low Stock Alert", bodyVi: `${product.name} còn ${Number(product.qty ?? 0)} (tối thiểu: ${Number(product.min_qty ?? 0)}).`, bodyEn: `${product.name} has ${Number(product.qty ?? 0)} remaining (minimum: ${Number(product.min_qty ?? 0)}).`, timeVi: "Hiện tại", timeEn: "Now", unread: true, actionVi: "Xem tồn kho", actionEn: "View stock", navigateTo: "stock-balance", navigateSearch: product.sku ?? product.name, timestamp: new Date(product.updated_at ?? product.updated ?? timestamp).getTime() || timestamp })
      }
      for (const order of (purchaseResult.data ?? []).filter((row: any) => String(row.status).toLowerCase() === "pending approval").slice(0, 10)) {
        const amount = formatVnd(order.total)
        next.push({ id: timestamp + next.length, type: "pending", category: "purchase", titleVi: "PO chờ duyệt", titleEn: "PO Pending Approval", bodyVi: `${order.ref} (${order.supplier_name ?? ""} — ${amount} ₫) cần được phê duyệt.`, bodyEn: `${order.ref} (${order.supplier_name ?? ""} — ${amount} VND) needs approval.`, timeVi: "Đang chờ", timeEn: "Pending", unread: true, actionVi: "Xem đơn mua", actionEn: "View purchase order", navigateTo: "purchase-orders", navigateSearch: order.ref, timestamp: new Date(order.created_at ?? order.date ?? timestamp).getTime() || timestamp })
      }
      for (const order of (salesResult.data ?? []).filter((row: any) => String(row.status).toLowerCase() === "pending approval").slice(0, 10)) {
        const amount = formatVnd(order.total)
        next.push({ id: timestamp + next.length, type: "pending", category: "sales", titleVi: "Đơn bán chờ duyệt", titleEn: "Sales Order Pending Approval", bodyVi: `${order.ref} (${order.customer_name ?? ""} — ${amount} ₫) cần được phê duyệt.`, bodyEn: `${order.ref} (${order.customer_name ?? ""} — ${amount} VND) needs approval.`, timeVi: "Đang chờ", timeEn: "Pending", unread: true, actionVi: "Xem đơn bán", actionEn: "View sales order", navigateTo: "sales-orders", navigateSearch: order.ref, timestamp: new Date(order.created_at ?? order.date ?? timestamp).getTime() || timestamp })
      }
      for (const quotation of (quotationResult.data ?? []).slice(0, 30)) {
        const status = String(quotation.status).toLowerCase()
        if (status === "accepted") {
          next.push({ id: timestamp + next.length, type: "pending", category: "sales", titleVi: "Báo giá chờ phân bổ SKU", titleEn: "Quotation Awaiting SKU Allocation", bodyVi: `${quotation.id} của ${quotation.customer_name ?? "khách hàng"} đã được chấp thuận và cần phân bổ SKU.`, bodyEn: `${quotation.id} for ${quotation.customer_name ?? "the customer"} was accepted and needs SKU allocation.`, timeVi: "Chờ phân bổ", timeEn: "Awaiting allocation", unread: true, actionVi: "Mở báo giá", actionEn: "Open quotation", navigateTo: "quotations", navigateId: quotation.id, timestamp: new Date(quotation.updated_at ?? quotation.created_at ?? timestamp).getTime() || timestamp })
        } else if (status === "awaiting delivery") {
          next.push({ id: timestamp + next.length, type: "pending", category: "sales", titleVi: "Báo giá chờ giao hàng", titleEn: "Quotation Awaiting Delivery", bodyVi: `${quotation.id} đã phân bổ đủ SKU và đang chờ xuất giao.`, bodyEn: `${quotation.id} has been fully allocated and is ready for delivery.`, timeVi: "Chờ giao", timeEn: "Awaiting delivery", unread: true, actionVi: "Giao hàng", actionEn: "Deliver", navigateTo: "quotations", navigateId: quotation.id, timestamp: new Date(quotation.converted_at ?? quotation.updated_at ?? timestamp).getTime() || timestamp })
        } else if (status === "sent" && quotation.valid_until && String(quotation.valid_until) < today) {
          next.push({ id: timestamp + next.length, type: "warning", category: "sales", titleVi: "Báo giá đã hết hiệu lực", titleEn: "Quotation Expired", bodyVi: `${quotation.id} gửi cho ${quotation.customer_name ?? "khách hàng"} đã hết hiệu lực ngày ${quotation.valid_until}.`, bodyEn: `${quotation.id} for ${quotation.customer_name ?? "the customer"} expired on ${quotation.valid_until}.`, timeVi: "Đã hết hạn", timeEn: "Expired", unread: true, actionVi: "Kiểm tra báo giá", actionEn: "Review quotation", navigateTo: "quotations", navigateId: quotation.id, timestamp: new Date(quotation.updated_at ?? quotation.created_at ?? timestamp).getTime() || timestamp })
        }
      }
      for (const invoice of (invoiceResult.data ?? []).filter((row: any) => Number(row.outstanding_amount ?? 0) > 0 && row.due_date && String(row.due_date) < today && String(row.status).toLowerCase() !== "cancelled").slice(0, 10)) {
        const amount = formatVnd(invoice.outstanding_amount)
        next.push({ id: timestamp + next.length, type: "warning", category: "finance", titleVi: "Hóa đơn quá hạn", titleEn: "Invoice Overdue", bodyVi: `${invoice.ref} (${invoice.customer_name ?? ""}) còn phải thu ${amount} ₫.`, bodyEn: `${invoice.ref} (${invoice.customer_name ?? ""}) has ${amount} VND overdue.`, timeVi: "Quá hạn", timeEn: "Overdue", unread: true, actionVi: "Xem hóa đơn", actionEn: "View invoice", navigateTo: "invoices", navigateSearch: invoice.ref, timestamp: new Date(invoice.created_at ?? timestamp).getTime() || timestamp })
      }
      const sourceError = productResult.error ?? purchaseResult.error ?? invoiceResult.error ?? salesResult.error ?? quotationResult.error
      if (sourceError) {
        next.unshift({ id: timestamp - 1, type: "error", category: "system", titleVi: "Không thể tải đủ thông báo", titleEn: "Notifications could not be fully loaded", bodyVi: sourceError.message ?? String(sourceError), bodyEn: sourceError.message ?? String(sourceError), timeVi: "Hiện tại", timeEn: "Now", unread: true, navigateTo: "audit-logs", timestamp })
      }
      if (realtimeIssueRef.current) {
        next.unshift({ id: timestamp - 2, type: "warning", category: "system", titleVi: "Cập nhật realtime bị gián đoạn", titleEn: "Realtime Updates Interrupted", bodyVi: realtimeIssueRef.current, bodyEn: realtimeIssueRef.current, timeVi: "Hiện tại", timeEn: "Now", unread: true, timestamp })
      }
      setNotifications(applyNotificationMemory(next.sort((a, b) => b.timestamp - a.timestamp), scope))
    })
    return () => { cancelled = true }
  }, [isDemo, profile?.org_id, refreshVersion, scope])

  useEffect(() => {
    if (isDemo || !profile?.org_id) return
    let refreshTimer: number | undefined
    let disposed = false
    const refresh = () => {
      if (refreshTimer) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => setRefreshVersion(version => version + 1), 300)
    }
    const filter = `org_id=eq.${profile.org_id}`
    const channel = supabase.channel(`organization-notifications:${profile.org_id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_ledger", filter }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_orders", filter }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "sales_orders", filter }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices", filter }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "products", filter }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "quotations", filter }, refresh)
      .subscribe(status => {
        if (disposed) return
        if (status === "SUBSCRIBED") {
          realtimeIssueRef.current = null
          setNotifications(current => current.filter(notification => notification.titleEn !== "Realtime Updates Interrupted"))
          return
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          realtimeIssueRef.current = status === "TIMED_OUT"
            ? "Kết nối realtime hết thời gian chờ; hệ thống đang tự đồng bộ mỗi phút."
            : "Kết nối realtime gặp lỗi; hệ thống đang tự đồng bộ mỗi phút."
          refresh()
        }
      })
    const pollTimer = window.setInterval(refresh, 60_000)
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") refresh() }
    window.addEventListener("online", refresh)
    document.addEventListener("visibilitychange", refreshWhenVisible)
    return () => {
      disposed = true
      if (refreshTimer) window.clearTimeout(refreshTimer)
      window.clearInterval(pollTimer)
      window.removeEventListener("online", refresh)
      document.removeEventListener("visibilitychange", refreshWhenVisible)
      void supabase.removeChannel(channel)
    }
  }, [isDemo, profile?.org_id])

  const markRead = useCallback((id: number) => setNotifications(current => {
    const target = current.find(notification => notification.id === id)
    if (target) {
      const memory = loadNotificationMemory(scope)
      memory.read.push(notificationSignature(target))
      saveNotificationMemory(scope, memory)
    }
    return current.map(notification => notification.id === id ? { ...notification, unread: false } : notification)
  }), [scope])

  const markAllRead = useCallback(() => setNotifications(current => {
    const memory = loadNotificationMemory(scope)
    memory.read.push(...current.map(notificationSignature))
    saveNotificationMemory(scope, memory)
    return current.map(notification => ({ ...notification, unread: false }))
  }), [scope])

  const dismiss = useCallback((id: number) => setNotifications(current => {
    const target = current.find(notification => notification.id === id)
    if (target) {
      const memory = loadNotificationMemory(scope)
      memory.dismissed.push(notificationSignature(target))
      saveNotificationMemory(scope, memory)
    }
    return current.filter(notification => notification.id !== id)
  }), [scope])

  const dismissAll = useCallback(() => setNotifications(current => {
    const memory = loadNotificationMemory(scope)
    memory.dismissed.push(...current.map(notificationSignature))
    saveNotificationMemory(scope, memory)
    return []
  }), [scope])

  const add = useCallback((n: Omit<AppNotification, "id" | "timestamp">) =>
    setNotifications(p => [{ ...n, id: Date.now(), timestamp: Date.now() }, ...p]), [])

  const unreadCount = notifications.filter(n => n.unread).length

  return (
    <Ctx.Provider value={{ notifications, unreadCount, markRead, markAllRead, dismiss, dismissAll, add }}>
      {children}
    </Ctx.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useNotifications must be inside NotificationProvider")
  return ctx
}
