import { useState, useEffect, useMemo } from "react"
import { Plus, Search, FileSpreadsheet, Download, ChevronLeft, ChevronRight, Check, X, FileText, Upload, Save, Printer, Info, ExternalLink, Edit, Trash2, Send, Ban } from "lucide-react"
import StatusBadge from "../components/StatusBadge"
import { useLang } from "../i18n/LangContext"
import { quotations as mockQuotations, importRecords, products, suppliers, customers } from "../data/mockData"
import { exportCsv, exportXlsx, Toolbar } from "./GenericList"
import { useDemo } from "../contexts/DemoContext"
import { useAuth } from "../contexts/AuthContext"
import { fetchQuotations, upsertQuotation, deleteQuotation, fetchProducts, fetchSuppliers, fetchCustomers, upsertGoodsReceipt } from "../lib/dataService"

function fmt(n: number) { return new Intl.NumberFormat("vi-VN").format(n) }

function QuotationForm({ onClose, vi, mode = "create", initialData = null, onSave, productOptions = [], supplierOptions = [], customerOptions = [] }: { onClose: () => void; vi: boolean, mode?: "create" | "edit" | "view", initialData?: any, onSave?: (data: any) => void, productOptions?: Array<{value: string, label: string}>, supplierOptions?: Array<{value: string, label: string}>, customerOptions?: Array<{value: string, label: string}> }) {
  const [customerId, setCustomerId] = useState(initialData?.customer_id || "")
  const [date, setDate] = useState(initialData?.date || new Date().toISOString().split("T")[0])
  const [validUntil, setValidUntil] = useState(initialData?.valid_until || "")
  const [globalDiscount, setGlobalDiscount] = useState(initialData?.discount_val || 0)
  const [discountType, setDiscountType] = useState<"pct" | "amount">(initialData?.discount_type || "pct")
  const [notes, setNotes] = useState(initialData?.notes || "")
  
  const [items, setItems] = useState<any[]>(initialData?.items?.length ? initialData.items.map((it: any, i: number) => ({ ...it, id: it.id || Date.now() + i })) : [{ id: Date.now(), product_id: "", supplier_id: "", import_unit: "", sell_unit: "", qty: 1, cost_price: 0, profit_pct: 0, selling_price: 0, vat_pct: 10, total: 0 }])
  const [activeRowId, setActiveRowId] = useState<number | null>(null)

  const activeItem = items.find(i => i.id === activeRowId)
  const isView = mode === "view"
  
  const latestImport = useMemo(() => {
    if (!activeItem || !activeItem.product_id) return null;
    const records = importRecords.filter(r => r.product_id === activeItem.product_id).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return records.length > 0 ? records[0] : null
  }, [activeItem?.product_id, customerId])

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
  
  const validateAndSave = () => {
    if (!customerId) return alert(vi ? "Vui lòng chọn khách hàng" : "Please select a customer")
    if (!date) return alert(vi ? "Vui lòng chọn ngày báo giá" : "Please select a date")
    if (discountType === "pct" && (globalDiscount < 0 || globalDiscount > 100)) return alert(vi ? "Chiết khấu % phải từ 0 đến 100" : "Discount % must be between 0 and 100")
    if (items.some(i => i.qty <= 0)) return alert(vi ? "Số lượng phải lớn hơn 0" : "Quantity must be greater than 0")
    if (items.some(i => i.selling_price < 0)) return alert(vi ? "Đơn giá bán không hợp lệ" : "Selling price is invalid")
    if (items.some(i => !i.product_id)) return alert(vi ? "Vui lòng chọn sản phẩm cho tất cả các dòng" : "Please select product for all rows")
    if (onSave) {
      onSave({
        customer_id: customerId,
        date,
        valid_until: validUntil,
        discount_val: globalDiscount,
        discount_type: discountType,
        notes,
        items,
        total: finalTotal
      })
    }
  }

  return (
    <div className="absolute inset-0 bg-slate-50 z-20 flex flex-col">
      <div className="flex items-center justify-between px-5 py-3 border-b bg-white" style={{ borderColor: "var(--border)" }}>
        <h2 className="text-base font-semibold">{vi ? (mode === "create" ? "Tạo báo giá mới" : mode === "edit" ? "Sửa báo giá" : "Chi tiết báo giá") : (mode === "create" ? "New Quotation" : mode === "edit" ? "Edit Quotation" : "Quotation Details")}</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()} className="h-8 px-3 rounded-lg border text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-1" style={{ borderColor: "var(--border)" }}>
            <Printer size={13} /> {vi ? "In báo giá" : "Print"}
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
              <div className="col-span-4">
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
                      <span className="font-medium text-slate-900">{latestImport.date}</span>
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
                        <span className="font-medium text-slate-900">{latestQuotation.date}</span>
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
  const [data, setData] = useState<any[]>(mockQuotations)
  const { isDemo } = useDemo()
  const { profile } = useAuth()

  useEffect(() => {
    fetchQuotations({ isDemo, orgId: profile?.org_id }).then(res => {
      if (res.data) setData(res.data)
    })
  }, [isDemo, profile])
  
  const [search, setSearch] = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [editingItem, setEditingItem] = useState<any>(null)
  const [viewingItem, setViewingItem] = useState<any>(null)

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
      // Create goods receipt record for each item
      for (let idx = 0; idx < q.items.length; idx++) {
        const item = q.items[idx]
        const prodOpt = productOptions.find(p => p.value === item.product_id)
        const suppOpt = supplierOptions.find(s => s.value === item.supplier_id)
        
        const grPayload = {
          receipt_id: `GR-${Date.now()}-${idx}`,
          product_id: item.product_id,
          product_name: prodOpt?.label || item.product_name || "",
          supplier_id: item.supplier_id,
          supplier_name: suppOpt?.label || "",
          cost_price: Number(item.cost_price) || 0,
          unit: item.import_unit || "Piece",
          qty: Number(item.qty) || 0,
          date: new Date().toISOString().split("T")[0],
          quotation_id: id,
          customer_id: q.customer_id,
          customer_name: q.customer_name,
          status: "received"
        }
        await upsertGoodsReceipt(grPayload, { isDemo, orgId: profile?.org_id })
      }
      
      // Update quotation status
      await upsertQuotation({ id, status: "converted" } as any, { isDemo, orgId: profile?.org_id })
      
      // Refresh data
      const res = await fetchQuotations({ isDemo, orgId: profile?.org_id })
      if (res.data) setData(res.data)
      
      alert(vi ? `Đã chuyển báo giá ${id} thành Phiếu nhập kho (Goods Receipt) thành công!` : `Quotation ${id} converted to Goods Receipt successfully!`)
    } catch (error) {
      console.error("Error converting quotation:", error)
      alert(vi ? "Lỗi khi chuyển báo giá" : "Error converting quotation")
    }
  }

  const updateStatus = (id: string, st: string) => {
    // persist status change
    upsertQuotation({ id, status: st } as any, { isDemo, orgId: profile?.org_id }).then(res => {
      if (res && res.error) alert(vi ? "Lỗi" : "Error")
      else fetchQuotations({ isDemo, orgId: profile?.org_id }).then(r => { if (r.data) setData(r.data) })
    })
  }

  const handleSave = (form: any) => {
    const c = customers.find(c => c.code === form.customer_id)
    if (editingItem) {
      upsertQuotation({ id: editingItem.id, ...form } as any, { isDemo, orgId: profile?.org_id }).then(res => {
        if (res && res.error) alert(vi ? "Lỗi khi lưu" : "Save failed")
        else {
          setEditingItem(null)
          fetchQuotations({ isDemo, orgId: profile?.org_id }).then(r => { if (r.data) setData(r.data) })
          alert(vi ? "Cập nhật thành công!" : "Updated successfully!")
        }
      })
    } else {
      const payload: any = { ...form, status: "Draft" }
      upsertQuotation(payload, { isDemo, orgId: profile?.org_id }).then(res => {
        if (res && res.error) alert(vi ? "Lỗi khi tạo báo giá" : "Create failed")
        else {
          fetchQuotations({ isDemo, orgId: profile?.org_id }).then(r => { if (r.data) setData(r.data) })
          setShowCreate(false)
          alert(vi ? "Tạo báo giá thành công!" : "Quotation created!")
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
        onCreate={() => setShowCreate(true)} 
        createLabel={vi ? "Tạo báo giá" : "Create Quote"}
        onExportXlsx={exportData}
        onImport={() => {}}
        templateFile="quotations"
        templateCols={heads}
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
                    {(q.status.toLowerCase() === "draft" || q.status.toLowerCase() === "pending") && (
                      <button onClick={() => updateStatus(q.id, "Sent")} title={vi ? "Gửi khách hàng" : "Send"} className="w-7 h-7 flex items-center justify-center rounded border text-blue-600 hover:bg-blue-50" style={{ borderColor: "var(--border)" }}>
                        <Send size={14} />
                      </button>
                    )}
                    {q.status.toLowerCase() === "sent" && (
                      <>
                        <button onClick={() => updateStatus(q.id, "Accepted")} title={vi ? "Chấp thuận" : "Accept"} className="w-7 h-7 flex items-center justify-center rounded border text-emerald-600 hover:bg-emerald-50" style={{ borderColor: "var(--border)" }}>
                          <Check size={14} />
                        </button>
                        <button onClick={() => updateStatus(q.id, "Rejected")} title={vi ? "Từ chối" : "Reject"} className="w-7 h-7 flex items-center justify-center rounded border text-red-600 hover:bg-red-50" style={{ borderColor: "var(--border)" }}>
                          <Ban size={14} />
                        </button>
                      </>
                    )}
                    {q.status.toLowerCase() === "accepted" && (
                      <button onClick={() => convertToGoodsReceipt(q.id)} title={vi ? "Tạo phiếu nhập kho" : "Create PO/Receipt"} className="w-7 h-7 flex items-center justify-center rounded border bg-emerald-50 text-emerald-700 hover:bg-emerald-100" style={{ borderColor: "var(--border)" }}>
                        <Upload size={14} />
                      </button>
                    )}
                    <button onClick={() => setViewingItem(q)} className="w-7 h-7 flex items-center justify-center rounded border text-slate-400 hover:text-slate-600 hover:bg-white" style={{ borderColor: "var(--border)" }} title={vi ? "Xem chi tiết" : "View Details"}>
                      <FileText size={14} />
                    </button>
                    {(q.status.toLowerCase() === "draft" || q.status.toLowerCase() === "pending") && (
                      <button onClick={() => setEditingItem(q)} className="w-7 h-7 flex items-center justify-center rounded border text-slate-400 hover:text-slate-600 hover:bg-white" style={{ borderColor: "var(--border)" }} title={vi ? "Sửa" : "Edit"}>
                        <Edit size={14} />
                      </button>
                    )}
                    <button onClick={() => { if(confirm(vi ? "Bạn có chắc muốn hủy/xóa báo giá này?" : "Are you sure to cancel this quote?")) updateStatus(q.id, "Cancelled") }} className="w-7 h-7 flex items-center justify-center rounded border text-slate-400 hover:text-red-500 hover:bg-red-50" style={{ borderColor: "var(--border)" }} title={vi ? "Hủy" : "Cancel"}>
                      <Trash2 size={14} />
                    </button>
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
        <div className="flex items-center gap-1">
          <button className="w-7 h-7 flex items-center justify-center rounded-md border hover:bg-slate-50" style={{ borderColor: "var(--border)" }}><ChevronLeft size={13} /></button>
          <button className="w-7 h-7 flex items-center justify-center rounded-md bg-blue-600 text-white">1</button>
          <button className="w-7 h-7 flex items-center justify-center rounded-md border hover:bg-slate-50" style={{ borderColor: "var(--border)" }}><ChevronRight size={13} /></button>
        </div>
      </div>

      {showCreate && <QuotationForm onClose={() => setShowCreate(false)} vi={vi} mode="create" onSave={handleSave} productOptions={productOptions} supplierOptions={supplierOptions} customerOptions={customerOptions} />}
      {editingItem && <QuotationForm onClose={() => setEditingItem(null)} vi={vi} mode="edit" initialData={editingItem} onSave={handleSave} productOptions={productOptions} supplierOptions={supplierOptions} customerOptions={customerOptions} />}
      {viewingItem && <QuotationForm onClose={() => setViewingItem(null)} vi={vi} mode="view" initialData={viewingItem} productOptions={productOptions} supplierOptions={supplierOptions} customerOptions={customerOptions} />}
    </div>
  )
}
