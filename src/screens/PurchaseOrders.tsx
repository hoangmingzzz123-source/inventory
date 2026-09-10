import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertCircle, Check, CheckCircle, Download, Plus, Printer, RefreshCw, Search, Trash2, X, XCircle } from "lucide-react"
import StatusBadge from "../components/StatusBadge"
import { useLang } from "../i18n/LangContext"
import { formatDateTimeUtc7 } from "../lib/dateUtils"
import { exportCsv, exportXlsx, printTable } from "./GenericList"
import { useDemo } from "../contexts/DemoContext"
import { useAuth } from "../contexts/AuthContext"
import { deletePurchaseOrder, fetchProducts, fetchPurchaseOrders, fetchSuppliers, fetchWarehouses, receiveGoodsReceipt, upsertPurchaseOrder } from "../lib/dataService"
import { confirmAppAction } from "../lib/appEvents"
import { formatVnd } from "../lib/numberFormat"

const fmt = formatVnd

function newLine() {
  return { product_id: "", product_name: "", sku: "", qty: 1, unit_cost: 0 }
}

type ReceiveLot = {
  qty: number
  unitCost: number
  batchNumber: string
  manufactureDate: string
  expiryDate: string
}

export default function PurchaseOrders() {
  const { t, lang } = useLang()
  const { isDemo } = useDemo()
  const { profile, can } = useAuth()
  const [orders, setOrders] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [showCreate, setShowCreate] = useState(false)
  const [showDetail, setShowDetail] = useState<any | null>(null)
  const [showReceive, setShowReceive] = useState<any | null>(null)
  const [receiveLots, setReceiveLots] = useState<Record<string, ReceiveLot>>({})
  const [items, setItems] = useState<any[]>([newLine()])
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok })
    window.setTimeout(() => setToast(null), 3000)
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    const context = { isDemo, orgId: profile?.org_id }
    const [orderResult, productResult, supplierResult, warehouseResult] = await Promise.all([
      fetchPurchaseOrders(context),
      fetchProducts(context),
      fetchSuppliers(context),
      fetchWarehouses(context),
    ])
    const error = orderResult.error ?? productResult.error ?? supplierResult.error ?? warehouseResult.error
    if (error) showToast(error.message ?? String(error), false)
    setOrders(orderResult.data ?? [])
    setProducts(productResult.data ?? [])
    setSuppliers(supplierResult.data ?? [])
    setWarehouses(warehouseResult.data ?? [])
    setLoading(false)
  }, [isDemo, profile?.org_id])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const filtered = useMemo(() => orders.filter(order => {
    const statusMatches = filterStatus === "all" || order.status === filterStatus
    const query = search.trim().toLowerCase()
    return statusMatches && (!query || String(order.ref ?? order.id).toLowerCase().includes(query) || String(order.supplier_name ?? order.supplier ?? "").toLowerCase().includes(query))
  }), [orders, filterStatus, search])

  const total = items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unit_cost || 0), 0)

  const updateStatus = async (order: any, status: string) => {
    setSaving(true)
    const result = await upsertPurchaseOrder({ id: order.id, status }, { isDemo, orgId: profile?.org_id })
    setSaving(false)
    if (result.error) return showToast(result.error.message ?? String(result.error), false)
    setShowDetail(null)
    await loadData()
    showToast(lang === "vi" ? "Đã cập nhật trạng thái" : "Status updated")
  }

  const openReceive = (order: any) => {
    const lots: Record<string, ReceiveLot> = {}
    for (const item of order.items ?? []) {
      lots[String(item.product_id ?? item.sku)] = {
        qty: Number(item.remaining_qty ?? 0),
        unitCost: Number(item.unit_cost ?? 0),
        batchNumber: "",
        manufactureDate: "",
        expiryDate: "",
      }
    }
    setReceiveLots(lots)
    setShowReceive(order)
  }

  const updateReceiveLot = (key: string, field: keyof ReceiveLot, value: string | number) => {
    setReceiveLots(previous => ({
      ...previous,
      [key]: {
        ...(previous[key] ?? { qty: 0, unitCost: 0, batchNumber: "", manufactureDate: "", expiryDate: "" }),
        [field]: value,
      },
    }))
  }

  const receive = async () => {
    if (!showReceive) return
    const receiptItems = (showReceive.items ?? []).map((item: any) => ({
      product_id: item.product_id,
      product_name: item.product_name,
      sku: item.sku,
      qty: Math.min(Number(item.remaining_qty ?? 0), Math.max(0, Number(receiveLots[String(item.product_id ?? item.sku)]?.qty ?? 0))),
      unit_cost: Math.max(0, Number(receiveLots[String(item.product_id ?? item.sku)]?.unitCost ?? item.unit_cost ?? 0)),
      unit: item.unit,
      batch_number: receiveLots[String(item.product_id ?? item.sku)]?.batchNumber?.trim() || null,
      manufacture_date: receiveLots[String(item.product_id ?? item.sku)]?.manufactureDate || null,
      expiry_date: receiveLots[String(item.product_id ?? item.sku)]?.expiryDate || null,
    })).filter((item: any) => item.qty > 0)
    if (!receiptItems.length) return showToast(lang === "vi" ? "Vui lòng nhập số lượng nhận" : "Enter a receiving quantity", false)
    const missingBatch = receiptItems.find((item: any) => {
      const product = products.find(row => String(row.id) === String(item.product_id))
      return product?.track_batch && !item.batch_number
    })
    if (missingBatch) return showToast(lang === "vi" ? `Sản phẩm ${missingBatch.product_name} yêu cầu số lô` : `${missingBatch.product_name} requires a batch number`, false)
    const invalidDates = receiptItems.find((item: any) => item.manufacture_date && item.expiry_date && item.expiry_date < item.manufacture_date)
    if (invalidDates) return showToast(lang === "vi" ? "Hạn sử dụng không được trước ngày sản xuất" : "Expiry date cannot be before manufacture date", false)
    setSaving(true)
    const result = await receiveGoodsReceipt({
      sourceRef: showReceive.ref,
      receiptRef: `GR-${showReceive.ref}-${Date.now()}`,
      warehouseId: showReceive.warehouse_id,
      warehouseName: showReceive.warehouse_name,
      items: receiptItems,
    }, { isDemo, orgId: profile?.org_id })
    setSaving(false)
    if (result.error) return showToast(result.error.message ?? String(result.error), false)
    setShowReceive(null)
    setShowDetail(null)
    await loadData()
    showToast(lang === "vi" ? "Nhập kho thành công" : "Goods received")
  }

  const removeOrder = async (order: any) => {
    if (!await confirmAppAction(lang === "vi" ? `Xóa đơn nháp ${order.ref}?` : `Delete draft ${order.ref}?`, { destructive: true })) return
    const result = await deletePurchaseOrder(order.id, { isDemo, orgId: profile?.org_id })
    if (result.error) return showToast(result.error.message ?? String(result.error), false)
    await loadData()
    showToast(lang === "vi" ? "Đã xóa đơn nháp" : "Draft deleted")
  }

  const statusOptions = [
    ["all", lang === "vi" ? "Tất cả" : "All"],
    ["Draft", lang === "vi" ? "Nháp" : "Draft"],
    ["Pending Approval", lang === "vi" ? "Chờ duyệt" : "Pending"],
    ["Approved", lang === "vi" ? "Đã duyệt" : "Approved"],
    ["Receiving", lang === "vi" ? "Đang nhập" : "Receiving"],
    ["Completed", lang === "vi" ? "Hoàn tất" : "Completed"],
  ]

  const exportHeaders = [t("poNumber"), t("supplier"), t("warehouse"), t("status"), t("grandTotal"), lang === "vi" ? "Thanh toán" : "Payment", t("createdBy")]
  const exportRows = filtered.map(order => [order.ref, order.supplier_name, order.warehouse_name, order.status, order.total, order.payment_status, order.created_by])

  return (
    <div className="flex h-full flex-col relative">
      {toast && <div className={`fixed bottom-5 right-5 z-[80] flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium text-white shadow-lg ${toast.ok ? "bg-emerald-600" : "bg-red-500"}`}>
        {toast.ok ? <Check size={14} /> : <AlertCircle size={14} />} {toast.msg}
      </div>}

      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b bg-white px-5 py-2.5" style={{ borderColor: "var(--border)" }}>
        {can("Purchase", "create") && <button onClick={() => { setItems([newLine()]); setShowCreate(true) }} className="flex h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700">
          <Plus size={13} /> {lang === "vi" ? "Tạo PO" : "Create PO"}
        </button>}
        {can("Purchase", "export") && <button onClick={() => printTable("purchase-orders", exportHeaders, exportRows)} className="flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs text-slate-600 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
          <Printer size={13} /> {t("print")}
        </button>}
        {can("Purchase", "export") && <div className="relative group">
          <button className="flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs text-slate-600 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}><Download size={13} /> {t("export")}</button>
          <div className="absolute left-0 top-full z-50 hidden w-32 flex-col overflow-hidden rounded-lg border bg-white shadow-lg group-hover:flex" style={{ borderColor: "var(--border)" }}>
            <button onClick={() => exportCsv("purchase-orders", exportHeaders, exportRows)} className="px-3 py-2 text-left text-xs hover:bg-slate-50">CSV</button>
            <button onClick={() => exportXlsx("purchase-orders", exportHeaders, exportRows)} className="px-3 py-2 text-left text-xs hover:bg-slate-50">Excel</button>
          </div>
        </div>}
        <div className="flex-1" />
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder={lang === "vi" ? "Tìm số PO, nhà cung cấp..." : "Search PO, supplier..."} className="h-8 w-52 rounded-lg border pl-8 pr-3 text-xs outline-none" style={{ borderColor: "var(--border)" }} />
        </div>
        <select value={filterStatus} onChange={event => setFilterStatus(event.target.value)} className="h-8 rounded-lg border bg-white px-2 text-xs" style={{ borderColor: "var(--border)" }}>
          {statusOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <button onClick={() => void loadData()} disabled={loading} className="flex h-8 w-8 items-center justify-center rounded-lg border text-slate-500 disabled:opacity-50" style={{ borderColor: "var(--border)" }}><RefreshCw size={13} className={loading ? "animate-spin" : ""} /></button>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[950px] border-collapse text-xs">
          <thead className="sticky top-0 z-10"><tr className="border-b bg-slate-50" style={{ borderColor: "var(--border)" }}>
            {[t("poNumber"), t("supplier"), t("warehouse"), t("status"), t("grandTotal"), lang === "vi" ? "Thanh toán" : "Payment", t("createdBy"), lang === "vi" ? "Ngày tạo" : "Created", ""].map(header => <th key={header} className="whitespace-nowrap px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">{header}</th>)}
          </tr></thead>
          <tbody>
            {!loading && filtered.length === 0 && <tr><td colSpan={9} className="py-16 text-center text-sm text-slate-400">{t("noData")}</td></tr>}
            {filtered.map(order => <tr key={order.id} onClick={() => setShowDetail(order)} className="group cursor-pointer border-b hover:bg-slate-50/60" style={{ borderColor: "var(--border)" }}>
              <td className="px-4 py-2.5 font-semibold text-blue-600 mono">{order.ref}</td>
              <td className="px-4 py-2.5 font-medium text-slate-800">{order.supplier_name ?? order.supplier}</td>
              <td className="px-4 py-2.5 text-slate-600">{order.warehouse_name ?? order.warehouse}</td>
              <td className="px-4 py-2.5"><StatusBadge status={order.status} /></td>
              <td className="px-4 py-2.5 text-right font-semibold mono">{fmt(order.total)}</td>
              <td className="px-4 py-2.5"><StatusBadge status={order.payment_status ?? "Unpaid"} /></td>
              <td className="px-4 py-2.5 text-slate-500">{order.created_by ?? order.createdBy}</td>
              <td className="px-4 py-2.5 text-slate-400 mono">{formatDateTimeUtc7(order.created_at)}</td>
              <td className="px-4 py-2.5">{can("Purchase", "delete") && order.status === "Draft" && <button onClick={event => { event.stopPropagation(); void removeOrder(order) }} className="flex h-7 w-7 items-center justify-center rounded-md text-red-400 opacity-0 hover:bg-red-50 group-hover:opacity-100"><Trash2 size={14} /></button>}</td>
            </tr>)}
          </tbody>
        </table>
      </div>

      <div className="flex flex-shrink-0 items-center justify-between border-t bg-white px-5 py-2.5 text-xs text-slate-500" style={{ borderColor: "var(--border)" }}>
        <span>{t("showing")} {filtered.length} {t("of")} {orders.length}</span>
        <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px]">1 / 1</span>
      </div>

      {showCreate && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCreate(false)}>
        <div className="w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
          <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: "var(--border)" }}><h2 className="text-sm font-semibold">{lang === "vi" ? "Tạo đơn mua hàng" : "Create Purchase Order"}</h2><button onClick={() => setShowCreate(false)}><X size={15} /></button></div>
          <form onSubmit={async event => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            const supplierId = String(form.get("supplier_id") ?? "")
            const warehouseId = String(form.get("warehouse_id") ?? "")
            const validItems = items.filter(item => item.product_id && Number(item.qty) > 0)
            if (!supplierId || !warehouseId || !validItems.length || validItems.length !== items.length) return showToast(lang === "vi" ? "Vui lòng chọn nhà cung cấp, kho và sản phẩm hợp lệ" : "Select a valid supplier, warehouse and products", false)
            if (new Set(validItems.map(item => item.product_id)).size !== validItems.length) return showToast(lang === "vi" ? "Mỗi sản phẩm chỉ được xuất hiện một lần trong đơn mua" : "Each product may only appear once in a purchase order", false)
            const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement
            setSaving(true)
            const result = await upsertPurchaseOrder({
              supplier_id: supplierId,
              supplier_name: suppliers.find(row => String(row.id) === supplierId)?.name,
              warehouse_id: warehouseId,
              warehouse_name: warehouses.find(row => String(row.id) === warehouseId)?.name,
              expected_date: form.get("expected_date") || null,
              notes: form.get("notes") || null,
              status: submitter.value === "draft" ? "Draft" : "Pending Approval",
              total,
              created_by: profile?.full_name || profile?.email,
              items: validItems,
            }, { isDemo, orgId: profile?.org_id })
            setSaving(false)
            if (result.error) return showToast(result.error.message ?? String(result.error), false)
            setShowCreate(false)
            await loadData()
            showToast(lang === "vi" ? "Đã lưu đơn mua hàng" : "Purchase order saved")
          }}>
            <div className="max-h-[75vh] space-y-4 overflow-y-auto p-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <label className="text-[11px] font-medium text-slate-600">{t("supplier")} *<select required name="supplier_id" className="mt-1 h-8 w-full rounded-lg border bg-white px-2 text-xs" style={{ borderColor: "var(--border)" }}><option value="">--</option>{suppliers.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
                <label className="text-[11px] font-medium text-slate-600">{t("warehouse")} *<select required name="warehouse_id" className="mt-1 h-8 w-full rounded-lg border bg-white px-2 text-xs" style={{ borderColor: "var(--border)" }}><option value="">--</option>{warehouses.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
                <label className="text-[11px] font-medium text-slate-600">{t("expectedDate")}<input name="expected_date" type="date" className="mt-1 h-8 w-full rounded-lg border px-2 text-xs" style={{ borderColor: "var(--border)" }} /></label>
                <label className="text-[11px] font-medium text-slate-600 md:col-span-3">{t("note")}<input name="notes" className="mt-1 h-8 w-full rounded-lg border px-3 text-xs" style={{ borderColor: "var(--border)" }} /></label>
              </div>
              <div className="flex items-center justify-between"><h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{lang === "vi" ? "Chi tiết sản phẩm" : "Order items"}</h3><button type="button" onClick={() => setItems(previous => [...previous, newLine()])} className="flex items-center gap-1 text-xs text-blue-600"><Plus size={12} /> {t("addItem")}</button></div>
              <div className="overflow-auto rounded-xl border" style={{ borderColor: "var(--border)" }}><table className="w-full min-w-[650px] text-xs"><thead><tr className="border-b bg-slate-50" style={{ borderColor: "var(--border)" }}>{[t("product"), "SKU", t("qty"), t("unitPrice"), t("lineTotal"), ""].map(header => <th key={header} className="px-3 py-2 text-left text-[10px] uppercase text-slate-500">{header}</th>)}</tr></thead><tbody>
                {items.map((item, index) => <tr key={index} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <td className="px-3 py-1.5"><select required value={item.product_id} onChange={event => { const product = products.find(row => String(row.id) === event.target.value); setItems(previous => previous.map((line, lineIndex) => lineIndex === index ? { ...line, product_id: product?.id ?? "", product_name: product?.name ?? "", sku: product?.sku ?? "", unit_cost: Number(product?.cost ?? 0) } : line)) }} className="h-8 w-60 rounded border bg-white px-2" style={{ borderColor: "var(--border)" }}><option value="">-- {lang === "vi" ? "Chọn sản phẩm" : "Select product"} --</option>{products.map(product => <option key={product.id} value={product.id}>{product.name} ({product.sku})</option>)}</select></td>
                  <td className="px-3 py-1.5 text-slate-500 mono">{item.sku}</td>
                  <td className="px-3 py-1.5"><input required min={1} step={1} type="number" value={item.qty} onChange={event => setItems(previous => previous.map((line, lineIndex) => lineIndex === index ? { ...line, qty: Number(event.target.value) } : line))} className="h-8 w-20 rounded border px-2 text-right" style={{ borderColor: "var(--border)" }} /></td>
                  <td className="px-3 py-1.5"><input required min={0} type="number" value={item.unit_cost} onChange={event => setItems(previous => previous.map((line, lineIndex) => lineIndex === index ? { ...line, unit_cost: Number(event.target.value) } : line))} className="h-8 w-32 rounded border px-2 text-right" style={{ borderColor: "var(--border)" }} /></td>
                  <td className="px-3 py-1.5 text-right font-semibold mono">{fmt(item.qty * item.unit_cost)}</td>
                  <td className="px-3 py-1.5"><button type="button" disabled={items.length === 1} onClick={() => setItems(previous => previous.filter((_, lineIndex) => lineIndex !== index))} className="text-red-400 disabled:opacity-30"><Trash2 size={13} /></button></td>
                </tr>)}
              </tbody></table></div>
              <div className="text-right text-sm font-bold">{t("grandTotal")}: <span className="text-blue-600 mono">{fmt(total)} VND</span></div>
            </div>
            <div className="flex justify-end gap-2 border-t bg-slate-50 px-5 py-3.5" style={{ borderColor: "var(--border)" }}><button type="button" onClick={() => setShowCreate(false)} className="h-8 rounded-lg border px-4 text-xs">{t("cancel")}</button><button disabled={saving} type="submit" value="draft" className="h-8 rounded-lg bg-slate-200 px-4 text-xs">{lang === "vi" ? "Lưu nháp" : "Save draft"}</button><button disabled={saving} type="submit" value="submit" className="h-8 rounded-lg bg-blue-600 px-4 text-xs font-medium text-white">{t("submit")}</button></div>
          </form>
        </div>
      </div>}

      {showReceive && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setShowReceive(null)}>
          <div className="w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-5 py-3.5">
              <div>
                <h2 className="text-sm font-semibold">{lang === "vi" ? "Nhận hàng theo lô" : "Receive inventory lot"}</h2>
                <p className="mt-0.5 text-[10px] text-slate-400 mono">{showReceive.ref} · {showReceive.warehouse_name}</p>
              </div>
              <button onClick={() => setShowReceive(null)}><X size={14} /></button>
            </div>
            <div className="max-h-[65vh] overflow-auto p-5">
              <p className="mb-3 text-[11px] text-slate-500">
                {lang === "vi"
                  ? "Mỗi lần nhận hàng tạo một lớp giá vốn riêng. Có thể thay đổi đơn giá thực nhận so với PO."
                  : "Each receipt creates a separate cost layer. The actual receipt cost may differ from the PO cost."}
              </p>
              <table className="w-full min-w-[900px] text-xs">
                <thead>
                  <tr className="border-b">
                    {[t("product"), lang === "vi" ? "Còn lại" : "Remaining", lang === "vi" ? "Lần này" : "Now", lang === "vi" ? "Đơn giá thực nhập" : "Actual unit cost", lang === "vi" ? "Số lô" : "Batch", lang === "vi" ? "Ngày sản xuất" : "Manufactured", lang === "vi" ? "Hạn sử dụng" : "Expiry"].map(header => (
                      <th key={header} className="px-2 py-2 text-left text-[10px] uppercase text-slate-500">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(showReceive.items ?? []).map((item: any) => {
                    const key = String(item.product_id ?? item.sku)
                    const remaining = Number(item.remaining_qty ?? 0)
                    const lot = receiveLots[key] ?? { qty: 0, unitCost: Number(item.unit_cost ?? 0), batchNumber: "", manufactureDate: "", expiryDate: "" }
                    const product = products.find(row => String(row.id) === String(item.product_id))
                    return (
                      <tr key={key} className="border-b align-top">
                        <td className="px-2 py-2 font-medium">
                          {item.product_name}
                          <span className="mt-0.5 block text-[10px] text-slate-400 mono">{item.sku}</span>
                        </td>
                        <td className="px-2 py-2 mono">{remaining}</td>
                        <td className="px-2 py-2"><input min={0} max={remaining} step="0.01" type="number" value={lot.qty} onChange={event => updateReceiveLot(key, "qty", Math.min(remaining, Math.max(0, Number(event.target.value))))} className="h-8 w-24 rounded border px-2 text-right mono" /></td>
                        <td className="px-2 py-2"><input min={0} step="1" type="number" value={lot.unitCost} onChange={event => updateReceiveLot(key, "unitCost", Math.max(0, Number(event.target.value)))} className="h-8 w-32 rounded border px-2 text-right mono" /></td>
                        <td className="px-2 py-2">
                          <input required={Boolean(product?.track_batch && lot.qty > 0)} value={lot.batchNumber} onChange={event => updateReceiveLot(key, "batchNumber", event.target.value)} placeholder={product?.track_batch ? (lang === "vi" ? "Bắt buộc" : "Required") : (lang === "vi" ? "Tùy chọn" : "Optional")} className="h-8 w-28 rounded border px-2 text-xs" />
                        </td>
                        <td className="px-2 py-2"><input type="date" value={lot.manufactureDate} onChange={event => updateReceiveLot(key, "manufactureDate", event.target.value)} className="h-8 rounded border px-2 text-xs" /></td>
                        <td className="px-2 py-2"><input type="date" min={lot.manufactureDate || undefined} value={lot.expiryDate} onChange={event => updateReceiveLot(key, "expiryDate", event.target.value)} className="h-8 rounded border px-2 text-xs" /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 border-t bg-slate-50 px-5 py-3.5">
              <button onClick={() => setShowReceive(null)} className="h-8 rounded-lg border px-4 text-xs">{t("cancel")}</button>
              <button disabled={saving} onClick={() => void receive()} className="h-8 rounded-lg bg-emerald-600 px-4 text-xs font-medium text-white">{lang === "vi" ? "Xác nhận nhập" : "Confirm receipt"}</button>
            </div>
          </div>
        </div>
      )}

      {showDetail && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowDetail(null)}><div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={event => event.stopPropagation()}><div className="flex items-center justify-between border-b px-5 py-3.5"><div className="flex items-center gap-3"><h2 className="text-sm font-semibold mono">{showDetail.ref}</h2><StatusBadge status={showDetail.status} /></div><div className="flex items-center gap-2">{can("Purchase", "create") && ["Approved", "Receiving"].includes(showDetail.status) && <button onClick={() => openReceive(showDetail)} className="h-7 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white">{lang === "vi" ? "Nhận hàng" : "Receive"}</button>}{can("Purchase", "approve") && showDetail.status === "Pending Approval" && <><button disabled={saving} onClick={() => void updateStatus(showDetail, "Approved")} className="flex h-7 items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white"><CheckCircle size={12} />{t("approve")}</button><button disabled={saving} onClick={() => void updateStatus(showDetail, "Cancelled")} className="flex h-7 items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 text-xs text-red-600"><XCircle size={12} />{t("reject")}</button></>}<button onClick={() => setShowDetail(null)}><X size={14} /></button></div></div><div className="max-h-[75vh] space-y-4 overflow-y-auto p-5"><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[[t("supplier"), showDetail.supplier_name], [t("warehouse"), showDetail.warehouse_name], [lang === "vi" ? "Dự kiến" : "Expected", showDetail.expected_date || "—"], [t("grandTotal"), `${fmt(showDetail.total)} VND`], [lang === "vi" ? "Đã trả" : "Paid", `${fmt(showDetail.paid_amount)} VND`], [lang === "vi" ? "Còn phải trả" : "Outstanding", `${fmt(showDetail.outstanding_amount)} VND`], [t("createdBy"), showDetail.created_by], [lang === "vi" ? "Ngày tạo" : "Created", formatDateTimeUtc7(showDetail.created_at)]].map(([label, value]) => <div key={label}><span className="block text-[10px] font-semibold uppercase text-slate-400">{label}</span><span className="text-xs font-medium text-slate-800">{value || "—"}</span></div>)}</div><div className="overflow-hidden rounded-xl border"><table className="w-full text-xs"><thead><tr className="border-b bg-slate-50">{[t("product"), "SKU", t("qty"), lang === "vi" ? "Đã nhập" : "Received", lang === "vi" ? "Còn lại" : "Remaining", t("unitPrice"), t("lineTotal")].map(header => <th key={header} className="px-3 py-2 text-left text-[10px] uppercase text-slate-500">{header}</th>)}</tr></thead><tbody>{(showDetail.items ?? []).map((item: any) => <tr key={item.id} className="border-b last:border-0"><td className="px-3 py-2 font-medium">{item.product_name}</td><td className="px-3 py-2 text-slate-500 mono">{item.sku}</td><td className="px-3 py-2 text-center mono">{item.qty}</td><td className="px-3 py-2 text-center text-emerald-600 mono">{item.received_qty}</td><td className="px-3 py-2 text-center text-amber-600 mono">{item.remaining_qty}</td><td className="px-3 py-2 text-right mono">{fmt(item.unit_cost)}</td><td className="px-3 py-2 text-right font-semibold mono">{fmt(Number(item.qty) * Number(item.unit_cost))}</td></tr>)}</tbody></table></div></div></div></div>}
    </div>
  )
}
