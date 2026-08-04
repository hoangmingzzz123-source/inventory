import { useState } from "react"
import { useAuth } from "../contexts/AuthContext"
import { Eye, EyeOff, Loader2, AlertCircle, Package, ArrowRight, Check } from "lucide-react"

type Mode = "login" | "signup"

export default function AuthScreen() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<Mode>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [orgName, setOrgName] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    if (mode === "login") {
      const { error } = await signIn(email, password)
      if (error) setError(error)
    } else {
      if (!fullName.trim()) { setError("Vui lòng nhập họ tên."); setLoading(false); return }
      if (!orgName.trim()) { setError("Vui lòng nhập tên công ty."); setLoading(false); return }
      if (password.length < 6) { setError("Mật khẩu tối thiểu 6 ký tự."); setLoading(false); return }
      const { error } = await signUp(email, password, fullName, orgName)
      if (error) setError(error)
      else setSuccess("Tài khoản đã tạo! Kiểm tra email để xác nhận rồi đăng nhập.")
    }
    setLoading(false)
  }

  const switchMode = (m: Mode) => {
    setMode(m); setError(null); setSuccess(null)
    setEmail(""); setPassword(""); setFullName(""); setOrgName("")
  }

  return (
    <div className="min-h-screen flex" style={{ background: "#f8fafc" }}>
      {/* Left — branding */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] flex-shrink-0 bg-blue-700 text-white p-10">
        <div>
          <div className="flex items-center gap-2.5 mb-12">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
              <Package size={18} className="text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">WarehouseOS</span>
          </div>
          <h1 className="text-3xl font-bold leading-snug mb-4">
            Quản lý kho hàng<br />thông minh, hiệu quả
          </h1>
          <p className="text-blue-200 text-sm leading-relaxed">
            Hệ thống ERP tích hợp toàn diện — từ nhập kho, xuất kho đến báo cáo tài chính realtime.
          </p>
          <div className="mt-8 space-y-3">
            {[
              "Quản lý đa kho, đa chi nhánh",
              "Đơn mua & đơn bán, hóa đơn tự động",
              "Báo cáo Recharts realtime",
              "Phân quyền người dùng linh hoạt",
            ].map(f => (
              <div key={f} className="flex items-center gap-2 text-sm text-blue-100">
                <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                  <Check size={11} className="text-white" />
                </div>
                {f}
              </div>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-blue-300">© 2026 WarehouseOS. Dữ liệu demo chỉ để minh họa.</p>
      </div>

      {/* Right — form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[400px]">
          {/* Logo mobile */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center">
              <Package size={16} className="text-white" />
            </div>
            <span className="text-lg font-bold text-slate-900">WarehouseOS</span>
          </div>

          {/* Tab toggle */}
          <div className="flex rounded-xl bg-slate-100 p-1 mb-6">
            {(["login", "signup"] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`flex-1 h-8 rounded-lg text-sm font-medium transition-all ${mode === m ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
              >
                {m === "login" ? "Đăng nhập" : "Đăng ký"}
              </button>
            ))}
          </div>

          <h2 className="text-lg font-semibold text-slate-900 mb-1">
            {mode === "login" ? "Chào mừng trở lại" : "Tạo tài khoản mới"}
          </h2>
          <p className="text-sm text-slate-400 mb-6">
            {mode === "login" ? "Đăng nhập vào hệ thống quản lý kho." : "Bắt đầu quản lý kho của bạn miễn phí."}
          </p>

          {success && (
            <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-4 text-sm text-emerald-700">
              <Check size={15} className="mt-0.5 flex-shrink-0" /> {success}
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-sm text-red-700">
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Họ và tên *</label>
                  <input
                    type="text" required value={fullName} onChange={e => setFullName(e.target.value)}
                    placeholder="Nguyễn Văn A"
                    className="w-full h-10 px-3 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 bg-white"
                    style={{ borderColor: "#e2e8f0" }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Tên công ty / Tổ chức *</label>
                  <input
                    type="text" required value={orgName} onChange={e => setOrgName(e.target.value)}
                    placeholder="Công ty TNHH ABC"
                    className="w-full h-10 px-3 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 bg-white"
                    style={{ borderColor: "#e2e8f0" }}
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Email *</label>
              <input
                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full h-10 px-3 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 bg-white"
                style={{ borderColor: "#e2e8f0" }}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Mật khẩu *</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"} required value={password} onChange={e => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "Tối thiểu 6 ký tự" : "••••••••"}
                  className="w-full h-10 pl-3 pr-10 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 bg-white"
                  style={{ borderColor: "#e2e8f0" }}
                />
                <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {mode === "login" && (
                <button type="button" className="text-[11px] text-blue-600 hover:underline mt-1 float-right">
                  Quên mật khẩu?
                </button>
              )}
            </div>

            <button
              type="submit" disabled={loading}
              className="w-full h-10 rounded-xl bg-blue-600 text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-60 transition-colors mt-2"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? "Đang xử lý..." : mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}
              {!loading && <ArrowRight size={15} />}
            </button>
          </form>

          {/* Demo mode access */}
          <div className="mt-6 pt-5 border-t" style={{ borderColor: "#e2e8f0" }}>
            <p className="text-xs text-slate-400 text-center mb-3">Muốn xem thử trước khi đăng ký?</p>
            <a
              href="?demo=true"
              onClick={e => { e.preventDefault(); window.location.search = "?demo=true" }}
              className="w-full h-9 rounded-xl border text-sm text-slate-600 flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors"
              style={{ borderColor: "#e2e8f0" }}
            >
              <Package size={14} className="text-slate-400" />
              Khám phá Demo (không cần đăng nhập)
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
