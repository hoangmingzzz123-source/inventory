const fs = require('fs');
let code = fs.readFileSync('src/screens/Dashboard.tsx', 'utf8');

code = code.replace(
  'import { kpiData, revenueData, inventoryDonutData, lowStockItems, recentActivities } from "../data/mockData"',
  'import { kpiData, revenueData, inventoryDonutData, lowStockItems, recentActivities, quotations } from "../data/mockData"'
);

const newKpiSection = `
        {/* KPI Row 2: Quotations & Profits */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: lang === "vi" ? "Tổng Báo giá" : "Total Quotes", value: quotations.length.toString(), change: "+5%", trend: "up", sub: lang === "vi" ? "báo giá đã lập" : "quotes created" },
            { label: lang === "vi" ? "Tỷ lệ đồng ý" : "Accept Rate", value: Math.round((quotations.filter(q => q.status === "accepted" || q.status === "converted").length / (quotations.length || 1)) * 100) + "%", change: "+2%", trend: "up", sub: lang === "vi" ? "trung bình" : "average" },
            { label: lang === "vi" ? "Chờ duyệt" : "Pending", value: quotations.filter(q => q.status === "pending").length.toString(), change: "", trend: "none", sub: lang === "vi" ? "báo giá đang chờ" : "pending quotes" },
            { label: lang === "vi" ? "Giá trị Báo giá" : "Quote Value", value: "₫" + fmt(quotations.reduce((acc, q) => acc + (q.total || 0), 0)), change: "+15%", trend: "up", sub: lang === "vi" ? "tổng tiền chốt" : "total finalized" },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-2xl p-5 border shadow-sm" style={{ borderColor: "var(--border)" }}>
              <div className="text-xs font-medium text-slate-500 mb-1">{k.label}</div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-xl font-bold text-slate-900">{k.value}</span>
                {k.trend !== "none" && (
                  <span className={\`flex items-center text-[10px] font-bold \${k.trend === "up" ? "text-emerald-600" : "text-red-500"}\`}>
                    {k.trend === "up" ? <TrendingUp size={11} className="mr-0.5" /> : <TrendingDown size={11} className="mr-0.5" />}
                    {k.change}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-400">{k.sub}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">`;

code = code.replace('<div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">', newKpiSection);

fs.writeFileSync('src/screens/Dashboard.tsx', code);
