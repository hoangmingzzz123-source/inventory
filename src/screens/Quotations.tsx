import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Plus, FileSpreadsheet, Download, Check, X, FileText, Save, Info, Edit, Trash2, Send, Ban, PackageCheck, Truck } from "lucide-react"
import { useLang } from "../i18n/LangContext"
import { exportXlsx, Toolbar } from "./GenericList"
import { useDemo } from "../contexts/DemoContext"
import { useAuth } from "../contexts/AuthContext"
import { cancelQuotationAllocation, convertQuotationAllocations, deliverQuotationAllocation, fetchLookup, fetchQuotationAllocationContext, fetchQuotations, upsertQuotation, deleteQuotation, type QuotationAllocationContext } from "../lib/dataService"
import { defaultCompanySettings, loadCompanySettings } from "../lib/companySettings"
import logoUrl from "../data/logo.png"
import { formatDateKeyUtc7 } from "../lib/dateUtils"
import { confirmAppAction, showAppToast } from "../lib/appEvents"
import { formatQuantity, formatVnd } from "../lib/numberFormat"
import AsyncPaginatedSelect, { type AsyncSelectOption, type AsyncSelectPage } from "../components/AsyncPaginatedSelect"

const fmt = formatQuantity
const money = formatVnd

type ProductOption = {
  value: string
  label: string
  name: string
  sku: string
  cost: number
  price: number
  unit: string
  trackBatch: boolean
  categoryId: string
  onHand: number
  reserved: number
  available: number
  averageCost: number
}

type QuotationLookupKind = "warehouses" | "categories" | "customers" | "suppliers" | "units"

type QuotationLookupOption = AsyncSelectOption & {
  code?: string
  name?: string
  representative?: string
  address?: string
  phone?: string
  email?: string
  tax_code?: string
}

type QuotationLookupLoader = (
  kind: QuotationLookupKind,
  search: string,
  offset: number,
  limit: number,
) => Promise<AsyncSelectPage<QuotationLookupOption>>

function toProductOptions(products: any[]): ProductOption[] {
  return products.map(product => ({
    value: product.id,
    label: product.label ?? `${product.name} (${product.sku ?? product.code})`,
    name: product.name ?? product.label,
    sku: product.sku ?? product.code,
    cost: Number(product.average_cost ?? product.averageCost ?? product.cost ?? product.referenceCost ?? 0),
    price: Number(product.price ?? 0),
    unit: product.unit || "Piece",
    trackBatch: Boolean(product.track_batch ?? product.trackBatch),
    categoryId: product.category_id ?? product.categoryId ?? "",
    onHand: Number(product.qty ?? product.onHand ?? 0),
    reserved: Number(product.reserved ?? 0),
    available: Number(product.available ?? product.qty ?? product.onHand ?? 0),
    averageCost: Number(product.average_cost ?? product.averageCost ?? product.cost ?? product.referenceCost ?? 0),
  }))
}

type AllocationDraft = {
  key: string
  quotation_item_id: string
  category_id: string
  source_type: "STOCK" | "NEW_STOCK"
  product_id: string
  qty: number
  supplier_id: string
  unit_cost: number
  batch_number: string
  manufacture_date: string
  expiry_date: string
  new_product?: {
    sku: string
    name: string
    unit: string
    cost: number
    price: number
    track_batch: boolean
  }
}

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
  const header = sheet.addRow([vi ? "Danh mục" : "Category", vi ? "Mô tả" : "Description", vi ? "Đơn vị" : "Unit", vi ? "Số lượng" : "Quantity", vi ? "Đơn giá" : "Unit price", "VAT %", vi ? "Thành tiền" : "Amount"])
  header.height = 30
  header.eachCell(cell => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } }; cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; cell.border = border })
  for (const item of data.items) {
    const row = sheet.addRow([item.productName || item.category_name, item.description || "", item.sell_unit, item.qty, item.selling_price, item.vat_pct, item.total])
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
  const labels = vi ? { title: "BÁO GIÁ", id: "Mã báo giá", customer: "Khách hàng", date: "Ngày lập", valid: "Hiệu lực đến", product: "Danh mục", unit: "Đơn vị", qty: "Số lượng", price: "Đơn giá", vat: "VAT %", amount: "Thành tiền", subtotal: "Cộng tiền hàng", discount: "Chiết khấu", beforeVat: "Tiền trước VAT", totalVat: "Tổng VAT", total: "Tổng thanh toán" } : { title: "QUOTATION", id: "Quotation ID", customer: "Customer", date: "Date", valid: "Valid until", product: "Category", unit: "Unit", qty: "Quantity", price: "Unit price", vat: "VAT %", amount: "Amount", subtotal: "Subtotal", discount: "Discount", beforeVat: "Before VAT", totalVat: "Total VAT", total: "Grand total" }
  const escape = (value: unknown) => String(value ?? "").replace(/[&<>\"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[character] || character))
  const itemRows = data.items.map(item => `<tr><td>${escape(item.productName || item.category_name)}</td><td>${escape(item.sell_unit)}</td><td class="number">${item.qty}</td><td class="number">${money(item.selling_price)}</td><td class="number">${item.vat_pct}%</td><td class="number">${money(item.total)}</td></tr>`).join("")
  const html = `<div style="width:794px; padding:42px; background:#fff; color:#0f172a; font-family:Arial,sans-serif; font-size:14px; line-height:1.45;">
    <h1 style="margin:0 0 24px; text-align:center; color:#1d4ed8; font-size:28px;">${labels.title}</h1>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:28px; margin-bottom:22px;">
      <div style="display:flex; gap:14px; align-items:flex-start;"><img src="${logoUrl}" alt="Logo" style="width:86px; height:58px; object-fit:contain;" /><div><strong style="font-size:17px;">${escape(data.company.name)}</strong><div>${vi ? "Người đại diện" : "Representative"}: ${escape(data.company.representative)}</div><div>${vi ? "MST" : "Tax ID"}: ${escape(data.company.taxId)}</div><div>${vi ? "Địa chỉ" : "Address"}: ${escape(data.company.address)}</div><div>${vi ? "Điện thoại" : "Phone"}: ${escape(data.company.phone)}</div></div></div>
      <div><strong>${vi ? "THÔNG TIN KHÁCH HÀNG" : "CUSTOMER INFORMATION"}</strong><div>${escape(data.customer.name)}</div><div>${vi ? "Người đại diện" : "Representative"}: ${escape(data.customer.representative)}</div><div>${vi ? "MST" : "Tax ID"}: ${escape(data.customer.tax_code)}</div><div>${vi ? "Địa chỉ" : "Address"}: ${escape(data.customer.address)}</div><div>${vi ? "Điện thoại" : "Phone"}: ${escape(data.customer.phone)}</div><div>${vi ? "Email" : "Email"}: ${escape(data.customer.email)}</div></div>
    </div>
    <div style="display:flex; justify-content:space-between; margin-bottom:16px;"><span><strong>${labels.id}:</strong> ${escape(data.id)}</span><span><strong>${labels.date}:</strong> ${escape(data.date)}</span><span><strong>${labels.valid}:</strong> ${escape(data.validUntil)}</span></div>
    <table style="width:100%; border-collapse:collapse;"><thead><tr style="background:#2563eb; color:#fff;">${[labels.product, labels.unit, labels.qty, labels.price, labels.vat, labels.amount].map(label => `<th style="padding:10px 8px; border:1px solid #d1d5db; text-align:left;">${label}</th>`).join("")}</tr></thead><tbody>${itemRows}</tbody></table>
    <div style="margin:22px 0 0 auto; width:330px;">${[[labels.subtotal, data.subtotal], [labels.discount, data.discountAmount], [labels.beforeVat, data.totalBeforeVat], [labels.totalVat, data.totalVat]].map(row => `<div style="display:flex; justify-content:space-between; padding:5px 0;"><span>${row[0]}</span><strong>${money(row[1])}</strong></div>`).join("")}<div style="display:flex; justify-content:space-between; border-top:2px solid #1d4ed8; padding-top:9px; color:#1d4ed8; font-size:17px;"><strong>${labels.total}</strong><strong>${money(data.finalTotal)}</strong></div></div>
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

function QuotationForm({ onClose, vi, mode = "create", initialData = null, onSave, canExport = true, onLoadLookup, onLookupProducts }: { onClose: () => void; vi: boolean, mode?: "create" | "edit" | "view", initialData?: any, onSave?: (data: any) => void, canExport?: boolean; onLoadLookup: QuotationLookupLoader; onLookupProducts?: (categoryId: string, warehouseId: string) => Promise<ProductOption[]> }) {
  const { profile } = useAuth()
  const [customerId, setCustomerId] = useState(initialData?.customer_id || "")
  const [selectedCustomer, setSelectedCustomer] = useState<QuotationLookupOption | null>(initialData?.customer_id ? {
    value: initialData.customer_id,
    label: initialData.customer_name || initialData.customer_id,
    name: initialData.customer_name || "",
    representative: initialData.customer_representative || "",
    address: initialData.customer_address || "",
    phone: initialData.customer_phone || "",
    email: initialData.customer_email || "",
    tax_code: initialData.customer_tax_code || "",
  } : null)
  const [date, setDate] = useState(initialData?.date || formatDateKeyUtc7())
  const [validUntil, setValidUntil] = useState(initialData?.valid_until || "")
  const [globalDiscount, setGlobalDiscount] = useState(initialData?.discount_val || 0)
  const [discountType, setDiscountType] = useState<"pct" | "amount">(initialData?.discount_type || "pct")
  const [notes, setNotes] = useState(initialData?.notes || "")
  const [warehouseId, setWarehouseId] = useState(initialData?.warehouse_id || "")
  const [selectedWarehouse, setSelectedWarehouse] = useState<QuotationLookupOption | null>(initialData?.warehouse_id ? {
    value: initialData.warehouse_id,
    label: initialData.warehouse_name || initialData.warehouse_id,
  } : null)
  
  const [items, setItems] = useState<any[]>(initialData?.items?.length
    ? initialData.items.map((it: any, i: number) => ({
        ...it,
        id: it.id || Date.now() + i,
        category_name: it.category_name || it.product_name || "",
      }))
    : [{ id: Date.now(), category_id: "", category_name: "", sell_unit: "Piece", qty: 1, cost_price: 0, profit_pct: 20, selling_price: 0, vat_pct: 10, total: 0 }])
  const [activeRowId, setActiveRowId] = useState<number | null>(null)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [resolvedProductOptions, setResolvedProductOptions] = useState<ProductOption[]>([])
  const loadedProductScopesRef = useRef(new Set<string>())
  const [productLookupLoading, setProductLookupLoading] = useState(false)
  const [productLookupError, setProductLookupError] = useState("")

  const activeItem = items.find(i => i.id === activeRowId)
  const isView = mode === "view"
  const loadCustomers = useCallback((search: string, offset: number, limit: number) => onLoadLookup("customers", search, offset, limit), [onLoadLookup])
  const loadWarehouses = useCallback((search: string, offset: number, limit: number) => onLoadLookup("warehouses", search, offset, limit), [onLoadLookup])
  const loadCategories = useCallback((search: string, offset: number, limit: number) => onLoadLookup("categories", search, offset, limit), [onLoadLookup])
  const loadUnits = useCallback((search: string, offset: number, limit: number) => onLoadLookup("units", search, offset, limit), [onLoadLookup])

  useEffect(() => {
    if (!initialData?.customer_id || !initialData?.customer_name) return
    let active = true
    loadCustomers(initialData.customer_name, 0, 10).then(page => {
      const customer = page.options.find(option => option.value === initialData.customer_id)
      if (active && customer) setSelectedCustomer(customer)
    }).catch(() => undefined)
    return () => { active = false }
  }, [initialData?.customer_id, initialData?.customer_name, loadCustomers])

  useEffect(() => {
    if (activeRowId == null && items.length > 0) setActiveRowId(items[0].id)
  }, [activeRowId, items])

  const categoryProducts = useMemo(
    () => resolvedProductOptions.filter(product => product.categoryId === activeItem?.category_id),
    [activeItem?.category_id, resolvedProductOptions],
  )
  const activeAllocations = useMemo(
    () => (initialData?.allocations ?? []).filter((allocation: any) =>
      allocation.quotation_item_id === activeItem?.id,
    ),
    [activeItem?.id, initialData?.allocations],
  )

  const loadCategoryProducts = async (categoryId: string, targetWarehouseId: string) => {
    if (!onLookupProducts || !categoryId || !targetWarehouseId) {
      return resolvedProductOptions.filter(product => product.categoryId === categoryId)
    }
    const scopeKey = `${targetWarehouseId}:${categoryId}`
    loadedProductScopesRef.current.add(scopeKey)
    setProductLookupLoading(true)
    setProductLookupError("")
    try {
      const products = await onLookupProducts(categoryId, targetWarehouseId)
      setResolvedProductOptions(current => [
        ...current.filter(product => product.categoryId !== categoryId),
        ...products,
      ])
      return products
    } catch (error: any) {
      loadedProductScopesRef.current.delete(scopeKey)
      setProductLookupError(error?.message ?? (vi ? "Không tải được sản phẩm" : "Could not load products"))
      return []
    } finally {
      setProductLookupLoading(false)
    }
  }

  useEffect(() => {
    const categoryId = activeItem?.category_id
    if (!categoryId || !warehouseId || !onLookupProducts) return
    const scopeKey = `${warehouseId}:${categoryId}`
    if (loadedProductScopesRef.current.has(scopeKey)) return
    void loadCategoryProducts(categoryId, warehouseId)
  }, [activeItem?.category_id, onLookupProducts, warehouseId])

  const handleCategoryChange = async (rowId: number, categoryId: string, category: QuotationLookupOption | null) => {
    if (isView) return
    if (!categoryId) {
      setItems(previous => previous.map(item => item.id === rowId
        ? { ...item, category_id: "", category_name: "", cost_price: 0, selling_price: 0, total: 0 }
        : item))
      return
    }
    const products = await loadCategoryProducts(categoryId, warehouseId)
    const availableProducts = products.filter(product => product.available > 0)
    const referenceProducts = availableProducts.length ? availableProducts : products
    const totalWeight = referenceProducts.reduce((sum, product) =>
      sum + (availableProducts.length ? product.available : 1), 0)
    const weightedValue = (field: "averageCost" | "price") => totalWeight > 0
      ? referenceProducts.reduce((sum, product) =>
          sum + Number(product[field] ?? 0) * (availableProducts.length ? product.available : 1), 0) / totalWeight
      : 0
    // A quotation promises the category, not one arbitrary SKU. Use the
    // weighted category pool only as an editable internal pricing reference.
    const cost = Math.round(weightedValue("averageCost"))
    const sell = Math.round(weightedValue("price") || cost * 1.2)
    const profit = cost > 0 ? (sell / cost - 1) * 100 : 20
    const unit = referenceProducts[0]?.unit || "Piece"
    setItems(prev => prev.map(i => {
      if (i.id === rowId) {
        return {
          ...i,
          category_id: categoryId,
          category_name: category?.label ?? i.category_name ?? "",
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
    setActiveRowId(rowId)
  }

  const handleWarehouseChange = async (nextWarehouseId: string) => {
    if (isView) return
    setWarehouseId(nextWarehouseId)
    const selectedCategories = Array.from(new Set(items.map(item => item.category_id).filter(Boolean))) as string[]
    await Promise.all(selectedCategories.map(categoryId => loadCategoryProducts(categoryId, nextWarehouseId)))
  }

  const handleUpdateItem = (rowId: number, field: string, val: number | string) => {
    if (isView) return;
    setItems(prev => prev.map(i => {
      if (i.id === rowId) {
        const updated = { ...i, [field]: val }
        
        if (field === 'cost_price' || field === 'profit_pct') {
          updated.selling_price = Math.round(Number(updated.cost_price) * (1 + Number(updated.profit_pct)/100))
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
    const customer = selectedCustomer || { label: initialData?.customer_name || "" }
    const exportItems = items.map(item => ({
      ...item,
      productName: item.category_name,
      supplierName: "",
    }))
    const payload = { id: initialData?.id, company: loadCompanySettings(profile?.org_id), customer: { ...customer, name: customer.label }, date, validUntil, notes, items: exportItems, subtotal, discountAmount, totalBeforeVat, totalVat, finalTotal }
    if (format === "xlsx") await exportQuotationExcel(payload, vi)
    else exportQuotationPdf(payload, vi)
    setExportMenuOpen(false)
  }
  
  const validateAndSave = () => {
    if (!customerId) return showAppToast(vi ? "Vui lòng chọn khách hàng" : "Please select a customer")
    if (!warehouseId) return showAppToast(vi ? "Vui lòng chọn kho thực hiện" : "Please select a fulfillment warehouse")
    if (!date) return showAppToast(vi ? "Vui lòng chọn ngày báo giá" : "Please select a date")
    if (discountType === "pct" && (globalDiscount < 0 || globalDiscount > 100)) return showAppToast(vi ? "Chiết khấu % phải từ 0 đến 100" : "Discount % must be between 0 and 100")
    if (discountType === "amount" && (globalDiscount < 0 || globalDiscount > subtotal)) return showAppToast(vi ? "Chiết khấu không được vượt quá tổng tiền hàng" : "Discount cannot exceed the subtotal")
    if (items.some(i => i.qty <= 0)) return showAppToast(vi ? "Số lượng phải lớn hơn 0" : "Quantity must be greater than 0")
    if (items.some(i => i.selling_price <= 0)) return showAppToast(vi ? "Đơn giá bán phải lớn hơn 0" : "Selling price must be greater than zero")
    if (items.length === 0) return showAppToast(vi ? "Báo giá phải có ít nhất một danh mục" : "Quotation must have at least one category")
    if (items.some(i => !i.category_id)) return showAppToast(vi ? "Vui lòng chọn danh mục cho tất cả các dòng" : "Please select a category for every row")
    if (new Set(items.map(i => i.category_id)).size !== items.length) return showAppToast(vi ? "Mỗi danh mục chỉ được xuất hiện một lần trong báo giá" : "Each category may only appear once in a quotation")
    if (onSave) {
      onSave({
        customer_id: customerId,
        customer_name: selectedCustomer?.label || initialData?.customer_name || "",
        date,
        valid_until: validUntil,
        discount_val: globalDiscount,
        discount_type: discountType,
        notes,
        warehouse_id: warehouseId,
        warehouse_name: selectedWarehouse?.label || initialData?.warehouse_name || "",
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
                <AsyncPaginatedSelect
                  value={customerId}
                  selectedOption={selectedCustomer}
                  onChange={(nextValue, option) => { setCustomerId(nextValue); setSelectedCustomer(option) }}
                  loadPage={loadCustomers}
                  disabled={isView}
                  placeholder={vi ? "-- Chọn khách hàng --" : "-- Select customer --"}
                  searchPlaceholder={vi ? "Tìm theo mã, tên, SĐT hoặc email..." : "Search code, name, phone, or email..."}
                  emptyText={vi ? "Không có khách hàng phù hợp" : "No matching customer"}
                  loadingText={vi ? "Đang tải khách hàng..." : "Loading customers..."}
                  loadMoreText={vi ? "Tải thêm khách hàng" : "Load more customers"}
                />
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
                <label className="block text-[11px] font-medium text-slate-500 mb-1">{vi ? "Kho thực hiện" : "Fulfillment warehouse"}</label>
                <AsyncPaginatedSelect
                  value={warehouseId}
                  selectedOption={selectedWarehouse}
                  onChange={(nextValue, option) => { setSelectedWarehouse(option); void handleWarehouseChange(nextValue) }}
                  loadPage={loadWarehouses}
                  disabled={isView}
                  placeholder={vi ? "-- Chọn kho --" : "-- Select warehouse --"}
                  searchPlaceholder={vi ? "Tìm mã hoặc tên kho..." : "Search warehouse code or name..."}
                  emptyText={vi ? "Không có kho phù hợp" : "No matching warehouse"}
                  loadingText={vi ? "Đang tải kho..." : "Loading warehouses..."}
                  loadMoreText={vi ? "Tải thêm kho" : "Load more warehouses"}
                />
              </div>
              <div className="col-span-3">
                <label className="block text-[11px] font-medium text-slate-500 mb-1">{vi ? "Ghi chú" : "Notes"}</label>
                <input disabled={isView} type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder={vi ? "Nhập ghi chú..." : "Notes..."} className="w-full h-9 px-3 rounded-lg border text-sm outline-none disabled:bg-slate-50" style={{ borderColor: "var(--border)" }} />
              </div>
            </div>
          </div>
          
          <div className="flex-1 p-5 overflow-auto">
            <label className="block text-[11px] font-medium text-slate-500 mb-2">{vi ? "Danh mục khách hàng yêu cầu *" : "Requested categories *"}</label>
            <div className="border rounded-lg overflow-hidden" style={{ borderColor: "var(--border)" }}>
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
                  <tr>
                    <th className="py-2.5 px-3 font-medium text-slate-600 w-[220px]">{vi ? "Danh mục" : "Category"}</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600 w-[80px]">{vi ? "ĐV Bán" : "Out Unit"}</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600 text-right w-[60px]">SL</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600 text-right w-[100px]">{vi ? "Giá vốn tham khảo" : "Reference cost"}</th>
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
                        <AsyncPaginatedSelect
                          value={it.category_id ?? ""}
                          selectedOption={it.category_id ? { value: it.category_id, label: it.category_name || it.category_id } : null}
                          onChange={(nextValue, option) => void handleCategoryChange(it.id, nextValue, option)}
                          loadPage={loadCategories}
                          disabled={isView}
                          placeholder={vi ? "-- Chọn --" : "-- Select --"}
                          searchPlaceholder={vi ? "Tìm mã hoặc tên danh mục..." : "Search category code or name..."}
                          emptyText={vi ? "Không có danh mục phù hợp" : "No matching category"}
                          loadingText={vi ? "Đang tải danh mục..." : "Loading categories..."}
                          loadMoreText={vi ? "Tải thêm danh mục" : "Load more categories"}
                          buttonClassName="h-8 text-xs"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <AsyncPaginatedSelect
                          value={it.sell_unit ?? ""}
                          selectedOption={it.sell_unit ? { value: it.sell_unit, label: it.sell_unit } : null}
                          onChange={nextValue => handleUpdateItem(it.id, "sell_unit", nextValue)}
                          loadPage={loadUnits}
                          disabled={isView}
                          allowClear={false}
                          placeholder={vi ? "Chọn ĐVT" : "Select unit"}
                          searchPlaceholder={vi ? "Tìm đơn vị tính..." : "Search units..."}
                          emptyText={vi ? "Không có đơn vị phù hợp" : "No matching unit"}
                          loadingText={vi ? "Đang tải đơn vị..." : "Loading units..."}
                          loadMoreText={vi ? "Tải thêm đơn vị" : "Load more units"}
                          buttonClassName="h-8 text-xs"
                        />
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
                      <td className="py-2 px-3 text-right text-slate-900 font-medium">{money(it.total)}</td>
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
                  <button onClick={() => setItems(p => [...p, { id: Date.now(), category_id: "", category_name: "", sell_unit: "Piece", qty: 1, cost_price: 0, profit_pct: 20, selling_price: 0, vat_pct: 10, total: 0 }])} className="text-xs font-medium text-blue-600 flex items-center gap-1 hover:underline">
                    <Plus size={12} /> {vi ? "Thêm dòng" : "Add Row"}
                  </button>
                </div>
              )}
            </div>
            
            <div className="mt-6 flex justify-end">
              <div className="w-72 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">{vi ? "Cộng tiền hàng:" : "Subtotal:"}</span>
                  <span className="font-medium text-slate-900">{money(subtotal)}</span>
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
                  <span className="font-medium text-slate-900">{money(totalBeforeVat)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">{vi ? "Tổng tiền VAT:" : "Total VAT:"}</span>
                  <span className="font-medium text-slate-900">{money(totalVat)}</span>
                </div>
                <div className="flex justify-between text-base font-bold pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                  <span className="text-slate-900">{vi ? "Tổng thanh toán:" : "Total Amount:"}</span>
                  <span className="text-blue-600">{money(finalTotal)}</span>
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

        <div className="w-80 bg-white m-4 ml-0 rounded-xl border shadow-sm flex flex-col" style={{ borderColor: "var(--border)" }}>
          <div className="p-4 border-b flex items-center gap-2" style={{ borderColor: "var(--border)" }}>
            <Info size={16} className="text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-900">{activeAllocations.length
              ? (vi ? "SKU đã phân bổ" : "Allocated SKUs")
              : (vi ? "Khả năng đáp ứng danh mục" : "Category availability")}</h3>
          </div>
          <div className="p-4 flex-1 overflow-auto bg-slate-50/50">
            {productLookupError && <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-[10px] text-red-700">{productLookupError}</div>}
            {productLookupLoading && <div className="mb-3 rounded-lg border bg-white p-2 text-[10px] text-slate-500">{vi ? "Đang tính tồn khả dụng theo kho..." : "Calculating warehouse availability..."}</div>}
            {!activeItem?.category_id ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center text-xs px-4">
                <PackageCheck size={24} className="mb-2 opacity-50" />
                {vi ? "Chọn danh mục để xem các SKU có thể phân bổ khi Convert." : "Select a category to preview SKUs available at conversion."}
              </div>
            ) : activeAllocations.length ? (
              <div className="space-y-3">
                <div className="rounded-lg border bg-indigo-50 p-3 text-xs text-indigo-800">
                  {vi ? "Nội dung báo giá đã khóa. Giao hàng sẽ xuất đúng các SKU trong kế hoạch này." : "The quotation is locked. Delivery will issue the SKUs in this plan."}
                </div>
                <div className="rounded-lg border bg-white p-3 text-xs">
                  <div className="text-[10px] text-slate-500">{vi ? "Danh mục" : "Category"}</div>
                  <div className="mt-1 font-semibold">{activeItem.category_name}</div>
                  <div className="mt-2 flex justify-between border-t pt-2"><span>{vi ? "Yêu cầu" : "Required"}</span><b>{fmt(Number(activeItem.qty))} {activeItem.sell_unit}</b></div>
                </div>
                {activeAllocations.map((allocation: any) => {
                  const product = resolvedProductOptions.find(option => option.value === allocation.product_id)
                  const reservation = String(allocation.reservation_status ?? "").toUpperCase()
                  return <div key={allocation.id ?? `${allocation.product_id}-${allocation.source_type}`} className="rounded-lg border bg-white p-3 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div><div className="font-semibold text-slate-900">{product?.name ?? allocation.product_name ?? allocation.product_id}</div><div className="mt-0.5 text-[10px] text-slate-400 mono">{product?.sku ?? allocation.sku ?? ""}</div></div>
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${allocation.source_type === "NEW_STOCK" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>{allocation.source_type}</span>
                    </div>
                    <div className="mt-2 flex justify-between border-t pt-2"><span className="text-slate-500">{vi ? "Số lượng" : "Quantity"}</span><b>{fmt(Number(allocation.qty))}</b></div>
                    {reservation && <div className="mt-1 flex justify-between"><span className="text-slate-500">Reservation</span><b className={reservation === "ACTIVE" ? "text-amber-700" : reservation === "CONSUMED" ? "text-emerald-700" : "text-slate-500"}>{reservation}</b></div>}
                  </div>
                })}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border bg-blue-50 p-3 text-xs text-blue-800">
                  {vi ? "Báo giá chỉ cam kết danh mục. Tồn và giá vốn ở đây là tham khảo tổng hợp; Convert sẽ tính lại Available theo kho, còn giá vốn thực tế được chốt khi giao." : "The quote commits to a category. Stock and cost here are pooled references; conversion rechecks warehouse availability and actual COGS is finalized at delivery."}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border bg-white p-3"><div className="text-[10px] text-slate-500">{vi ? "SKU phù hợp" : "Matching SKUs"}</div><div className="mt-1 text-lg font-bold">{categoryProducts.length}</div></div>
                  <div className="rounded-lg border bg-white p-3"><div className="text-[10px] text-slate-500">{vi ? "Khả dụng tham khảo" : "Reference available"}</div><div className="mt-1 text-lg font-bold text-emerald-700">{fmt(categoryProducts.reduce((sum, product) => sum + product.available, 0))}</div></div>
                </div>
                {categoryProducts.map(product => (
                  <div key={product.value} className="rounded-lg border bg-white p-3 text-xs">
                    <div className="font-semibold text-slate-900">{product.name}</div>
                    <div className="mt-0.5 text-[10px] text-slate-400 mono">{product.sku}</div>
                    <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                      <div><div className="text-[9px] text-slate-400">{vi ? "Tồn" : "On hand"}</div><b>{fmt(product.onHand)}</b></div>
                      <div><div className="text-[9px] text-slate-400">{vi ? "Giữ chỗ" : "Reserved"}</div><b>{fmt(product.reserved)}</b></div>
                      <div><div className="text-[9px] text-slate-400">{vi ? "Khả dụng" : "Available"}</div><b className="text-emerald-700">{fmt(product.available)}</b></div>
                    </div>
                    <div className="mt-2 flex justify-between border-t pt-2 text-[10px]"><span className="text-slate-500">{vi ? "Giá vốn bình quân" : "Average cost"}</span><b>{money(product.averageCost)}</b></div>
                  </div>
                ))}
                {categoryProducts.length === 0 && <div className="rounded-lg border border-dashed p-4 text-center text-xs text-slate-400">{vi ? "Chưa có SKU trong danh mục; có thể tạo SKU mới lúc Convert." : "No SKU yet; a new one can be created during conversion."}</div>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function QuotationAllocationModal({ quotationId, onLoadLookup, vi, isDemo, orgId, onClose, onComplete }: {
  quotationId: string
  onLoadLookup: QuotationLookupLoader
  vi: boolean
  isDemo: boolean
  orgId?: string
  onClose: () => void
  onComplete: () => void
}) {
  const [context, setContext] = useState<QuotationAllocationContext | null>(null)
  const [rows, setRows] = useState<AllocationDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const loadSuppliers = useCallback((search: string, offset: number, limit: number) => onLoadLookup("suppliers", search, offset, limit), [onLoadLookup])

  useEffect(() => {
    let mounted = true
    setLoading(true)
    fetchQuotationAllocationContext(quotationId, { isDemo, orgId }).then(result => {
      if (!mounted) return
      if (result.error || !result.data) {
        showAppToast(result.error?.message ?? (vi ? "Không tải được dữ liệu phân bổ" : "Could not load allocation data"))
        onClose()
      } else {
        setContext(result.data)
      }
      setLoading(false)
    })
    return () => { mounted = false }
  }, [isDemo, orgId, onClose, quotationId, vi])

  const allocatedFor = (itemId: string) => rows
    .filter(row => row.quotation_item_id === itemId)
    .reduce((sum, row) => sum + Number(row.qty || 0), 0)
  const remainingFor = (item: QuotationAllocationContext["items"][number]) =>
    Math.max(0, Number(item.qty) - allocatedFor(item.id))
  const productFor = (row: AllocationDraft) => context?.products.find(product => product.id === row.product_id)

  const addAllocation = (
    item: QuotationAllocationContext["items"][number],
    sourceType: "STOCK" | "NEW_STOCK",
    productId = "",
    asNewProduct = false,
  ) => {
    if (!context) return
    const product = context.products.find(candidate => candidate.id === productId)
    const remaining = remainingFor(item)
    if (remaining <= 0) return
    if (rows.some(row => row.quotation_item_id === item.id
      && row.product_id === productId && row.source_type === sourceType && !asNewProduct)) return
    const qty = sourceType === "STOCK" ? Math.min(Number(product?.available ?? 0), remaining) : remaining
    if (qty <= 0) return
    setRows(previous => [...previous, {
      key: `${item.id}-${sourceType}-${productId || "NEW"}-${Date.now()}`,
      quotation_item_id: item.id,
      category_id: item.category_id,
      source_type: sourceType,
      product_id: asNewProduct ? "" : productId,
      qty,
      supplier_id: "",
      unit_cost: Math.round(Number(product?.average_cost ?? product?.reference_cost ?? 0)),
      batch_number: "",
      manufacture_date: "",
      expiry_date: "",
      ...(asNewProduct ? {
        new_product: {
          sku: "",
          name: "",
          unit: item.sell_unit || "Piece",
          cost: 0,
          price: Number(item.selling_price),
          track_batch: false,
        },
      } : {}),
    }])
  }

  const updateRow = (key: string, change: Partial<AllocationDraft>) => {
    setRows(previous => previous.map(row => row.key === key ? { ...row, ...change } : row))
  }
  const updateNewProduct = (key: string, change: Partial<NonNullable<AllocationDraft["new_product"]>>) => {
    setRows(previous => previous.map(row => row.key === key
      ? { ...row, new_product: { ...row.new_product!, ...change } }
      : row))
  }

  const allExact = Boolean(context?.items.length)
    && context!.items.every(item => Math.abs(allocatedFor(item.id) - Number(item.qty)) < 0.0001)

  const submit = async () => {
    if (!context || !allExact) return
    for (const row of rows) {
      const product = productFor(row)
      if (row.source_type === "STOCK" && row.qty > Number(product?.available ?? 0)) {
        return showAppToast(vi ? `Số lượng khả dụng của ${product?.name ?? "SKU"} đã thay đổi` : `Available stock changed for ${product?.name ?? "SKU"}`)
      }
      if (row.source_type === "NEW_STOCK") {
        if (!row.supplier_id) return showAppToast(vi ? "Hàng nhập mới phải có nhà cung cấp" : "New stock requires a supplier")
        const tracksBatch = row.new_product?.track_batch || product?.track_batch
        if (tracksBatch && !row.batch_number.trim()) return showAppToast(vi ? "Sản phẩm quản lý theo lô phải có số lô" : "Batch-tracked products require a batch number")
        if (row.manufacture_date && row.expiry_date && row.expiry_date < row.manufacture_date) return showAppToast(vi ? "Hạn dùng không được trước ngày sản xuất" : "Expiry cannot precede manufacture date")
        if (row.new_product && (!row.new_product.sku.trim() || !row.new_product.name.trim() || !row.new_product.unit.trim())) {
          return showAppToast(vi ? "SKU mới cần mã, tên và đơn vị" : "New SKU requires code, name, and unit")
        }
      }
    }
    setSubmitting(true)
    try {
      const result = await convertQuotationAllocations(quotationId, rows.map(({ key, ...row }) => ({
        ...row,
        new_product: row.new_product ? { ...row.new_product, cost: row.unit_cost } : undefined,
        manufacture_date: row.manufacture_date || null,
        expiry_date: row.expiry_date || null,
      })), { isDemo, orgId })
      if (result.error) throw result.error
      showAppToast(vi ? "Đã phân bổ SKU và giữ chỗ tồn kho." : "SKUs allocated and inventory reserved.", "success")
      onComplete()
    } catch (error: any) {
      showAppToast(error?.message ?? (vi ? "Không thể hoàn tất phân bổ" : "Could not complete allocation"))
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4" onClick={() => !submitting && onClose()}>
    <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div><h2 className="text-base font-semibold">{vi ? "Phân bổ SKU cho báo giá" : "Allocate quotation SKUs"}</h2><p className="mt-1 text-xs text-slate-500">{quotationId}{context ? ` · ${context.quotation.warehouse_name}` : ""}</p></div>
        <button disabled={submitting} onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100"><X size={16} /></button>
      </div>
      <div className="flex-1 overflow-auto bg-slate-50 p-5">
        {loading ? <div className="py-16 text-center text-sm text-slate-500">{vi ? "Đang tính tồn khả dụng..." : "Calculating availability..."}</div> : context?.items.map(item => {
          const products = context.products.filter(product => product.category_id === item.category_id)
          const itemRows = rows.filter(row => row.quotation_item_id === item.id)
          const allocated = allocatedFor(item.id)
          const remaining = Math.max(0, Number(item.qty) - allocated)
          const exact = Math.abs(allocated - Number(item.qty)) < 0.0001
          return <section key={item.id} className="mb-5 overflow-hidden rounded-xl border bg-white">
            <div className="flex items-center justify-between border-b bg-white px-4 py-3">
              <div><h3 className="text-sm font-semibold">{item.category_name}</h3><p className="mt-0.5 text-[11px] text-slate-500">{vi ? "Yêu cầu" : "Required"}: {fmt(Number(item.qty))} {item.sell_unit}</p></div>
              <div className={`rounded-full px-3 py-1 text-xs font-semibold ${exact ? "bg-emerald-100 text-emerald-700" : allocated > Number(item.qty) ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                {vi ? "Đã phân bổ" : "Allocated"} {fmt(allocated)} / {fmt(Number(item.qty))}
              </div>
            </div>
            <div className="grid gap-4 p-4 lg:grid-cols-[1fr_1.25fr]">
              <div>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{vi ? "SKU phù hợp trong kho" : "Matching warehouse SKUs"}</div>
                <div className="space-y-2">
                  {products.map(product => {
                    const stockSelected = itemRows.some(row => row.product_id === product.id && row.source_type === "STOCK")
                    const newSelected = itemRows.some(row => row.product_id === product.id && row.source_type === "NEW_STOCK")
                    return <div key={product.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-semibold">{product.name}</div><div className="text-[10px] text-slate-400 mono">{product.sku}</div></div><div className="text-right text-[10px]"><div>{vi ? "Khả dụng" : "Available"} <b className="text-emerald-700">{fmt(Number(product.available))}</b></div><div className="text-slate-400">{vi ? "Tồn / giữ" : "On hand / reserved"}: {fmt(Number(product.on_hand))} / {fmt(Number(product.reserved))}</div></div></div>
                      <div className="mt-2 flex gap-2"><button disabled={stockSelected || remaining <= 0 || Number(product.available) <= 0} onClick={() => addAllocation(item, "STOCK", product.id)} className="h-7 rounded-md border px-2 text-[10px] font-medium text-blue-700 disabled:opacity-40">{vi ? "Dùng tồn" : "Use stock"}</button><button disabled={newSelected || remaining <= 0} onClick={() => addAllocation(item, "NEW_STOCK", product.id)} className="h-7 rounded-md border px-2 text-[10px] font-medium text-amber-700 disabled:opacity-40">{vi ? "Nhập thêm" : "New stock"}</button></div>
                    </div>
                  })}
                  {products.length === 0 && <div className="rounded-lg border border-dashed p-3 text-center text-xs text-slate-400">{vi ? "Chưa có SKU phù hợp" : "No matching SKU"}</div>}
                  <button disabled={remaining <= 0 || itemRows.some(row => row.new_product)} onClick={() => addAllocation(item, "NEW_STOCK", "", true)} className="h-8 w-full rounded-lg border border-dashed text-xs font-medium text-violet-700 disabled:opacity-40"><Plus size={12} className="mr-1 inline" />{vi ? "Tạo SKU mới khi xác nhận" : "Create new SKU on submit"}</button>
                </div>
              </div>
              <div>
                <div className="mb-2 flex justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-500"><span>{vi ? "Phân bổ đã chọn" : "Selected allocations"}</span><span>{vi ? "Còn lại" : "Remaining"}: {fmt(remaining)}</span></div>
                <div className="space-y-3">
                  {itemRows.map(row => {
                    const product = productFor(row)
                    const maxQty = row.source_type === "STOCK" ? Number(product?.available ?? 0) : Number(item.qty)
                    return <div key={row.key} className={`rounded-lg border p-3 ${row.source_type === "STOCK" ? "border-blue-200 bg-blue-50/40" : "border-amber-200 bg-amber-50/40"}`}>
                      <div className="flex items-start justify-between"><div><span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${row.source_type === "STOCK" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>{row.source_type}</span><span className="ml-2 text-xs font-semibold">{row.new_product ? (vi ? "SKU mới" : "New SKU") : product?.name}</span></div><button onClick={() => setRows(previous => previous.filter(candidate => candidate.key !== row.key))} className="text-slate-400 hover:text-red-600"><Trash2 size={13} /></button></div>
                      {row.new_product && <div className="mt-3 grid grid-cols-2 gap-2"><input value={row.new_product.sku} onChange={event => updateNewProduct(row.key, { sku: event.target.value })} placeholder="SKU *" className="h-8 rounded border px-2 text-xs" /><input value={row.new_product.name} onChange={event => updateNewProduct(row.key, { name: event.target.value })} placeholder={vi ? "Tên sản phẩm *" : "Product name *"} className="h-8 rounded border px-2 text-xs" /><input value={row.new_product.unit} onChange={event => updateNewProduct(row.key, { unit: event.target.value })} placeholder={vi ? "Đơn vị *" : "Unit *"} className="h-8 rounded border px-2 text-xs" /><label className="flex h-8 items-center gap-2 rounded border bg-white px-2 text-[10px]"><input type="checkbox" checked={row.new_product.track_batch} onChange={event => updateNewProduct(row.key, { track_batch: event.target.checked })} />{vi ? "Theo dõi lô" : "Track batch"}</label></div>}
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <label className="text-[9px] text-slate-500">{vi ? "Số lượng" : "Quantity"}<input type="number" min={0.01} max={maxQty} step="0.01" value={row.qty} onChange={event => updateRow(row.key, { qty: Math.max(0, Number(event.target.value)) })} className="mt-1 h-8 w-full rounded border bg-white px-2 text-right text-xs" /></label>
                        {row.source_type === "NEW_STOCK" && <>
                          <label className="text-[9px] text-slate-500">
                            {vi ? "Nhà cung cấp" : "Supplier"}
                            <AsyncPaginatedSelect
                              value={row.supplier_id}
                              onChange={nextValue => updateRow(row.key, { supplier_id: nextValue })}
                              loadPage={loadSuppliers}
                              placeholder="--"
                              searchPlaceholder={vi ? "Tìm nhà cung cấp..." : "Search suppliers..."}
                              emptyText={vi ? "Không có nhà cung cấp phù hợp" : "No matching supplier"}
                              loadingText={vi ? "Đang tải..." : "Loading..."}
                              loadMoreText={vi ? "Tải thêm" : "Load more"}
                              className="mt-1"
                              buttonClassName="h-8 text-xs"
                            />
                          </label>
                          <label className="text-[9px] text-slate-500">{vi ? "Giá thực nhập" : "Actual cost"}<input type="number" min={0} value={row.unit_cost} onChange={event => updateRow(row.key, { unit_cost: Math.max(0, Number(event.target.value)) })} className="mt-1 h-8 w-full rounded border bg-white px-2 text-right text-xs" /></label>
                          <label className="text-[9px] text-slate-500">{vi ? "Số lô" : "Batch"}<input value={row.batch_number} onChange={event => updateRow(row.key, { batch_number: event.target.value })} className="mt-1 h-8 w-full rounded border bg-white px-2 text-xs" /></label>
                          <label className="text-[9px] text-slate-500">{vi ? "Ngày SX" : "Manufactured"}<input type="date" value={row.manufacture_date} onChange={event => updateRow(row.key, { manufacture_date: event.target.value })} className="mt-1 h-8 w-full rounded border bg-white px-2 text-xs" /></label>
                          <label className="text-[9px] text-slate-500">{vi ? "Hạn dùng" : "Expiry"}<input type="date" min={row.manufacture_date || undefined} value={row.expiry_date} onChange={event => updateRow(row.key, { expiry_date: event.target.value })} className="mt-1 h-8 w-full rounded border bg-white px-2 text-xs" /></label>
                        </>}
                      </div>
                    </div>
                  })}
                  {itemRows.length === 0 && <div className="rounded-lg border border-dashed p-6 text-center text-xs text-slate-400">{vi ? "Chọn tồn kho, nhập thêm hoặc tạo SKU mới." : "Choose stock, new stock, or create a SKU."}</div>}
                </div>
              </div>
            </div>
          </section>
        })}
      </div>
      <div className="flex items-center justify-between border-t bg-white px-5 py-4"><div className={`text-xs ${allExact ? "text-emerald-700" : "text-amber-700"}`}>{allExact ? (vi ? "Tất cả danh mục đã được phân bổ đủ." : "Every category is fully allocated.") : (vi ? "Cần phân bổ đúng đủ số lượng cho mọi danh mục." : "Every category must be allocated exactly.")}</div><div className="flex gap-2"><button disabled={submitting} onClick={onClose} className="h-9 rounded-lg border px-4 text-xs">{vi ? "Đóng" : "Close"}</button><button disabled={!allExact || submitting} onClick={() => void submit()} className="h-9 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white disabled:opacity-40">{submitting ? (vi ? "Đang xác nhận..." : "Submitting...") : (vi ? "Xác nhận Convert" : "Confirm conversion")}</button></div></div>
    </div>
  </div>
}

export default function Quotations() {
  const { lang } = useLang()
  const vi = lang === "vi"
  const [data, setData] = useState<any[]>([])
  const { isDemo } = useDemo()
  const { profile, can } = useAuth()
  const lookupPageCacheRef = useRef(new Map<string, Promise<AsyncSelectPage<QuotationLookupOption>>>())

  const loadQuotationData = useCallback(async () => {
    const result = await fetchQuotations({ isDemo, orgId: profile?.org_id })
    if (result.error) showAppToast(result.error.message ?? String(result.error))
    if (result.data) setData(result.data)
  }, [isDemo, profile?.org_id])

  useEffect(() => {
    void loadQuotationData()
  }, [loadQuotationData])

  useEffect(() => {
    lookupPageCacheRef.current.clear()
  }, [isDemo, profile?.org_id])

  const loadLookupPage = useCallback<QuotationLookupLoader>((kind, searchText, offset, limit) => {
    const cacheKey = `${isDemo}:${profile?.org_id ?? ""}:${kind}:${searchText.trim().toLocaleLowerCase("vi")}:${offset}:${limit}`
    const cached = lookupPageCacheRef.current.get(cacheKey)
    if (cached) return cached
    const request = (async () => {
      const result = await fetchLookup(kind, {
        isDemo,
        orgId: profile?.org_id,
        search: searchText,
        offset,
        limit,
      })
      if (result.error) throw result.error
      const rows = result.data ?? []
      return {
        options: rows.map(option => ({
          value: kind === "units" ? option.label : option.id,
          label: option.label,
          code: option.code,
          name: option.label,
          representative: String(option.representative ?? ""),
          address: String(option.address ?? ""),
          phone: String(option.phone ?? ""),
          email: String(option.email ?? ""),
          tax_code: String(option.taxCode ?? ""),
        })),
        hasMore: rows.length === limit,
      }
    })()
    lookupPageCacheRef.current.set(cacheKey, request)
    request.catch(() => lookupPageCacheRef.current.delete(cacheKey))
    return request
  }, [isDemo, profile?.org_id])

  const lookupProductsForCategory = useCallback(async (categoryId: string, warehouseId: string) => {
    const result = await fetchLookup("products", {
      isDemo,
      orgId: profile?.org_id,
      categoryId,
      warehouseId,
      includeStock: true,
      limit: 200,
    })
    if (result.error) throw result.error
    return toProductOptions(result.data ?? [])
  }, [isDemo, profile?.org_id])
  
  const [search, setSearch] = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [editingItem, setEditingItem] = useState<any>(null)
  const [viewingItem, setViewingItem] = useState<any>(null)
  const [allocationQuotationId, setAllocationQuotationId] = useState<string | null>(null)
  const [operationBusy, setOperationBusy] = useState(false)

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

  const refreshQuotations = async () => {
    const quotationResult = await fetchQuotations({ isDemo, orgId: profile?.org_id })
    if (quotationResult.data) setData(quotationResult.data)
  }

  const deliverAllocatedQuotation = async (quotation: any) => {
    if (operationBusy) return
    const confirmed = await confirmAppAction(
      vi ? "Giao toàn bộ hàng đã phân bổ và xuất kho ngay?" : "Deliver all allocated items and issue inventory now?",
    )
    if (!confirmed) return
    setOperationBusy(true)
    try {
      const ref = `DN-QT-${String(quotation.id).slice(-8)}-${Date.now().toString().slice(-6)}`
      const result = await deliverQuotationAllocation(quotation.id, ref, { isDemo, orgId: profile?.org_id })
      if (result.error) throw result.error
      await refreshQuotations()
      showAppToast(vi ? `Đã giao hàng và xuất kho theo phiếu ${ref}.` : `Delivered and issued inventory as ${ref}.`, "success")
    } catch (error: any) {
      showAppToast(error?.message ?? (vi ? "Không thể giao báo giá" : "Could not deliver quotation"))
    } finally {
      setOperationBusy(false)
    }
  }

  const cancelAllocatedQuotation = async (quotation: any) => {
    if (operationBusy) return
    const confirmed = await confirmAppAction(
      vi ? "Hủy báo giá và giải phóng toàn bộ tồn giữ chỗ? Hàng mới đã nhập vẫn còn trong kho." : "Cancel and release all reservations? Newly received stock remains on hand.",
      { destructive: true },
    )
    if (!confirmed) return
    setOperationBusy(true)
    try {
      const result = await cancelQuotationAllocation(quotation.id, { isDemo, orgId: profile?.org_id })
      if (result.error) throw result.error
      await refreshQuotations()
      showAppToast(vi ? "Đã giải phóng tồn giữ chỗ." : "Reservations released.", "success")
    } catch (error: any) {
      showAppToast(error?.message ?? (vi ? "Không thể hủy phân bổ" : "Could not cancel allocation"))
    } finally {
      setOperationBusy(false)
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
    const normalizedForm = { ...form, customer_name: form.customer_name || "" }
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
      case "awaiting delivery": return "Chờ giao hàng";
      case "delivered": return "Đã giao hàng";
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
      case "awaiting delivery": return "bg-amber-100 text-amber-700"
      case "delivered": return "bg-indigo-100 text-indigo-700"
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
                <td className="py-3 text-sm font-medium text-blue-600 cursor-pointer" onClick={() => setViewingItem(q)}><span className="hover:underline">{q.id}</span>{q.source === "dataDemo" && <span className="ml-2 rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold text-violet-700">DEMO</span>}</td>
                <td className="py-3 text-sm text-slate-700">{q.customer_name}</td>
                <td className="py-3 text-sm text-slate-500">{q.date}</td>
                <td className="py-3 text-sm text-slate-500">{q.valid_until}</td>
                <td className="py-3 text-sm text-slate-900 font-mono font-medium">{money(q.total)}</td>
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
                    {can("Sales", "approve") && q.status.toLowerCase() === "accepted" && (
                      <button onClick={() => setAllocationQuotationId(q.id)} title={vi ? "Phân bổ SKU và giữ chỗ" : "Allocate SKUs and reserve"} className="w-7 h-7 flex items-center justify-center rounded border bg-emerald-50 text-emerald-700 hover:bg-emerald-100" style={{ borderColor: "var(--border)" }}>
                        <PackageCheck size={14} />
                      </button>
                    )}
                    {can("Sales", "create") && q.status.toLowerCase() === "awaiting delivery" && <button disabled={operationBusy} onClick={() => void deliverAllocatedQuotation(q)} title={vi ? "Giao hàng và xuất kho" : "Deliver and issue stock"} className="w-7 h-7 flex items-center justify-center rounded border bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-40" style={{ borderColor: "var(--border)" }}><Truck size={14} /></button>}
                    {can("Sales", "approve") && q.status.toLowerCase() === "awaiting delivery" && <button disabled={operationBusy} onClick={() => void cancelAllocatedQuotation(q)} title={vi ? "Hủy và giải phóng giữ chỗ" : "Cancel and release reservations"} className="w-7 h-7 flex items-center justify-center rounded border text-red-600 hover:bg-red-50 disabled:opacity-40" style={{ borderColor: "var(--border)" }}><Ban size={14} /></button>}
                    <button onClick={() => setViewingItem(q)} className="w-7 h-7 flex items-center justify-center rounded border text-slate-400 hover:text-slate-600 hover:bg-white" style={{ borderColor: "var(--border)" }} title={vi ? "Xem chi tiết" : "View Details"}>
                      <FileText size={14} />
                    </button>
                    {can("Sales", "update") && (q.status.toLowerCase() === "draft" || q.status.toLowerCase() === "pending") && (
                      <button onClick={() => setEditingItem(q)} className="w-7 h-7 flex items-center justify-center rounded border text-slate-400 hover:text-slate-600 hover:bg-white" style={{ borderColor: "var(--border)" }} title={vi ? "Sửa" : "Edit"}>
                        <Edit size={14} />
                      </button>
                    )}
                    {can("Sales", "update") && !["converted", "cancelled", "awaiting delivery", "delivered"].includes(q.status.toLowerCase()) && <button onClick={async () => { if (await confirmAppAction(vi ? "Bạn có chắc muốn hủy báo giá này?" : "Are you sure to cancel this quote?", { destructive: true })) updateStatus(q.id, "Cancelled") }} className="w-7 h-7 flex items-center justify-center rounded border text-slate-400 hover:text-red-500 hover:bg-red-50" style={{ borderColor: "var(--border)" }} title={vi ? "Hủy" : "Cancel"}>
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

      {showCreate && <QuotationForm canExport={can("Sales", "export")} onClose={() => setShowCreate(false)} vi={vi} mode="create" onSave={handleSave} onLoadLookup={loadLookupPage} onLookupProducts={lookupProductsForCategory} />}
      {editingItem && <QuotationForm canExport={can("Sales", "export")} onClose={() => setEditingItem(null)} vi={vi} mode="edit" initialData={editingItem} onSave={handleSave} onLoadLookup={loadLookupPage} onLookupProducts={lookupProductsForCategory} />}
      {viewingItem && <QuotationForm canExport={can("Sales", "export")} onClose={() => setViewingItem(null)} vi={vi} mode="view" initialData={viewingItem} onLoadLookup={loadLookupPage} onLookupProducts={lookupProductsForCategory} />}
      {allocationQuotationId && <QuotationAllocationModal quotationId={allocationQuotationId} onLoadLookup={loadLookupPage} vi={vi} isDemo={isDemo} orgId={profile?.org_id} onClose={() => setAllocationQuotationId(null)} onComplete={() => { setAllocationQuotationId(null); void refreshQuotations() }} />}
    </div>
  )
}
