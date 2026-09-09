import { Edit, Plus, Search, Download, RefreshCw, MoreHorizontal, X, Check, Printer, ArrowRight, AlertTriangle, TrendingUp, TrendingDown, BarChart2, Package, Truck, CreditCard, DollarSign, BookOpen, ArrowLeftRight, Upload, FileDown, FileSpreadsheet, ShoppingCart, Layers } from "lucide-react"
import { useState, useRef, useEffect } from "react"
import StatusBadge from "../components/StatusBadge"
import { customers, suppliers, warehouses, salesOrders, inventoryBalance, auditLogs, stockLedger } from "../data/mockData"
import { useDemo } from "../contexts/DemoContext"
import { useAuth } from "../contexts/AuthContext"
import { fetchCategories, fetchBrands, fetchCustomers, fetchSuppliers, fetchUnits, fetchWarehouses, fetchGoodsReceipts, fetchInventoryBalance, fetchInventoryLedger, fetchInventoryAdjustments, fetchInventoryTransfers, fetchSalesOrders, fetchPurchaseOrders, fetchProducts, fetchDeliveryNotes, fetchSalesReturns, fetchInvoices, fetchCashBook, fetchFinanceTransactions, fetchAuditEvents, fetchRoles, fetchRolePermissions, fetchCompanySettings, fetchUsers, fetchPurchaseReturns, upsertCompanySettings, upsertCategory, deleteCategory, bulkUpsertCategories, upsertBrand, deleteBrand, bulkUpsertBrands, upsertUnit, deleteUnit, bulkUpsertUnits, recordFinanceTransaction, upsertCustomer, deleteCustomer, upsertSupplier, deleteSupplier, upsertWarehouse, deleteWarehouse, bulkUpsertCustomers, bulkUpsertSuppliers, bulkUpsertWarehouses, upsertRole, deleteRole, upsertRolePermission, updateUserRole, createOrganizationInvitation, createPurchaseReturn, reversePurchaseReturn, upsertInventoryAdjustment, upsertInventoryTransfer, reverseInventoryAdjustment, reverseInventoryTransfer, upsertSalesOrder, deliverSalesOrder, reverseDeliveryNote, createSalesReturn, reverseSalesReturn } from "../lib/dataService"
import { useLang } from "../i18n/LangContext"
import { exportRowsToExcel, importFromExcel, sanitizeSpreadsheetCell, saveExcelWorkbook } from "../lib/excelUtils"
import { loadCompanySettings, saveCompanySettings, type CompanySettings } from "../lib/companySettings"
import { formatDateKeyUtc7, formatDateTimeUtc7 } from "../lib/dateUtils"
import { buildAgingBuckets, calculateCashBalance, deriveLedgerBalance, filterReportRows } from "../lib/reportService"
import { getReportCatalog } from "../lib/reportCatalog"
import { confirmAppAction, showAppToast } from "../lib/appEvents"
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts"

function fmt(n: number) { return new Intl.NumberFormat("vi-VN").format(n) }

type ImportPreviewRow = {
  rowIndex: number
  row: Record<string, any>
  keyValue: string
  issues: string[]
  isDuplicate: boolean
}

function getImportKeyField(cols: string[]) {
  return cols.includes("code") ? "code" : (cols.includes("id") ? "id" : cols[0])
}

function mapRowToColumns(raw: Record<string, any>, cols: string[]) {
  const lowerKeys = Object.keys(raw).reduce<Record<string, string>>((acc, k) => ({
    ...acc,
    [k.toString().trim().toLowerCase()]: k.toString(),
  }), {})
  return cols.reduce<Record<string, any>>((obj, col) => {
    const lookup = lowerKeys[col.toLowerCase()]
    obj[col] = raw[lookup] ?? raw[col] ?? ""
    return obj
  }, {})
}

function fieldPlaceholder(lang: string, label: string) {
  return lang === "vi" ? `Nhập ${label}` : `Enter ${label}`
}

function getStatusOptions(lang: string) {
  return ["Active", "Inactive", "Draft", "Pending Approval", "Approved", "Cancelled"]
}

// --- Download CSV template utility ---
function downloadTemplate(filename: string, cols: string[]) {
  const csv = cols.join(",") + "\n" + cols.map(() => "").join(",")
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url; a.download = filename + "_template.csv"; a.click()
  URL.revokeObjectURL(url)
}

async function downloadTemplateXlsx(filename: string, cols: string[]) {
  await exportRowsToExcel([cols, cols.map(() => "")], `${filename}_template`, "Template")
}

function formatCsvCell(value: string | number) {
  const text = String(sanitizeSpreadsheetCell(value) ?? "")
  return `"${text.replace(/"/g, '""')}"`
}

function getReportTitle(filename: string) {
  return filename
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, s => s.toUpperCase())
}

function getExportDate() {
  return formatDateTimeUtc7(new Date())
}

function escapeHtml(value: string | number) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

// --- Import Modal ---
export function ImportModal({ onClose, filename, cols, lang, existingKeys, onImportRows }: { onClose: () => void; filename: string; cols: string[]; lang: string; existingKeys?: string[]; onImportRows?: (rows: any[]) => Promise<void> }) {
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([])
  const [processing, setProcessing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const parseFile = async (file: File) => {
    setParseError(null)
    try {
      setProcessing(true)
      const parsed = await importFromExcel(file)
      const keyField = getImportKeyField(cols)
      const existingSet = new Set((existingKeys ?? []).map(k => String(k).trim().toLowerCase()))
      const seen = new Set<string>()
      const rows = parsed.map((rawRow: any, index: number) => {
        const row = mapRowToColumns(rawRow, cols)
        const keyValue = String(row[keyField] ?? "").trim()
        const issues = [] as string[]
        if (!keyValue) {
          issues.push(lang === "vi" ? `Thiếu ${keyField}` : `${keyField} missing`)
        }
        const keyValueLower = keyValue.toLowerCase()
        const isDuplicate = keyValue ? existingSet.has(keyValueLower) || seen.has(keyValueLower) : false
        if (isDuplicate) {
          issues.push(lang === "vi" ? `Trùng ${keyField}` : `${keyField} duplicate`)
        }
        if (keyValue) seen.add(keyValueLower)
        return {
          rowIndex: index + 1,
          row,
          keyValue,
          issues,
          isDuplicate,
        }
      })
      setPreviewRows(rows)
    } catch (err) {
      if (import.meta.env.DEV) console.error(err)
      setPreviewRows([])
      setParseError(lang === "vi" ? "Lỗi khi đọc file" : "Failed to read file")
    } finally {
      setProcessing(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f && (f.name.endsWith(".csv") || f.name.endsWith(".xlsx") || f.name.endsWith(".xls"))) {
      setFile(f)
      parseFile(f)
    }
  }

  const handleFileChange = (file: File | null) => {
    setFile(file)
    if (file) parseFile(file)
    else setPreviewRows([])
  }

  const runImport = async () => {
    if (!file || !onImportRows) return showAppToast(lang === "vi" ? "Chưa có chức năng import" : "Import handler not provided")
    if (previewRows.length === 0) return showAppToast(lang === "vi" ? "Chưa có dữ liệu để nhập" : "No data to import")
    if (previewRows.some(r => r.issues.length > 0 || r.isDuplicate)) return showAppToast(lang === "vi" ? "Vui lòng sửa các lỗi trước khi import" : "Please fix the errors before importing")
    try {
      setProcessing(true)
      await onImportRows(previewRows.map(r => r.row))
      onClose()
    } catch (err) {
      if (import.meta.env.DEV) console.error(err)
      showAppToast(lang === "vi" ? "Lỗi khi import dữ liệu" : "Failed to import data")
    } finally { setProcessing(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-sm font-semibold text-slate-900">
            {lang === "vi" ? "Nhập dữ liệu từ file" : "Import from File"}
          </h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"><X size={14} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Step 1: Download template */}
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <FileDown size={15} className="text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-slate-800 mb-0.5">
                  {lang === "vi" ? "Bước 1: Tải file mẫu" : "Step 1: Download Template"}
                </div>
                <div className="text-[11px] text-slate-500 leading-relaxed mb-2.5">
                  {lang === "vi"
                    ? "Tải file mẫu, điền dữ liệu theo đúng định dạng rồi upload lên."
                    : "Download a template, fill in your data in the correct format, then upload."}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => downloadTemplate(filename, cols)}
                    className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-blue-600 text-white text-[11px] font-medium hover:bg-blue-700"
                  >
                    <FileDown size={12} />
                    {lang === "vi" ? "Mẫu CSV" : "CSV Template"}
                  </button>
                  <button
                    onClick={() => void downloadTemplateXlsx(filename, cols)}
                    className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-emerald-600 text-white text-[11px] font-medium hover:bg-emerald-700"
                  >
                    <FileSpreadsheet size={12} />
                    {lang === "vi" ? "Mẫu Excel" : "Excel Template"}
                  </button>
                </div>
                <div className="mt-2 text-[10px] text-slate-400 font-mono bg-slate-50 rounded-lg px-2 py-1.5 truncate">
                  {cols.slice(0, 5).join(", ")}{cols.length > 5 ? ` +${cols.length - 5} more` : ""}
                </div>
              </div>
            </div>
          </div>

          {/* Step 2: Upload file */}
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                <Upload size={15} className="text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-slate-800 mb-0.5">
                  {lang === "vi" ? "Bước 2: Upload file dữ liệu" : "Step 2: Upload Data File"}
                </div>
                <div
                  onDragOver={e => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileRef.current?.click()}
                  className={`mt-2 border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${dragging ? "border-blue-400 bg-blue-50" : file ? "border-emerald-400 bg-emerald-50" : "border-slate-200 hover:border-blue-300 hover:bg-slate-50"}`}
                >
                  <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
                    onChange={e => e.target.files?.[0] && handleFileChange(e.target.files[0])} />
                  {file ? (
                    <>
                      <FileSpreadsheet size={20} className="text-emerald-500 mx-auto mb-1" />
                      <div className="text-xs font-semibold text-emerald-700">{file.name}</div>
                      <div className="text-[10px] text-emerald-500 mt-0.5">{(file.size / 1024).toFixed(1)} KB</div>
                    </>
                  ) : (
                    <>
                      <Upload size={20} className="text-slate-300 mx-auto mb-1" />
                      <div className="text-xs text-slate-500">
                        {lang === "vi" ? "Kéo thả file vào đây hoặc" : "Drag & drop or"}{" "}
                        <span className="text-blue-600 font-medium">{lang === "vi" ? "chọn file" : "browse"}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">CSV, XLSX — {lang === "vi" ? "tối đa" : "max"} 10MB</div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {(file || parseError || previewRows.length > 0) && (
          <div className="p-5 border-t space-y-3" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>{lang === "vi" ? "Xem trước dữ liệu" : "Preview data"}</span>
              <span>{lang === "vi" ? "Hàng" : "Rows"}: {previewRows.length}</span>
            </div>
            {parseError ? (
              <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">{parseError}</div>
            ) : previewRows.length === 0 ? (
              <div className="text-[11px] text-slate-500">{lang === "vi" ? "Tải file để xem trước dữ liệu" : "Upload a file to preview rows"}</div>
            ) : (
              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                <div className="grid grid-cols-[40px_1fr_120px_140px] gap-2 bg-slate-50 px-3 py-2 text-[11px] uppercase text-slate-500 font-semibold">
                  <div>#</div>
                  <div>{lang === "vi" ? "Giá trị" : "Key"}</div>
                  <div>{lang === "vi" ? "Trạng thái" : "Status"}</div>
                  <div>{lang === "vi" ? "Lỗi" : "Issues"}</div>
                </div>
                <div className="max-h-48 overflow-y-auto bg-white">
                  {previewRows.slice(0, 8).map(row => (
                    <div key={row.rowIndex} className="grid grid-cols-[40px_1fr_120px_140px] gap-2 px-3 py-2 text-[12px] border-t border-slate-200">
                      <div className="text-slate-500">{row.rowIndex}</div>
                      <div className="truncate">{row.keyValue || "—"}</div>
                      <div className="text-[11px] font-medium">
                        {row.isDuplicate ? (
                          <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">{lang === "vi" ? "Trùng" : "Duplicate"}</span>
                        ) : row.issues.length > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-red-100 text-red-800 px-2 py-0.5">{lang === "vi" ? "Lỗi" : "Error"}</span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5">{lang === "vi" ? "Sẵn sàng" : "Ready"}</span>
                        )}
                      </div>
                      <div className="text-slate-600 truncate">{row.issues.join(", ") || "—"}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {previewRows.length > 8 && (
              <div className="text-[11px] text-slate-500">{lang === "vi" ? `Chỉ hiển thị 8 dòng đầu tiên. Tổng ${previewRows.length} dòng.` : `Showing first 8 rows. ${previewRows.length} total.`}</div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t bg-slate-50" style={{ borderColor: "var(--border)" }}>
          <button onClick={onClose} className="h-8 px-4 rounded-lg border text-xs text-slate-600 hover:bg-white" style={{ borderColor: "var(--border)" }}>
            {lang === "vi" ? "Hủy" : "Cancel"}
          </button>
          <button
            disabled={!file || processing}
            onClick={() => runImport()}
            className="h-8 px-4 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {processing ? (lang === "vi" ? "Đang xử lý..." : "Processing...") : (lang === "vi" ? "Nhập dữ liệu" : "Import")}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Toolbar shared ---
export function Toolbar({ onSearch, search, onCreate, createLabel, onImport, onImportRows, templateFile, templateCols, existingKeys, extra, onExportCsv, onExportXlsx, onPrint, onRefresh }: {
  onSearch?: (v: string) => void; search?: string; onCreate?: () => void; createLabel?: string
  onImport?: () => void; onImportRows?: (rows: any[]) => Promise<void>; templateFile?: string; templateCols?: string[]; existingKeys?: string[]; extra?: React.ReactNode;
  onExportCsv?: () => void; onExportXlsx?: () => void; onPrint?: () => void; onRefresh?: () => void
}) {
  const { t, lang } = useLang()
  const [showImport, setShowImport] = useState(false)
  return (
    <>
      <div className="flex items-center gap-2 px-5 py-2.5 bg-white border-b flex-shrink-0 flex-wrap gap-y-2" style={{ borderColor: "var(--border)" }}>
        {onCreate && (
          <button onClick={onCreate} className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors">
            <Plus size={13} /> {createLabel ?? t("create")}
          </button>
        )}
        {(onExportCsv || onExportXlsx) && (
          <div className="relative group">
            <button className="flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs text-slate-600 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
              <Download size={13} /> {t("export")}
            </button>
            <div className="absolute top-full left-0 mt-0 hidden group-hover:flex flex-col bg-white border rounded-lg shadow-lg w-32 z-50 overflow-hidden" style={{ borderColor: "var(--border)" }}>
              {onExportCsv && <button onClick={onExportCsv} className="px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50">CSV</button>}
              {onExportXlsx && <button onClick={onExportXlsx} className="px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50">Excel</button>}
            </div>
          </div>
        )}
        {(onImport || templateCols) && (
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs text-slate-600 hover:bg-slate-50"
            style={{ borderColor: "var(--border)" }}
          >
            <Upload size={13} /> {lang === "vi" ? "Nhập file" : "Import"}
          </button>
        )}
        {onPrint && (
          <button
            onClick={onPrint}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs text-slate-600 hover:bg-slate-50"
            style={{ borderColor: "var(--border)" }}
          >
            <Printer size={13} /> {t("print")}
          </button>
        )}
        {extra}
        <div className="flex-1" />
        {onSearch && (
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search ?? ""} onChange={e => onSearch(e.target.value)} placeholder={t("searchPlaceholder")} className="h-8 pl-8 pr-3 rounded-lg border text-xs outline-none focus:ring-2 focus:ring-blue-500/20 w-52" style={{ borderColor: "var(--border)" }} />
          </div>
        )}
        {onRefresh && <button onClick={onRefresh} className="w-8 h-8 flex items-center justify-center rounded-lg border text-slate-500 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
          <RefreshCw size={13} />
        </button>}
      </div>
      {showImport && templateCols && (
        <ImportModal
          onClose={() => setShowImport(false)}
          filename={templateFile ?? "template"}
          cols={templateCols}
          lang={lang}
          existingKeys={existingKeys}
          onImportRows={async (rows) => { if (typeof onImportRows === 'function') await onImportRows(rows) }}
        />
      )}
    </>
  )
}

function Pager({ count, total, label }: { count: number; total: number; label: string }) {
  const { t } = useLang()
  return (
    <div className="flex items-center justify-between px-5 py-2.5 bg-white border-t flex-shrink-0 text-xs text-slate-500" style={{ borderColor: "var(--border)" }}>
      <span>{t("showing")} {count} {t("of")} {total} {label}</span>
      <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px]">1 / 1</span>
    </div>
  )
}

// --- Customers ---


export function GenericCrudList({ title, data, setData, columns, templateCols, templateFile, readOnly = false, moduleName = "Master Data", onRefresh }: any) {
  const { t, lang } = useLang();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [relatedOptions, setRelatedOptions] = useState<Record<string, string[]>>({
    customer: [], supplier: [], warehouse: [], category: [], brand: [], unit: [], status: getStatusOptions(lang)
  });
  const { isDemo } = useDemo();
  const { profile, can } = useAuth();
  const importKeyField = getImportKeyField(templateCols);
  const existingKeys = data.map((item: any) => item[importKeyField]).filter(Boolean).map(String);

  useEffect(() => {
    const extractList = (key: string): string[] => Array.from(new Set<string>(
      data
        .map((item: any) => item[key])
        .filter((value: any) => value != null && value !== "")
        .map((value: any) => String(value))
    )).sort()

    const nextOptions: Record<string, string[]> = {
      customer: extractList("customer"),
      supplier: extractList("supplier"),
      warehouse: extractList("warehouse"),
      category: extractList("category"),
      brand: extractList("brand"),
      unit: extractList("unit"),
      status: Array.from(new Set<string>([...getStatusOptions(lang), ...extractList("status")]))
    }

    if (!isDemo) {
      Promise.all([
        fetchCustomers({ isDemo, orgId: profile?.org_id }),
        fetchSuppliers({ isDemo, orgId: profile?.org_id }),
        fetchWarehouses({ isDemo, orgId: profile?.org_id }),
        fetchCategories({ isDemo, orgId: profile?.org_id }),
        fetchBrands({ isDemo, orgId: profile?.org_id }),
        fetchUnits({ isDemo, orgId: profile?.org_id }),
      ]).then(([customersRes, suppliersRes, warehousesRes, categoriesRes, brandsRes, unitsRes]) => {
        const customerNames = [...(customersRes.data ?? []).map((x: any) => x.name).filter(Boolean)]
        const supplierNames = [...(suppliersRes.data ?? []).map((x: any) => x.name).filter(Boolean)]
        const warehouseNames = [...(warehousesRes.data ?? []).map((x: any) => x.name).filter(Boolean)]
        const categoryNames = [...(categoriesRes.data ?? []).map((x: any) => x.name ?? x.name_vi ?? x.name_en).filter(Boolean)]
        const brandNames = [...(brandsRes.data ?? []).map((x: any) => x.name).filter(Boolean)]
        const unitNames = [...(unitsRes.data ?? []).map((x: any) => x.name ?? x.name_vi ?? x.name_en).filter(Boolean)]

        setRelatedOptions({
          customer: Array.from(new Set<string>([...nextOptions.customer, ...customerNames])).sort(),
          supplier: Array.from(new Set<string>([...nextOptions.supplier, ...supplierNames])).sort(),
          warehouse: Array.from(new Set<string>([...nextOptions.warehouse, ...warehouseNames])).sort(),
          category: Array.from(new Set<string>([...nextOptions.category, ...categoryNames])).sort(),
          brand: Array.from(new Set<string>([...nextOptions.brand, ...brandNames])).sort(),
          unit: Array.from(new Set<string>([...nextOptions.unit, ...unitNames])).sort(),
          status: Array.from(new Set<string>([...getStatusOptions(lang), ...extractList("status")]))
        })
      }).catch(() => setRelatedOptions(nextOptions))
      return
    }

    setRelatedOptions(nextOptions)
  }, [data, lang, isDemo, profile])
  
  const filtered = data.filter((item: any) => search === "" || Object.values(item).some((v: any) => String(v).toLowerCase().includes(search.toLowerCase())));
  
  const heads = columns.map((c: any) => c.label);
  
  async function handleUpsert(newItem: any) {
    const res = await handleUpsertFor(templateFile, newItem, isDemo, profile)
    if (res?.error) {
      showAppToast(res.error.message ?? String(res.error))
      return false
    }
    if (!isDemo) {
      if (templateFile === "customers") { const r = await fetchCustomers({ isDemo, orgId: profile?.org_id }); if (r.data) setData(r.data); return true }
      if (templateFile === "suppliers") { const r = await fetchSuppliers({ isDemo, orgId: profile?.org_id }); if (r.data) setData(r.data); return true }
      if (templateFile === "warehouses") { const r = await fetchWarehouses({ isDemo, orgId: profile?.org_id }); if (r.data) setData(r.data); return true }
      if (templateFile === "categories") { const r = await fetchCategories({ isDemo, orgId: profile?.org_id }); if (r.data) setData(r.data); return true }
      if (templateFile === "brands") { const r = await fetchBrands({ isDemo, orgId: profile?.org_id }); if (r.data) setData(r.data); return true }
      if (templateFile === "units") { const r = await fetchUnits({ isDemo, orgId: profile?.org_id }); if (r.data) setData(r.data); return true }
      if (templateFile === "goodsreceipt") { const r = await fetchGoodsReceipts({ isDemo, orgId: profile?.org_id }); if (r.data) setData(r.data.map((item:any) => ({ ...item, doc_no: item.ref, po_no: item.po_ref, warehouse: item.warehouse_name, supplier: item.supplier_name, status: item.status }))); return true }
      if (templateFile === "cashbook") { const r = await fetchCashBook({ isDemo, orgId: profile?.org_id }); if (r.data) setData(r.data.map((item:any) => ({ ...item, doc_no: item.ref, type: item.type, amount: item.amount, balance: item.balance }))); return true }
    }
    if (editingItem) setData(data.map((x: any) => x === editingItem ? newItem : x)); else setData([...data, newItem]);
    return true
  }

  async function handleImportRows(rows: any[]) {
    if (!rows || rows.length === 0) return showAppToast(lang === 'vi' ? 'Không có dữ liệu để import' : 'No rows to import')
    const keyField = templateCols.includes('code') ? 'code' : (templateCols.includes('id') ? 'id' : templateCols[0])
    const duplicates: any[] = []
    const failed: any[] = []
    const toImport: any[] = []

    for (const r of rows) {
      const item = { ...r }
      const key = item[keyField]
      if (!key) { failed.push({ row: item, reason: 'missing_key' }); continue }
      const exists = data.some((d: any) => d[keyField] && item[keyField] && String(d[keyField]).trim() === String(item[keyField]).trim())
      if (exists) { duplicates.push(item); continue }
      toImport.push(item)
    }

    let importedCount = 0
    if (toImport.length > 0) {
      if (!isDemo) {
        const ctx = { isDemo, orgId: profile?.org_id }
        if (templateFile === 'customers') {
          const res = await bulkUpsertCustomers(toImport, ctx)
          if (res && res.error) failed.push({ reason: 'api_error' })
          else importedCount = toImport.length
        } else if (templateFile === 'suppliers') {
          const res = await bulkUpsertSuppliers(toImport, ctx)
          if (res && res.error) failed.push({ reason: 'api_error' })
          else importedCount = toImport.length
        } else if (templateFile === 'warehouses') {
          const res = await bulkUpsertWarehouses(toImport, ctx)
          if (res && res.error) failed.push({ reason: 'api_error' })
          else importedCount = toImport.length
        } else if (templateFile === 'categories') {
          const res = await bulkUpsertCategories(toImport, ctx)
          if (res && res.error) failed.push({ reason: 'api_error' })
          else importedCount = toImport.length
        } else if (templateFile === 'brands') {
          const res = await bulkUpsertBrands(toImport, ctx)
          if (res && res.error) failed.push({ reason: 'api_error' })
          else importedCount = toImport.length
        } else if (templateFile === 'units') {
          const res = await bulkUpsertUnits(toImport, ctx)
          if (res && res.error) failed.push({ reason: 'api_error' })
          else importedCount = toImport.length
        } else {
          // fallback to per-record upsert
          for (const item of toImport) {
            const res = await handleUpsertFor(templateFile, item, isDemo, profile)
            if (res && res.error) failed.push({ row: item, reason: 'api_error' })
            else importedCount++
          }
        }
      } else {
        // demo mode: just append
        setData((prev: any[]) => [...toImport, ...prev])
        importedCount = toImport.length
      }
    }

    // refresh list for live tables
    if (!isDemo) {
      if (templateFile === 'customers') { const r = await fetchCustomers({ isDemo, orgId: profile?.org_id }); if (r.data) setData(r.data) }
      else if (templateFile === 'suppliers') { const r = await fetchSuppliers({ isDemo, orgId: profile?.org_id }); if (r.data) setData(r.data) }
      else if (templateFile === 'warehouses') { const r = await fetchWarehouses({ isDemo, orgId: profile?.org_id }); if (r.data) setData(r.data) }
      else if (templateFile === 'categories') { const r = await fetchCategories({ isDemo, orgId: profile?.org_id }); if (r.data) setData(r.data) }
      else if (templateFile === 'brands') { const r = await fetchBrands({ isDemo, orgId: profile?.org_id }); if (r.data) setData(r.data) }
      else if (templateFile === 'units') { const r = await fetchUnits({ isDemo, orgId: profile?.org_id }); if (r.data) setData(r.data) }
      else if (templateFile === 'goodsreceipt') { const r = await fetchGoodsReceipts({ isDemo, orgId: profile?.org_id }); if (r.data) setData(r.data.map((item:any) => ({ ...item, doc_no: item.ref, po_no: item.po_ref, warehouse: item.warehouse_name, supplier: item.supplier_name, status: item.status }))) }
      else if (templateFile === 'cashbook') { const r = await fetchCashBook({ isDemo, orgId: profile?.org_id }); if (r.data) setData(r.data.map((item:any) => ({ ...item, doc_no: item.ref, type: item.type, amount: item.amount, balance: item.balance }))) }
    }

    showAppToast(lang === 'vi'
      ? `Import xong. Thành công: ${importedCount}, Trùng: ${duplicates.length}, Lỗi: ${failed.length}`
      : `Import complete. Success: ${importedCount}, Duplicates: ${duplicates.length}, Failed: ${failed.length}`, failed.length ? "info" : "success")
  }

  async function handleDelete(item: any) {
    if (isDemo) { setData(data.filter((x: any) => x !== item)); return }
    const id = item.id || item.code || item.ref || item.doc_no
    const result = await handleDeleteFor(templateFile, id, isDemo, profile)
    if (result?.error) {
      showAppToast(result.error.message ?? String(result.error))
      return
    }
    if (templateFile === "customers") { const r = await fetchCustomers({ isDemo, orgId: profile?.org_id }); if (r.data) setData(r.data); return }
    if (templateFile === "suppliers") { const r = await fetchSuppliers({ isDemo, orgId: profile?.org_id }); if (r.data) setData(r.data); return }
    if (templateFile === "warehouses") { const r = await fetchWarehouses({ isDemo, orgId: profile?.org_id }); if (r.data) setData(r.data); return }
    if (templateFile === "categories") { const r = await fetchCategories({ isDemo, orgId: profile?.org_id }); if (r.data) setData(r.data); return }
    if (templateFile === "brands") { const r = await fetchBrands({ isDemo, orgId: profile?.org_id }); if (r.data) setData(r.data); return }
    if (templateFile === "units") { const r = await fetchUnits({ isDemo, orgId: profile?.org_id }); if (r.data) setData(r.data); return }
    if (templateFile === "goodsreceipt") { const r = await fetchGoodsReceipts({ isDemo, orgId: profile?.org_id }); if (r.data) setData(r.data.map((item:any) => ({ ...item, doc_no: item.ref, po_no: item.po_ref, warehouse: item.warehouse_name, supplier: item.supplier_name, status: item.status }))); return }
    if (templateFile === "cashbook") { const r = await fetchCashBook({ isDemo, orgId: profile?.org_id }); if (r.data) setData(r.data.map((item:any) => ({ ...item, doc_no: item.ref, type: item.type, amount: item.amount, balance: item.balance }))); return }
    setData(data.filter((x: any) => x !== item))
  }
  
  return (
    <div className="flex flex-col h-full">
      <Toolbar search={search} onSearch={setSearch} onCreate={!readOnly && can(moduleName, "create") ? () => { setEditingItem(null); setShowForm(true); } : undefined} createLabel={lang === "vi" ? "Thêm " + title : "Add " + title}
        templateFile={templateFile} templateCols={!readOnly && can(moduleName, "create") ? templateCols : undefined} existingKeys={existingKeys} onImportRows={!readOnly && can(moduleName, "create") ? handleImportRows : undefined}
        onExportCsv={can(moduleName, "export") ? () => exportCsv(templateFile, heads, filtered.map((item: any) => columns.map((c: any) => item[c.key]))) : undefined}
        onExportXlsx={can(moduleName, "export") ? () => exportXlsx(templateFile, heads, filtered.map((item: any) => columns.map((c: any) => item[c.key]))) : undefined}
        onRefresh={onRefresh}
      />
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse min-w-[900px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
              {columns.map((c: any) => <th key={c.key} className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">{c.label}</th>)}
              {!readOnly && <th className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap"></th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((item: any, i: number) => (
              <tr key={i} className="border-b hover:bg-slate-50/60 group cursor-pointer" style={{ borderColor: "var(--border)" }}>
                {columns.map((c: any) => (
                  <td key={c.key} className={"px-4 py-2.5 " + (c.isStatus ? "" : "text-slate-800")}>
                    {c.isStatus ? <StatusBadge status={item[c.key]} /> : (c.format ? c.format(item[c.key]) : item[c.key])}
                  </td>
                ))}
                {!readOnly && <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                        {can(moduleName, "update") && <button onClick={(e) => { e.stopPropagation(); setEditingItem(item); setShowForm(true); }} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"><Edit size={14} /></button>}
                        {can(moduleName, "delete") && <button onClick={async (e) => { e.stopPropagation(); if (await confirmAppAction(lang === "vi" ? "Xóa bản ghi này?" : "Delete this record?", { destructive: true })) void handleDelete(item) }} className="w-7 h-7 flex items-center justify-center rounded-md text-red-400 hover:bg-red-50 hover:text-red-500"><X size={14} /></button>}
                  </div>
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="text-sm font-semibold">{editingItem ? (lang === "vi" ? "Sửa " + title : "Edit " + title) : (lang === "vi" ? "Thêm " + title : "Add " + title)}</h2>
              <button onClick={() => setShowForm(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"><X size={14} /></button>
            </div>
            <form onSubmit={async e => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const newItem: any = { ...editingItem };
              columns.filter((c: any) => !c.readOnly).forEach((c: any) => {
                newItem[c.key] = fd.get(c.key) || "";
              });
              if (await handleUpsert(newItem)) setShowForm(false)
            }}>
              <div className="p-5 grid grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto">
                {columns.filter((c: any) => !c.readOnly).map((c: any) => {
                  const fkKeyNames = ["customer", "supplier", "warehouse", "category", "brand", "unit"]
                  const options = relatedOptions[c.key] || []
                  const isFkSelector = fkKeyNames.includes(c.key)
                  const inputType = c.type || (/(amount|price|cost|total|debt|credit|capacity|qty|quantity)/i.test(c.key) ? "number" : (/(email)/i.test(c.key) ? "email" : "text"))
                  const defaultValue = editingItem ? editingItem[c.key] ?? "" : ""
                  return (
                    <div key={c.key}>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">{c.label}</label>
                      {isFkSelector || options.length > 0 ? (
                        <select
                          name={c.key}
                          defaultValue={defaultValue}
                          className="w-full h-8 px-3 rounded-lg border text-xs outline-none bg-white"
                          style={{ borderColor: "var(--border)" }}
                        >
                          <option value="">{lang === "vi" ? "Chọn " + c.label.toLowerCase() : "Select " + c.label.toLowerCase()}</option>
                          {options.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          name={c.key}
                          type={inputType}
                          defaultValue={defaultValue}
                          placeholder={fieldPlaceholder(lang, c.label)}
                          className="w-full h-8 px-3 rounded-lg border text-xs outline-none"
                          style={{ borderColor: "var(--border)" }}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="flex justify-end gap-2 px-5 py-3.5 border-t bg-slate-50" style={{ borderColor: "var(--border)" }}>
                <button type="button" onClick={() => setShowForm(false)} className="h-8 px-4 rounded-lg border text-xs text-slate-600" style={{ borderColor: "var(--border)" }}>{t("cancel")}</button>
                <button type="submit" className="h-8 px-4 rounded-lg bg-blue-600 text-white text-xs font-medium">{t("save")}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

async function handleUpsertFor(templateFile: string, item: any, isDemo: boolean, profile: any) {
  if (isDemo) return { error: null }
  const ctx = { isDemo, orgId: profile?.org_id }
  switch (templateFile) {
    case "customers":
      return await upsertCustomer(item, ctx)
    case "suppliers":
      return await upsertSupplier(item, ctx)
    case "warehouses":
      return await upsertWarehouse(item, ctx)
    case "categories":
      return await upsertCategory(item, ctx)
    case "brands":
      return await upsertBrand(item, ctx)
    case "units":
      return await upsertUnit(item, ctx)
    default:
      return { error: null }
  }
}

async function handleDeleteFor(templateFile: string, id: string, isDemo: boolean, profile: any) {
  if (isDemo) return { error: null }
  const ctx = { isDemo, orgId: profile?.org_id }
  switch (templateFile) {
    case "customers":
      return await deleteCustomer(id, ctx)
    case "suppliers":
      return await deleteSupplier(id, ctx)
    case "warehouses":
      return await deleteWarehouse(id, ctx)
    case "categories":
      return await deleteCategory(id, ctx)
    case "brands":
      return await deleteBrand(id, ctx)
    case "units":
      return await deleteUnit(id, ctx)
    default:
      return { error: null }
  }
}


export function Customers() {
  const { lang } = useLang();
  const [data, setData] = useState<any[]>([]);
  const { isDemo } = useDemo();
  const { profile } = useAuth();
  useEffect(() => {
    fetchCustomers({ isDemo, orgId: profile?.org_id }).then(res => { if (res.data) setData(res.data) });
  }, [isDemo, profile]);

  const columns = lang === "vi" ? [
    { key: "code", label: "Mã KH" }, { key: "name", label: "Tên khách hàng" }, { key: "phone", label: "Điện thoại" },
    { key: "email", label: "Email" }, { key: "tax_code", label: "MST" }, { key: "credit_limit", label: "Hạn mức TD", format: fmt },
    { key: "debt", label: "Công nợ", format: fmt, readOnly: true }, { key: "status", label: "Trạng thái", isStatus: true }
  ] : [
    { key: "code", label: "Code" }, { key: "name", label: "Customer Name" }, { key: "phone", label: "Phone" },
    { key: "email", label: "Email" }, { key: "tax_code", label: "Tax Code" }, { key: "credit_limit", label: "Credit Limit", format: fmt },
    { key: "debt", label: "Debt", format: fmt, readOnly: true }, { key: "status", label: "Status", isStatus: true }
  ];

  return <GenericCrudList title={lang === "vi" ? "khách hàng" : "customer"} data={data} setData={setData} columns={columns} templateCols={["code", "name", "phone", "email", "tax_code", "credit_limit", "status"]} templateFile="customers" />;
}

// --- Suppliers ---

export function Suppliers() {
  const { lang } = useLang();
  const [data, setData] = useState<any[]>([]);
  const { isDemo } = useDemo();
  const { profile } = useAuth();
  useEffect(() => {
    fetchSuppliers({ isDemo, orgId: profile?.org_id }).then(res => { if (res.data) setData(res.data) });
  }, [isDemo, profile]);

  const columns = lang === "vi" ? [
    { key: "code", label: "Mã NCC" }, { key: "name", label: "Tên nhà cung cấp" }, { key: "phone", label: "Điện thoại" },
    { key: "email", label: "Email" }, { key: "tax_code", label: "MST" }, { key: "debt", label: "Công nợ", format: fmt, readOnly: true },
    { key: "status", label: "Trạng thái", isStatus: true }
  ] : [
    { key: "code", label: "Code" }, { key: "name", label: "Supplier Name" }, { key: "phone", label: "Phone" },
    { key: "email", label: "Email" }, { key: "tax_code", label: "Tax Code" }, { key: "debt", label: "Debt", format: fmt, readOnly: true },
    { key: "status", label: "Status", isStatus: true }
  ];

  return <GenericCrudList title={lang === "vi" ? "nhà cung cấp" : "supplier"} data={data} setData={setData} columns={columns} templateCols={["code", "name", "phone", "email", "tax_code", "status"]} templateFile="suppliers" />;
}

// --- Warehouses ---

export function Warehouses() {
  const { lang } = useLang();
  const [data, setData] = useState<any[]>([]);
  const { isDemo } = useDemo();
  const { profile } = useAuth();
  useEffect(() => {
    fetchWarehouses({ isDemo, orgId: profile?.org_id }).then(res => { if (res.data) setData(res.data) });
  }, [isDemo, profile]);

  const columns = lang === "vi" ? [
    { key: "code", label: "Mã kho" }, { key: "name", label: "Tên kho" }, { key: "address", label: "Địa điểm" },
    { key: "manager", label: "Thủ kho" }, { key: "stock_value", label: "Giá trị tồn kho", format: fmt, readOnly: true }, { key: "status", label: "Trạng thái", isStatus: true }
  ] : [
    { key: "code", label: "Code" }, { key: "name", label: "Warehouse Name" }, { key: "address", label: "Address" },
    { key: "manager", label: "Manager" }, { key: "stock_value", label: "Stock Value", format: fmt, readOnly: true }, { key: "status", label: "Status", isStatus: true }
  ];

  return <GenericCrudList title={lang === "vi" ? "kho" : "warehouse"} data={data} setData={setData} columns={columns} templateCols={["code", "name", "address", "manager", "status"]} templateFile="warehouses" />;
}

// --- Sales Orders ---
export function SalesOrders() {
  const { lang } = useLang();
  const [data, setData] = useState<any[]>([]);
  const { isDemo } = useDemo();
  const { profile, can } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const reload = async () => { const res = await fetchSalesOrders({ isDemo, orgId: profile?.org_id }); if (res.error) showAppToast(res.error.message ?? String(res.error)); setData((res.data ?? []).map((row: any) => ({ ...row, date: row.created_at ? formatDateTimeUtc7(row.created_at) : row.date ?? "", doc_no: row.ref ?? row.doc_no ?? "", customer: row.customer_name ?? row.customer ?? "" }))) }
  useEffect(() => {
    reload()
  }, [isDemo, profile]);
  const approve = async (row: any) => { const result = await upsertSalesOrder({ id: row.id, status: "Approved" }, { isDemo, orgId: profile?.org_id }); if (result.error) showAppToast(result.error.message ?? String(result.error)); else await reload() }
  const heads = ["DATE", "DOC_NO", "CUSTOMER", "WAREHOUSE", "TOTAL", "STATUS"]
  return <><div className="flex h-full flex-col"><Toolbar onCreate={can("Sales", "create") ? () => setShowCreate(true) : undefined} createLabel={lang === "vi" ? "Tạo đơn bán" : "Create sales order"} onRefresh={() => void reload()} onExportCsv={can("Sales", "export") ? () => exportCsv("sales-orders", heads, data.map(row => [row.date, row.doc_no, row.customer, row.warehouse_name, row.total, row.status])) : undefined} /><div className="flex-1 overflow-auto"><table className="w-full text-xs"><thead><tr className="border-b bg-slate-50">{[...heads, ""].map(head => <th key={head} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase text-slate-500">{head}</th>)}</tr></thead><tbody>{data.map(row => <tr key={row.id} className="border-b"><td className="px-4 py-2.5">{row.date}</td><td className="px-4 py-2.5 font-medium text-blue-600">{row.doc_no}</td><td className="px-4 py-2.5">{row.customer}</td><td className="px-4 py-2.5">{row.warehouse_name}</td><td className="px-4 py-2.5 text-right font-semibold mono">{fmt(Number(row.total))}</td><td className="px-4 py-2.5"><StatusBadge status={row.status} /></td><td className="px-4 py-2.5">{can("Sales", "approve") && ["Draft", "Pending Approval"].includes(row.status) && <button onClick={() => void approve(row)} className="h-7 rounded-lg bg-blue-600 px-2 text-[10px] font-medium text-white">{lang === "vi" ? "Duyệt" : "Approve"}</button>}</td></tr>)}{!data.length && <tr><td colSpan={7} className="py-16 text-center text-slate-400">{lang === "vi" ? "Chưa có đơn bán" : "No sales orders"}</td></tr>}</tbody></table></div></div>{showCreate && <SalesDocumentModal kind="order" salesOrders={data} deliveries={[]} onClose={() => setShowCreate(false)} onSaved={reload} />}</>;
}

function SalesDocumentModal({ kind, salesOrders, deliveries, initialDeliveryRef, onClose, onSaved }: { kind: "order" | "delivery" | "return"; salesOrders: any[]; deliveries: any[]; initialDeliveryRef?: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const { lang } = useLang(); const { isDemo } = useDemo(); const { profile } = useAuth()
  const [products, setProducts] = useState<any[]>([]); const [warehouses, setWarehouses] = useState<any[]>([]); const [customers, setCustomers] = useState<any[]>([]); const [form, setForm] = useState<any>({ ref: "", customer_id: "", customer_name: "", warehouse_id: "", warehouse_name: "", sales_order_id: "", sales_order_ref: "", delivery_ref: "", reason: "" }); const [items, setItems] = useState<any[]>([{ product_id: "", product_name: "", qty: 1, unit_price: 0, unit_cost: 0 }]); const [saving, setSaving] = useState(false)
  useEffect(() => { Promise.all([fetchProducts({ isDemo, orgId: profile?.org_id }), fetchWarehouses({ isDemo, orgId: profile?.org_id }), fetchCustomers({ isDemo, orgId: profile?.org_id })]).then(([p, w, c]) => { setProducts(p.data ?? []); setWarehouses(w.data ?? []); setCustomers(c.data ?? []) }) }, [isDemo, profile])
  const title = kind === "order" ? (lang === "vi" ? "Tạo đơn bán" : "Create sales order") : kind === "delivery" ? (lang === "vi" ? "Tạo phiếu giao hàng" : "Create delivery") : (lang === "vi" ? "Tạo phiếu trả hàng" : "Create return")
  const setItem = (index: number, key: string, value: any) => setItems(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item))
  const chooseProduct = (index: number, id: string) => { const product = products.find(row => String(row.id) === String(id)); setItems(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, product_id: id, product_name: product?.name ?? "", unit_cost: Number(product?.cost ?? 0), unit_price: Number(product?.price ?? 0) } : item)) }
  const chooseWarehouse = (id: string) => { const warehouse = warehouses.find(row => String(row.id) === String(id)); setForm({ ...form, warehouse_id: id, warehouse_name: warehouse?.name ?? "" }) }
  const chooseCustomer = (id: string) => { const customer = customers.find(row => String(row.id) === String(id)); setForm({ ...form, customer_id: id, customer_name: customer?.name ?? "" }) }
  const chooseOrder = (id: string) => { const order = salesOrders.find(row => String(row.id) === String(id)); setForm({ ...form, sales_order_id: id, sales_order_ref: order?.ref ?? "", customer_id: order?.customer_id ?? "", customer_name: order?.customer_name ?? order?.customer ?? "", warehouse_id: order?.warehouse_id ?? "", warehouse_name: order?.warehouse_name ?? "" }); if (order?.items?.length) setItems(order.items.map((item: any) => ({ ...item, product_id: item.product_id, qty: Number(item.remaining_qty ?? item.qty ?? 0), max_qty: Number(item.remaining_qty ?? item.qty ?? 0), unit_price: Number(item.unit_price ?? item.price ?? 0), unit_cost: Number(item.unit_cost ?? item.cost ?? 0) })).filter((item: any) => item.qty > 0)) }
  const chooseDelivery = (ref: string) => { const delivery = deliveries.find(row => row.ref === ref); setForm({ ...form, delivery_ref: ref, customer_name: delivery?.customer_name ?? "", warehouse_id: delivery?.warehouse_id ?? "", warehouse_name: delivery?.warehouse_name ?? "" }); if (delivery?.items?.length) setItems(delivery.items.map((item: any) => ({ ...item, product_id: item.product_id, qty: 0, max_qty: Number(item.qty ?? 0) }))) }
  useEffect(() => { if (kind === "return" && initialDeliveryRef) chooseDelivery(initialDeliveryRef) }, [kind, initialDeliveryRef, deliveries])
  async function submit(event: React.FormEvent) { event.preventDefault(); const validItems = items.filter(item => item.product_id && Number(item.qty) > 0); if (new Set(validItems.map(item => item.product_id)).size !== validItems.length) return showAppToast(lang === "vi" ? "Mỗi sản phẩm chỉ được xuất hiện một lần trong chứng từ" : "Each product may only appear once in a document"); setSaving(true); const payload = { ...form, items: validItems }; const result = kind === "order" ? await upsertSalesOrder({ ...payload, subtotal: validItems.reduce((sum, item) => sum + Number(item.qty) * Number(item.unit_price), 0), total: validItems.reduce((sum, item) => sum + Number(item.qty) * Number(item.unit_price), 0) }, { isDemo, orgId: profile?.org_id }) : kind === "delivery" ? await deliverSalesOrder(payload, { isDemo, orgId: profile?.org_id }) : await createSalesReturn(payload, { isDemo, orgId: profile?.org_id }); setSaving(false); if (result.error) return showAppToast(result.error.message ?? String(result.error)); await onSaved(); onClose() }
  return <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}><form onSubmit={submit} onClick={event => event.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"><div className="flex items-center justify-between px-5 py-3.5 border-b"><h2 className="text-sm font-semibold">{title}</h2><button type="button" onClick={onClose}><X size={14} /></button></div><div className="p-5 space-y-4 max-h-[72vh] overflow-y-auto"><div className="grid grid-cols-2 gap-3"><label className="text-[11px] font-medium">{lang === "vi" ? "Số chứng từ" : "Reference"}<input required value={form.ref} onChange={event => setForm({ ...form, ref: event.target.value })} className="mt-1 w-full h-8 px-3 rounded-lg border text-xs" /></label>{kind === "order" ? <label className="text-[11px] font-medium">{lang === "vi" ? "Khách hàng" : "Customer"}<select required value={form.customer_id} onChange={event => chooseCustomer(event.target.value)} className="mt-1 w-full h-8 rounded-lg border bg-white px-2 text-xs"><option value="">Select</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label> : kind === "delivery" ? <label className="text-[11px] font-medium">{lang === "vi" ? "Đơn bán" : "Sales order"}<select required value={form.sales_order_id} onChange={event => chooseOrder(event.target.value)} className="mt-1 w-full h-8 rounded-lg border text-xs"><option value="">Select</option>{salesOrders.filter(row => ["Approved", "Partial"].includes(row.status)).map(row => <option key={row.id} value={row.id}>{row.ref} · {row.customer_name ?? row.customer}</option>)}</select></label> : <label className="text-[11px] font-medium">{lang === "vi" ? "Phiếu giao" : "Delivery"}<select required value={form.delivery_ref} onChange={event => chooseDelivery(event.target.value)} className="mt-1 w-full h-8 rounded-lg border text-xs"><option value="">Select</option>{deliveries.filter(row => row.status !== "Reversed").map(row => <option key={row.ref} value={row.ref}>{row.ref} · {row.customer_name}</option>)}</select></label>}<label className="text-[11px] font-medium">{lang === "vi" ? "Kho" : "Warehouse"}<select required disabled={kind !== "order"} value={form.warehouse_id} onChange={event => chooseWarehouse(event.target.value)} className="mt-1 w-full h-8 rounded-lg border bg-white text-xs disabled:bg-slate-50"><option value="">Select</option>{warehouses.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label></div><div className="border rounded-xl overflow-hidden"><div className="flex justify-between bg-slate-50 px-3 py-2 text-[11px] font-semibold"><span>{lang === "vi" ? "Sản phẩm" : "Items"}</span>{kind === "order" && <button type="button" onClick={() => setItems([...items, { product_id: "", product_name: "", qty: 1, unit_price: 0, unit_cost: 0 }])} className="text-blue-600">+ Add</button>}</div>{items.map((item, index) => <div key={index} className="grid grid-cols-[1fr_100px_110px_28px] gap-2 p-3 border-t"><select required disabled={kind !== "order"} value={item.product_id ?? ""} onChange={event => chooseProduct(index, event.target.value)} className="h-8 rounded-lg border text-xs disabled:bg-slate-50"><option value="">Select product</option>{products.map(row => <option key={row.id} value={row.id}>{row.sku} · {row.name}</option>)}</select><input required min="0.01" step="0.01" type="number" value={item.qty} onChange={event => setItem(index, "qty", event.target.value)} className="h-8 px-2 rounded-lg border text-xs" />{kind === "order" ? <input min="0" type="number" value={item.unit_price} onChange={event => setItem(index, "unit_price", event.target.value)} className="h-8 px-2 rounded-lg border text-xs" /> : <span className="text-[11px] text-slate-500 self-center truncate">{item.product_name}</span>}{kind === "order" ? <button type="button" onClick={() => setItems(items.filter((_, itemIndex) => itemIndex !== index))}><X size={14} /></button> : <span />}</div>)}</div></div><div className="flex justify-end gap-2 px-5 py-3.5 border-t bg-slate-50"><button type="button" onClick={onClose} className="h-8 px-4 rounded-lg border text-xs">Cancel</button><button disabled={saving} className="h-8 px-4 rounded-lg bg-blue-600 text-white text-xs">{saving ? "Saving..." : "Save"}</button></div></form></div>
}

// --- NEXT ---
export function StockBalance() {
  const { lang } = useLang();
  const [data, setData] = useState<any[]>([]);
  const { isDemo } = useDemo();
  const { profile } = useAuth();
  useEffect(() => {
    fetchInventoryBalance({ isDemo, orgId: profile?.org_id }).then(res => { if (res.data) setData(res.data) })
  }, [isDemo, profile]);
  const columns = lang === "vi" ? [
    { key: "product", label: "Sản phẩm", isStatus: false }, { key: "sku", label: "SKU", isStatus: false }, { key: "warehouse", label: "Kho", isStatus: false }, { key: "available", label: "Tồn khả dụng", isStatus: false, format: fmt }, { key: "reserved", label: "Đã đặt", isStatus: false, format: fmt }, { key: "incoming", label: "Nhập tới", isStatus: false, format: fmt }, { key: "outgoing", label: "Xuất ra", isStatus: false, format: fmt }, { key: "avgCost", label: "Giá vốn TB", isStatus: false, format: fmt }, { key: "value", label: "Giá trị", isStatus: false, format: fmt }
  ] : [
    { key: "product", label: "Product", isStatus: false }, { key: "sku", label: "SKU", isStatus: false }, { key: "warehouse", label: "Warehouse", isStatus: false }, { key: "available", label: "Available", isStatus: false, format: fmt }, { key: "reserved", label: "Reserved", isStatus: false, format: fmt }, { key: "incoming", label: "Incoming", isStatus: false, format: fmt }, { key: "outgoing", label: "Outgoing", isStatus: false, format: fmt }, { key: "avgCost", label: "Avg Cost", isStatus: false, format: fmt }, { key: "value", label: "Value", isStatus: false, format: fmt }
  ];
  return <GenericCrudList readOnly moduleName="Inventory" title={lang === "vi" ? "tồn kho" : "stock balance"} data={data} setData={setData} columns={columns} templateCols={["product","sku","warehouse","available","reserved","incoming","outgoing","avgCost","value"]} templateFile="stockbalance" />;
}

// --- NEXT ---
export function StockLedger() {
  const { lang } = useLang();
  const [data, setData] = useState<any[]>([]);
  const { isDemo } = useDemo();
  const { profile } = useAuth();
  useEffect(() => {
    fetchInventoryLedger({ isDemo, orgId: profile?.org_id }).then(res => {
      if (res.data) setData(res.data.map((row: any) => ({
        date: row.created_at ? formatDateTimeUtc7(row.created_at) : "",
        doc_no: row.ref ?? row.sku,
        product: row.product_name,
        type: row.movement_type,
        qty: row.qty_in || -row.qty_out,
        balance: row.balance,
      })))
    })
  }, [isDemo, profile]);
  const columns = lang === "vi" ? [
    { key: "date", label: "DATE", isStatus: false }, { key: "doc_no", label: "DOC_NO", isStatus: false }, { key: "product", label: "PRODUCT", isStatus: false }, { key: "type", label: "TYPE", isStatus: false }, { key: "qty", label: "QTY", isStatus: false }, { key: "balance", label: "BALANCE", isStatus: false }
  ] : [
    { key: "date", label: "DATE", isStatus: false }, { key: "doc_no", label: "DOC_NO", isStatus: false }, { key: "product", label: "PRODUCT", isStatus: false }, { key: "type", label: "TYPE", isStatus: false }, { key: "qty", label: "QTY", isStatus: false }, { key: "balance", label: "BALANCE", isStatus: false }
  ];
  return <GenericCrudList readOnly moduleName="Inventory" title={lang === "vi" ? "sổ kho" : "stock ledger"} data={data} setData={setData} columns={columns} templateCols={["date","doc_no","product","type","qty","balance"]} templateFile="stockledger" />;
}

// --- NEXT ---
function InventoryMovementModal({ mode, onClose, onSaved }: { mode: "adjustment" | "transfer"; onClose: () => void; onSaved: () => Promise<void> }) {
  const { isDemo } = useDemo(); const { profile } = useAuth(); const { lang } = useLang(); const [products, setProducts] = useState<any[]>([]); const [warehouses, setWarehouses] = useState<any[]>([]); const [ledger, setLedger] = useState<any[]>([]); const [form, setForm] = useState<any>({ ref: "", warehouse_id: "", warehouse_name: "", from_warehouse_id: "", from_warehouse_name: "", to_warehouse_id: "", to_warehouse_name: "", product_id: "", product_name: "", qty: 1, reason: "" }); const [saving, setSaving] = useState(false)
  useEffect(() => { Promise.all([fetchProducts({ isDemo, orgId: profile?.org_id }), fetchWarehouses({ isDemo, orgId: profile?.org_id }), fetchInventoryLedger({ isDemo, orgId: profile?.org_id })]).then(([p, w, l]) => { setProducts(p.data ?? []); setWarehouses(w.data ?? []); setLedger(l.data ?? []) }) }, [isDemo, profile])
  const chooseWarehouse = (key: string, id: string) => { const row = warehouses.find(item => String(item.id) === String(id)); setForm({ ...form, [`${key}_id`]: id, [`${key}_name`]: row?.name ?? "" }) }
  const chooseProduct = (id: string) => { const row = products.find(item => String(item.id) === String(id)); setForm({ ...form, product_id: id, product_name: row?.name ?? "" }) }
  const currentQty = ledger.filter(row => String(row.product_id) === String(form.product_id) && String(row.warehouse_id) === String(form.warehouse_id)).reduce((sum, row) => sum + Number(row.qty_in ?? 0) - Number(row.qty_out ?? 0), 0)
  async function submit(event: React.FormEvent) { event.preventDefault(); setSaving(true); const delta = Number(form.qty) - currentQty; const result = mode === "adjustment" ? await upsertInventoryAdjustment({ ref: form.ref, warehouse_id: form.warehouse_id, warehouse_name: form.warehouse_name, reason: form.reason, items: [{ product_id: form.product_id, product_name: form.product_name, qty_delta: delta }] }, { isDemo, orgId: profile?.org_id }) : await upsertInventoryTransfer({ ref: form.ref, from_warehouse_id: form.from_warehouse_id, from_warehouse_name: form.from_warehouse_name, to_warehouse_id: form.to_warehouse_id, to_warehouse_name: form.to_warehouse_name, items: [{ product_id: form.product_id, product_name: form.product_name, qty: Number(form.qty) }] }, { isDemo, orgId: profile?.org_id }); setSaving(false); if (result.error) return showAppToast(result.error.message ?? String(result.error)); await onSaved(); onClose() }
  return <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}><form onSubmit={submit} onClick={event => event.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"><div className="flex justify-between px-5 py-3.5 border-b"><h2 className="text-sm font-semibold">{mode === "adjustment" ? (lang === "vi" ? "Tạo điều chỉnh kho" : "Create adjustment") : (lang === "vi" ? "Tạo chuyển kho" : "Create transfer")}</h2><button type="button" onClick={onClose}><X size={14} /></button></div><div className="p-5 grid grid-cols-2 gap-3"><label className="text-[11px] font-medium">Reference<input required value={form.ref} onChange={event => setForm({ ...form, ref: event.target.value })} className="mt-1 w-full h-8 rounded-lg border px-2 text-xs" /></label><label className="text-[11px] font-medium">Product<select required value={form.product_id} onChange={event => chooseProduct(event.target.value)} className="mt-1 w-full h-8 rounded-lg border px-2 text-xs"><option value="">Select</option>{products.map(row => <option key={row.id} value={row.id}>{row.sku} · {row.name}</option>)}</select></label>{mode === "adjustment" ? <label className="text-[11px] font-medium">Actual quantity<input required min="0" type="number" step="0.01" value={form.qty} onChange={event => setForm({ ...form, qty: event.target.value })} className="mt-1 w-full h-8 rounded-lg border px-2 text-xs" /><span className="text-[10px] text-slate-400">Current ledger: {currentQty}</span></label> : <label className="text-[11px] font-medium">Quantity<input required min="0.01" type="number" step="0.01" value={form.qty} onChange={event => setForm({ ...form, qty: event.target.value })} className="mt-1 w-full h-8 rounded-lg border px-2 text-xs" /></label>}{mode === "adjustment" ? <label className="text-[11px] font-medium">Warehouse<select required value={form.warehouse_id} onChange={event => chooseWarehouse("warehouse", event.target.value)} className="mt-1 w-full h-8 rounded-lg border px-2 text-xs"><option value="">Select</option>{warehouses.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label> : <><label className="text-[11px] font-medium">From<select required value={form.from_warehouse_id} onChange={event => chooseWarehouse("from_warehouse", event.target.value)} className="mt-1 w-full h-8 rounded-lg border px-2 text-xs"><option value="">Select</option>{warehouses.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label className="text-[11px] font-medium">To<select required value={form.to_warehouse_id} onChange={event => chooseWarehouse("to_warehouse", event.target.value)} className="mt-1 w-full h-8 rounded-lg border px-2 text-xs"><option value="">Select</option>{warehouses.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label></>}<label className="text-[11px] font-medium col-span-2">Reason<input value={form.reason} onChange={event => setForm({ ...form, reason: event.target.value })} className="mt-1 w-full h-8 rounded-lg border px-2 text-xs" /></label></div><div className="flex justify-end gap-2 px-5 py-3.5 border-t bg-slate-50"><button type="button" onClick={onClose} className="h-8 px-4 rounded-lg border text-xs">Cancel</button><button disabled={saving} className="h-8 px-4 rounded-lg bg-blue-600 text-white text-xs">Save</button></div></form></div>
}

export function InventoryAdjustment() {
  const { lang } = useLang();
  const [data, setData] = useState<any[]>([]);
  const { isDemo } = useDemo();
  const { profile, can } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const reload = async () => { const res = await fetchInventoryAdjustments({ isDemo, orgId: profile?.org_id }); if (res.data) setData(res.data.map((row: any) => ({ ...row, date: row.created_at ? formatDateTimeUtc7(row.created_at) : "", doc_no: row.doc_no ?? row.ref ?? "", warehouse: row.warehouse_name ?? row.warehouse ?? "", reason: row.reason ?? "Manual adjustment" }))) }
  useEffect(() => {
    reload()
  }, [isDemo, profile]);
  const columns = lang === "vi" ? [
    { key: "date", label: "DATE", isStatus: false }, { key: "doc_no", label: "DOC_NO", isStatus: false }, { key: "warehouse", label: "WAREHOUSE", isStatus: false }, { key: "reason", label: "REASON", isStatus: false }, { key: "status", label: "STATUS", isStatus: true }
  ] : [
    { key: "date", label: "DATE", isStatus: false }, { key: "doc_no", label: "DOC_NO", isStatus: false }, { key: "warehouse", label: "WAREHOUSE", isStatus: false }, { key: "reason", label: "REASON", isStatus: false }, { key: "status", label: "STATUS", isStatus: true }
  ];
  const reverse = async (ref: string) => { const result = await reverseInventoryAdjustment(ref, { isDemo, orgId: profile?.org_id }); if (result.error) showAppToast(result.error.message ?? String(result.error)); else await reload() }
  return <div className="flex flex-col h-full"><Toolbar onCreate={can("Inventory", "create") ? () => setShowCreate(true) : undefined} onRefresh={() => void reload()} createLabel={lang === "vi" ? "Tạo điều chỉnh" : "Create adjustment"} /><div className="flex-1 overflow-auto"><table className="w-full text-xs"><thead><tr className="bg-slate-50">{["DATE", "DOC_NO", "WAREHOUSE", "REASON", "STATUS", ""].map(head => <th key={head} className="px-4 py-2.5 text-left text-[10px] text-slate-500">{head}</th>)}</tr></thead><tbody>{data.map(row => <tr key={row.doc_no} className="border-b"><td className="px-4 py-2.5">{row.date}</td><td className="px-4 py-2.5">{row.doc_no}</td><td className="px-4 py-2.5">{row.warehouse}</td><td className="px-4 py-2.5">{row.reason}</td><td className="px-4 py-2.5"><StatusBadge status={row.status} /></td><td className="px-4 py-2.5">{can("Inventory", "approve") && <button disabled={row.status === "Reversed"} onClick={() => reverse(row.ref)} className="h-7 px-2 rounded border text-[10px] disabled:opacity-40">Reverse</button>}</td></tr>)}</tbody></table></div>{showCreate && <InventoryMovementModal mode="adjustment" onClose={() => setShowCreate(false)} onSaved={reload} />}</div>;
}

// --- NEXT ---
export function Categories() {
  const { lang } = useLang();
  const [data, setData] = useState<any[]>([]);
  const { isDemo } = useDemo();
  const { profile } = useAuth();
  useEffect(() => {
    fetchCategories({ isDemo, orgId: profile?.org_id }).then(res => { if (res.data) setData(res.data) })
  }, [isDemo, profile]);
  const columns = lang === "vi" ? [
    { key: "code", label: "CODE", isStatus: false }, { key: "name", label: "NAME", isStatus: false }, { key: "status", label: "STATUS", isStatus: true }
  ] : [
    { key: "code", label: "CODE", isStatus: false }, { key: "name", label: "NAME", isStatus: false }, { key: "status", label: "STATUS", isStatus: true }
  ];
  return <GenericCrudList title={lang === "vi" ? "danh mục" : "category"} data={data} setData={setData} columns={columns} templateCols={["code","name","status"]} templateFile="categories" />;
}

// --- NEXT ---
export function Brands() {
  const { lang } = useLang();
  const [data, setData] = useState<any[]>([]);
  const { isDemo } = useDemo();
  const { profile } = useAuth();
  useEffect(() => {
    fetchBrands({ isDemo, orgId: profile?.org_id }).then(res => { if (res.data) setData(res.data) })
  }, [isDemo, profile]);
  const columns = lang === "vi" ? [
    { key: "code", label: "CODE", isStatus: false }, { key: "name", label: "NAME", isStatus: false }, { key: "status", label: "STATUS", isStatus: true }
  ] : [
    { key: "code", label: "CODE", isStatus: false }, { key: "name", label: "NAME", isStatus: false }, { key: "status", label: "STATUS", isStatus: true }
  ];
  return <GenericCrudList title={lang === "vi" ? "thương hiệu" : "brand"} data={data} setData={setData} columns={columns} templateCols={["code","name","status"]} templateFile="brands" />;
}

// --- NEXT ---
export function Users() {
  const { lang } = useLang()
  const { isDemo } = useDemo()
  const { profile, can } = useAuth()
  const [data, setData] = useState<any[]>([])
  const [roles, setRoles] = useState<any[]>([])
  const [error, setError] = useState("")
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("staff")
  const [inviteLink, setInviteLink] = useState("")
  const [inviting, setInviting] = useState(false)
  const [copied, setCopied] = useState(false)
  const isCurrentAdmin = String(profile?.role ?? "").toLowerCase() === "admin"
  const assignableRoles = isCurrentAdmin
    ? roles
    : roles.filter(role => String(role.code ?? "").toLowerCase() !== "admin")
  const load = async () => {
    const [usersResult, rolesResult] = await Promise.all([
      fetchUsers({ isDemo, orgId: profile?.org_id }),
      fetchRoles({ isDemo, orgId: profile?.org_id }),
    ])
    setData(usersResult.data ?? [])
    setRoles(rolesResult.data ?? [])
    const sourceError = usersResult.error ?? rolesResult.error
    setError(sourceError ? sourceError.message ?? String(sourceError) : "")
  }
  useEffect(() => { void load() }, [isDemo, profile?.org_id])
  const changeRole = async (userId: string, role: string) => {
    const result = await updateUserRole(userId, role, { isDemo, orgId: profile?.org_id })
    if (result.error) return setError(result.error.message ?? String(result.error))
    await load()
  }
  const openInvite = () => {
    const defaultRole = assignableRoles.find(role => String(role.code).toLowerCase() === "staff") ?? assignableRoles[0]
    setInviteEmail("")
    setInviteRole(String(defaultRole?.code ?? "staff").toLowerCase())
    setInviteLink("")
    setCopied(false)
    setError("")
    setShowInvite(true)
  }
  const submitInvite = async (event: React.FormEvent) => {
    event.preventDefault()
    setInviting(true)
    setError("")
    const result = await createOrganizationInvitation(inviteEmail, inviteRole, { isDemo, orgId: profile?.org_id })
    setInviting(false)
    if (result.error || !result.data) {
      setError(result.error?.message ?? String(result.error ?? "Invitation token was not returned."))
      return
    }
    setInviteLink(`${window.location.origin}${window.location.pathname}?auth&invite=${encodeURIComponent(result.data)}`)
  }
  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      setError("")
    } catch {
      setError(lang === "vi" ? "Không thể tự động sao chép. Hãy chọn và sao chép liên kết thủ công." : "Could not copy automatically. Please copy the link manually.")
    }
  }
  return <>
    <div className="flex h-full flex-col">
      <Toolbar
        onCreate={!isDemo && can("Administration", "create") ? openInvite : undefined}
        createLabel={lang === "vi" ? "Mời thành viên" : "Invite member"}
        onRefresh={() => void load()}
        onExportCsv={can("Administration", "export") ? () => exportCsv("users", ["Name", "Email", "Role", "Created"], data.map(row => [row.full_name ?? "", row.email, row.role, row.created_at])) : undefined}
      />
      {error && <div className="border-b border-red-200 bg-red-50 px-5 py-2 text-xs text-red-700">{error}</div>}
      <div className="flex-1 overflow-auto"><table className="w-full text-xs"><thead><tr className="border-b bg-slate-50">{[lang === "vi" ? "Họ tên" : "Full name", "Email", "Role", lang === "vi" ? "Ngày tham gia" : "Joined"].map(header => <th key={header} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase text-slate-500">{header}</th>)}</tr></thead><tbody>
        {data.map(row => <tr key={row.id} className="border-b"><td className="px-4 py-2.5 font-medium">{row.full_name || "—"}</td><td className="px-4 py-2.5">{row.email}</td><td className="px-4 py-2.5">{can("Administration", "update") && (isCurrentAdmin || String(row.role).toLowerCase() !== "admin") ? <select value={row.role} onChange={event => void changeRole(row.id, event.target.value)} className="h-8 rounded-lg border bg-white px-2 text-xs">{assignableRoles.map(role => <option key={role.id} value={String(role.code).toLowerCase()}>{role.name}</option>)}</select> : row.role}</td><td className="px-4 py-2.5 text-slate-500">{formatDateTimeUtc7(row.created_at)}</td></tr>)}
        {!data.length && <tr><td colSpan={4} className="py-16 text-center text-slate-400">{lang === "vi" ? "Chưa có người dùng" : "No users"}</td></tr>}
      </tbody></table></div>
    </div>
    {showInvite && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowInvite(false)}>
        <form onSubmit={submitInvite} onClick={event => event.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b px-5 py-3.5">
            <h2 className="text-sm font-semibold">{lang === "vi" ? "Mời thành viên" : "Invite member"}</h2>
            <button type="button" onClick={() => setShowInvite(false)} aria-label={lang === "vi" ? "Đóng" : "Close"}><X size={14} /></button>
          </div>
          <div className="space-y-4 p-5">
            {!inviteLink ? <>
              <label className="block text-[11px] font-medium">Email
                <input required type="email" value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} placeholder="member@company.com" className="mt-1 h-9 w-full rounded-lg border px-3 text-xs" />
              </label>
              <label className="block text-[11px] font-medium">{lang === "vi" ? "Vai trò" : "Role"}
                <select required value={inviteRole} onChange={event => setInviteRole(event.target.value)} className="mt-1 h-9 w-full rounded-lg border bg-white px-3 text-xs">
                  {assignableRoles.map(role => <option key={role.id} value={String(role.code).toLowerCase()}>{role.name}</option>)}
                </select>
              </label>
              <p className="text-[11px] leading-5 text-slate-400">{lang === "vi" ? "Liên kết chỉ dùng cho email này và hết hạn sau 7 ngày." : "The link only works for this email and expires after 7 days."}</p>
            </> : <>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
                {lang === "vi" ? "Đã tạo lời mời. Gửi liên kết dưới đây cho thành viên." : "Invitation created. Send this link to the member."}
              </div>
              <label className="block text-[11px] font-medium">{lang === "vi" ? "Liên kết mời" : "Invitation link"}
                <textarea readOnly value={inviteLink} onFocus={event => event.currentTarget.select()} rows={3} className="mt-1 w-full resize-none rounded-lg border bg-slate-50 p-3 text-xs" />
              </label>
            </>}
          </div>
          <div className="flex justify-end gap-2 border-t bg-slate-50 px-5 py-3.5">
            <button type="button" onClick={() => setShowInvite(false)} className="h-8 rounded-lg border px-4 text-xs">{lang === "vi" ? "Đóng" : "Close"}</button>
            {inviteLink
              ? <button type="button" onClick={() => void copyInvite()} className="h-8 rounded-lg bg-blue-600 px-4 text-xs text-white">{copied ? (lang === "vi" ? "Đã sao chép" : "Copied") : (lang === "vi" ? "Sao chép" : "Copy")}</button>
              : <button disabled={inviting || !assignableRoles.length} className="h-8 rounded-lg bg-blue-600 px-4 text-xs text-white disabled:opacity-50">{inviting ? (lang === "vi" ? "Đang tạo..." : "Creating...") : (lang === "vi" ? "Tạo liên kết" : "Create link")}</button>}
          </div>
        </form>
      </div>
    )}
  </>
}

// --- Roles ---
export function Roles() {
  const { t, lang } = useLang()
  const { isDemo } = useDemo();
  const { profile, can } = useAuth();
  const [dataList, setDataList] = useState<any[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [permissions, setPermissions] = useState<Record<string, Record<string, boolean>>>({})
  const modules = ["Dashboard", "Master Data", "Inventory", "Purchase", "Sales", "Finance", "Reports", "Administration"]
  const actions = [
    { key: "view", label: lang === "vi" ? "Xem" : "View" },
    { key: "create", label: lang === "vi" ? "Tạo" : "Create" },
    { key: "update", label: lang === "vi" ? "Sửa" : "Update" },
    { key: "delete", label: lang === "vi" ? "Xóa" : "Delete" },
    { key: "approve", label: lang === "vi" ? "Duyệt" : "Approve" },
    { key: "export", label: lang === "vi" ? "Xuất" : "Export" },
  ]
  const [feedback, setFeedback] = useState("")

  useEffect(() => {
    async function loadRoles() {
      const rolesRes = await fetchRoles({ isDemo, orgId: profile?.org_id })
      if (rolesRes.data) {
        setDataList(rolesRes.data)
        setSelectedRoleId((prev) => prev ?? rolesRes.data[0]?.id ?? null)
      }
      const permsRes = await fetchRolePermissions({ isDemo, orgId: profile?.org_id })
      if (permsRes.data) {
        const map: Record<string, Record<string, boolean>> = {}
        for (const p of permsRes.data) {
          const roleId = String(p.role_id)
          if (!map[roleId]) map[roleId] = {}
          map[roleId][`${p.module}:${String(p.action).toLowerCase()}`] = Boolean(p.allowed)
        }
        setPermissions(map)
      }
    }
    loadRoles()
  }, [isDemo, profile])

  const selectedRole = dataList.find((r) => r.id === selectedRoleId) ?? dataList[0] ?? null

  const togglePermission = (module: string, action: string) => {
    if (!selectedRole?.id || String(selectedRole.code).toLowerCase() === "admin") return
    setPermissions(prev => ({
      ...prev,
      [selectedRole.id]: {
        ...(prev[selectedRole.id] ?? {}),
        [`${module}:${action}`]: !(prev[selectedRole.id]?.[`${module}:${action}`] ?? false),
      }
    }))
  }

  const savePermissions = async () => {
    if (!selectedRole?.id) return
    const roleId = selectedRole.id
    for (const module of modules) {
      for (const action of actions) {
        const key = `${module}:${action.key}`
        const allowed = Boolean(permissions[roleId]?.[key] ?? false)
        const result = await upsertRolePermission({ role_id: roleId, module, action: action.key, allowed }, { isDemo, orgId: profile?.org_id })
        if (result.error) {
          setFeedback(result.error.message ?? String(result.error))
          return
        }
      }
    }
    setFeedback(lang === "vi" ? "Đã lưu quyền hạn" : "Permissions saved")
  }

  const handleCreateRole = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget)
    const code = String(fd.get("code") || "NEW").trim().toUpperCase()
    const name = String(fd.get("name") || "New Role").trim()
    const description = String(fd.get("desc") || "")
    const res = await upsertRole({ code, name, name_vi: name, name_en: name, isSystem: false, desc: description, description }, { isDemo, orgId: profile?.org_id })
    if (!res.error) {
      const rolesRes = await fetchRoles({ isDemo, orgId: profile?.org_id })
      if (rolesRes.data) setDataList(rolesRes.data)
      setShowCreate(false)
    } else setFeedback(res.error.message ?? String(res.error))
  }

  const handleDeleteRole = async (role: any) => {
    if (!role.id || !await confirmAppAction(lang === "vi" ? "Xóa vai trò này?" : "Delete this role?", { destructive: true })) return
    const result = await deleteRole(role.id, { isDemo, orgId: profile?.org_id })
    if (result.error) return setFeedback(result.error.message ?? String(result.error))
    const rolesResult = await fetchRoles({ isDemo, orgId: profile?.org_id })
    setDataList(rolesResult.data ?? [])
    setSelectedRoleId(rolesResult.data?.[0]?.id ?? null)
  }

  return (
    <div className="flex flex-col h-full">
      <Toolbar onCreate={can("Administration", "create") ? () => setShowCreate(true) : undefined} createLabel={lang === "vi" ? "Thêm vai trò" : "Add Role"}
        onExportCsv={can("Administration", "export") ? () => exportCsv("roles", ["Code", "Name", "Users", "Is System", "Description"], dataList.map(r => [r.code, r.name, r.users, r.isSystem ? "Yes" : "No", r.desc])) : undefined}
        onExportXlsx={can("Administration", "export") ? () => exportXlsx("roles", ["Code", "Name", "Users", "Is System", "Description"], dataList.map(r => [r.code, r.name, r.users, r.isSystem ? "Yes" : "No", r.desc])) : undefined}
      />
      <div className="flex h-full min-h-0">
        <div className="w-64 border-r bg-white flex flex-col flex-shrink-0" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
            <span className="text-xs font-semibold text-slate-700">{lang === "vi" ? "Danh sách vai trò" : "Roles"}</span>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {dataList.map((r) => (
              <button key={r.id ?? r.code} onClick={() => setSelectedRoleId(r.id ?? null)} className={`group relative w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors ${selectedRole?.id === r.id ? "bg-blue-50 border-r-2 border-blue-600" : "hover:bg-slate-50"}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-800 truncate">{r.name}</span>
                    {r.isSystem && <span className="text-[9px] bg-slate-100 text-slate-500 rounded px-1 font-medium">SYS</span>}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5 truncate">{r.desc}</div>
                  <div className="text-[10px] text-slate-400">{r.users ?? 0} {lang === "vi" ? "người dùng" : "users"}</div>
                </div>
                {!r.isSystem && can("Administration", "delete") && (
                  <div onClick={(e) => { e.stopPropagation(); void handleDeleteRole(r) }} className="absolute right-2 top-2 hidden group-hover:flex items-center justify-center w-6 h-6 rounded-md bg-red-50 text-red-500 hover:bg-red-100 transition-colors cursor-pointer">
                    <X size={12}/>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-auto p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{lang === "vi" ? "Quyền hạn" : "Permissions"} — {selectedRole?.name ?? "Role"}</h2>
              <p className="text-[11px] text-slate-400">{lang === "vi" ? "Quản lý quyền truy cập theo module và hành động" : "Manage access rights by module and action"}</p>
            </div>
            {can("Administration", "update") && String(selectedRole?.code ?? "").toLowerCase() !== "admin" && <button onClick={savePermissions} className="h-8 px-3 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700">{t("save")}</button>}
          </div>
          <div className="bg-white border rounded-xl overflow-hidden" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-500 text-[10px] uppercase tracking-wider w-36">Module</th>
                  {actions.map(action => (
                    <th key={action.key} className="px-3 py-2.5 text-center font-semibold text-slate-500 text-[10px] uppercase tracking-wider">{action.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modules.map((mod) => (
                  <tr key={mod} className="border-b last:border-0 hover:bg-slate-50/60" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-2.5 font-medium text-slate-700">{mod}</td>
                    {actions.map((action) => {
                      const key = `${mod}:${action.key}`
                      const isAdminRole = String(selectedRole?.code ?? "").toLowerCase() === "admin"
                      const checked = isAdminRole || Boolean(selectedRole?.id ? permissions[selectedRole.id]?.[key] : false)
                      return (
                        <td key={action.key} className="px-3 py-2.5 text-center">
                          <input disabled={isAdminRole || !can("Administration", "update")} checked={checked} onChange={() => togglePermission(mod, action.key)} type="checkbox" className="accent-blue-600 w-4 h-4 disabled:opacity-60" />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {feedback && <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${feedback.toLowerCase().includes("denied") || feedback.toLowerCase().includes("error") ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{feedback}</div>}
        </div>
      </div>
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="text-sm font-semibold">{lang === "vi" ? "Thêm vai trò" : "Add Role"}</h2>
              <button onClick={() => setShowCreate(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"><X size={14} /></button>
            </div>
            <form onSubmit={handleCreateRole}>
              <div className="p-5 space-y-3">
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Mã Vai trò" : "Role Code"}</label><input name="code" required className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Tên Vai trò *" : "Role Name *"}</label><input name="name" required className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Mô tả" : "Description"}</label><input name="desc" className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
              </div>
              <div className="flex justify-end gap-2 px-5 py-3.5 border-t bg-slate-50" style={{ borderColor: "var(--border)" }}>
                <button type="button" onClick={() => setShowCreate(false)} className="h-8 px-4 rounded-lg border text-xs text-slate-600" style={{ borderColor: "var(--border)" }}>{t("cancel")}</button>
                <button type="submit" className="h-8 px-4 rounded-lg bg-blue-600 text-white text-xs font-medium">{t("save")}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
// --- Audit Logs ---
export function AuditLogs() {
  const { t, lang } = useLang()
  const [dataList, setDataList] = useState<any[]>([])
  const [search, setSearch] = useState("")
  const { isDemo } = useDemo()
  const { profile, can } = useAuth()
  useEffect(() => {
    if (isDemo) setDataList(auditLogs)
    else fetchAuditEvents({ isDemo, orgId: profile?.org_id }).then(result => {
      setDataList((result.data ?? []).map((row: any) => ({ entity: row.entity, action: row.action, field: row.entity_ref ?? "", oldVal: row.old_value ? JSON.stringify(row.old_value) : "", newVal: row.new_value ? JSON.stringify(row.new_value) : "", user: row.actor_id ?? "System", time: row.created_at })))
    })
  }, [isDemo, profile])

  const filtered = dataList.filter(log => search === "" || log.entity.toLowerCase().includes(search.toLowerCase()) || log.user.toLowerCase().includes(search.toLowerCase()))
  const heads = lang === "vi"
    ? ["Đối tượng", "Hành động", "Tham chiếu", "Giá trị cũ", "Giá trị mới", "Người dùng", "Thời gian"]
    : ["Entity", "Action", "Reference", "Old Value", "New Value", "User", "Time"]
  return (
    <div className="flex flex-col h-full">
      <Toolbar search={search} onSearch={setSearch}
        onExportCsv={can("Administration", "export") ? () => exportCsv("audit-logs", heads, filtered.map(l => [l.entity, l.action, l.field, l.oldVal, l.newVal, l.user, l.time])) : undefined}
        onExportXlsx={can("Administration", "export") ? () => exportXlsx("audit-logs", heads, filtered.map(l => [l.entity, l.action, l.field, l.oldVal, l.newVal, l.user, l.time])) : undefined}
      />
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse min-w-[900px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
              {heads.map((h, i) => <th key={i} className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map((log, i) => (
              <tr key={i} className="border-b hover:bg-slate-50/60 group cursor-pointer" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-2.5 font-medium text-slate-700">{log.entity}</td>
                <td className="px-4 py-2.5">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold mono uppercase
                    ${log.action === "UPDATE" ? "bg-blue-50 text-blue-700" :
                      log.action === "APPROVE" ? "bg-emerald-50 text-emerald-700" :
                      log.action === "CANCEL" ? "bg-red-50 text-red-600" :
                      "bg-violet-50 text-violet-700"}`}>
                    {log.action}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-slate-600">{log.field}</td>
                <td className="px-4 py-2.5 mono text-slate-400 line-through">{log.oldVal}</td>
                <td className="px-4 py-2.5 mono font-medium text-slate-800">{log.newVal}</td>
                <td className="px-4 py-2.5 text-blue-600 font-medium">{log.user}</td>
                <td className="px-4 py-2.5 mono text-slate-400 whitespace-nowrap text-[10px]">{formatDateTimeUtc7(log.time)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager count={filtered.length} total={dataList.length} label={lang === "vi" ? "bản ghi" : "records"} />
    </div>
  )
}

// --- Finance Screens ---
export function Receivables() {
  return <OutstandingDocuments type="receivable" />
}

function OutstandingDocuments({ type }: { type: "receivable" | "payable" }) {
  const { lang } = useLang()
  const { isDemo } = useDemo()
  const { profile, can } = useAuth()
  const [dataList, setDataList] = useState<any[]>([])
  const [search, setSearch] = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState("")
  const isReceivable = type === "receivable"
  const reload = async () => {
    const result = isReceivable
      ? await fetchInvoices({ isDemo, orgId: profile?.org_id })
      : await fetchPurchaseOrders({ isDemo, orgId: profile?.org_id })
    const today = formatDateKeyUtc7()
    setDataList((result.data ?? []).map((row: any) => {
      const remaining = Number(row.outstanding_amount ?? Math.max(0, Number(row.total ?? 0) - Number(row.paid_amount ?? 0)))
      const due = row.due_date ?? row.expected_date ?? String(row.created_at ?? "").slice(0, 10)
      return {
        ref: row.ref,
        party: isReceivable ? row.customer_name : row.supplier_name,
        party_id: isReceivable ? row.customer_id : row.supplier_id,
        date: String(row.created_at ?? row.date ?? "").slice(0, 10),
        due,
        amount: Number(row.total ?? 0),
        paid: Number(row.paid_amount ?? 0),
        remaining,
        status: remaining <= 0 ? "Paid" : due && due < today ? "Overdue" : row.payment_status ?? row.status ?? "Unpaid",
      }
    }))
    setError(result.error ? result.error.message ?? String(result.error) : "")
  }
  useEffect(() => { void reload() }, [isDemo, profile?.org_id, type])
  const filtered = dataList.filter(row => !search || String(row.ref).toLowerCase().includes(search.toLowerCase()) || String(row.party).toLowerCase().includes(search.toLowerCase()))
  const heads = isReceivable
    ? (lang === "vi" ? ["Số HĐ", "Khách hàng", "Ngày HĐ", "Ngày đến hạn", "Số tiền", "Đã thu", "Còn lại", "Trạng thái"] : ["Invoice", "Customer", "Date", "Due Date", "Amount", "Paid", "Remaining", "Status"])
    : (lang === "vi" ? ["Số PO", "Nhà cung cấp", "Ngày PO", "Ngày đến hạn", "Số tiền", "Đã trả", "Còn lại", "Trạng thái"] : ["PO", "Supplier", "Date", "Due Date", "Amount", "Paid", "Remaining", "Status"])
  const exportRows = filtered.map(row => [row.ref, row.party, row.date, row.due, row.amount, row.paid, row.remaining, row.status])
  const totalRemaining = filtered.reduce((sum, row) => sum + row.remaining, 0)
  return (
    <div className="flex flex-col h-full">
      <Toolbar search={search} onSearch={setSearch} createLabel={isReceivable ? (lang === "vi" ? "Ghi nhận thu tiền" : "Record receipt") : (lang === "vi" ? "Ghi nhận trả tiền" : "Record payment")} onCreate={can("Finance", "create") ? () => setShowCreate(true) : undefined}
        onExportCsv={can("Finance", "export") ? () => exportCsv(type, heads, exportRows) : undefined}
        onExportXlsx={can("Finance", "export") ? () => exportXlsx(type, heads, exportRows) : undefined}
        onPrint={can("Finance", "export") ? () => printTable(type, heads, exportRows) : undefined}
        onRefresh={() => void reload()}
      />
      {error && <div className="border-b border-red-200 bg-red-50 px-5 py-2 text-xs text-red-700">{error}</div>}
      <div className="grid grid-cols-3 gap-3 px-5 py-3 bg-white border-b flex-shrink-0" style={{ borderColor: "var(--border)" }}>
        {[
          { label: isReceivable ? (lang === "vi" ? "Tổng phải thu" : "Total receivable") : (lang === "vi" ? "Tổng phải trả" : "Total payable"), value: fmt(filtered.reduce((a, b) => a + b.amount, 0)), color: "text-slate-900" },
          { label: isReceivable ? (lang === "vi" ? "Đã thu" : "Collected") : (lang === "vi" ? "Đã trả" : "Paid"), value: fmt(filtered.reduce((a, b) => a + b.paid, 0)), color: "text-emerald-600" },
          { label: lang === "vi" ? "Còn lại" : "Outstanding", value: fmt(totalRemaining), color: "text-amber-600" },
        ].map(c => (
          <div key={c.label} className="bg-slate-50 rounded-xl p-3">
            <div className="text-[10px] text-slate-400 font-medium">{c.label}</div>
            <div className={`text-sm font-bold mono mt-0.5 ${c.color}`}>{c.value}</div>
          </div>
        ))}
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse min-w-[950px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
              {heads.map((h, i) => <th key={i} className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.ref} className="border-b hover:bg-slate-50/60" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-2.5 mono text-blue-600 font-medium">{r.ref}</td>
                <td className="px-4 py-2.5 font-medium text-slate-800">{r.party}</td>
                <td className="px-4 py-2.5 mono text-slate-400">{r.date}</td>
                <td className="px-4 py-2.5 mono text-slate-400">{r.due}</td>
                <td className="px-4 py-2.5 mono font-semibold text-right">{fmt(r.amount)}</td>
                <td className="px-4 py-2.5 mono text-right text-emerald-600">{fmt(r.paid)}</td>
                <td className="px-4 py-2.5 mono text-right font-bold text-amber-600">{fmt(r.remaining)}</td>
                <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager count={filtered.length} total={dataList.length} label={isReceivable ? (lang === "vi" ? "hóa đơn" : "invoices") : (lang === "vi" ? "đơn mua" : "purchase orders")} />
      {showCreate && <FinanceTransactionModal transactionType={isReceivable ? "CUSTOMER_RECEIPT" : "SUPPLIER_PAYMENT"} onClose={() => setShowCreate(false)} onSaved={reload} />}
    </div>
  )
}

// --- Export helpers ---
export function exportCsv(filename: string, heads: string[], rows: (string | number)[][], companyName = "WarehouseOS") {
  const exportDate = getExportDate()
  const meta = [
    ["Company", companyName],
    ["Report", getReportTitle(filename)],
    ["Exported", exportDate],
    [],
  ]
  const lines = [
    ...meta.map(row => row.map(formatCsvCell).join(",")),
    heads.map(formatCsvCell).join(","),
    ...rows.map(r => r.map(formatCsvCell).join(",")),
  ].join("\n")
  const blob = new Blob(["﻿" + lines], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a"); a.href = url; a.download = filename + ".csv"; a.click()
  URL.revokeObjectURL(url)
}

export async function exportXlsx(filename: string, heads: string[], rows: (string | number)[][], companyName = "WarehouseOS", chartData: { label: string; value: number; value2?: number; color: string }[] = [], chartLabel = "") {
  const exportDate = getExportDate()
  const wsRows = [
    ["Company", companyName],
    ["Report", getReportTitle(filename)],
    ["Exported", exportDate],
    [],
    heads,
    ...rows,
  ]
  const { default: ExcelJS } = await import("exceljs")
  const workbook = new ExcelJS.Workbook()
  const reportSheet = workbook.addWorksheet("Report")
  wsRows.forEach(row => reportSheet.addRow(row.map(sanitizeSpreadsheetCell)))
  reportSheet.getRow(5).font = { bold: true, color: { argb: "FFFFFFFF" } }
  reportSheet.getRow(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } }
  reportSheet.columns.forEach(column => { column.width = 18 })
  if (chartData.length) {
    const chartSheet = workbook.addWorksheet("Chart")
    chartSheet.addRow([sanitizeSpreadsheetCell(chartLabel)])
    chartSheet.addRow(["Label", "Value", ...(chartData.some(item => item.value2 !== undefined) ? ["Value 2"] : [])])
    chartData.forEach(item => chartSheet.addRow([sanitizeSpreadsheetCell(item.label), item.value, ...(item.value2 !== undefined ? [item.value2] : [])]))
    chartSheet.getRow(2).font = { bold: true }
    chartSheet.columns.forEach(column => { column.width = 18 })
    const canvas = document.createElement("canvas")
    canvas.width = 1000
    canvas.height = 480
    const context = canvas.getContext("2d")
    if (context) {
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = "#0f172a"
    context.font = "bold 22px sans-serif"
    context.fillText(chartLabel, 48, 42)
    const max = Math.max(...chartData.flatMap(item => [item.value, item.value2 ?? 0]), 1)
    const plotHeight = 350
    const barWidth = Math.max(16, Math.min(56, 720 / chartData.length))
    chartData.forEach((item, index) => {
      const x = 60 + index * (880 / chartData.length)
      const height = item.value / max * plotHeight
      context.fillStyle = item.color || "#2563eb"
      context.fillRect(x, 410 - height, barWidth, height)
      if (item.value2 !== undefined) {
        context.fillStyle = "#10b981"
        context.fillRect(x + barWidth + 4, 410 - item.value2 / max * plotHeight, barWidth, item.value2 / max * plotHeight)
      }
      context.fillStyle = "#475569"
      context.font = "12px sans-serif"
      context.save()
      context.translate(x + barWidth / 2, 432)
      context.rotate(-0.35)
      context.fillText(item.label, 0, 0)
      context.restore()
    })
      const imageId = workbook.addImage({ base64: canvas.toDataURL("image/png"), extension: "png" })
      chartSheet.addImage(imageId, { tl: { col: 4, row: 0 }, ext: { width: 720, height: 345 } })
    }
  }
  await saveExcelWorkbook(workbook, filename)
}

export function printTable(filename: string, heads: string[], rows: (string | number)[][], companyName = "WarehouseOS") {
  const title = getReportTitle(filename)
  const exportDate = getExportDate()
  const htmlRows = rows.map(row => `
      <tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>
    `).join("")
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  body { margin: 20px; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; }
  .header { margin-bottom: 16px; }
  .company { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
  .report-title { font-size: 15px; color: #334155; margin-bottom: 2px; }
  .meta { font-size: 12px; color: #64748b; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { border: 1px solid #cbd5e1; padding: 10px 12px; text-align: left; vertical-align: top; }
  th { background: #f8fafc; color: #334155; font-weight: 700; }
  @media print { body { margin: 10mm; } }
</style>
</head>
<body>
  <div class="header">
    <div class="company">${escapeHtml(companyName)}</div>
    <div class="report-title">${escapeHtml(title)}</div>
    <div class="meta">Exported: ${escapeHtml(exportDate)}</div>
  </div>
  <table>
    <thead>
      <tr>${heads.map(head => `<th>${escapeHtml(head)}</th>`).join('')}</tr>
    </thead>
    <tbody>${htmlRows}</tbody>
  </table>
  <script>window.print()</script>
</body>
</html>`
  const printWindow = window.open("", "_blank", "width=900,height=700")
  if (!printWindow) return
  printWindow.document.write(html)
  printWindow.document.close()
}

// --- Report Detail Modal ---
interface ReportData {
  title: string
  kpis: { label: string; value: string; sub?: string; trend?: "up" | "down" }[]
  chartLabel: string
  chartType: "bar" | "line" | "pie"
  chartData: { label: string; value: number; value2?: number; color: string }[]
  tableHeads: string[]
  tableRows: (string | number)[][]
}

interface LiveReportContext {
  balance: any[]
  ledger: any[]
  products: any[]
  salesOrders: any[]
  purchases: any[]
  receipts: any[]
  deliveries: any[]
  invoices: any[]
  cashBook: any[]
}

function buildReportData(key: string, lang: string, live?: LiveReportContext): ReportData {
  const vi = lang === "vi"
  const all: Record<string, ReportData> = {
    "Doanh thu tổng hợp": {
      title: vi ? "Báo cáo Doanh thu tổng hợp" : "Revenue Summary",
      kpis: [
        { label: vi ? "Tổng doanh thu" : "Total Revenue", value: "405.050.000 ₫", sub: "+18% vs T7", trend: "up" },
        { label: vi ? "Số đơn hàng" : "Orders", value: "48", sub: "+12% vs T7", trend: "up" },
        { label: vi ? "Giá trị trung bình" : "Avg Order Value", value: "8.438.542 ₫", trend: "up" },
        { label: vi ? "Hoàn trả" : "Returns", value: "2", sub: "4.2% tỷ lệ hoàn", trend: "down" },
      ],
      chartLabel: vi ? "Doanh thu theo ngày (triệu ₫)" : "Daily Revenue (M₫)",
      chartType: "bar",
      chartData: [
        { label: "01/8", value: 12, color: "#3b82f6" }, { label: "02/8", value: 18, color: "#3b82f6" },
        { label: "03/8", value: 9, color: "#3b82f6" },  { label: "04/8", value: 24, color: "#3b82f6" },
        { label: "05/8", value: 15, color: "#3b82f6" }, { label: "06/8", value: 8, color: "#3b82f6" },
        { label: "07/8", value: 31, color: "#3b82f6" }, { label: "08/8", value: 22, color: "#3b82f6" },
        { label: "09/8", value: 28, color: "#3b82f6" }, { label: "10/8", value: 35, color: "#3b82f6" },
      ],
      tableHeads: vi ? ["Mã SO", "Khách hàng", "Sản phẩm", "Doanh thu", "Lãi gộp", "Trạng thái"] : ["SO", "Customer", "Products", "Revenue", "Gross Profit", "Status"],
      tableRows: [
        ["SO-202608-000048", "FPT Telecom", "2 SP", "52.000.000", "18.200.000", vi ? "Hoàn tất" : "Completed"],
        ["SO-202608-000047", "VNPT Group", "3 SP", "98.500.000", "34.475.000", vi ? "Hoàn tất" : "Completed"],
        ["SO-202608-000046", "Viettel Store", "1 SP", "175.000.000", "52.500.000", vi ? "Đang giao" : "Delivering"],
        ["SO-202608-000045", "Nguyen Kim Corp", "4 SP", "43.000.000", "15.050.000", vi ? "Chờ duyệt" : "Pending"],
        ["SO-202608-000044", "Thegioididong", "2 SP", "36.550.000", "12.792.500", vi ? "Hoàn tất" : "Completed"],
      ],
    },
    "Lãi gộp": {
      title: vi ? "Báo cáo Lãi gộp" : "Gross Profit Report",
      kpis: [
        { label: vi ? "Tổng doanh thu" : "Revenue", value: "405.050.000 ₫", trend: "up" },
        { label: vi ? "Giá vốn (COGS)" : "COGS", value: "263.282.500 ₫" },
        { label: vi ? "Lãi gộp" : "Gross Profit", value: "141.767.500 ₫", trend: "up" },
        { label: vi ? "Biên lợi nhuận" : "Gross Margin", value: "35.0%", sub: "+2.3% vs T7", trend: "up" },
      ],
      chartLabel: vi ? "Doanh thu vs Lãi gộp theo tháng (triệu ₫)" : "Revenue vs Gross Profit by Month (M₫)",
      chartType: "bar",
      chartData: [
        { label: vi ? "T4" : "Apr", value: 285, value2: 97, color: "#3b82f6" },
        { label: vi ? "T5" : "May", value: 312, value2: 106, color: "#3b82f6" },
        { label: vi ? "T6" : "Jun", value: 290, value2: 94, color: "#3b82f6" },
        { label: vi ? "T7" : "Jul", value: 342, value2: 112, color: "#3b82f6" },
        { label: vi ? "T8" : "Aug", value: 405, value2: 141, color: "#10b981" },
      ],
      tableHeads: vi ? ["Danh mục", "Doanh thu", "Giá vốn", "Lãi gộp", "Biên LN"] : ["Category", "Revenue", "COGS", "Gross Profit", "Margin"],
      tableRows: [
        ["Laptop", "185.000.000", "120.000.000", "65.000.000", "35.1%"],
        ["Phone", "98.500.000", "66.000.000", "32.500.000", "33.0%"],
        ["Monitor", "52.000.000", "36.000.000", "16.000.000", "30.8%"],
        ["Storage", "43.000.000", "28.500.000", "14.500.000", "33.7%"],
        ["Keyboard", "26.550.000", "12.782.500", "13.767.500", "51.8%"],
      ],
    },
    "Xếp hạng khách hàng": {
      title: vi ? "Xếp hạng khách hàng" : "Customer Ranking",
      kpis: [
        { label: vi ? "Tổng khách hàng" : "Total Customers", value: "156" },
        { label: vi ? "KH mới T8" : "New Customers Aug", value: "8", trend: "up" },
        { label: vi ? "KH mua lại" : "Returning Customers", value: "72%", trend: "up" },
        { label: vi ? "Top KH chiếm" : "Top 5 share", value: "64%", trend: "up" },
      ],
      chartLabel: vi ? "Doanh thu top 5 khách hàng (triệu ₫)" : "Top 5 Customer Revenue (M₫)",
      chartType: "bar",
      chartData: [
        { label: "Viettel", value: 175, color: "#3b82f6" },
        { label: "VNPT", value: 98, color: "#8b5cf6" },
        { label: "FPT", value: 52, color: "#06b6d4" },
        { label: "NK Corp", value: 43, color: "#10b981" },
        { label: "Thegioididong", value: 36, color: "#f59e0b" },
      ],
      tableHeads: vi ? ["#", "Khách hàng", "Số đơn", "Doanh thu", "Công nợ", "Trạng thái"] : ["#", "Customer", "Orders", "Revenue", "Debt", "Status"],
      tableRows: [
        ["1", "Viettel Store", "12", "175.000.000", "192.500.000", "Active"],
        ["2", "VNPT Group", "8", "98.500.000", "58.350.000", "Active"],
        ["3", "FPT Telecom", "6", "52.000.000", "0", "Active"],
        ["4", "Nguyen Kim Corp", "5", "43.000.000", "47.300.000", "Active"],
        ["5", "Thegioididong", "4", "36.550.000", "0", "Active"],
      ],
    },
    "Xếp hạng sản phẩm": {
      title: vi ? "Xếp hạng sản phẩm bán chạy" : "Top Selling Products",
      kpis: [
        { label: vi ? "Tổng SKU bán" : "SKUs Sold", value: "28" },
        { label: vi ? "Số lượng bán" : "Units Sold", value: "142 chiếc" },
        { label: vi ? "SP bán chạy nhất" : "Best Seller", value: "Dell Latitude" },
        { label: vi ? "Danh mục hot" : "Hot Category", value: "Laptop" },
      ],
      chartLabel: vi ? "Doanh thu top 6 sản phẩm (triệu ₫)" : "Top 6 Products Revenue (M₫)",
      chartType: "bar",
      chartData: [
        { label: "Dell L5540", value: 65, color: "#3b82f6" }, { label: "MacBook", value: 58, color: "#8b5cf6" },
        { label: "Galaxy S24", value: 42, color: "#06b6d4" }, { label: "LG 34\"", value: 28, color: "#10b981" },
        { label: "MX Keys", value: 18, color: "#f59e0b" }, { label: "WD 2TB", value: 14, color: "#ef4444" },
      ],
      tableHeads: vi ? ["#", "SKU", "Sản phẩm", "SL bán", "Doanh thu", "Biên LN"] : ["#", "SKU", "Product", "Qty", "Revenue", "Margin"],
      tableRows: [
        ["1", "LP-DELL-001", "Dell Latitude 5540", "13", "65.000.000", "35.1%"],
        ["2", "LP-MAC-001", "MacBook Pro M3", "5", "58.000.000", "28.3%"],
        ["3", "PH-SAM-001", "Samsung Galaxy S24", "14", "42.000.000", "30.0%"],
        ["4", "MN-LG-001", "LG UltraWide 34\"", "8", "28.000.000", "30.8%"],
        ["5", "KB-LOG-001", "Logitech MX Keys", "31", "18.600.000", "51.6%"],
      ],
    },
    "Doanh thu theo nhân viên": {
      title: vi ? "Doanh thu theo nhân viên" : "Sales by Employee",
      kpis: [
        { label: vi ? "Nhân viên bán hàng" : "Sales Staff", value: "6" },
        { label: vi ? "Tổng doanh thu" : "Total Revenue", value: "405.050.000 ₫" },
        { label: vi ? "TB mỗi NV" : "Avg per Staff", value: "67.508.333 ₫" },
        { label: vi ? "NV xuất sắc" : "Top Performer", value: "Trần Thị B" },
      ],
      chartLabel: vi ? "Doanh thu theo nhân viên (triệu ₫)" : "Revenue by Employee (M₫)",
      chartType: "bar",
      chartData: [
        { label: "Trần Thị B", value: 98, color: "#10b981" }, { label: "Nguyễn A", value: 85, color: "#3b82f6" },
        { label: "Lê Văn C", value: 72, color: "#8b5cf6" }, { label: "Phạm D", value: 65, color: "#06b6d4" },
        { label: "Hoàng E", value: 52, color: "#f59e0b" }, { label: "Đặng F", value: 33, color: "#ef4444" },
      ],
      tableHeads: vi ? ["Nhân viên", "Số đơn", "Doanh thu", "% Tổng", "Đạt KPI"] : ["Employee", "Orders", "Revenue", "% Total", "KPI"],
      tableRows: [
        ["Trần Thị B", "15", "98.000.000", "24.2%", "✓ 122%"],
        ["Nguyễn Văn A", "12", "85.000.000", "21.0%", "✓ 106%"],
        ["Lê Văn C", "10", "72.000.000", "17.8%", "✓ 90%"],
        ["Phạm Thị D", "7", "65.000.000", "16.0%", "✓ 81%"],
        ["Hoàng Văn E", "3", "52.000.000", "12.8%", "✗ 65%"],
      ],
    },
    "Tồn kho hiện tại": {
      title: vi ? "Báo cáo Tồn kho hiện tại" : "Stock Balance Report",
      kpis: [
        { label: vi ? "Tổng SKU" : "Total SKUs", value: "86", sub: vi ? "đang hoạt động" : "active" },
        { label: vi ? "Giá trị tồn kho" : "Inventory Value", value: "8.42 tỷ ₫", trend: "up" },
        { label: vi ? "Hết hàng" : "Out of Stock", value: "4 SKU", sub: vi ? "cần nhập gấp" : "urgent", trend: "down" },
        { label: vi ? "Sắp hết" : "Low Stock", value: "12 SKU", sub: vi ? "dưới mức tối thiểu" : "below min" },
      ],
      chartLabel: vi ? "Tồn kho theo danh mục (chiếc)" : "Stock by Category (units)",
      chartType: "bar",
      chartData: [
        { label: "Laptop", value: 45, color: "#3b82f6" }, { label: "Phone", value: 32, color: "#8b5cf6" },
        { label: "Monitor", value: 28, color: "#06b6d4" }, { label: "Keyboard", value: 65, color: "#10b981" },
        { label: "Storage", value: 18, color: "#f59e0b" }, { label: "Memory", value: 54, color: "#ef4444" },
      ],
      tableHeads: vi ? ["SKU", "Sản phẩm", "Kho", "Tồn kho", "Tồn tối thiểu", "Giá trị"] : ["SKU", "Product", "Warehouse", "Qty", "Min Stock", "Value"],
      tableRows: [
        ["LP-DELL-001", "Dell Latitude 5540", "HN-01", "23", "10", "667.000.000"],
        ["PH-SAM-001", "Samsung Galaxy A54", "HCM-01", "45", "20", "360.000.000"],
        ["MN-LG-001", "LG UltraWide 34\"", "HN-01", "8", "5", "88.000.000"],
        ["KB-LOG-001", "Logitech MX Keys", "DN-01", "2", "10", "5.800.000"],
        ["LP-MAC-001", "MacBook Pro M3 14\"", "HN-01", "5", "10", "145.000.000"],
      ],
    },
    "Sổ kho": {
      title: vi ? "Sổ kho (Stock Ledger)" : "Stock Ledger",
      kpis: [
        { label: vi ? "Số giao dịch" : "Transactions", value: "234", sub: "T8/2026" },
        { label: vi ? "Nhập kho" : "Stock In", value: "189 chiếc", trend: "up" },
        { label: vi ? "Xuất kho" : "Stock Out", value: "142 chiếc" },
        { label: vi ? "Tồn cuối kỳ" : "Closing Stock", value: "47 chiếc" },
      ],
      chartLabel: vi ? "Nhập/Xuất kho theo ngày" : "Stock In/Out by Day",
      chartType: "line",
      chartData: [
        { label: "01", value: 25, value2: 18, color: "#3b82f6" }, { label: "02", value: 0, value2: 22, color: "#3b82f6" },
        { label: "03", value: 45, value2: 12, color: "#3b82f6" }, { label: "04", value: 0, value2: 30, color: "#3b82f6" },
        { label: "05", value: 35, value2: 15, color: "#3b82f6" }, { label: "06", value: 84, value2: 25, color: "#3b82f6" },
      ],
      tableHeads: vi ? ["Ngày", "Chứng từ", "Sản phẩm", "Nhập", "Xuất", "Tồn"] : ["Date", "Reference", "Product", "In", "Out", "Balance"],
      tableRows: [
        ["2026-08-04", "GRN-202608-0012", "Dell Latitude 5540", "10", "0", "23"],
        ["2026-08-03", "DN-202608-0021", "Logitech MX Keys", "0", "5", "2"],
        ["2026-08-03", "GRN-202608-0011", "Samsung Galaxy A54", "20", "0", "45"],
        ["2026-08-02", "DN-202608-0019", "MacBook Pro M3", "0", "3", "5"],
        ["2026-08-01", "TF-202608-0006", "LG UltraWide 34\"", "8", "0", "8"],
      ],
    },
    "Giá trị tồn kho": {
      title: vi ? "Giá trị tồn kho" : "Inventory Value",
      kpis: [
        { label: vi ? "Tổng giá trị" : "Total Value", value: "8.42 tỷ ₫", trend: "up" },
        { label: vi ? "Giá trị nhập kho" : "At Cost", value: "6.85 tỷ ₫" },
        { label: vi ? "Giá trị bán lẻ" : "At Retail", value: "12.3 tỷ ₫" },
        { label: vi ? "Biên tiềm năng" : "Potential Margin", value: "44.5%" },
      ],
      chartLabel: vi ? "Giá trị tồn kho theo danh mục (tỷ ₫)" : "Inventory Value by Category (B₫)",
      chartType: "bar",
      chartData: [
        { label: "Laptop", value: 5.2, color: "#3b82f6" }, { label: "Phone", value: 1.4, color: "#8b5cf6" },
        { label: "Monitor", value: 0.88, color: "#06b6d4" }, { label: "Storage", value: 0.42, color: "#10b981" },
        { label: "Memory", value: 0.32, color: "#f59e0b" }, { label: "Other", value: 0.16, color: "#ef4444" },
      ],
      tableHeads: vi ? ["Danh mục", "Số SKU", "SL tồn", "Giá nhập TB", "Giá trị"] : ["Category", "SKUs", "Qty", "Avg Cost", "Total Value"],
      tableRows: [
        ["Laptop", "18", "73", "71.232.877", "5.200.000.000"],
        ["Phone", "12", "108", "12.962.963", "1.400.000.000"],
        ["Monitor", "8", "36", "24.444.444", "880.000.000"],
        ["Storage", "15", "84", "5.000.000", "420.000.000"],
        ["Memory", "11", "112", "2.857.143", "320.000.000"],
      ],
    },
    "Tồn kho thấp": {
      title: vi ? "Báo cáo Tồn kho thấp" : "Low Stock Report",
      kpis: [
        { label: vi ? "SKU hết hàng" : "Out of Stock", value: "4", trend: "down" },
        { label: vi ? "SKU sắp hết" : "Low Stock", value: "12", trend: "down" },
        { label: vi ? "Giá trị cần nhập" : "Reorder Value", value: "520 triệu ₫" },
        { label: vi ? "NCC cần liên hệ" : "Suppliers to Contact", value: "5" },
      ],
      chartLabel: vi ? "Tồn kho vs Mức tối thiểu" : "Stock vs Minimum Level",
      chartType: "bar",
      chartData: [
        { label: "MX Keys", value: 2, value2: 10, color: "#ef4444" },
        { label: "MacBook", value: 5, value2: 10, color: "#ef4444" },
        { label: "WD 2TB", value: 6, value2: 15, color: "#f59e0b" },
        { label: "Kingston", value: 8, value2: 20, color: "#f59e0b" },
        { label: "LG 32\"", value: 3, value2: 5, color: "#10b981" },
      ],
      tableHeads: vi ? ["SKU", "Sản phẩm", "Tồn kho", "Tồn tối thiểu", "Thiếu", "Đề xuất nhập"] : ["SKU", "Product", "Stock", "Min", "Shortage", "Suggested PO"],
      tableRows: [
        ["KB-LOG-001", "Logitech MX Keys", "2", "10", "-8", "20 chiếc"],
        ["LP-MAC-001", "MacBook Pro M3", "5", "10", "-5", "15 chiếc"],
        ["ST-WD-002", "WD Blue 2TB SSD", "6", "15", "-9", "30 chiếc"],
        ["MM-KST-001", "Kingston DDR5 16GB", "8", "20", "-12", "40 chiếc"],
        ["NW-TPLINK-001", "TP-Link AX3000", "0", "5", "-5", "10 chiếc"],
      ],
    },
    "Hàng chậm luân chuyển": {
      title: vi ? "Hàng chậm luân chuyển" : "Slow Moving Items",
      kpis: [
        { label: vi ? "SKU chậm (>90 ngày)" : "Slow Moving (>90d)", value: "14" },
        { label: vi ? "Giá trị bị tồn đọng" : "Tied-up Value", value: "1.2 tỷ ₫" },
        { label: vi ? "Ngày tồn kho TB" : "Avg Days in Stock", value: "127 ngày" },
        { label: vi ? "Nguy cơ lỗi thời" : "Obsolescence Risk", value: "3 SKU" },
      ],
      chartLabel: vi ? "Số ngày tồn kho top 5 mặt hàng chậm" : "Days in Stock - Top 5 Slow Movers",
      chartType: "bar",
      chartData: [
        { label: "UPS APC", value: 210, color: "#ef4444" }, { label: "Cisco SW", value: 185, color: "#ef4444" },
        { label: "APC PDU", value: 162, color: "#f59e0b" }, { label: "3Com NIC", value: 145, color: "#f59e0b" },
        { label: "VGA Cable", value: 128, color: "#f59e0b" },
      ],
      tableHeads: vi ? ["SKU", "Sản phẩm", "Tồn kho", "Ngày tồn", "Giá trị", "Đề xuất"] : ["SKU", "Product", "Qty", "Days", "Value", "Action"],
      tableRows: [
        ["PW-APC-002", "APC UPS 1500VA", "8", "210", "144.000.000", vi ? "Giảm giá 15%" : "Discount 15%"],
        ["NW-CSC-001", "Cisco SG350-28", "3", "185", "27.000.000", vi ? "Trả NCC" : "Return to Supplier"],
        ["PW-APC-003", "APC PDU 8-port", "5", "162", "25.000.000", vi ? "Giảm giá 10%" : "Discount 10%"],
        ["NW-3COM-001", "3Com NIC 1Gbps", "12", "145", "7.200.000", vi ? "Thanh lý" : "Write-off"],
      ],
    },
    "Hàng nhanh luân chuyển": {
      title: vi ? "Hàng nhanh luân chuyển" : "Fast Moving Items",
      kpis: [
        { label: vi ? "SKU nhanh (<30 ngày)" : "Fast Moving (<30d)", value: "22" },
        { label: vi ? "Vòng quay tồn kho" : "Inventory Turnover", value: "12.4x", trend: "up" },
        { label: vi ? "Ngày tồn kho TB" : "Avg Days in Stock", value: "29 ngày" },
        { label: vi ? "Tỷ lệ fill rate" : "Fill Rate", value: "94.2%", trend: "up" },
      ],
      chartLabel: vi ? "Vòng quay tồn kho top 5 mặt hàng" : "Inventory Turnover - Top 5 Fast Movers",
      chartType: "bar",
      chartData: [
        { label: "Galaxy A54", value: 28, color: "#10b981" }, { label: "MX Master", value: 24, color: "#10b981" },
        { label: "USB-C Hub", value: 22, color: "#3b82f6" }, { label: "Kingston 16G", value: 19, color: "#3b82f6" },
        { label: "TP-Link AC", value: 16, color: "#3b82f6" },
      ],
      tableHeads: vi ? ["SKU", "Sản phẩm", "SL bán/tháng", "Tồn kho", "Ngày tồn", "Vòng quay"] : ["SKU", "Product", "Sold/Month", "Stock", "Days", "Turnover"],
      tableRows: [
        ["PH-SAM-001", "Samsung Galaxy A54", "28", "45", "16", "28x"],
        ["KB-LOG-002", "Logitech MX Master 3", "18", "22", "18", "24x"],
        ["ACC-USB-001", "USB-C Hub 7-in-1", "45", "60", "20", "22x"],
        ["MM-KST-001", "Kingston DDR5 16GB", "32", "48", "22", "19x"],
        ["NW-TP-001", "TP-Link AC1900", "12", "18", "22", "16x"],
      ],
    },
    "Tổng hợp mua hàng": {
      title: vi ? "Báo cáo Tổng hợp mua hàng" : "Purchase Summary",
      kpis: [
        { label: vi ? "Tổng đơn mua" : "Total POs", value: "12", sub: "T8/2026" },
        { label: vi ? "Giá trị mua hàng" : "Purchase Value", value: "3.09 tỷ ₫", trend: "up" },
        { label: vi ? "Đã thanh toán" : "Paid", value: "269.000.000 ₫" },
        { label: vi ? "Còn phải trả" : "Outstanding", value: "2.642.000.000 ₫" },
      ],
      chartLabel: vi ? "Giá trị mua hàng theo NCC (triệu ₫)" : "Purchase by Supplier (M₫)",
      chartType: "bar",
      chartData: [
        { label: "Apple VN", value: 2250, color: "#8b5cf6" }, { label: "Samsung", value: 392, color: "#3b82f6" },
        { label: "Tech Dist", value: 185, color: "#06b6d4" }, { label: "WD Tech", value: 140, color: "#f59e0b" },
        { label: "Logitech", value: 84, color: "#10b981" },
      ],
      tableHeads: vi ? ["Số ĐM", "Nhà cung cấp", "Ngày", "Giá trị", "Đã TT", "Trạng thái"] : ["PO", "Supplier", "Date", "Value", "Paid", "Status"],
      tableRows: [
        ["PO-202608-000004", "Apple Vietnam", "2026-08-03", "2.250.000.000", "0", vi ? "Chờ duyệt" : "Pending"],
        ["PO-202608-000002", "Samsung Vietnam", "2026-08-02", "392.000.000", "0", vi ? "Một phần" : "Partial"],
        ["PO-202608-000001", "Tech Distributor", "2026-08-01", "185.000.000", "185.000.000", vi ? "Đã trả" : "Paid"],
        ["PO-202607-000044", "WD Technologies", "2026-07-25", "140.000.000", "140.000.000", vi ? "Đã trả" : "Paid"],
      ],
    },
    "Xếp hạng nhà cung cấp": {
      title: vi ? "Xếp hạng nhà cung cấp" : "Supplier Ranking",
      kpis: [
        { label: vi ? "Tổng NCC" : "Total Suppliers", value: "32" },
        { label: vi ? "NCC tích cực" : "Active Suppliers", value: "18" },
        { label: vi ? "Đúng hạn giao" : "On-time Delivery", value: "87%", trend: "up" },
        { label: vi ? "Tỷ lệ lỗi" : "Defect Rate", value: "1.2%", trend: "up" },
      ],
      chartLabel: vi ? "Giá trị mua hàng top 5 NCC (triệu ₫)" : "Top 5 Supplier Purchase Value (M₫)",
      chartType: "bar",
      chartData: [
        { label: "Apple VN", value: 2250, color: "#8b5cf6" }, { label: "Samsung", value: 392, color: "#3b82f6" },
        { label: "Tech Dist", value: 185, color: "#06b6d4" }, { label: "WD Tech", value: 140, color: "#f59e0b" },
        { label: "Logitech", value: 84, color: "#10b981" },
      ],
      tableHeads: vi ? ["#", "Nhà cung cấp", "Số PO", "Giá trị", "Đúng hạn", "Tỷ lệ lỗi"] : ["#", "Supplier", "POs", "Value", "On-time", "Defect Rate"],
      tableRows: [
        ["1", "Apple Vietnam", "3", "2.250.000.000", "100%", "0%"],
        ["2", "Samsung Vietnam", "4", "392.000.000", "75%", "2%"],
        ["3", "Tech Distributor VN", "8", "185.000.000", "88%", "1%"],
        ["4", "WD Technologies", "5", "140.000.000", "100%", "0%"],
        ["5", "Logitech APAC", "6", "84.000.000", "83%", "0.5%"],
      ],
    },
    "Xu hướng mua hàng": {
      title: vi ? "Xu hướng mua hàng theo tháng" : "Purchase Trend",
      kpis: [
        { label: vi ? "Trung bình/tháng" : "Avg Monthly PO", value: "1.8 tỷ ₫" },
        { label: vi ? "T8 so với T7" : "Aug vs Jul", value: "+24%", trend: "up" },
        { label: vi ? "Tổng 6 tháng" : "6-Month Total", value: "10.8 tỷ ₫" },
        { label: vi ? "Dự báo T9" : "Sep Forecast", value: "2.1 tỷ ₫" },
      ],
      chartLabel: vi ? "Giá trị mua hàng 6 tháng gần nhất (triệu ₫)" : "Purchase Value Last 6 Months (M₫)",
      chartType: "line",
      chartData: [
        { label: vi ? "T3" : "Mar", value: 1450, color: "#3b82f6" }, { label: vi ? "T4" : "Apr", value: 1680, color: "#3b82f6" },
        { label: vi ? "T5" : "May", value: 1520, color: "#3b82f6" }, { label: vi ? "T6" : "Jun", value: 1890, color: "#3b82f6" },
        { label: vi ? "T7" : "Jul", value: 2490, color: "#3b82f6" }, { label: vi ? "T8" : "Aug", value: 3091, color: "#10b981" },
      ],
      tableHeads: vi ? ["Tháng", "Số PO", "Giá trị", "vs Tháng trước", "Top NCC"] : ["Month", "POs", "Value", "vs Prior Month", "Top Supplier"],
      tableRows: [
        [vi ? "T3/2026" : "Mar 2026", "8", "1.450.000.000", "—", "Samsung"],
        [vi ? "T4/2026" : "Apr 2026", "10", "1.680.000.000", "+15.9%", "Apple VN"],
        [vi ? "T5/2026" : "May 2026", "9", "1.520.000.000", "-9.5%", "Tech Dist"],
        [vi ? "T6/2026" : "Jun 2026", "11", "1.890.000.000", "+24.3%", "Apple VN"],
        [vi ? "T7/2026" : "Jul 2026", "10", "2.490.000.000", "+31.7%", "Apple VN"],
        [vi ? "T8/2026" : "Aug 2026", "12", "3.091.000.000", "+24.1%", "Apple VN"],
      ],
    },
    "Tổng hợp nhập kho": {
      title: vi ? "Tổng hợp nhập kho (GRN)" : "GRN Summary",
      kpis: [
        { label: vi ? "Tổng phiếu GRN" : "Total GRNs", value: "28" },
        { label: vi ? "Số lượng nhập" : "Units Received", value: "512 chiếc" },
        { label: vi ? "Giá trị nhập" : "Value Received", value: "3.09 tỷ ₫" },
        { label: vi ? "GRN chưa hoàn tất" : "Incomplete GRNs", value: "3" },
      ],
      chartLabel: vi ? "Số lượng nhập kho theo kho" : "Units Received by Warehouse",
      chartType: "bar",
      chartData: [
        { label: "HN-01", value: 245, color: "#3b82f6" }, { label: "HCM-01", value: 188, color: "#8b5cf6" },
        { label: "DN-01", value: 79, color: "#06b6d4" },
      ],
      tableHeads: vi ? ["Số GRN", "Đơn mua", "Nhà cung cấp", "Kho nhập", "SL", "Trạng thái"] : ["GRN", "PO", "Supplier", "Warehouse", "Qty", "Status"],
      tableRows: [
        ["GRN-202608-0012", "PO-202608-000001", "Tech Distributor VN", "HN-01", "45", "Completed"],
        ["GRN-202608-0011", "PO-202608-000002", "Samsung Vietnam", "HCM-01", "80", "Partial"],
        ["GRN-202607-0045", "PO-202607-000045", "Logitech APAC", "DN-01", "120", "Completed"],
        ["GRN-202607-0044", "PO-202607-000044", "WD Technologies", "HN-01", "200", "Completed"],
      ],
    },
    "Lưu chuyển tiền tệ": {
      title: vi ? "Báo cáo Lưu chuyển tiền tệ" : "Cash Flow Report",
      kpis: [
        { label: vi ? "Số dư đầu kỳ" : "Opening Balance", value: "154.942.000 ₫" },
        { label: vi ? "Tổng thu" : "Total Receipts", value: "299.700.000 ₫", trend: "up" },
        { label: vi ? "Tổng chi" : "Total Payments", value: "269.000.000 ₫" },
        { label: vi ? "Số dư cuối kỳ" : "Closing Balance", value: "185.642.000 ₫", trend: "up" },
      ],
      chartLabel: vi ? "Thu chi theo ngày (triệu ₫)" : "Daily Cash Flow (M₫)",
      chartType: "bar",
      chartData: [
        { label: "01/8", value: 192, value2: 0, color: "#10b981" },
        { label: "02/8", value: 0, value2: 185, color: "#ef4444" },
        { label: "03/8", value: 50, value2: 0, color: "#10b981" },
        { label: "04/8", value: 57, value2: 0, color: "#10b981" },
      ],
      tableHeads: vi ? ["Ngày", "Loại", "Diễn giải", "Thu", "Chi", "Số dư"] : ["Date", "Type", "Description", "Receipt", "Payment", "Balance"],
      tableRows: [
        ["2026-08-04", vi ? "Thu" : "In", "CR-202608-0015 – FPT", "57.200.000", "—", "185.642.000"],
        ["2026-08-03", vi ? "Chi" : "Out", "SP-202608-0009 – Tech Dist", "—", "185.000.000", "128.442.000"],
        ["2026-08-03", vi ? "Thu" : "In", "CR-202608-0014 – VNPT", "50.000.000", "—", "313.442.000"],
        ["2026-08-02", vi ? "Thu" : "In", "CR-202608-0013 – Viettel", "192.500.000", "—", "263.442.000"],
      ],
    },
    "Tuổi nợ phải thu": {
      title: vi ? "Báo cáo Tuổi nợ phải thu" : "Receivable Aging Report",
      kpis: [
        { label: vi ? "Tổng phải thu" : "Total Receivables", value: "298.150.000 ₫" },
        { label: vi ? "Chưa đến hạn" : "Not Due", value: "192.500.000 ₫" },
        { label: vi ? "Quá hạn <30 ngày" : "Overdue <30d", value: "58.350.000 ₫", trend: "down" },
        { label: vi ? "Quá hạn >30 ngày" : "Overdue >30d", value: "47.300.000 ₫", trend: "down" },
      ],
      chartLabel: vi ? "Phân bổ nợ phải thu theo tuổi nợ" : "Receivable by Aging Bucket",
      chartType: "bar",
      chartData: [
        { label: vi ? "Chưa đến hạn" : "Not Due", value: 192, color: "#10b981" },
        { label: vi ? "1-30 ngày" : "1-30 days", value: 58, color: "#f59e0b" },
        { label: vi ? "31-60 ngày" : "31-60 days", value: 30, color: "#ef4444" },
        { label: vi ? ">60 ngày" : ">60 days", value: 17, color: "#7f1d1d" },
      ],
      tableHeads: vi ? ["Khách hàng", "Chưa hạn", "1-30 ngày", "31-60 ngày", ">60 ngày", "Tổng"] : ["Customer", "Current", "1-30d", "31-60d", ">60d", "Total"],
      tableRows: [
        ["Viettel Store", "192.500.000", "0", "0", "0", "192.500.000"],
        ["VNPT Group", "0", "58.350.000", "0", "0", "58.350.000"],
        ["Nguyen Kim Corp", "0", "0", "30.000.000", "17.300.000", "47.300.000"],
      ],
    },
    "Tuổi nợ phải trả": {
      title: vi ? "Báo cáo Tuổi nợ phải trả" : "Payable Aging Report",
      kpis: [
        { label: vi ? "Tổng phải trả" : "Total Payables", value: "2.642.000.000 ₫" },
        { label: vi ? "Chưa đến hạn" : "Not Due", value: "2.250.000.000 ₫" },
        { label: vi ? "Quá hạn" : "Overdue", value: "392.000.000 ₫", trend: "down" },
        { label: vi ? "Sắp đến hạn (<7 ngày)" : "Due Soon (<7d)", value: "392.000.000 ₫" },
      ],
      chartLabel: vi ? "Phân bổ nợ phải trả (triệu ₫)" : "Payable Aging Buckets (M₫)",
      chartType: "bar",
      chartData: [
        { label: vi ? "Chưa đến hạn" : "Not Due", value: 2250, color: "#10b981" },
        { label: vi ? "1-30 ngày" : "1-30d", value: 392, color: "#f59e0b" },
      ],
      tableHeads: vi ? ["Nhà cung cấp", "Số ĐM", "Ngày đến hạn", "Phải trả", "Trạng thái"] : ["Supplier", "PO", "Due Date", "Amount", "Status"],
      tableRows: [
        ["Apple Vietnam", "PO-202608-000004", "2026-09-02", "2.250.000.000", vi ? "Chưa đến hạn" : "Not Due"],
        ["Samsung Vietnam", "PO-202608-000002", "2026-09-01", "392.000.000", vi ? "Sắp đến hạn" : "Due Soon"],
      ],
    },
    "Sổ quỹ ngày": {
      title: vi ? "Sổ quỹ ngày 04/08/2026" : "Daily Cash Book - 04 Aug 2026",
      kpis: [
        { label: vi ? "Số dư đầu ngày" : "Opening Balance", value: "128.442.000 ₫" },
        { label: vi ? "Tổng thu" : "Total In", value: "57.200.000 ₫", trend: "up" },
        { label: vi ? "Tổng chi" : "Total Out", value: "0 ₫" },
        { label: vi ? "Số dư cuối ngày" : "Closing Balance", value: "185.642.000 ₫", trend: "up" },
      ],
      chartLabel: vi ? "Biến động số dư trong ngày" : "Balance Movement During the Day",
      chartType: "line",
      chartData: [
        { label: "08:00", value: 128, color: "#3b82f6" }, { label: "08:15", value: 185, color: "#10b981" },
        { label: "12:00", value: 185, color: "#10b981" }, { label: "17:00", value: 185, color: "#10b981" },
      ],
      tableHeads: vi ? ["Giờ", "Loại", "Diễn giải", "Thu", "Chi", "Số dư"] : ["Time", "Type", "Description", "In", "Out", "Balance"],
      tableRows: [
        ["08:15", vi ? "Thu" : "In", "CR-202608-0015 – FPT Telecom", "57.200.000", "—", "185.642.000"],
      ],
    },
    "Tổng hợp chi phí": {
      title: vi ? "Tổng hợp chi phí" : "Expense Summary",
      kpis: [
        { label: vi ? "Tổng chi phí" : "Total Expenses", value: "52.300.000 ₫" },
        { label: vi ? "Chi phí vận hành" : "Operating Costs", value: "38.000.000 ₫" },
        { label: vi ? "Chi phí bán hàng" : "Selling Costs", value: "9.800.000 ₫" },
        { label: vi ? "Chi phí quản lý" : "Admin Costs", value: "4.500.000 ₫" },
      ],
      chartLabel: vi ? "Chi phí theo loại (triệu ₫)" : "Expense by Type (M₫)",
      chartType: "bar",
      chartData: [
        { label: vi ? "Vận hành" : "Operating", value: 38, color: "#3b82f6" },
        { label: vi ? "Bán hàng" : "Selling", value: 9.8, color: "#8b5cf6" },
        { label: vi ? "Quản lý" : "Admin", value: 4.5, color: "#06b6d4" },
      ],
      tableHeads: vi ? ["Danh mục", "T6", "T7", "T8", "Thay đổi"] : ["Category", "Jun", "Jul", "Aug", "Change"],
      tableRows: [
        [vi ? "Lương nhân viên" : "Salaries", "28.000.000", "29.500.000", "31.000.000", "+5.1%"],
        [vi ? "Thuê mặt bằng" : "Rent", "5.000.000", "5.000.000", "5.000.000", "0%"],
        [vi ? "Vận chuyển" : "Logistics", "1.500.000", "2.000.000", "2.000.000", "0%"],
        [vi ? "Marketing" : "Marketing", "800.000", "1.200.000", "1.800.000", "+50%"],
      ],
    },
  }
  const report = all[key]
  if (live && (key === "Tồn kho hiện tại" || key === "Stock Balance")) {
    const rows = live.balance
    const totalQty = rows.reduce((sum, row) => sum + Number(row.qty ?? 0), 0)
    const totalValue = rows.reduce((sum, row) => sum + Number(row.value ?? 0), 0)
    const grouped = rows.reduce<Record<string, number>>((groups, row) => {
      const label = String(row.product_name ?? row.product ?? "Unknown")
      groups[label] = (groups[label] ?? 0) + Number(row.qty ?? 0)
      return groups
    }, {})
    return {
      ...report,
      kpis: [
        { label: lang === "vi" ? "Tổng SKU" : "Total SKUs", value: String(new Set(rows.map(row => row.sku)).size) },
        { label: lang === "vi" ? "Tổng số lượng" : "Total Units", value: fmt(totalQty) },
        { label: lang === "vi" ? "Giá trị tồn kho" : "Inventory Value", value: `${fmt(totalValue)} ₫` },
        { label: lang === "vi" ? "Hết hàng" : "Out of Stock", value: String(rows.filter(row => Number(row.qty ?? 0) <= 0).length) },
      ],
      chartData: Object.entries(grouped).slice(0, 8).map(([label, value], index) => ({ label, value, color: ["#2563eb", "#10b981", "#f59e0b", "#ef4444"][index % 4] })),
      tableHeads: vi ? ["SKU", "Sản phẩm", "Kho", "Tồn", "Tối thiểu", "Giá trị"] : ["SKU", "Product", "Warehouse", "Stock", "Minimum", "Value"],
      tableRows: rows.map(row => [row.sku ?? "", row.product_name ?? "", row.warehouse_name ?? "", Number(row.qty ?? 0), Number(row.min_qty ?? 0), Number(row.value ?? 0)]),
    }
  }
  if (live && (key === "Sổ kho" || key === "Stock Ledger")) {
    const rows = live.ledger
    const daily = rows.reduce<Record<string, { value: number; value2: number }>>((groups, row) => {
      const label = row.created_at ? formatDateKeyUtc7(row.created_at) : "-"
      groups[label] ??= { value: 0, value2: 0 }
      groups[label].value += Number(row.qty_in ?? 0)
      groups[label].value2 += Number(row.qty_out ?? 0)
      return groups
    }, {})
    const closing = live.balance.reduce((sum, row) => sum + Number(row.qty ?? 0), 0)
    return {
      ...report,
      kpis: [
        { label: lang === "vi" ? "Số giao dịch" : "Transactions", value: fmt(rows.length) },
        { label: lang === "vi" ? "Nhập kho" : "Stock In", value: fmt(rows.reduce((sum, row) => sum + Number(row.qty_in ?? 0), 0)) },
        { label: lang === "vi" ? "Xuất kho" : "Stock Out", value: fmt(rows.reduce((sum, row) => sum + Number(row.qty_out ?? 0), 0)) },
        { label: lang === "vi" ? "Tồn cuối kỳ" : "Closing Stock", value: fmt(closing) },
      ],
      chartData: Object.entries(daily).slice(-14).map(([label, values]) => ({ label, value: values.value, value2: values.value2, color: "#2563eb" })),
      tableHeads: vi ? ["Ngày", "Chứng từ", "Sản phẩm", "Nhập", "Xuất", "Tồn"] : ["Date", "Reference", "Product", "In", "Out", "Balance"],
      tableRows: rows.slice(0, 200).map(row => [row.created_at ? formatDateTimeUtc7(row.created_at) : "", row.ref ?? "", row.product_name ?? "", Number(row.qty_in ?? 0), Number(row.qty_out ?? 0), Number(row.balance ?? 0)]),
    }
  }
  if (live && (key === "Giá trị tồn kho" || key === "Inventory Value")) {
    const productById = new Map(live.products.map(product => [String(product.id), product]))
    const groups = live.balance.reduce<Record<string, { sku: Set<string>; qty: number; value: number; retail: number }>>((result, row) => {
      const product = productById.get(String(row.product_id)) as any
      const category = String(product?.category ?? (vi ? "Khác" : "Other"))
      result[category] ??= { sku: new Set(), qty: 0, value: 0, retail: 0 }
      result[category].sku.add(String(row.sku ?? row.product_id ?? ""))
      result[category].qty += Number(row.qty ?? 0)
      result[category].value += Number(row.value ?? 0)
      result[category].retail += Number(row.qty ?? 0) * Number(product?.price ?? 0)
      return result
    }, {})
    const rows = Object.entries(groups).sort((a, b) => b[1].value - a[1].value)
    const totalValue = rows.reduce((sum, [, value]) => sum + value.value, 0)
    const retailValue = rows.reduce((sum, [, value]) => sum + value.retail, 0)
    return { ...report, kpis: [{ label: vi ? "Tổng giá trị" : "Total Value", value: `${fmt(totalValue)} ₫` }, { label: vi ? "Giá bán lẻ dự kiến" : "Potential Retail", value: `${fmt(retailValue)} ₫` }, { label: vi ? "Biên tiềm năng" : "Potential Margin", value: `${retailValue ? ((retailValue - totalValue) / retailValue * 100).toFixed(1) : "0.0"}%` }, { label: vi ? "Số danh mục" : "Categories", value: fmt(rows.length) }], chartData: rows.slice(0, 12).map(([label, value], index) => ({ label, value: value.value / 1000000000, color: ["#2563eb", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444"][index % 6] })), tableHeads: vi ? ["Danh mục", "Số SKU", "SL tồn", "Giá nhập TB", "Giá trị"] : ["Category", "SKUs", "Qty", "Avg Cost", "Total Value"], tableRows: rows.map(([category, value]) => [category, value.sku.size, value.qty, fmt(value.qty ? value.value / value.qty : 0), fmt(value.value)]) }
  }
  if (live && (key === "Tồn kho thấp" || key === "Low Stock")) {
    const productById = new Map(live.products.map(product => [String(product.id), product]))
    const stock = live.balance.reduce<Record<string, { sku: string; name: string; qty: number; min: number; cost: number }>>((result, row) => {
      const id = String(row.product_id ?? row.sku ?? "")
      const product = productById.get(String(row.product_id)) as any
      result[id] ??= { sku: row.sku ?? product?.sku ?? "", name: row.product_name ?? product?.name ?? "", qty: 0, min: Number(product?.min_qty ?? 0), cost: Number(product?.cost ?? 0) }
      result[id].qty += Number(row.qty ?? 0)
      return result
    }, {})
    const rows = Object.values(stock).filter(row => row.min > 0 && row.qty <= row.min).sort((a, b) => (a.qty - a.min) - (b.qty - b.min))
    const reorderValue = rows.reduce((sum, row) => sum + Math.max(0, row.min - row.qty) * row.cost, 0)
    return { ...report, kpis: [{ label: vi ? "SKU hết hàng" : "Out of Stock", value: fmt(rows.filter(row => row.qty <= 0).length) }, { label: vi ? "SKU dưới mức tối thiểu" : "Below Minimum", value: fmt(rows.length) }, { label: vi ? "Giá trị cần nhập tối thiểu" : "Minimum Reorder Value", value: `${fmt(reorderValue)} ₫` }], chartData: rows.slice(0, 12).map(row => ({ label: row.name, value: row.qty, value2: row.min, color: row.qty <= 0 ? "#ef4444" : "#f59e0b" })), tableHeads: vi ? ["SKU", "Sản phẩm", "Tồn kho", "Tồn tối thiểu", "Thiếu", "Giá trị cần nhập"] : ["SKU", "Product", "Stock", "Minimum", "Shortage", "Reorder Value"], tableRows: rows.map(row => [row.sku, row.name, row.qty, row.min, Math.max(0, row.min - row.qty), fmt(Math.max(0, row.min - row.qty) * row.cost)]) }
  }
  if (live && (key === "Hàng chậm luân chuyển" || key === "Slow Moving" || key === "Hàng nhanh luân chuyển" || key === "Fast Moving")) {
    const productById = new Map(live.products.map(product => [String(product.id), product]))
    const stockByProduct = live.balance.reduce<Record<string, { sku: string; name: string; qty: number; value: number }>>((result, row) => {
      const id = String(row.product_id ?? row.sku ?? "")
      result[id] ??= { sku: row.sku ?? "", name: row.product_name ?? "", qty: 0, value: 0 }
      result[id].qty += Number(row.qty ?? 0)
      result[id].value += Number(row.value ?? 0)
      return result
    }, {})
    const soldByProduct = live.deliveries.flatMap(delivery => delivery.items ?? []).reduce<Record<string, number>>((result, item) => { const id = String(item.product_id ?? item.sku ?? ""); result[id] = (result[id] ?? 0) + Number(item.qty ?? 0); return result }, {})
    const isFast = key === "Hàng nhanh luân chuyển" || key === "Fast Moving"
    const rows = Object.entries(stockByProduct).map(([id, stock]) => ({ ...stock, sold: soldByProduct[id] ?? 0, min: Number((productById.get(id) as any)?.min_qty ?? 0) })).filter(row => isFast ? row.sold > 0 : row.qty > 0 && row.sold === 0).sort((a, b) => isFast ? b.sold - a.sold : b.value - a.value)
    return { ...report, kpis: [{ label: isFast ? (vi ? "SKU có xuất kho" : "SKUs with Sales") : (vi ? "SKU chưa xuất trong kỳ" : "No Sales in Period"), value: fmt(rows.length) }, { label: vi ? "Số lượng tồn" : "Stock on Hand", value: fmt(rows.reduce((sum, row) => sum + row.qty, 0)) }, { label: vi ? "Số lượng đã bán" : "Units Sold", value: fmt(rows.reduce((sum, row) => sum + row.sold, 0)) }], chartData: rows.slice(0, 12).map(row => ({ label: row.name, value: isFast ? row.sold : row.value / 1000000, color: isFast ? "#10b981" : "#f59e0b" })), tableHeads: vi ? ["SKU", "Sản phẩm", "Đã bán trong kỳ", "Tồn kho", "Mức tối thiểu", "Giá trị tồn"] : ["SKU", "Product", "Sold in Period", "Stock", "Minimum", "Stock Value"], tableRows: rows.map(row => [row.sku, row.name, row.sold, row.qty, row.min, fmt(row.value)]) }
  }
  if (live && (key === "Doanh thu tổng hợp" || key === "Revenue Summary")) {
    const rows = live.invoices.filter(row => !["cancelled", "void"].includes(String(row.status).toLowerCase()))
    const total = rows.reduce((sum, row) => sum + Number(row.total ?? row.amount ?? 0), 0)
    const daily = rows.reduce<Record<string, number>>((groups, row) => { const label = row.created_at ? formatDateKeyUtc7(row.created_at) : "-"; groups[label] = (groups[label] ?? 0) + Number(row.total ?? row.amount ?? 0); return groups }, {})
    return { ...report, kpis: [{ label: vi ? "Tổng doanh thu" : "Total Revenue", value: `${fmt(total)} ₫` }, { label: vi ? "Số hóa đơn" : "Invoices", value: fmt(rows.length) }, { label: vi ? "Giá trị trung bình" : "Average", value: `${fmt(rows.length ? total / rows.length : 0)} ₫` }, { label: vi ? "Phiếu giao" : "Deliveries", value: fmt(live.deliveries.length) }], chartData: Object.entries(daily).slice(-14).map(([label, value]) => ({ label, value: value / 1000000, color: "#2563eb" })), tableHeads: vi ? ["Hóa đơn", "Khách hàng", "Phiếu giao", "Doanh thu", "Trạng thái"] : ["Invoice", "Customer", "Delivery", "Revenue", "Status"], tableRows: rows.slice(0, 200).map(row => [row.ref ?? "", row.customer_name ?? "", row.delivery_ref ?? "", fmt(Number(row.total ?? row.amount ?? 0)), row.status ?? ""]) }
  }
  if (live && (key === "Lãi gộp" || key === "Gross Profit")) {
    const lines = live.deliveries.flatMap(row => (row.items ?? []).map((item: any) => ({ ...item, date: row.created_at })))
    const revenue = lines.reduce((sum, item) => sum + Number(item.qty ?? 0) * Number(item.unit_price ?? 0), 0)
    const cost = lines.reduce((sum, item) => sum + Number(item.qty ?? 0) * Number(item.unit_cost ?? 0), 0)
    const profit = revenue - cost
    return { ...report, kpis: [{ label: vi ? "Doanh thu" : "Revenue", value: `${fmt(revenue)} ₫` }, { label: vi ? "Giá vốn" : "COGS", value: `${fmt(cost)} ₫` }, { label: vi ? "Lãi gộp" : "Gross Profit", value: `${fmt(profit)} ₫` }, { label: vi ? "Biên lợi nhuận" : "Margin", value: `${revenue ? (profit / revenue * 100).toFixed(1) : "0.0"}%` }], chartData: [{ label: vi ? "Doanh thu" : "Revenue", value: revenue / 1000000, value2: profit / 1000000, color: "#2563eb" }], tableHeads: vi ? ["Sản phẩm", "Doanh thu", "Giá vốn", "Lãi gộp"] : ["Product", "Revenue", "COGS", "Gross Profit"], tableRows: lines.slice(0, 200).map(item => [item.product_name ?? "", fmt(Number(item.qty ?? 0) * Number(item.unit_price ?? 0)), fmt(Number(item.qty ?? 0) * Number(item.unit_cost ?? 0)), fmt(Number(item.qty ?? 0) * (Number(item.unit_price ?? 0) - Number(item.unit_cost ?? 0)))]) }
  }
  if (live && (key === "Xếp hạng khách hàng" || key === "Customer Ranking")) {
    const grouped = live.invoices.filter(row => !["cancelled", "void"].includes(String(row.status).toLowerCase())).reduce<Record<string, { name: string; orders: number; revenue: number; debt: number }>>((result, row) => {
      const id = String(row.customer_id ?? row.customer_name ?? "Unknown")
      result[id] ??= { name: row.customer_name ?? "Unknown", orders: 0, revenue: 0, debt: 0 }
      result[id].orders += 1
      result[id].revenue += Number(row.total ?? row.amount ?? 0)
      result[id].debt += Number(row.outstanding_amount ?? 0)
      return result
    }, {})
    const rows = Object.values(grouped).sort((a, b) => b.revenue - a.revenue)
    const total = rows.reduce((sum, row) => sum + row.revenue, 0)
    return { ...report, kpis: [{ label: vi ? "Khách hàng có doanh thu" : "Revenue Customers", value: fmt(rows.length) }, { label: vi ? "Tổng doanh thu" : "Total Revenue", value: `${fmt(total)} ₫` }, { label: vi ? "Top 5 chiếm" : "Top 5 Share", value: `${total ? (rows.slice(0, 5).reduce((sum, row) => sum + row.revenue, 0) / total * 100).toFixed(1) : "0.0"}%` }, { label: vi ? "Tổng công nợ" : "Outstanding", value: `${fmt(rows.reduce((sum, row) => sum + row.debt, 0))} ₫` }], chartData: rows.slice(0, 10).map((row, index) => ({ label: row.name, value: row.revenue / 1000000, color: ["#2563eb", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b"][index % 5] })), tableHeads: vi ? ["#", "Khách hàng", "Số hóa đơn", "Doanh thu", "Công nợ"] : ["#", "Customer", "Invoices", "Revenue", "Outstanding"], tableRows: rows.map((row, index) => [index + 1, row.name, row.orders, fmt(row.revenue), fmt(row.debt)]) }
  }
  if (live && (key === "Xếp hạng sản phẩm" || key === "Product Ranking")) {
    const grouped = live.deliveries.flatMap(delivery => delivery.items ?? []).reduce<Record<string, { sku: string; name: string; qty: number; revenue: number; cost: number }>>((result, item) => {
      const id = String(item.product_id ?? item.sku ?? "Unknown")
      result[id] ??= { sku: item.sku ?? "", name: item.product_name ?? "Unknown", qty: 0, revenue: 0, cost: 0 }
      result[id].qty += Number(item.qty ?? 0)
      result[id].revenue += Number(item.qty ?? 0) * Number(item.unit_price ?? 0)
      result[id].cost += Number(item.qty ?? 0) * Number(item.unit_cost ?? 0)
      return result
    }, {})
    const rows = Object.values(grouped).sort((a, b) => b.qty - a.qty)
    return { ...report, kpis: [{ label: vi ? "SKU đã bán" : "SKUs Sold", value: fmt(rows.length) }, { label: vi ? "Số lượng bán" : "Units Sold", value: fmt(rows.reduce((sum, row) => sum + row.qty, 0)) }, { label: vi ? "Sản phẩm bán chạy nhất" : "Best Seller", value: rows[0]?.name ?? "—" }, { label: vi ? "Doanh thu" : "Revenue", value: `${fmt(rows.reduce((sum, row) => sum + row.revenue, 0))} ₫` }], chartData: rows.slice(0, 10).map((row, index) => ({ label: row.name, value: row.revenue / 1000000, color: ["#2563eb", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b"][index % 5] })), tableHeads: vi ? ["#", "SKU", "Sản phẩm", "SL bán", "Doanh thu", "Biên LN"] : ["#", "SKU", "Product", "Qty", "Revenue", "Margin"], tableRows: rows.map((row, index) => [index + 1, row.sku, row.name, row.qty, fmt(row.revenue), `${row.revenue ? ((row.revenue - row.cost) / row.revenue * 100).toFixed(1) : "0.0"}%`]) }
  }
  if (live && (key === "Doanh thu theo nhân viên" || key === "Sales by Employee")) {
    const grouped = live.salesOrders.filter(row => !["cancelled", "rejected"].includes(String(row.status).toLowerCase())).reduce<Record<string, { name: string; orders: number; revenue: number }>>((result, row) => {
      const name = String(row.created_by ?? row.createdBy ?? (vi ? "Không xác định" : "Unknown"))
      result[name] ??= { name, orders: 0, revenue: 0 }
      result[name].orders += 1
      result[name].revenue += Number(row.total ?? 0)
      return result
    }, {})
    const rows = Object.values(grouped).sort((a, b) => b.revenue - a.revenue)
    const total = rows.reduce((sum, row) => sum + row.revenue, 0)
    return { ...report, kpis: [{ label: vi ? "Nhân viên bán hàng" : "Sales Staff", value: fmt(rows.length) }, { label: vi ? "Giá trị đơn bán" : "Sales Order Value", value: `${fmt(total)} ₫` }, { label: vi ? "TB mỗi nhân viên" : "Average per Staff", value: `${fmt(rows.length ? total / rows.length : 0)} ₫` }, { label: vi ? "Nhân viên dẫn đầu" : "Top Performer", value: rows[0]?.name ?? "—" }], chartData: rows.slice(0, 10).map((row, index) => ({ label: row.name, value: row.revenue / 1000000, color: ["#10b981", "#2563eb", "#8b5cf6", "#06b6d4"][index % 4] })), tableHeads: vi ? ["Nhân viên", "Số đơn", "Giá trị đơn", "% Tổng"] : ["Employee", "Orders", "Order Value", "% Total"], tableRows: rows.map(row => [row.name, row.orders, fmt(row.revenue), `${total ? (row.revenue / total * 100).toFixed(1) : "0.0"}%`]) }
  }
  if (live && (key === "Tổng hợp mua hàng" || key === "Purchase Summary")) {
    const rows = live.purchases.filter(row => !["cancelled", "rejected"].includes(String(row.status).toLowerCase()))
    const total = rows.reduce((sum, row) => sum + Number(row.total ?? 0), 0)
    return { ...report, kpis: [{ label: vi ? "Tổng mua hàng" : "Purchase Value", value: `${fmt(total)} ₫` }, { label: vi ? "Số đơn mua" : "Purchase Orders", value: fmt(rows.length) }, { label: vi ? "Phiếu nhập" : "Receipts", value: fmt(live.receipts.length) }], chartData: rows.slice(0, 14).map(row => ({ label: row.ref ?? "-", value: Number(row.total ?? 0) / 1000000, color: "#7c3aed" })), tableHeads: vi ? ["Đơn mua", "Nhà cung cấp", "Kho", "Giá trị", "Trạng thái"] : ["PO", "Supplier", "Warehouse", "Value", "Status"], tableRows: rows.slice(0, 200).map(row => [row.ref ?? "", row.supplier_name ?? row.supplier ?? "", row.warehouse_name ?? row.warehouse ?? "", fmt(Number(row.total ?? 0)), row.status ?? ""]) }
  }
  if (live && (key === "Xếp hạng nhà cung cấp" || key === "Supplier Ranking")) {
    const grouped = live.purchases.filter(row => !["cancelled", "rejected"].includes(String(row.status).toLowerCase())).reduce<Record<string, { name: string; orders: number; value: number; paid: number }>>((result, row) => {
      const id = String(row.supplier_id ?? row.supplier_name ?? "Unknown")
      result[id] ??= { name: row.supplier_name ?? row.supplier ?? "Unknown", orders: 0, value: 0, paid: 0 }
      result[id].orders += 1
      result[id].value += Number(row.total ?? 0)
      result[id].paid += Number(row.paid_amount ?? 0)
      return result
    }, {})
    const rows = Object.values(grouped).sort((a, b) => b.value - a.value)
    return { ...report, kpis: [{ label: vi ? "Nhà cung cấp" : "Suppliers", value: fmt(rows.length) }, { label: vi ? "Tổng giá trị mua" : "Purchase Value", value: `${fmt(rows.reduce((sum, row) => sum + row.value, 0))} ₫` }, { label: vi ? "Đã thanh toán" : "Paid", value: `${fmt(rows.reduce((sum, row) => sum + row.paid, 0))} ₫` }], chartData: rows.slice(0, 10).map((row, index) => ({ label: row.name, value: row.value / 1000000, color: ["#8b5cf6", "#2563eb", "#06b6d4", "#f59e0b", "#10b981"][index % 5] })), tableHeads: vi ? ["#", "Nhà cung cấp", "Số PO", "Giá trị", "Đã thanh toán"] : ["#", "Supplier", "POs", "Value", "Paid"], tableRows: rows.map((row, index) => [index + 1, row.name, row.orders, fmt(row.value), fmt(row.paid)]) }
  }
  if (live && (key === "Xu hướng mua hàng" || key === "Purchase Trend")) {
    const grouped = live.purchases.filter(row => !["cancelled", "rejected"].includes(String(row.status).toLowerCase())).reduce<Record<string, { count: number; value: number; suppliers: Record<string, number> }>>((result, row) => {
      const monthKey = formatDateKeyUtc7(row.date ?? row.created_at).slice(0, 7) || "Unknown"
      result[monthKey] ??= { count: 0, value: 0, suppliers: {} }
      result[monthKey].count += 1
      result[monthKey].value += Number(row.total ?? 0)
      const supplier = String(row.supplier_name ?? row.supplier ?? "Unknown")
      result[monthKey].suppliers[supplier] = (result[monthKey].suppliers[supplier] ?? 0) + Number(row.total ?? 0)
      return result
    }, {})
    const rows = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b))
    const total = rows.reduce((sum, [, value]) => sum + value.value, 0)
    return { ...report, kpis: [{ label: vi ? "Số tháng có dữ liệu" : "Months", value: fmt(rows.length) }, { label: vi ? "Trung bình/tháng" : "Monthly Average", value: `${fmt(rows.length ? total / rows.length : 0)} ₫` }, { label: vi ? "Tổng trong kỳ" : "Period Total", value: `${fmt(total)} ₫` }], chartData: rows.map(([label, value]) => ({ label, value: value.value / 1000000, color: "#7c3aed" })), tableHeads: vi ? ["Tháng", "Số PO", "Giá trị", "Nhà cung cấp lớn nhất"] : ["Month", "POs", "Value", "Top Supplier"], tableRows: rows.map(([monthKey, value]) => [monthKey, value.count, fmt(value.value), Object.entries(value.suppliers).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—"]) }
  }
  if (live && (key === "Tổng hợp nhập kho" || key === "GRN Summary")) {
    const rows = live.receipts
    const receiptQty = (receipt: any) => (receipt.items_detail ?? []).reduce((sum: number, item: any) => sum + Number(item.qty ?? 0), 0)
    const receiptValue = (receipt: any) => (receipt.items_detail ?? []).reduce((sum: number, item: any) => sum + Number(item.qty ?? 0) * Number(item.unit_cost ?? 0), 0)
    const warehouses = rows.reduce<Record<string, number>>((result, row) => { const name = String(row.warehouse_name ?? "Unknown"); result[name] = (result[name] ?? 0) + receiptQty(row); return result }, {})
    return { ...report, kpis: [{ label: vi ? "Tổng phiếu nhập" : "Total GRNs", value: fmt(rows.length) }, { label: vi ? "Số lượng nhập" : "Units Received", value: fmt(rows.reduce((sum, row) => sum + receiptQty(row), 0)) }, { label: vi ? "Giá trị nhập" : "Value Received", value: `${fmt(rows.reduce((sum, row) => sum + receiptValue(row), 0))} ₫` }, { label: vi ? "Phiếu chưa hoàn tất" : "Incomplete", value: fmt(rows.filter(row => !["completed"].includes(String(row.status).toLowerCase())).length) }], chartData: Object.entries(warehouses).map(([label, value], index) => ({ label, value, color: ["#2563eb", "#8b5cf6", "#06b6d4"][index % 3] })), tableHeads: vi ? ["Phiếu nhập", "Đơn mua/Báo giá", "Nhà cung cấp", "Kho", "Số lượng", "Trạng thái"] : ["GRN", "PO/Quotation", "Supplier", "Warehouse", "Qty", "Status"], tableRows: rows.map(row => [row.ref ?? "", row.po_ref ?? "", row.supplier_name ?? "", row.warehouse_name ?? "", receiptQty(row), row.status ?? ""]) }
  }
  if (live && (key === "Lưu chuyển tiền tệ" || key === "Cash Flow" || key === "Sổ quỹ ngày" || key === "Daily Cash Book")) {
    const rows = live.cashBook
    const receipts = rows.filter(row => String(row.type).toLowerCase() === "receipt").reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
    const payments = rows.filter(row => String(row.type).toLowerCase() === "payment").reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
    return { ...report, kpis: [{ label: vi ? "Thu" : "Receipts", value: `${fmt(receipts)} ₫` }, { label: vi ? "Chi" : "Payments", value: `${fmt(payments)} ₫` }, { label: vi ? "Số dư" : "Balance", value: `${fmt(calculateCashBalance(rows))} ₫` }], chartData: rows.slice(0, 14).map(row => ({ label: row.ref ?? "-", value: Number(row.amount ?? 0), color: String(row.type).toLowerCase() === "receipt" ? "#10b981" : "#ef4444" })), tableHeads: vi ? ["Ngày", "Loại", "Diễn giải", "Thu", "Chi", "Số dư"] : ["Date", "Type", "Description", "In", "Out", "Balance"], tableRows: rows.slice(0, 200).map(row => [row.created_at ? formatDateTimeUtc7(row.created_at) : "", row.type ?? "", row.description ?? "", String(row.type).toLowerCase() === "receipt" ? fmt(Number(row.amount ?? 0)) : "", String(row.type).toLowerCase() === "payment" ? fmt(Number(row.amount ?? 0)) : "", fmt(Number(row.balance ?? 0))]) }
  }
  if (live && (key === "Tổng hợp chi phí" || key === "Expense Summary")) {
    const payments = live.cashBook.filter(row => String(row.type).toLowerCase() === "payment")
    const grouped = payments.reduce<Record<string, { count: number; amount: number }>>((result, row) => {
      const label = String(row.method ?? row.description ?? (vi ? "Thanh toán" : "Payment"))
      result[label] ??= { count: 0, amount: 0 }
      result[label].count += 1
      result[label].amount += Number(row.amount ?? 0)
      return result
    }, {})
    const rows = Object.entries(grouped).sort((a, b) => b[1].amount - a[1].amount)
    const total = rows.reduce((sum, [, value]) => sum + value.amount, 0)
    return { ...report, kpis: [{ label: vi ? "Tổng chi" : "Total Expenses", value: `${fmt(total)} ₫` }, { label: vi ? "Số khoản chi" : "Payments", value: fmt(payments.length) }, { label: vi ? "Khoản chi trung bình" : "Average Payment", value: `${fmt(payments.length ? total / payments.length : 0)} ₫` }], chartData: rows.map(([label, value], index) => ({ label, value: value.amount / 1000000, color: ["#ef4444", "#f59e0b", "#8b5cf6", "#2563eb"][index % 4] })), tableHeads: vi ? ["Nhóm chi", "Số giao dịch", "Số tiền"] : ["Expense Group", "Transactions", "Amount"], tableRows: rows.map(([label, value]) => [label, value.count, fmt(value.amount)]) }
  }
  if (live && (key === "Tuổi nợ phải thu" || key === "Receivable Aging")) {
    const rows = live.invoices.filter(row => Number(row.outstanding_amount ?? Math.max(0, Number(row.total ?? 0) - Number(row.paid_amount ?? 0))) > 0 && !["cancelled", "void"].includes(String(row.status).toLowerCase()))
    const buckets = buildAgingBuckets(rows, ["outstanding_amount", "remaining", "outstanding", "total", "amount"])
    const total = Object.values(buckets).reduce((sum, value) => sum + value, 0)
    return { ...report, kpis: [{ label: vi ? "Tổng phải thu" : "Total Receivable", value: `${fmt(total)} ₫` }, { label: vi ? "Hóa đơn mở" : "Open Invoices", value: fmt(rows.length) }], chartData: Object.entries(buckets).map(([label, value]) => ({ label, value: value / 1000000, color: "#f59e0b" })), tableHeads: vi ? ["Hóa đơn", "Khách hàng", "Đến hạn", "Còn phải thu", "Trạng thái"] : ["Invoice", "Customer", "Due", "Outstanding", "Status"], tableRows: rows.slice(0, 200).map(row => [row.ref ?? "", row.customer_name ?? "", row.due_date ?? row.due ?? row.created_at ?? "", fmt(Number(row.outstanding_amount ?? row.remaining ?? row.outstanding ?? row.total ?? row.amount ?? 0)), row.status ?? ""]) }
  }
  if (live && (key === "Tuổi nợ phải trả" || key === "Payable Aging")) {
    const rows = live.purchases.filter(row => Number(row.outstanding_amount ?? Math.max(0, Number(row.total ?? 0) - Number(row.paid_amount ?? 0))) > 0 && !["cancelled", "rejected"].includes(String(row.status).toLowerCase()))
    const buckets = buildAgingBuckets(rows, ["outstanding_amount", "remaining", "outstanding", "total"])
    const total = Object.values(buckets).reduce((sum, value) => sum + value, 0)
    return { ...report, kpis: [{ label: vi ? "Tổng phải trả" : "Total Payable", value: `${fmt(total)} ₫` }, { label: vi ? "Đơn mua mở" : "Open POs", value: fmt(rows.length) }], chartData: Object.entries(buckets).map(([label, value]) => ({ label, value: value / 1000000, color: "#ef4444" })), tableHeads: vi ? ["Đơn mua", "Nhà cung cấp", "Đến hạn", "Còn phải trả", "Trạng thái"] : ["PO", "Supplier", "Due", "Outstanding", "Status"], tableRows: rows.slice(0, 200).map(row => [row.ref ?? "", row.supplier_name ?? row.supplier ?? "", row.due_date ?? row.due ?? row.created_at ?? "", fmt(Number(row.outstanding_amount ?? row.remaining ?? row.outstanding ?? row.total ?? 0)), row.payment_status ?? row.status ?? ""]) }
  }
  if (live) return {
    title: report?.title ?? key,
    kpis: [{ label: lang === "vi" ? "Không có nguồn dữ liệu phù hợp" : "No compatible data source", value: "—" }],
    chartLabel: "", chartType: "bar" as const, chartData: [],
    tableHeads: [], tableRows: [],
  }
  return report ?? {
    title: key,
    kpis: [{ label: lang === "vi" ? "Đang phát triển" : "Coming soon", value: "—" }],
    chartLabel: "", chartType: "bar" as const, chartData: [],
    tableHeads: [], tableRows: [],
  }
}

function ReportDetailModal({ reportKey, onClose, lang, live, canExport }: { reportKey: string; onClose: () => void; lang: string; live?: LiveReportContext; canExport: boolean }) {
  const data = buildReportData(reportKey, lang, live)
  const vi = lang === "vi"
  const chartRows = data.chartData.map(d => ({ name: d.label, [vi ? "Giá trị" : "Value"]: d.value, ...(d.value2 !== undefined ? { [vi ? "Giá trị 2" : "Value 2"]: d.value2 } : {}) }))
  const hasValue2 = data.chartData.some(d => d.value2 !== undefined)
  const filename = data.title.replace(/\s+/g, "_")

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-sm font-semibold text-slate-900">{data.title}</h2>
          <div className="flex items-center gap-2">
            {canExport && <button
              onClick={() => exportCsv(filename, data.tableHeads, data.tableRows)}
              className="flex items-center gap-1 h-7 px-2.5 rounded-lg border text-xs text-slate-600 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}
            >
              <Download size={12} /> CSV
            </button>}
            {canExport && <button
              onClick={() => exportXlsx(filename, data.tableHeads, data.tableRows, "WarehouseOS", data.chartData, data.chartLabel)}
              className="flex items-center gap-1 h-7 px-2.5 rounded-lg border text-xs text-emerald-700 hover:bg-emerald-50" style={{ borderColor: "var(--border)" }}
            >
              <FileSpreadsheet size={12} /> Excel
            </button>}
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"><X size={14} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* KPIs */}
          <div className="grid grid-cols-4 gap-3 p-4 border-b" style={{ borderColor: "var(--border)" }}>
            {data.kpis.map(k => (
              <div key={k.label} className="bg-slate-50 rounded-xl p-3">
                <div className="text-[10px] text-slate-400 mb-0.5">{k.label}</div>
                <div className="text-sm font-bold text-slate-900 mono">{k.value}</div>
                {k.sub && (
                  <div className={`flex items-center gap-0.5 mt-1 text-[10px] font-medium ${k.trend === "up" ? "text-emerald-600" : k.trend === "down" ? "text-red-500" : "text-slate-400"}`}>
                    {k.trend === "up" ? <TrendingUp size={10} /> : k.trend === "down" ? <TrendingDown size={10} /> : null}
                    {k.sub}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Recharts Chart */}
          {data.chartData.length > 0 && (
            <div className="px-4 pt-4 pb-2 border-b" style={{ borderColor: "var(--border)" }}>
              <div className="text-xs font-semibold text-slate-600 mb-3">{data.chartLabel}</div>
              <ResponsiveContainer width="100%" height={200}>
                {data.chartType === "line" ? (
                  <LineChart data={chartRows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={40} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    {hasValue2 && <Legend iconSize={10} wrapperStyle={{ fontSize: 10 }} />}
                    <Line type="monotone" dataKey={vi ? "Giá trị" : "Value"} stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    {hasValue2 && <Line type="monotone" dataKey={vi ? "Giá trị 2" : "Value 2"} stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />}
                  </LineChart>
                ) : (
                  <BarChart data={chartRows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={40} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    {hasValue2 && <Legend iconSize={10} wrapperStyle={{ fontSize: 10 }} />}
                    <Bar dataKey={vi ? "Giá trị" : "Value"} fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={40} />
                    {hasValue2 && <Bar dataKey={vi ? "Giá trị 2" : "Value 2"} fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={40} />}
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          )}

          {/* Data Table */}
          {data.tableHeads.length > 0 && (
            <div className="p-4">
              <div className="text-xs font-semibold text-slate-600 mb-2">{vi ? "Chi tiết" : "Details"}</div>
              <div className="border rounded-xl overflow-hidden" style={{ borderColor: "var(--border)" }}>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
                      {data.tableHeads.map(h => <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {data.tableRows.length === 0 ? (
                      <tr><td colSpan={data.tableHeads.length} className="px-3 py-8 text-center text-xs text-slate-400">{vi ? "Không có dữ liệu trong phạm vi đã chọn" : "No data for the selected filters"}</td></tr>
                    ) : data.tableRows.map((row, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
                        {row.map((cell, j) => (
                          <td key={j} className={`px-3 py-2 text-slate-700 ${j === 0 ? "mono text-blue-600 font-medium" : ""}`}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Reports ---
export function Reports() {
  const { t, lang } = useLang()
  const { isDemo } = useDemo()
  const { profile, can } = useAuth()
  const currentDateKey = formatDateKeyUtc7()
  const [year, monthNumber] = currentDateKey.split("-").map(Number)
  const month = monthNumber - 1
  const now = new Date(`${currentDateKey}T12:00:00+07:00`)
  const quarterStartMonth = Math.floor(month / 3) * 3
  const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
  const periodOptions = [
    { label: new Intl.DateTimeFormat(lang === "vi" ? "vi-VN" : "en-US", { month: "short", year: "numeric" }).format(now), from: dateKey(new Date(year, month, 1)), to: dateKey(new Date(year, month + 1, 0)) },
    { label: `Q${Math.floor(month / 3) + 1}/${year}`, from: dateKey(new Date(year, quarterStartMonth, 1)), to: dateKey(new Date(year, quarterStartMonth + 3, 0)) },
    { label: lang === "vi" ? `Năm ${year}` : `FY ${year}`, from: `${year}-01-01`, to: `${year}-12-31` },
  ]
  const [period, setPeriod] = useState(0)
  const [activeReport, setActiveReport] = useState<string | null>(null)
  const [liveReports, setLiveReports] = useState<LiveReportContext>({ balance: [], ledger: [], products: [], salesOrders: [], purchases: [], receipts: [], deliveries: [], invoices: [], cashBook: [] })
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [filters, setFilters] = useState(() => ({ from: periodOptions[0].from, to: periodOptions[0].to, warehouseId: "", productId: "", status: "" }))
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const liveMode = !isDemo && Boolean(profile?.org_id)

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError(null)
    Promise.all([
      fetchInventoryBalance({ isDemo, orgId: profile?.org_id }),
      fetchInventoryLedger({ isDemo, orgId: profile?.org_id }),
      fetchSalesOrders({ isDemo, orgId: profile?.org_id }),
      fetchPurchaseOrders({ isDemo, orgId: profile?.org_id }),
      fetchGoodsReceipts({ isDemo, orgId: profile?.org_id }),
      fetchDeliveryNotes({ isDemo, orgId: profile?.org_id }),
      fetchInvoices({ isDemo, orgId: profile?.org_id }),
      fetchCashBook({ isDemo, orgId: profile?.org_id }),
      fetchWarehouses({ isDemo, orgId: profile?.org_id }),
      fetchProducts({ isDemo, orgId: profile?.org_id }),
    ]).then(([balance, ledger, salesOrders, purchases, receipts, deliveries, invoices, cashBook, warehouseResult, productResult]) => {
      const sourceError = [balance, ledger, salesOrders, purchases, receipts, deliveries, invoices, cashBook, warehouseResult, productResult].find(result => result.error)?.error
      if (sourceError) throw sourceError
      const ledgerRows = ledger.data ?? []
      const warehouseMatches = (row: any) => !filters.warehouseId || String(row.warehouse_id ?? "") === filters.warehouseId
      const productMatches = (row: any) => !filters.productId || String(row.product_id ?? "") === filters.productId
      const filteredLedger = filterReportRows(ledgerRows, { ...filters, status: "" })
      const filteredBalanceSource = (balance.data ?? []).filter((row: any) => warehouseMatches(row) && productMatches(row))
      const documentFilters = { ...filters, productId: "" }
      const containsSelectedProduct = (row: any) => !filters.productId || (row.items ?? row.items_detail ?? []).some((item: any) => String(item.product_id ?? "") === filters.productId)
      const filteredPurchases = filterReportRows(purchases.data ?? [], documentFilters).filter(containsSelectedProduct)
      const filteredReceipts = filterReportRows(receipts.data ?? [], documentFilters).filter(containsSelectedProduct)
      const filteredSalesOrders = filterReportRows(salesOrders.data ?? [], documentFilters).filter(containsSelectedProduct)
      const filteredDeliveries = filterReportRows(deliveries.data ?? [], documentFilters).filter(containsSelectedProduct)
      const filteredInvoices = filterReportRows(invoices.data ?? [], { ...filters, warehouseId: "", productId: "" })
      const filteredCashBook = filterReportRows(cashBook.data ?? [], { ...filters, warehouseId: "", productId: "", status: "" })
      const balanceLedgerRows = ledgerRows.filter((row: any) => !filters.to || formatDateKeyUtc7(row.created_at) <= filters.to)
      const derivedBalance = deriveLedgerBalance(balanceLedgerRows)
      const productById = new Map((productResult.data ?? []).map((row: any) => [String(row.id), row]))
      const filteredDerivedBalance = derivedBalance
        .filter((row: any) => warehouseMatches(row) && productMatches(row))
        .map((row: any) => {
          const product = productById.get(String(row.product_id)) as any
          return { ...row, min_qty: Number(product?.min_qty ?? 0), max_qty: Number(product?.max_qty ?? 0) }
        })
      if (active) {
        setWarehouses(warehouseResult.data ?? [])
        setProducts(productResult.data ?? [])
        setLiveReports({ balance: liveMode ? filteredDerivedBalance : (filteredDerivedBalance.length ? filteredDerivedBalance : filteredBalanceSource), ledger: filteredLedger.filter(productMatches), products: productResult.data ?? [], salesOrders: filteredSalesOrders, purchases: filteredPurchases, receipts: filteredReceipts, deliveries: filteredDeliveries, invoices: filteredInvoices, cashBook: filteredCashBook })
        setLoading(false)
      }
    }).catch(error => {
      if (active) { setLoadError(error?.message ?? String(error)); setLoading(false) }
    })
    return () => { active = false }
  }, [isDemo, profile?.org_id, filters.from, filters.to, filters.warehouseId, filters.productId, filters.status])

  const reportCatalog = getReportCatalog(lang, t, {
    skuCount: new Set(liveReports.balance.map(row => row.sku)).size,
    revenueMillions: Math.round(liveReports.invoices.reduce((sum, row) => sum + Number(row.total ?? row.amount ?? 0), 0) / 1000000),
    purchaseCount: liveReports.purchases.length,
    cashMillions: Math.round(calculateCashBalance(liveReports.cashBook) / 1000000),
  })
  const reportCategories = reportCatalog.map(category => ({
    ...category,
    icon: category.icon === "inventory" ? <Layers size={14} className="text-blue-500" /> : category.icon === "sales" ? <TrendingUp size={14} className="text-emerald-500" /> : category.icon === "purchase" ? <ShoppingCart size={14} className="text-violet-500" /> : <CreditCard size={14} className="text-amber-500" />,
  }))

  const summaryKpis = [
    { label: lang === "vi" ? "Doanh thu trong kỳ" : "Period Revenue", value: liveMode ? `${fmt(liveReports.invoices.reduce((sum, row) => sum + Number(row.total ?? row.amount ?? 0), 0) / 1000000)} triệu` : "405 triệu", icon: <TrendingUp size={14} />, color: "text-emerald-600", bg: "bg-emerald-50", trend: liveMode ? "live" : "+18%" },
    { label: lang === "vi" ? "Giá trị tồn kho" : "Inventory Value", value: liveMode ? `${fmt(liveReports.balance.reduce((sum, row) => sum + Number(row.value ?? 0), 0) / 1000000)} triệu` : "8.42 tỷ", icon: <Layers size={14} />, color: "text-blue-600", bg: "bg-blue-50", trend: liveMode ? "live" : "+5%" },
    { label: lang === "vi" ? "Tổng mua hàng" : "Purchase Value", value: liveMode ? `${fmt(liveReports.purchases.reduce((sum, row) => sum + Number(row.total ?? 0), 0) / 1000000)} triệu` : "3.09 tỷ", icon: <ShoppingCart size={14} />, color: "text-violet-600", bg: "bg-violet-50", trend: liveMode ? "live" : "+24%" },
    { label: lang === "vi" ? "Số dư quỹ" : "Cash Balance", value: liveMode ? `${fmt(calculateCashBalance(liveReports.cashBook) / 1000000)} triệu` : "185 triệu", icon: <CreditCard size={14} />, color: "text-amber-600", bg: "bg-amber-50", trend: liveMode ? "live" : "+20%" },
  ]

  return (
    <div className="flex-1 overflow-auto p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold text-slate-900">{lang === "vi" ? "Trung tâm báo cáo" : "Reports Center"}</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>{lang === "vi" ? "Kỳ:" : "Period:"}</span>
            <div className="flex rounded-lg overflow-hidden border text-xs" style={{ borderColor: "var(--border)" }}>
              {periodOptions.map((option, i) => (
                <button key={option.label} onClick={() => { setPeriod(i); setFilters({ ...filters, from: option.from, to: option.to }) }} className={`h-7 px-3 whitespace-nowrap ${period === i ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{option.label}</button>
              ))}
            </div>
          </div>
          {can("Reports", "export") && <button onClick={() => exportXlsx("reports-summary", [lang === "vi" ? "Báo cáo" : "Report", lang === "vi" ? "Giá trị" : "Value"], [
            [lang === "vi" ? "Doanh thu" : "Revenue", liveMode ? liveReports.invoices.reduce((sum, row) => sum + Number(row.total ?? row.amount ?? 0), 0) : 0],
            [lang === "vi" ? "Tồn kho" : "Inventory", liveMode ? liveReports.balance.reduce((sum, row) => sum + Number(row.value ?? 0), 0) : 0],
            [lang === "vi" ? "Mua hàng" : "Purchases", liveMode ? liveReports.purchases.reduce((sum, row) => sum + Number(row.total ?? 0), 0) : 0],
            [lang === "vi" ? "Số dư quỹ" : "Cash Balance", liveMode ? calculateCashBalance(liveReports.cashBook) : 0],
          ])} className="flex items-center gap-1.5 h-7 px-3 rounded-lg border text-xs text-slate-600 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
            <Download size={12} /> {lang === "vi" ? "Xuất tất cả" : "Export All"}
          </button>}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 bg-white border rounded-xl p-3" style={{ borderColor: "var(--border)" }}>
        <label className="text-[10px] font-semibold text-slate-500">{lang === "vi" ? "Từ ngày" : "From"}<input type="date" value={filters.from} onChange={event => setFilters({ ...filters, from: event.target.value })} className="block mt-1 h-8 rounded-lg border px-2 text-xs font-normal" /></label>
        <label className="text-[10px] font-semibold text-slate-500">{lang === "vi" ? "Đến ngày" : "To"}<input type="date" value={filters.to} onChange={event => setFilters({ ...filters, to: event.target.value })} className="block mt-1 h-8 rounded-lg border px-2 text-xs font-normal" /></label>
        <label className="text-[10px] font-semibold text-slate-500">{lang === "vi" ? "Kho" : "Warehouse"}<select value={filters.warehouseId} onChange={event => setFilters({ ...filters, warehouseId: event.target.value })} className="block mt-1 h-8 min-w-44 rounded-lg border px-2 text-xs font-normal"><option value="">{lang === "vi" ? "Tất cả kho" : "All warehouses"}</option>{warehouses.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label className="text-[10px] font-semibold text-slate-500">{lang === "vi" ? "Sản phẩm" : "Product"}<select value={filters.productId} onChange={event => setFilters({ ...filters, productId: event.target.value })} className="block mt-1 h-8 min-w-48 rounded-lg border px-2 text-xs font-normal"><option value="">{lang === "vi" ? "Tất cả sản phẩm" : "All products"}</option>{products.map(row => <option key={row.id} value={row.id}>{row.sku} · {row.name}</option>)}</select></label>
        <label className="text-[10px] font-semibold text-slate-500">{lang === "vi" ? "Trạng thái" : "Status"}<select value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })} className="block mt-1 h-8 min-w-32 rounded-lg border px-2 text-xs font-normal"><option value="">{lang === "vi" ? "Tất cả" : "All"}</option>{["Draft", "Partial", "Completed", "Delivered", "Paid", "Overdue", "Cancelled", "Reversed"].map(status => <option key={status} value={status}>{status}</option>)}</select></label>
        <button onClick={() => setFilters({ from: "", to: "", warehouseId: "", productId: "", status: "" })} className="h-8 px-3 rounded-lg border text-xs text-slate-600 hover:bg-slate-50">{lang === "vi" ? "Xóa lọc" : "Clear"}</button>
        {loading && <span role="status" aria-label={lang === "vi" ? "Đang tải dữ liệu" : "Loading live data"} className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />}
        {loadError && <span className="text-[11px] text-red-600">{loadError}</span>}
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {summaryKpis.map(k => (
          <div key={k.label} className="bg-white border rounded-xl p-4" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between mb-2">
              <div className={`w-8 h-8 rounded-lg ${k.bg} flex items-center justify-center ${k.color}`}>{k.icon}</div>
              <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">{k.trend}</span>
            </div>
            <div className="text-sm font-bold text-slate-900 mono">{k.value} ₫</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Report Categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reportCategories.map(cat => (
          <div key={cat.name} className="bg-white border rounded-xl overflow-hidden" style={{ borderColor: "var(--border)" }}>
            <div className={`px-4 py-3 ${cat.bg} border-b flex items-center justify-between`} style={{ borderColor: cat.border }}>
              <div className="flex items-center gap-2">
                {cat.icon}
                <h3 className={`text-[10px] font-bold uppercase tracking-wider ${cat.color}`}>{cat.name}</h3>
              </div>
              <div className={`flex items-center gap-1 text-[10px] font-medium ${cat.color}`}>
                <TrendingUp size={10} /> {cat.kpi.label}
              </div>
            </div>
            <div className="p-1.5">
              {cat.reports.map((r, i) => (
                <button
                  key={r}
                  onClick={() => setActiveReport(cat.reportKeys[i])}
                  className="w-full flex items-center justify-between h-8 px-2.5 rounded-lg text-xs text-slate-700 hover:bg-slate-50 transition-colors text-left group"
                >
                  <span>{r}</span>
                  <ArrowRight size={12} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {activeReport && (
        <ReportDetailModal reportKey={activeReport} onClose={() => setActiveReport(null)} lang={lang} live={liveMode ? liveReports : undefined} canExport={can("Reports", "export")} />
      )}
    </div>
  )
}

// --- Settings ---
function SettingField({ label, defaultVal, value, onChange, type = "text", hint }: { label: string; defaultVal?: string; value?: string; onChange?: (value: string) => void; type?: string; hint?: string }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-slate-500 mb-1">{label}</label>
      <input type={type} defaultValue={onChange ? undefined : defaultVal} value={onChange ? value : undefined} onChange={e => onChange?.(e.target.value)} className="w-full h-9 px-3 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500/20" style={{ borderColor: "var(--border)" }} />
      {hint && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}
function SaveBtn({ label, onSave }: { label: string; onSave?: () => void | Promise<void> }) {
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  return (
    <button
      disabled={saving}
      onClick={async () => {
        setSaving(true)
        try {
          await onSave?.()
          setSaved(true)
          setTimeout(() => setSaved(false), 2000)
        } catch (error: any) {
          showAppToast(error?.message ?? String(error))
        } finally {
          setSaving(false)
        }
      }}
      className={`h-9 px-5 rounded-lg text-xs font-medium transition-colors disabled:opacity-60 ${saved ? "bg-emerald-600 text-white" : "bg-blue-600 text-white hover:bg-blue-700"}`}
    >
      {saving ? "..." : saved ? "✓ Đã lưu" : label}
    </button>
  )
}

export function Settings() {
  const { t, lang } = useLang()
  const vi = lang === "vi"
  const { profile, can } = useAuth()
  const { isDemo } = useDemo()
  const [company, setCompany] = useState<CompanySettings>(() => loadCompanySettings(profile?.org_id))
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoadError(null)
    if (isDemo) {
      setCompany(loadCompanySettings(profile?.org_id))
      return () => { active = false }
    }
    fetchCompanySettings({ isDemo, orgId: profile?.org_id }).then(result => {
      if (!active) return
      if (result.error) {
        setLoadError(result.error.message ?? String(result.error))
        setCompany(loadCompanySettings(profile?.org_id))
      } else {
        setCompany(result.data)
      }
    })
    return () => { active = false }
  }, [isDemo, profile?.org_id])

  const updateCompany = (key: keyof CompanySettings, value: string) =>
    setCompany(current => ({ ...current, [key]: value }))

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4">
          <h1 className="text-base font-semibold text-slate-900">{vi ? "Cài đặt công ty" : "Company Settings"}</h1>
          <p className="mt-1 text-xs text-slate-500">
            {vi ? "Thông tin này được dùng trên báo giá, chứng từ và file xuất." : "These details are used on quotations, documents, and exports."}
          </p>
        </div>
        <section className="space-y-4 rounded-2xl border bg-white p-5" style={{ borderColor: "var(--border)" }}>
          {loadError && (
            <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {vi ? "Không tải được dữ liệu máy chủ; đang hiển thị bản lưu cục bộ: " : "Server settings could not be loaded; showing the local copy: "}{loadError}
            </div>
          )}
          <SettingField label={vi ? "Tên công ty" : "Company Name"} value={company.name} onChange={value => updateCompany("name", value)} />
          <SettingField label={vi ? "Người đại diện" : "Representative"} value={company.representative} onChange={value => updateCompany("representative", value)} />
          <SettingField label={vi ? "Mã số thuế (MST)" : "Tax ID / VAT Number"} value={company.taxId} onChange={value => updateCompany("taxId", value)} />
          <SettingField label={vi ? "Địa chỉ" : "Address"} value={company.address} onChange={value => updateCompany("address", value)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <SettingField label={vi ? "Điện thoại" : "Phone"} value={company.phone} onChange={value => updateCompany("phone", value)} />
            <SettingField label={vi ? "Email liên hệ" : "Contact Email"} value={company.email} onChange={value => updateCompany("email", value)} type="email" />
          </div>
          <SettingField label="Website" value={company.website} onChange={value => updateCompany("website", value)} />
          <label className="block text-[11px] font-medium text-slate-600">
            {vi ? "Phương pháp tính giá vốn" : "Inventory costing method"}
            <select
              value={company.costingMethod}
              onChange={event => updateCompany("costingMethod", event.target.value)}
              className="mt-1 h-9 w-full rounded-lg border bg-white px-3 text-xs outline-none"
              style={{ borderColor: "var(--border)" }}
            >
              <option value="FIFO">FIFO — {vi ? "nhập trước, xuất trước" : "first in, first out"}</option>
              <option value="MOVING_AVERAGE">{vi ? "Bình quân di động" : "Moving average"}</option>
            </select>
            <span className="mt-1 block text-[10px] font-normal text-slate-400">
              {vi
                ? "Giá vốn thực tế được khóa khi giao hàng; thay đổi này không sửa giá bán trên báo giá hoặc hóa đơn."
                : "Actual COGS is locked at delivery; this does not change quotation or invoice selling prices."}
            </span>
          </label>
          <div className="rounded-xl border bg-slate-50 p-3 text-[11px] text-slate-500" style={{ borderColor: "var(--border)" }}>
            {vi ? "Logo, SMTP, lưu trữ và sao lưu là cấu hình triển khai phía máy chủ, nên không hiển thị nút thao tác khi chưa có backend an toàn." : "Logo, SMTP, storage, and backups are server deployment settings and are not exposed without a secure backend."}
          </div>
          {can("Administration", "update") ? (
            <SaveBtn label={t("saveSettings")} onSave={async () => {
              if (!company.name.trim()) throw new Error(vi ? "Tên công ty là bắt buộc" : "Company name is required")
              const result = await upsertCompanySettings(company, { isDemo, orgId: profile?.org_id })
              if (result.error) throw new Error(result.error.message ?? (vi ? "Không thể lưu thông tin công ty lên máy chủ" : "Could not save company settings to server"))
              saveCompanySettings(company, profile?.org_id)
              setLoadError(null)
            }} />
          ) : (
            <div className="text-xs text-slate-400">{vi ? "Bạn chỉ có quyền xem cài đặt." : "You have read-only access to settings."}</div>
          )}
        </section>
      </div>
    </div>
  )
}

// --- Units (Đơn vị tính) ---
export function Units() {
  const { lang } = useLang();
  const [data, setData] = useState<any[]>([]);
  const { isDemo } = useDemo();
  const { profile } = useAuth();
  useEffect(() => {
    fetchUnits({ isDemo, orgId: profile?.org_id }).then(res => { if (res.data) setData(res.data) })
  }, [isDemo, profile]);
  const columns = lang === "vi" ? [
    { key: "code", label: "CODE", isStatus: false }, { key: "name", label: "NAME", isStatus: false }, { key: "status", label: "STATUS", isStatus: true }
  ] : [
    { key: "code", label: "CODE", isStatus: false }, { key: "name", label: "NAME", isStatus: false }, { key: "status", label: "STATUS", isStatus: true }
  ];
  return <GenericCrudList title={lang === "vi" ? "đơn vị tính" : "unit"} data={data} setData={setData} columns={columns} templateCols={["code","name","status"]} templateFile="units" />;
}

// --- NEXT ---
export function GoodsReceipt() {
  const { lang } = useLang();
  const [data, setData] = useState<any[]>([]);
  const { isDemo } = useDemo();
  const { profile } = useAuth();
  useEffect(() => {
    fetchGoodsReceipts({ isDemo, orgId: profile?.org_id }).then(res => { if (res.data) setData(res.data.map((item:any) => {
      const receiptItems = item.items_detail ?? []
      const batches = Array.from(new Set(receiptItems.map((line: any) => line.batch_number).filter(Boolean)))
      return {
        ...item,
        date: item.created_at ? formatDateTimeUtc7(item.created_at) : "",
        doc_no: item.ref,
        po_no: item.po_ref,
        warehouse: item.warehouse_name,
        supplier: item.supplier_name,
        batch_summary: batches.length ? batches.join(", ") : "—",
        receipt_value: receiptItems.reduce((sum: number, line: any) => sum + Number(line.qty ?? 0) * Number(line.unit_cost ?? 0), 0),
        status: item.status,
      }
    })) })
  }, [isDemo, profile]);
  const columns = lang === "vi" ? [
    { key: "date", label: "DATE", isStatus: false }, { key: "doc_no", label: "DOC_NO", isStatus: false }, { key: "po_no", label: "PO_NO", isStatus: false }, { key: "supplier", label: "SUPPLIER", isStatus: false }, { key: "warehouse", label: "WAREHOUSE", isStatus: false }, { key: "batch_summary", label: "LÔ", isStatus: false }, { key: "receipt_value", label: "GIÁ TRỊ THỰC NHẬP", isStatus: false, format: fmt }, { key: "status", label: "STATUS", isStatus: true }
  ] : [
    { key: "date", label: "DATE", isStatus: false }, { key: "doc_no", label: "DOC_NO", isStatus: false }, { key: "po_no", label: "PO_NO", isStatus: false }, { key: "supplier", label: "SUPPLIER", isStatus: false }, { key: "warehouse", label: "WAREHOUSE", isStatus: false }, { key: "batch_summary", label: "BATCH", isStatus: false }, { key: "receipt_value", label: "ACTUAL RECEIPT VALUE", isStatus: false, format: fmt }, { key: "status", label: "STATUS", isStatus: true }
  ];
  return <GenericCrudList readOnly moduleName="Purchase" title={lang === "vi" ? "nhập kho" : "goods receipt"} data={data} setData={setData} columns={columns} templateCols={["date","doc_no","po_no","supplier","warehouse","batch_summary","receipt_value","status"]} templateFile="goodsreceipt" />;
}

// --- NEXT ---
export function PurchaseReturn() {
  const { lang } = useLang()
  const { isDemo } = useDemo()
  const { profile, can } = useAuth()
  const [data, setData] = useState<any[]>([])
  const [receipts, setReceipts] = useState<any[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const reload = async () => {
    const [returnResult, receiptResult] = await Promise.all([
      fetchPurchaseReturns({ isDemo, orgId: profile?.org_id }),
      fetchGoodsReceipts({ isDemo, orgId: profile?.org_id }),
    ])
    if (returnResult.error ?? receiptResult.error) showAppToast((returnResult.error ?? receiptResult.error)?.message)
    setData(returnResult.data ?? [])
    setReceipts(receiptResult.data ?? [])
  }
  useEffect(() => { void reload() }, [isDemo, profile?.org_id])
  const reverse = async (ref: string) => {
    if (!await confirmAppAction(lang === "vi" ? `Đảo phiếu trả ${ref}?` : `Reverse return ${ref}?`, { destructive: true })) return
    const result = await reversePurchaseReturn(ref, { isDemo, orgId: profile?.org_id })
    if (result.error) return showAppToast(result.error.message ?? String(result.error))
    await reload()
  }
  return <div className="flex h-full flex-col"><Toolbar onCreate={can("Purchase", "create") ? () => setShowCreate(true) : undefined} createLabel={lang === "vi" ? "Tạo phiếu trả NCC" : "Create purchase return"} onRefresh={() => void reload()} onExportCsv={can("Purchase", "export") ? () => exportCsv("purchase-returns", ["DATE", "DOC_NO", "RECEIPT", "SUPPLIER", "TOTAL", "STATUS"], data.map(row => [row.created_at, row.ref, row.receipt_ref, row.supplier_name, (row.items ?? []).reduce((sum: number, item: any) => sum + Number(item.qty) * Number(item.unit_cost), 0), row.status])) : undefined} /><div className="flex-1 overflow-auto"><table className="w-full text-xs"><thead><tr className="border-b bg-slate-50">{["DATE", "DOC_NO", lang === "vi" ? "PHIẾU NHẬP" : "RECEIPT", "SUPPLIER", "TOTAL", "STATUS", ""].map(header => <th key={header} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase text-slate-500">{header}</th>)}</tr></thead><tbody>{data.map(row => <tr key={row.id} className="border-b"><td className="px-4 py-2.5">{formatDateTimeUtc7(row.created_at)}</td><td className="px-4 py-2.5 font-medium text-blue-600">{row.ref}</td><td className="px-4 py-2.5">{row.receipt_ref}</td><td className="px-4 py-2.5">{row.supplier_name}</td><td className="px-4 py-2.5 text-right font-semibold mono">{fmt((row.items ?? []).reduce((sum: number, item: any) => sum + Number(item.qty) * Number(item.unit_cost), 0))}</td><td className="px-4 py-2.5"><StatusBadge status={row.status} /></td><td className="px-4 py-2.5">{can("Purchase", "approve") && row.status !== "Reversed" && <button onClick={() => void reverse(row.ref)} className="h-7 rounded border px-2 text-[10px]">{lang === "vi" ? "Đảo phiếu" : "Reverse"}</button>}</td></tr>)}{!data.length && <tr><td colSpan={7} className="py-16 text-center text-slate-400">{lang === "vi" ? "Chưa có phiếu trả hàng" : "No purchase returns"}</td></tr>}</tbody></table></div>{showCreate && <PurchaseReturnModal receipts={receipts} onClose={() => setShowCreate(false)} onSaved={reload} />}</div>
}

function PurchaseReturnModal({ receipts, onClose, onSaved }: { receipts: any[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const { lang } = useLang()
  const { isDemo } = useDemo()
  const { profile } = useAuth()
  const [form, setForm] = useState({ ref: `PR-${Date.now()}`, receipt_ref: "", reason: "" })
  const [items, setItems] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const chooseReceipt = (ref: string) => {
    const receipt = receipts.find(row => row.ref === ref)
    setForm(previous => ({ ...previous, receipt_ref: ref }))
    setItems((receipt?.items_detail ?? []).map((item: any) => ({ ...item, qty: 0, max_qty: Number(item.qty ?? 0) })))
  }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const selectedItems = items.filter(item => Number(item.qty) > 0)
    if (!selectedItems.length) return showAppToast(lang === "vi" ? "Vui lòng nhập số lượng trả" : "Enter a return quantity")
    if (new Set(selectedItems.map(item => item.product_id)).size !== selectedItems.length) return showAppToast(lang === "vi" ? "Mỗi sản phẩm chỉ được xuất hiện một lần trong phiếu trả" : "Each product may only appear once in a return")
    setSaving(true)
    const result = await createPurchaseReturn({ ...form, items: selectedItems, created_by: profile?.full_name || profile?.email }, { isDemo, orgId: profile?.org_id })
    setSaving(false)
    if (result.error) return showAppToast(result.error.message ?? String(result.error))
    await onSaved()
    onClose()
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}><form onSubmit={submit} onClick={event => event.stopPropagation()} className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex justify-between border-b px-5 py-3.5"><h2 className="text-sm font-semibold">{lang === "vi" ? "Tạo phiếu trả nhà cung cấp" : "Create purchase return"}</h2><button type="button" onClick={onClose}><X size={14} /></button></div><div className="max-h-[70vh] space-y-4 overflow-y-auto p-5"><div className="grid grid-cols-2 gap-3"><label className="text-[11px] font-medium">Reference<input required value={form.ref} onChange={event => setForm({ ...form, ref: event.target.value })} className="mt-1 h-8 w-full rounded-lg border px-2 text-xs" /></label><label className="text-[11px] font-medium">{lang === "vi" ? "Phiếu nhập nguồn" : "Source receipt"}<select required value={form.receipt_ref} onChange={event => chooseReceipt(event.target.value)} className="mt-1 h-8 w-full rounded-lg border bg-white px-2 text-xs"><option value="">--</option>{receipts.map(receipt => <option key={receipt.id} value={receipt.ref}>{receipt.ref} · {receipt.supplier_name}</option>)}</select></label><label className="col-span-2 text-[11px] font-medium">{lang === "vi" ? "Lý do" : "Reason"}<input value={form.reason} onChange={event => setForm({ ...form, reason: event.target.value })} className="mt-1 h-8 w-full rounded-lg border px-2 text-xs" /></label></div><div className="overflow-hidden rounded-xl border"><table className="w-full text-xs"><thead><tr className="border-b bg-slate-50">{[lang === "vi" ? "Sản phẩm" : "Product", "SKU", lang === "vi" ? "Đã nhập" : "Received", lang === "vi" ? "Trả lần này" : "Return now"].map(header => <th key={header} className="px-3 py-2 text-left text-[10px] uppercase text-slate-500">{header}</th>)}</tr></thead><tbody>{items.map((item, index) => <tr key={item.id} className="border-b"><td className="px-3 py-2 font-medium">{item.product_name}</td><td className="px-3 py-2 mono">{item.sku}</td><td className="px-3 py-2 mono">{item.max_qty}</td><td className="px-3 py-2"><input min="0" max={item.max_qty} step="0.01" type="number" value={item.qty} onChange={event => setItems(previous => previous.map((row, rowIndex) => rowIndex === index ? { ...row, qty: Number(event.target.value) } : row))} className="h-8 w-28 rounded border px-2 text-right" /></td></tr>)}</tbody></table></div></div><div className="flex justify-end gap-2 border-t bg-slate-50 px-5 py-3.5"><button type="button" onClick={onClose} className="h-8 rounded-lg border px-4 text-xs">{lang === "vi" ? "Hủy" : "Cancel"}</button><button disabled={saving} className="h-8 rounded-lg bg-blue-600 px-4 text-xs text-white">{saving ? (lang === "vi" ? "Đang lưu..." : "Saving...") : (lang === "vi" ? "Xác nhận trả" : "Confirm return")}</button></div></form></div>
}

// --- NEXT ---
export function SupplierPayment() {
  return <FinanceTransactionList transactionType="SUPPLIER_PAYMENT" />
}

function FinanceTransactionList({ transactionType }: { transactionType: "CUSTOMER_RECEIPT" | "SUPPLIER_PAYMENT" }) {
  const { lang } = useLang(); const { isDemo } = useDemo(); const { profile, can } = useAuth(); const [data, setData] = useState<any[]>([]); const [showCreate, setShowCreate] = useState(false)
  const reload = async () => { const result = await fetchFinanceTransactions({ isDemo, orgId: profile?.org_id }); if (result.data) setData(result.data.filter(row => row.transaction_type === transactionType)) }
  useEffect(() => { reload() }, [isDemo, profile])
  const isReceipt = transactionType === "CUSTOMER_RECEIPT"
  return <div className="flex flex-col h-full"><Toolbar onCreate={can("Finance", "create") ? () => setShowCreate(true) : undefined} onRefresh={() => void reload()} createLabel={isReceipt ? (lang === "vi" ? "Ghi nhận thu tiền" : "Record receipt") : (lang === "vi" ? "Ghi nhận thanh toán" : "Record payment")} /><div className="flex-1 overflow-auto"><table className="w-full text-xs"><thead><tr className="bg-slate-50">{["DATE", "DOC_NO", isReceipt ? "CUSTOMER" : "SUPPLIER", "SOURCE", "AMOUNT", "METHOD"].map(head => <th key={head} className="px-4 py-2.5 text-left text-[10px] text-slate-500">{head}</th>)}</tr></thead><tbody>{data.map(row => <tr key={row.ref} className="border-b"><td className="px-4 py-2.5">{row.created_at ? formatDateTimeUtc7(row.created_at) : ""}</td><td className="px-4 py-2.5 font-medium">{row.ref}</td><td className="px-4 py-2.5">{isReceipt ? row.customer_name : row.supplier_name}</td><td className="px-4 py-2.5">{row.source_ref ?? "-"}</td><td className="px-4 py-2.5 font-semibold">{fmt(Number(row.amount ?? 0))}</td><td className="px-4 py-2.5">{row.method}</td></tr>)}</tbody></table></div>{showCreate && <FinanceTransactionModal transactionType={transactionType} onClose={() => setShowCreate(false)} onSaved={reload} />}</div>
}

function FinanceTransactionModal({ transactionType, onClose, onSaved }: { transactionType: "CUSTOMER_RECEIPT" | "SUPPLIER_PAYMENT"; onClose: () => void; onSaved: () => Promise<void> }) {
  const { lang } = useLang()
  const { isDemo } = useDemo()
  const { profile } = useAuth()
  const isReceipt = transactionType === "CUSTOMER_RECEIPT"
  const [sources, setSources] = useState<any[]>([])
  const [form, setForm] = useState({ ref: `${isReceipt ? "RCPT" : "PAY"}-${Date.now()}`, source_ref: "", party: "", party_id: "", amount: "", max_amount: 0, method: "Cash", description: "" })
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const request = isReceipt ? fetchInvoices({ isDemo, orgId: profile?.org_id }) : fetchPurchaseOrders({ isDemo, orgId: profile?.org_id })
    request.then(result => setSources((result.data ?? []).filter((row: any) => Number(row.outstanding_amount ?? Number(row.total ?? 0) - Number(row.paid_amount ?? 0)) > 0 && (isReceipt || ["Approved", "Receiving", "Completed"].includes(row.status)))))
  }, [isDemo, profile?.org_id, isReceipt])
  const chooseSource = (ref: string) => {
    const source = sources.find(row => row.ref === ref)
    const outstanding = Number(source?.outstanding_amount ?? Number(source?.total ?? 0) - Number(source?.paid_amount ?? 0))
    setForm(previous => ({ ...previous, source_ref: ref, party: isReceipt ? source?.customer_name ?? "" : source?.supplier_name ?? "", party_id: isReceipt ? source?.customer_id ?? "" : source?.supplier_id ?? "", amount: String(outstanding), max_amount: outstanding }))
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    const result = await recordFinanceTransaction({ ref: form.ref, source_ref: form.source_ref, amount: form.amount, method: form.method, description: form.description, ...(isReceipt ? { customer_id: form.party_id || null, customer_name: form.party } : { supplier_id: form.party_id || null, supplier_name: form.party }), transaction_type: transactionType, created_by: profile?.full_name || profile?.email }, { isDemo, orgId: profile?.org_id })
    setSaving(false)
    if (result.error) return showAppToast(result.error.message ?? String(result.error))
    await onSaved()
    onClose()
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}><form onSubmit={submit} onClick={event => event.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex justify-between border-b px-5 py-3.5"><h2 className="text-sm font-semibold">{isReceipt ? (lang === "vi" ? "Ghi nhận thu tiền khách hàng" : "Record customer receipt") : (lang === "vi" ? "Ghi nhận thanh toán nhà cung cấp" : "Record supplier payment")}</h2><button type="button" onClick={onClose}><X size={14} /></button></div><div className="grid grid-cols-2 gap-3 p-5"><label className="text-[11px] font-medium">Reference<input required value={form.ref} onChange={event => setForm({ ...form, ref: event.target.value })} className="mt-1 h-8 w-full rounded-lg border px-2 text-xs" /></label><label className="text-[11px] font-medium">{isReceipt ? (lang === "vi" ? "Hóa đơn" : "Invoice") : "PO"}<select required value={form.source_ref} onChange={event => chooseSource(event.target.value)} className="mt-1 h-8 w-full rounded-lg border bg-white px-2 text-xs"><option value="">-- {lang === "vi" ? "Chọn chứng từ" : "Select source"} --</option>{sources.map(source => <option key={source.ref} value={source.ref}>{source.ref} · {isReceipt ? source.customer_name : source.supplier_name} · {fmt(Number(source.outstanding_amount ?? Number(source.total) - Number(source.paid_amount)))}</option>)}</select></label><label className="text-[11px] font-medium">{isReceipt ? "Customer" : "Supplier"}<input readOnly value={form.party} className="mt-1 h-8 w-full rounded-lg border bg-slate-50 px-2 text-xs" /></label><label className="text-[11px] font-medium">Amount<input required min="1" max={form.max_amount || undefined} type="number" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} className="mt-1 h-8 w-full rounded-lg border px-2 text-xs" /></label><label className="text-[11px] font-medium">Method<select value={form.method} onChange={event => setForm({ ...form, method: event.target.value })} className="mt-1 h-8 w-full rounded-lg border px-2 text-xs"><option>Cash</option><option>Bank transfer</option><option>Card</option></select></label><label className="text-[11px] font-medium">Description<input value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} className="mt-1 h-8 w-full rounded-lg border px-2 text-xs" /></label></div><div className="flex justify-end gap-2 border-t bg-slate-50 px-5 py-3.5"><button type="button" onClick={onClose} className="h-8 rounded-lg border px-4 text-xs">{lang === "vi" ? "Hủy" : "Cancel"}</button><button disabled={saving || !form.source_ref} className="h-8 rounded-lg bg-blue-600 px-4 text-xs text-white disabled:opacity-50">{saving ? (lang === "vi" ? "Đang lưu..." : "Saving...") : (lang === "vi" ? "Lưu" : "Save")}</button></div></form></div>
}

// --- NEXT ---
export function InventoryTransfer() {
  const { lang } = useLang();
  const [data, setData] = useState<any[]>([]);
  const { isDemo } = useDemo();
  const { profile, can } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const reload = async () => { const res = await fetchInventoryTransfers({ isDemo, orgId: profile?.org_id }); if (res.data) setData(res.data.map((row: any) => ({ ...row, date: row.created_at ? formatDateTimeUtc7(row.created_at) : "", doc_no: row.doc_no ?? row.ref ?? "", from: row.from_warehouse_name ?? row.from_warehouse ?? "", to: row.to_warehouse_name ?? row.to_warehouse ?? "" }))) }
  useEffect(() => {
    reload()
  }, [isDemo, profile]);
  const columns = lang === "vi" ? [
    { key: "date", label: "DATE", isStatus: false }, { key: "doc_no", label: "DOC_NO", isStatus: false }, { key: "from", label: "FROM", isStatus: false }, { key: "to", label: "TO", isStatus: false }, { key: "status", label: "STATUS", isStatus: true }
  ] : [
    { key: "date", label: "DATE", isStatus: false }, { key: "doc_no", label: "DOC_NO", isStatus: false }, { key: "from", label: "FROM", isStatus: false }, { key: "to", label: "TO", isStatus: false }, { key: "status", label: "STATUS", isStatus: true }
  ];
  const reverse = async (ref: string) => { const result = await reverseInventoryTransfer(ref, { isDemo, orgId: profile?.org_id }); if (result.error) showAppToast(result.error.message ?? String(result.error)); else await reload() }
  return <div className="flex flex-col h-full"><Toolbar onCreate={can("Inventory", "create") ? () => setShowCreate(true) : undefined} onRefresh={() => void reload()} createLabel={lang === "vi" ? "Tạo chuyển kho" : "Create transfer"} /><div className="flex-1 overflow-auto"><table className="w-full text-xs"><thead><tr className="bg-slate-50">{["DATE", "DOC_NO", "FROM", "TO", "STATUS", ""].map(head => <th key={head} className="px-4 py-2.5 text-left text-[10px] text-slate-500">{head}</th>)}</tr></thead><tbody>{data.map(row => <tr key={row.doc_no} className="border-b"><td className="px-4 py-2.5">{row.date}</td><td className="px-4 py-2.5">{row.doc_no}</td><td className="px-4 py-2.5">{row.from}</td><td className="px-4 py-2.5">{row.to}</td><td className="px-4 py-2.5"><StatusBadge status={row.status} /></td><td className="px-4 py-2.5">{can("Inventory", "approve") && <button disabled={row.status === "Reversed"} onClick={() => reverse(row.ref)} className="h-7 px-2 rounded border text-[10px] disabled:opacity-40">Reverse</button>}</td></tr>)}</tbody></table></div>{showCreate && <InventoryMovementModal mode="transfer" onClose={() => setShowCreate(false)} onSaved={reload} />}</div>;
}

// --- NEXT ---
export function DeliveryNotes() {
  const { lang } = useLang()
  const [data, setData] = useState<any[]>([])
  const [returns, setReturns] = useState<any[]>([])
  const { isDemo } = useDemo()
  const { profile, can } = useAuth()
  const [salesOrders, setSalesOrders] = useState<any[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [returnDeliveryRef, setReturnDeliveryRef] = useState<string | null>(null)
  const [error, setError] = useState("")
  const reload = async () => {
    const [deliveryResult, orderResult, returnResult] = await Promise.all([
      fetchDeliveryNotes({ isDemo, orgId: profile?.org_id }),
      fetchSalesOrders({ isDemo, orgId: profile?.org_id }),
      fetchSalesReturns({ isDemo, orgId: profile?.org_id }),
    ])
    setData((deliveryResult.data ?? []).map((row: any) => ({ ...row, date: row.created_at ? formatDateTimeUtc7(row.created_at) : "", doc_no: row.ref ?? "", so_no: row.sales_order_ref ?? "", customer: row.customer_name ?? "" })))
    setSalesOrders(orderResult.data ?? [])
    setReturns(returnResult.data ?? [])
    const firstError = deliveryResult.error ?? orderResult.error ?? returnResult.error
    setError(firstError ? firstError.message ?? String(firstError) : "")
  }
  useEffect(() => { void reload() }, [isDemo, profile?.org_id])
  const reverseDelivery = async (ref: string) => {
    const result = await reverseDeliveryNote(ref, { isDemo, orgId: profile?.org_id })
    if (result.error) showAppToast(result.error.message ?? String(result.error)); else await reload()
  }
  const reverseReturn = async (ref: string) => {
    const result = await reverseSalesReturn(ref, { isDemo, orgId: profile?.org_id })
    if (result.error) showAppToast(result.error.message ?? String(result.error)); else await reload()
  }
  return (
    <div className="flex h-full flex-col">
      <Toolbar onCreate={can("Sales", "create") ? () => setShowCreate(true) : undefined} onRefresh={() => void reload()} createLabel={lang === "vi" ? "Tạo phiếu giao" : "Create delivery"} />
      {error && <div className="border-b border-red-200 bg-red-50 px-5 py-2 text-xs text-red-700">{error}</div>}
      <div className="flex-1 overflow-auto">
        <div className="border-b bg-slate-50 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{lang === "vi" ? "Phiếu giao hàng" : "Delivery notes"}</div>
        <table className="w-full min-w-[900px] border-collapse text-xs">
          <thead><tr className="border-b bg-slate-50">{["DATE", "DOC_NO", "SO_NO", "CUSTOMER", "STATUS", "INVOICE", ""].map(head => <th key={head} className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-500">{head}</th>)}</tr></thead>
          <tbody>
            {data.map(row => <tr key={row.ref} className="border-b hover:bg-slate-50/60"><td className="px-4 py-2.5">{row.date}</td><td className="px-4 py-2.5 font-medium">{row.doc_no}</td><td className="px-4 py-2.5">{row.so_no}</td><td className="px-4 py-2.5">{row.customer}</td><td className="px-4 py-2.5"><StatusBadge status={row.status} /></td><td className="px-4 py-2.5 text-blue-600">{row.invoice_ref ?? "-"}</td><td className="flex gap-1 px-4 py-2.5">{can("Sales", "approve") && <button disabled={row.status === "Reversed"} onClick={() => void reverseDelivery(row.ref)} className="h-7 rounded border px-2 text-[10px] disabled:opacity-40">{lang === "vi" ? "Đảo" : "Reverse"}</button>}{can("Sales", "create") && <button disabled={row.status === "Reversed"} onClick={() => setReturnDeliveryRef(row.ref)} className="h-7 rounded border px-2 text-[10px] disabled:opacity-40">{lang === "vi" ? "Trả" : "Return"}</button>}</td></tr>)}
            {!data.length && <tr><td colSpan={7} className="py-12 text-center text-slate-400">{lang === "vi" ? "Chưa có phiếu giao" : "No delivery notes"}</td></tr>}
          </tbody>
        </table>
        <div className="border-y bg-slate-50 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{lang === "vi" ? "Phiếu khách trả hàng" : "Sales returns"}</div>
        <table className="w-full min-w-[900px] border-collapse text-xs">
          <thead><tr className="border-b bg-slate-50">{["DATE", "DOC_NO", "DELIVERY", "CUSTOMER", "QTY", "STATUS", ""].map(head => <th key={head} className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-500">{head}</th>)}</tr></thead>
          <tbody>
            {returns.map(row => <tr key={row.ref} className="border-b hover:bg-slate-50/60"><td className="px-4 py-2.5">{row.created_at ? formatDateTimeUtc7(row.created_at) : ""}</td><td className="px-4 py-2.5 font-medium text-blue-600">{row.ref}</td><td className="px-4 py-2.5">{row.delivery_ref}</td><td className="px-4 py-2.5">{row.customer_name}</td><td className="px-4 py-2.5 mono">{(row.items ?? []).reduce((sum: number, item: any) => sum + Number(item.qty ?? 0), 0)}</td><td className="px-4 py-2.5"><StatusBadge status={row.status} /></td><td className="px-4 py-2.5">{can("Sales", "approve") && row.status !== "Reversed" && <button onClick={() => void reverseReturn(row.ref)} className="h-7 rounded border px-2 text-[10px]">{lang === "vi" ? "Đảo phiếu" : "Reverse"}</button>}</td></tr>)}
            {!returns.length && <tr><td colSpan={7} className="py-12 text-center text-slate-400">{lang === "vi" ? "Chưa có phiếu trả hàng" : "No sales returns"}</td></tr>}
          </tbody>
        </table>
      </div>
      {showCreate && <SalesDocumentModal kind="delivery" salesOrders={salesOrders} deliveries={data} onClose={() => setShowCreate(false)} onSaved={reload} />}
      {returnDeliveryRef && <SalesDocumentModal kind="return" salesOrders={salesOrders} deliveries={data} initialDeliveryRef={returnDeliveryRef} onClose={() => setReturnDeliveryRef(null)} onSaved={reload} />}
    </div>
  )
}

// --- NEXT ---
export function Invoices() {
  const { lang } = useLang()
  const { isDemo } = useDemo(); const { profile, can } = useAuth(); const [invoices, setInvoices] = useState<any[]>([])
  const [error, setError] = useState("")
  const reload = async () => {
    const result = await fetchInvoices({ isDemo, orgId: profile?.org_id })
    setInvoices((result.data ?? []).map((row: any) => ({ ...row, id: row.ref, so: row.so_ref ?? "", customer: row.customer_name, date: row.created_at ? formatDateTimeUtc7(row.created_at) : "" })))
    setError(result.error ? result.error.message ?? String(result.error) : "")
  }
  useEffect(() => { void reload() }, [isDemo, profile?.org_id])
  const heads = lang === "vi"
    ? ["Số HĐ", "Đơn bán", "Khách hàng", "Tiền hàng", "Thuế", "Tổng TT", "Trạng thái", "Ngày HĐ", ""]
    : ["Invoice #", "SO", "Customer", "Amount", "Tax", "Total", "Status", "Date", ""]
  const totalRevenue = invoices.reduce((sum, row) => sum + Number(row.total ?? 0), 0)
  const totalPaid = invoices.reduce((sum, row) => sum + Number(row.paid_amount ?? 0), 0)
  const totalOutstanding = invoices.reduce((sum, row) => sum + Number(row.outstanding_amount ?? Math.max(0, Number(row.total ?? 0) - Number(row.paid_amount ?? 0))), 0)
  const totalOverdue = invoices.filter(row => row.status === "Overdue").reduce((sum, row) => sum + Number(row.outstanding_amount ?? 0), 0)
  return (
    <div className="flex flex-col h-full">
      <Toolbar
        onRefresh={() => void reload()}
        onPrint={can("Sales", "export") ? () => printTable("invoices", heads.slice(0, -1), invoices.map(inv => [inv.id, inv.so, inv.customer, inv.amount, inv.tax, inv.total, inv.status, inv.date])) : undefined}
      />
      {error && <div className="border-b border-red-200 bg-red-50 px-5 py-2 text-xs text-red-700">{error}</div>}
      <div className="grid grid-cols-4 gap-3 px-5 py-3 bg-white border-b flex-shrink-0" style={{ borderColor: "var(--border)" }}>
        {[
          { l: lang === "vi" ? "Tổng doanh thu" : "Total Revenue", v: fmt(totalRevenue), c: "text-blue-700" },
          { l: lang === "vi" ? "Đã thanh toán" : "Paid", v: fmt(totalPaid), c: "text-emerald-600" },
          { l: lang === "vi" ? "Còn nợ" : "Outstanding", v: fmt(totalOutstanding), c: "text-amber-600" },
          { l: lang === "vi" ? "Quá hạn" : "Overdue", v: fmt(totalOverdue), c: "text-red-600" },
        ].map(c => (
          <div key={c.l} className="bg-slate-50 rounded-xl p-3">
            <div className="text-[10px] text-slate-400">{c.l}</div>
            <div className={`text-sm font-bold mono mt-0.5 ${c.c}`}>{c.v}</div>
          </div>
        ))}
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse min-w-[950px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
              {heads.map(h => <th key={h} className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {invoices.map(inv => (
              <tr key={inv.id} className="border-b hover:bg-slate-50/60 cursor-pointer group" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-2.5 mono text-blue-600 font-semibold">{inv.id}</td>
                <td className="px-4 py-2.5 mono text-slate-500">{inv.so}</td>
                <td className="px-4 py-2.5 font-medium text-slate-800">{inv.customer}</td>
                <td className="px-4 py-2.5 mono text-right">{fmt(inv.amount)}</td>
                <td className="px-4 py-2.5 mono text-right text-slate-500">{fmt(inv.tax)}</td>
                <td className="px-4 py-2.5 mono text-right font-bold text-slate-900">{fmt(inv.total)}</td>
                <td className="px-4 py-2.5"><StatusBadge status={inv.status} /></td>
                <td className="px-4 py-2.5 mono text-slate-400">{inv.date}</td>
                <td className="px-4 py-2.5"><span className="text-[10px] text-blue-600">{inv.delivery_ref ?? "-"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager count={invoices.length} total={invoices.length} label={lang === "vi" ? "hóa đơn" : "invoices"} />
    </div>
  )
}

// --- NEXT ---
export function CustomerReceipts() {
  return <FinanceTransactionList transactionType="CUSTOMER_RECEIPT" />
}

// --- NEXT ---
export function Payables() {
  return <OutstandingDocuments type="payable" />
}

// --- NEXT ---
export function CashBook() {
  const { lang } = useLang();
  const [data, setData] = useState<any[]>([]);
  const { isDemo } = useDemo(); const { profile } = useAuth();
  useEffect(() => { fetchCashBook({ isDemo, orgId: profile?.org_id }).then(result => { if (result.data) setData(result.data.map((row: any) => ({ ...row, date: row.created_at ? formatDateTimeUtc7(row.created_at) : "", doc_no: row.ref, type: row.type, amount: row.amount, balance: row.balance }))) }) }, [isDemo, profile]);
  const columns = lang === "vi" ? [
    { key: "date", label: "DATE", isStatus: false }, { key: "doc_no", label: "DOC_NO", isStatus: false }, { key: "type", label: "TYPE", isStatus: false }, { key: "amount", label: "AMOUNT", isStatus: false }, { key: "balance", label: "BALANCE", isStatus: false }
  ] : [
    { key: "date", label: "DATE", isStatus: false }, { key: "doc_no", label: "DOC_NO", isStatus: false }, { key: "type", label: "TYPE", isStatus: false }, { key: "amount", label: "AMOUNT", isStatus: false }, { key: "balance", label: "BALANCE", isStatus: false }
  ];
  return <GenericCrudList readOnly moduleName="Finance" title={lang === "vi" ? "sổ quỹ" : "cash book"} data={data} setData={setData} columns={columns} templateCols={["date","doc_no","type","amount","balance"]} templateFile="cashbook" />;
}

// --- NEXT ---
