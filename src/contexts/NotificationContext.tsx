import { createContext, useContext, useState, useCallback, type ReactNode } from "react"

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

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>(INITIAL)

  const markRead = useCallback((id: number) =>
    setNotifications(p => p.map(n => n.id === id ? { ...n, unread: false } : n)), [])

  const markAllRead = useCallback(() =>
    setNotifications(p => p.map(n => ({ ...n, unread: false }))), [])

  const dismiss = useCallback((id: number) =>
    setNotifications(p => p.filter(n => n.id !== id)), [])

  const dismissAll = useCallback(() => setNotifications([]), [])

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
