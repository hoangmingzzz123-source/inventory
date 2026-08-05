import { useState, useEffect } from "react"
import { Plus, Search, Download, Printer, RefreshCw, CheckCircle, XCircle, MoreHorizontal, ChevronLeft, ChevronRight, X, Trash2, Check, AlertCircle } from "lucide-react"
import ConfirmModal from "../components/ConfirmModal"
import StatusBadge from "../components/StatusBadge"
import { purchaseOrders as initPOs, suppliers, warehouses } from "../data/mockData"
import { useLang } from "../i18n/LangContext"
import { useAuth } from "../contexts/AuthContext"
import { useDemo } from "../contexts/DemoContext"
import { exportCsv, exportXlsx } from "./GenericList"
import { fetchPurchaseOrders, upsertPurchaseOrder, deletePurchaseOrder, fetchPurchaseOrderItems, upsertPurchaseOrderItems, deletePurchaseOrderItem } from "../lib/dataService"

function fmt(n: number) { return new Intl.NumberFormat("vi-VN").format(n) }

type PurchaseOrderItem = {
  id?: string | number
  product: string
  sku: string
  qty: number
  price: number
  discount: number
  tax: number
}

const defaultItems: PurchaseOrderItem[] = [
  { product: "Dell Latitude 5540 i5", sku: "LP-DELL-001", qty: 5, price: 18500000, discount: 0, tax: 10 },
  { product: "LG 27\" 4K Monitor", sku: "MON-LG-003", qty: 3, price: 6200000, discount: 0, tax: 10 },
]

function validateItem(item: PurchaseOrderItem) {
  const invalidProduct = !item.product || String(item.product).trim() === ""
  const invalidQty = !Number.isFinite(Number(item.qty)) || Number(item.qty) <= 0
  const invalidPrice = !Number.isFinite(Number(item.price)) || Number(item.price) < 0
  return {
    invalid: invalidProduct || invalidQty || invalidPrice,
    invalidProduct,
    invalidQty,
    invalidPrice,
  }
}

export default function PurchaseOrders() {
  const { t, lang } = useLang()
  const { profile, hasRole } = useAuth()
  const { isDemo } = useDemo()
  const [pos, setPOs] = useState(initPOs)
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [showCreate, setShowCreate] = useState(false)
  const [showDetail, setShowDetail] = useState<typeof initPOs[0] | null>(null)
  const [items, setItems] = useState(defaultItems)
  const [detailItems, setDetailItems] = useState<typeof defaultItems>(defaultItems)
  const [supplier, setSupplier] = useState("")
  const [warehouse, setWarehouse] = useState("")
  const [currency, setCurrency] = useState("VND")
  const [expectedDate, setExpectedDate] = useState("")
  const [note, setNote] = useState("")
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmMessage, setConfirmMessage] = useState("")
  const [confirmAction, setConfirmAction] = useState<(() => Promise<void>) | null>(null)

  const showToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 2500) }

  useEffect(() => {
    async function load() {
      if (!profile) return
      setLoading(true)
      const { data, error } = await fetchPurchaseOrders({ isDemo, orgId: profile.org_id })
      if (error) {
        showToast(lang === "vi" ? "Không tải được đơn mua" : "Unable to load purchase orders", false)
      } else if (data) {
        setPOs(data.map((item: any) => ({
          id: item.ref || item.id,
          dbId: item.id,
          supplier: item.supplier_name,
          warehouse: item.warehouse_name,
          status: item.status,
          total: Number(item.total ?? 0),
          createdBy: item.created_by ?? "",
          date: item.created_at ? new Date(item.created_at).toISOString().split("T")[0] : "",
        })))
      }
      setLoading(false)
    }
    load()
  }, [profile, isDemo, lang])

  // load items for the selected PO detail view
  useEffect(() => {
    async function loadItems() {
      if (!showDetail || !profile) return
      const poDbId = (showDetail as any).dbId
      if (!poDbId) {
        setDetailItems(defaultItems)
        return
      }
      const { data, error } = await fetchPurchaseOrderItems(poDbId, { isDemo })
      if (error) {
        showToast(lang === "vi" ? "Không tải được chi tiết đơn" : "Unable to load order items", false)
        setDetailItems(defaultItems)
        return
      }
      if (data && data.length > 0) {
        setDetailItems(data.map((it: any) => ({ id: it.id, product: it.product_name, sku: it.sku || "", qty: Number(it.qty ?? 0), price: Number(it.unit_cost ?? 0), discount: 0, tax: 0 })))
      } else {
        setDetailItems(defaultItems)
      }
    }
    loadItems()
  }, [showDetail, profile, isDemo, lang])

  const filtered = pos.filter(p =>
    (filterStatus === "all" || p.status === filterStatus) &&
    (search === "" || p.id.toLowerCase().includes(search.toLowerCase()) || p.supplier.toLowerCase().includes(search.toLowerCase()))
  )

  const subtotal = items.reduce((acc, i) => acc + i.qty * i.price * (1 - i.discount / 100), 0)
  const taxAmt = items.reduce((acc, i) => acc + i.qty * i.price * (1 - i.discount / 100) * (i.tax / 100), 0)
  const grand = subtotal + taxAmt

  const handleApprove = async (po: typeof initPOs[0]) => {
    if (!profile) {
      showToast(lang === "vi" ? "Vui lòng đăng nhập để duyệt" : "Please log in to approve", false)
      return
    }
    setLoading(true)
    const { data, error } = await upsertPurchaseOrder({
      ref: po.id,
      supplier_name: po.supplier,
      warehouse_name: po.warehouse,
      status: "Approved",
      total: po.total,
      notes: note || null,
      created_by: po.createdBy,
      created_at: po.date,
    }, { isDemo, orgId: profile.org_id, role: profile?.role })
    setLoading(false)
    if (error) {
      showToast(lang === "vi" ? "Duyệt đơn thất bại" : "Approve failed", false)
      return
    }
    setPOs(prev => prev.map(p => p.id === po.id ? { ...p, status: "Approved" } : p))
    setShowDetail(null)
    showToast(lang === "vi" ? `Đã duyệt ${po.id}` : `Approved ${po.id}`)
  }

  const statusOptions = [
    { key: "all", label: lang === "vi" ? "Tất cả" : "All" },
    { key: "Draft", label: lang === "vi" ? "Nháp" : "Draft" },
    { key: "Pending Approval", label: lang === "vi" ? "Chờ duyệt" : "Pending" },
    { key: "Approved", label: lang === "vi" ? "Đã duyệt" : "Approved" },
    { key: "Completed", label: lang === "vi" ? "Hoàn tất" : "Completed" },
  ]

  return (
    <div className="flex flex-col h-full relative">
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-xs font-medium text-white ${toast.ok ? "bg-emerald-600" : "bg-red-500"}`}>
          {toast.ok ? <Check size={14} /> : <AlertCircle size={14} />} {toast.msg}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-5 py-2.5 bg-white border-b flex-shrink-0 flex-wrap gap-y-2" style={{ borderColor: "var(--border)" }}>
        {hasRole(["admin", "manager"]) && (
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors">
            <Plus size={13} /> {lang === "vi" ? "Tạo PO" : "Create PO"}
          </button>
        )}
        <button className="flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs text-slate-600 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
          <CheckCircle size={13} className="text-emerald-500" /> {t("approve")}
        </button>
        <button className="flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs text-slate-600 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
          <Printer size={13} /> {t("print")}
        </button>
        <div className="relative group">
          <button className="flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs text-slate-600 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
            <Download size={13} /> {t("export")}
          </button>
          <div className="absolute top-full left-0 mt-1 hidden group-hover:flex flex-col bg-white border rounded-lg shadow-lg w-32 z-50 overflow-hidden" style={{ borderColor: "var(--border)" }}>
            <button onClick={() => exportCsv("purchase-orders", [t("poNumber"), t("supplier"), t("warehouse"), t("status"), t("grandTotal"), t("createdBy"), lang === "vi" ? "Ngày tạo" : "Date"], filtered.map(p => [p.id, p.supplier, p.warehouse, p.status, p.total, p.createdBy, p.date]))} className="px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50">CSV</button>
            <button onClick={() => exportXlsx("purchase-orders", [t("poNumber"), t("supplier"), t("warehouse"), t("status"), t("grandTotal"), t("createdBy"), lang === "vi" ? "Ngày tạo" : "Date"], filtered.map(p => [p.id, p.supplier, p.warehouse, p.status, p.total, p.createdBy, p.date]))} className="px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50">Excel</button>
          </div>
        </div>
        <div className="flex-1" />
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={lang === "vi" ? "Tìm số PO, nhà cung cấp..." : "Search PO, supplier..."} className="h-8 pl-8 pr-3 rounded-lg border text-xs outline-none focus:ring-2 focus:ring-blue-500/20 w-52" style={{ borderColor: "var(--border)" }} />
        </div>
        <div className="flex items-center border rounded-lg overflow-hidden text-xs" style={{ borderColor: "var(--border)" }}>
          {statusOptions.map(s => (
            <button key={s.key} onClick={() => setFilterStatus(s.key)} className={`h-8 px-2.5 transition-colors whitespace-nowrap ${filterStatus === s.key ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{s.label}</button>
          ))}
        </div>
        <button className="w-8 h-8 flex items-center justify-center rounded-lg border text-slate-500 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse min-w-[900px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
              {[t("poNumber"), t("supplier"), t("warehouse"), t("status"), t("grandTotal"), t("createdBy"), lang === "vi" ? "Ngày tạo" : "Date", ""].map(h => (
                <th key={h} className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="py-16 text-center text-sm text-slate-400">{t("noData")}</td></tr>
            )}
            {filtered.map(po => (
              <tr key={po.id} className="border-b hover:bg-slate-50/60 group cursor-pointer" style={{ borderColor: "var(--border)" }} onClick={() => setShowDetail(po)}>
                <td className="px-4 py-2.5 mono text-blue-600 font-semibold">{po.id}</td>
                <td className="px-4 py-2.5 font-medium text-slate-800">{po.supplier}</td>
                <td className="px-4 py-2.5 text-slate-600">{po.warehouse}</td>
                <td className="px-4 py-2.5"><StatusBadge status={po.status} /></td>
                <td className="px-4 py-2.5 mono font-semibold text-right">{fmt(po.total)}</td>
                <td className="px-4 py-2.5 text-slate-500">{po.createdBy}</td>
                <td className="px-4 py-2.5 mono text-slate-400">{po.date}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    <button onClick={e => e.stopPropagation()} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100">
                      <MoreHorizontal size={14} />
                    </button>
                    {hasRole(["admin", "manager"]) && (
                      <button onClick={async (e) => { e.stopPropagation(); if (!profile) { setPOs(prev => prev.filter(x => x.id !== po.id)); } else { setLoading(true); const { error } = await deletePurchaseOrder(po.id, { isDemo, orgId: profile.org_id, role: profile?.role }); setLoading(false); if (error) { showToast(lang === "vi" ? "Xóa đơn thất bại" : "Failed to delete order", false); return } setPOs(prev => prev.filter(x => x.id !== po.id)); } }} className="w-7 h-7 flex items-center justify-center rounded-md text-red-400 hover:bg-red-50 hover:text-red-500"><Trash2 size={14} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-white border-t flex-shrink-0 text-xs text-slate-500" style={{ borderColor: "var(--border)" }}>
        <span>{t("showing")} {filtered.length} {t("of")} {pos.length} {lang === "vi" ? "đơn mua hàng" : "purchase orders"}</span>
        <div className="flex items-center gap-1">
          <button className="w-7 h-7 flex items-center justify-center rounded-md border hover:bg-slate-50" style={{ borderColor: "var(--border)" }}><ChevronLeft size={13} /></button>
          <button className="w-7 h-7 flex items-center justify-center rounded-md bg-blue-600 text-white">1</button>
          <button className="w-7 h-7 flex items-center justify-center rounded-md border hover:bg-slate-50" style={{ borderColor: "var(--border)" }}><ChevronRight size={13} /></button>
        </div>
      </div>

      {/* Create Dialog */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="text-sm font-semibold text-slate-900">{lang === "vi" ? "Tạo đơn mua hàng" : "Create Purchase Order"}</h2>
              <button onClick={() => setShowCreate(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"><X size={14} /></button>
            </div>
            <form onSubmit={e => {
              e.preventDefault();
              const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement;
              const isDraft = submitter.value === "draft";
              if (!supplier || !warehouse) {
                showToast(lang === "vi" ? "Vui lòng chọn nhà cung cấp và kho" : "Please select supplier and warehouse", false)
                return
              }
              const poRef = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`
              const newOrder = {
                id: poRef,
                supplier,
                warehouse,
                status: isDraft ? "Draft" : "Pending Approval",
                total: grand,
                createdBy: profile?.full_name ?? "Current User",
                date: expectedDate || new Date().toISOString().split("T")[0],
              }
              const createOrder = async () => {
                if (!profile) {
                  setPOs(prev => [newOrder, ...prev])
                  return
                }
                setLoading(true)
                const { data, error } = await upsertPurchaseOrder({
                  ref: poRef,
                  supplier_name: supplier,
                  warehouse_name: warehouse,
                  status: newOrder.status,
                  total: newOrder.total,
                  notes: note || null,
                  created_by: profile.full_name ?? profile.email,
                  created_at: newOrder.date,
                }, { isDemo, orgId: profile.org_id, role: profile?.role })
                setLoading(false)
                if (error) {
                  showToast(lang === "vi" ? "Tạo đơn thất bại" : "Failed to create order", false)
                  return
                }
                if (data?.[0]) {
                  const created = data[0]
                  setPOs(prev => [{
                    id: created.ref || created.id,
                    dbId: created.id,
                    supplier: created.supplier_name,
                    warehouse: created.warehouse_name,
                    status: created.status,
                    total: Number(created.total ?? 0),
                    createdBy: created.created_by ?? "",
                    date: created.created_at ? new Date(created.created_at).toISOString().split("T")[0] : newOrder.date,
                  }, ...prev])

                  // Persist items for the new PO
                  try {
                    // Validate items before persisting
                    const invalid = items.find(it => !it.product || String(it.product).trim() === "" || !(Number.isFinite(Number(it.qty)) && Number(it.qty) > 0) || !(Number.isFinite(Number(it.price)) && Number(it.price) >= 0))
                    if (invalid) {
                      showToast(lang === "vi" ? "Vui lòng kiểm tra tên, số lượng và giá của các mục" : "Please check item name, qty and price", false)
                    } else {
                      const itemsPayload = items.map(i => ({
                        po_id: created.id,
                        product_name: i.product || "",
                        sku: i.sku || null,
                        qty: i.qty,
                        unit_cost: i.price,
                      }))
                        if (itemsPayload.length > 0) {
                          const { data: itemData, error: itemErr } = await upsertPurchaseOrderItems(itemsPayload, { isDemo, orgId: profile.org_id, role: profile?.role })
                          if (itemErr) showToast(lang === "vi" ? "Lưu chi tiết PO thất bại" : "Failed to save order items", false)
                        }
                    }
                  } catch (err) {
                    console.error(err)
                  }
                }
              }
              void createOrder()
              setShowCreate(false);
              showToast(isDraft ? (lang === "vi" ? "Đã lưu nháp" : "Saved as draft") : (lang === "vi" ? "Đã gửi duyệt thành công" : "Submitted for approval"));
            }}>
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-3 gap-3">
                {([
                  [t("supplier") + " *", suppliers.map(s => s.name), "supplier"],
                  [t("warehouse") + " *", warehouses.map(w => w.name), "warehouse"],
                  [t("currency"), ["VND", "USD", "EUR"], "currency"],
                  [t("expectedDate"), null, "expectedDate"],
                ] as [string, string[] | null, string][]).map(([label, opts, name]) => (
                  <div key={name}>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">{label}</label>
                    {opts ? (
                      <select value={name === "supplier" ? supplier : name === "warehouse" ? warehouse : currency}
                        onChange={e => {
                          if (name === "supplier") setSupplier(e.target.value)
                          if (name === "warehouse") setWarehouse(e.target.value)
                          if (name === "currency") setCurrency(e.target.value)
                        }}
                        className="w-full h-8 px-3 rounded-lg border text-xs outline-none focus:ring-2 focus:ring-blue-500/20 bg-white" style={{ borderColor: "var(--border)" }}>
                        <option value="">{lang === "vi" ? "Chọn..." : "Select..."}</option>
                        {opts.map(o => <option key={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input value={expectedDate} onChange={e => setExpectedDate(e.target.value)} type="date" className="w-full h-8 px-3 rounded-lg border text-xs outline-none focus:ring-2 focus:ring-blue-500/20" style={{ borderColor: "var(--border)" }} />
                    )}
                  </div>
                ))}
                <div className="col-span-2">
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">{t("note")}</label>
                  <input value={note} onChange={e => setNote(e.target.value)} placeholder={lang === "vi" ? "Ghi chú (không bắt buộc)" : "Optional note..."} className="w-full h-8 px-3 rounded-lg border text-xs outline-none focus:ring-2 focus:ring-blue-500/20" style={{ borderColor: "var(--border)" }} />
                </div>
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{lang === "vi" ? "Danh sách sản phẩm" : "Order Items"}</h3>
                  <button onClick={() => setItems(prev => [...prev, { product: "", sku: "", qty: 1, price: 0, discount: 0, tax: 10 }])} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                    <Plus size={12} /> {t("addItem")}
                  </button>
                </div>
                <div className="border rounded-xl overflow-hidden" style={{ borderColor: "var(--border)" }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
                        {[t("product"), "SKU", t("qty"), t("unitPrice"), t("discount") + "%", t("tax") + "%", t("lineTotal"), ""].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500 text-[10px] uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, i) => {
                        const lineTotal = item.qty * item.price * (1 - item.discount / 100) * (1 + item.tax / 100)
                        const validation = validateItem(item)
                        return (
                          <tr key={i} className={`border-b last:border-0 ${validation.invalid ? "bg-rose-50/80" : ""}`} style={{ borderColor: validation.invalid ? "#fca5a5" : "var(--border)" }}>
                            <td className="px-3 py-1.5">
                              <input value={item.product} onChange={e => setItems(prev => prev.map((it, j) => j === i ? { ...it, product: e.target.value } : it))} className={`w-40 h-7 px-2 border rounded text-xs outline-none focus:ring-1 ${validation.invalid ? "border-red-300 focus:ring-red-300" : "border"}`} style={{ borderColor: validation.invalid ? "#fca5a5" : "var(--border)" }} />
                            </td>
                            <td className="px-3 py-1.5 mono text-slate-500">{item.sku}</td>
                            <td className="px-3 py-1.5">
                              <input type="number" value={item.qty} onChange={e => setItems(prev => prev.map((it, j) => j === i ? { ...it, qty: +e.target.value } : it))} className={`w-16 h-7 px-2 border rounded text-xs mono text-center outline-none focus:ring-1 ${validation.invalidQty ? "border-red-300 focus:ring-red-300" : "border"}`} style={{ borderColor: validation.invalidQty ? "#fca5a5" : "var(--border)" }} />
                            </td>
                            <td className="px-3 py-1.5">
                              <input type="number" value={item.price} onChange={e => setItems(prev => prev.map((it, j) => j === i ? { ...it, price: +e.target.value } : it))} className={`w-28 h-7 px-2 border rounded text-xs mono text-right outline-none focus:ring-1 ${validation.invalidPrice ? "border-red-300 focus:ring-red-300" : "border"}`} style={{ borderColor: validation.invalidPrice ? "#fca5a5" : "var(--border)" }} />
                            </td>
                            <td className="px-3 py-1.5"><input type="number" value={item.discount} onChange={e => setItems(prev => prev.map((it, j) => j === i ? { ...it, discount: +e.target.value } : it))} className="w-14 h-7 px-2 border rounded text-xs mono text-center outline-none" style={{ borderColor: "var(--border)" }} /></td>
                            <td className="px-3 py-1.5"><input type="number" value={item.tax} onChange={e => setItems(prev => prev.map((it, j) => j === i ? { ...it, tax: +e.target.value } : it))} className="w-14 h-7 px-2 border rounded text-xs mono text-center outline-none" style={{ borderColor: "var(--border)" }} /></td>
                            <td className="px-3 py-1.5 mono font-semibold text-right">{fmt(lineTotal)}</td>
                            <td className="px-3 py-1.5">
                              <button onClick={() => setItems(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600"><Trash2 size={13} /></button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end">
                <div className="w-64 space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-600"><span>{t("subtotal")}</span><span className="mono">{fmt(subtotal)}</span></div>
                  <div className="flex justify-between text-slate-600"><span>{t("tax")}</span><span className="mono">{fmt(taxAmt)}</span></div>
                  <div className="flex justify-between font-bold text-slate-900 border-t pt-1.5" style={{ borderColor: "var(--border)" }}>
                    <span>{t("grandTotal")}</span>
                    <span className="mono text-blue-600">{fmt(grand)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t bg-slate-50" style={{ borderColor: "var(--border)" }}>
              <button type="button" onClick={() => setShowCreate(false)} className="h-8 px-4 rounded-lg border text-xs text-slate-600 hover:bg-white" style={{ borderColor: "var(--border)" }}>{t("cancel")}</button>
              <button type="submit" value="draft" className="h-8 px-4 rounded-lg bg-slate-100 text-xs text-slate-700 hover:bg-slate-200 font-medium">{lang === "vi" ? "Lưu nháp" : "Save Draft"}</button>
              <button type="submit" value="submit" className="h-8 px-4 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700">{t("submit")}</button>
            </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowDetail(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-slate-900 mono">{showDetail.id}</h2>
                <StatusBadge status={showDetail.status} />
              </div>
              <ConfirmModal open={confirmOpen} message={confirmMessage} onCancel={() => { setConfirmOpen(false); setConfirmAction(null) }} onConfirm={async () => { setConfirmOpen(false); if (confirmAction) await confirmAction(); setConfirmAction(null) }} />
              <div className="flex items-center gap-2">
                {showDetail.status === "Approved" && (
                  <button className="h-7 px-3 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600">{lang === "vi" ? "Nhận hàng" : "Receive Goods"}</button>
                )}
                {showDetail.status === "Pending Approval" && (
                  hasRole(["admin", "manager"]) ? (
                    <>
                      <button onClick={() => handleApprove(showDetail)} className="h-7 px-3 rounded-lg bg-blue-600 text-white text-xs font-medium flex items-center gap-1 hover:bg-blue-700">
                        <CheckCircle size={12} /> {t("approve")}
                      </button>
                      <button onClick={() => setShowDetail(null)} className="h-7 px-3 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs font-medium flex items-center gap-1">
                        <XCircle size={12} /> {t("reject")}
                      </button>
                    </>
                  ) : (
                    <div className="text-xs text-slate-500">{lang === "vi" ? "Không có quyền duyệt" : "No permission to approve"}</div>
                  )
                )}
                <button onClick={() => setShowDetail(null)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"><X size={14} /></button>
              </div>
            </div>
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-3 gap-x-6 gap-y-3">
                {[
                  [t("supplier"), showDetail.supplier],
                  [t("warehouse"), showDetail.warehouse],
                  [lang === "vi" ? "Ngày tạo" : "Date", showDetail.date],
                  [t("createdBy"), showDetail.createdBy],
                  [t("currency"), "VND"],
                  [t("grandTotal"), fmt(showDetail.total) + " VND"],
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{k}</span>
                    <span className="text-xs text-slate-800 font-medium">{v}</span>
                  </div>
                ))}
              </div>

              <div className="border rounded-xl overflow-hidden" style={{ borderColor: "var(--border)" }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
                      {[t("product"), "SKU", t("qty"), t("unitPrice"), t("lineTotal")].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detailItems.map((item, i) => {
                      const validation = validateItem(item)
                      const invalidRow = validation.invalid
                      return (
                        <tr
                          key={item.id ?? i}
                          className={`border-b last:border-0 ${invalidRow ? "bg-rose-50/80" : ""}`}
                          style={{ borderColor: invalidRow ? "#fca5a5" : "var(--border)" }}
                        >
                          <td className="px-3 py-2 font-medium text-slate-800">
                            {item.product || <span className="text-rose-500 text-[11px]">{lang === "vi" ? "Thiếu sản phẩm" : "Missing product"}</span>}
                          </td>
                          <td className="px-3 py-2 mono text-slate-500">{item.sku}</td>
                          <td className="px-3 py-2 mono text-center">
                            <input
                              type="number"
                              value={item.qty}
                              onChange={e => setDetailItems(prev => prev.map((it, j) => j === i ? { ...it, qty: +e.target.value } : it))}
                              className={`w-16 h-7 px-2 border rounded text-xs mono text-center outline-none ${validation.invalidQty ? "border-red-300 focus:ring-red-300" : "border"}`}
                              style={{ borderColor: validation.invalidQty ? "#fca5a5" : "var(--border)" }}
                            />
                          </td>
                          <td className="px-3 py-2 mono text-right">
                            <input
                              type="number"
                              value={item.price}
                              onChange={e => setDetailItems(prev => prev.map((it, j) => j === i ? { ...it, price: +e.target.value } : it))}
                              className={`w-28 h-7 px-2 border rounded text-xs mono text-right outline-none ${validation.invalidPrice ? "border-red-300 focus:ring-red-300" : "border"}`}
                              style={{ borderColor: validation.invalidPrice ? "#fca5a5" : "var(--border)" }}
                            />
                          </td>
                          <td className="px-3 py-2 mono font-semibold text-right">{fmt(item.qty * item.price)}</td>
                          <td className="px-3 py-2">
                            {hasRole(["admin", "manager"]) ? (
                              item.id ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setConfirmMessage(lang === "vi" ? "Xác nhận xóa mục này?" : "Confirm delete this item?")
                                    setConfirmAction(() => async () => {
                                      if (!item.id) return
                                      setLoading(true)
                                      const { error } = await deletePurchaseOrderItem(item.id, { isDemo, role: profile?.role })
                                      setLoading(false)
                                      if (error) {
                                        showToast(lang === "vi" ? "Xóa mục thất bại" : "Failed to delete item", false)
                                        return
                                      }
                                      setDetailItems(prev => prev.filter(x => x.id !== item.id))
                                      showToast(lang === "vi" ? "Đã xóa mục" : "Item deleted")
                                    })
                                    setConfirmOpen(true)
                                  }}
                                  className="text-red-400 hover:text-red-600"
                                >
                                  <Trash2 size={13} />
                                </button>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setConfirmMessage(lang === "vi" ? "Xác nhận xóa mục này?" : "Confirm delete this item?")
                                    setConfirmAction(() => async () => setDetailItems(prev => prev.filter((_, j) => j !== i)))
                                    setConfirmOpen(true)
                                  }}
                                  className="text-red-400 hover:text-red-600"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )
                            ) : (
                              <div className="text-xs text-slate-400">{lang === "vi" ? "No permission" : "No permission"}</div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                    <tr className="bg-slate-50">
                      <td colSpan={4} className="px-3 py-2 font-bold text-right text-slate-700">{t("grandTotal")}</td>
                      <td className="px-3 py-2 mono font-bold text-blue-600 text-right">{fmt(showDetail.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between mt-3">
                <div />
                  <div className="flex items-center gap-2">
                  {hasRole(["admin", "manager"]) ? (
                    <button onClick={async () => {
                      if (!profile) { showToast(lang === "vi" ? "Vui lòng đăng nhập" : "Please log in", false); return }
                      const poDbId = (showDetail as any).dbId
                      if (!poDbId) { showToast(lang === "vi" ? "Không tìm thấy PO" : "PO not found", false); return }
                      // Validation
                      const invalid = detailItems.find((it, idx) => !it.product || String(it.product).trim() === "" || !(Number.isFinite(Number(it.qty)) && Number(it.qty) > 0) || !(Number.isFinite(Number(it.price)) && Number(it.price) >= 0))
                      if (invalid) {
                        showToast(lang === "vi" ? "Vui lòng kiểm tra tên, số lượng và giá của các mục" : "Please check item name, qty and price", false)
                        return
                      }
                      setLoading(true)
                      const payload = detailItems.map(i => ({ id: (i as any).id, po_id: poDbId, product_name: i.product, sku: i.sku || null, qty: i.qty, unit_cost: i.price }))
                      const { data: itemData, error } = await upsertPurchaseOrderItems(payload, { isDemo, orgId: profile.org_id, role: profile?.role })
                      setLoading(false)
                      if (error) { showToast(lang === "vi" ? "Lưu mục thất bại" : "Failed to save items", false); return }
                      showToast(lang === "vi" ? "Đã lưu mục" : "Items saved")
                    }} className="h-8 px-3 rounded-lg bg-slate-100 text-xs text-slate-700 hover:bg-slate-200 font-medium">{lang === "vi" ? "Lưu mục" : "Save Items"}</button>
                  ) : (
                    <div className="text-xs text-slate-400">{lang === "vi" ? "Không có quyền" : "No permission"}</div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{t("activity")}</h3>
                <div className="space-y-2.5">
                  {[
                    { action: lang === "vi" ? "Đơn hàng đã tạo" : "Purchase Order Created", user: showDetail.createdBy, time: showDetail.date + " 09:00" },
                    { action: lang === "vi" ? "Đã gửi duyệt" : "Submitted for Approval", user: showDetail.createdBy, time: showDetail.date + " 09:05" },
                  ].map((e, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-xs">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                      <div>
                        <span className="text-slate-700 font-medium">{e.action}</span>
                        <span className="text-slate-400"> · {lang === "vi" ? "bởi" : "by"} {e.user} · </span>
                        <span className="text-slate-400 mono">{e.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
