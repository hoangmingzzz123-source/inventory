import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Plus, Download, Check, X, FileText, Save, Info, Edit, Trash2, Send, Ban, PackageCheck, Truck, ExternalLink, Star, RefreshCw, Eye } from "lucide-react"
import { useLang } from "../i18n/LangContext"
import { exportXlsx, Toolbar } from "./GenericList"
import { useDemo } from "../contexts/DemoContext"
import { useAuth } from "../contexts/AuthContext"
import { assertQuotationVersion, cancelQuotationAllocation, convertQuotationAllocations, deliverQuotationAllocation, fetchCompanySettings, fetchLookup, fetchQuotationAllocationContext, fetchQuotationCustomerSnapshot, fetchQuotationReference, fetchQuotationReferencePage, fetchQuotationSettings, fetchQuotations, upsertQuotation, deleteQuotation, type QuotationAllocationContext, type QuotationReferenceContext, type QuotationReferencePage, type QuotationReferenceRecord, type QuotationReferenceSection } from "../lib/dataService"
import { defaultQuotationSettings } from "../lib/companySettings"
import logoUrl from "../data/logo.png"
import { formatDateKeyUtc7 } from "../lib/dateUtils"
import { confirmAppAction, showAppToast } from "../lib/appEvents"
import { formatQuantity, formatVnd } from "../lib/numberFormat"
import AsyncPaginatedSelect, { type AsyncSelectOption, type AsyncSelectPage } from "../components/AsyncPaginatedSelect"
import {
  buildQuotationRenderModel,
  exportQuotationExcel as exportQuotationExcelV2,
  exportQuotationPdf as exportQuotationPdfV2,
  renderQuotationHtml,
  type QuotationRenderModel,
} from "../lib/quotationExport"

const fmt = formatQuantity
const money = formatVnd

function addDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T00:00:00+07:00`)
  date.setDate(date.getDate() + days)
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" })
}

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

type QuotationReferenceLoader = (
  categoryId: string,
  customerId: string,
  excludeQuotationId?: string,
) => Promise<QuotationReferenceContext>

type QuotationReferencePageLoader = (
  categoryId: string,
  customerId: string,
  section: QuotationReferenceSection,
  offset: number,
  excludeQuotationId?: string,
) => Promise<QuotationReferencePage>

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

function allocationSourceLabel(sourceType: string, vi: boolean) {
  const normalized = sourceType.toUpperCase()
  if (normalized === "STOCK") return vi ? "Tồn kho" : "Stock"
  if (normalized === "NEW_STOCK") return vi ? "Nhập mới" : "New stock"
  return sourceType
}

function reservationStatusLabel(status: string, vi: boolean) {
  const normalized = status.toUpperCase()
  const labels: Record<string, { vi: string; en: string }> = {
    ACTIVE: { vi: "Đang giữ chỗ", en: "Reserved" },
    CONSUMED: { vi: "Đã xuất kho", en: "Consumed" },
    RELEASED: { vi: "Đã giải phóng", en: "Released" },
    CANCELLED: { vi: "Đã hủy", en: "Cancelled" },
  }
  return labels[normalized]?.[vi ? "vi" : "en"] ?? status
}

function referenceHref(screen: string, value?: string | null, exactId = false) {
  const params = new URLSearchParams()
  params.set("screen", screen)
  if (value) params.set(exactId ? "id" : "search", value)
  return `${window.location.pathname}?${params.toString()}`
}

function ReferenceLink({ screen, value, label, exactId = false }: {
  screen: string
  value?: string | null
  label?: string | null
  exactId?: boolean
}) {
  if (!value && !label) return <span className="text-slate-400">—</span>
  return <a
    href={referenceHref(screen, value || label, exactId)}
    target="_blank"
    rel="noreferrer"
    className="inline-flex max-w-full items-center gap-1 font-medium text-blue-600 hover:underline"
    onClick={event => event.stopPropagation()}
  >
    <span className="truncate">{label || value}</span><ExternalLink size={10} className="shrink-0" />
  </a>
}

function referenceIdentity(record?: QuotationReferenceRecord | null) {
  if (record?.referenceType === "CATEGORY_DEFAULT") return `CATEGORY_DEFAULT:${record.categoryId ?? ""}`
  if (record?.referenceType === "MANUAL") return `MANUAL:${record.categoryId ?? ""}`
  return record?.quotationItemId
    ? `${record.quotationItemId}:${record.productId ?? "unallocated"}`
    : record?.receiptItemId || ""
}

function formatReferenceDate(value?: string | null, vi = true) {
  if (!value) return "—"
  const dateValue = new Date(value)
  if (Number.isNaN(dateValue.getTime())) return value
  return new Intl.DateTimeFormat(vi ? "vi-VN" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(dateValue)
}

function QuotationReferencePanel({
  vi,
  item,
  context,
  loading,
  error,
  isView,
  loadingMore,
  onRetry,
  onLoadMore,
  onUseReference,
  onApplyPrice,
}: {
  vi: boolean
  item: any
  context: QuotationReferenceContext | null
  loading: boolean
  error: string
  isView: boolean
  loadingMore: QuotationReferenceSection | null
  onRetry: () => void
  onLoadMore: (section: QuotationReferenceSection) => void
  onUseReference: (record: QuotationReferenceRecord) => void
  onApplyPrice: (record: QuotationReferenceRecord) => void
}) {
  const [tab, setTab] = useState<"same" | "recent" | "imports">("same")
  const sameCustomer = context?.sameCustomer ?? []
  const recentSales = context?.recentSales ?? []
  const recentImports = context?.recentImports ?? []
  const records = tab === "same" ? sameCustomer : tab === "recent" ? recentSales : recentImports
  const section = tab === "same" ? "sameCustomer" : tab === "recent" ? "recentSales" : "recentImports"
  const total = section === "sameCustomer" ? context?.sameCustomerTotal ?? sameCustomer.length
    : section === "recentSales" ? context?.recentSalesTotal ?? recentSales.length
    : context?.recentImportsTotal ?? recentImports.length
  const hasMore = records.length < total
  const selectedIdentity = referenceIdentity(item?.reference)
  const featuredRecord = item?.reference ?? context?.primary ?? null

  useEffect(() => {
    if (!context) return
    if (context.sameCustomer.length) setTab("same")
    else if (context.recentSales.length) setTab("recent")
    else setTab("imports")
  }, [item?.category_id, context])

  const renderRecord = (record: QuotationReferenceRecord) => {
    const isSale = record.referenceType === "SALE"
    const isDefault = record.referenceType === "CATEGORY_DEFAULT"
    const isPrimary = referenceIdentity(context?.primary) === referenceIdentity(record)
    const isSelected = selectedIdentity === referenceIdentity(record)
    const sourceScreen = isSale ? "quotations" : "goods-receipt"
    const sourceValue = isSale ? record.quotationId : record.receiptRef
    return <div key={referenceIdentity(record)} className={`rounded-lg border bg-white p-3 text-[11px] ${isSelected ? "border-blue-400 ring-1 ring-blue-100" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1 font-semibold text-slate-900">
            {isPrimary && <Star size={11} className="shrink-0 fill-amber-400 text-amber-500" />}
            {isDefault
              ? <span>{record.categoryName || (vi ? "Mặc định danh mục" : "Category default")}</span>
              : <ReferenceLink screen="products" value={record.productName || record.sku} label={record.productName || record.sku || (vi ? "Chưa phân bổ SKU" : "SKU not allocated")} />}
          </div>
          {record.sku && <div className="mt-0.5 font-mono text-[9px] text-slate-400">{record.sku}</div>}
        </div>
        {isSelected && <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">{vi ? "ĐANG DÙNG" : "SELECTED"}</span>}
      </div>
      <div className="mt-2 grid grid-cols-[84px_minmax(0,1fr)] gap-x-2 gap-y-1">
        {isDefault ? <>
          <span className="text-slate-500">{vi ? "Nguồn" : "Source"}</span><ReferenceLink screen="categories" value={record.categoryName} label={vi ? "Mặc định danh mục" : "Category default"} />
          <span className="text-slate-500">{vi ? "ĐVT" : "Unit"}</span><b>{record.importUnit || "—"}</b>
          <span className="text-slate-500">{vi ? "Giá nhập ref" : "Purchase ref"}</span><b>{money(record.importPrice)}</b>
          <span className="text-slate-500">{vi ? "Giá bán ref" : "Sale ref"}</span><b>{money(record.salePrice)}</b>
          <span className="text-slate-500">VAT</span><b>{record.hasVat === false ? "0%" : `${fmt(Number(record.vatPct ?? 0))}%`}</b>
        </> : isSale ? <>
          <span className="text-slate-500">{vi ? "Khách hàng" : "Customer"}</span>
          <ReferenceLink screen="customers" value={record.customerName || record.customerId} label={record.customerName || record.customerId} />
          <span className="text-slate-500">{vi ? "Số lượng" : "Quantity"}</span><b>{fmt(Number(record.quantity ?? 0))}</b>
          <span className="text-slate-500">{vi ? "Giá nhập" : "Import price"}</span>
          <ReferenceLink screen={record.receiptRef ? "goods-receipt" : sourceScreen} value={record.receiptRef || sourceValue} label={money(record.importPrice)} exactId={isSale && !record.receiptRef} />
          <span className="text-slate-500">{vi ? "Giá bán" : "Sale price"}</span>
          <ReferenceLink screen="quotations" value={record.quotationId} label={money(record.salePrice)} exactId />
          <span className="text-slate-500">{vi ? "Lãi tham chiếu" : "Reference margin"}</span><b>{record.marginPct == null ? "—" : `${fmt(Number(record.marginPct))}%`}</b>
          <span className="text-slate-500">VAT</span><b>{fmt(Number(record.vatPct ?? 0))}%</b>
          <span className="text-slate-500">{vi ? "Báo giá" : "Quotation"}</span>
          <ReferenceLink screen="quotations" value={record.quotationId} label={record.quotationLabel || (vi ? "Mở báo giá" : "Open quotation")} exactId />
        </> : <>
          <span className="text-slate-500">{vi ? "Nhà cung cấp" : "Supplier"}</span>
          <ReferenceLink screen="suppliers" value={record.supplierName || record.supplierId} label={record.supplierName || record.supplierId} />
          <span className="text-slate-500">{vi ? "Số lượng" : "Quantity"}</span><b>{fmt(Number(record.quantity ?? 0))} {record.importUnit || ""}</b>
          <span className="text-slate-500">{vi ? "Giá nhập" : "Import price"}</span>
          <ReferenceLink screen="goods-receipt" value={record.receiptRef} label={money(record.importPrice)} />
          <span className="text-slate-500">{vi ? "Phiếu nhập" : "Receipt"}</span>
          <ReferenceLink screen="goods-receipt" value={record.receiptRef} label={record.receiptRef} />
        </>}
        {!isDefault && <><span className="text-slate-500">{vi ? "Ngày" : "Date"}</span><b>{formatReferenceDate(record.referenceDate, vi)}</b></>}
      </div>
      {!isView && <div className="mt-3 flex gap-1.5 border-t pt-2">
        <button type="button" onClick={() => onUseReference(record)} className="flex-1 rounded-md border border-blue-200 px-2 py-1.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-50">
          {vi ? "Dùng làm tham chiếu" : "Use as reference"}
        </button>
        {(isSale || isDefault) && <button type="button" onClick={() => onApplyPrice(record)} className="flex-1 rounded-md bg-blue-600 px-2 py-1.5 text-[10px] font-semibold text-white hover:bg-blue-700">
          {vi ? "Áp dụng giá" : "Apply price"}
        </button>}
      </div>}
    </div>
  }

  return <div className="rounded-xl border bg-white shadow-sm" style={{ borderColor: "var(--border)" }}>
    <div className="flex items-center gap-2 border-b p-4" style={{ borderColor: "var(--border)" }}>
      <Star size={15} className="text-amber-500" />
      <div className="min-w-0"><h3 className="text-sm font-semibold text-slate-900">{vi ? "Tham chiếu báo giá" : "Quotation references"}</h3><div className="truncate text-[10px] text-slate-400">{item?.category_name || (vi ? "Chưa chọn danh mục" : "No category selected")}</div></div>
    </div>
    <div className="space-y-3 p-3">
      {!item?.category_id ? <div className="rounded-lg border border-dashed p-5 text-center text-xs text-slate-400">{vi ? "Hãy chọn danh mục sản phẩm để xem thông tin tham chiếu." : "Select a product category to view references."}</div> : <>
        {loading && <div className="rounded-lg bg-slate-50 p-3 text-center text-xs text-slate-500">{vi ? "Đang tải lịch sử giá..." : "Loading price history..."}</div>}
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"><div>{error}</div><button type="button" onClick={onRetry} className="mt-2 inline-flex items-center gap-1 font-semibold hover:underline"><RefreshCw size={11} />{vi ? "Thử lại" : "Retry"}</button></div>}
        {!loading && !error && context && <>
          {context.matchType === "CATEGORY_ONLY" && <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-800">{vi ? "Chưa có lịch sử cùng khách hàng. Đang dùng báo giá gần nhất của danh mục." : "No history for this customer. Using the latest category quotation."}</div>}
          {context.matchType === "CATEGORY_DEFAULT" && <div className="rounded-lg border border-violet-200 bg-violet-50 p-2 text-[10px] text-violet-800">{vi ? "Không có báo giá trước đó. Hệ thống đang dùng ĐVT, giá và VAT mặc định của danh mục." : "No previous quotation. Category unit, prices, and VAT defaults are being used."}</div>}
          {featuredRecord && <div className="space-y-1.5"><div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{item.reference ? (vi ? "Tham chiếu đã chọn" : "Selected reference") : (vi ? "★ Gợi ý ưu tiên" : "★ Primary suggestion")}</div>{renderRecord(featuredRecord)}</div>}
          <div className="grid grid-cols-3 rounded-lg bg-slate-100 p-1">
            {([
              ["same", vi ? "Cùng khách" : "Same customer", context?.sameCustomerTotal ?? sameCustomer.length],
              ["recent", vi ? "Gần đây" : "Recent", context?.recentSalesTotal ?? recentSales.length],
              ["imports", vi ? "Giá nhập" : "Import prices", context?.recentImportsTotal ?? recentImports.length],
            ] as const).map(([key, label, count]) => <button type="button" key={key} onClick={() => setTab(key)} className={`rounded-md px-1 py-1.5 text-[9px] font-semibold ${tab === key ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>{label} ({count})</button>)}
          </div>
          <div className="max-h-[360px] space-y-2 overflow-auto pr-1" onScroll={event => {
            const target = event.currentTarget
            if (hasMore && target.scrollHeight - target.scrollTop - target.clientHeight < 56) onLoadMore(section)
          }}>
            {records.map(renderRecord)}
            {records.length === 0 && <div className="rounded-lg border border-dashed p-4 text-center text-xs text-slate-400">{tab === "imports" ? (vi ? "Chưa có lịch sử giá nhập của danh mục này." : "No category import history.") : (vi ? "Chưa có lịch sử bán hàng phù hợp." : "No matching sales history.")}</div>}
            {loadingMore === section && <div className="py-2 text-center text-[10px] text-slate-500">{vi ? "Đang tải thêm..." : "Loading more..."}</div>}
            {!loadingMore && hasMore && <button type="button" onClick={() => onLoadMore(section)} className="w-full rounded-md py-2 text-[10px] font-semibold text-blue-600 hover:bg-blue-50">{vi ? `Tải thêm (${records.length}/${total})` : `Load more (${records.length}/${total})`}</button>}
          </div>
        </>}
      </>}
    </div>
  </div>
}

function QuotationPreviewModal({ model, logo, vi, canExport, onClose, onExport }: {
  model: QuotationRenderModel
  logo: string
  vi: boolean
  canExport: boolean
  onClose: () => void
  onExport: (format: "pdf" | "xlsx") => Promise<void>
}) {
  const [format, setFormat] = useState<"pdf" | "xlsx">("pdf")
  const [exporting, setExporting] = useState(false)
  return <div className="fixed inset-0 z-[90] flex flex-col bg-slate-950/70 p-4" onClick={() => !exporting && onClose()}>
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
      <div className="flex items-center justify-between border-b px-5 py-3">
        <div><h2 className="text-sm font-semibold">{vi ? "Xem trước báo giá" : "Quotation preview"}</h2><p className="mt-0.5 text-[10px] text-slate-500">H2T Standard · {model.quotationNumber} · v{model.quotationVersion || (vi ? "bản nháp" : "draft")}</p></div>
        <button disabled={exporting} onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={16} /></button>
      </div>
      <div className="flex-1 overflow-auto bg-slate-200 p-6">
        <div className="mx-auto w-fit origin-top scale-[0.92] overflow-hidden rounded-sm shadow-xl" dangerouslySetInnerHTML={{ __html: renderQuotationHtml(model, model.company.logoUrl || logo) }} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-white px-5 py-3">
        {canExport ? <div className="flex items-center gap-4 text-xs">
          <span className="font-medium text-slate-600">{vi ? "Định dạng:" : "Format:"}</span>
          <label className="flex items-center gap-1.5"><input type="radio" checked={format === "pdf"} onChange={() => setFormat("pdf")} /> PDF</label>
          <label className="flex items-center gap-1.5"><input type="radio" checked={format === "xlsx"} onChange={() => setFormat("xlsx")} /> Excel (.xlsx)</label>
        </div> : <span className="text-xs text-slate-500">{vi ? "Bản xem trước chỉ đọc" : "Read-only preview"}</span>}
        <div className="flex gap-2"><button disabled={exporting} onClick={onClose} className="h-9 rounded-lg border px-4 text-xs">{vi ? "Quay lại" : "Back"}</button>{canExport && <button disabled={exporting} onClick={async () => { setExporting(true); try { await onExport(format) } catch (error: any) { showAppToast(error?.message ?? String(error)) } finally { setExporting(false) } }} className="h-9 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white disabled:opacity-50"><Download size={13} className="mr-1.5 inline" />{exporting ? (vi ? "Đang xuất..." : "Exporting...") : (vi ? "Xuất file" : "Export")}</button>}</div>
      </div>
    </div>
  </div>
}

function QuotationForm({ onClose, vi, mode = "create", initialData = null, onSave, canExport = true, onLoadLookup, onLookupProducts, onLoadReference, onLoadReferencePage }: { onClose: () => void; vi: boolean, mode?: "create" | "edit" | "view", initialData?: any, onSave?: (data: any) => void, canExport?: boolean; onLoadLookup: QuotationLookupLoader; onLookupProducts?: (categoryId: string, warehouseId: string) => Promise<ProductOption[]>; onLoadReference?: QuotationReferenceLoader; onLoadReferencePage?: QuotationReferencePageLoader }) {
  const { profile } = useAuth()
  const { isDemo } = useDemo()
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
  const [validUntil, setValidUntil] = useState(initialData?.valid_until || addDays(formatDateKeyUtc7(), defaultQuotationSettings.defaultValidityDays))
  const [globalDiscount, setGlobalDiscount] = useState(initialData?.discount_val || 0)
  const [discountType, setDiscountType] = useState<"pct" | "amount">(initialData?.discount_type || "pct")
  const [notes, setNotes] = useState(initialData?.notes || "")
  const quotationNumber = initialData?.quotation_number || ""
  const [title, setTitle] = useState(initialData?.title || defaultQuotationSettings.defaultTitle)
  const [project, setProject] = useState(initialData?.project || "")
  const [salespersonPhone, setSalespersonPhone] = useState(initialData?.salesperson_phone || "")
  const [paymentTerms, setPaymentTerms] = useState(initialData?.payment_terms || defaultQuotationSettings.defaultPaymentTerms)
  const [deliveryTerms, setDeliveryTerms] = useState(initialData?.delivery_terms || defaultQuotationSettings.defaultDeliveryTerms)
  const [footerNotes, setFooterNotes] = useState(initialData?.footer_notes || defaultQuotationSettings.defaultFooterNotes)
  const [includeShipping, setIncludeShipping] = useState(initialData?.include_shipping ?? defaultQuotationSettings.defaultIncludeShipping)
  const [previewModel, setPreviewModel] = useState<QuotationRenderModel | null>(null)
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
        offered_description: it.offered_description || it.category_name || it.product_name || "",
        specification_brand: it.specification_brand || "",
        note: it.note || "",
        has_vat: it.has_vat ?? Number(it.vat_pct ?? 0) > 0,
        reference_resolver_key: `${initialData?.customer_id || ""}:${it.category_id || ""}`,
      }))
    : [{ id: Date.now(), category_id: "", category_name: "", offered_description: "", specification_brand: "", note: "", sell_unit: "", qty: 1, cost_price: 0, profit_pct: 20, selling_price: 0, has_vat: false, vat_pct: 0, total: 0, reference_resolver_key: "" }])
  const [activeRowId, setActiveRowId] = useState<number | null>(null)
  const [resolvedProductOptions, setResolvedProductOptions] = useState<ProductOption[]>([])
  const loadedProductScopesRef = useRef(new Set<string>())
  const [productLookupLoading, setProductLookupLoading] = useState(false)
  const [productLookupError, setProductLookupError] = useState("")
  const [referenceContext, setReferenceContext] = useState<QuotationReferenceContext | null>(null)
  const [referenceLoading, setReferenceLoading] = useState(false)
  const [referenceError, setReferenceError] = useState("")
  const [referenceScope, setReferenceScope] = useState("")
  const [referencePageLoading, setReferencePageLoading] = useState<QuotationReferenceSection | null>(null)
  const referenceRequestRef = useRef(0)

  useEffect(() => {
    if (mode !== "create") return
    let active = true
    fetchQuotationSettings({ isDemo, orgId: profile?.org_id }).then(result => {
      if (!active || result.error) return
      setTitle(result.data.defaultTitle)
      setPaymentTerms(result.data.defaultPaymentTerms)
      setDeliveryTerms(result.data.defaultDeliveryTerms)
      setFooterNotes(result.data.defaultFooterNotes)
      setIncludeShipping(result.data.defaultIncludeShipping)
      setValidUntil(addDays(date, result.data.defaultValidityDays))
    })
    return () => { active = false }
  }, [date, isDemo, mode, profile?.org_id])

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

  const loadActiveReference = useCallback(async () => {
    const categoryId = activeItem?.category_id
    if (!categoryId || !onLoadReference) {
      setReferenceContext(null)
      setReferenceScope("")
      setReferenceError("")
      return
    }
    const requestId = ++referenceRequestRef.current
    const scopeKey = `${customerId}:${categoryId}`
    setReferenceLoading(true)
    setReferenceError("")
    setReferenceContext(null)
    setReferenceScope("")
    try {
      const result = await onLoadReference(categoryId, customerId, initialData?.id)
      if (referenceRequestRef.current === requestId) {
        const sameCustomer = result.sameCustomer
        const recentSales = result.recentSales
        const primary = sameCustomer[0] ?? recentSales[0] ?? result.categoryDefault ?? null
        setReferenceContext({
          ...result,
          sameCustomer,
          recentSales,
          primary,
          matchType: sameCustomer.length ? "CUSTOMER_AND_CATEGORY"
            : recentSales.length ? "CATEGORY_ONLY"
            : result.categoryDefault ? "CATEGORY_DEFAULT" : "NONE",
        })
        setReferenceScope(scopeKey)
      }
    } catch (error: any) {
      if (referenceRequestRef.current === requestId) {
        setReferenceContext(null)
        setReferenceError(error?.message ?? (vi ? "Không tải được dữ liệu tham chiếu" : "Could not load references"))
      }
    } finally {
      if (referenceRequestRef.current === requestId) setReferenceLoading(false)
    }
  }, [activeItem?.category_id, customerId, initialData?.id, onLoadReference, vi])

  const loadMoreReferences = useCallback(async (section: QuotationReferenceSection) => {
    if (!referenceContext || !activeItem?.category_id || !onLoadReferencePage || referencePageLoading) return
    const currentItems = section === "sameCustomer" ? referenceContext.sameCustomer
      : section === "recentSales" ? referenceContext.recentSales : referenceContext.recentImports
    const total = section === "sameCustomer" ? referenceContext.sameCustomerTotal
      : section === "recentSales" ? referenceContext.recentSalesTotal : referenceContext.recentImportsTotal
    if (currentItems.length >= total) return
    const scope = `${customerId}:${activeItem.category_id}`
    setReferencePageLoading(section)
    try {
      const page = await onLoadReferencePage(
        activeItem.category_id,
        customerId,
        section,
        currentItems.length,
        initialData?.id,
      )
      if (scope !== `${customerId}:${activeItem.category_id}`) return
      setReferenceContext(current => {
        if (!current) return current
        const existing = section === "sameCustomer" ? current.sameCustomer
          : section === "recentSales" ? current.recentSales : current.recentImports
        const identities = new Set(existing.map(referenceIdentity))
        const combined = [...existing, ...page.items.filter(record => !identities.has(referenceIdentity(record)))]
        return section === "sameCustomer"
          ? { ...current, sameCustomer: combined, sameCustomerTotal: page.total }
          : section === "recentSales"
            ? { ...current, recentSales: combined, recentSalesTotal: page.total }
            : { ...current, recentImports: combined, recentImportsTotal: page.total }
      })
    } catch (error: any) {
      setReferenceError(error?.message ?? (vi ? "Không tải được trang tham chiếu tiếp theo" : "Could not load the next reference page"))
    } finally {
      setReferencePageLoading(null)
    }
  }, [activeItem?.category_id, customerId, initialData?.id, onLoadReferencePage, referenceContext, referencePageLoading, vi])

  useEffect(() => {
    void loadActiveReference()
  }, [loadActiveReference])

  useEffect(() => {
    const reference = referenceContext?.primary
    if (!activeItem || !reference || isView) return
    if (String(reference.categoryId ?? "") !== String(activeItem.category_id)) return
    const resolverKey = `${customerId}:${activeItem.category_id}`
    if (!activeItem.category_id || referenceScope !== resolverKey || activeItem.reference_resolver_key === resolverKey) return
    setItems(previous => previous.map(item => {
      if (item.id !== activeItem.id) return item
      const costPrice = Math.max(0, Number(reference.importPrice ?? item.cost_price ?? 0))
      const sellingPrice = Math.max(0, Number(reference.salePrice ?? item.selling_price ?? 0))
      const vatPct = reference.hasVat === false ? 0 : Math.max(0, Number(reference.vatPct ?? item.vat_pct ?? 0))
      return {
        ...item,
        sell_unit: reference.importUnit || item.sell_unit || "",
        cost_price: costPrice,
        selling_price: sellingPrice,
        profit_pct: costPrice > 0 && sellingPrice > 0
          ? (sellingPrice - costPrice) * 100 / costPrice
          : Number(reference.marginPct ?? item.profit_pct ?? 0),
        has_vat: reference.hasVat ?? vatPct > 0,
        vat_pct: vatPct,
        total: sellingPrice * Number(item.qty ?? 0),
        reference,
        reference_resolver_key: resolverKey,
      }
    }))
  }, [activeItem, customerId, isView, referenceContext, referenceScope])

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
        ? { ...item, category_id: "", category_name: "", offered_description: "", sell_unit: "", cost_price: 0, selling_price: 0, has_vat: false, vat_pct: 0, total: 0, reference: null, reference_resolver_key: "" }
        : item))
      return
    }
    setItems(prev => prev.map(i => {
      if (i.id === rowId) {
        return {
          ...i,
          category_id: categoryId,
          category_name: category?.label ?? i.category_name ?? "",
          offered_description: category?.label ?? i.category_name ?? "",
          specification_brand: "",
          note: "",
          sell_unit: "",
          cost_price: 0,
          profit_pct: 20,
          selling_price: 0,
          has_vat: false,
          vat_pct: 0,
          total: 0,
          reference: null,
          reference_resolver_key: "",
        }
      }
      return i
    }))
    setActiveRowId(rowId)
    await loadCategoryProducts(categoryId, warehouseId)
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
        
        if (field === "cost_price" || field === "profit_pct") {
          updated.selling_price = Math.round(Number(updated.cost_price) * (1 + Number(updated.profit_pct)/100))
        } else if (field === "selling_price") {
          updated.profit_pct = Number(updated.cost_price) > 0 ? ((Number(updated.selling_price) / Number(updated.cost_price)) - 1) * 100 : 100
        } else if (field === "vat_pct") {
          updated.has_vat = Number(val) > 0
        }
        
        updated.total = Number(updated.selling_price) * Number(updated.qty)
        return updated
      }
      return i
    }))
  }

  const useReference = (record: QuotationReferenceRecord) => {
    if (!activeItem || isView) return
    setItems(previous => previous.map(item => {
      if (item.id !== activeItem.id) return item
      const referenceCost = Number(record.importPrice ?? item.cost_price ?? 0)
      const sellingPrice = Math.max(0, Number(record.salePrice ?? item.selling_price ?? 0))
      const vatPct = record.hasVat === false ? 0 : Math.max(0, Number(record.vatPct ?? item.vat_pct ?? 0))
      return {
        ...item,
        reference: record,
        cost_price: referenceCost,
        selling_price: sellingPrice,
        sell_unit: record.importUnit || item.sell_unit,
        has_vat: record.hasVat ?? vatPct > 0,
        vat_pct: vatPct,
        total: sellingPrice * Number(item.qty ?? 0),
        profit_pct: referenceCost > 0 && sellingPrice > 0
          ? (sellingPrice - referenceCost) * 100 / referenceCost
          : Number(record.marginPct ?? item.profit_pct),
      }
    }))
    showAppToast(vi ? "Đã chọn và lưu giá trị tham chiếu cho dòng báo giá." : "Reference selected for this quotation line.", "success")
  }

  const applyReferencePrice = (record: QuotationReferenceRecord) => {
    if (!activeItem || isView || record.salePrice == null) return
    setItems(previous => previous.map(item => {
      if (item.id !== activeItem.id) return item
      const sellingPrice = Math.max(0, Number(record.salePrice))
      return {
        ...item,
        reference: record,
        selling_price: sellingPrice,
        total: sellingPrice * Number(item.qty ?? 0),
        profit_pct: Number(item.cost_price) > 0
          ? (sellingPrice - Number(item.cost_price)) * 100 / Number(item.cost_price)
          : Number(item.profit_pct ?? 0),
      }
    }))
    showAppToast(vi ? "Đã áp dụng giá bán tham chiếu. Bạn vẫn có thể chỉnh sửa." : "Reference sale price applied. It remains editable.", "success")
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

  const validateQuotation = () => {
    if (!customerId) { showAppToast(vi ? "Vui lòng chọn khách hàng" : "Please select a customer"); return false }
    if (!warehouseId) { showAppToast(vi ? "Vui lòng chọn kho thực hiện" : "Please select a fulfillment warehouse"); return false }
    if (!date) { showAppToast(vi ? "Vui lòng chọn ngày báo giá" : "Please select a date"); return false }
    if (!title.trim()) { showAppToast(vi ? "Tiêu đề báo giá là bắt buộc" : "Quotation title is required"); return false }
    if (!validUntil || validUntil < date) { showAppToast(vi ? "Ngày hết hiệu lực phải từ ngày báo giá trở đi" : "Valid-until date must not precede the quotation date"); return false }
    if (discountType === "pct" && (globalDiscount < 0 || globalDiscount > 100)) { showAppToast(vi ? "Chiết khấu % phải từ 0 đến 100" : "Discount % must be between 0 and 100"); return false }
    if (discountType === "amount" && (globalDiscount < 0 || globalDiscount > subtotal)) { showAppToast(vi ? "Chiết khấu không được vượt quá tổng tiền hàng" : "Discount cannot exceed the subtotal"); return false }
    if (items.length === 0) { showAppToast(vi ? "Báo giá phải có ít nhất một danh mục" : "Quotation must have at least one category"); return false }
    if (items.some(i => !i.category_id)) { showAppToast(vi ? "Vui lòng chọn danh mục cho tất cả các dòng" : "Please select a category for every row"); return false }
    if (new Set(items.map(i => i.category_id)).size !== items.length) { showAppToast(vi ? "Mỗi danh mục chỉ được xuất hiện một lần trong báo giá" : "Each category may only appear once in a quotation"); return false }
    if (items.some(i => !String(i.sell_unit ?? "").trim())) { showAppToast(vi ? "Vui lòng chọn đơn vị tính cho tất cả các dòng" : "Please select a unit for every line"); return false }
    if (items.some(i => Number(i.qty) <= 0)) { showAppToast(vi ? "Số lượng phải lớn hơn 0" : "Quantity must be greater than 0"); return false }
    if (items.some(i => Number(i.cost_price) < 0)) { showAppToast(vi ? "Giá vốn tham khảo không được âm" : "Reference cost cannot be negative"); return false }
    if (items.some(i => Number(i.selling_price) <= 0)) { showAppToast(vi ? "Đơn giá bán phải lớn hơn 0" : "Selling price must be greater than zero"); return false }
    if (items.some(i => i.has_vat && (Number(i.vat_pct) <= 0 || Number(i.vat_pct) > 100))) { showAppToast(vi ? "Dòng có VAT phải có thuế suất từ trên 0 đến 100" : "VAT-enabled lines require a rate greater than 0 and at most 100"); return false }
    return true
  }

  const createRenderModel = async () => {
    if (!validateQuotation()) return null
    const [companyResult, customerResult] = await Promise.all([
      fetchCompanySettings({ isDemo, orgId: profile?.org_id }),
      fetchQuotationCustomerSnapshot(customerId, { isDemo, orgId: profile?.org_id }),
    ])
    if (companyResult.error) throw new Error(companyResult.error.message ?? String(companyResult.error))
    if (customerResult.error) throw new Error(customerResult.error.message ?? String(customerResult.error))
    const customer = selectedCustomer || { label: initialData?.customer_name || "" }
    return buildQuotationRenderModel({
      id: initialData?.id,
      quotationNumber,
      version: Number(initialData?.version ?? 0),
      title,
      date,
      validUntil,
      project,
      salesperson: initialData?.created_by || profile?.full_name || profile?.email || "",
      salespersonPhone,
      company: companyResult.data,
      customer: { ...customer, ...customerResult.data, name: customerResult.data?.name || customer.label },
      items,
      subtotal,
      discountAmount,
      totalBeforeVat,
      totalVat,
      finalTotal,
      includeShipping,
      paymentTerms,
      deliveryTerms,
      footerNotes,
      notes,
    })
  }

  const openPreview = async () => {
    try {
      const model = await createRenderModel()
      if (model) setPreviewModel(model)
    } catch (error: any) {
      showAppToast(error?.message ?? String(error))
    }
  }

  const exportPreview = async (format: "xlsx" | "pdf") => {
    if (!previewModel) return
    if (previewModel.quotationId && previewModel.quotationVersion > 0) {
      const result = await assertQuotationVersion(previewModel.quotationId, previewModel.quotationVersion, { isDemo, orgId: profile?.org_id })
      if (result.error) {
        setPreviewModel(null)
        throw new Error(vi ? "Báo giá đã thay đổi. Hãy tải lại và xem trước trước khi xuất." : "The quotation changed. Reload and preview it again before exporting.")
      }
    }
    if (format === "xlsx") await exportQuotationExcelV2(previewModel, logoUrl)
    else await exportQuotationPdfV2(previewModel, logoUrl)
  }

  const validateAndSave = () => {
    if (!validateQuotation()) return
    if (onSave) {
      onSave({
        customer_id: customerId,
        customer_name: selectedCustomer?.label || initialData?.customer_name || "",
        date,
        valid_until: validUntil,
        discount_val: globalDiscount,
        discount_type: discountType,
        notes,
        // The database owns the immutable, concurrency-safe public label.
        // Existing labels are retained by the update trigger; new labels are
        // allocated only after the quotation has actually been inserted.
        title,
        project,
        salesperson_phone: salespersonPhone,
        payment_terms: paymentTerms,
        delivery_terms: deliveryTerms,
        footer_notes: footerNotes,
        include_shipping: includeShipping,
        warehouse_id: warehouseId,
        warehouse_name: selectedWarehouse?.label || initialData?.warehouse_name || "",
        items: items.map(item => ({ ...item, qty: Number(item.qty ?? item.quantity ?? 0), total: Number(item.total ?? (item.quantity ?? 0) * (item.selling_price ?? item.unit_price ?? 0)), selling_price: Number(item.selling_price ?? item.unit_price ?? 0) })),
        total: finalTotal,
      })
    }
  }

  return (
    <div className="absolute inset-0 bg-slate-50 z-20 flex flex-col">
      <div className="flex items-center justify-between px-5 py-3 border-b bg-white" style={{ borderColor: "var(--border)" }}>
        <h2 className="text-base font-semibold">{vi ? (mode === "create" ? "Tạo báo giá mới" : mode === "edit" ? "Sửa báo giá" : "Chi tiết báo giá") : (mode === "create" ? "New Quotation" : mode === "edit" ? "Edit Quotation" : "Quotation Details")}</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => void openPreview()} className="flex h-8 items-center gap-1 rounded-lg border px-3 text-xs text-slate-600 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
            <Eye size={13} /> {canExport ? (vi ? "Xem trước & xuất" : "Preview & export") : (vi ? "Xem trước" : "Preview")}
          </button>
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
                  retryText={vi ? "Thử lại" : "Retry"}
                  clearLabel={vi ? "Bỏ chọn khách hàng" : "Clear customer"}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">{vi ? "Số báo giá" : "Quotation number"}</label>
                <input disabled value={quotationNumber} placeholder={vi ? "Tự sinh khi lưu" : "Generated on save"} className="h-9 w-full rounded-lg border bg-slate-50 px-3 text-sm text-slate-600 outline-none" style={{ borderColor: "var(--border)" }} />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">{vi ? "Dự án" : "Project"}</label>
                <input disabled={isView} value={project} onChange={event => setProject(event.target.value)} className="h-9 w-full rounded-lg border px-3 text-sm outline-none disabled:bg-slate-50" style={{ borderColor: "var(--border)" }} />
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
                  retryText={vi ? "Thử lại" : "Retry"}
                  clearLabel={vi ? "Bỏ chọn kho" : "Clear warehouse"}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">{vi ? "SĐT nhân viên báo giá" : "Salesperson phone"}</label>
                <input disabled={isView} value={salespersonPhone} onChange={event => setSalespersonPhone(event.target.value)} className="h-9 w-full rounded-lg border px-3 text-sm outline-none disabled:bg-slate-50" style={{ borderColor: "var(--border)" }} />
              </div>
              <div className="col-span-4">
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
                    <th className="py-2.5 px-3 font-medium text-slate-600 w-[80px]">{vi ? "ĐVT bán" : "Sales unit"}</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600 text-right w-[60px]">SL</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600 text-right w-[100px]">{vi ? "Giá vốn tham khảo" : "Reference cost"}</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600 text-right w-[70px]">{vi ? "Lãi tham chiếu %" : "Reference margin %"}</th>
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
                          retryText={vi ? "Thử lại" : "Retry"}
                          clearLabel={vi ? "Bỏ chọn danh mục" : "Clear category"}
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
                          retryText={vi ? "Thử lại" : "Retry"}
                          clearLabel={vi ? "Bỏ chọn đơn vị" : "Clear unit"}
                          buttonClassName="h-8 text-xs"
                        />
                      </td>
                      <td className="py-2 px-3 text-right"><input disabled={isView} type="number" min={1} value={it.qty ?? ""} onChange={e => handleUpdateItem(it.id, 'qty', Number(e.target.value))} className="w-full h-8 px-1 text-xs text-right rounded border outline-none bg-white disabled:bg-transparent disabled:border-transparent" style={{ borderColor: "var(--border)" }} /></td>
                      <td className="py-2 px-3 text-right"><input disabled={isView} type="number" value={it.cost_price ?? ""} onChange={e => handleUpdateItem(it.id, 'cost_price', Number(e.target.value))} className="w-full h-8 px-1 text-xs text-right rounded border outline-none bg-white disabled:bg-transparent disabled:border-transparent" style={{ borderColor: "var(--border)" }} /></td>
                      <td className="py-2 px-3 text-right"><input disabled={isView} type="number" value={it.profit_pct ?? ""} onChange={e => handleUpdateItem(it.id, 'profit_pct', Number(e.target.value))} className="w-full h-8 px-1 text-xs text-right rounded border outline-none bg-white disabled:bg-transparent disabled:border-transparent" style={{ borderColor: "var(--border)" }} /></td>
                      <td className="py-2 px-3 text-right"><input disabled={isView} type="number" value={it.selling_price ?? ""} onChange={e => handleUpdateItem(it.id, 'selling_price', Number(e.target.value))} className="w-full h-8 px-1 text-xs text-right rounded border outline-none bg-white disabled:bg-transparent disabled:border-transparent" style={{ borderColor: "var(--border)" }} /></td>
                      <td className="py-2 px-3 text-right">
                        <input disabled={isView} type="number" min={0} max={100} step="0.01" value={it.vat_pct ?? 0} onChange={e => handleUpdateItem(it.id, "vat_pct", Number(e.target.value))} className="h-8 w-full rounded border bg-white px-1 text-right text-xs outline-none disabled:border-transparent disabled:bg-transparent" style={{ borderColor: "var(--border)" }} />
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
                  <button onClick={() => setItems(p => [...p, { id: Date.now(), category_id: "", category_name: "", offered_description: "", specification_brand: "", note: "", sell_unit: "", qty: 1, cost_price: 0, profit_pct: 20, selling_price: 0, has_vat: false, vat_pct: 0, total: 0, reference: null, reference_resolver_key: "" }])} className="text-xs font-medium text-blue-600 flex items-center gap-1 hover:underline">
                    <Plus size={12} /> {vi ? "Thêm dòng" : "Add Row"}
                  </button>
                </div>
              )}
            </div>

            {activeItem && <section className="mt-5 rounded-xl border bg-slate-50 p-4" style={{ borderColor: "var(--border)" }}>
              <h3 className="mb-3 text-xs font-semibold text-slate-700">{vi ? "Nội dung dòng đang chọn" : "Selected line content"}</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-[11px] font-medium text-slate-500">{vi ? "Hàng hóa cung cấp" : "Offered goods"}<input disabled={isView} value={activeItem.offered_description || ""} onChange={event => handleUpdateItem(activeItem.id, "offered_description", event.target.value)} className="mt-1 h-9 w-full rounded-lg border bg-white px-3 text-xs font-normal text-slate-900 outline-none disabled:bg-slate-100" style={{ borderColor: "var(--border)" }} /></label>
                <label className="text-[11px] font-medium text-slate-500">{vi ? "Quy cách / Nhãn hiệu" : "Specification / Brand"}<input disabled={isView} value={activeItem.specification_brand || ""} onChange={event => handleUpdateItem(activeItem.id, "specification_brand", event.target.value)} className="mt-1 h-9 w-full rounded-lg border bg-white px-3 text-xs font-normal text-slate-900 outline-none disabled:bg-slate-100" style={{ borderColor: "var(--border)" }} /></label>
                <label className="text-[11px] font-medium text-slate-500 md:col-span-2">{vi ? "Ghi chú riêng của dòng" : "Line note"}<textarea disabled={isView} value={activeItem.note || ""} onChange={event => handleUpdateItem(activeItem.id, "note", event.target.value)} rows={2} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-xs font-normal text-slate-900 outline-none disabled:bg-slate-100" style={{ borderColor: "var(--border)" }} /></label>
              </div>
              <p className="mt-2 text-[10px] text-slate-400">{vi ? "Ghi chú dòng luôn để trống khi chọn danh mục mới và không sao chép từ báo giá tham chiếu." : "Line notes start blank for a new category and are never copied from a reference quotation."}</p>
            </section>}

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

            <details className="mt-5 rounded-xl border bg-white p-4" style={{ borderColor: "var(--border)" }}>
              <summary className="cursor-pointer text-xs font-semibold text-slate-700">{vi ? "Tiêu đề & điều khoản xuất báo giá" : "Export title & terms"}</summary>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="text-[11px] font-medium text-slate-500 md:col-span-2">{vi ? "Tiêu đề" : "Title"}<input disabled={isView} value={title} onChange={event => setTitle(event.target.value)} className="mt-1 h-9 w-full rounded-lg border px-3 text-xs font-normal text-slate-900 disabled:bg-slate-50" style={{ borderColor: "var(--border)" }} /></label>
                <label className="text-[11px] font-medium text-slate-500">{vi ? "Điều khoản thanh toán" : "Payment terms"}<textarea disabled={isView} value={paymentTerms} onChange={event => setPaymentTerms(event.target.value)} rows={4} className="mt-1 w-full rounded-lg border px-3 py-2 text-xs font-normal text-slate-900 disabled:bg-slate-50" style={{ borderColor: "var(--border)" }} /></label>
                <label className="text-[11px] font-medium text-slate-500">{vi ? "Điều khoản giao hàng" : "Delivery terms"}<textarea disabled={isView} value={deliveryTerms} onChange={event => setDeliveryTerms(event.target.value)} rows={4} className="mt-1 w-full rounded-lg border px-3 py-2 text-xs font-normal text-slate-900 disabled:bg-slate-50" style={{ borderColor: "var(--border)" }} /></label>
                <label className="text-[11px] font-medium text-slate-500 md:col-span-2">{vi ? "Ghi chú cuối báo giá" : "Footer notes"}<textarea disabled={isView} value={footerNotes} onChange={event => setFooterNotes(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border px-3 py-2 text-xs font-normal text-slate-900 disabled:bg-slate-50" style={{ borderColor: "var(--border)" }} /></label>
                <label className="flex items-center gap-2 text-xs text-slate-600 md:col-span-2"><input disabled={isView} type="checkbox" checked={includeShipping} onChange={event => setIncludeShipping(event.target.checked)} />{vi ? "Đơn giá đã bao gồm chi phí vận chuyển" : "Prices include shipping"}</label>
              </div>
            </details>
          </div>
          
          <div className="p-4 border-t flex justify-end gap-2 bg-slate-50" style={{ borderColor: "var(--border)" }}>
            <button onClick={onClose} className="h-8 px-4 rounded-lg border text-xs text-slate-600 hover:bg-white" style={{ borderColor: "var(--border)" }}>
              {isView ? (vi ? "Đóng" : "Close") : (vi ? "Hủy" : "Cancel")}
            </button>
            <button onClick={() => void openPreview()} className="flex h-8 items-center gap-1.5 rounded-lg border bg-white px-4 text-xs font-medium text-slate-700 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}><Eye size={13} />{vi ? "Xem trước" : "Preview"}</button>
            {!isView && (
              <button onClick={validateAndSave} className="h-8 px-4 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 flex items-center gap-1.5">
                <Save size={13} /> {vi ? "Lưu báo giá" : "Save"}
              </button>
            )}
          </div>
        </div>

        <aside className="m-4 ml-0 w-96 shrink-0 space-y-4 overflow-auto">
          <QuotationReferencePanel
            vi={vi}
            item={activeItem}
            context={referenceContext}
            loading={referenceLoading}
            error={referenceError}
            isView={isView}
            loadingMore={referencePageLoading}
            onRetry={() => void loadActiveReference()}
            onLoadMore={section => void loadMoreReferences(section)}
            onUseReference={useReference}
            onApplyPrice={applyReferencePrice}
          />
        <div className="min-h-[360px] rounded-xl border bg-white shadow-sm flex flex-col" style={{ borderColor: "var(--border)" }}>
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
                {vi ? "Chọn danh mục để xem các SKU có thể phân bổ khi xác nhận báo giá." : "Select a category to preview SKUs available at conversion."}
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
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${allocation.source_type === "NEW_STOCK" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>{allocationSourceLabel(allocation.source_type, vi)}</span>
                    </div>
                    <div className="mt-2 flex justify-between border-t pt-2"><span className="text-slate-500">{vi ? "Số lượng" : "Quantity"}</span><b>{fmt(Number(allocation.qty))}</b></div>
                    {reservation && <div className="mt-1 flex justify-between"><span className="text-slate-500">{vi ? "Trạng thái giữ chỗ" : "Reservation"}</span><b className={reservation === "ACTIVE" ? "text-amber-700" : reservation === "CONSUMED" ? "text-emerald-700" : "text-slate-500"}>{reservationStatusLabel(reservation, vi)}</b></div>}
                  </div>
                })}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border bg-blue-50 p-3 text-xs text-blue-800">
                  {vi ? "Báo giá chỉ cam kết theo danh mục. Tồn kho và giá vốn tại đây là số liệu tham khảo tổng hợp; khi xác nhận phân bổ, hệ thống sẽ tính lại lượng khả dụng theo kho. Giá vốn thực tế được chốt khi giao hàng." : "The quote commits to a category. Stock and cost here are pooled references; conversion rechecks warehouse availability and actual COGS is finalized at delivery."}
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
                {categoryProducts.length === 0 && <div className="rounded-lg border border-dashed p-4 text-center text-xs text-slate-400">{vi ? "Chưa có SKU trong danh mục; bạn có thể tạo SKU mới khi xác nhận phân bổ." : "No SKU yet; a new one can be created during conversion."}</div>}
              </div>
            )}
          </div>
        </div>
        </aside>
      </div>
      {previewModel && <QuotationPreviewModal model={previewModel} logo={logoUrl} vi={vi} canExport={canExport} onClose={() => setPreviewModel(null)} onExport={exportPreview} />}
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
                      <div className="flex items-start justify-between"><div><span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${row.source_type === "STOCK" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>{allocationSourceLabel(row.source_type, vi)}</span><span className="ml-2 text-xs font-semibold">{row.new_product ? (vi ? "SKU mới" : "New SKU") : product?.name}</span></div><button onClick={() => setRows(previous => previous.filter(candidate => candidate.key !== row.key))} className="text-slate-400 hover:text-red-600"><Trash2 size={13} /></button></div>
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
                              retryText={vi ? "Thử lại" : "Retry"}
                              clearLabel={vi ? "Bỏ chọn nhà cung cấp" : "Clear supplier"}
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
      <div className="flex items-center justify-between border-t bg-white px-5 py-4"><div className={`text-xs ${allExact ? "text-emerald-700" : "text-amber-700"}`}>{allExact ? (vi ? "Tất cả danh mục đã được phân bổ đủ." : "Every category is fully allocated.") : (vi ? "Cần phân bổ đúng đủ số lượng cho mọi danh mục." : "Every category must be allocated exactly.")}</div><div className="flex gap-2"><button disabled={submitting} onClick={onClose} className="h-9 rounded-lg border px-4 text-xs">{vi ? "Đóng" : "Close"}</button><button disabled={!allExact || submitting} onClick={() => void submit()} className="h-9 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white disabled:opacity-40">{submitting ? (vi ? "Đang xác nhận..." : "Submitting...") : (vi ? "Xác nhận phân bổ" : "Confirm conversion")}</button></div></div>
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
        hasMore: result.hasMore,
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

  const loadQuotationReference = useCallback<QuotationReferenceLoader>(async (categoryId, customerId, excludeQuotationId) => {
    const result = await fetchQuotationReference(
      { categoryId, customerId: customerId || undefined, limit: 5, excludeQuotationId },
      { isDemo, orgId: profile?.org_id },
    )
    if (result.error) throw result.error
    return result.data ?? {
      primary: null,
      matchType: "NONE" as const,
      sameCustomer: [],
      recentSales: [],
      recentImports: [],
      sameCustomerTotal: 0,
      recentSalesTotal: 0,
      recentImportsTotal: 0,
      categoryDefault: null,
    }
  }, [isDemo, profile?.org_id])

  const loadQuotationReferencePage = useCallback<QuotationReferencePageLoader>(async (
    categoryId,
    customerId,
    section,
    offset,
    excludeQuotationId,
  ) => {
    const result = await fetchQuotationReferencePage({
      categoryId,
      customerId: customerId || undefined,
      section,
      limit: 5,
      offset,
      excludeQuotationId,
    }, { isDemo, orgId: profile?.org_id })
    if (result.error) throw result.error
    return result.data ?? { items: [], total: 0, limit: 5, offset, hasMore: false }
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

  const normalizedSearch = search.trim().toLocaleLowerCase("vi")
  const filteredData = useMemo(() => data.filter(quotation => [
    quotation.quotation_number,
    quotation.customer_name,
    quotation.project,
  ].some(value => String(value ?? "").toLocaleLowerCase("vi").includes(normalizedSearch))), [data, normalizedSearch])

  const heads = vi
    ? ["Số báo giá", "Khách hàng", "Ngày lập", "Hiệu lực đến", "Tổng tiền", "Trạng thái"]
    : ["Quotation number", "Customer", "Date", "Valid Until", "Total", "Status"]

  const exportData = () => {
    const rows = filteredData.map(q => [q.quotation_number, q.customer_name, q.date, q.valid_until, q.total, q.status])
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
            {filteredData.map(q => (
              <tr key={q.id} className="group hover:bg-slate-50 transition-colors border-b" style={{ borderColor: "var(--border)" }}>
                <td className="py-3 text-sm font-medium text-blue-600 cursor-pointer" onClick={() => setViewingItem(q)}><span className="hover:underline">{q.quotation_number || (vi ? "Chưa cấp số" : "Number pending")}</span>{q.source === "dataDemo" && <span className="ml-2 rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold text-violet-700">DEMO</span>}</td>
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
            {filteredData.length === 0 && (
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
        <span>{vi ? "Đang hiển thị" : "Showing"} {filteredData.length}/{data.length} {vi ? "báo giá" : "quotations"}</span>
        <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px]">1 / 1</span>
      </div>

      {showCreate && <QuotationForm canExport={can("Sales", "export")} onClose={() => setShowCreate(false)} vi={vi} mode="create" onSave={handleSave} onLoadLookup={loadLookupPage} onLookupProducts={lookupProductsForCategory} onLoadReference={loadQuotationReference} onLoadReferencePage={loadQuotationReferencePage} />}
      {editingItem && <QuotationForm canExport={can("Sales", "export")} onClose={() => setEditingItem(null)} vi={vi} mode="edit" initialData={editingItem} onSave={handleSave} onLoadLookup={loadLookupPage} onLookupProducts={lookupProductsForCategory} onLoadReference={loadQuotationReference} onLoadReferencePage={loadQuotationReferencePage} />}
      {viewingItem && <QuotationForm canExport={can("Sales", "export")} onClose={() => setViewingItem(null)} vi={vi} mode="view" initialData={viewingItem} onLoadLookup={loadLookupPage} onLookupProducts={lookupProductsForCategory} onLoadReference={loadQuotationReference} onLoadReferencePage={loadQuotationReferencePage} />}
      {allocationQuotationId && <QuotationAllocationModal quotationId={allocationQuotationId} onLoadLookup={loadLookupPage} vi={vi} isDemo={isDemo} orgId={profile?.org_id} onClose={() => setAllocationQuotationId(null)} onComplete={() => { setAllocationQuotationId(null); void refreshQuotations() }} />}
    </div>
  )
}
