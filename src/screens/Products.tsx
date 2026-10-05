import { useState, useRef, useEffect, useCallback } from "react"
import {
  Plus, Search, Download, Upload, Printer, RefreshCw, MoreHorizontal,
  Eye, Edit, Copy, Archive, Trash2, X, ChevronLeft, ChevronRight,
  Check, AlertCircle, LayoutList, LayoutGrid, Package, Tag, AlertTriangle,
  FileDown, FileSpreadsheet,
} from "lucide-react"
import StatusBadge from "../components/StatusBadge"
import { products as initialProducts } from "../data/mockData"
import { useDemo } from "../contexts/DemoContext"
import { useAuth } from "../contexts/AuthContext"
import { upsertProduct, deleteProduct, fetchLookup, fetchMasterDataPage, type LookupKind, type MasterDataEntity } from "../lib/dataService"
import { useLang } from "../i18n/LangContext"
import { exportCsv, exportXlsx, printTable } from "./GenericList"
import { exportRowsToExcel, importFromExcel } from "../lib/excelUtils"
import { formatDateTimeUtc7 } from "../lib/dateUtils"
import { confirmAppAction } from "../lib/appEvents"
import { formatVnd } from "../lib/numberFormat"
import AsyncPaginatedSelect, { type AsyncSelectPage } from "../components/AsyncPaginatedSelect"

const fmt = formatVnd

function downloadCsvTemplate(filename: string, cols: string[]) {
  const csv = cols.join(",") + "\n" + cols.map(() => "").join(",")
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url; a.download = filename + "_template.csv"; a.click()
  URL.revokeObjectURL(url)
}

async function downloadXlsxTemplate(filename: string, cols: string[]) {
  await exportRowsToExcel([cols, cols.map(() => "")], `${filename}_template`, "Mẫu nhập")
}

const PRODUCT_TEMPLATE_COLS = ["sku","barcode","product_name","category","brand","unit","purchase_price","selling_price","tax_pct","qty","min_stock","max_stock","description","status"]
const PRODUCT_TEMPLATE_HEADERS: Record<string, string> = {
  sku: "SKU",
  barcode: "Mã vạch",
  product_name: "Tên sản phẩm",
  category: "Danh mục",
  brand: "Thương hiệu",
  unit: "Đơn vị tính",
  purchase_price: "Giá nhập",
  selling_price: "Giá bán",
  tax_pct: "Thuế suất VAT (%)",
  qty: "Tồn kho đầu kỳ",
  min_stock: "Tồn kho tối thiểu",
  max_stock: "Tồn kho tối đa",
  description: "Mô tả",
  status: "Trạng thái",
}
const PRODUCT_IMPORT_ALIASES: Record<string, string[]> = {
  sku: ["Mã SKU", "Mã sản phẩm", "Mã hàng"],
  barcode: ["Barcode"],
  product_name: ["Tên", "Tên hàng", "Sản phẩm", "name", "product"],
  category: ["Nhóm hàng", "category_name"],
  brand: ["Nhãn hiệu"],
  unit: ["ĐVT", "Đơn vị"],
  purchase_price: ["Giá mua", "Đơn giá nhập", "cost"],
  selling_price: ["Giá bán lẻ", "Đơn giá bán", "price"],
  tax_pct: ["VAT (%)", "Thuế VAT", "tax"],
  qty: ["Số lượng tồn", "SL tồn", "Số lượng", "quantity"],
  min_stock: ["Tồn tối thiểu", "min_qty"],
  max_stock: ["Tồn tối đa", "max_qty"],
  description: ["Ghi chú", "Mô tả sản phẩm"],
  status: ["Tình trạng"],
}

function normalizeProductImportHeader(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase()
}

function mapProductImportRow(raw: Record<string, any>) {
  const keysByNormalizedHeader = Object.keys(raw).reduce<Record<string, string>>((result, key) => {
    result[normalizeProductImportHeader(key)] = key
    return result
  }, {})
  return Object.fromEntries(PRODUCT_TEMPLATE_COLS.map(column => {
    const candidates = [PRODUCT_TEMPLATE_HEADERS[column], column, ...(PRODUCT_IMPORT_ALIASES[column] ?? [])]
    const sourceKey = candidates.map(candidate => keysByNormalizedHeader[normalizeProductImportHeader(candidate)]).find(Boolean)
    return [column, sourceKey ? raw[sourceKey] : ""]
  }))
}

function parseProductImportNumber(value: unknown) {
  if (typeof value === "number") return value
  let text = String(value ?? "").trim().replace(/\s/g, "").replace(/₫|vnd|%/gi, "")
  if (!text) return 0
  const comma = text.lastIndexOf(",")
  const dot = text.lastIndexOf(".")
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : "."
    text = text.split(decimal === "," ? "." : ",").join("")
    if (decimal === ",") text = text.replace(",", ".")
  } else if (comma >= 0) {
    const parts = text.split(",")
    text = parts.length > 2 || parts.at(-1)?.length === 3 ? parts.join("") : text.replace(",", ".")
  } else if (dot >= 0) {
    const parts = text.split(".")
    if (parts.length > 2 || parts.at(-1)?.length === 3) text = parts.join("")
  }
  return Number(text)
}

type MasterOptionLoader = (search: string, offset: number, limit: number) => Promise<AsyncSelectPage<MasterOption>>

function ProductImportModal({ onClose, lang, onImport, loadWarehouses, warehouseId, warehouseOption, onWarehouseChange }: { onClose: () => void; lang: string; onImport: (file: File) => Promise<void>; loadWarehouses: MasterOptionLoader; warehouseId: string; warehouseOption: MasterOption | null; onWarehouseChange: (value: string, option: MasterOption | null) => void }) {
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-sm font-semibold">{lang === "vi" ? "Nhập sản phẩm từ file" : "Import Products"}</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"><X size={14} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Kho nhập đầu kỳ *" : "Opening warehouse *"}</label>
            <AsyncPaginatedSelect value={warehouseId} selectedOption={warehouseOption} onChange={onWarehouseChange}
              loadPage={loadWarehouses} pageSize={20} buttonClassName="h-8 text-xs"
              placeholder={lang === "vi" ? "Chọn kho" : "Select warehouse"}
              searchPlaceholder={lang === "vi" ? "Tìm kho trên máy chủ..." : "Search warehouses on the server..."}
              emptyText={lang === "vi" ? "Không có kho phù hợp" : "No matching warehouse"}
              loadingText={lang === "vi" ? "Đang tải..." : "Loading..."} loadMoreText={lang === "vi" ? "Tải thêm" : "Load more"} retryText={lang === "vi" ? "Thử lại" : "Retry"} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <FileDown size={15} className="text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="text-xs font-semibold text-slate-800 mb-0.5">{lang === "vi" ? "Bước 1: Tải file mẫu" : "Step 1: Download Template"}</div>
                <div className="text-[11px] text-slate-500 mb-2.5">{lang === "vi" ? "Tải file mẫu, điền dữ liệu đúng định dạng rồi upload lên." : "Download a template, fill in your data, then upload."}</div>
                <div className="flex items-center gap-2">
                  <button onClick={() => downloadCsvTemplate("products", PRODUCT_TEMPLATE_COLS.map(column => PRODUCT_TEMPLATE_HEADERS[column]))} className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-blue-600 text-white text-[11px] font-medium hover:bg-blue-700">
                    <FileDown size={12} /> {lang === "vi" ? "Mẫu CSV" : "CSV Template"}
                  </button>
                  <button onClick={() => void downloadXlsxTemplate("products", PRODUCT_TEMPLATE_COLS.map(column => PRODUCT_TEMPLATE_HEADERS[column]))} className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-emerald-600 text-white text-[11px] font-medium hover:bg-emerald-700">
                    <FileSpreadsheet size={12} /> {lang === "vi" ? "Mẫu Excel" : "Excel Template"}
                  </button>
                </div>
                <div className="mt-2 text-[10px] text-slate-400 font-mono bg-slate-50 rounded-lg px-2 py-1.5 truncate">{PRODUCT_TEMPLATE_COLS.slice(0, 6).map(column => PRODUCT_TEMPLATE_HEADERS[column]).join(", ")} +{PRODUCT_TEMPLATE_COLS.length - 6} more</div>
              </div>
            </div>
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                <Upload size={15} className="text-emerald-600" />
              </div>
              <div className="flex-1">
                <div className="text-xs font-semibold text-slate-800 mb-2">{lang === "vi" ? "Bước 2: Upload file dữ liệu" : "Step 2: Upload Data File"}</div>
                <div
                  onDragOver={e => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) setFile(f) }}
                  onClick={() => fileRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${dragging ? "border-blue-400 bg-blue-50" : file ? "border-emerald-400 bg-emerald-50" : "border-slate-200 hover:border-blue-300"}`}
                >
                  <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={e => e.target.files?.[0] && setFile(e.target.files[0])} />
                  {file ? (
                    <><FileSpreadsheet size={20} className="text-emerald-500 mx-auto mb-1" /><div className="text-xs font-semibold text-emerald-700">{file.name}</div><div className="text-[10px] text-emerald-500">{(file.size / 1024).toFixed(1)} KB</div></>
                  ) : (
                    <><Upload size={20} className="text-slate-300 mx-auto mb-1" /><div className="text-xs text-slate-500">{lang === "vi" ? "Kéo thả hoặc " : "Drag & drop or "}<span className="text-blue-600 font-medium">{lang === "vi" ? "chọn file" : "browse"}</span></div><div className="text-[10px] text-slate-400 mt-0.5">CSV, XLSX — max 10MB</div></>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t bg-slate-50" style={{ borderColor: "var(--border)" }}>
          <button onClick={onClose} className="h-8 px-4 rounded-lg border text-xs text-slate-600" style={{ borderColor: "var(--border)" }}>{lang === "vi" ? "Hủy" : "Cancel"}</button>
          <button disabled={!file} onClick={async () => { if (file) await onImport(file) }} className="h-8 px-4 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">{lang === "vi" ? "Nhập dữ liệu" : "Import"}</button>
        </div>
      </div>
    </div>
  )
}

const productImages: Record<string, string> = {
  Laptop:   "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=400&q=80",
  Phone:    "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&q=80",
  Monitor:  "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=400&q=80",
  Keyboard: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=400&q=80",
  Storage:  "https://images.unsplash.com/photo-1591488320449-011701bb6704?w=400&q=80",
  Memory:   "https://images.unsplash.com/photo-1562976540-1502c2145851?w=400&q=80",
  Network:  "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=400&q=80",
  Security: "https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=400&q=80",
  Power:    "https://images.unsplash.com/photo-1619698573563-97ba3c0e0f7e?w=400&q=80",
  default:  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&q=80",
}
function getImg(cat: string) { return productImages[cat] ?? productImages.default }

type Product = typeof initialProducts[0]

type FormState = {
  name: string; sku: string; barcode: string; category: string; brand: string
  unit: string; purchasePrice: string; sellingPrice: string; tax: string
  qty: string; minStock: string; maxStock: string; description: string; status: string
  trackInventory: boolean; trackSerial: boolean; trackBatch: boolean; allowNegative: boolean
  warehouseId: string; warehouseName: string
}

const emptyForm: FormState = {
  name: "", sku: "", barcode: "", category: "", brand: "", unit: "",
  purchasePrice: "", sellingPrice: "", tax: "", qty: "0", minStock: "", maxStock: "",
  description: "", status: "Active",
  trackInventory: true, trackSerial: false, trackBatch: false, allowNegative: false,
  warehouseId: "", warehouseName: "",
}

function productToForm(p: Product): FormState {
  const row = p as any
  return {
    name: p.name, sku: p.sku, barcode: p.barcode, category: p.category,
    brand: p.brand, unit: p.unit, purchasePrice: String(p.cost),
    sellingPrice: String(p.price), tax: String(row.tax_pct ?? 0), qty: String(p.qty ?? 0),
    minStock: String(row.min_qty ?? 0), maxStock: String(row.max_qty ?? 0),
    description: row.description ?? "", status: p.status,
    trackInventory: row.track_inventory ?? true, trackSerial: row.track_serial ?? false,
    trackBatch: row.track_batch ?? false, allowNegative: row.allow_negative ?? false,
    warehouseId: "", warehouseName: "",
  }
}

type MasterOption = { value: string; label: string }

// ---- Top-level ProductFormModal (stable reference, receives all state via props) ----
interface ProductFormModalProps {
  editingProduct: Product | null
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  loadCategories: MasterOptionLoader
  loadBrands: MasterOptionLoader
  loadUnits: MasterOptionLoader
  loadWarehouses: MasterOptionLoader
  onSave: () => void
  onClose: () => void
}

function ProductFormModal({ editingProduct, form, setForm, loadCategories, loadBrands, loadUnits, loadWarehouses, onSave, onClose }: ProductFormModalProps) {
  const { t, lang } = useLang()
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-sm font-semibold text-slate-900">
            {editingProduct
              ? (lang === "vi" ? "Chỉnh sửa sản phẩm" : "Edit Product")
              : (lang === "vi" ? "Tạo sản phẩm mới" : "Create Product")}
          </h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"><X size={14} /></button>
        </div>
        <div className="p-5 space-y-4 max-h-[72vh] overflow-y-auto">
          {/* Image */}
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-xl border-2 border-dashed flex flex-col items-center justify-center text-slate-300 cursor-pointer hover:border-blue-400 hover:text-blue-400 transition-colors overflow-hidden" style={{ borderColor: "var(--border)" }}>
              {editingProduct ? (
                <img src={getImg(editingProduct.category)} alt="" className="w-full h-full object-cover" />
              ) : (
                <><Package size={20} /><span className="text-[9px] mt-1">{lang === "vi" ? "Thêm ảnh" : "Add Image"}</span></>
              )}
            </div>
            {!editingProduct && Number(form.qty) > 0 && (
              <div className="mt-3">
                <label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Kho nhập đầu kỳ *" : "Opening warehouse *"}</label>
                <AsyncPaginatedSelect value={form.warehouseId} selectedOption={form.warehouseId ? { value: form.warehouseId, label: form.warehouseName || form.warehouseId } : null}
                  onChange={(value, option) => setForm(current => ({ ...current, warehouseId: value, warehouseName: option?.label ?? "" }))}
                  loadPage={loadWarehouses} pageSize={20} buttonClassName="h-8 text-xs"
                  placeholder={lang === "vi" ? "Chọn kho" : "Select warehouse"}
                  searchPlaceholder={lang === "vi" ? "Tìm kho trên máy chủ..." : "Search warehouses on the server..."}
                  emptyText={lang === "vi" ? "Không có kho phù hợp" : "No matching warehouse"}
                  loadingText={lang === "vi" ? "Đang tải..." : "Loading..."} loadMoreText={lang === "vi" ? "Tải thêm" : "Load more"} retryText={lang === "vi" ? "Thử lại" : "Retry"} />
              </div>
            )}
            <p className="text-xs text-slate-400">{lang === "vi" ? "JPG, PNG, WebP tối đa 5MB" : "JPG, PNG, WebP up to 5MB"}</p>
          </div>

          {/* Basic Info */}
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">{t("basicInfo")}</h3>
            <div className="grid grid-cols-2 gap-3">
              {([
                [t("productName") + " *", "name", "text", lang === "vi" ? "Nhập tên sản phẩm" : "Enter product name"],
                [t("sku"), "sku", "text", "VD: LP-DELL-001"],
                [t("barcode"), "barcode", "text", "EAN / UPC / QR"],
              ] as [string, string, string, string][]).map(([label, key, type, ph]) => (
                <div key={key} className={key === "name" ? "col-span-2" : ""}>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">{label}</label>
                  <input type={type} placeholder={ph} value={(form as any)[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full h-8 px-3 rounded-lg border text-xs outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" style={{ borderColor: "var(--border)" }} />
                </div>
              ))}
              {([
                [t("category"), "category", loadCategories],
                [t("brand"), "brand", loadBrands],
                [t("unit"), "unit", loadUnits],
              ] as [string, "category" | "brand" | "unit", MasterOptionLoader][]).map(([label, key, loader]) => (
                <div key={key}>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">{label}</label>
                  <AsyncPaginatedSelect value={form[key]} selectedOption={form[key] ? { value: form[key], label: form[key] } : null}
                    onChange={value => setForm(current => ({ ...current, [key]: value }))} loadPage={loader}
                    pageSize={20} buttonClassName="h-8 text-xs" placeholder={lang === "vi" ? "Chọn..." : "Select..."}
                    searchPlaceholder={lang === "vi" ? "Nhập để tìm trên máy chủ..." : "Type to search on the server..."}
                    emptyText={lang === "vi" ? "Không có dữ liệu phù hợp" : "No matching data"}
                    loadingText={lang === "vi" ? "Đang tải..." : "Loading..."} loadMoreText={lang === "vi" ? "Tải thêm" : "Load more"} retryText={lang === "vi" ? "Thử lại" : "Retry"} />
                </div>
              ))}
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">{t("status")}</label>
                <select value={form.status} onChange={event => setForm(current => ({ ...current, status: event.target.value }))}
                  className="w-full h-8 px-3 rounded-lg border text-xs outline-none bg-white" style={{ borderColor: "var(--border)" }}>
                  <option value="Active">{lang === "vi" ? "Hoạt động" : "Active"}</option>
                  <option value="Draft">{lang === "vi" ? "Nháp" : "Draft"}</option>
                  <option value="Inactive">{lang === "vi" ? "Ngừng" : "Inactive"}</option>
                </select>
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">{t("pricing")}</h3>
            <div className="grid grid-cols-3 gap-3">
              {([
                [t("purchasePrice"), "purchasePrice"],
                [t("sellingPrice"), "sellingPrice"],
                [t("tax") + " (%)", "tax"],
              ] as [string, string][]).map(([label, key]) => (
                <div key={key}>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">{label}</label>
                  <input type="number" placeholder="0" value={(form as any)[key]} readOnly={key === "qty"}
                    onChange={e => key !== "qty" && setForm(f => ({ ...f, [key]: e.target.value }))}
                    className={`w-full h-8 px-3 rounded-lg border text-xs outline-none focus:ring-2 focus:ring-blue-500/20 mono ${key === "qty" ? "bg-slate-100 text-slate-500 cursor-not-allowed" : ""}`} style={{ borderColor: "var(--border)" }} />
                </div>
              ))}
            </div>
          </div>

          {/* Inventory Settings */}
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">{t("inventorySettings")}</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {([
                [t("qty") || (lang === "vi" ? "Tồn kho" : "Quantity"), "qty"],
                [t("minStock"), "minStock"],
                [t("maxStock"), "maxStock"],
              ] as [string, string][]).map(([label, key]) => (
                <div key={key}>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">{label}</label>
                  <input type="number" min="0" placeholder="0" value={(form as any)[key]} readOnly={Boolean(editingProduct && key === "qty")}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className={`w-full h-8 px-3 rounded-lg border text-xs outline-none focus:ring-2 focus:ring-blue-500/20 mono ${editingProduct && key === "qty" ? "bg-slate-100 text-slate-500 cursor-not-allowed" : ""}`} style={{ borderColor: "var(--border)" }} />
                  {editingProduct && key === "qty" && <span className="mt-1 block text-[10px] text-slate-400">{lang === "vi" ? "Điều chỉnh tồn kho tại phân hệ Kho" : "Adjust stock in Inventory"}</span>}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {([
                [t("trackInventory"), "trackInventory"],
                [t("trackSerial"), "trackSerial"],
                [t("trackBatch"), "trackBatch"],
                [t("allowNegative"), "allowNegative"],
              ] as [string, string][]).map(([label, key]) => (
                <label key={key} className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={(form as any)[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
                    className="accent-blue-600 w-3.5 h-3.5" />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">{t("description")}</label>
            <textarea rows={2} value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border text-xs outline-none focus:ring-2 focus:ring-blue-500/20 resize-none" style={{ borderColor: "var(--border)" }} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t bg-slate-50" style={{ borderColor: "var(--border)" }}>
          <button onClick={onClose} className="h-8 px-4 rounded-lg border text-xs text-slate-600 hover:bg-white" style={{ borderColor: "var(--border)" }}>{t("cancel")}</button>
          <button onClick={onSave} className="h-8 px-4 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700">{t("save")}</button>
        </div>
      </div>
    </div>
  )
}

// ---- Delete Confirm Dialog ----
interface DeleteConfirmProps { product: Product; onConfirm: () => void; onCancel: () => void }

function DeleteConfirmDialog({ product, onConfirm, onCancel }: DeleteConfirmProps) {
  const { t, lang } = useLang()
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={22} className="text-red-500" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900 mb-1">
            {lang === "vi" ? "Xác nhận xóa sản phẩm" : "Confirm Delete"}
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed mb-1">
            {lang === "vi" ? "Bạn có chắc chắn muốn xóa" : "Are you sure you want to delete"}&nbsp;
            <span className="font-semibold text-slate-700">{product.name}</span>?
          </p>
          <p className="text-xs text-red-500">{lang === "vi" ? "Thao tác này không thể hoàn tác." : "This action cannot be undone."}</p>
        </div>
        <div className="flex gap-2 px-5 py-3.5 border-t bg-slate-50" style={{ borderColor: "var(--border)" }}>
          <button onClick={onCancel} className="flex-1 h-8 rounded-lg border text-xs text-slate-600 hover:bg-white" style={{ borderColor: "var(--border)" }}>
            {t("cancel")}
          </button>
          <button onClick={onConfirm} className="flex-1 h-8 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700">
            {lang === "vi" ? "Xóa sản phẩm" : "Delete Product"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- Product Detail Modal ----
interface ProductDetailProps { product: Product; onEdit: (p: Product) => void; onDelete: (p: Product) => void; onClose: () => void; canEdit: boolean; canDelete: boolean }

function ProductDetailModal({ product, onEdit, onDelete, onClose, canEdit, canDelete }: ProductDetailProps) {
  const { t, lang } = useLang()
  const averageCost = Number((product as any).average_cost ?? product.cost ?? 0)
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex" onClick={e => e.stopPropagation()}>
        <div className="w-56 flex-shrink-0 bg-slate-50 relative">
          <img src={getImg(product.category)} alt={product.name} className="w-full h-full object-cover" />
          <div className="absolute top-3 left-3"><StatusBadge status={product.status} /></div>
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-start justify-between px-5 pt-5 pb-3">
            <div className="min-w-0 pr-2">
              <div className="text-[10px] mono text-slate-400 mb-0.5">{product.sku}</div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">{product.name}</h2>
              <div className="text-xs text-slate-500 mt-1">{product.brand} · {product.category} · {product.unit}</div>
            </div>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 flex-shrink-0"><X size={14} /></button>
          </div>
          <div className="px-5 pb-4 space-y-3 flex-1 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              {[
                [lang === "vi" ? "Mã vạch" : "Barcode", product.barcode || "—", true],
                [lang === "vi" ? "Đơn vị tính" : "Unit", product.unit, false],
                [lang === "vi" ? "Giá nhập tham chiếu" : "Reference Cost", fmt(product.cost) + " ₫", true],
                [lang === "vi" ? "Giá vốn bình quân tồn" : "Average Inventory Cost", fmt(averageCost) + " ₫", true],
                [lang === "vi" ? "Giá bán" : "Sell Price", fmt(product.price) + " ₫", false],
                [lang === "vi" ? "Lợi nhuận" : "Margin",
                  product.price > 0 ? `${Math.round((product.price - averageCost) / product.price * 100)}%` : "—", true],
                [lang === "vi" ? "Tồn kho" : "Stock Qty", String(product.qty), false],
              ].map(([l, v, mono]) => (
                <div key={String(l)} className="bg-slate-50 rounded-xl p-3">
                  <div className="text-[10px] text-slate-400 font-medium">{l}</div>
                  <div className={`text-sm font-bold text-slate-900 mt-0.5 ${mono ? "mono" : ""}`}>{v}</div>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-slate-400 flex gap-4 pt-1">
              <span>{lang === "vi" ? "Cập nhật" : "Updated"}: <span className="mono text-slate-600">{formatDateTimeUtc7(product.updated)}</span></span>
              <span>{lang === "vi" ? "Bởi" : "By"}: <span className="text-blue-600">{product.updatedBy}</span></span>
            </div>
          </div>
          <div className="flex gap-2 px-5 py-3.5 border-t bg-slate-50" style={{ borderColor: "var(--border)" }}>
            {canEdit && <button onClick={() => onEdit(product)} className="flex-1 h-8 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 flex items-center justify-center gap-1.5">
              <Edit size={12} /> {t("edit")}
            </button>}
            {canDelete && <button onClick={() => onDelete(product)} className="h-8 px-4 rounded-lg border text-xs text-red-600 hover:bg-red-50 flex items-center gap-1.5" style={{ borderColor: "var(--border)" }}>
              <Trash2 size={12} /> {t("delete")}
            </button>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- Main Products screen ----
export default function Products() {
  const { t, lang } = useLang()
  const { isDemo } = useDemo()
  const [products, setProducts] = useState<any[]>([])
  const { profile, can } = useAuth()
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get("search") ?? "")
  const [selected, setSelected] = useState<string[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [actionRow, setActionRow] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [filterStatus, setFilterStatus] = useState("all")
  const [filterCategory, setFilterCategory] = useState("")
  const [viewMode, setViewMode] = useState<"list" | "grid">("list")
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [detailProduct, setDetailProduct] = useState<Product | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importWarehouseId, setImportWarehouseId] = useState("")
  const [importWarehouseOption, setImportWarehouseOption] = useState<MasterOption | null>(null)
  const [totalProducts, setTotalProducts] = useState(0)
  const [loadingProducts, setLoadingProducts] = useState(false)
  const actionMenuRef = useRef<HTMLDivElement>(null)

  const loadMasterOptions = useCallback(async (entity: MasterDataEntity, searchText: string, offset: number, limit: number, useId = false) => {
    if (entity === "brands") {
      const result = await fetchMasterDataPage(entity, { isDemo, orgId: profile?.org_id, search: searchText, offset, limit })
      if (result.error) throw result.error
      return {
        options: (result.data?.items ?? []).map(row => ({
          value: String(useId ? row.id : row.name ?? row.name_vi ?? row.name_en ?? row.code ?? ""),
          label: String(row.name ?? row.name_vi ?? row.name_en ?? row.code ?? ""),
        })).filter(option => option.value && option.label),
        hasMore: result.data?.hasMore ?? false,
      }
    }
    const result = await fetchLookup(entity as LookupKind, { isDemo, orgId: profile?.org_id, search: searchText, offset, limit })
    if (result.error) throw result.error
    return {
      options: (result.data ?? []).map(row => ({ value: useId ? row.id : row.label, label: row.label })),
      hasMore: result.hasMore,
    }
  }, [isDemo, profile?.org_id])
  const loadCategories = useCallback<MasterOptionLoader>((searchText, offset, limit) => loadMasterOptions("categories", searchText, offset, limit), [loadMasterOptions])
  const loadBrands = useCallback<MasterOptionLoader>((searchText, offset, limit) => loadMasterOptions("brands", searchText, offset, limit), [loadMasterOptions])
  const loadUnits = useCallback<MasterOptionLoader>((searchText, offset, limit) => loadMasterOptions("units", searchText, offset, limit), [loadMasterOptions])
  const loadWarehouses = useCallback<MasterOptionLoader>((searchText, offset, limit) => loadMasterOptions("warehouses", searchText, offset, limit, true), [loadMasterOptions])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) setActionRow(null)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  // Products are searched and paged on the server. Keeping a single 20-row
  // page in memory avoids downloading the entire product master.
  const filtered = products
  const pageSize = 20
  const totalPages = Math.max(1, Math.ceil(totalProducts / pageSize))
  const paged = products

  const allSelected = paged.length > 0 && paged.every(p => selected.includes(p.id))
  const toggleAll = () =>
    setSelected(allSelected
      ? selected.filter(id => !paged.map(p => p.id).includes(id))
      : [...new Set([...selected, ...paged.map(p => p.id)])])
  const toggleOne = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 2500)
  }

  const refreshProducts = useCallback(async () => {
    setLoadingProducts(true)
    try {
      const result = await fetchMasterDataPage("products", {
        isDemo,
        orgId: profile?.org_id,
        search,
        status: filterStatus === "all" ? null : filterStatus,
        category: filterCategory || null,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      })
      if (result.error) throw result.error
      setProducts(result.data?.items ?? [])
      setTotalProducts(result.data?.total ?? 0)
    } catch (error: any) {
      showToast(error?.message ?? String(error), false)
    } finally {
      setLoadingProducts(false)
    }
  }, [filterCategory, filterStatus, isDemo, page, profile?.org_id, search])

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshProducts(), search ? 300 : 0)
    return () => window.clearTimeout(timer)
  }, [refreshProducts, search])

  const openCreate = () => { setForm(emptyForm); setShowCreate(true) }
  const openEdit = (p: Product) => { setEditingProduct(p); setForm(productToForm(p)); setActionRow(null); setDetailProduct(null) }
  const closeForm = () => { setShowCreate(false); setEditingProduct(null) }

  const handleSave = async () => {
    if (!form.name.trim()) { showToast(lang === "vi" ? "Vui lòng nhập tên sản phẩm" : "Please enter product name", false); return }
    if (!form.sku.trim()) { showToast(lang === "vi" ? "Vui lòng nhập SKU" : "Please enter an SKU", false); return }
    const payload: any = {
      name: form.name,
      sku: form.sku || undefined,
      barcode: form.barcode || undefined,
      category: form.category || undefined,
      brand: form.brand || undefined,
      unit: form.unit || undefined,
      cost: Number(form.purchasePrice) || 0,
      price: Number(form.sellingPrice) || 0,
      qty: Number(form.qty) || 0,
      warehouse_id: form.warehouseId || undefined,
      warehouse_name: form.warehouseName || undefined,
      status: form.status,
      updated_by: profile?.full_name || profile?.email || "system",
      tax_pct: Number(form.tax) || 0,
      min_qty: Number(form.minStock) || 0,
      max_qty: Number(form.maxStock) || 0,
      description: form.description || null,
      track_inventory: form.trackInventory,
      track_serial: form.trackSerial,
      track_batch: form.trackBatch,
      allow_negative: form.allowNegative,
    }
    if (editingProduct) payload.id = editingProduct.id
    if (!editingProduct && Number(payload.qty) > 0 && !payload.warehouse_id) {
      showToast(lang === "vi" ? "Vui lòng chọn kho nhập đầu kỳ" : "Please select an opening warehouse", false)
      return
    }
    const res = await upsertProduct(payload, { isDemo, orgId: profile?.org_id })
    if (res && res.error) {
      showToast(res.error.message ?? String(res.error), false)
    } else {
      // refresh
      await refreshProducts()
      closeForm()
      showToast(lang === "vi" ? (editingProduct ? "Cập nhật sản phẩm thành công!" : "Tạo sản phẩm thành công!") : (editingProduct ? "Product updated!" : "Product created!"))
    }
  }

  const handleImport = async (file: File) => {
    if (!importWarehouseId) {
      showToast(lang === "vi" ? "Vui lòng chọn kho nhập đầu kỳ" : "Please select an opening warehouse", false)
      return
    }
    const importWarehouse = importWarehouseOption
    try {
      const expectedHeaders = PRODUCT_TEMPLATE_COLS.flatMap(column => [
        column,
        PRODUCT_TEMPLATE_HEADERS[column],
        ...(PRODUCT_IMPORT_ALIASES[column] ?? []),
      ])
      const rows = await importFromExcel(file, expectedHeaders)
      let imported = 0
      for (const rawRow of rows) {
        const row = mapProductImportRow(rawRow)
        const normalizedStatus = normalizeProductImportHeader(row.status)
        const status = ["ngung hoat dong", "khong hoat dong", "inactive"].includes(normalizedStatus)
          ? "Inactive"
          : ["nhap", "draft"].includes(normalizedStatus)
            ? "Draft"
            : ["", "active", "hoat dong", "dang hoat dong"].includes(normalizedStatus)
              ? "Active"
              : String(row.status).trim()
        const payload = {
          sku: String(row.sku ?? "").trim(),
          barcode: String(row.barcode ?? "").trim(),
          name: String(row.product_name ?? "").trim(),
          category: String(row.category ?? "").trim(),
          brand: String(row.brand ?? "").trim(),
          unit: String(row.unit ?? "").trim(),
          cost: parseProductImportNumber(row.purchase_price),
          price: parseProductImportNumber(row.selling_price),
          qty: parseProductImportNumber(row.qty),
          warehouse_id: importWarehouseId,
          warehouse_name: importWarehouse?.label,
          status,
          tax_pct: parseProductImportNumber(row.tax_pct),
          min_qty: parseProductImportNumber(row.min_stock),
          max_qty: parseProductImportNumber(row.max_stock),
          description: String(row.description ?? "").trim() || null,
        }
        if (!payload.sku || !payload.name) continue
        const result = await upsertProduct(payload, { isDemo, orgId: profile?.org_id })
        if (!result.error) imported++
      }
      await refreshProducts()
      setShowImportModal(false)
      showToast(lang === "vi" ? `Đã nhập ${imported} sản phẩm` : `Imported ${imported} products`)
    } catch (error) {
      if (import.meta.env.DEV) console.error(error)
      showToast(lang === "vi" ? "Không thể đọc file sản phẩm" : "Could not read product file", false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const res = await deleteProduct(deleteTarget.id, { isDemo, orgId: profile?.org_id })
    if (res && res.error) showToast(res.error.message ?? String(res.error), false)
    else {
      await refreshProducts()
      setDetailProduct(null)
      setDeleteTarget(null)
      showToast(lang === "vi" ? "Đã xóa sản phẩm" : "Product deleted")
    }
  }

  const handleDuplicate = async (p: Product) => {
    const { id, ...rest } = p as any
    const payload = { ...rest, sku: `${p.sku}-COPY`, name: `${p.name} (Copy)`, qty: 0 }
    const res = await upsertProduct(payload as any, { isDemo, orgId: profile?.org_id })
    if (res && res.error) showToast(lang === "vi" ? "Lỗi khi sao chép" : "Duplicate failed", false)
    else {
      await refreshProducts()
      setActionRow(null)
      showToast(lang === "vi" ? "Đã sao chép sản phẩm" : "Product duplicated")
    }
  }

  const statusOptions = [
    { key: "all", label: lang === "vi" ? "Tất cả" : "All" },
    { key: "Active", label: lang === "vi" ? "Hoạt động" : "Active" },
    { key: "Inactive", label: lang === "vi" ? "Ngừng" : "Inactive" },
  ]

  const colHeaders = lang === "vi"
    ? ["SKU", "Mã vạch", "Tên sản phẩm", "Danh mục", "Thương hiệu", "ĐVT", "Giá vốn BQ", "Giá bán", "Tồn", "Trạng thái", "Cập nhật", ""]
    : ["SKU", "Barcode", "Product Name", "Category", "Brand", "Unit", "Avg Cost", "Sell Price", "Qty", "Status", "Updated", ""]

  const makeActionMenu = (p: Product) => (
    <div className="absolute right-0 top-8 z-30 bg-white border rounded-xl shadow-xl py-1 min-w-[150px]" style={{ borderColor: "var(--border)" }}>
      {[
        { show: true, icon: <Eye size={13} />, label: t("view"), onClick: () => { setDetailProduct(p); setActionRow(null) } },
        { show: can("Master Data", "update"), icon: <Edit size={13} />, label: t("edit"), onClick: () => openEdit(p) },
        { show: can("Master Data", "create"), icon: <Copy size={13} />, label: t("duplicate"), onClick: () => handleDuplicate(p) },
        { show: can("Master Data", "update"), icon: <Archive size={13} />, label: t("archive"), onClick: async () => { const result = await upsertProduct({ ...(p as any), id: p.id, qty: 0, status: "Inactive" }, { isDemo, orgId: profile?.org_id }); setActionRow(null); if (result.error) showToast(result.error.message ?? String(result.error), false); else { await refreshProducts(); showToast(lang === "vi" ? "Đã lưu trữ" : "Archived") } } },
      ].filter(action => action.show).map(a => (
        <button key={a.label} onClick={a.onClick} className="w-full flex items-center gap-2 px-3 h-8 text-xs text-slate-700 hover:bg-slate-50">
          {a.icon} {a.label}
        </button>
      ))}
      {can("Master Data", "delete") && <><div className="border-t my-1" style={{ borderColor: "var(--border)" }} />
      <button onClick={() => { setDeleteTarget(p); setActionRow(null) }} className="w-full flex items-center gap-2 px-3 h-8 text-xs text-red-600 hover:bg-red-50">
        <Trash2 size={13} /> {t("delete")}
      </button></>}
    </div>
  )

  return (
    <div className="flex flex-col h-full relative">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-[100] flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-xs font-medium text-white ${toast.ok ? "bg-emerald-600" : "bg-red-500"}`}>
          {toast.ok ? <Check size={14} /> : <AlertCircle size={14} />}
          {toast.msg}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-5 py-2.5 bg-white border-b flex-shrink-0 flex-wrap gap-y-2" style={{ borderColor: "var(--border)" }}>
        {can("Master Data", "create") && <button onClick={openCreate} className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700">
          <Plus size={13} /> {t("create")}
        </button>}
        {can("Master Data", "create") && <button onClick={() => setShowImportModal(true)} className="flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs text-slate-600 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
          <Upload size={13} /> {t("import")}
        </button>}
        {can("Master Data", "export") && <div className="relative group">
          <button className="flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs text-slate-600 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
            <Download size={13} /> {t("export")}
          </button>
          <div className="absolute top-full left-0 mt-0 hidden group-hover:flex flex-col bg-white border rounded-lg shadow-lg w-32 z-50 overflow-hidden" style={{ borderColor: "var(--border)" }}>
            <button onClick={() => exportCsv("products", ["SKU", "Barcode", t("productName"), t("category"), "Brand", "Unit", "Avg Cost", "Price", "Available", t("status")], filtered.map(p => [p.sku, p.barcode, p.name, p.category, p.brand, p.unit, (p as any).average_cost ?? p.cost, p.price, p.available, p.status]))} className="px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50">CSV</button>
            <button onClick={() => exportXlsx("products", ["SKU", "Barcode", t("productName"), t("category"), "Brand", "Unit", "Avg Cost", "Price", "Available", t("status")], filtered.map(p => [p.sku, p.barcode, p.name, p.category, p.brand, p.unit, (p as any).average_cost ?? p.cost, p.price, p.available, p.status]))} className="px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50">Excel</button>
          </div>
        </div>}
        {can("Master Data", "export") && <button onClick={() => printTable(
          "products",
          ["SKU", "Barcode", t("productName"), t("category"), "Brand", "Unit", "Avg Cost", "Price", "Available", t("status")],
          filtered.map(p => [p.sku, p.barcode, p.name, p.category, p.brand, p.unit, (p as any).average_cost ?? p.cost, p.price, p.available, p.status]),
        )} className="flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs text-slate-600 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
          <Printer size={13} /> {t("print")}
        </button>}
        <div className="flex-1" />
        <div className="w-48">
          <AsyncPaginatedSelect value={filterCategory} selectedOption={filterCategory ? { value: filterCategory, label: filterCategory } : null}
            onChange={value => { setFilterCategory(value); setPage(1) }} loadPage={loadCategories} pageSize={20}
            buttonClassName="h-8 text-xs" placeholder={lang === "vi" ? "Tất cả danh mục" : "All categories"}
            searchPlaceholder={lang === "vi" ? "Tìm danh mục..." : "Search categories..."}
            emptyText={lang === "vi" ? "Không có danh mục" : "No categories"}
            loadingText={lang === "vi" ? "Đang tải..." : "Loading..."} loadMoreText={lang === "vi" ? "Tải thêm" : "Load more"} retryText={lang === "vi" ? "Thử lại" : "Retry"} />
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder={lang === "vi" ? "Tìm tên, SKU, mã vạch..." : "Search name, SKU, barcode..."}
            className="h-8 pl-8 pr-8 rounded-lg border text-xs outline-none focus:ring-2 focus:ring-blue-500/20 w-48" style={{ borderColor: "var(--border)" }} />
          {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"><X size={12} /></button>}
        </div>
        <div className="flex items-center border rounded-lg overflow-hidden text-xs" style={{ borderColor: "var(--border)" }}>
          {statusOptions.map(s => (
            <button key={s.key} onClick={() => { setFilterStatus(s.key); setPage(1) }}
              className={`h-8 px-3 whitespace-nowrap ${filterStatus === s.key ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex items-center border rounded-lg overflow-hidden" style={{ borderColor: "var(--border)" }}>
          {[
            { mode: "list" as const, icon: <LayoutList size={14} />, title: lang === "vi" ? "Danh sách" : "List" },
            { mode: "grid" as const, icon: <LayoutGrid size={14} />, title: lang === "vi" ? "Lưới" : "Grid" },
          ].map(v => (
            <button key={v.mode} onClick={() => { setViewMode(v.mode); setPage(1) }} title={v.title}
              className={`w-8 h-8 flex items-center justify-center ${viewMode === v.mode ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
              {v.icon}
            </button>
          ))}
        </div>
        <button onClick={() => void refreshProducts()} className="w-8 h-8 flex items-center justify-center rounded-lg border text-slate-500 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Selection bar */}
          {selected.length > 0 && (
        <div className="flex items-center gap-3 px-5 py-2 bg-blue-50 border-b text-xs" style={{ borderColor: "var(--border)" }}>
          <span className="text-blue-700 font-semibold">{selected.length} {t("selected")}</span>
          {can("Master Data", "delete") && <button onClick={async () => {
              if (!await confirmAppAction(lang === "vi" ? `Xóa ${selected.length} sản phẩm đã chọn?` : `Delete ${selected.length} selected products?`, { destructive: true })) return
              for (const id of selected) { await deleteProduct(id, { isDemo, orgId: profile?.org_id }) }
              await refreshProducts()
              setSelected([])
              showToast(lang === "vi" ? "Đã xóa" : "Deleted")
            }} className="text-red-600 hover:underline">{t("delete")}</button>}
          <button onClick={() => setSelected([])} className="text-slate-500 hover:underline ml-auto">{t("clearSelection")}</button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {paged.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
            <Package size={40} className="text-slate-200" />
            <div className="text-sm font-medium">{t("noData")}</div>
            <div className="text-xs">{t("noDataDesc")}</div>
          </div>
        ) : viewMode === "list" ? (
          <table className="w-full text-xs border-collapse min-w-[1150px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
                <th className="w-10 px-3 py-2.5">
                  <button onClick={toggleAll} className={`w-4 h-4 rounded border flex items-center justify-center ${allSelected ? "bg-blue-600 border-blue-600" : "border-slate-300 hover:border-blue-400"}`}>
                    {allSelected && <Check size={10} color="white" strokeWidth={3} />}
                  </button>
                </th>
                <th className="w-12 px-2 py-2.5 text-left font-semibold text-slate-500 text-[10px] uppercase tracking-wider">{lang === "vi" ? "Ảnh" : "Img"}</th>
                {colHeaders.map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map(p => (
                <tr key={p.id} className="border-b hover:bg-slate-50/60 group" style={{ borderColor: "var(--border)" }}>
                  <td className="px-3 py-2">
                    <button onClick={() => toggleOne(p.id)} className={`w-4 h-4 rounded border flex items-center justify-center ${selected.includes(p.id) ? "bg-blue-600 border-blue-600" : "border-slate-300 hover:border-blue-400"}`}>
                      {selected.includes(p.id) && <Check size={10} color="white" strokeWidth={3} />}
                    </button>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="w-9 h-9 rounded-lg overflow-hidden bg-slate-100">
                      <img src={getImg(p.category)} alt={p.name} className="w-full h-full object-cover" loading="lazy"
                        onError={e => { (e.target as HTMLImageElement).src = productImages.default }} />
                    </div>
                  </td>
                  <td className="px-3 py-2 mono text-slate-600 whitespace-nowrap">{p.sku}</td>
                  <td className="px-3 py-2 mono text-slate-400 whitespace-nowrap">{p.barcode || "—"}</td>
                  <td className="px-3 py-2 font-medium text-slate-800 max-w-[200px]">
                    <button onClick={() => setDetailProduct(p)} className="hover:text-blue-600 text-left truncate max-w-[150px] align-middle">{p.name}</button>
                    {(p as any).source === "dataDemo" && <span className="ml-1.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[8px] font-bold text-violet-700">DEMO</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{p.category}</td>
                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{p.brand}</td>
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{p.unit}</td>
                  <td className="px-3 py-2 mono text-slate-700 text-right whitespace-nowrap">{fmt(Number((p as any).average_cost ?? p.cost))}</td>
                  <td className="px-3 py-2 mono text-slate-900 font-semibold text-right whitespace-nowrap">{fmt(p.price)}</td>
                  <td className="px-3 py-2 mono text-center">
                    <span className={`font-bold ${p.qty === 0 ? "text-red-500" : p.qty < 10 ? "text-amber-600" : "text-slate-800"}`}>{p.qty}</span>
                  </td>
                  <td className="px-3 py-2"><StatusBadge status={p.status} /></td>
                  <td className="px-3 py-2 mono text-slate-400 text-[10px] whitespace-nowrap">{formatDateTimeUtc7(p.updated)}</td>
                  <td className="px-3 py-2">
                    <div className="relative flex items-center justify-end" ref={actionRow === p.id ? actionMenuRef : null}>
                      <button onClick={() => setActionRow(actionRow === p.id ? null : p.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 opacity-0 group-hover:opacity-100">
                        <MoreHorizontal size={14} />
                      </button>
                      {actionRow === p.id && makeActionMenu(p)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {paged.map(p => (
              <div key={p.id} className="bg-white border rounded-xl overflow-hidden hover:shadow-md transition-all group flex flex-col" style={{ borderColor: "var(--border)" }}>
                <div className="relative aspect-square bg-slate-50 overflow-hidden">
                  <img src={getImg(p.category)} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy"
                    onError={e => { (e.target as HTMLImageElement).src = productImages.default }} />
                  <div className={`absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${p.qty === 0 ? "bg-red-500 text-white" : p.qty < 10 ? "bg-amber-400 text-white" : "bg-emerald-500 text-white"}`}>
                    {p.qty === 0 ? (lang === "vi" ? "Hết" : "Out") : p.qty}
                  </div>
                  <button onClick={e => { e.stopPropagation(); toggleOne(p.id) }}
                    className={`absolute top-2 left-2 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${selected.includes(p.id) ? "bg-blue-600 border-blue-600 opacity-100" : "bg-white/80 border-slate-300 opacity-0 group-hover:opacity-100"}`}>
                    {selected.includes(p.id) && <Check size={10} color="white" strokeWidth={3} />}
                  </button>
                  {p.status === "Inactive" && (
                    <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-slate-400 uppercase bg-white px-2 py-0.5 rounded-full border" style={{ borderColor: "var(--border)" }}>
                        {lang === "vi" ? "Ngừng bán" : "Inactive"}
                      </span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    ref={actionRow === p.id ? actionMenuRef : null}>
                    <button onClick={e => { e.stopPropagation(); setActionRow(actionRow === p.id ? null : p.id) }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/90 text-slate-600 hover:bg-white shadow">
                      <MoreHorizontal size={14} />
                    </button>
                    {actionRow === p.id && (
                      <div className="absolute bottom-9 right-0 z-30 bg-white border rounded-xl shadow-xl py-1 min-w-[150px]" style={{ borderColor: "var(--border)" }}>
                        {[
                          { icon: <Eye size={13} />, label: t("view"), onClick: () => { setDetailProduct(p); setActionRow(null) } },
                          { icon: <Edit size={13} />, label: t("edit"), onClick: () => openEdit(p) },
                          { icon: <Copy size={13} />, label: t("duplicate"), onClick: () => handleDuplicate(p) },
                        ].map(a => (
                          <button key={a.label} onClick={a.onClick} className="w-full flex items-center gap-2 px-3 h-8 text-xs text-slate-700 hover:bg-slate-50">{a.icon} {a.label}</button>
                        ))}
                        <div className="border-t my-1" style={{ borderColor: "var(--border)" }} />
                        <button onClick={() => { setDeleteTarget(p); setActionRow(null) }} className="w-full flex items-center gap-2 px-3 h-8 text-xs text-red-600 hover:bg-red-50"><Trash2 size={13} /> {t("delete")}</button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="p-2.5 flex flex-col gap-1 flex-1 cursor-pointer" onClick={() => setDetailProduct(p)}>
                  <div className="text-[10px] mono text-slate-400">{p.sku}</div>
                  <div className="text-xs font-semibold text-slate-800 leading-tight line-clamp-2">{p.name} {(p as any).source === "dataDemo" && <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[8px] font-bold text-violet-700">DEMO</span>}</div>
                  <div className="text-[10px] text-slate-400">{p.brand} · {p.category}</div>
                  <div className="mt-auto pt-1.5 border-t flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
                    <span className="text-[10px] text-slate-400">{lang === "vi" ? "Giá bán" : "Price"}</span>
                    <span className="text-xs font-bold text-blue-700 mono">{fmt(p.price)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-white border-t flex-shrink-0 flex-wrap gap-2" style={{ borderColor: "var(--border)" }}>
        <span className="text-xs text-slate-500">
          {t("showing")} {totalProducts === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min((page - 1) * pageSize + products.length, totalProducts)} {t("of")} {totalProducts} {lang === "vi" ? "sản phẩm" : "products"}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="w-7 h-7 flex items-center justify-center rounded-md border disabled:opacity-40 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
            <ChevronLeft size={13} />
          </button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const n = totalPages <= 5 ? i + 1 : Math.max(1, Math.min(page - 2, totalPages - 4)) + i
            return (
              <button key={n} onClick={() => setPage(n)}
                className={`w-7 h-7 flex items-center justify-center rounded-md text-xs font-medium ${page === n ? "bg-blue-600 text-white" : "border text-slate-600 hover:bg-slate-50"}`}
                style={page !== n ? { borderColor: "var(--border)" } : {}}>
                {n}
              </button>
            )
          })}
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="w-7 h-7 flex items-center justify-center rounded-md border disabled:opacity-40 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
            <ChevronRight size={13} />
          </button>
        </div>
        <div className="text-xs text-slate-500">{loadingProducts ? (lang === "vi" ? "Đang tải..." : "Loading...") : `${pageSize} ${lang === "vi" ? "dòng/trang" : "rows/page"}`}</div>
      </div>

      {/* Modals — all top-level components, stable references */}
      {detailProduct && (
        <ProductDetailModal
          product={detailProduct}
          onEdit={openEdit}
          onDelete={p => { setDeleteTarget(p); setDetailProduct(null) }}
          onClose={() => setDetailProduct(null)}
          canEdit={can("Master Data", "update")}
          canDelete={can("Master Data", "delete")}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmDialog product={deleteTarget} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      )}
      {showImportModal && <ProductImportModal onClose={() => setShowImportModal(false)} onImport={handleImport} lang={lang} loadWarehouses={loadWarehouses} warehouseId={importWarehouseId} warehouseOption={importWarehouseOption} onWarehouseChange={(value, option) => { setImportWarehouseId(value); setImportWarehouseOption(option) }} />}
      {(showCreate || editingProduct) && (
        <ProductFormModal
          editingProduct={editingProduct}
          form={form}
          setForm={setForm}
          loadCategories={loadCategories}
          loadBrands={loadBrands}
          loadUnits={loadUnits}
          loadWarehouses={loadWarehouses}
          onSave={handleSave}
          onClose={closeForm}
        />
      )}
    </div>
  )
}
