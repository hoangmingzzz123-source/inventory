import { useLang } from "../i18n/LangContext"

const statusConfig: Record<string, { bg: string; text: string; dot: string }> = {
  Active: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  Inactive: { bg: "bg-slate-100", text: "text-slate-500", dot: "bg-slate-400" },
  Draft: { bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" },
  Submitted: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  Pending: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-400" },
  "Pending Approval": { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  Approved: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  Receiving: { bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500" },
  "In Transit": { bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500" },
  Completed: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  Closed: { bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" },
  Cancelled: { bg: "bg-red-50", text: "text-red-600", dot: "bg-red-500" },
  Delivered: { bg: "bg-teal-50", text: "text-teal-700", dot: "bg-teal-500" },
  Available: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  Reserved: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  Sold: { bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" },
  Paid: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  Partial: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  Overdue: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
}

const viStatusMap: Record<string, string> = {
  Active: "Đang hoạt động",
  Inactive: "Ngừng hoạt động",
  Draft: "Nháp",
  Submitted: "Đã gửi duyệt",
  Pending: "Chờ xử lý",
  "Pending Approval": "Chờ duyệt",
  Approved: "Đã duyệt",
  Receiving: "Đang nhận hàng",
  "In Transit": "Đang vận chuyển",
  Completed: "Hoàn tất",
  Closed: "Đã đóng",
  Cancelled: "Đã hủy",
  Delivered: "Đã giao",
  Available: "Khả dụng",
  Reserved: "Đang giữ",
  Sold: "Đã bán",
  Paid: "Đã thanh toán",
  Partial: "Thanh toán một phần",
  Overdue: "Quá hạn",
}

export default function StatusBadge({ status }: { status: string }) {
  const { lang } = useLang()
  const cfg = statusConfig[status] ?? { bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" }
  const label = lang === "vi" ? (viStatusMap[status] ?? status) : status
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.bg} ${cfg.text} whitespace-nowrap`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {label}
    </span>
  )
}
