import { useState, useRef, useEffect } from "react"
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
import { fetchProducts } from "../lib/dataService"
import { useLang } from "../i18n/LangContext"
import { exportCsv, exportXlsx } from "./GenericList"
import * as XLSX from "xlsx"

function fmt(n: number) { return new Intl.NumberFormat("vi-VN").format(n) }

function downloadCsvTemplate(filename: string, cols: string[]) {
  const csv = cols.join(",") + "\n" + cols.map(() => "").join(",")
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url; a.download = filename + "_template.csv"; a.click()
  URL.revokeObjectURL(url)
}

function downloadXlsxTemplate(filename: string, cols: string[]) {
  const ws = XLSX.utils.aoa_to_sheet([cols, cols.map(() => "")])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Template")
  XLSX.writeFile(wb, filename + "_template.xlsx")
}

const PRODUCT_TEMPLATE_COLS = ["sku","barcode","product_name","category","brand","unit","purchase_price","selling_price","tax_pct","min_stock","max_stock","description","status"]

function ProductImportModal({ onClose, lang }: { onClose: () => void; lang: string }) {
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
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <FileDown size={15} className="text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="text-xs font-semibold text-slate-800 mb-0.5">{lang === "vi" ? "Bước 1: Tải file mẫu" : "Step 1: Download Template"}</div>
                <div className="text-[11px] text-slate-500 mb-2.5">{lang === "vi" ? "Tải file mẫu, điền dữ liệu đúng định dạng rồi upload lên." : "Download a template, fill in your data, then upload."}</div>
                <div className="flex items-center gap-2">
                  <button onClick={() => downloadCsvTemplate("products", PRODUCT_TEMPLATE_COLS)} className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-blue-600 text-white text-[11px] font-medium hover:bg-blue-700">
                    <FileDown size={12} /> {lang === "vi" ? "Mẫu CSV" : "CSV Template"}
                  </button>
                  <button onClick={() => downloadXlsxTemplate("products", PRODUCT_TEMPLATE_COLS)} className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-emerald-600 text-white text-[11px] font-medium hover:bg-emerald-700">
                    <FileSpreadsheet size={12} /> {lang === "vi" ? "Mẫu Excel" : "Excel Template"}
                  </button>
                </div>
                <div className="mt-2 text-[10px] text-slate-400 font-mono bg-slate-50 rounded-lg px-2 py-1.5 truncate">{PRODUCT_TEMPLATE_COLS.slice(0, 6).join(", ")} +{PRODUCT_TEMPLATE_COLS.length - 6} more</div>
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
          <button disabled={!file} onClick={() => { alert(lang === "vi" ? "Nhập dữ liệu thành công!" : "Import successful!"); onClose() }} className="h-8 px-4 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">{lang === "vi" ? "Nhập dữ liệu" : "Import"}</button>
        </div>
      </div>
    </div>
  )
}

const PAGE_SIZE_LIST = 10
const PAGE_SIZE_GRID = 12

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
  minStock: string; maxStock: string; description: string; status: string
  trackInventory: boolean; trackSerial: boolean; trackBatch: boolean; allowNegative: boolean
}

const emptyForm: FormState = {
  name: "", sku: "", barcode: "", category: "", brand: "", unit: "",
  purchasePrice: "", sellingPrice: "", tax: "", minStock: "", maxStock: "",
  description: "", status: "Active",
  trackInventory: true, trackSerial: false, trackBatch: false, allowNegative: false,
}

function productToForm(p: Product): FormState {
  return {
    name: p.name, sku: p.sku, barcode: p.barcode, category: p.category,
    brand: p.brand, unit: p.unit, purchasePrice: String(p.cost),
    sellingPrice: String(p.price), tax: "", minStock: "", maxStock: "",
    description: "", status: p.status,
    trackInventory: true, trackSerial: false, trackBatch: false, allowNegative: false,
  }
}

// ---- Top-level ProductFormModal (stable reference, receives all state via props) ----
interface ProductFormModalProps {
  editingProduct: Product | null
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  onSave: () => void
  onClose: () => void
}

function ProductFormModal({ editingProduct, form, setForm, onSave, onClose }: ProductFormModalProps) {
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
                [t("category"), "category", ["Laptop", "Phone", "Monitor", "Keyboard", "Storage", "Memory", "Network", "Security", "Power"]],
                [t("brand"), "brand", ["Dell", "Samsung", "Apple", "LG", "Logitech", "WD", "Kingston", "TP-Link", "APC"]],
                [t("unit"), "unit", ["Cái", "Hộp", "Bộ", "Kg", "Mét", "Piece", "Set"]],
                [t("status"), "status", ["Active", "Draft", "Inactive"]],
              ] as [string, string, string[]][]).map(([label, key, opts]) => (
                <div key={key}>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">{label}</label>
                  <select value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full h-8 px-3 rounded-lg border text-xs outline-none focus:ring-2 focus:ring-blue-500/20 bg-white" style={{ borderColor: "var(--border)" }}>
                    <option value="">{lang === "vi" ? "Chọn..." : "Select..."}</option>
                    {opts.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
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
                  <input type="number" placeholder="0" value={(form as any)[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full h-8 px-3 rounded-lg border text-xs outline-none focus:ring-2 focus:ring-blue-500/20 mono" style={{ borderColor: "var(--border)" }} />
                </div>
              ))}
            </div>
          </div>

          {/* Inventory Settings */}
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">{t("inventorySettings")}</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {([
                [t("minStock"), "minStock"],
                [t("maxStock"), "maxStock"],
              ] as [string, string][]).map(([label, key]) => (
                <div key={key}>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">{label}</label>
                  <input type="number" placeholder="0" value={(form as any)[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full h-8 px-3 rounded-lg border text-xs outline-none focus:ring-2 focus:ring-blue-500/20 mono" style={{ borderColor: "var(--border)" }} />
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
interface ProductDetailProps { product: Product; onEdit: (p: Product) => void; onDelete: (p: Product) => void; onClose: () => void }

function ProductDetailModal({ product, onEdit, onDelete, onClose }: ProductDetailProps) {
  const { t, lang } = useLang()
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
                [lang === "vi" ? "Giá nhập" : "Cost Price", fmt(product.cost) + " ₫", true],
                [lang === "vi" ? "Giá bán" : "Sell Price", fmt(product.price) + " ₫", false],
                [lang === "vi" ? "Lợi nhuận" : "Margin",
                  product.price > 0 ? `${Math.round((product.price - product.cost) / product.price * 100)}%` : "—", true],
                [lang === "vi" ? "Tồn kho" : "Stock Qty", String(product.qty), false],
              ].map(([l, v, mono]) => (
                <div key={String(l)} className="bg-slate-50 rounded-xl p-3">
                  <div className="text-[10px] text-slate-400 font-medium">{l}</div>
                  <div className={`text-sm font-bold text-slate-900 mt-0.5 ${mono ? "mono" : ""}`}>{v}</div>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-slate-400 flex gap-4 pt-1">
              <span>{lang === "vi" ? "Cập nhật" : "Updated"}: <span className="mono text-slate-600">{product.updated}</span></span>
              <span>{lang === "vi" ? "Bởi" : "By"}: <span className="text-blue-600">{product.updatedBy}</span></span>
            </div>
          </div>
          <div className="flex gap-2 px-5 py-3.5 border-t bg-slate-50" style={{ borderColor: "var(--border)" }}>
            <button onClick={() => onEdit(product)} className="flex-1 h-8 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 flex items-center justify-center gap-1.5">
              <Edit size={12} /> {t("edit")}
            </button>
            <button onClick={() => onDelete(product)} className="h-8 px-4 rounded-lg border text-xs text-red-600 hover:bg-red-50 flex items-center gap-1.5" style={{ borderColor: "var(--border)" }}>
              <Trash2 size={12} /> {t("delete")}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- Main Products screen ----
export default function Products() {
  const { t, lang } = useLang()
  const [products, setProducts] = useState<any[]>(initialProducts)
  const { isDemo } = useDemo()
  const { profile } = useAuth()

  useEffect(() => {
    fetchProducts({ isDemo, orgId: profile?.org_id }).then(res => {
      if (res.data) setProducts(res.data)
    })
  }, [isDemo, profile])
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<string[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [actionRow, setActionRow] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [filterStatus, setFilterStatus] = useState("all")
  const [filterCategory, setFilterCategory] = useState("all")
  const [viewMode, setViewMode] = useState<"list" | "grid">("list")
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [detailProduct, setDetailProduct] = useState<Product | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [showImportModal, setShowImportModal] = useState(false)
  const actionMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) setActionRow(null)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const categories = ["all", ...Array.from(new Set(products.map(p => p.category)))]

  const filtered = products.filter(p =>
    (filterStatus === "all" || p.status === filterStatus) &&
    (filterCategory === "all" || p.category === filterCategory) &&
    (search === "" || p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) || p.barcode.includes(search))
  )

  const pageSize = viewMode === "grid" ? PAGE_SIZE_GRID : PAGE_SIZE_LIST
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)

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

  const openCreate = () => { setForm(emptyForm); setShowCreate(true) }
  const openEdit = (p: Product) => { setEditingProduct(p); setForm(productToForm(p)); setActionRow(null); setDetailProduct(null) }
  const closeForm = () => { setShowCreate(false); setEditingProduct(null) }

  const handleSave = () => {
    if (!form.name.trim()) { showToast(lang === "vi" ? "Vui lòng nhập tên sản phẩm" : "Please enter product name", false); return }
    if (editingProduct) {
      setProducts(prev => prev.map(p => p.id === editingProduct.id ? {
        ...p, name: form.name, sku: form.sku || p.sku, barcode: form.barcode,
        category: form.category || p.category, brand: form.brand || p.brand,
        unit: form.unit || p.unit, cost: Number(form.purchasePrice) || p.cost,
        price: Number(form.sellingPrice) || p.price, status: form.status,
        updated: new Date().toISOString().slice(0, 10), updatedBy: "Nguyễn Văn A",
      } : p))
      closeForm()
      showToast(lang === "vi" ? "Cập nhật sản phẩm thành công!" : "Product updated!")
    } else {
      const newId = `P${String(products.length + 1).padStart(3, "0")}`
      setProducts(prev => [...prev, {
        id: newId, sku: form.sku || `SKU-${newId}`, barcode: form.barcode || "",
        name: form.name, category: form.category || "—", brand: form.brand || "—",
        unit: form.unit || "Piece", cost: Number(form.purchasePrice) || 0,
        price: Number(form.sellingPrice) || 0, qty: 0, status: form.status,
        updated: new Date().toISOString().slice(0, 10), updatedBy: "Nguyễn Văn A",
      }])
      closeForm()
      showToast(lang === "vi" ? "Tạo sản phẩm thành công!" : "Product created!")
    }
  }

  const handleDelete = () => {
    if (!deleteTarget) return
    setProducts(prev => prev.filter(p => p.id !== deleteTarget.id))
    setDetailProduct(null)
    setDeleteTarget(null)
    showToast(lang === "vi" ? "Đã xóa sản phẩm" : "Product deleted")
  }

  const handleDuplicate = (p: Product) => {
    const newId = `P${String(products.length + 1).padStart(3, "0")}`
    setProducts(prev => [...prev, { ...p, id: newId, sku: `${p.sku}-COPY`, name: `${p.name} (Copy)`, qty: 0, updated: new Date().toISOString().slice(0, 10) }])
    setActionRow(null)
    showToast(lang === "vi" ? "Đã sao chép sản phẩm" : "Product duplicated")
  }

  const statusOptions = [
    { key: "all", label: lang === "vi" ? "Tất cả" : "All" },
    { key: "Active", label: lang === "vi" ? "Hoạt động" : "Active" },
    { key: "Inactive", label: lang === "vi" ? "Ngừng" : "Inactive" },
  ]

  const colHeaders = lang === "vi"
    ? ["SKU", "Mã vạch", "Tên sản phẩm", "Danh mục", "Thương hiệu", "ĐVT", "Giá nhập", "Giá bán", "Tồn", "Trạng thái", "Cập nhật", ""]
    : ["SKU", "Barcode", "Product Name", "Category", "Brand", "Unit", "Cost", "Sell Price", "Qty", "Status", "Updated", ""]

  const makeActionMenu = (p: Product) => (
    <div className="absolute right-0 top-8 z-30 bg-white border rounded-xl shadow-xl py-1 min-w-[150px]" style={{ borderColor: "var(--border)" }}>
      {[
        { icon: <Eye size={13} />, label: t("view"), onClick: () => { setDetailProduct(p); setActionRow(null) } },
        { icon: <Edit size={13} />, label: t("edit"), onClick: () => openEdit(p) },
        { icon: <Copy size={13} />, label: t("duplicate"), onClick: () => handleDuplicate(p) },
        { icon: <Archive size={13} />, label: t("archive"), onClick: () => { setActionRow(null); showToast(lang === "vi" ? "Đã lưu trữ" : "Archived") } },
      ].map(a => (
        <button key={a.label} onClick={a.onClick} className="w-full flex items-center gap-2 px-3 h-8 text-xs text-slate-700 hover:bg-slate-50">
          {a.icon} {a.label}
        </button>
      ))}
      <div className="border-t my-1" style={{ borderColor: "var(--border)" }} />
      <button onClick={() => { setDeleteTarget(p); setActionRow(null) }} className="w-full flex items-center gap-2 px-3 h-8 text-xs text-red-600 hover:bg-red-50">
        <Trash2 size={13} /> {t("delete")}
      </button>
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
        <button onClick={openCreate} className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700">
          <Plus size={13} /> {t("create")}
        </button>
        <button onClick={() => setShowImportModal(true)} className="flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs text-slate-600 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
          <Upload size={13} /> {t("import")}
        </button>
        <div className="relative group">
          <button className="flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs text-slate-600 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
            <Download size={13} /> {t("export")}
          </button>
          <div className="absolute top-full left-0 mt-1 hidden group-hover:flex flex-col bg-white border rounded-lg shadow-lg w-32 z-50 overflow-hidden" style={{ borderColor: "var(--border)" }}>
            <button onClick={() => exportCsv("products", ["SKU", "Barcode", t("productName"), t("category"), "Brand", "Unit", "Cost", "Price", "Available", t("status")], filtered.map(p => [p.sku, p.barcode, p.name, p.category, p.brand, p.unit, p.cost, p.price, p.available, p.status]))} className="px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50">CSV</button>
            <button onClick={() => exportXlsx("products", ["SKU", "Barcode", t("productName"), t("category"), "Brand", "Unit", "Cost", "Price", "Available", t("status")], filtered.map(p => [p.sku, p.barcode, p.name, p.category, p.brand, p.unit, p.cost, p.price, p.available, p.status]))} className="px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50">Excel</button>
          </div>
        </div>
        <button className="flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs text-slate-600 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
          <Printer size={13} /> {t("print")}
        </button>
        <div className="flex-1" />
        <div className="relative">
          <Tag size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(1) }}
            className="h-8 pl-7 pr-6 rounded-lg border text-xs outline-none bg-white appearance-none" style={{ borderColor: "var(--border)" }}>
            {categories.map(c => <option key={c} value={c}>{c === "all" ? (lang === "vi" ? "Tất cả danh mục" : "All Categories") : c}</option>)}
          </select>
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
        <button className="w-8 h-8 flex items-center justify-center rounded-lg border text-slate-500 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Selection bar */}
      {selected.length > 0 && (
        <div className="flex items-center gap-3 px-5 py-2 bg-blue-50 border-b text-xs" style={{ borderColor: "var(--border)" }}>
          <span className="text-blue-700 font-semibold">{selected.length} {t("selected")}</span>
          <button onClick={() => showToast(lang === "vi" ? "Đã lưu trữ" : "Archived")} className="text-blue-600 hover:underline">{t("archive")}</button>
          <button onClick={() => { setProducts(prev => prev.filter(p => !selected.includes(p.id))); setSelected([]); showToast(lang === "vi" ? "Đã xóa" : "Deleted") }} className="text-red-600 hover:underline">{t("delete")}</button>
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
                    <button onClick={() => setDetailProduct(p)} className="hover:text-blue-600 text-left truncate w-full">{p.name}</button>
                  </td>
                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{p.category}</td>
                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{p.brand}</td>
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{p.unit}</td>
                  <td className="px-3 py-2 mono text-slate-700 text-right whitespace-nowrap">{fmt(p.cost)}</td>
                  <td className="px-3 py-2 mono text-slate-900 font-semibold text-right whitespace-nowrap">{fmt(p.price)}</td>
                  <td className="px-3 py-2 mono text-center">
                    <span className={`font-bold ${p.qty === 0 ? "text-red-500" : p.qty < 10 ? "text-amber-600" : "text-slate-800"}`}>{p.qty}</span>
                  </td>
                  <td className="px-3 py-2"><StatusBadge status={p.status} /></td>
                  <td className="px-3 py-2 mono text-slate-400 text-[10px] whitespace-nowrap">{p.updated}</td>
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
                  <div className="text-xs font-semibold text-slate-800 leading-tight line-clamp-2">{p.name}</div>
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
          {t("showing")} {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} {t("of")} {filtered.length} {lang === "vi" ? "sản phẩm" : "products"}
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
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {t("rowsPerPage")}:
          <select className="border rounded px-1.5 h-6 text-xs outline-none" style={{ borderColor: "var(--border)" }}>
            <option>10</option><option>25</option><option>50</option>
          </select>
        </div>
      </div>

      {/* Modals — all top-level components, stable references */}
      {detailProduct && (
        <ProductDetailModal
          product={detailProduct}
          onEdit={openEdit}
          onDelete={p => { setDeleteTarget(p); setDetailProduct(null) }}
          onClose={() => setDetailProduct(null)}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmDialog product={deleteTarget} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      )}
      {showImportModal && <ProductImportModal onClose={() => setShowImportModal(false)} lang={lang} />}
      {(showCreate || editingProduct) && (
        <ProductFormModal
          editingProduct={editingProduct}
          form={form}
          setForm={setForm}
          onSave={handleSave}
          onClose={closeForm}
        />
      )}
    </div>
  )
}
