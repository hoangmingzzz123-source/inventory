import { TrendingUp, TrendingDown, AlertTriangle, Activity, ShoppingCart, Package, ArrowRight } from "lucide-react"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { useState, useEffect } from "react"
import { kpiData, revenueData, inventoryDonutData, lowStockItems, recentActivities, quotations as mockQuotations } from "../data/mockData"
import { useLang } from "../i18n/LangContext"
import { useDemo } from "../contexts/DemoContext"
import { useAuth } from "../contexts/AuthContext"
import { fetchQuotations } from "../lib/dataService"

function fmt(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n)
}

const activityIcon: Record<string, React.ReactNode> = {
  purchase: <ShoppingCart size={13} className="text-blue-500" />,
  sales: <TrendingUp size={13} className="text-emerald-500" />,
  inventory: <Package size={13} className="text-violet-500" />,
  system: <Activity size={13} className="text-slate-400" />,
}

const periodLabels = {
  vi: ["Hôm nay", "Tuần", "Tháng", "Quý"],
  en: ["Today", "Week", "Month", "Quarter"],
}

export default function Dashboard() {
  const { t, lang } = useLang()
  const periods = periodLabels[lang]
  const { isDemo } = useDemo()
  const { profile } = useAuth()

  const [quotationsData, setQuotationsData] = useState<any[]>(mockQuotations)

  useEffect(() => {
    fetchQuotations({ isDemo, orgId: profile?.org_id }).then(res => { if (res.data) setQuotationsData(res.data) })
  }, [isDemo, profile])

  const kpiLabels = {
    vi: [
      { label: "Doanh thu hôm nay", value: "₫24.580.000", change: "+12,5%", trend: "up", sub: "so với hôm qua" },
      { label: "Đơn bán hôm nay", value: "48", change: "+8,3%", trend: "up", sub: "đơn bán hàng" },
      { label: "Mua hàng hôm nay", value: "₫8.200.000", change: "-3,1%", trend: "down", sub: "so với hôm qua" },
      { label: "Giá trị tồn kho", value: "₫1,24 Tỷ", change: "+0,8%", trend: "up", sub: "tổng giá trị kho" },
      { label: "Phải thu", value: "₫185.000.000", change: "+5,2%", trend: "up", sub: "đang tồn đọng" },
      { label: "Phải trả", value: "₫62.400.000", change: "-8,9%", trend: "down", sub: "đang tồn đọng" },
    ],
    en: kpiData,
  }

  const kpis = kpiLabels[lang]

  return (
    <div className="p-5 space-y-4 max-w-screen-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-slate-900">{t("dashboard")}</h1>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {lang === "vi" ? "Thứ Hai, 04 tháng 8 năm 2026 — Vừa cập nhật" : "Monday, August 04, 2026 — Refreshed just now"}
          </p>
        </div>
        <div className="flex gap-1.5">
          {periods.map((p, i) => (
            <button key={p} className={`h-7 px-3 rounded-md text-xs font-medium transition-colors ${i === 0 ? "bg-blue-600 text-white" : "bg-white border text-slate-600 hover:bg-slate-50"}`} style={i !== 0 ? { borderColor: "var(--border)" } : {}}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white rounded-xl border p-4 flex flex-col gap-2" style={{ borderColor: "var(--border)" }}>
            <div className="text-[11px] text-slate-500 font-medium leading-tight">{k.label}</div>
            <div className="text-lg font-bold text-slate-900 mono leading-none">{k.value}</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`flex items-center gap-0.5 text-[11px] font-semibold ${k.trend === "up" ? "text-emerald-600" : "text-red-500"}`}>
                {k.trend === "up" ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {k.change}
              </span>
              <span className="text-[10px] text-slate-400">{k.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue Area Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">
                {lang === "vi" ? "Doanh thu & Mua hàng" : "Revenue & Purchase"}
              </h2>
              <p className="text-[11px] text-slate-400">{lang === "vi" ? "Triệu VNĐ, năm 2026" : "Million VND, 2026"}</p>
            </div>
            <div className="flex gap-3">
              {[
                { color: "#2563eb", label: lang === "vi" ? "Doanh thu" : "Revenue" },
                { color: "#7c3aed", label: lang === "vi" ? "Mua hàng" : "Purchase" },
                { color: "#10b981", label: lang === "vi" ? "Bán hàng" : "Sales" },
              ].map(l => (
                <span key={l.label} className="flex items-center gap-1 text-[11px] text-slate-500">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: l.color }} />
                  {l.label}
                </span>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={196}>
            <AreaChart data={revenueData} margin={{ top: 0, right: 0, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gPur" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.10} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }} itemStyle={{ color: "#475569" }} />
              <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} fill="url(#gRev)" />
              <Area type="monotone" dataKey="purchase" stroke="#7c3aed" strokeWidth={2} fill="url(#gPur)" />
              <Area type="monotone" dataKey="sales" stroke="#10b981" strokeWidth={2} fill="none" strokeDasharray="5 3" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Donut */}
        <div className="bg-white rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-sm font-semibold text-slate-800 mb-0.5">{t("inventoryByCategory")}</h2>
          <p className="text-[11px] text-slate-400 mb-2">{lang === "vi" ? "Theo % giá trị tồn kho" : "By stock value %"}</p>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={inventoryDonutData} cx="50%" cy="50%" innerRadius={48} outerRadius={68} dataKey="value" paddingAngle={2}>
                {inventoryDonutData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-1">
            {inventoryDonutData.map(d => (
              <div key={d.name} className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.fill }} />
                  {d.name}
                </span>
                <span className="font-semibold text-slate-800 mono">{d.value}%</span>
              </div>
            ))}
          </div>
        </div>
        {/* Quotations status chart */}
        <div className="lg:col-span-3 bg-white rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">{lang === 'vi' ? 'Báo giá' : 'Quotations'}</h2>
              <p className="text-[11px] text-slate-400">{lang === 'vi' ? 'Phân bố theo trạng thái' : 'Distribution by status'}</p>
            </div>
          </div>
          <div className="flex gap-4 items-center">
            <div style={{ width: 240, height: 160 }}>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie dataKey="value" data={Object.entries(quotationsData.reduce((acc: any, q: any) => ({ ...acc, [q.status || 'Unknown']: (acc[q.status || 'Unknown'] || 0) + 1 }), {})).map(([k, v]) => ({ name: k, value: v }))} innerRadius={36} outerRadius={68} paddingAngle={3}>
                    {Object.entries(quotationsData.reduce((acc: any, q: any) => ({ ...acc, [q.status || 'Unknown']: (acc[q.status || 'Unknown'] || 0) + 1 }), {})).map((entry, i) => (
                      <Cell key={i} fill={["#2563eb", "#7c3aed", "#10b981", "#ef4444", "#f59e0b"][i % 5]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1">
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(quotationsData.reduce((acc: any, q: any) => ({ ...acc, [q.status || 'Unknown']: (acc[q.status || 'Unknown'] || 0) + 1 }), {})).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-sm px-2 py-1 border rounded" style={{ borderColor: 'var(--border)' }}>
                    <span className="text-slate-700">{k}</span>
                    <span className="font-semibold text-slate-900 mono">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Low Stock */}
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-500" />
              <h3 className="text-sm font-semibold text-slate-800">{t("lowStockAlert")}</h3>
              <span className="text-[11px] bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-semibold">{lowStockItems.length}</span>
            </div>
            <button className="text-[11px] text-blue-600 hover:underline flex items-center gap-0.5">{t("viewAll")} <ArrowRight size={11} /></button>
          </div>
          {lowStockItems.map(item => (
            <div key={item.sku} className="flex items-center gap-3 px-4 py-2.5 border-b last:border-0 hover:bg-slate-50/60" style={{ borderColor: "var(--border)" }}>
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                <Package size={14} className="text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-slate-800 truncate">{item.name}</div>
                <div className="text-[11px] text-slate-400 mono">{item.sku} · {item.warehouse}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-bold text-amber-600 mono">{item.qty}</div>
                <div className="text-[10px] text-slate-400">{lang === "vi" ? "Tối thiểu" : "Min"}: {item.min}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-800">{t("recentActivity")}</h3>
            </div>
            <button className="text-[11px] text-blue-600 hover:underline flex items-center gap-0.5">{t("viewAll")} <ArrowRight size={11} /></button>
          </div>
          {recentActivities.map((act, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-2.5 border-b last:border-0 hover:bg-slate-50/60" style={{ borderColor: "var(--border)" }}>
              <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                {activityIcon[act.type]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-slate-700 leading-relaxed">{act.text}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[11px] text-slate-400">{act.time}</span>
                  <span className="text-[11px] text-slate-300">·</span>
                  <span className="text-[11px] text-blue-600">{act.user}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
