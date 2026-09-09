import { useState, useEffect, useMemo } from "react"
import { Plus, Search, FileSpreadsheet, Download, Check, X, FileText, Save, Info, ExternalLink, Edit, Trash2, Send, Ban } from "lucide-react"
import StatusBadge from "../components/StatusBadge"
import { useLang } from "../i18n/LangContext"
import { quotations as mockQuotations, products, suppliers } from "../data/mockData"
import { exportCsv, exportXlsx, Toolbar } from "./GenericList"
import { useDemo } from "../contexts/DemoContext"
import { useAuth } from "../contexts/AuthContext"
import { fetchQuotations, upsertQuotation, deleteQuotation, fetchProducts, fetchSuppliers, fetchCustomers, fetchWarehouses, fetchLatestImport, receiveQuotation } from "../lib/dataService"
import { defaultCompanySettings, loadCompanySettings } from "../lib/companySettings"
import logoUrl from "../data/logo.png"
import { formatDateKeyUtc7, formatDateTimeUtc7 } from "../lib/dateUtils"
import { confirmAppAction, showAppToast } from "../lib/appEvents"

function fmt(n: number) { return new Intl.NumberFormat("vi-VN").format(n) }

function quotationFileName(quotationId: string | undefined, extension: string) {
  return `quotation-${quotationId || "new"}.${extension}`
}

async function exportQuotationExcel(data: { id?: string; company: typeof defaultCompanySettings; customer: any; date: string; validUntil: string; notes: string; items: any[]; subtotal: number; discountAmount: number; totalBeforeVat: number; totalVat: number; finalTotal: number }, vi: boolean) {
  const { default: ExcelJS } = await import("exceljs")
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(vi ? "Báo giá" : "Quotation", { views: [{ state: "frozen", ySplit: 20 }] })
  sheet.columns = [{ width: 28 }, { width: 24 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 18 }]
  const response = await fetch(logoUrl)
  const logoBuffer = await response.arrayBuffer()
  const logoId = workbook.addImage({ buffer: logoBuffer, extension: "png" })
  sheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 115, height: 48 } })
  sheet.mergeCells("B1:G2")
  sheet.getCell("B1").value = vi ? "BÁO GIÁ" : "QUOTATION"
  sheet.getCell("B1").font = { bold: true, size: 20, color: { argb: "FF1D4ED8" } }
  sheet.getCell("B1").alignment = { horizontal: "center", vertical: "middle" }

  const border = { top: { style: "thin", color: { argb: "FFD1D5DB" } }, bottom: { style: "thin", color: { argb: "FFD1D5DB" } }, left: { style: "thin", color: { argb: "FFD1D5DB" } }, right: { style: "thin", color: { argb: "FFD1D5DB" } } } as const
  const styleInfo = (row: number, title: string, value: string) => {
    sheet.getCell(row, 1).value = title
    sheet.getCell(row, 2).value = value
    sheet.mergeCells(row, 2, row, 7)
    for (let col = 1; col <= 7; col++) sheet.getCell(row, col).border = border
    sheet.getCell(row, 1).font = { bold: true, color: { argb: "FF475569" } }
    sheet.getCell(row, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } }
    sheet.getCell(row, 2).alignment = { wrapText: true, vertical: "middle" }
  }
  styleInfo(4, vi ? "CÔNG TY" : "COMPANY", data.company.name)
  styleInfo(5, vi ? "Người đại diện" : "Representative", data.company.representative)
  styleInfo(6, "MST", data.company.taxId)
  styleInfo(7, vi ? "Địa chỉ" : "Address", data.company.address)
  styleInfo(8, vi ? "Điện thoại" : "Phone", data.company.phone)
  sheet.mergeCells("A10:G10")
  sheet.getCell("A10").value = vi ? "THÔNG TIN KHÁCH HÀNG" : "CUSTOMER INFORMATION"
  sheet.getCell("A10").font = { bold: true, color: { argb: "FFFFFFFF" } }
  sheet.getCell("A10").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } }
  sheet.getCell("A10").alignment = { horizontal: "center", vertical: "middle" }
  styleInfo(11, vi ? "Tên khách hàng" : "Customer", data.customer.name)
  styleInfo(12, vi ? "Người đại diện" : "Representative", data.customer.representative || "")
  styleInfo(13, vi ? "Địa chỉ" : "Address", data.customer.address || "")
  styleInfo(14, vi ? "Điện thoại" : "Phone", data.customer.phone || "")
  styleInfo(15, "Email", data.customer.email || "")
  styleInfo(16, "MST", data.customer.tax_code || "")
  styleInfo(17, vi ? "Mã báo giá" : "Quotation ID", data.id || "")
  styleInfo(18, vi ? "Ngày lập" : "Date", data.date)
  styleInfo(19, vi ? "Hiệu lực đến" : "Valid until", data.validUntil)
  const header = sheet.addRow([vi ? "Sản phẩm" : "Product", vi ? "Nhà cung cấp" : "Supplier", vi ? "Đơn vị" : "Unit", vi ? "Số lượng" : "Quantity", vi ? "Đơn giá" : "Unit price", "VAT %", vi ? "Thành tiền" : "Amount"])
  header.height = 30
  header.eachCell(cell => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } }; cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; cell.border = border })
  for (const item of data.items) {
    const row = sheet.addRow([item.productName || item.product_id, item.supplierName || item.supplier_id, item.sell_unit, item.qty, item.selling_price, item.vat_pct, item.total])
    row.eachCell((cell, col) => { cell.border = border; cell.alignment = { vertical: "middle", horizontal: col >= 4 ? "right" : "left" }; if (col === 5 || col === 7) cell.numFmt = "#,##0" })
  }
  const summary = [[vi ? "Cộng tiền hàng" : "Subtotal", data.subtotal], [vi ? "Chiết khấu" : "Discount", data.discountAmount], [vi ? "Tiền trước VAT" : "Before VAT", data.totalBeforeVat], [vi ? "Tổng VAT" : "Total VAT", data.totalVat], [vi ? "Tổng thanh toán" : "Grand total", data.finalTotal]]
  sheet.addRow([])
  summary.forEach(([label, value], index) => {
    const row = sheet.addRow([label, value])
    row.getCell(1).alignment = { horizontal: "right" }
    row.getCell(2).alignment = { horizontal: "right" }
    row.getCell(2).numFmt = "#,##0"
    row.getCell(1).font = { bold: index === summary.length - 1, color: { argb: index === summary.length - 1 ? "FF1D4ED8" : "FF475569" } }
    row.getCell(2).font = { bold: true, color: { argb: index === summary.length - 1 ? "FF1D4ED8" : "FF0F172A" } }
  })
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  const url = URL.createObjectURL(blob)
  const link = window.document.createElement("a")
  link.href = url
  link.download = quotationFileName(data.id, "xlsx")
  link.click()
  URL.revokeObjectURL(url)
}

async function exportQuotationPdf(data: { id?: string; company: typeof defaultCompanySettings; customer: any; date: string; validUntil: string; notes: string; items: any[]; subtotal: number; discountAmount: number; totalBeforeVat: number; totalVat: number; finalTotal: number }, vi: boolean) {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")])
  const labels = vi ? { title: "BÁO GIÁ", id: "Mã báo giá", customer: "Khách hàng", date: "Ngày lập", valid: "Hiệu lực đến", product: "Sản phẩm", unit: "Đơn vị", qty: "Số lượng", price: "Đơn giá", vat: "VAT %", amount: "Thành tiền", subtotal: "Cộng tiền hàng", discount: "Chiết khấu", beforeVat: "Tiền trước VAT", totalVat: "Tổng VAT", total: "Tổng thanh toán" } : { title: "QUOTATION", id: "Quotation ID", customer: "Customer", date: "Date", valid: "Valid until", product: "Product", unit: "Unit", qty: "Quantity", price: "Unit price", vat: "VAT %", amount: "Amount", subtotal: "Subtotal", discount: "Discount", beforeVat: "Before VAT", totalVat: "Total VAT", total: "Grand total" }
  const escape = (value: unknown) => String(value ?? "").replace(/[&<>\"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[character] || character))
  const itemRows = data.items.map(item => `<tr><td>${escape(item.productName || item.product_id)}</td><td>${escape(item.sell_unit)}</td><td class="number">${item.qty}</td><td class="number">${fmt(item.selling_price)}</td><td class="number">${item.vat_pct}%</td><td class="number">${fmt(item.total)}</td></tr>`).join("")
  const html = `<div style="width:794px; padding:42px; background:#fff; color:#0f172a; font-family:Arial,sans-serif; font-size:14px; line-height:1.45;">
    <h1 style="margin:0 0 24px; text-align:center; color:#1d4ed8; font-size:28px;">${labels.title}</h1>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:28px; margin-bottom:22px;">
      <div style="display:flex; gap:14px; align-items:flex-start;"><img src="${logoUrl}" alt="Logo" style="width:86px; height:58px; object-fit:contain;" /><div><strong style="font-size:17px;">${escape(data.company.name)}</strong><div>${vi ? "Người đại diện" : "Representative"}: ${escape(data.company.representative)}</div><div>${vi ? "MST" : "Tax ID"}: ${escape(data.company.taxId)}</div><div>${vi ? "Địa chỉ" : "Address"}: ${escape(data.company.address)}</div><div>${vi ? "Điện thoại" : "Phone"}: ${escape(data.company.phone)}</div></div></div>
      <div><strong>${vi ? "THÔNG TIN KHÁCH HÀNG" : "CUSTOMER INFORMATION"}</strong><div>${escape(data.customer.name)}</div><div>${vi ? "Người đại diện" : "Representative"}: ${escape(data.customer.representative)}</div><div>${vi ? "MST" : "Tax ID"}: ${escape(data.customer.tax_code)}</div><div>${vi ? "Địa chỉ" : "Address"}: ${escape(data.customer.address)}</div><div>${vi ? "Điện thoại" : "Phone"}: ${escape(data.customer.phone)}</div><div>${vi ? "Email" : "Email"}: ${escape(data.customer.email)}</div></div>
    </div>
    <div style="display:flex; justify-content:space-between; margin-bottom:16px;"><span><strong>${labels.id}:</strong> ${escape(data.id)}</span><span><strong>${labels.date}:</strong> ${escape(data.date)}</span><span><strong>${labels.valid}:</strong> ${escape(data.validUntil)}</span></div>
    <table style="width:100%; border-collapse:collapse;"><thead><tr style="background:#2563eb; color:#fff;">${[labels.product, labels.unit, labels.qty, labels.price, labels.vat, labels.amount].map(label => `<th style="padding:10px 8px; border:1px solid #d1d5db; text-align:left;">${label}</th>`).join("")}</tr></thead><tbody>${itemRows}</tbody></table>
    <div style="margin:22px 0 0 auto; width:330px;">${[[labels.subtotal, data.subtotal], [labels.discount, data.discountAmount], [labels.beforeVat, data.totalBeforeVat], [labels.totalVat, data.totalVat]].map(row => `<div style="display:flex; justify-content:space-between; padding:5px 0;"><span>${row[0]}</span><strong>${fmt(Number(row[1]))}</strong></div>`).join("")}<div style="display:flex; justify-content:space-between; border-top:2px solid #1d4ed8; padding-top:9px; color:#1d4ed8; font-size:17px;"><strong>${labels.total}</strong><strong>${fmt(data.finalTotal)}</strong></div></div>
    ${data.notes ? `<div style="margin-top:24px;"><strong>${vi ? "Ghi chú" : "Notes"}:</strong> ${escape(data.notes)}</div>` : ""}
  </div>`
  const container = window.document.createElement("div")
  container.innerHTML = html
  container.style.position = "fixed"
  container.style.left = "-10000px"
  container.style.top = "0"
  window.document.body.appendChild(container)
  try {
    const canvas = await html2canvas(container.firstElementChild as HTMLElement, { scale: 2, backgroundColor: "#ffffff", useCORS: true })
    const document = new jsPDF({ unit: "mm", format: "a4" })
    const pageWidth = document.internal.pageSize.getWidth()
    const pageHeight = document.internal.pageSize.getHeight()
    const imageWidth = pageWidth
    const imageHeight = canvas.height * imageWidth / canvas.width
    let offset = 0
    while (offset < imageHeight) {
      if (offset > 0) document.addPage()
      document.addImage(canvas, "PNG", 0, -offset, imageWidth, imageHeight)
      offset += pageHeight
    }
    document.save(quotationFileName(data.id, "pdf"))
  } finally {
    container.remove()
  }
}

function QuotationForm({ onClose, vi, mode = "create", initialData = null, onSave, productOptions = [], supplierOptions = [], customerOptions = [], warehouseOptions = [], canExport = true }: { onClose: () => void; vi: boolean, mode?: "create" | "edit" | "view", initialData?: any, onSave?: (data: any) => void, productOptions?: Array<{value: string, label: string}>, supplierOptions?: Array<{value: string, label: string}>, customerOptions?: Array<{value: string, label: string; name?: string; representative?: string; address?: string; phone?: string; email?: string; tax_code?: string}>, warehouseOptions?: Array<{value: string, label: string}>, canExport?: boolean }) {
  const { profile } = useAuth()
  const { isDemo } = useDemo()
  const [customerId, setCustomerId] = useState(initialData?.customer_id || "")
  const [date, setDate] = useState(initialData?.date || formatDateKeyUtc7())
  const [validUntil, setValidUntil] = useState(initialData?.valid_until || "")
  const [globalDiscount, setGlobalDiscount] = useState(initialData?.discount_val || 0)
  const [discountType, setDiscountType] = useState<"pct" | "amount">(initialData?.discount_type || "pct")
  const [notes, setNotes] = useState(initialData?.notes || "")
  const [warehouseId, setWarehouseId] = useState(initialData?.warehouse_id || warehouseOptions[0]?.value || "")
  
  const [items, setItems] = useState<any[]>(initialData?.items?.length ? initialData.items.map((it: any, i: number) => ({ ...it, id: it.id || Date.now() + i })) : [{ id: Date.now(), product_id: "", supplier_id: "", import_unit: "", sell_unit: "", qty: 1, cost_price: 0, profit_pct: 0, selling_price: 0, vat_pct: 10, total: 0 }])
  const [activeRowId, setActiveRowId] = useState<number | null>(null)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)

  const activeItem = items.find(i => i.id === activeRowId)
  const isView = mode === "view"
  
  const [latestImport, setLatestImport] = useState<any>(null)
  const [latestImportLoading, setLatestImportLoading] = useState(false)

  useEffect(() => {
    if (activeRowId == null && items.length > 0) setActiveRowId(items[0].id)
  }, [activeRowId, items])

  useEffect(() => {
    if (!activeItem?.product_id) {
      setLatestImport(null)
      setLatestImportLoading(false)
      return
    }
    let mounted = true
    setLatestImportLoading(true)
    fetchLatestImport(activeItem.product_id, { isDemo, orgId: profile?.org_id }).then(result => {
      if (mounted) {
        setLatestImport(result.data)
        setLatestImportLoading(false)
      }
    })
    return () => { mounted = false }
  }, [activeItem?.product_id, isDemo, profile?.org_id])

  const latestQuotation = useMemo(() => {
    if (!activeItem || !activeItem.product_id) return null;
    const records = mockQuotations
      .filter(q => q.customer_id === customerId && q.items && q.items.some(i => i.product_id === activeItem.product_id))
      .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (records.length > 0) {
      const q = records[0];
      const item = q.items.find(i => i.product_id === activeItem.product_id);
      return {
        id: q.id,
        date: q.date,
        customer_name: q.customer_name,
        selling_price: (item as any)?.selling_price || 0
      };
    }
    return null;
  }, [activeItem?.product_id])

  const handleProductChange = (rowId: number, productId: string) => {
    if (isView) return;
    const prod = productOptions.find(p => p.value === productId)
    if (!prod) return;
    
    // Default values - could fetch from inventory history later
    const cost = 0
    const profit = 20
    const sell = cost * (1 + profit/100)
    const unit = "Piece"
    
    setItems(prev => prev.map(i => {
      if (i.id === rowId) {
        return {
          ...i,
          product_id: productId,
          supplier_id: "",
          import_unit: unit,
          sell_unit: unit,
          cost_price: cost,
          profit_pct: profit,
          selling_price: sell,
          vat_pct: 10,
          total: sell * i.qty
        }
      }
      return i
    }))
  }

  const handleUpdateItem = (rowId: number, field: string, val: number | string) => {
    if (isView) return;
    setItems(prev => prev.map(i => {
      if (i.id === rowId) {
        const updated = { ...i, [field]: val }
        
        if (field === 'cost_price' || field === 'profit_pct') {
          updated.selling_price = Number(updated.cost_price) * (1 + Number(updated.profit_pct)/100)
        } else if (field === 'selling_price') {
          updated.profit_pct = Number(updated.cost_price) > 0 ? ((Number(updated.selling_price) / Number(updated.cost_price)) - 1) * 100 : 100
        }
        
        updated.total = Number(updated.selling_price) * Number(updated.qty)
        return updated
      }
      return i
    }))
  }

  const subtotal = items.reduce((acc, curr) => acc + (curr.total || 0), 0)
  const discountAmount = discountType === "pct" ? subtotal * (globalDiscount / 100) : globalDiscount
  
  // Calculate VAT per item proportionally
  const totalVat = items.reduce((acc, curr) => {
    const propDiscount = subtotal > 0 ? (curr.total / subtotal) * discountAmount : 0
    const taxable = curr.total - propDiscount
    return acc + (taxable * (curr.vat_pct / 100))
  }, 0)
  
  const totalBeforeVat = subtotal - discountAmount
  const finalTotal = totalBeforeVat + totalVat

  const exportData = async (format: "xlsx" | "pdf") => {
    const customer = customerOptions.find(option => option.value === customerId) || { label: initialData?.customer_name || "" }
    const exportItems = items.map(item => ({
      ...item,
      productName: productOptions.find(product => product.value === item.product_id)?.label || item.product_name,
      supplierName: supplierOptions.find(supplier => supplier.value === item.supplier_id)?.label || item.supplier_name,
    }))
    const payload = { id: initialData?.id, company: loadCompanySettings(profile?.org_id), customer: { ...customer, name: customer.label }, date, validUntil, notes, items: exportItems, subtotal, discountAmount, totalBeforeVat, totalVat, finalTotal }
    if (format === "xlsx") await exportQuotationExcel(payload, vi)
    else exportQuotationPdf(payload, vi)
    setExportMenuOpen(false)
  }
  
  const validateAndSave = () => {
    if (!customerId) return showAppToast(vi ? "Vui lòng chọn khách hàng" : "Please select a customer")
    if (!warehouseId) return showAppToast(vi ? "Vui lòng chọn kho nhập dự kiến" : "Please select a receiving warehouse")
    if (!date) return showAppToast(vi ? "Vui lòng chọn ngày báo giá" : "Please select a date")
    if (discountType === "pct" && (globalDiscount < 0 || globalDiscount > 100)) return showAppToast(vi ? "Chiết khấu % phải từ 0 đến 100" : "Discount % must be between 0 and 100")
    if (discountType === "amount" && (globalDiscount < 0 || globalDiscount > subtotal)) return showAppToast(vi ? "Chiết khấu không được vượt quá tổng tiền hàng" : "Discount cannot exceed the subtotal")
    if (items.some(i => i.qty <= 0)) return showAppToast(vi ? "Số lượng phải lớn hơn 0" : "Quantity must be greater than 0")
    if (items.some(i => i.selling_price < 0)) return showAppToast(vi ? "Đơn giá bán không hợp lệ" : "Selling price is invalid")
    if (items.length === 0) return showAppToast(vi ? "Báo giá phải có ít nhất một sản phẩm" : "Quotation must have at least one item")
    if (items.some(i => !i.product_id)) return showAppToast(vi ? "Vui lòng chọn sản phẩm cho tất cả các dòng" : "Please select product for all rows")
    if (new Set(items.map(i => i.product_id)).size !== items.length) return showAppToast(vi ? "Mỗi sản phẩm chỉ được xuất hiện một lần trong báo giá" : "Each product may only appear once in a quotation")
    if (onSave) {
      onSave({
        customer_id: customerId,
        date,
        valid_until: validUntil,
        discount_val: globalDiscount,
        discount_type: discountType,
        notes,
        warehouse_id: warehouseId,
        items: items.map(item => ({ ...item, qty: Number(item.qty ?? item.quantity ?? 0), total: Number(item.total ?? (item.quantity ?? 0) * (item.selling_price ?? item.unit_price ?? 0)), selling_price: Number(item.selling_price ?? item.unit_price ?? 0) })),
        total: finalTotal
      })
    }
  }

  return (
    <div className="absolute inset-0 bg-slate-50 z-20 flex flex-col">
      <div className="flex items-center justify-between px-5 py-3 border-b bg-white" style={{ borderColor: "var(--border)" }}>
        <h2 className="text-base font-semibold">{vi ? (mode === "create" ? "Tạo báo giá mới" : mode === "edit" ? "Sửa báo giá" : "Chi tiết báo giá") : (mode === "create" ? "New Quotation" : mode === "edit" ? "Edit Quotation" : "Quotation Details")}</h2>
        <div className="flex items-center gap-2">
          {canExport && <div className="relative">
            <button onClick={() => setExportMenuOpen(open => !open)} className="h-8 px-3 rounded-lg border text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-1" style={{ borderColor: "var(--border)" }}>
              <Download size={13} /> {vi ? "Xuất báo giá" : "Export quotation"}
            </button>
            {exportMenuOpen && <div className="absolute right-0 top-10 z-30 w-32 rounded-lg border bg-white py-1 shadow-lg" style={{ borderColor: "var(--border)" }}>
              <button onClick={() => exportData("xlsx")} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"><FileSpreadsheet size={13} /> Excel</button>
              <button onClick={() => exportData("pdf")} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"><FileText size={13} /> PDF</button>
            </div>}
          </div>}
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"><X size={16} /></button>
        </div>
      </div>
      
      <div className="flex-1 flex overflow-hidden">
        {/* Main Panel */}
        <div className="flex-1 flex flex-col overflow-auto bg-white m-4 rounded-xl border shadow-sm" style={{ borderColor: "var(--border)" }}>
          <div className="p-5 border-b space-y-4" style={{ borderColor: "var(--border)" }}>
            <div className="grid grid-cols-4 gap-4">
              <div className="col-span-2">
                <label className="block text-[11px] font-medium text-slate-500 mb-1">{vi ? "Khách hàng *" : "Customer *"}</label>
                <select disabled={isView} value={customerId} onChange={e => setCustomerId(e.target.value)} className="w-full h-9 px-3 rounded-lg border text-sm outline-none bg-white disabled:bg-slate-50" style={{ borderColor: "var(--border)" }}>
                  <option value="">-- {vi ? "Chọn khách hàng" : "Select customer"} --</option>
                  {customerOptions.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">{vi ? "Ngày báo giá *" : "Date *"}</label>
                <input disabled={isView} type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full h-9 px-3 rounded-lg border text-sm outline-none disabled:bg-slate-50" style={{ borderColor: "var(--border)" }} />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">{vi ? "Hiệu lực đến" : "Valid Until"}</label>
                <input disabled={isView} type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className="w-full h-9 px-3 rounded-lg border text-sm outline-none disabled:bg-slate-50" style={{ borderColor: "var(--border)" }} />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">{vi ? "Kho nhập dự kiến" : "Receiving warehouse"}</label>
                <select disabled={isView} value={warehouseId} onChange={e => setWarehouseId(e.target.value)} className="w-full h-9 px-3 rounded-lg border text-sm outline-none bg-white disabled:bg-slate-50" style={{ borderColor: "var(--border)" }}>
                  <option value="">-- {vi ? "Chọn kho" : "Select warehouse"} --</option>
                  {warehouseOptions.map(warehouse => <option key={warehouse.value} value={warehouse.value}>{warehouse.label}</option>)}
                </select>
              </div>
              <div className="col-span-3">
                <label className="block text-[11px] font-medium text-slate-500 mb-1">{vi ? "Ghi chú" : "Notes"}</label>
                <input disabled={isView} type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder={vi ? "Nhập ghi chú..." : "Notes..."} className="w-full h-9 px-3 rounded-lg border text-sm outline-none disabled:bg-slate-50" style={{ borderColor: "var(--border)" }} />
              </div>
            </div>
          </div>
          
          <div className="flex-1 p-5 overflow-auto">
            <label className="block text-[11px] font-medium text-slate-500 mb-2">{vi ? "Chi tiết sản phẩm *" : "Product Details *"}</label>
            <div className="border rounded-lg overflow-hidden" style={{ borderColor: "var(--border)" }}>
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
                  <tr>
                    <th className="py-2.5 px-3 font-medium text-slate-600 w-[180px]">{vi ? "Sản phẩm" : "Product"}</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600 w-[140px]">{vi ? "Nhà cung cấp" : "Supplier"}</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600 w-[80px]">{vi ? "ĐV Nhập" : "In Unit"}</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600 w-[80px]">{vi ? "ĐV Bán" : "Out Unit"}</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600 text-right w-[60px]">SL</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600 text-right w-[90px]">{vi ? "Giá nhập" : "Cost"}</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600 text-right w-[60px]">% Lãi</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600 text-right w-[90px]">{vi ? "Giá bán" : "Price"}</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600 text-right w-[60px]">VAT %</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600 text-right w-[100px]">{vi ? "Thành tiền" : "Total"}</th>
                    {!isView && <th className="py-2.5 px-3 font-medium text-slate-600 text-center w-[40px]"></th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={it.id} onClick={() => setActiveRowId(it.id)} className={`border-b cursor-pointer transition-colors ${activeRowId === it.id ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`} style={{ borderColor: "var(--border)" }}>
                      <td className="py-2 px-3">
                        <select disabled={isView} value={it.product_id ?? ""} onChange={e => handleProductChange(it.id, e.target.value)} className="w-full h-8 px-1 text-xs rounded border outline-none bg-white disabled:bg-transparent disabled:border-transparent" style={{ borderColor: "var(--border)" }}>
                          <option value="">-- {vi ? "Chọn" : "Select"} --</option>
                          {productOptions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                      </td>
                      <td className="py-2 px-3">
                        <select disabled={isView} value={it.supplier_id ?? ""} onChange={e => handleUpdateItem(it.id, 'supplier_id', e.target.value)} className="w-full h-8 px-1 text-xs rounded border outline-none bg-white disabled:bg-transparent disabled:border-transparent" style={{ borderColor: "var(--border)" }}>
                          <option value="">-- {vi ? "Chọn" : "Select"} --</option>
                          {supplierOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </td>
                      <td className="py-2 px-3">
                        <select disabled={isView} value={it.import_unit ?? ""} onChange={e => handleUpdateItem(it.id, 'import_unit', e.target.value)} className="w-full h-8 px-1 text-xs rounded border outline-none bg-white disabled:bg-transparent disabled:border-transparent" style={{ borderColor: "var(--border)" }}>
                          <option value="Piece">{vi ? "Cái" : "Piece"}</option>
                          <option value="Roll">{vi ? "Cuộn" : "Roll"}</option>
                          <option value="Kg">{vi ? "Kg" : "Kg"}</option>
                          <option value="Box">{vi ? "Hộp" : "Box"}</option>
                          <option value="Set">{vi ? "Bộ" : "Set"}</option>
                        </select>
                      </td>
                      <td className="py-2 px-3">
                        <select disabled={isView} value={it.sell_unit ?? ""} onChange={e => handleUpdateItem(it.id, 'sell_unit', e.target.value)} className="w-full h-8 px-1 text-xs rounded border outline-none bg-white disabled:bg-transparent disabled:border-transparent" style={{ borderColor: "var(--border)" }}>
                          <option value="Piece">{vi ? "Cái" : "Piece"}</option>
                          <option value="Roll">{vi ? "Cuộn" : "Roll"}</option>
                          <option value="Kg">{vi ? "Kg" : "Kg"}</option>
                          <option value="Box">{vi ? "Hộp" : "Box"}</option>
                          <option value="Set">{vi ? "Bộ" : "Set"}</option>
                          <option value="Meter">{vi ? "Mét" : "Meter"}</option>
                        </select>
                      </td>
                      <td className="py-2 px-3 text-right"><input disabled={isView} type="number" min={1} value={it.qty ?? ""} onChange={e => handleUpdateItem(it.id, 'qty', Number(e.target.value))} className="w-full h-8 px-1 text-xs text-right rounded border outline-none bg-white disabled:bg-transparent disabled:border-transparent" style={{ borderColor: "var(--border)" }} /></td>
                      <td className="py-2 px-3 text-right"><input disabled={isView} type="number" value={it.cost_price ?? ""} onChange={e => handleUpdateItem(it.id, 'cost_price', Number(e.target.value))} className="w-full h-8 px-1 text-xs text-right rounded border outline-none bg-white disabled:bg-transparent disabled:border-transparent" style={{ borderColor: "var(--border)" }} /></td>
                      <td className="py-2 px-3 text-right"><input disabled={isView} type="number" value={it.profit_pct ?? ""} onChange={e => handleUpdateItem(it.id, 'profit_pct', Number(e.target.value))} className="w-full h-8 px-1 text-xs text-right rounded border outline-none bg-white disabled:bg-transparent disabled:border-transparent" style={{ borderColor: "var(--border)" }} /></td>
                      <td className="py-2 px-3 text-right"><input disabled={isView} type="number" value={it.selling_price ?? ""} onChange={e => handleUpdateItem(it.id, 'selling_price', Number(e.target.value))} className="w-full h-8 px-1 text-xs text-right rounded border outline-none bg-white disabled:bg-transparent disabled:border-transparent" style={{ borderColor: "var(--border)" }} /></td>
                      <td className="py-2 px-3 text-right">
                        <select disabled={isView} value={it.vat_pct ?? 0} onChange={e => handleUpdateItem(it.id, 'vat_pct', Number(e.target.value))} className="w-full h-8 px-1 text-xs rounded border outline-none bg-white text-right disabled:bg-transparent disabled:border-transparent" style={{ borderColor: "var(--border)" }}>
                          <option value={0}>0%</option>
                          <option value={5}>5%</option>
                          <option value={8}>8%</option>
                          <option value={10}>10%</option>
                        </select>
                      </td>
                      <td className="py-2 px-3 text-right text-slate-900 font-medium">{fmt(it.total)}</td>
                      {!isView && (
                        <td className="py-2 px-3 text-center">
                           <button onClick={(e) => { e.stopPropagation(); setItems(items.filter(x => x.id !== it.id))}} className="text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!isView && (
                <div className="p-2 bg-slate-50 border-t" style={{ borderColor: "var(--border)" }}>
                  <button onClick={() => setItems(p => [...p, { id: Date.now(), product_id: "", supplier_id: "", import_unit: "", sell_unit: "", qty: 1, cost_price: 0, profit_pct: 0, selling_price: 0, vat_pct: 10, total: 0 }])} className="text-xs font-medium text-blue-600 flex items-center gap-1 hover:underline">
                    <Plus size={12} /> {vi ? "Thêm dòng" : "Add Row"}
                  </button>
                </div>
              )}
            </div>
            
            <div className="mt-6 flex justify-end">
              <div className="w-72 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">{vi ? "Cộng tiền hàng:" : "Subtotal:"}</span>
                  <span className="font-medium text-slate-900">{fmt(subtotal)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">{vi ? "Chiết khấu:" : "Discount:"}</span>
                    <select disabled={isView} value={discountType} onChange={e => setDiscountType(e.target.value as any)} className="h-7 px-1 text-xs border rounded outline-none disabled:bg-slate-50" style={{ borderColor: "var(--border)" }}>
                      <option value="pct">%</option>
                      <option value="amount">VNĐ</option>
                    </select>
                  </div>
                  <input disabled={isView} type="number" value={globalDiscount} onChange={e => setGlobalDiscount(Number(e.target.value))} className="w-24 h-8 px-2 text-right rounded border text-sm outline-none disabled:bg-transparent disabled:border-transparent disabled:text-right" style={{ borderColor: "var(--border)" }} />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">{vi ? "Tiền trước VAT:" : "Before VAT:"}</span>
                  <span className="font-medium text-slate-900">{fmt(totalBeforeVat)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">{vi ? "Tổng tiền VAT:" : "Total VAT:"}</span>
                  <span className="font-medium text-slate-900">{fmt(totalVat)}</span>
                </div>
                <div className="flex justify-between text-base font-bold pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                  <span className="text-slate-900">{vi ? "Tổng thanh toán:" : "Total Amount:"}</span>
                  <span className="text-blue-600">{fmt(finalTotal)}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="p-4 border-t flex justify-end gap-2 bg-slate-50" style={{ borderColor: "var(--border)" }}>
            <button onClick={onClose} className="h-8 px-4 rounded-lg border text-xs text-slate-600 hover:bg-white" style={{ borderColor: "var(--border)" }}>
              {isView ? (vi ? "Đóng" : "Close") : (vi ? "Hủy" : "Cancel")}
            </button>
            {!isView && (
              <button onClick={validateAndSave} className="h-8 px-4 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 flex items-center gap-1.5">
                <Save size={13} /> {vi ? "Lưu báo giá" : "Save"}
              </button>
            )}
          </div>
        </div>

        {/* Side Panel: Info */}
        <div className="w-80 bg-white m-4 ml-0 rounded-xl border shadow-sm flex flex-col" style={{ borderColor: "var(--border)" }}>
          <div className="p-4 border-b flex items-center gap-2" style={{ borderColor: "var(--border)" }}>
            <Info size={16} className="text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-900">{vi ? "Thông tin nhập kho gần nhất" : "Latest Import Record"}</h3>
          </div>
          <div className="p-4 flex-1 overflow-auto bg-slate-50/50">
            {!activeItem?.product_id ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center text-xs px-4">
                <FileText size={24} className="mb-2 opacity-50" />
                {vi ? "Chọn một sản phẩm ở danh sách để xem lịch sử nhập kho." : "Select a product to view import history."}
              </div>
            ) : latestImportLoading ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center text-xs px-4">
                <Info size={24} className="mb-2 opacity-50" />
                {vi ? "Đang tải lịch sử nhập kho..." : "Loading import history..."}
              </div>
            ) : latestImport ? (
              <div className="space-y-4">
                <div className="bg-white p-3 rounded-lg border" style={{ borderColor: "var(--border)" }}>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 font-semibold">Chi tiết nhập</div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Mã phiếu nhập:</span>
                      <a href={`/?screen=goods-receipt&id=${latestImport.receipt_id}`} target="_blank" rel="noreferrer" className="font-medium text-blue-600 flex items-center gap-1 hover:underline" title={vi ? "Mở tab mới" : "Open in new tab"}>{latestImport.receipt_id} <ExternalLink size={10} /></a>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Ngày nhập:</span>
                      <span className="font-medium text-slate-900">{formatDateTimeUtc7(latestImport.date)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Nhà cung cấp:</span>
                      <span className="font-medium text-slate-900 truncate max-w-[120px]" title={latestImport.supplier_name}>{latestImport.supplier_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">{vi ? "Đơn vị nhập:" : "Unit:"}</span>
                      <span className="font-medium text-slate-900">{latestImport.unit}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2 mt-2" style={{ borderColor: "var(--border)" }}>
                      <span className="text-slate-500">Đơn giá nhập:</span>
                      <span className="font-bold text-slate-900">{fmt(latestImport.cost_price)}</span>
                    </div>
                  </div>
                </div>
                
                {latestImport.quotation_id && (
                  <div className="bg-white p-3 rounded-lg border" style={{ borderColor: "var(--border)" }}>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 font-semibold">Tham chiếu Báo giá cũ</div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Mã Báo giá:</span>
                        <a href={`/?screen=quotations&id=${latestImport.quotation_id}`} target="_blank" rel="noreferrer" className="font-medium text-blue-600 flex items-center gap-1 hover:underline" title={vi ? "Mở tab mới" : "Open in new tab"}>{latestImport.quotation_id} <ExternalLink size={10} /></a>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Khách hàng:</span>
                        <a href={`/?screen=customers&id=${latestImport.customer_id}`} target="_blank" rel="noreferrer" className="font-medium text-blue-600 flex items-center gap-1 hover:underline truncate max-w-[120px]" title={latestImport.customer_name}>{latestImport.customer_name} <ExternalLink size={10} /></a>
                      </div>
                    </div>
                  </div>
                )}
                {latestQuotation && (
                  <div className="bg-white p-3 rounded-lg border mt-4" style={{ borderColor: "var(--border)" }}>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 font-semibold">{vi ? "Giá bán gần nhất" : "Latest Selling Price"}</div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Mã Báo giá:</span>
                        <a href={`/?screen=quotations&id=${latestQuotation.id}`} target="_blank" rel="noreferrer" className="font-medium text-blue-600 flex items-center gap-1 hover:underline" title={vi ? "Mở tab mới" : "Open in new tab"}>{latestQuotation.id} <ExternalLink size={10} /></a>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Ngày báo giá:</span>
                        <span className="font-medium text-slate-900">{formatDateTimeUtc7(latestQuotation.date)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Khách hàng:</span>
                        <span className="font-medium text-slate-900 truncate max-w-[120px]" title={latestQuotation.customer_name}>{latestQuotation.customer_name}</span>
                      </div>
                      <div className="flex justify-between border-t pt-2 mt-2" style={{ borderColor: "var(--border)" }}>
                        <span className="text-slate-500">Đơn giá bán:</span>
                        <span className="font-bold text-slate-900">{fmt(latestQuotation.selling_price)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center text-xs px-4">
                <Info size={24} className="mb-2 opacity-50" />
                {vi ? "Sản phẩm này chưa từng được nhập kho." : "No import history found for this product."}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Quotations() {
  const { lang, t } = useLang()
  const vi = lang === "vi"
  const [data, setData] = useState<any[]>([])
  const [productOptions, setProductOptions] = useState<Array<{value: string, label: string}>>([])
  const [supplierOptions, setSupplierOptions] = useState<Array<{value: string, label: string}>>([])
  const [customerOptions, setCustomerOptions] = useState<Array<{value: string, label: string; name?: string; representative?: string; address?: string; phone?: string; email?: string; tax_code?: string}>>([])
  const [warehouseOptions, setWarehouseOptions] = useState<Array<{value: string, label: string}>>([])
  const { isDemo } = useDemo()
  const { profile, can } = useAuth()

  useEffect(() => {
    Promise.all([
      fetchQuotations({ isDemo, orgId: profile?.org_id }),
      fetchProducts({ isDemo, orgId: profile?.org_id }),
      fetchSuppliers({ isDemo, orgId: profile?.org_id }),
      fetchCustomers({ isDemo, orgId: profile?.org_id }),
      fetchWarehouses({ isDemo, orgId: profile?.org_id })
    ]).then(([quotRes, prodRes, suppRes, custRes, warehouseRes]) => {
      // Load quotations
      if (quotRes.data) setData(quotRes.data)
      
      // Map products to options
      if (prodRes.data) {
        setProductOptions(prodRes.data.map((p: any) => ({
          value: p.id,
          label: `${p.name} (${p.sku})`
        })))
      }
      
      // Map suppliers to options
      if (suppRes.data) {
        setSupplierOptions(suppRes.data.map((s: any) => ({
          value: s.id,
          label: s.name
        })))
      }
      
      // Map customers to options
      if (custRes.data) {
        setCustomerOptions(custRes.data.map((c: any) => ({
          value: c.id,
          label: c.name,
          name: c.name,
          representative: c.representative || c.contact_person || c.contact_name || "",
          address: c.address || c.location || "",
          phone: c.phone || "",
          email: c.email || "",
          tax_code: c.tax_code || "",
        })))
      }
      if (warehouseRes.data) setWarehouseOptions(warehouseRes.data.map((warehouse: any) => ({ value: warehouse.id || warehouse.code, label: warehouse.name })))
    })
  }, [isDemo, profile])
  
  const [search, setSearch] = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [editingItem, setEditingItem] = useState<any>(null)
  const [viewingItem, setViewingItem] = useState<any>(null)

  useEffect(() => {
    const linkedId = new URLSearchParams(window.location.search).get("id")
    if (linkedId) {
      const linkedQuotation = data.find(quotation => quotation.id === linkedId)
      if (linkedQuotation) setViewingItem(linkedQuotation)
    }
  }, [data])

  const heads = vi
    ? ["Mã Báo Giá", "Khách hàng", "Ngày lập", "Hiệu lực đến", "Tổng tiền", "Trạng thái"]
    : ["Quotation ID", "Customer", "Date", "Valid Until", "Total", "Status"]

  const exportData = () => {
    const rows = data.map(q => [q.id, q.customer_name, q.date, q.valid_until, q.total, q.status])
    exportXlsx("Quotations", heads, rows)
  }

  const convertToGoodsReceipt = async (id: string) => {
    const q = data.find(x => x.id === id)
    if (!q || !q.items) return
    
    try {
      const warehouse = warehouseOptions.find(option => option.value === q.warehouse_id)
      if (!warehouse) throw new Error(vi ? "Báo giá chưa có kho nhập hợp lệ" : "Quotation has no valid receiving warehouse")
      const receiptResult = await receiveQuotation({ quotationId: id, warehouseId: warehouse.value, warehouseName: warehouse.label, items: q.items }, { isDemo, orgId: profile?.org_id })
      if (receiptResult.error) throw receiptResult.error
      
      // Refresh data
      const res = await fetchQuotations({ isDemo, orgId: profile?.org_id })
      if (res.data) setData(res.data)
      
      showAppToast(vi ? `Đã chuyển báo giá ${id} thành Phiếu nhập kho (Goods Receipt) thành công!` : `Quotation ${id} converted to Goods Receipt successfully!`, "success")
    } catch (error: any) {
      if (import.meta.env.DEV) console.error("Error converting quotation:", error)
      showAppToast(error?.message ?? (vi ? "Lỗi khi chuyển báo giá" : "Error converting quotation"))
    }
  }

  const updateStatus = (id: string, st: string) => {
    // persist status change
    upsertQuotation({ id, status: st } as any, { isDemo, orgId: profile?.org_id }).then(res => {
      if (res && res.error) showAppToast(res.error.message ?? String(res.error))
      else fetchQuotations({ isDemo, orgId: profile?.org_id }).then(r => { if (r.data) setData(r.data) })
    })
  }

  const handleSave = (form: any) => {
    const customerName = customerOptions.find(c => c.value === form.customer_id)?.label || ""
    const normalizedForm = { ...form, customer_name: customerName }
    if (editingItem) {
      upsertQuotation({ id: editingItem.id, ...normalizedForm } as any, { isDemo, orgId: profile?.org_id }).then(res => {
        if (res && res.error) showAppToast(res.error.message ?? String(res.error))
        else {
          setEditingItem(null)
          fetchQuotations({ isDemo, orgId: profile?.org_id }).then(r => { if (r.data) setData(r.data) })
          showAppToast(vi ? "Cập nhật thành công!" : "Updated successfully!", "success")
        }
      })
    } else {
      const payload: any = { ...normalizedForm, status: "Draft" }
      upsertQuotation(payload, { isDemo, orgId: profile?.org_id }).then(res => {
        if (res && res.error) showAppToast(res.error.message ?? String(res.error))
        else {
          fetchQuotations({ isDemo, orgId: profile?.org_id }).then(r => { if (r.data) setData(r.data) })
          setShowCreate(false)
          showAppToast(vi ? "Tạo báo giá thành công!" : "Quotation created!", "success")
        }
      })
    }
  }

  const translateStatus = (s: string) => {
    if (!vi) return s;
    switch(s.toLowerCase()) {
      case "draft": return "Nháp";
      case "sent": return "Đã gửi";
      case "accepted": return "Chấp thuận";
      case "rejected": return "Từ chối";
      case "cancelled": return "Đã hủy";
      case "converted": return "Đã nhập kho";
      case "pending": return "Chờ duyệt";
      default: return s;
    }
  }

  const getStatusColor = (s: string) => {
    switch(s.toLowerCase()) {
      case "draft": return "bg-slate-100 text-slate-700"
      case "sent": return "bg-blue-100 text-blue-700"
      case "accepted": return "bg-emerald-100 text-emerald-700"
      case "rejected": return "bg-red-100 text-red-700"
      case "cancelled": return "bg-slate-200 text-slate-500"
      case "converted": return "bg-purple-100 text-purple-700"
      default: return "bg-slate-100 text-slate-700"
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-white relative overflow-hidden">
      <Toolbar 
        search={search} 
        onSearch={setSearch} 
        onCreate={can("Sales", "create") ? () => setShowCreate(true) : undefined}
        createLabel={vi ? "Tạo báo giá" : "Create Quote"}
        onExportXlsx={can("Sales", "export") ? exportData : undefined}
      />

      <div className="flex-1 overflow-auto p-5">
        <table className="w-full text-left border-collapse min-w-[900px]">
          <thead>
            <tr>
              {heads.map(h => <th key={h} className="text-[11px] font-semibold text-slate-500 pb-3 border-b" style={{ borderColor: "var(--border)" }}>{h}</th>)}
              <th className="text-[11px] font-semibold text-slate-500 pb-3 border-b text-right" style={{ borderColor: "var(--border)" }}>
                {vi ? "Thao tác" : "Actions"}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.filter(q => q.id.toLowerCase().includes(search.toLowerCase()) || q.customer_name?.toLowerCase().includes(search.toLowerCase())).map(q => (
              <tr key={q.id} className="group hover:bg-slate-50 transition-colors border-b" style={{ borderColor: "var(--border)" }}>
                <td className="py-3 text-sm font-medium text-blue-600 cursor-pointer hover:underline" onClick={() => setViewingItem(q)}>{q.id}</td>
                <td className="py-3 text-sm text-slate-700">{q.customer_name}</td>
                <td className="py-3 text-sm text-slate-500">{q.date}</td>
                <td className="py-3 text-sm text-slate-500">{q.valid_until}</td>
                <td className="py-3 text-sm text-slate-900 font-mono font-medium">{fmt(q.total)}</td>
                <td className="py-3">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${getStatusColor(q.status)}`}>
                    {translateStatus(q.status)}
                  </span>
                </td>
                <td className="py-3 text-right">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {can("Sales", "update") && (q.status.toLowerCase() === "draft" || q.status.toLowerCase() === "pending") && (
                      <button onClick={() => updateStatus(q.id, "Sent")} title={vi ? "Gửi khách hàng" : "Send"} className="w-7 h-7 flex items-center justify-center rounded border text-blue-600 hover:bg-blue-50" style={{ borderColor: "var(--border)" }}>
                        <Send size={14} />
                      </button>
                    )}
                    {q.status.toLowerCase() === "sent" && (
                      <>
                        {can("Sales", "approve") && <button onClick={() => updateStatus(q.id, "Accepted")} title={vi ? "Chấp thuận báo giá" : "Accept quotation"} className="w-7 h-7 flex items-center justify-center rounded border text-emerald-600 hover:bg-emerald-50" style={{ borderColor: "var(--border)" }}>
                          <Check size={14} />
                        </button>}
                        {can("Sales", "update") && <button onClick={() => updateStatus(q.id, "Rejected")} title={vi ? "Từ chối" : "Reject"} className="w-7 h-7 flex items-center justify-center rounded border text-red-600 hover:bg-red-50" style={{ borderColor: "var(--border)" }}>
                          <Ban size={14} />
                        </button>}
                      </>
                    )}
                    {can("Purchase", "create") && q.status.toLowerCase() === "accepted" && (
                      <button onClick={() => convertToGoodsReceipt(q.id)} title={vi ? "Tạo phiếu nhập kho" : "Create goods receipt"} className="w-7 h-7 flex items-center justify-center rounded border bg-emerald-50 text-emerald-700 hover:bg-emerald-100" style={{ borderColor: "var(--border)" }}>
                        <Check size={14} />
                      </button>
                    )}
                    <button onClick={() => setViewingItem(q)} className="w-7 h-7 flex items-center justify-center rounded border text-slate-400 hover:text-slate-600 hover:bg-white" style={{ borderColor: "var(--border)" }} title={vi ? "Xem chi tiết" : "View Details"}>
                      <FileText size={14} />
                    </button>
                    {can("Sales", "update") && (q.status.toLowerCase() === "draft" || q.status.toLowerCase() === "pending") && (
                      <button onClick={() => setEditingItem(q)} className="w-7 h-7 flex items-center justify-center rounded border text-slate-400 hover:text-slate-600 hover:bg-white" style={{ borderColor: "var(--border)" }} title={vi ? "Sửa" : "Edit"}>
                        <Edit size={14} />
                      </button>
                    )}
                    {can("Sales", "update") && !["converted", "cancelled"].includes(q.status.toLowerCase()) && <button onClick={async () => { if (await confirmAppAction(vi ? "Bạn có chắc muốn hủy báo giá này?" : "Are you sure to cancel this quote?", { destructive: true })) updateStatus(q.id, "Cancelled") }} className="w-7 h-7 flex items-center justify-center rounded border text-slate-400 hover:text-red-500 hover:bg-red-50" style={{ borderColor: "var(--border)" }} title={vi ? "Hủy" : "Cancel"}>
                      <Trash2 size={14} />
                    </button>}
                  </div>
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-sm text-slate-500">
                  {vi ? "Không có dữ liệu" : "No data"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-5 py-2.5 bg-white border-t flex-shrink-0 text-xs text-slate-500" style={{ borderColor: "var(--border)" }}>
        <span>{vi ? "Đang hiển thị" : "Showing"} {data.length} {vi ? "báo giá" : "quotations"}</span>
        <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px]">1 / 1</span>
      </div>

      {showCreate && <QuotationForm canExport={can("Sales", "export")} onClose={() => setShowCreate(false)} vi={vi} mode="create" onSave={handleSave} productOptions={productOptions} supplierOptions={supplierOptions} customerOptions={customerOptions} warehouseOptions={warehouseOptions} />}
      {editingItem && <QuotationForm canExport={can("Sales", "export")} onClose={() => setEditingItem(null)} vi={vi} mode="edit" initialData={editingItem} onSave={handleSave} productOptions={productOptions} supplierOptions={supplierOptions} customerOptions={customerOptions} warehouseOptions={warehouseOptions} />}
      {viewingItem && <QuotationForm canExport={can("Sales", "export")} onClose={() => setViewingItem(null)} vi={vi} mode="view" initialData={viewingItem} productOptions={productOptions} supplierOptions={supplierOptions} customerOptions={customerOptions} warehouseOptions={warehouseOptions} />}
    </div>
  )
}
