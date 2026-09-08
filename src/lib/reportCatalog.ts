export type ReportCatalogMetrics = {
  skuCount: number
  revenueMillions: number
  purchaseCount: number
  cashMillions: number
}

export function getReportCatalog(lang: string, translate: (key: any) => string, metrics: ReportCatalogMetrics) {
  const vi = lang === "vi"
  return [
    {
      name: translate("inventoryReports"), color: "text-blue-700", bg: "bg-blue-50", border: "#dbeafe", icon: "inventory",
      kpi: { label: vi ? `${metrics.skuCount} SKU đang hoạt động` : `${metrics.skuCount} active SKUs`, trend: "up" as const },
      reports: vi ? ["Tồn kho hiện tại", "Sổ kho", "Giá trị tồn kho", "Tồn kho thấp", "Hàng chậm luân chuyển", "Hàng nhanh luân chuyển"] : ["Stock Balance", "Stock Ledger", "Inventory Value", "Low Stock", "Slow Moving", "Fast Moving"],
      reportKeys: ["Tồn kho hiện tại", "Sổ kho", "Giá trị tồn kho", "Tồn kho thấp", "Hàng chậm luân chuyển", "Hàng nhanh luân chuyển"],
    },
    {
      name: translate("salesReports"), color: "text-emerald-700", bg: "bg-emerald-50", border: "#d1fae5", icon: "sales",
      kpi: { label: vi ? `${metrics.revenueMillions} triệu doanh thu` : `${metrics.revenueMillions}M revenue`, trend: "up" as const },
      reports: vi ? ["Doanh thu tổng hợp", "Lãi gộp", "Xếp hạng khách hàng", "Xếp hạng sản phẩm", "Doanh thu theo nhân viên"] : ["Revenue Summary", "Gross Profit", "Customer Ranking", "Product Ranking", "Sales by Employee"],
      reportKeys: ["Doanh thu tổng hợp", "Lãi gộp", "Xếp hạng khách hàng", "Xếp hạng sản phẩm", "Doanh thu theo nhân viên"],
    },
    {
      name: translate("purchaseReports"), color: "text-violet-700", bg: "bg-violet-50", border: "#ede9fe", icon: "purchase",
      kpi: { label: vi ? `${metrics.purchaseCount} đơn mua` : `${metrics.purchaseCount} POs`, trend: "up" as const },
      reports: vi ? ["Tổng hợp mua hàng", "Xếp hạng nhà cung cấp", "Xu hướng mua hàng", "Tổng hợp nhập kho"] : ["Purchase Summary", "Supplier Ranking", "Purchase Trend", "GRN Summary"],
      reportKeys: ["Tổng hợp mua hàng", "Xếp hạng nhà cung cấp", "Xu hướng mua hàng", "Tổng hợp nhập kho"],
    },
    {
      name: translate("financeReports"), color: "text-amber-700", bg: "bg-amber-50", border: "#fef3c7", icon: "finance",
      kpi: { label: vi ? `${metrics.cashMillions} triệu số dư quỹ` : `${metrics.cashMillions}M cash balance`, trend: "up" as const },
      reports: vi ? ["Lưu chuyển tiền tệ", "Tuổi nợ phải thu", "Tuổi nợ phải trả", "Sổ quỹ ngày", "Tổng hợp chi phí"] : ["Cash Flow", "Receivable Aging", "Payable Aging", "Daily Cash Book", "Expense Summary"],
      reportKeys: ["Lưu chuyển tiền tệ", "Tuổi nợ phải thu", "Tuổi nợ phải trả", "Sổ quỹ ngày", "Tổng hợp chi phí"],
    },
  ]
}
