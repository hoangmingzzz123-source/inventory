import { Plus, Search, Download, RefreshCw, MoreHorizontal, ChevronLeft, ChevronRight, X, Check, Printer, ArrowRight, AlertTriangle, TrendingUp, TrendingDown, BarChart2, Filter, Package, Truck, CreditCard, DollarSign, BookOpen, ArrowLeftRight, Upload, FileDown, FileSpreadsheet, ShoppingCart, Layers } from "lucide-react"
import { useState, useRef } from "react"
import StatusBadge from "../components/StatusBadge"
import { customers, suppliers, warehouses, salesOrders, inventoryBalance, auditLogs, stockLedger } from "../data/mockData"
import { useLang } from "../i18n/LangContext"
import * as XLSX from "xlsx"
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts"

function fmt(n: number) { return new Intl.NumberFormat("vi-VN").format(n) }

// --- Download CSV template utility ---
function downloadTemplate(filename: string, cols: string[]) {
  const csv = cols.join(",") + "\n" + cols.map(() => "").join(",")
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url; a.download = filename + "_template.csv"; a.click()
  URL.revokeObjectURL(url)
}

function downloadTemplateXlsx(filename: string, cols: string[]) {
  const ws = XLSX.utils.aoa_to_sheet([cols, cols.map(() => "")])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Template")
  XLSX.writeFile(wb, filename + "_template.xlsx")
}

// --- Import Modal ---
function ImportModal({ onClose, filename, cols, lang }: { onClose: () => void; filename: string; cols: string[]; lang: string }) {
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f && (f.name.endsWith(".csv") || f.name.endsWith(".xlsx"))) setFile(f)
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
                    onClick={() => downloadTemplateXlsx(filename, cols)}
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
                  <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden"
                    onChange={e => e.target.files?.[0] && setFile(e.target.files[0])} />
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

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t bg-slate-50" style={{ borderColor: "var(--border)" }}>
          <button onClick={onClose} className="h-8 px-4 rounded-lg border text-xs text-slate-600 hover:bg-white" style={{ borderColor: "var(--border)" }}>
            {lang === "vi" ? "Hủy" : "Cancel"}
          </button>
          <button
            disabled={!file}
            onClick={() => { alert(lang === "vi" ? "Đã nhập dữ liệu thành công!" : "Data imported successfully!"); onClose() }}
            className="h-8 px-4 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {lang === "vi" ? "Nhập dữ liệu" : "Import"}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Toolbar shared ---
function Toolbar({ onSearch, search, onCreate, createLabel, onImport, templateFile, templateCols, extra, onExportCsv, onExportXlsx }: {
  onSearch?: (v: string) => void; search?: string; onCreate?: () => void; createLabel?: string
  onImport?: () => void; templateFile?: string; templateCols?: string[]; extra?: React.ReactNode;
  onExportCsv?: () => void; onExportXlsx?: () => void
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
        {(onExportCsv || onExportXlsx) ? (
          <div className="relative group">
            <button className="flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs text-slate-600 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
              <Download size={13} /> {t("export")}
            </button>
            <div className="absolute top-full left-0 mt-1 hidden group-hover:flex flex-col bg-white border rounded-lg shadow-lg w-32 z-50 overflow-hidden" style={{ borderColor: "var(--border)" }}>
              {onExportCsv && <button onClick={onExportCsv} className="px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50">CSV</button>}
              {onExportXlsx && <button onClick={onExportXlsx} className="px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50">Excel</button>}
            </div>
          </div>
        ) : (
          <button className="flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs text-slate-600 hover:bg-slate-50 opacity-50 cursor-not-allowed" style={{ borderColor: "var(--border)" }}>
            <Download size={13} /> {t("export")}
          </button>
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
        {extra}
        <div className="flex-1" />
        {onSearch && (
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search ?? ""} onChange={e => onSearch(e.target.value)} placeholder={t("searchPlaceholder")} className="h-8 pl-8 pr-3 rounded-lg border text-xs outline-none focus:ring-2 focus:ring-blue-500/20 w-52" style={{ borderColor: "var(--border)" }} />
          </div>
        )}
        <button className="w-8 h-8 flex items-center justify-center rounded-lg border text-slate-500 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
          <RefreshCw size={13} />
        </button>
      </div>
      {showImport && templateCols && (
        <ImportModal
          onClose={() => setShowImport(false)}
          filename={templateFile ?? "template"}
          cols={templateCols}
          lang={lang}
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
      <div className="flex items-center gap-1">
        <button className="w-7 h-7 flex items-center justify-center rounded-md border hover:bg-slate-50" style={{ borderColor: "var(--border)" }}><ChevronLeft size={13} /></button>
        <button className="w-7 h-7 flex items-center justify-center rounded-md bg-blue-600 text-white">1</button>
        <button className="w-7 h-7 flex items-center justify-center rounded-md border hover:bg-slate-50" style={{ borderColor: "var(--border)" }}><ChevronRight size={13} /></button>
      </div>
    </div>
  )
}

// --- Customers ---
export function Customers() {
  const { t, lang } = useLang()
  const [search, setSearch] = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [dataList, setDataList] = useState(customers)
  
  const filtered = dataList.filter(c => search === "" || c.name.toLowerCase().includes(search.toLowerCase()) || c.code.includes(search))
  const heads = lang === "vi"
    ? ["Mã KH", "Tên khách hàng", "Điện thoại", "Email", "MST", "Hạn mức TD", "Công nợ", "Trạng thái", ""]
    : ["Code", "Customer Name", "Phone", "Email", "Tax Code", "Credit Limit", "Debt", "Status", ""]
    
  return (
    <div className="flex flex-col h-full">
      <Toolbar search={search} onSearch={setSearch} onCreate={() => setShowCreate(true)} createLabel={lang === "vi" ? "Thêm khách hàng" : "Add Customer"}
        templateFile="customers" templateCols={["customer_code","customer_name","phone","email","tax_code","address","credit_limit","status"]}
        onExportCsv={() => exportCsv("customers", heads.slice(0,-1), filtered.map(c => [c.code, c.name, c.phone, c.email, c.taxCode, c.creditLimit, c.debt, c.status]))}
        onExportXlsx={() => exportXlsx("customers", heads.slice(0,-1), filtered.map(c => [c.code, c.name, c.phone, c.email, c.taxCode, c.creditLimit, c.debt, c.status]))}
      />
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse min-w-[900px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
              {heads.map(h => <th key={h} className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.code} className="border-b hover:bg-slate-50/60 group cursor-pointer" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-2.5 mono text-blue-600 font-medium">{c.code}</td>
                <td className="px-4 py-2.5 font-medium text-slate-800">{c.name}</td>
                <td className="px-4 py-2.5 mono text-slate-500">{c.phone}</td>
                <td className="px-4 py-2.5 text-slate-500">{c.email}</td>
                <td className="px-4 py-2.5 mono text-slate-400">{c.taxCode || "—"}</td>
                <td className="px-4 py-2.5 mono text-right text-slate-700">{fmt(c.creditLimit)}</td>
                <td className={`px-4 py-2.5 mono text-right font-semibold ${c.debt > 0 ? "text-amber-600" : "text-emerald-600"}`}>{fmt(c.debt)}</td>
                <td className="px-4 py-2.5"><StatusBadge status={c.status} /></td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    <button className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"><MoreHorizontal size={14} /></button>
                    <button onClick={(e) => { e.stopPropagation(); setDataList(dataList.filter(x => x.code !== c.code)) }} className="w-7 h-7 flex items-center justify-center rounded-md text-red-400 hover:bg-red-50 hover:text-red-500"><X size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager count={filtered.length} total={dataList.length} label={lang === "vi" ? "khách hàng" : "customers"} />

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="text-sm font-semibold">{lang === "vi" ? "Thêm khách hàng" : "Add Customer"}</h2>
              <button onClick={() => setShowCreate(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"><X size={14} /></button>
            </div>
            <form onSubmit={e => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setDataList([...dataList, {
                code: fd.get("code") as string || "NEW",
                name: fd.get("name") as string || "New",
                phone: fd.get("phone") as string || "",
                email: fd.get("email") as string || "",
                taxCode: fd.get("taxCode") as string || "",
                creditLimit: Number(fd.get("creditLimit")) || 0,
                debt: 0,
                status: "Active"
              }]);
              setShowCreate(false);
            }}>
              <div className="p-5 grid grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto">
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Mã KH" : "Code"}</label><input name="code" className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Tên KH *" : "Name *"}</label><input name="name" required className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">Phone</label><input name="phone" className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">Email</label><input name="email" type="email" className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">Tax Code</label><input name="taxCode" className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">Credit Limit</label><input name="creditLimit" type="number" defaultValue="0" className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
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
// --- Suppliers ---
export function Suppliers() {
  const { t, lang } = useLang()
  const [search, setSearch] = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [dataList, setDataList] = useState(suppliers)

  const filtered = dataList.filter(s => search === "" || s.name.toLowerCase().includes(search.toLowerCase()) || s.code.includes(search))
  const heads = lang === "vi"
    ? ["Mã NCC", "Tên nhà cung cấp", "Điện thoại", "Email", "MST", "Công nợ", "Trạng thái", ""]
    : ["Code", "Supplier Name", "Phone", "Email", "Tax Code", "Debt", "Status", ""]
    
  return (
    <div className="flex flex-col h-full">
      <Toolbar search={search} onSearch={setSearch} onCreate={() => setShowCreate(true)} createLabel={lang === "vi" ? "Thêm nhà cung cấp" : "Add Supplier"}
        templateFile="suppliers" templateCols={["supplier_code","supplier_name","phone","email","tax_code","address","payment_terms","status"]}
        onExportCsv={() => exportCsv("suppliers", heads.slice(0,-1), filtered.map(s => [s.code, s.name, s.phone, s.email, s.taxCode, s.debt, s.status]))}
        onExportXlsx={() => exportXlsx("suppliers", heads.slice(0,-1), filtered.map(s => [s.code, s.name, s.phone, s.email, s.taxCode, s.debt, s.status]))}
      />
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse min-w-[800px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
              {heads.map(h => <th key={h} className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.code} className="border-b hover:bg-slate-50/60 group cursor-pointer" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-2.5 mono text-blue-600 font-medium">{s.code}</td>
                <td className="px-4 py-2.5 font-medium text-slate-800">{s.name}</td>
                <td className="px-4 py-2.5 mono text-slate-500">{s.phone}</td>
                <td className="px-4 py-2.5 text-slate-500">{s.email}</td>
                <td className="px-4 py-2.5 mono text-slate-400">{s.taxCode || "—"}</td>
                <td className={`px-4 py-2.5 mono text-right font-semibold ${s.debt > 0 ? "text-amber-600" : "text-emerald-600"}`}>{fmt(s.debt)}</td>
                <td className="px-4 py-2.5"><StatusBadge status={s.status} /></td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    <button className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"><MoreHorizontal size={14} /></button>
                    <button onClick={(e) => { e.stopPropagation(); setDataList(dataList.filter(x => x.code !== s.code)) }} className="w-7 h-7 flex items-center justify-center rounded-md text-red-400 hover:bg-red-50 hover:text-red-500"><X size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager count={filtered.length} total={dataList.length} label={lang === "vi" ? "nhà cung cấp" : "suppliers"} />

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="text-sm font-semibold">{lang === "vi" ? "Thêm nhà cung cấp" : "Add Supplier"}</h2>
              <button onClick={() => setShowCreate(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"><X size={14} /></button>
            </div>
            <form onSubmit={e => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setDataList([...dataList, {
                code: fd.get("code") as string || "NEW",
                name: fd.get("name") as string || "New",
                phone: fd.get("phone") as string || "",
                email: fd.get("email") as string || "",
                taxCode: fd.get("taxCode") as string || "",
                debt: 0,
                status: "Active"
              }]);
              setShowCreate(false);
            }}>
              <div className="p-5 grid grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto">
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Mã NCC" : "Code"}</label><input name="code" className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Tên NCC *" : "Name *"}</label><input name="name" required className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">Phone</label><input name="phone" className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">Email</label><input name="email" type="email" className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">Tax Code</label><input name="taxCode" className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
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
// --- Warehouses ---
export function Warehouses() {
  const { t, lang } = useLang()
  const [showCreate, setShowCreate] = useState(false)
  const [dataList, setDataList] = useState(warehouses)
  
  return (
    <div className="flex flex-col h-full">
      <Toolbar onCreate={() => setShowCreate(true)} createLabel={lang === "vi" ? "Thêm kho" : "Add Warehouse"} 
        onExportCsv={() => exportCsv("warehouses", ["Code", "Name", "Address", "Manager", "Phone", "Stock Value", "Status"], dataList.map(w => [w.code, w.name, w.address, w.manager, w.phone, w.stockValue, w.status]))}
        onExportXlsx={() => exportXlsx("warehouses", ["Code", "Name", "Address", "Manager", "Phone", "Stock Value", "Status"], dataList.map(w => [w.code, w.name, w.address, w.manager, w.phone, w.stockValue, w.status]))}
      />
      <div className="flex-1 overflow-auto p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {dataList.map(w => (
            <div key={w.code} className="bg-white rounded-xl border p-4 hover:shadow-md transition-shadow cursor-pointer relative group" style={{ borderColor: "var(--border)" }}>
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1">
                <button onClick={(e) => { e.stopPropagation(); setDataList(dataList.filter(x => x.code !== w.code)) }} className="w-6 h-6 bg-red-50 text-red-500 rounded flex items-center justify-center hover:bg-red-100"><X size={12}/></button>
              </div>
              <div className="flex items-start justify-between mb-3 pr-8">
                <div>
                  <div className="text-xs font-bold mono text-blue-600">{w.code}</div>
                  <div className="text-sm font-semibold text-slate-800 mt-0.5">{w.name}</div>
                </div>
                <StatusBadge status={w.status} />
              </div>
              <div className="space-y-1.5 text-xs text-slate-500">
                <div>{w.address}</div>
                <div>{lang === "vi" ? "Quản lý" : "Manager"}: <span className="text-slate-700 font-medium">{w.manager}</span></div>
                <div>{lang === "vi" ? "Điện thoại" : "Phone"}: <span className="mono text-slate-700">{w.phone}</span></div>
              </div>
              <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">{t("stockValue")}</div>
                <div className="text-base font-bold mono text-slate-900 mt-0.5">{fmt(w.stockValue)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="text-sm font-semibold">{lang === "vi" ? "Thêm kho" : "Add Warehouse"}</h2>
              <button onClick={() => setShowCreate(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"><X size={14} /></button>
            </div>
            <form onSubmit={e => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setDataList([...dataList, {
                code: fd.get("code") as string || "NEW",
                name: fd.get("name") as string || "New",
                manager: fd.get("manager") as string || "",
                phone: fd.get("phone") as string || "",
                address: fd.get("address") as string || "",
                stockValue: 0,
                status: "Active"
              }]);
              setShowCreate(false);
            }}>
              <div className="p-5 grid grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto">
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Mã Kho" : "Code"}</label><input name="code" className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Tên Kho *" : "Name *"}</label><input name="name" required className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">Manager</label><input name="manager" className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">Phone</label><input name="phone" className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div className="col-span-2"><label className="block text-[11px] font-medium text-slate-600 mb-1">Address</label><input name="address" className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
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
// --- Sales Orders ---
export function SalesOrders() {
  const { t, lang } = useLang()
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [dataList, setDataList] = useState(salesOrders)
  const [showCreate, setShowCreate] = useState(false)

  const filtered = dataList.filter(s =>
    (filterStatus === "all" || s.status === filterStatus) &&
    (search === "" || s.id.toLowerCase().includes(search.toLowerCase()) || s.customer.toLowerCase().includes(search.toLowerCase()))
  )
  const heads = lang === "vi"
    ? ["Số SO", "Khách hàng", "Kho", "Trạng thái", "Tổng tiền", "Người tạo", "Ngày tạo", ""]
    : ["SO Number", "Customer", "Warehouse", "Status", "Grand Total", "Created By", "Date", ""]
  const statusOpts = [
    { k: "all", l: lang === "vi" ? "Tất cả" : "All" },
    { k: "Draft", l: lang === "vi" ? "Nháp" : "Draft" },
    { k: "Approved", l: lang === "vi" ? "Đã duyệt" : "Approved" },
    { k: "Delivered", l: lang === "vi" ? "Đã giao" : "Delivered" },
    { k: "Completed", l: lang === "vi" ? "Hoàn tất" : "Completed" },
  ]
  return (
    <div className="flex flex-col h-full">
      <Toolbar search={search} onSearch={setSearch} onCreate={() => setShowCreate(true)} createLabel={lang === "vi" ? "Tạo đơn bán" : "Create SO"}
        onExportCsv={() => exportCsv("sales-orders", heads.slice(0, -1), filtered.map(s => [s.id, s.customer, s.warehouse, s.status, s.total, s.createdBy, s.date]))}
        onExportXlsx={() => exportXlsx("sales-orders", heads.slice(0, -1), filtered.map(s => [s.id, s.customer, s.warehouse, s.status, s.total, s.createdBy, s.date]))}
        extra={
          <div className="flex items-center border rounded-lg overflow-hidden text-xs" style={{ borderColor: "var(--border)" }}>
            {statusOpts.map(s => (
              <button key={s.k} onClick={() => setFilterStatus(s.k)} className={`h-8 px-2.5 whitespace-nowrap transition-colors ${filterStatus === s.k ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{s.l}</button>
            ))}
          </div>
        }
      />
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse min-w-[900px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
              {heads.map(h => <th key={h} className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map(so => (
              <tr key={so.id} className="border-b hover:bg-slate-50/60 group cursor-pointer" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-2.5 mono text-blue-600 font-semibold">{so.id}</td>
                <td className="px-4 py-2.5 font-medium text-slate-800">{so.customer}</td>
                <td className="px-4 py-2.5 text-slate-600">{so.warehouse}</td>
                <td className="px-4 py-2.5"><StatusBadge status={so.status} /></td>
                <td className="px-4 py-2.5 mono font-semibold text-right">{fmt(so.total)}</td>
                <td className="px-4 py-2.5 text-slate-500">{so.createdBy}</td>
                <td className="px-4 py-2.5 mono text-slate-400">{so.date}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    <button onClick={e => e.stopPropagation()} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"><MoreHorizontal size={14} /></button>
                    <button onClick={(e) => { e.stopPropagation(); setDataList(dataList.filter(x => x.id !== so.id)) }} className="w-7 h-7 flex items-center justify-center rounded-md text-red-400 hover:bg-red-50 hover:text-red-500"><X size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager count={filtered.length} total={dataList.length} label={lang === "vi" ? "đơn bán hàng" : "sales orders"} />

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="text-sm font-semibold">{lang === "vi" ? "Tạo đơn bán" : "Create SO"}</h2>
              <button onClick={() => setShowCreate(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"><X size={14} /></button>
            </div>
            <form onSubmit={e => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setDataList([...dataList, {
                id: fd.get("id") as string || "NEW",
                customer: fd.get("customer") as string || "New Customer",
                warehouse: "Main Warehouse",
                status: "Draft",
                total: Number(fd.get("total")) || 0,
                createdBy: "Current User",
                date: new Date().toISOString().split("T")[0]
              }]);
              setShowCreate(false);
            }}>
              <div className="p-5 grid gap-3">
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Số SO" : "SO Number"}</label><input name="id" className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Khách hàng" : "Customer"}</label><input name="customer" required className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Tổng tiền" : "Grand Total"}</label><input name="total" type="number" defaultValue="0" className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
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

// --- Stock Balance ---
export function StockBalance() {
  const { t, lang } = useLang()
  const [dataList, setDataList] = useState(inventoryBalance)
  const [search, setSearch] = useState("")
  const [showCreate, setShowCreate] = useState(false)

  const filtered = dataList.filter(r => search === "" || r.product.toLowerCase().includes(search.toLowerCase()) || r.sku.toLowerCase().includes(search.toLowerCase()))
  const heads = lang === "vi"
    ? ["Kho", "Sản phẩm", "SKU", "Khả dụng", "Đang giữ", "Đang về", "Đang xuất", "Giá vốn TB", "Giá trị tồn kho", ""]
    : ["Warehouse", "Product", "SKU", "Available", "Reserved", "Incoming", "Outgoing", "Avg Cost", "Inventory Value", ""]
  const total = filtered.reduce((a, b) => a + b.value, 0)
  return (
    <div className="flex flex-col h-full">
      <Toolbar search={search} onSearch={setSearch} onCreate={() => setShowCreate(true)} createLabel={lang === "vi" ? "Thêm số dư" : "Add Balance"}
        onExportCsv={() => exportCsv("stock-balance", heads.slice(0, -1), filtered.map(r => [r.warehouse, r.product, r.sku, r.available, r.reserved, r.incoming, r.outgoing, r.avgCost, r.value]))}
        onExportXlsx={() => exportXlsx("stock-balance", heads.slice(0, -1), filtered.map(r => [r.warehouse, r.product, r.sku, r.available, r.reserved, r.incoming, r.outgoing, r.avgCost, r.value]))}
        extra={
        <button className="flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs text-slate-600 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
          <Filter size={13} /> {t("filter")}
        </button>
      } />
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse min-w-[1050px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
              {heads.map((h, i) => <th key={i} className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => (
              <tr key={i} className="border-b hover:bg-slate-50/60 group cursor-pointer" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{row.warehouse}</td>
                <td className="px-4 py-2.5 font-medium text-slate-800">{row.product}</td>
                <td className="px-4 py-2.5 mono text-slate-500">{row.sku}</td>
                <td className="px-4 py-2.5 mono font-bold text-center text-slate-900">{row.available}</td>
                <td className="px-4 py-2.5 mono text-center text-blue-600">{row.reserved}</td>
                <td className="px-4 py-2.5 mono text-center text-emerald-600">{row.incoming}</td>
                <td className="px-4 py-2.5 mono text-center text-amber-600">{row.outgoing}</td>
                <td className="px-4 py-2.5 mono text-right text-slate-700">{fmt(row.avgCost)}</td>
                <td className="px-4 py-2.5 mono font-semibold text-right text-slate-900">{fmt(row.value)}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    <button className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"><MoreHorizontal size={14} /></button>
                    <button onClick={(e) => { e.stopPropagation(); setDataList(dataList.filter((_, index) => index !== i)) }} className="w-7 h-7 flex items-center justify-center rounded-md text-red-400 hover:bg-red-50 hover:text-red-500"><X size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-blue-50 border-t-2" style={{ borderColor: "#2563eb" }}>
              <td colSpan={8} className="px-4 py-2.5 text-xs font-bold text-right text-slate-700">{lang === "vi" ? "Tổng giá trị tồn kho" : "Total Inventory Value"}</td>
              <td className="px-4 py-2.5 mono font-bold text-blue-700 text-right">{fmt(total)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <Pager count={filtered.length} total={dataList.length} label={lang === "vi" ? "mặt hàng" : "items"} />

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="text-sm font-semibold">{lang === "vi" ? "Thêm số dư" : "Add Balance"}</h2>
              <button onClick={() => setShowCreate(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"><X size={14} /></button>
            </div>
            <form onSubmit={e => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setDataList([...dataList, {
                warehouse: fd.get("warehouse") as string || "Main",
                product: fd.get("product") as string || "New Product",
                sku: fd.get("sku") as string || "SKU-NEW",
                available: Number(fd.get("available")) || 0,
                reserved: 0,
                incoming: 0,
                outgoing: 0,
                avgCost: 0,
                value: 0
              }]);
              setShowCreate(false);
            }}>
              <div className="p-5 grid gap-3">
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Kho" : "Warehouse"}</label><input name="warehouse" defaultValue="Kho chính" className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Sản phẩm" : "Product"}</label><input name="product" required className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">SKU</label><input name="sku" className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Khả dụng" : "Available"}</label><input name="available" type="number" defaultValue="0" className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
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

// --- Stock Ledger ---
export function StockLedger() {
  const { t, lang } = useLang()
  const [dataList, setDataList] = useState(stockLedger)
  const [search, setSearch] = useState("")
  const [showCreate, setShowCreate] = useState(false)

  const filtered = dataList.filter(r => search === "" || r.product.toLowerCase().includes(search.toLowerCase()) || r.ref.toLowerCase().includes(search.toLowerCase()))
  const heads = lang === "vi"
    ? ["Ngày giờ", "Chứng từ", "Loại", "Kho", "Sản phẩm", "SL nhập", "SL xuất", "Tồn cuối", "Giá vốn", "Giá vốn TB", "Người tạo", ""]
    : ["Date/Time", "Reference", "Type", "Warehouse", "Product", "Qty In", "Qty Out", "Balance", "Unit Cost", "Avg Cost", "User", ""]
  return (
    <div className="flex flex-col h-full">
      <Toolbar search={search} onSearch={setSearch} onCreate={() => setShowCreate(true)} createLabel={lang === "vi" ? "Thêm giao dịch" : "Add Entry"}
        onExportCsv={() => exportCsv("stock-ledger", heads.slice(0,-1), filtered.map(r => [r.date, r.ref, r.type, r.warehouse, r.product, r.qtyIn, r.qtyOut, r.balance, r.cost, r.avgCost, r.user]))}
        onExportXlsx={() => exportXlsx("stock-ledger", heads.slice(0,-1), filtered.map(r => [r.date, r.ref, r.type, r.warehouse, r.product, r.qtyIn, r.qtyOut, r.balance, r.cost, r.avgCost, r.user]))}
        extra={
        <button className="flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs text-slate-600 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
          <Filter size={13} /> {t("filter")}
        </button>
      } />
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse min-w-[1200px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
              {heads.map((h, i) => <th key={i} className="px-3 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => (
              <tr key={i} className="border-b hover:bg-slate-50/60 group cursor-pointer" style={{ borderColor: "var(--border)" }}>
                <td className="px-3 py-2.5 mono text-slate-400 text-[10px] whitespace-nowrap">{row.date}</td>
                <td className="px-3 py-2.5 mono text-blue-600 font-medium whitespace-nowrap">{row.ref}</td>
                <td className="px-3 py-2.5">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap
                    ${row.type === "Purchase" || row.type === "Transfer In" ? "bg-emerald-50 text-emerald-700" :
                      row.type === "Sales" || row.type === "Transfer Out" ? "bg-red-50 text-red-600" :
                      "bg-violet-50 text-violet-700"}`}>
                    {row.type}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{row.warehouse}</td>
                <td className="px-3 py-2.5 font-medium text-slate-800">{row.product}</td>
                <td className="px-3 py-2.5 mono text-center text-emerald-600 font-semibold">{row.qtyIn > 0 ? `+${row.qtyIn}` : "—"}</td>
                <td className="px-3 py-2.5 mono text-center text-red-500 font-semibold">{row.qtyOut > 0 ? `-${row.qtyOut}` : "—"}</td>
                <td className="px-3 py-2.5 mono text-center font-bold text-slate-900">{row.balance}</td>
                <td className="px-3 py-2.5 mono text-right text-slate-700">{fmt(row.cost)}</td>
                <td className="px-3 py-2.5 mono text-right text-slate-700">{fmt(row.avgCost)}</td>
                <td className="px-3 py-2.5 text-blue-600 whitespace-nowrap">{row.user}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    <button className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"><MoreHorizontal size={14} /></button>
                    <button onClick={(e) => { e.stopPropagation(); setDataList(dataList.filter((_, index) => index !== i)) }} className="w-7 h-7 flex items-center justify-center rounded-md text-red-400 hover:bg-red-50 hover:text-red-500"><X size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager count={filtered.length} total={dataList.length} label={lang === "vi" ? "bản ghi" : "records"} />

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="text-sm font-semibold">{lang === "vi" ? "Thêm giao dịch" : "Add Entry"}</h2>
              <button onClick={() => setShowCreate(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"><X size={14} /></button>
            </div>
            <form onSubmit={e => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setDataList([...dataList, {
                date: new Date().toISOString().replace("T", " ").substring(0, 16),
                ref: fd.get("ref") as string || "MANUAL",
                type: fd.get("type") as string || "Adjustment",
                warehouse: "Main",
                product: fd.get("product") as string || "New Product",
                qtyIn: Number(fd.get("qtyIn")) || 0,
                qtyOut: Number(fd.get("qtyOut")) || 0,
                balance: 0,
                cost: 0,
                avgCost: 0,
                user: "Current User"
              }]);
              setShowCreate(false);
            }}>
              <div className="p-5 grid gap-3">
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Chứng từ" : "Reference"}</label><input name="ref" className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Sản phẩm" : "Product"}</label><input name="product" required className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "SL nhập" : "Qty In"}</label><input name="qtyIn" type="number" defaultValue="0" className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                  <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "SL xuất" : "Qty Out"}</label><input name="qtyOut" type="number" defaultValue="0" className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                </div>
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

// --- Inventory Adjustment ---
export function InventoryAdjustment() {
  const { t, lang } = useLang()
  const initialAdjustments = [
    { id: "ADJ-202608-0005", warehouse: "HN-Warehouse-01", type: lang === "vi" ? "Tăng" : "Increase", items: 3, reason: lang === "vi" ? "Kiểm kê định kỳ" : "Cycle Count", status: "Completed", date: "2026-08-03", user: "Lê Văn C" },
    { id: "ADJ-202608-0004", warehouse: "HCM-Warehouse-01", type: lang === "vi" ? "Giảm" : "Decrease", items: 1, reason: lang === "vi" ? "Hàng hỏng" : "Damaged Goods", status: "Approved", date: "2026-08-02", user: "Trần Thị B" },
    { id: "ADJ-202608-0003", warehouse: "DN-Warehouse-01", type: lang === "vi" ? "Tăng" : "Increase", items: 2, reason: lang === "vi" ? "Điều chỉnh tồn đầu" : "Opening Balance", status: "Completed", date: "2026-08-01", user: "Nguyễn Văn A" },
  ]
  const [dataList, setDataList] = useState(initialAdjustments)
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState("")

  const filtered = dataList.filter(a => search === "" || a.id.toLowerCase().includes(search.toLowerCase()) || a.warehouse.toLowerCase().includes(search.toLowerCase()))
  const heads = lang === "vi"
    ? ["Số phiếu", "Kho", "Loại", "Số dòng", "Lý do", "Trạng thái", "Ngày", "Người tạo", ""]
    : ["Reference", "Warehouse", "Type", "Items", "Reason", "Status", "Date", "User", ""]
  return (
    <div className="flex flex-col h-full">
      <Toolbar search={search} onSearch={setSearch} onCreate={() => setShowCreate(true)} createLabel={lang === "vi" ? "Tạo phiếu điều chỉnh" : "Create Adjustment"}
        onExportCsv={() => exportCsv("adjustments", heads.slice(0, -1), filtered.map(a => [a.id, a.warehouse, a.type, a.items, a.reason, a.status, a.date, a.user]))}
        onExportXlsx={() => exportXlsx("adjustments", heads.slice(0, -1), filtered.map(a => [a.id, a.warehouse, a.type, a.items, a.reason, a.status, a.date, a.user]))}
      />
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse min-w-[900px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
              {heads.map((h, i) => <th key={i} className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map(a => (
              <tr key={a.id} className="border-b hover:bg-slate-50/60 group cursor-pointer" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-2.5 mono text-blue-600 font-medium">{a.id}</td>
                <td className="px-4 py-2.5 text-slate-700">{a.warehouse}</td>
                <td className="px-4 py-2.5">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${a.type === (lang === "vi" ? "Tăng" : "Increase") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{a.type}</span>
                </td>
                <td className="px-4 py-2.5 mono text-center">{a.items}</td>
                <td className="px-4 py-2.5 text-slate-600">{a.reason}</td>
                <td className="px-4 py-2.5"><StatusBadge status={a.status} /></td>
                <td className="px-4 py-2.5 mono text-slate-400">{a.date}</td>
                <td className="px-4 py-2.5 text-slate-600">{a.user}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    <button className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"><MoreHorizontal size={14} /></button>
                    <button onClick={(e) => { e.stopPropagation(); setDataList(dataList.filter(x => x.id !== a.id)) }} className="w-7 h-7 flex items-center justify-center rounded-md text-red-400 hover:bg-red-50 hover:text-red-500"><X size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager count={filtered.length} total={dataList.length} label={lang === "vi" ? "phiếu điều chỉnh" : "adjustments"} />

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="text-sm font-semibold">{lang === "vi" ? "Tạo phiếu điều chỉnh kho" : "Create Inventory Adjustment"}</h2>
              <button onClick={() => setShowCreate(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"><X size={14} /></button>
            </div>
            <form onSubmit={e => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setDataList([{
                id: "ADJ-NEW-" + Math.floor(Math.random() * 1000),
                warehouse: fd.get("warehouse") as string || "HN-Warehouse-01",
                type: fd.get("type") as string || (lang === "vi" ? "Tăng" : "Increase"),
                items: 1,
                reason: fd.get("reason") as string || "Other",
                status: "Approved",
                date: new Date().toISOString().split("T")[0],
                user: "Current User"
              }, ...dataList]);
              setShowCreate(false);
            }}>
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Kho *" : "Warehouse *"}</label>
                    <select name="warehouse" className="w-full h-8 px-3 rounded-lg border text-xs outline-none focus:ring-2 focus:ring-blue-500/20 bg-white" style={{ borderColor: "var(--border)" }}>
                      {warehouses.map(w => <option key={w.code} value={w.name}>{w.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Loại điều chỉnh" : "Adjustment Type"}</label>
                    <select name="type" className="w-full h-8 px-3 rounded-lg border text-xs outline-none focus:ring-2 focus:ring-blue-500/20 bg-white" style={{ borderColor: "var(--border)" }}>
                      {[lang === "vi" ? "Tăng" : "Increase", lang === "vi" ? "Giảm" : "Decrease"].map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Lý do *" : "Reason *"}</label>
                  <select name="reason" className="w-full h-8 px-3 rounded-lg border text-xs outline-none focus:ring-2 focus:ring-blue-500/20 bg-white" style={{ borderColor: "var(--border)" }}>
                    {(lang === "vi" ? ["Kiểm kê định kỳ", "Hàng hỏng", "Điều chỉnh tồn đầu", "Lý do khác"] : ["Cycle Count", "Damaged Goods", "Opening Balance", "Other"]).map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">{t("note")}</label>
                  <textarea rows={2} className="w-full px-3 py-2 rounded-lg border text-xs outline-none resize-none" style={{ borderColor: "var(--border)" }} />
                </div>
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

// --- Categories ---
export function Categories() {
  const { t, lang } = useLang()
  const initialCats = [
    { code: "CAT-01", name: lang === "vi" ? "Điện tử" : "Electronics", parent: "—", items: 156, status: "Active" },
    { code: "CAT-02", name: lang === "vi" ? "Laptop" : "Laptop", parent: lang === "vi" ? "Điện tử" : "Electronics", items: 42, status: "Active" },
    { code: "CAT-03", name: lang === "vi" ? "Điện thoại" : "Phone", parent: lang === "vi" ? "Điện tử" : "Electronics", items: 58, status: "Active" },
    { code: "CAT-04", name: lang === "vi" ? "Màn hình" : "Monitor", parent: lang === "vi" ? "Điện tử" : "Electronics", items: 23, status: "Active" },
    { code: "CAT-05", name: lang === "vi" ? "Thiết bị mạng" : "Network", parent: lang === "vi" ? "Điện tử" : "Electronics", items: 33, status: "Active" },
  ]
  const [dataList, setDataList] = useState(initialCats)
  const [search, setSearch] = useState("")
  const [showCreate, setShowCreate] = useState(false)

  const filtered = dataList.filter(c => search === "" || c.name.toLowerCase().includes(search.toLowerCase()) || c.code.includes(search))
  const heads = [t("code"), t("name"), lang === "vi" ? "Danh mục cha" : "Parent", lang === "vi" ? "Số sản phẩm" : "Products", t("status"), ""]

  return (
    <div className="flex flex-col h-full">
      <Toolbar search={search} onSearch={setSearch} onCreate={() => setShowCreate(true)} createLabel={lang === "vi" ? "Thêm danh mục" : "Add Category"}
        templateFile="categories" templateCols={["category_code","category_name_vi","category_name_en","parent_category","description"]}
        onExportCsv={() => exportCsv("categories", heads.slice(0,-1), filtered.map(c => [c.code, c.name, c.parent, c.items, c.status]))}
        onExportXlsx={() => exportXlsx("categories", heads.slice(0,-1), filtered.map(c => [c.code, c.name, c.parent, c.items, c.status]))}
      />
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
              {heads.map(h => (
                <th key={h} className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.code} className="border-b hover:bg-slate-50/60 group cursor-pointer" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-2.5 mono text-blue-600 font-medium">{c.code}</td>
                <td className="px-4 py-2.5 font-medium text-slate-800">{c.name}</td>
                <td className="px-4 py-2.5 text-slate-500">{c.parent}</td>
                <td className="px-4 py-2.5 mono text-center">{c.items}</td>
                <td className="px-4 py-2.5"><StatusBadge status={c.status} /></td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    <button className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"><MoreHorizontal size={14} /></button>
                    <button onClick={(e) => { e.stopPropagation(); setDataList(dataList.filter(x => x.code !== c.code)) }} className="w-7 h-7 flex items-center justify-center rounded-md text-red-400 hover:bg-red-50 hover:text-red-500"><X size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager count={filtered.length} total={dataList.length} label={lang === "vi" ? "danh mục" : "categories"} />

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="text-sm font-semibold">{lang === "vi" ? "Thêm danh mục" : "Add Category"}</h2>
              <button onClick={() => setShowCreate(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"><X size={14} /></button>
            </div>
            <form onSubmit={e => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setDataList([...dataList, {
                code: fd.get("code") as string || "NEW",
                name: fd.get("name") as string || "New Category",
                parent: fd.get("parent") as string || "—",
                items: 0,
                status: "Active"
              }]);
              setShowCreate(false);
            }}>
              <div className="p-5 grid gap-3">
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{t("code")}</label><input name="code" className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{t("name")}</label><input name="name" required className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Danh mục cha" : "Parent"}</label><input name="parent" className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
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

// --- Brands ---
export function Brands() {
  const { t, lang } = useLang()
  const initialBrands = [
    { code: "BR-01", name: "Dell", country: "USA", items: 24, status: "Active" },
    { code: "BR-02", name: "Samsung", country: "South Korea", items: 52, status: "Active" },
    { code: "BR-03", name: "Apple", country: "USA", items: 18, status: "Active" },
    { code: "BR-04", name: "LG", country: "South Korea", items: 15, status: "Active" },
    { code: "BR-05", name: "Logitech", country: "Switzerland", items: 38, status: "Active" },
    { code: "BR-06", name: "WD", country: "USA", items: 12, status: "Active" },
    { code: "BR-07", name: "TP-Link", country: "China", items: 8, status: "Inactive" },
  ]
  const [dataList, setDataList] = useState(initialBrands)
  const [search, setSearch] = useState("")
  const [showCreate, setShowCreate] = useState(false)

  const filtered = dataList.filter(b => search === "" || b.name.toLowerCase().includes(search.toLowerCase()) || b.code.includes(search))
  const heads = [t("code"), lang === "vi" ? "Tên thương hiệu" : "Brand Name", lang === "vi" ? "Quốc gia" : "Country", lang === "vi" ? "Số SP" : "Products", t("status"), ""]

  return (
    <div className="flex flex-col h-full">
      <Toolbar search={search} onSearch={setSearch} onCreate={() => setShowCreate(true)} createLabel={lang === "vi" ? "Thêm thương hiệu" : "Add Brand"}
        templateFile="brands" templateCols={["brand_code","brand_name","country_of_origin","website","description"]}
        onExportCsv={() => exportCsv("brands", heads.slice(0,-1), filtered.map(b => [b.code, b.name, b.country, b.items, b.status]))}
        onExportXlsx={() => exportXlsx("brands", heads.slice(0,-1), filtered.map(b => [b.code, b.name, b.country, b.items, b.status]))}
      />
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
              {heads.map(h => (
                <th key={h} className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(b => (
              <tr key={b.code} className="border-b hover:bg-slate-50/60 group cursor-pointer" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-2.5 mono text-blue-600 font-medium">{b.code}</td>
                <td className="px-4 py-2.5 font-semibold text-slate-800">{b.name}</td>
                <td className="px-4 py-2.5 text-slate-500">{b.country}</td>
                <td className="px-4 py-2.5 mono text-center">{b.items}</td>
                <td className="px-4 py-2.5"><StatusBadge status={b.status} /></td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    <button className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"><MoreHorizontal size={14} /></button>
                    <button onClick={(e) => { e.stopPropagation(); setDataList(dataList.filter(x => x.code !== b.code)) }} className="w-7 h-7 flex items-center justify-center rounded-md text-red-400 hover:bg-red-50 hover:text-red-500"><X size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager count={filtered.length} total={dataList.length} label={lang === "vi" ? "thương hiệu" : "brands"} />

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="text-sm font-semibold">{lang === "vi" ? "Thêm thương hiệu" : "Add Brand"}</h2>
              <button onClick={() => setShowCreate(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"><X size={14} /></button>
            </div>
            <form onSubmit={e => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setDataList([...dataList, {
                code: fd.get("code") as string || "NEW",
                name: fd.get("name") as string || "New Brand",
                country: fd.get("country") as string || "Unknown",
                items: 0,
                status: "Active"
              }]);
              setShowCreate(false);
            }}>
              <div className="p-5 grid gap-3">
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{t("code")}</label><input name="code" className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Tên thương hiệu" : "Brand Name"}</label><input name="name" required className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Quốc gia" : "Country"}</label><input name="country" className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
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

// --- Users ---
export function Users() {
  const { t, lang } = useLang()
  const [showCreate, setShowCreate] = useState(false)
  const [dataList, setDataList] = useState([
    { code: "U001", name: "Nguyễn Văn A", dept: lang === "vi" ? "Quản trị" : "Administration", role: lang === "vi" ? "Quản trị viên" : "Administrator", email: "nva@warehouseos.vn", lastLogin: "2026-08-04 08:32", status: "Active" },
    { code: "U002", name: "Trần Thị B", dept: lang === "vi" ? "Kho" : "Warehouse", role: lang === "vi" ? "Nhân viên kho" : "Warehouse Staff", email: "ttb@warehouseos.vn", lastLogin: "2026-08-04 07:55", status: "Active" },
    { code: "U003", name: "Lê Văn C", dept: lang === "vi" ? "Mua hàng" : "Purchasing", role: lang === "vi" ? "Phụ trách mua hàng" : "Purchasing Officer", email: "lvc@warehouseos.vn", lastLogin: "2026-08-03 17:10", status: "Active" },
    { code: "U004", name: "Phạm Văn D", dept: lang === "vi" ? "Bán hàng" : "Sales", role: lang === "vi" ? "Nhân viên bán hàng" : "Sales Staff", email: "pvd@warehouseos.vn", lastLogin: "2026-08-03 16:45", status: "Active" },
    { code: "U005", name: "Hoàng Thị E", dept: lang === "vi" ? "Kế toán" : "Finance", role: lang === "vi" ? "Kế toán" : "Accountant", email: "hte@warehouseos.vn", lastLogin: "2026-08-02 09:00", status: "Inactive" },
  ])
  
  const heads = [t("code"), lang === "vi" ? "Họ tên" : "Full Name", lang === "vi" ? "Phòng ban" : "Department", lang === "vi" ? "Vai trò" : "Role", "Email", lang === "vi" ? "Đăng nhập cuối" : "Last Login", t("status"), ""];
  
  return (
    <div className="flex flex-col h-full">
      <Toolbar onCreate={() => setShowCreate(true)} createLabel={lang === "vi" ? "Thêm người dùng" : "Add User"} 
        onExportCsv={() => exportCsv("users", heads.slice(0,-1), dataList.map(u => [u.code, u.name, u.dept, u.role, u.email, u.lastLogin, u.status]))}
        onExportXlsx={() => exportXlsx("users", heads.slice(0,-1), dataList.map(u => [u.code, u.name, u.dept, u.role, u.email, u.lastLogin, u.status]))}
      />
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse min-w-[900px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
              {heads.map((h,i) => (
                <th key={i} className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataList.map(u => (
              <tr key={u.code} className="border-b hover:bg-slate-50/60 group" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-2.5 mono text-slate-500">{u.code}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-[10px] font-bold flex-shrink-0">
                      {u.name.split(" ").map(w => w[0]).slice(-2).join("")}
                    </div>
                    <span className="font-medium text-slate-800">{u.name}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-slate-600">{u.dept}</td>
                <td className="px-4 py-2.5 text-slate-600">{u.role}</td>
                <td className="px-4 py-2.5 text-slate-500">{u.email}</td>
                <td className="px-4 py-2.5 mono text-slate-400 text-[10px]">{u.lastLogin}</td>
                <td className="px-4 py-2.5"><StatusBadge status={u.status} /></td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    <button className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"><MoreHorizontal size={14} /></button>
                    <button onClick={(e) => { e.stopPropagation(); setDataList(dataList.filter(x => x.code !== u.code)) }} className="w-7 h-7 flex items-center justify-center rounded-md text-red-400 hover:bg-red-50 hover:text-red-500"><X size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager count={dataList.length} total={dataList.length} label={lang === "vi" ? "người dùng" : "users"} />

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="text-sm font-semibold">{lang === "vi" ? "Thêm người dùng mới" : "Add New User"}</h2>
              <button onClick={() => setShowCreate(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"><X size={14} /></button>
            </div>
            <form onSubmit={e => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setDataList([...dataList, {
                code: "U" + Math.floor(100 + Math.random()*900),
                name: fd.get("name") as string || "New User",
                dept: fd.get("dept") as string || "",
                role: fd.get("role") as string || "",
                email: fd.get("email") as string || "",
                lastLogin: "Never",
                status: "Active"
              }]);
              setShowCreate(false);
            }}>
              <div className="p-5 space-y-3">
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Họ tên *" : "Full Name *"}</label><input name="name" required className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">Email *</label><input name="email" type="email" required className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Phòng ban" : "Department"}</label><input name="dept" className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Vai trò" : "Role"}</label><select name="role" className="w-full h-8 px-3 rounded-lg border text-xs outline-none bg-white" style={{ borderColor: "var(--border)" }}>
                  {(lang === "vi" ? ["Quản trị viên", "Nhân viên kho", "Phụ trách mua hàng", "Nhân viên bán hàng", "Kế toán"] : ["Administrator", "Warehouse Staff", "Purchasing Officer", "Sales Staff", "Accountant"]).map(r => <option key={r}>{r}</option>)}
                </select></div>
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
// --- Roles ---
export function Roles() {
  const { t, lang } = useLang()
  const [dataList, setDataList] = useState([
    { code: "ADMIN", name: lang === "vi" ? "Quản trị viên" : "Administrator", users: 1, isSystem: true, desc: lang === "vi" ? "Toàn quyền hệ thống" : "Full system access" },
    { code: "MANAGER", name: lang === "vi" ? "Quản lý" : "Manager", users: 2, isSystem: false, desc: lang === "vi" ? "Xem & duyệt tất cả module" : "View & approve all modules" },
    { code: "WAREHOUSE", name: lang === "vi" ? "Nhân viên kho" : "Warehouse Staff", users: 3, isSystem: false, desc: lang === "vi" ? "Quản lý tồn kho" : "Manage inventory" },
    { code: "SALES", name: lang === "vi" ? "Nhân viên bán hàng" : "Sales Staff", users: 4, isSystem: false, desc: lang === "vi" ? "Tạo & xem đơn bán hàng" : "Create & view sales orders" },
    { code: "ACCOUNTANT", name: lang === "vi" ? "Kế toán" : "Accountant", users: 1, isSystem: false, desc: lang === "vi" ? "Module tài chính & báo cáo" : "Finance & reports module" },
  ])
  const modules = ["Dashboard", "Master Data", "Inventory", "Purchase", "Sales", "Finance", "Reports", "Administration"]
  const actions = lang === "vi" ? ["Xem", "Tạo", "Sửa", "Xóa", "Duyệt", "Xuất"] : ["View", "Create", "Edit", "Delete", "Approve", "Export"]
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="flex flex-col h-full">
      <Toolbar onCreate={() => setShowCreate(true)} createLabel={lang === "vi" ? "Thêm vai trò" : "Add Role"}
        onExportCsv={() => exportCsv("roles", ["Code", "Name", "Users", "Is System", "Description"], dataList.map(r => [r.code, r.name, r.users, r.isSystem?"Yes":"No", r.desc]))}
        onExportXlsx={() => exportXlsx("roles", ["Code", "Name", "Users", "Is System", "Description"], dataList.map(r => [r.code, r.name, r.users, r.isSystem?"Yes":"No", r.desc]))}
      />
      <div className="flex h-full min-h-0">
        {/* Left: role list */}
        <div className="w-64 border-r bg-white flex flex-col flex-shrink-0" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
            <span className="text-xs font-semibold text-slate-700">{lang === "vi" ? "Danh sách vai trò" : "Roles"}</span>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {dataList.map((r, i) => (
              <button key={r.code} className={`group relative w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors ${i === 0 ? "bg-blue-50 border-r-2 border-blue-600" : "hover:bg-slate-50"}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-800 truncate">{r.name}</span>
                    {r.isSystem && <span className="text-[9px] bg-slate-100 text-slate-500 rounded px-1 font-medium">SYS</span>}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5 truncate">{r.desc}</div>
                  <div className="text-[10px] text-slate-400">{r.users} {lang === "vi" ? "người dùng" : "users"}</div>
                </div>
                {!r.isSystem && (
                  <div onClick={(e) => { e.stopPropagation(); setDataList(dataList.filter(x => x.code !== r.code)) }} className="absolute right-2 top-2 hidden group-hover:flex items-center justify-center w-6 h-6 rounded-md bg-red-50 text-red-500 hover:bg-red-100 transition-colors cursor-pointer">
                    <X size={12}/>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
        {/* Right: permission matrix */}
        <div className="flex-1 overflow-auto p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{lang === "vi" ? "Quyền hạn — Quản trị viên" : "Permissions — Administrator"}</h2>
              <p className="text-[11px] text-slate-400">{lang === "vi" ? "Quản lý quyền truy cập theo module và hành động" : "Manage access rights by module and action"}</p>
            </div>
            <button className="h-8 px-3 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700">{t("save")}</button>
          </div>
          <div className="bg-white border rounded-xl overflow-hidden" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-500 text-[10px] uppercase tracking-wider w-36">Module</th>
                  {actions.map(a => (
                    <th key={a} className="px-3 py-2.5 text-center font-semibold text-slate-500 text-[10px] uppercase tracking-wider">{a}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modules.map((mod, i) => (
                  <tr key={mod} className="border-b last:border-0 hover:bg-slate-50/60" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-2.5 font-medium text-slate-700">{mod}</td>
                    {actions.map((a, j) => (
                      <td key={a} className="px-3 py-2.5 text-center">
                        <input type="checkbox" defaultChecked={i === 0 || j === 0} className="accent-blue-600 w-4 h-4" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="text-sm font-semibold">{lang === "vi" ? "Thêm vai trò" : "Add Role"}</h2>
              <button onClick={() => setShowCreate(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"><X size={14} /></button>
            </div>
            <form onSubmit={e => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setDataList([...dataList, {
                code: (fd.get("code") as string).toUpperCase() || "NEW",
                name: fd.get("name") as string || "New Role",
                desc: fd.get("desc") as string || "",
                users: 0,
                isSystem: false
              }]);
              setShowCreate(false);
            }}>
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
  const [dataList, setDataList] = useState(auditLogs)
  const [search, setSearch] = useState("")
  const [showCreate, setShowCreate] = useState(false)

  const filtered = dataList.filter(log => search === "" || log.entity.toLowerCase().includes(search.toLowerCase()) || log.user.toLowerCase().includes(search.toLowerCase()))
  const heads = lang === "vi"
    ? ["Đối tượng", "Hành động", "Trường", "Giá trị cũ", "Giá trị mới", "Người dùng", "Thời gian", "IP", "Thiết bị", ""]
    : ["Entity", "Action", "Field", "Old Value", "New Value", "User", "Time", "IP", "Device", ""]
  return (
    <div className="flex flex-col h-full">
      <Toolbar search={search} onSearch={setSearch} onCreate={() => setShowCreate(true)} createLabel={lang === "vi" ? "Tạo log giả" : "Add Log"}
        onExportCsv={() => exportCsv("audit-logs", heads.slice(0, -1), filtered.map(l => [l.entity, l.action, l.field, l.oldVal, l.newVal, l.user, l.time, l.ip, l.device]))}
        onExportXlsx={() => exportXlsx("audit-logs", heads.slice(0, -1), filtered.map(l => [l.entity, l.action, l.field, l.oldVal, l.newVal, l.user, l.time, l.ip, l.device]))}
        extra={
        <button className="flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs text-slate-600 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
          <Filter size={13} /> {t("filter")}
        </button>
      } />
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse min-w-[1100px]">
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
                <td className="px-4 py-2.5 mono text-slate-400 whitespace-nowrap text-[10px]">{log.time}</td>
                <td className="px-4 py-2.5 mono text-slate-400 text-[10px]">{log.ip}</td>
                <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{log.device}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    <button className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"><MoreHorizontal size={14} /></button>
                    <button onClick={(e) => { e.stopPropagation(); setDataList(dataList.filter((_, index) => index !== i)) }} className="w-7 h-7 flex items-center justify-center rounded-md text-red-400 hover:bg-red-50 hover:text-red-500"><X size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager count={filtered.length} total={dataList.length} label={lang === "vi" ? "bản ghi" : "records"} />

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="text-sm font-semibold">{lang === "vi" ? "Tạo log giả" : "Add Log"}</h2>
              <button onClick={() => setShowCreate(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"><X size={14} /></button>
            </div>
            <form onSubmit={e => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setDataList([{
                entity: fd.get("entity") as string || "System",
                action: fd.get("action") as string || "UPDATE",
                field: fd.get("field") as string || "-",
                oldVal: fd.get("oldVal") as string || "-",
                newVal: fd.get("newVal") as string || "-",
                user: "Current User",
                time: new Date().toISOString().replace("T", " ").substring(0, 19),
                ip: "127.0.0.1",
                device: "Web Browser"
              }, ...dataList]);
              setShowCreate(false);
            }}>
              <div className="p-5 grid gap-3">
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Đối tượng" : "Entity"}</label><input name="entity" className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Hành động" : "Action"}</label><input name="action" className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Trường" : "Field"}</label><input name="field" className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
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

// --- Finance Screens ---
export function Receivables() {
  const { t, lang } = useLang()
  const [dataList, setDataList] = useState([
    { ref: "INV-202608-001", customer: "FPT Telecom", date: "2026-08-01", due: "2026-08-31", amount: 98500000, paid: 0, remaining: 98500000, status: "Overdue" },
    { ref: "INV-202608-002", customer: "VNPT Group", date: "2026-08-02", due: "2026-09-01", amount: 52000000, paid: 52000000, remaining: 0, status: "Paid" },
    { ref: "INV-202607-045", customer: "Viettel Store", date: "2026-07-25", due: "2026-08-24", amount: 175000000, paid: 100000000, remaining: 75000000, status: "Partial" },
    { ref: "INV-202608-003", customer: "Nguyen Kim Corp", date: "2026-08-03", due: "2026-09-02", amount: 43000000, paid: 0, remaining: 43000000, status: "Partial" },
  ])
  const [search, setSearch] = useState("")
  const [showCreate, setShowCreate] = useState(false)

  const filtered = dataList.filter(r => search === "" || r.ref.toLowerCase().includes(search.toLowerCase()) || r.customer.toLowerCase().includes(search.toLowerCase()))
  const heads = lang === "vi"
    ? ["Số HĐ", "Khách hàng", "Ngày HĐ", "Ngày đến hạn", "Số tiền", "Đã thu", "Còn lại", "Trạng thái", ""]
    : ["Invoice", "Customer", "Date", "Due Date", "Amount", "Paid", "Remaining", "Status", ""]
  const totalRemaining = filtered.reduce((a, b) => a + b.remaining, 0)
  return (
    <div className="flex flex-col h-full">
      <Toolbar search={search} onSearch={setSearch} createLabel={lang === "vi" ? "Ghi nhận thu tiền" : "Record Receipt"} onCreate={() => setShowCreate(true)} 
        onExportCsv={() => exportCsv("receivables", heads.slice(0, -1), filtered.map(r => [r.ref, r.customer, r.date, r.due, r.amount, r.paid, r.remaining, r.status]))}
        onExportXlsx={() => exportXlsx("receivables", heads.slice(0, -1), filtered.map(r => [r.ref, r.customer, r.date, r.due, r.amount, r.paid, r.remaining, r.status]))}
        extra={
        <button className="flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs text-slate-600 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
          <Printer size={13} /> {t("print")}
        </button>
      } />
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 px-5 py-3 bg-white border-b flex-shrink-0" style={{ borderColor: "var(--border)" }}>
        {[
          { label: lang === "vi" ? "Tổng phải thu" : "Total Receivable", value: fmt(filtered.reduce((a, b) => a + b.amount, 0)), color: "text-slate-900" },
          { label: lang === "vi" ? "Đã thu" : "Collected", value: fmt(filtered.reduce((a, b) => a + b.paid, 0)), color: "text-emerald-600" },
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
            {filtered.map((r, i) => (
              <tr key={r.ref} className="border-b hover:bg-slate-50/60 group cursor-pointer" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-2.5 mono text-blue-600 font-medium">{r.ref}</td>
                <td className="px-4 py-2.5 font-medium text-slate-800">{r.customer}</td>
                <td className="px-4 py-2.5 mono text-slate-400">{r.date}</td>
                <td className="px-4 py-2.5 mono text-slate-400">{r.due}</td>
                <td className="px-4 py-2.5 mono font-semibold text-right">{fmt(r.amount)}</td>
                <td className="px-4 py-2.5 mono text-right text-emerald-600">{fmt(r.paid)}</td>
                <td className="px-4 py-2.5 mono text-right font-bold text-amber-600">{fmt(r.remaining)}</td>
                <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    <button className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"><MoreHorizontal size={14} /></button>
                    <button onClick={(e) => { e.stopPropagation(); setDataList(dataList.filter(x => x.ref !== r.ref)) }} className="w-7 h-7 flex items-center justify-center rounded-md text-red-400 hover:bg-red-50 hover:text-red-500"><X size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager count={filtered.length} total={dataList.length} label={lang === "vi" ? "hóa đơn" : "invoices"} />

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="text-sm font-semibold">{lang === "vi" ? "Ghi nhận thu tiền" : "Record Receipt"}</h2>
              <button onClick={() => setShowCreate(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"><X size={14} /></button>
            </div>
            <form onSubmit={e => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setDataList([{
                ref: fd.get("ref") as string || "INV-NEW",
                customer: fd.get("customer") as string || "New Customer",
                date: new Date().toISOString().split("T")[0],
                due: new Date(Date.now() + 30*24*60*60*1000).toISOString().split("T")[0],
                amount: Number(fd.get("amount")) || 0,
                paid: 0,
                remaining: Number(fd.get("amount")) || 0,
                status: "Pending"
              }, ...dataList]);
              setShowCreate(false);
            }}>
              <div className="p-5 grid gap-3">
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Số HĐ" : "Invoice"}</label><input name="ref" className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Khách hàng" : "Customer"}</label><input name="customer" required className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
                <div><label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Số tiền" : "Amount"}</label><input name="amount" type="number" defaultValue="0" className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} /></div>
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

// --- Export helpers ---
export function exportCsv(filename: string, heads: string[], rows: (string | number)[][]) {
  const lines = [heads.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n")
  const blob = new Blob(["﻿" + lines], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a"); a.href = url; a.download = filename + ".csv"; a.click()
  URL.revokeObjectURL(url)
}

export function exportXlsx(filename: string, heads: string[], rows: (string | number)[][]) {
  const ws = XLSX.utils.aoa_to_sheet([heads, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Report")
  XLSX.writeFile(wb, filename + ".xlsx")
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

function buildReportData(key: string, lang: string): ReportData {
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
  return all[key] ?? {
    title: key,
    kpis: [{ label: lang === "vi" ? "Đang phát triển" : "Coming soon", value: "—" }],
    chartLabel: "", chartType: "bar" as const, chartData: [],
    tableHeads: [], tableRows: [],
  }
}

function ReportDetailModal({ reportKey, onClose, lang }: { reportKey: string; onClose: () => void; lang: string }) {
  const data = buildReportData(reportKey, lang)
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
            <select className="h-7 px-2 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }}>
              {(vi ? ["Tháng 8/2026", "Quý 3/2026", "Năm 2026"] : ["August 2026", "Q3 2026", "FY 2026"]).map(o => <option key={o}>{o}</option>)}
            </select>
            <button
              onClick={() => exportCsv(filename, data.tableHeads, data.tableRows)}
              className="flex items-center gap-1 h-7 px-2.5 rounded-lg border text-xs text-slate-600 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}
            >
              <Download size={12} /> CSV
            </button>
            <button
              onClick={() => exportXlsx(filename, data.tableHeads, data.tableRows)}
              className="flex items-center gap-1 h-7 px-2.5 rounded-lg border text-xs text-emerald-700 hover:bg-emerald-50" style={{ borderColor: "var(--border)" }}
            >
              <FileSpreadsheet size={12} /> Excel
            </button>
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
                    {data.tableRows.map((row, i) => (
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
  const [period, setPeriod] = useState(0)
  const [activeReport, setActiveReport] = useState<string | null>(null)

  const reportCategories = [
    {
      name: t("inventoryReports"), color: "text-blue-700", bg: "bg-blue-50", border: "#dbeafe", icon: <Layers size={14} className="text-blue-500" />,
      kpi: { label: lang === "vi" ? "86 SKU đang hoạt động" : "86 active SKUs", trend: "up" as const },
      reports: lang === "vi"
        ? ["Tồn kho hiện tại", "Sổ kho", "Giá trị tồn kho", "Tồn kho thấp", "Hàng chậm luân chuyển", "Hàng nhanh luân chuyển"]
        : ["Stock Balance", "Stock Ledger", "Inventory Value", "Low Stock", "Slow Moving", "Fast Moving"],
      reportKeys: ["Tồn kho hiện tại", "Sổ kho", "Giá trị tồn kho", "Tồn kho thấp", "Hàng chậm luân chuyển", "Hàng nhanh luân chuyển"],
    },
    {
      name: t("salesReports"), color: "text-emerald-700", bg: "bg-emerald-50", border: "#d1fae5", icon: <TrendingUp size={14} className="text-emerald-500" />,
      kpi: { label: lang === "vi" ? "405 triệu doanh thu T8" : "405M revenue in Aug", trend: "up" as const },
      reports: lang === "vi"
        ? ["Doanh thu tổng hợp", "Lãi gộp", "Xếp hạng khách hàng", "Xếp hạng sản phẩm", "Doanh thu theo nhân viên"]
        : ["Revenue Summary", "Gross Profit", "Customer Ranking", "Product Ranking", "Sales by Employee"],
      reportKeys: ["Doanh thu tổng hợp", "Lãi gộp", "Xếp hạng khách hàng", "Xếp hạng sản phẩm", "Doanh thu theo nhân viên"],
    },
    {
      name: t("purchaseReports"), color: "text-violet-700", bg: "bg-violet-50", border: "#ede9fe", icon: <ShoppingCart size={14} className="text-violet-500" />,
      kpi: { label: lang === "vi" ? "12 đơn mua trong tháng" : "12 POs this month", trend: "up" as const },
      reports: lang === "vi"
        ? ["Tổng hợp mua hàng", "Xếp hạng nhà cung cấp", "Xu hướng mua hàng", "Tổng hợp nhập kho"]
        : ["Purchase Summary", "Supplier Ranking", "Purchase Trend", "GRN Summary"],
      reportKeys: ["Tổng hợp mua hàng", "Xếp hạng nhà cung cấp", "Xu hướng mua hàng", "Tổng hợp nhập kho"],
    },
    {
      name: t("financeReports"), color: "text-amber-700", bg: "bg-amber-50", border: "#fef3c7", icon: <CreditCard size={14} className="text-amber-500" />,
      kpi: { label: lang === "vi" ? "185 triệu số dư quỹ" : "185M cash balance", trend: "up" as const },
      reports: lang === "vi"
        ? ["Lưu chuyển tiền tệ", "Tuổi nợ phải thu", "Tuổi nợ phải trả", "Sổ quỹ ngày", "Tổng hợp chi phí"]
        : ["Cash Flow", "Receivable Aging", "Payable Aging", "Daily Cash Book", "Expense Summary"],
      reportKeys: ["Lưu chuyển tiền tệ", "Tuổi nợ phải thu", "Tuổi nợ phải trả", "Sổ quỹ ngày", "Tổng hợp chi phí"],
    },
  ]

  const summaryKpis = [
    { label: lang === "vi" ? "Doanh thu tháng này" : "Monthly Revenue", value: "405 triệu", icon: <TrendingUp size={14} />, color: "text-emerald-600", bg: "bg-emerald-50", trend: "+18%" },
    { label: lang === "vi" ? "Giá trị tồn kho" : "Inventory Value", value: "8.42 tỷ", icon: <Layers size={14} />, color: "text-blue-600", bg: "bg-blue-50", trend: "+5%" },
    { label: lang === "vi" ? "Tổng mua hàng" : "Purchase Value", value: "3.09 tỷ", icon: <ShoppingCart size={14} />, color: "text-violet-600", bg: "bg-violet-50", trend: "+24%" },
    { label: lang === "vi" ? "Số dư quỹ" : "Cash Balance", value: "185 triệu", icon: <CreditCard size={14} />, color: "text-amber-600", bg: "bg-amber-50", trend: "+20%" },
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
              {(lang === "vi" ? ["T8/2026", "Q3/2026", "2026"] : ["Aug 2026", "Q3 2026", "FY 2026"]).map((o, i) => (
                <button key={o} onClick={() => setPeriod(i)} className={`h-7 px-3 whitespace-nowrap ${period === i ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{o}</button>
              ))}
            </div>
          </div>
          <button className="flex items-center gap-1.5 h-7 px-3 rounded-lg border text-xs text-slate-600 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
            <Download size={12} /> {lang === "vi" ? "Xuất tất cả" : "Export All"}
          </button>
        </div>
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
        <ReportDetailModal reportKey={activeReport} onClose={() => setActiveReport(null)} lang={lang} />
      )}
    </div>
  )
}

// --- Settings ---
function SettingField({ label, defaultVal, type = "text", hint }: { label: string; defaultVal: string; type?: string; hint?: string }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-slate-500 mb-1">{label}</label>
      <input type={type} defaultValue={defaultVal} className="w-full h-9 px-3 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500/20" style={{ borderColor: "var(--border)" }} />
      {hint && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}
function SettingSelect({ label, val, opts }: { label: string; val: string; opts: string[] }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-slate-500 mb-1">{label}</label>
      <select defaultValue={val} className="w-full h-9 px-3 rounded-lg border text-sm outline-none bg-white" style={{ borderColor: "var(--border)" }}>
        {opts.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  )
}
function SettingToggle({ label, hint, defaultChecked }: { label: string; hint?: string; defaultChecked?: boolean }) {
  const [on, setOn] = useState(defaultChecked ?? false)
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
      <div>
        <div className="text-xs font-medium text-slate-700">{label}</div>
        {hint && <div className="text-[10px] text-slate-400 mt-0.5">{hint}</div>}
      </div>
      <button onClick={() => setOn(v => !v)} className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 mt-0.5 ${on ? "bg-blue-600" : "bg-slate-200"}`}>
        <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${on ? "translate-x-4" : "translate-x-0"}`} />
      </button>
    </div>
  )
}
function SaveBtn({ label }: { label: string }) {
  const [saved, setSaved] = useState(false)
  return (
    <button
      onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2000) }}
      className={`h-9 px-5 rounded-lg text-xs font-medium transition-colors ${saved ? "bg-emerald-600 text-white" : "bg-blue-600 text-white hover:bg-blue-700"}`}
    >
      {saved ? "✓ Đã lưu" : label}
    </button>
  )
}

export function Settings() {
  const { t, lang } = useLang()
  const vi = lang === "vi"
  const sections = vi
    ? ["Chung", "Công ty", "Giao diện", "Tiền tệ & Số", "Thuế", "Email", "Lưu trữ", "Sao lưu"]
    : ["General", "Company", "Appearance", "Currency & Numbers", "Tax", "Email", "Storage", "Backup"]
  const [active, setActive] = useState(0)

  return (
    <div className="flex h-full">
      <div className="w-48 border-r bg-white flex-shrink-0 py-2" style={{ borderColor: "var(--border)" }}>
        {sections.map((s, i) => (
          <button key={s} onClick={() => setActive(i)} className={`w-full flex items-center h-8 px-4 text-xs transition-colors ${active === i ? "bg-blue-50 text-blue-700 font-semibold border-r-2 border-blue-600" : "text-slate-600 hover:bg-slate-50"}`}>
            {s}
          </button>
        ))}
      </div>
      <div className="flex-1 p-6 overflow-auto">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">{sections[active]}</h2>
        <div className="max-w-lg space-y-4">

          {/* 0 – General */}
          {active === 0 && (
            <>
              <SettingField label={vi ? "Tên hệ thống" : "System Name"} defaultVal="WarehouseOS" />
              <SettingSelect label={vi ? "Ngôn ngữ mặc định" : "Default Language"} val={vi ? "Tiếng Việt" : "English"} opts={["Tiếng Việt", "English"]} />
              <SettingSelect label={vi ? "Múi giờ" : "Timezone"} val="Asia/Ho_Chi_Minh (UTC+7)" opts={["Asia/Ho_Chi_Minh (UTC+7)", "Asia/Bangkok (UTC+7)", "UTC"]} />
              <SettingSelect label={vi ? "Định dạng ngày" : "Date Format"} val="DD/MM/YYYY" opts={["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]} />
              <div className="bg-slate-50 rounded-xl p-4 space-y-0">
                <SettingToggle label={vi ? "Xác nhận trước khi xóa" : "Confirm before delete"} defaultChecked hint={vi ? "Hiển thị hộp thoại xác nhận khi xóa dữ liệu" : "Show confirmation dialog when deleting data"} />
                <SettingToggle label={vi ? "Lưu tự động" : "Auto-save"} defaultChecked={true} hint={vi ? "Tự động lưu form sau 30 giây" : "Auto-save forms after 30 seconds"} />
                <SettingToggle label={vi ? "Âm thanh thông báo" : "Notification sounds"} hint={vi ? "Phát âm khi có thông báo mới" : "Play sound on new notifications"} />
              </div>
              <SaveBtn label={t("saveSettings")} />
            </>
          )}

          {/* 1 – Company */}
          {active === 1 && (
            <>
              <SettingField label={vi ? "Tên công ty" : "Company Name"} defaultVal="WarehouseOS Demo Co., Ltd." />
              <SettingField label={vi ? "Mã số thuế (MST)" : "Tax ID / VAT Number"} defaultVal="0123456789" />
              <SettingField label={vi ? "Địa chỉ" : "Address"} defaultVal={vi ? "123 Đường ABC, Quận 1, TP.HCM" : "123 ABC Street, District 1, HCMC"} />
              <SettingField label={vi ? "Điện thoại" : "Phone"} defaultVal="+84 28 1234 5678" />
              <SettingField label={vi ? "Website" : "Website"} defaultVal="https://warehouseos.vn" />
              <SettingField label={vi ? "Email liên hệ" : "Contact Email"} defaultVal="contact@warehouseos.vn" type="email" />
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">{vi ? "Logo công ty" : "Company Logo"}</label>
                <div className="border-2 border-dashed rounded-xl p-6 text-center" style={{ borderColor: "var(--border)" }}>
                  <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-lg mx-auto mb-2">W</div>
                  <p className="text-xs text-slate-400">{vi ? "Kéo thả hoặc click để thay đổi logo (PNG, SVG — max 2MB)" : "Drag & drop or click to change logo (PNG, SVG — max 2MB)"}</p>
                </div>
              </div>
              <SaveBtn label={t("saveSettings")} />
            </>
          )}

          {/* 2 – Appearance */}
          {active === 2 && (
            <>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-2">{vi ? "Chủ đề giao diện" : "Theme"}</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: "light", label: vi ? "Sáng" : "Light", preview: "bg-white border-2 border-blue-500" },
                    { key: "dark", label: vi ? "Tối" : "Dark", preview: "bg-slate-800" },
                    { key: "system", label: vi ? "Theo hệ thống" : "System", preview: "bg-gradient-to-r from-white to-slate-800" },
                    { key: "blue", label: vi ? "Xanh dương" : "Blue", preview: "bg-blue-600" },
                  ].map(t => (
                    <button key={t.key} className={`flex items-center gap-2.5 h-10 px-3 rounded-lg border text-xs text-left ${t.key === "light" ? "border-blue-500 bg-blue-50 text-blue-700 font-semibold" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                      <div className={`w-5 h-5 rounded ${t.preview} flex-shrink-0 border border-slate-200`} />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <SettingSelect label={vi ? "Màu nhấn (Accent color)" : "Accent Color"} val="Blue (#3b82f6)" opts={["Blue (#3b82f6)", "Indigo (#6366f1)", "Violet (#8b5cf6)", "Green (#10b981)", "Orange (#f59e0b)"]} />
              <SettingSelect label={vi ? "Mật độ hiển thị" : "Display Density"} val={vi ? "Tiêu chuẩn" : "Default"} opts={vi ? ["Nhỏ gọn", "Tiêu chuẩn", "Thoáng"] : ["Compact", "Default", "Comfortable"]} />
              <SettingSelect label={vi ? "Cỡ chữ" : "Font Size"} val="14px" opts={["12px", "13px", "14px", "15px", "16px"]} />
              <div className="bg-slate-50 rounded-xl p-4 space-y-0">
                <SettingToggle label={vi ? "Sidebar thu gọn khi màn hình nhỏ" : "Collapse sidebar on small screens"} defaultChecked />
                <SettingToggle label={vi ? "Hiệu ứng chuyển trang" : "Page transition animations"} defaultChecked={true} />
                <SettingToggle label={vi ? "Highlight dòng khi hover" : "Highlight row on hover"} defaultChecked={true} />
              </div>
              <SaveBtn label={t("saveSettings")} />
            </>
          )}

          {/* 3 – Currency & Numbers */}
          {active === 3 && (
            <>
              <SettingSelect label={vi ? "Tiền tệ mặc định" : "Default Currency"} val="VND — Việt Nam Đồng (₫)" opts={["VND — Việt Nam Đồng (₫)", "USD — US Dollar ($)", "EUR — Euro (€)", "JPY — Japanese Yen (¥)"]} />
              <SettingSelect label={vi ? "Định dạng số" : "Number Format"} val={vi ? "1.000.000 (dấu chấm)" : "1,000,000 (comma)"} opts={vi ? ["1.000.000 (dấu chấm)", "1,000,000 (dấu phẩy)", "1 000 000 (khoảng trắng)"] : ["1,000,000 (comma)", "1.000.000 (period)", "1 000 000 (space)"]} />
              <SettingSelect label={vi ? "Số chữ số thập phân" : "Decimal Places"} val="0" opts={["0", "1", "2", "3"]} />
              <SettingField label={vi ? "Tỷ giá USD/VND" : "USD/VND Exchange Rate"} defaultVal="25,450" hint={vi ? "Dùng để hiển thị tương đương khi cần" : "Used for equivalent display when needed"} />
              <SettingField label={vi ? "Tỷ giá EUR/VND" : "EUR/VND Exchange Rate"} defaultVal="27,820" />
              <div className="bg-slate-50 rounded-xl p-4 space-y-0">
                <SettingToggle label={vi ? "Hiển thị ký hiệu tiền tệ trước số" : "Show currency symbol before number"} defaultChecked />
                <SettingToggle label={vi ? "Hiển thị tương đương USD trên báo cáo" : "Show USD equivalent on reports"} />
              </div>
              <SaveBtn label={t("saveSettings")} />
            </>
          )}

          {/* 4 – Tax */}
          {active === 4 && (
            <>
              <SettingSelect label={vi ? "Mức thuế GTGT mặc định" : "Default VAT Rate"} val="10%" opts={["0%", "5%", "8%", "10%"]} />
              <SettingField label={vi ? "Mã số thuế công ty" : "Company Tax ID (MST)"} defaultVal="0123456789" hint={vi ? "Tự động điền trên hóa đơn" : "Auto-filled on invoices"} />
              <div className="bg-slate-50 rounded-xl p-4 space-y-0">
                <SettingToggle label={vi ? "Giá niêm yết đã bao gồm thuế" : "Listed prices include tax"} hint={vi ? "Giá hiển thị đã bao gồm VAT" : "Displayed price already includes VAT"} />
                <SettingToggle label={vi ? "Tách thuế trên hóa đơn" : "Show tax breakdown on invoices"} defaultChecked />
                <SettingToggle label={vi ? "Tự động tính thuế khi tạo đơn" : "Auto-calculate tax when creating orders"} defaultChecked={true} />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-2">{vi ? "Mức thuế đặc biệt theo danh mục" : "Category-specific Tax Rates"}</label>
                <div className="border rounded-xl overflow-hidden" style={{ borderColor: "var(--border)" }}>
                  {[
                    { cat: vi ? "Thiết bị điện tử" : "Electronics", rate: "10%" },
                    { cat: vi ? "Phần mềm & Dịch vụ" : "Software & Services", rate: "10%" },
                    { cat: vi ? "Hàng thiết yếu" : "Essential Goods", rate: "5%" },
                  ].map(r => (
                    <div key={r.cat} className="flex items-center justify-between px-3 py-2.5 border-b last:border-0 text-xs" style={{ borderColor: "var(--border)" }}>
                      <span className="text-slate-700">{r.cat}</span>
                      <select defaultValue={r.rate} className="h-7 px-2 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }}>
                        {["0%", "5%", "8%", "10%"].map(o => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
              <SaveBtn label={t("saveSettings")} />
            </>
          )}

          {/* 5 – Email */}
          {active === 5 && (
            <>
              <SettingField label="SMTP Host" defaultVal="smtp.gmail.com" />
              <div className="grid grid-cols-2 gap-3">
                <SettingField label="SMTP Port" defaultVal="587" />
                <SettingSelect label="Encryption" val="TLS" opts={["TLS", "SSL", "None"]} />
              </div>
              <SettingField label={vi ? "Tài khoản gửi (From)" : "Sender Address"} defaultVal="noreply@warehouseos.vn" type="email" />
              <SettingField label={vi ? "Tên hiển thị" : "Display Name"} defaultVal="WarehouseOS" />
              <SettingField label={vi ? "Mật khẩu ứng dụng" : "App Password"} defaultVal="••••••••••••" type="password" hint={vi ? "Dùng App Password của Google nếu bật 2FA" : "Use Google App Password if 2FA is enabled"} />
              <div className="bg-slate-50 rounded-xl p-4 space-y-0">
                <SettingToggle label={vi ? "Gửi email khi tạo đơn mua hàng" : "Send email on new purchase order"} defaultChecked />
                <SettingToggle label={vi ? "Gửi email xác nhận hóa đơn" : "Send invoice confirmation email"} defaultChecked={true} />
                <SettingToggle label={vi ? "Thông báo tồn kho thấp qua email" : "Low stock email alerts"} />
                <SettingToggle label={vi ? "Bản sao (CC) cho quản lý" : "CC manager on all emails"} />
              </div>
              <button className="flex items-center gap-2 h-9 px-4 rounded-lg border text-xs text-slate-600 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
                {vi ? "Gửi email kiểm tra →" : "Send test email →"}
              </button>
              <SaveBtn label={t("saveSettings")} />
            </>
          )}

          {/* 6 – Storage */}
          {active === 6 && (
            <>
              <div className="bg-slate-50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-700">{vi ? "Dung lượng đã dùng" : "Storage Used"}</span>
                  <span className="text-xs text-slate-500 mono">2.4 GB / 10 GB</span>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: "24%" }} />
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-[10px]">
                  {[
                    { label: vi ? "File đính kèm" : "Attachments", val: "1.2 GB", color: "bg-blue-500" },
                    { label: vi ? "Báo cáo" : "Reports", val: "0.8 GB", color: "bg-violet-500" },
                    { label: vi ? "Nhật ký" : "Logs", val: "0.4 GB", color: "bg-slate-400" },
                  ].map(s => (
                    <div key={s.label} className="flex items-center gap-1.5 text-slate-600">
                      <div className={`w-2 h-2 rounded-full ${s.color}`} />
                      <span>{s.label}: <span className="font-semibold">{s.val}</span></span>
                    </div>
                  ))}
                </div>
              </div>
              <SettingSelect label={vi ? "Nhà cung cấp lưu trữ" : "Storage Provider"} val={vi ? "Cục bộ (Local)" : "Local"} opts={vi ? ["Cục bộ (Local)", "Amazon S3", "Google Cloud Storage", "MinIO"] : ["Local", "Amazon S3", "Google Cloud Storage", "MinIO"]} />
              <SettingField label={vi ? "Thư mục lưu file" : "File Upload Path"} defaultVal="/var/warehouseos/uploads" hint={vi ? "Đường dẫn tuyệt đối trên server" : "Absolute path on the server"} />
              <SettingSelect label={vi ? "Giới hạn file upload" : "Max Upload File Size"} val="10 MB" opts={["5 MB", "10 MB", "25 MB", "50 MB", "100 MB"]} />
              <div className="bg-slate-50 rounded-xl p-4 space-y-0">
                <SettingToggle label={vi ? "Nén ảnh tự động" : "Auto-compress images"} defaultChecked />
                <SettingToggle label={vi ? "Xóa file tạm sau 24 giờ" : "Delete temp files after 24h"} defaultChecked={true} />
              </div>
              <SaveBtn label={t("saveSettings")} />
            </>
          )}

          {/* 7 – Backup */}
          {active === 7 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: vi ? "Sao lưu gần nhất" : "Last Backup", val: "2026-08-04 02:00", color: "text-emerald-600" },
                  { label: vi ? "Kích thước" : "Backup Size", val: "324 MB", color: "text-slate-900" },
                  { label: vi ? "Lịch tiếp theo" : "Next Scheduled", val: "2026-08-05 02:00", color: "text-blue-600" },
                  { label: vi ? "Số bản lưu" : "Backups Kept", val: "14 / 30", color: "text-slate-900" },
                ].map(s => (
                  <div key={s.label} className="bg-slate-50 rounded-xl p-3">
                    <div className="text-[10px] text-slate-400">{s.label}</div>
                    <div className={`text-sm font-bold mono mt-0.5 ${s.color}`}>{s.val}</div>
                  </div>
                ))}
              </div>
              <SettingSelect label={vi ? "Lịch sao lưu tự động" : "Auto-backup Schedule"} val={vi ? "Hàng ngày lúc 02:00" : "Daily at 02:00"} opts={vi ? ["Hàng ngày lúc 02:00", "Hàng tuần (Chủ nhật)", "Hàng tháng (ngày 1)", "Thủ công"] : ["Daily at 02:00", "Weekly (Sunday)", "Monthly (1st)", "Manual only"]} />
              <SettingField label={vi ? "Số bản lưu tối đa" : "Max Backups to Keep"} defaultVal="30" hint={vi ? "Các bản cũ hơn sẽ tự động xóa" : "Older backups are automatically deleted"} />
              <SettingSelect label={vi ? "Nơi lưu bản sao" : "Backup Destination"} val={vi ? "Cục bộ + Cloud" : "Local + Cloud"} opts={vi ? ["Chỉ cục bộ", "Chỉ Cloud", "Cục bộ + Cloud"] : ["Local only", "Cloud only", "Local + Cloud"]} />
              <div className="bg-slate-50 rounded-xl p-4 space-y-0">
                <SettingToggle label={vi ? "Mã hóa bản sao lưu" : "Encrypt backups"} defaultChecked={true} />
                <SettingToggle label={vi ? "Thông báo qua email khi hoàn tất" : "Email notification on completion"} defaultChecked />
              </div>
              <div className="flex gap-2">
                <button className="flex-1 h-9 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700">
                  {vi ? "Sao lưu ngay" : "Backup Now"}
                </button>
                <button className="h-9 px-4 rounded-lg border text-xs text-slate-600 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
                  {vi ? "Khôi phục..." : "Restore..."}
                </button>
              </div>
              <div className="border rounded-xl overflow-hidden" style={{ borderColor: "var(--border)" }}>
                <div className="bg-slate-50 px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b" style={{ borderColor: "var(--border)" }}>
                  {vi ? "Lịch sử sao lưu" : "Backup History"}
                </div>
                {[
                  { date: "2026-08-04 02:00", size: "324 MB", status: vi ? "Thành công" : "Success" },
                  { date: "2026-08-03 02:00", size: "321 MB", status: vi ? "Thành công" : "Success" },
                  { date: "2026-08-02 02:00", size: "318 MB", status: vi ? "Thành công" : "Success" },
                  { date: "2026-08-01 02:00", size: "315 MB", status: vi ? "Thành công" : "Success" },
                ].map(b => (
                  <div key={b.date} className="flex items-center justify-between px-3 py-2.5 border-b last:border-0 text-xs" style={{ borderColor: "var(--border)" }}>
                    <span className="mono text-slate-600">{b.date}</span>
                    <span className="text-slate-400">{b.size}</span>
                    <span className="text-emerald-600 font-medium">{b.status}</span>
                    <button className="text-[10px] text-blue-600 hover:underline">{vi ? "Khôi phục" : "Restore"}</button>
                  </div>
                ))}
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}

// --- Units (Đơn vị tính) ---
export function Units() {
  const { t, lang } = useLang()
  const units = [
    { code: "PCS", name: lang === "vi" ? "Cái" : "Piece", name_en: "Piece", type: lang === "vi" ? "Số lượng" : "Quantity", items: 68, status: "Active" },
    { code: "SET", name: lang === "vi" ? "Bộ" : "Set", name_en: "Set", type: lang === "vi" ? "Số lượng" : "Quantity", items: 12, status: "Active" },
    { code: "BOX", name: lang === "vi" ? "Hộp" : "Box", name_en: "Box", type: lang === "vi" ? "Số lượng" : "Quantity", items: 8, status: "Active" },
    { code: "KG", name: "Kilogram", name_en: "Kilogram", type: lang === "vi" ? "Khối lượng" : "Weight", items: 5, status: "Active" },
    { code: "MTR", name: lang === "vi" ? "Mét" : "Meter", name_en: "Meter", type: lang === "vi" ? "Chiều dài" : "Length", items: 3, status: "Active" },
    { code: "LTR", name: lang === "vi" ? "Lít" : "Liter", name_en: "Liter", type: lang === "vi" ? "Thể tích" : "Volume", items: 2, status: "Active" },
  ]
  return (
    <div className="flex flex-col h-full">
      <Toolbar onCreate={() => {}} createLabel={lang === "vi" ? "Thêm đơn vị" : "Add Unit"}
        templateFile="units" templateCols={["unit_code","unit_name_vi","unit_name_en","unit_type"]} />
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
              {[t("code"), lang === "vi" ? "Tên đơn vị" : "Unit Name", lang === "vi" ? "Tên tiếng Anh" : "English Name", lang === "vi" ? "Loại" : "Type", lang === "vi" ? "Số SP" : "Products", t("status"), ""].map(h => (
                <th key={h} className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {units.map(u => (
              <tr key={u.code} className="border-b hover:bg-slate-50/60 group" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-2.5 mono text-blue-600 font-bold">{u.code}</td>
                <td className="px-4 py-2.5 font-medium text-slate-800">{u.name}</td>
                <td className="px-4 py-2.5 text-slate-500">{u.name_en}</td>
                <td className="px-4 py-2.5 text-slate-500">{u.type}</td>
                <td className="px-4 py-2.5 mono text-center">{u.items}</td>
                <td className="px-4 py-2.5"><StatusBadge status={u.status} /></td>
                <td className="px-4 py-2.5"><button className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 opacity-0 group-hover:opacity-100"><MoreHorizontal size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager count={units.length} total={units.length} label={lang === "vi" ? "đơn vị" : "units"} />
    </div>
  )
}

// --- Goods Receipt (Nhập kho) ---
export function GoodsReceipt() {
  const { t, lang } = useLang()
  const [showCreate, setShowCreate] = useState(false)
  const receipts = [
    { id: "GRN-202608-0012", po: "PO-202608-000001", supplier: "Tech Distributor VN", warehouse: "HN-Warehouse-01", items: 3, status: "Completed", date: "2026-08-02", user: "Nguyễn Văn A" },
    { id: "GRN-202608-0011", po: "PO-202608-000002", supplier: "Samsung Vietnam", warehouse: "HCM-Warehouse-01", items: 2, status: "Partial", date: "2026-08-03", user: "Trần Thị B" },
    { id: "GRN-202607-0045", po: "PO-202607-000045", supplier: "Logitech APAC", warehouse: "DN-Warehouse-01", items: 4, status: "Completed", date: "2026-07-30", user: "Lê Văn C" },
  ]
  const heads = lang === "vi"
    ? ["Số phiếu", "Đơn mua", "Nhà cung cấp", "Kho nhập", "Số dòng", "Trạng thái", "Ngày", "Người tạo", ""]
    : ["Reference", "PO Ref", "Supplier", "Warehouse", "Items", "Status", "Date", "User", ""]
  return (
    <div className="flex flex-col h-full">
      <Toolbar onCreate={() => setShowCreate(true)} createLabel={lang === "vi" ? "Tạo phiếu nhập kho" : "Create GRN"} extra={
        <button className="flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs text-slate-600 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
          <Download size={13} /> {t("export")}
        </button>
      } />
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse min-w-[900px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
              {heads.map(h => <th key={h} className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {receipts.map(r => (
              <tr key={r.id} className="border-b hover:bg-slate-50/60 cursor-pointer group" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-2.5 mono text-blue-600 font-medium">{r.id}</td>
                <td className="px-4 py-2.5 mono text-slate-500">{r.po}</td>
                <td className="px-4 py-2.5 font-medium text-slate-800">{r.supplier}</td>
                <td className="px-4 py-2.5 text-slate-600">{r.warehouse}</td>
                <td className="px-4 py-2.5 mono text-center">{r.items}</td>
                <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-2.5 mono text-slate-400">{r.date}</td>
                <td className="px-4 py-2.5 text-slate-600">{r.user}</td>
                <td className="px-4 py-2.5"><button className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 opacity-0 group-hover:opacity-100"><MoreHorizontal size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager count={receipts.length} total={receipts.length} label={lang === "vi" ? "phiếu nhập kho" : "receipts"} />
    </div>
  )
}

// --- Purchase Return (Trả hàng NCC) ---
export function PurchaseReturn() {
  const { lang } = useLang()
  const returns = [
    { id: "PR-202608-0003", grn: "GRN-202608-0012", supplier: "Tech Distributor VN", warehouse: "HN-Warehouse-01", reason: lang === "vi" ? "Hàng lỗi" : "Defective", amount: 22000000, status: "Approved", date: "2026-08-03" },
    { id: "PR-202607-0008", grn: "GRN-202607-0045", supplier: "Logitech APAC", warehouse: "DN-Warehouse-01", reason: lang === "vi" ? "Giao sai quy cách" : "Wrong spec", amount: 8400000, status: "Draft", date: "2026-07-31" },
  ]
  const heads = lang === "vi"
    ? ["Số phiếu", "Phiếu nhập", "Nhà cung cấp", "Kho", "Lý do", "Giá trị", "Trạng thái", "Ngày", ""]
    : ["Reference", "GRN Ref", "Supplier", "Warehouse", "Reason", "Amount", "Status", "Date", ""]
  return (
    <div className="flex flex-col h-full">
      <Toolbar onCreate={() => {}} createLabel={lang === "vi" ? "Tạo phiếu trả hàng" : "Create Return"} />
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse min-w-[900px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
              {heads.map(h => <th key={h} className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {returns.map(r => (
              <tr key={r.id} className="border-b hover:bg-slate-50/60 cursor-pointer group" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-2.5 mono text-blue-600 font-medium">{r.id}</td>
                <td className="px-4 py-2.5 mono text-slate-500">{r.grn}</td>
                <td className="px-4 py-2.5 font-medium text-slate-800">{r.supplier}</td>
                <td className="px-4 py-2.5 text-slate-600">{r.warehouse}</td>
                <td className="px-4 py-2.5 text-slate-600">{r.reason}</td>
                <td className="px-4 py-2.5 mono font-semibold text-right text-red-600">{fmt(r.amount)}</td>
                <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-2.5 mono text-slate-400">{r.date}</td>
                <td className="px-4 py-2.5"><button className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 opacity-0 group-hover:opacity-100"><MoreHorizontal size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager count={returns.length} total={returns.length} label={lang === "vi" ? "phiếu trả hàng" : "returns"} />
    </div>
  )
}

// --- Supplier Payment (Thanh toán NCC) ---
export function SupplierPayment() {
  const { lang } = useLang()
  const payments = [
    { id: "SP-202608-0009", po: "PO-202608-000001", supplier: "Tech Distributor VN", method: lang === "vi" ? "Chuyển khoản" : "Bank Transfer", amount: 185000000, status: "Paid", date: "2026-08-02" },
    { id: "SP-202608-0008", po: "PO-202607-000045", supplier: "Logitech APAC", method: lang === "vi" ? "Chuyển khoản" : "Bank Transfer", amount: 84000000, status: "Paid", date: "2026-07-30" },
    { id: "SP-202608-0010", po: "PO-202608-000002", supplier: "Samsung Vietnam", method: lang === "vi" ? "Chưa thanh toán" : "Pending", amount: 392000000, status: "Partial", date: "2026-08-04" },
  ]
  const total = payments.reduce((a, b) => a + b.amount, 0)
  const heads = lang === "vi"
    ? ["Số phiếu", "Đơn mua", "Nhà cung cấp", "Phương thức", "Số tiền", "Trạng thái", "Ngày TT", ""]
    : ["Reference", "PO", "Supplier", "Method", "Amount", "Status", "Date", ""]
  return (
    <div className="flex flex-col h-full">
      <Toolbar onCreate={() => {}} createLabel={lang === "vi" ? "Ghi nhận thanh toán" : "Record Payment"} />
      <div className="grid grid-cols-3 gap-3 px-5 py-3 bg-white border-b flex-shrink-0" style={{ borderColor: "var(--border)" }}>
        {[
          { l: lang === "vi" ? "Tổng thanh toán" : "Total Paid", v: fmt(payments.filter(p => p.status === "Paid").reduce((a, b) => a + b.amount, 0)), c: "text-emerald-600" },
          { l: lang === "vi" ? "Còn phải trả" : "Outstanding", v: fmt(payments.filter(p => p.status !== "Paid").reduce((a, b) => a + b.amount, 0)), c: "text-amber-600" },
          { l: lang === "vi" ? "Tổng cộng" : "Grand Total", v: fmt(total), c: "text-slate-900" },
        ].map(c => (
          <div key={c.l} className="bg-slate-50 rounded-xl p-3">
            <div className="text-[10px] text-slate-400">{c.l}</div>
            <div className={`text-sm font-bold mono mt-0.5 ${c.c}`}>{c.v}</div>
          </div>
        ))}
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse min-w-[850px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
              {heads.map(h => <th key={h} className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {payments.map(p => (
              <tr key={p.id} className="border-b hover:bg-slate-50/60 cursor-pointer group" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-2.5 mono text-blue-600 font-medium">{p.id}</td>
                <td className="px-4 py-2.5 mono text-slate-500">{p.po}</td>
                <td className="px-4 py-2.5 font-medium text-slate-800">{p.supplier}</td>
                <td className="px-4 py-2.5 text-slate-600">{p.method}</td>
                <td className="px-4 py-2.5 mono font-semibold text-right">{fmt(p.amount)}</td>
                <td className="px-4 py-2.5"><StatusBadge status={p.status} /></td>
                <td className="px-4 py-2.5 mono text-slate-400">{p.date}</td>
                <td className="px-4 py-2.5"><button className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 opacity-0 group-hover:opacity-100"><MoreHorizontal size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager count={payments.length} total={payments.length} label={lang === "vi" ? "phiếu thanh toán" : "payments"} />
    </div>
  )
}

// --- Inventory Transfer (Chuyển kho) ---
export function InventoryTransfer() {
  const { lang } = useLang()
  const [showCreate, setShowCreate] = useState(false)
  const transfers = [
    { id: "TF-202608-0006", from: "HN-Warehouse-01", to: "DN-Warehouse-01", items: 2, status: "Completed", date: "2026-08-02", user: "Nguyễn Văn A" },
    { id: "TF-202608-0005", from: "HCM-Warehouse-01", to: "HN-Warehouse-01", items: 3, status: "In Transit", date: "2026-08-03", user: "Trần Thị B" },
    { id: "TF-202607-0018", from: "HN-Warehouse-01", to: "HCM-Warehouse-01", items: 5, status: "Completed", date: "2026-07-28", user: "Lê Văn C" },
  ]
  const heads = lang === "vi"
    ? ["Số phiếu", "Kho xuất", "Kho nhập", "Số dòng", "Trạng thái", "Ngày", "Người tạo", ""]
    : ["Reference", "From", "To", "Items", "Status", "Date", "User", ""]
  return (
    <div className="flex flex-col h-full">
      <Toolbar onCreate={() => setShowCreate(true)} createLabel={lang === "vi" ? "Tạo phiếu chuyển kho" : "Create Transfer"} />
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse min-w-[800px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
              {heads.map(h => <th key={h} className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {transfers.map(tr => (
              <tr key={tr.id} className="border-b hover:bg-slate-50/60 cursor-pointer group" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-2.5 mono text-blue-600 font-medium">{tr.id}</td>
                <td className="px-4 py-2.5 text-slate-700">{tr.from}</td>
                <td className="px-4 py-2.5 text-slate-700">
                  <div className="flex items-center gap-1"><ArrowRight size={12} className="text-slate-400" /> {tr.to}</div>
                </td>
                <td className="px-4 py-2.5 mono text-center">{tr.items}</td>
                <td className="px-4 py-2.5"><StatusBadge status={tr.status} /></td>
                <td className="px-4 py-2.5 mono text-slate-400">{tr.date}</td>
                <td className="px-4 py-2.5 text-slate-600">{tr.user}</td>
                <td className="px-4 py-2.5"><button className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 opacity-0 group-hover:opacity-100"><MoreHorizontal size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager count={transfers.length} total={transfers.length} label={lang === "vi" ? "phiếu chuyển kho" : "transfers"} />

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="text-sm font-semibold">{lang === "vi" ? "Tạo phiếu chuyển kho" : "Create Transfer"}</h2>
              <button onClick={() => setShowCreate(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"><X size={14} /></button>
            </div>
            <div className="p-5 space-y-3">
              {[[lang === "vi" ? "Kho xuất *" : "From Warehouse *"], [lang === "vi" ? "Kho nhập *" : "To Warehouse *"]].map(([l]) => (
                <div key={l}>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">{l}</label>
                  <select className="w-full h-8 px-3 rounded-lg border text-xs outline-none bg-white" style={{ borderColor: "var(--border)" }}>
                    <option>{lang === "vi" ? "Chọn kho..." : "Select warehouse..."}</option>
                    {["HN-Warehouse-01", "HCM-Warehouse-01", "DN-Warehouse-01"].map(w => <option key={w}>{w}</option>)}
                  </select>
                </div>
              ))}
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">{lang === "vi" ? "Ghi chú" : "Note"}</label>
                <textarea rows={2} className="w-full px-3 py-2 rounded-lg border text-xs outline-none resize-none" style={{ borderColor: "var(--border)" }} />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3.5 border-t bg-slate-50" style={{ borderColor: "var(--border)" }}>
              <button onClick={() => setShowCreate(false)} className="h-8 px-4 rounded-lg border text-xs text-slate-600" style={{ borderColor: "var(--border)" }}>{lang === "vi" ? "Hủy" : "Cancel"}</button>
              <button onClick={() => setShowCreate(false)} className="h-8 px-4 rounded-lg bg-blue-600 text-white text-xs font-medium">{lang === "vi" ? "Lưu" : "Save"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Delivery Notes (Phiếu giao hàng) ---
export function DeliveryNotes() {
  const { lang } = useLang()
  const deliveries = [
    { id: "DN-202608-0021", so: "SO-202608-000048", customer: "FPT Telecom", warehouse: "HN-Warehouse-01", address: "89 Láng Hạ, Hà Nội", carrier: "Giao Hàng Nhanh", items: 2, status: "Delivered", date: "2026-08-03" },
    { id: "DN-202608-0020", so: "SO-202608-000047", customer: "VNPT Group", warehouse: "HCM-Warehouse-01", address: "772 Điện Biên Phủ, HCM", carrier: "J&T Express", items: 3, status: "In Transit", date: "2026-08-03" },
    { id: "DN-202608-0019", so: "SO-202608-000045", customer: "Viettel Store", warehouse: "HN-Warehouse-01", address: "25 Nguyễn Thái Học, HN", carrier: "Giao Hàng Nhanh", items: 1, status: "Pending", date: "2026-08-04" },
  ]
  const heads = lang === "vi"
    ? ["Số phiếu", "Đơn bán", "Khách hàng", "Kho xuất", "Địa chỉ giao", "Đơn vị VC", "Số dòng", "Trạng thái", "Ngày", ""]
    : ["Reference", "SO", "Customer", "Warehouse", "Address", "Carrier", "Items", "Status", "Date", ""]
  return (
    <div className="flex flex-col h-full">
      <Toolbar onCreate={() => {}} createLabel={lang === "vi" ? "Tạo phiếu giao hàng" : "Create Delivery"} />
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse min-w-[1050px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
              {heads.map(h => <th key={h} className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {deliveries.map(d => (
              <tr key={d.id} className="border-b hover:bg-slate-50/60 cursor-pointer group" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-2.5 mono text-blue-600 font-medium">{d.id}</td>
                <td className="px-4 py-2.5 mono text-slate-500">{d.so}</td>
                <td className="px-4 py-2.5 font-medium text-slate-800">{d.customer}</td>
                <td className="px-4 py-2.5 text-slate-600">{d.warehouse}</td>
                <td className="px-4 py-2.5 text-slate-500 max-w-[140px] truncate">{d.address}</td>
                <td className="px-4 py-2.5 text-slate-600">{d.carrier}</td>
                <td className="px-4 py-2.5 mono text-center">{d.items}</td>
                <td className="px-4 py-2.5"><StatusBadge status={d.status} /></td>
                <td className="px-4 py-2.5 mono text-slate-400">{d.date}</td>
                <td className="px-4 py-2.5"><button className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 opacity-0 group-hover:opacity-100"><MoreHorizontal size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager count={deliveries.length} total={deliveries.length} label={lang === "vi" ? "phiếu giao hàng" : "deliveries"} />
    </div>
  )
}

// --- Invoices (Hóa đơn bán hàng) ---
export function Invoices() {
  const { lang } = useLang()
  const invoices = [
    { id: "INV-202608-001", so: "SO-202608-000048", customer: "FPT Telecom", amount: 52000000, tax: 5200000, total: 57200000, status: "Paid", date: "2026-08-03" },
    { id: "INV-202608-002", so: "SO-202608-000047", customer: "VNPT Group", amount: 98500000, tax: 9850000, total: 108350000, status: "Partial", date: "2026-08-03" },
    { id: "INV-202608-003", so: "SO-202608-000044", customer: "Nguyen Kim Corp", amount: 43000000, tax: 4300000, total: 47300000, status: "Overdue", date: "2026-08-01" },
    { id: "INV-202608-004", so: "SO-202608-000043", customer: "Viettel Store", amount: 175000000, tax: 17500000, total: 192500000, status: "Draft", date: "2026-08-04" },
  ]
  const heads = lang === "vi"
    ? ["Số HĐ", "Đơn bán", "Khách hàng", "Tiền hàng", "Thuế", "Tổng TT", "Trạng thái", "Ngày HĐ", ""]
    : ["Invoice #", "SO", "Customer", "Amount", "Tax", "Total", "Status", "Date", ""]
  const totalRevenue = invoices.reduce((a, b) => a + b.total, 0)
  return (
    <div className="flex flex-col h-full">
      <Toolbar onCreate={() => {}} createLabel={lang === "vi" ? "Tạo hóa đơn" : "Create Invoice"} extra={
        <button className="flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs text-slate-600 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
          <Printer size={13} /> {lang === "vi" ? "In" : "Print"}
        </button>
      } />
      <div className="grid grid-cols-4 gap-3 px-5 py-3 bg-white border-b flex-shrink-0" style={{ borderColor: "var(--border)" }}>
        {[
          { l: lang === "vi" ? "Tổng doanh thu" : "Total Revenue", v: fmt(totalRevenue), c: "text-blue-700" },
          { l: lang === "vi" ? "Đã thanh toán" : "Paid", v: fmt(invoices.filter(i => i.status === "Paid").reduce((a, b) => a + b.total, 0)), c: "text-emerald-600" },
          { l: lang === "vi" ? "Còn nợ" : "Outstanding", v: fmt(invoices.filter(i => i.status !== "Paid" && i.status !== "Draft").reduce((a, b) => a + b.total, 0)), c: "text-amber-600" },
          { l: lang === "vi" ? "Quá hạn" : "Overdue", v: fmt(invoices.filter(i => i.status === "Overdue").reduce((a, b) => a + b.total, 0)), c: "text-red-600" },
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
                <td className="px-4 py-2.5"><button className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 opacity-0 group-hover:opacity-100"><MoreHorizontal size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager count={invoices.length} total={invoices.length} label={lang === "vi" ? "hóa đơn" : "invoices"} />
    </div>
  )
}

// --- Customer Receipts (Thu tiền khách hàng) ---
export function CustomerReceipts() {
  const { lang } = useLang()
  const receipts = [
    { id: "CR-202608-0015", inv: "INV-202608-001", customer: "FPT Telecom", method: lang === "vi" ? "Chuyển khoản" : "Bank Transfer", amount: 57200000, status: "Paid", date: "2026-08-03" },
    { id: "CR-202608-0014", inv: "INV-202608-002", customer: "VNPT Group", method: lang === "vi" ? "Tiền mặt" : "Cash", amount: 50000000, status: "Paid", date: "2026-08-03" },
  ]
  const heads = lang === "vi"
    ? ["Số phiếu", "Số HĐ", "Khách hàng", "Phương thức", "Số tiền", "Trạng thái", "Ngày", ""]
    : ["Reference", "Invoice", "Customer", "Method", "Amount", "Status", "Date", ""]
  return (
    <div className="flex flex-col h-full">
      <Toolbar onCreate={() => {}} createLabel={lang === "vi" ? "Ghi nhận thu tiền" : "Record Receipt"} />
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse min-w-[800px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
              {heads.map(h => <th key={h} className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {receipts.map(r => (
              <tr key={r.id} className="border-b hover:bg-slate-50/60 cursor-pointer group" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-2.5 mono text-blue-600 font-medium">{r.id}</td>
                <td className="px-4 py-2.5 mono text-slate-500">{r.inv}</td>
                <td className="px-4 py-2.5 font-medium text-slate-800">{r.customer}</td>
                <td className="px-4 py-2.5 text-slate-600">{r.method}</td>
                <td className="px-4 py-2.5 mono font-semibold text-right text-emerald-700">{fmt(r.amount)}</td>
                <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-2.5 mono text-slate-400">{r.date}</td>
                <td className="px-4 py-2.5"><button className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 opacity-0 group-hover:opacity-100"><MoreHorizontal size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager count={receipts.length} total={receipts.length} label={lang === "vi" ? "phiếu thu" : "receipts"} />
    </div>
  )
}

// --- Payables (Công nợ phải trả) ---
export function Payables() {
  const { lang } = useLang()
  const data = [
    { ref: "PO-202608-000002", supplier: "Samsung Vietnam", date: "2026-08-02", due: "2026-09-01", amount: 392000000, paid: 0, remaining: 392000000, status: "Partial" },
    { ref: "PO-202608-000004", supplier: "Apple Vietnam", date: "2026-08-03", due: "2026-09-02", amount: 2250000000, paid: 0, remaining: 2250000000, status: "Partial" },
    { ref: "PO-202607-000044", supplier: "WD Technologies", date: "2026-07-25", due: "2026-08-24", amount: 140000000, paid: 140000000, remaining: 0, status: "Paid" },
  ]
  const totalRemaining = data.reduce((a, b) => a + b.remaining, 0)
  const heads = lang === "vi"
    ? ["Số ĐM", "Nhà cung cấp", "Ngày ĐM", "Ngày đến hạn", "Số tiền", "Đã trả", "Còn lại", "Trạng thái", ""]
    : ["PO", "Supplier", "PO Date", "Due Date", "Amount", "Paid", "Remaining", "Status", ""]
  return (
    <div className="flex flex-col h-full">
      <Toolbar onCreate={() => {}} createLabel={lang === "vi" ? "Ghi nhận trả tiền" : "Record Payment"} extra={
        <button className="flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs text-slate-600 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
          <Printer size={13} /> {lang === "vi" ? "In" : "Print"}
        </button>
      } />
      <div className="grid grid-cols-3 gap-3 px-5 py-3 bg-white border-b flex-shrink-0" style={{ borderColor: "var(--border)" }}>
        {[
          { l: lang === "vi" ? "Tổng phải trả" : "Total Payable", v: fmt(data.reduce((a, b) => a + b.amount, 0)), c: "text-slate-900" },
          { l: lang === "vi" ? "Đã thanh toán" : "Paid", v: fmt(data.reduce((a, b) => a + b.paid, 0)), c: "text-emerald-600" },
          { l: lang === "vi" ? "Còn lại" : "Outstanding", v: fmt(totalRemaining), c: "text-red-600" },
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
            {data.map(r => (
              <tr key={r.ref} className="border-b hover:bg-slate-50/60 cursor-pointer" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-2.5 mono text-blue-600 font-medium">{r.ref}</td>
                <td className="px-4 py-2.5 font-medium text-slate-800">{r.supplier}</td>
                <td className="px-4 py-2.5 mono text-slate-400">{r.date}</td>
                <td className="px-4 py-2.5 mono text-slate-400">{r.due}</td>
                <td className="px-4 py-2.5 mono font-semibold text-right">{fmt(r.amount)}</td>
                <td className="px-4 py-2.5 mono text-right text-emerald-600">{fmt(r.paid)}</td>
                <td className="px-4 py-2.5 mono text-right font-bold text-red-600">{fmt(r.remaining)}</td>
                <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-2.5"><button className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"><MoreHorizontal size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager count={data.length} total={data.length} label={lang === "vi" ? "khoản phải trả" : "payables"} />
    </div>
  )
}

// --- Cash Book (Sổ quỹ) ---
export function CashBook() {
  const { lang } = useLang()
  const entries = [
    { id: "CB-0028", date: "2026-08-04 08:15", type: lang === "vi" ? "Thu" : "Receipt", ref: "CR-202608-0015", desc: lang === "vi" ? "Thu tiền FPT Telecom - INV-202608-001" : "Collect FPT Telecom - INV-202608-001", amount: 57200000, balance: 185642000 },
    { id: "CB-0027", date: "2026-08-03 16:30", type: lang === "vi" ? "Chi" : "Payment", ref: "SP-202608-0009", desc: lang === "vi" ? "Trả tiền Tech Distributor VN - PO-202608-000001" : "Pay Tech Distributor VN - PO-202608-000001", amount: -185000000, balance: 128442000 },
    { id: "CB-0026", date: "2026-08-03 14:10", type: lang === "vi" ? "Thu" : "Receipt", ref: "CR-202608-0014", desc: lang === "vi" ? "Thu tiền VNPT Group - INV-202608-002 (một phần)" : "Collect VNPT Group - INV-202608-002 (partial)", amount: 50000000, balance: 313442000 },
    { id: "CB-0025", date: "2026-08-02 09:00", type: lang === "vi" ? "Thu" : "Receipt", ref: "CR-202608-0013", desc: lang === "vi" ? "Thu tiền Viettel Store" : "Collect Viettel Store", amount: 192500000, balance: 263442000 },
    { id: "CB-0024", date: "2026-08-01 15:45", type: lang === "vi" ? "Chi" : "Payment", ref: "SP-202608-0008", desc: lang === "vi" ? "Trả tiền Logitech APAC - PO-202607-000045" : "Pay Logitech APAC - PO-202607-000045", amount: -84000000, balance: 70942000 },
  ]
  const openingBalance = 154942000
  const closingBalance = 185642000
  return (
    <div className="flex flex-col h-full">
      <Toolbar extra={
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">{lang === "vi" ? "Ngày:" : "Date:"}</span>
          <input type="date" defaultValue="2026-08-04" className="h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} />
        </div>
      } />
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 px-5 py-3 bg-white border-b flex-shrink-0" style={{ borderColor: "var(--border)" }}>
        {[
          { l: lang === "vi" ? "Số dư đầu ngày" : "Opening Balance", v: fmt(openingBalance), c: "text-slate-700" },
          { l: lang === "vi" ? "Tổng thu/chi" : "Net Movement", v: (closingBalance - openingBalance >= 0 ? "+" : "") + fmt(closingBalance - openingBalance), c: closingBalance - openingBalance >= 0 ? "text-emerald-600" : "text-red-600" },
          { l: lang === "vi" ? "Số dư cuối ngày" : "Closing Balance", v: fmt(closingBalance), c: "text-blue-700" },
        ].map(c => (
          <div key={c.l} className="bg-slate-50 rounded-xl p-3">
            <div className="text-[10px] text-slate-400">{c.l}</div>
            <div className={`text-sm font-bold mono mt-0.5 ${c.c}`}>{c.v}</div>
          </div>
        ))}
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse min-w-[900px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
              {[lang === "vi" ? "Mã phiếu" : "Entry ID", lang === "vi" ? "Ngày giờ" : "Date/Time", lang === "vi" ? "Loại" : "Type", lang === "vi" ? "Chứng từ" : "Reference", lang === "vi" ? "Diễn giải" : "Description", lang === "vi" ? "Số tiền" : "Amount", lang === "vi" ? "Số dư" : "Balance"].map(h => (
                <th key={h} className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map(e => (
              <tr key={e.id} className="border-b hover:bg-slate-50/60" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-2.5 mono text-blue-600 font-medium">{e.id}</td>
                <td className="px-4 py-2.5 mono text-slate-400 text-[10px] whitespace-nowrap">{e.date}</td>
                <td className="px-4 py-2.5">
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${e.amount > 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{e.type}</span>
                </td>
                <td className="px-4 py-2.5 mono text-slate-500 whitespace-nowrap">{e.ref}</td>
                <td className="px-4 py-2.5 text-slate-700 max-w-[260px] truncate">{e.desc}</td>
                <td className={`px-4 py-2.5 mono font-bold text-right ${e.amount > 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {e.amount > 0 ? "+" : ""}{fmt(e.amount)}
                </td>
                <td className="px-4 py-2.5 mono font-semibold text-right text-slate-900">{fmt(e.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager count={entries.length} total={entries.length} label={lang === "vi" ? "giao dịch" : "transactions"} />
    </div>
  )
}
