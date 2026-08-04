import { FlaskConical, X, LogIn } from "lucide-react"
import { useLang } from "../i18n/LangContext"

interface DemoBannerProps {
  onGoLive: () => void
}

export default function DemoBanner({ onGoLive }: DemoBannerProps) {
  const { lang } = useLang()
  const vi = lang === "vi"

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-xs font-medium flex-shrink-0" style={{ background: "#fef3c7", borderBottom: "1px solid #fde68a" }}>
      <FlaskConical size={13} className="text-amber-600 flex-shrink-0" />
      <span className="text-amber-800 flex-1">
        {vi
          ? "Chế độ Demo — Tất cả dữ liệu chỉ là minh họa, không lưu trữ thực tế."
          : "Demo Mode — All data is illustrative only and not persisted."}
      </span>
      <button
        onClick={onGoLive}
        className="flex items-center gap-1 h-6 px-2.5 rounded-lg bg-blue-600 text-white text-[11px] font-semibold hover:bg-blue-700 transition-colors flex-shrink-0"
      >
        <LogIn size={11} />
        {vi ? "Đăng nhập để dùng thật" : "Sign in for live data"}
      </button>
    </div>
  )
}
