const fs = require('fs');

const code = `import { useState, useEffect, useMemo } from "react"
import { Plus, Search, FileSpreadsheet, Download, ChevronLeft, ChevronRight, Check, X, FileText, Upload, Save, Printer, Info, ExternalLink } from "lucide-react"
import StatusBadge from "../components/StatusBadge"
import { useLang } from "../i18n/LangContext"
import { quotations as mockQuotations, importRecords, products, suppliers, customers } from "../data/mockData"
import { exportCsv, exportXlsx, Toolbar } from "./GenericList"
import { useDemo } from "../contexts/DemoContext"
import { useAuth } from "../contexts/AuthContext"
import { fetchQuotations } from "../lib/dataService"

function fmt(n: number) { return new Intl.NumberFormat("vi-VN").format(n) }

function QuotationCreate({ onClose, vi }: { onClose: () => void; vi: boolean }) {
  const [customerId, setCustomerId] = useState("")
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [validUntil, setValidUntil] = useState("")
  const [globalDiscount, setGlobalDiscount] = useState(0)
  
  const [items, setItems] = useState<any[]>([{ id: Date.now(), product_id: "", supplier_id: "", qty: 1, cost_price: 0, profit_pct: 0, selling_price: 0, total: 0 }])
  const [activeRowId, setActiveRowId] = useState<number | null>(null)

  const activeItem = items.find(i => i.id === activeRowId)
  
  // Find latest import record for the selected product of the active row
  const latestImport = useMemo(() => {
    if (!activeItem || !activeItem.product_id) return null;
    const records = importRecords.filter(r => r.product_id === activeItem.product_id).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return records.length > 0 ? records[0] : null
  }, [activeItem?.product_id])

  const handleProductChange = (rowId: number, productId: string) => {
    const prod = products.find(p => p.id === productId)
    if (!prod) return;
    
    // Find latest import
    const records = importRecords.filter(r => r.product_id === productId).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    const latest = records.length > 0 ? records[0] : null
    
    setItems(prev => prev.map(i => {
      if (i.id === rowId) {
        const cost = latest ? latest.cost_price : 0
        const profit = 20
        const sell = cost * (1 + profit/100)
        return {
          ...i,
          product_id: productId,
          supplier_id: latest ? latest.supplier_id : "",
          cost_price: cost,
          profit_pct: profit,
          selling_price: sell,
          total: sell * i.qty
        }
      }
      return i
    }))
  }

  const handleUpdateItem = (rowId: number, field: string, val: number | string) => {
    setItems(prev => prev.map(i => {
      if (i.id === rowId) {
        const updated = { ...i, [field]: val }
        
        // Recalculate
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
  const finalTotal = subtotal * (1 - globalDiscount/100)

  return (
    <div className="absolute inset-0 bg-slate-50 z-20 flex flex-col">
      <div className="flex items-center justify-between px-5 py-3 border-b bg-white" style={{ borderColor: "var(--border)" }}>
        <h2 className="text-base font-semibold">{vi ? "Tạo báo giá mới" : "New Quotation"}</h2>
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
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">{vi ? "Khách hàng" : "Customer"}</label>
                <select value={customerId} onChange={e => setCustomerId(e.target.value)} className="w-full h-9 px-3 rounded-lg border text-sm outline-none bg-white" style={{ borderColor: "var(--border)" }}>
                  <option value="">-- {vi ? "Chọn khách hàng" : "Select customer"} --</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">{vi ? "Ngày báo giá" : "Date"}</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full h-9 px-3 rounded-lg border text-sm outline-none" style={{ borderColor: "var(--border)" }} />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">{vi ? "Hiệu lực đến" : "Valid Until"}</label>
                <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className="w-full h-9 px-3 rounded-lg border text-sm outline-none" style={{ borderColor: "var(--border)" }} />
              </div>
            </div>
          </div>
          
          <div className="flex-1 p-5 overflow-auto">
            <label className="block text-[11px] font-medium text-slate-500 mb-2">{vi ? "Chi tiết sản phẩm" : "Product Details"}</label>
            <div className="border rounded-lg overflow-hidden" style={{ borderColor: "var(--border)" }}>
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
                  <tr>
                    <th className="py-2.5 px-3 font-medium text-slate-600">{vi ? "Sản phẩm" : "Product"}</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600">{vi ? "Nhà cung cấp" : "Supplier"}</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600 text-right">SL</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600 text-right">{vi ? "Giá nhập" : "Cost"}</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600 text-right">% Lãi</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600 text-right">{vi ? "Đơn giá báo" : "Price"}</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600 text-right">{vi ? "Thành tiền" : "Total"}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(it => (
                    <tr key={it.id} onClick={() => setActiveRowId(it.id)} className={\`border-b cursor-pointer transition-colors \${activeRowId === it.id ? 'bg-blue-50/50' : 'hover:bg-slate-50'}\`} style={{ borderColor: "var(--border)" }}>
                      <td className="py-2 px-3">
                        <select value={it.product_id} onChange={e => handleProductChange(it.id, e.target.value)} className="w-40 h-8 px-2 text-xs rounded border outline-none bg-white" style={{ borderColor: "var(--border)" }}>
                          <option value="">-- {vi ? "Chọn" : "Select"} --</option>
                          {products.map(p => <option key={p.id} value={p.id}>[{p.sku}] {p.name}</option>)}
                        </select>
                      </td>
                      <td className="py-2 px-3">
                        <select value={it.supplier_id} onChange={e => handleUpdateItem(it.id, 'supplier_id', e.target.value)} className="w-36 h-8 px-2 text-xs rounded border outline-none bg-white" style={{ borderColor: "var(--border)" }}>
                          <option value="">-- {vi ? "Chọn" : "Select"} --</option>
                          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </td>
                      <td className="py-2 px-3 text-right"><input type="number" min={1} value={it.qty} onChange={e => handleUpdateItem(it.id, 'qty', Number(e.target.value))} className="w-16 h-8 px-2 text-xs text-right rounded border outline-none bg-white" style={{ borderColor: "var(--border)" }} /></td>
                      <td className="py-2 px-3 text-right"><input type="number" value={it.cost_price} onChange={e => handleUpdateItem(it.id, 'cost_price', Number(e.target.value))} className="w-24 h-8 px-2 text-xs text-right rounded border outline-none bg-white" style={{ borderColor: "var(--border)" }} /></td>
                      <td className="py-2 px-3 text-right"><input type="number" value={it.profit_pct.toFixed(1)} onChange={e => handleUpdateItem(it.id, 'profit_pct', Number(e.target.value))} className="w-16 h-8 px-2 text-xs text-right rounded border outline-none bg-white" style={{ borderColor: "var(--border)" }} /></td>
                      <td className="py-2 px-3 text-right"><input type="number" value={it.selling_price.toFixed(0)} onChange={e => handleUpdateItem(it.id, 'selling_price', Number(e.target.value))} className="w-24 h-8 px-2 text-xs text-right rounded border outline-none bg-white" style={{ borderColor: "var(--border)" }} /></td>
                      <td className="py-2 px-3 text-right text-slate-900 font-medium">{fmt(it.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="p-2 bg-slate-50 border-t" style={{ borderColor: "var(--border)" }}>
                <button onClick={() => setItems(p => [...p, { id: Date.now(), product_id: "", supplier_id: "", qty: 1, cost_price: 0, profit_pct: 0, selling_price: 0, total: 0 }])} className="text-xs font-medium text-blue-600 flex items-center gap-1 hover:underline">
                  <Plus size={12} /> {vi ? "Thêm dòng" : "Add Row"}
                </button>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end">
              <div className="w-72 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Cộng tiền hàng:</span>
                  <span className="font-medium text-slate-900">{fmt(subtotal)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Chiết khấu (%):</span>
                  <input type="number" value={globalDiscount} onChange={e => setGlobalDiscount(Number(e.target.value))} className="w-20 h-8 px-2 text-right rounded border text-sm outline-none" style={{ borderColor: "var(--border)" }} />
                </div>
                <div className="flex justify-between text-base font-bold pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                  <span className="text-slate-900">Tổng cộng:</span>
                  <span className="text-blue-600">{fmt(finalTotal)}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="p-4 border-t flex justify-end gap-2 bg-slate-50" style={{ borderColor: "var(--border)" }}>
            <button onClick={onClose} className="h-8 px-4 rounded-lg border text-xs text-slate-600 hover:bg-white" style={{ borderColor: "var(--border)" }}>
              {vi ? "Hủy" : "Cancel"}
            </button>
            <button onClick={() => {
               alert(vi ? "Tạo báo giá thành công!" : "Quotation created!")
               onClose()
            }} className="h-8 px-4 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 flex items-center gap-1.5">
              <Save size={13} /> {vi ? "Lưu báo giá" : "Save"}
            </button>
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
                      <a href="#" className="font-medium text-blue-600 flex items-center gap-1 hover:underline">{latestImport.receipt_id} <ExternalLink size={10} /></a>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Ngày nhập:</span>
                      <span className="font-medium text-slate-900">{latestImport.date}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Nhà cung cấp:</span>
                      <span className="font-medium text-slate-900 truncate max-w-[120px]" title={latestImport.supplier_name}>{latestImport.supplier_name}</span>
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
                        <a href="#" className="font-medium text-blue-600 flex items-center gap-1 hover:underline">{latestImport.quotation_id} <ExternalLink size={10} /></a>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Khách hàng:</span>
                        <a href="#" className="font-medium text-blue-600 flex items-center gap-1 hover:underline truncate max-w-[120px]" title={latestImport.customer_name}>{latestImport.customer_name} <ExternalLink size={10} /></a>
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

  const heads = vi
    ? ["Mã Báo Giá", "Khách hàng", "Ngày lập", "Hiệu lực đến", "Tổng tiền", "Trạng thái"]
    : ["Quotation ID", "Customer", "Date", "Valid Until", "Total", "Status"]

  const exportData = () => {
    const rows = data.map(q => [q.id, q.customer_name, q.date, q.valid_until, q.total, q.status])
    exportXlsx("Quotations", heads, rows)
  }

  const convertToGoodsReceipt = (id: string) => {
    alert(vi ? \`Đã chuyển báo giá \${id} thành Phiếu nhập kho (Goods Receipt) thành công!\` : \`Quotation \${id} converted to Goods Receipt!\`)
    setData(prev => prev.map(q => q.id === id ? { ...q, status: "converted" } : q))
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
        <table className="w-full text-left border-collapse">
          <thead>
            <tr>
              {heads.map(h => <th key={h} className="text-[11px] font-semibold text-slate-500 pb-3 border-b" style={{ borderColor: "var(--border)" }}>{h}</th>)}
              <th className="text-[11px] font-semibold text-slate-500 pb-3 border-b text-right" style={{ borderColor: "var(--border)" }}>
                {vi ? "Thao tác" : "Actions"}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.filter(q => q.id.toLowerCase().includes(search.toLowerCase()) || q.customer_name.toLowerCase().includes(search.toLowerCase())).map(q => (
              <tr key={q.id} className="group hover:bg-slate-50 transition-colors border-b" style={{ borderColor: "var(--border)" }}>
                <td className="py-3 text-sm font-medium text-blue-600">{q.id}</td>
                <td className="py-3 text-sm text-slate-700">{q.customer_name}</td>
                <td className="py-3 text-sm text-slate-500">{q.date}</td>
                <td className="py-3 text-sm text-slate-500">{q.valid_until}</td>
                <td className="py-3 text-sm text-slate-900 font-mono font-medium">{fmt(q.total)}</td>
                <td className="py-3">
                  <StatusBadge status={q.status as any} />
                </td>
                <td className="py-3 text-right">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {q.status === "pending" && (
                      <button onClick={() => {
                        setData(prev => prev.map(p => p.id === q.id ? { ...p, status: "accepted" } : p))
                      }} title={vi ? "Chấp nhận" : "Accept"} className="w-7 h-7 flex items-center justify-center rounded border text-emerald-600 hover:bg-emerald-50" style={{ borderColor: "var(--border)" }}>
                        <Check size={14} />
                      </button>
                    )}
                    {q.status === "accepted" && (
                      <button onClick={() => convertToGoodsReceipt(q.id)} title={vi ? "Tạo phiếu nhập kho" : "Create PO/Receipt"} className="w-7 h-7 flex items-center justify-center rounded border bg-blue-50 text-blue-600 hover:bg-blue-100" style={{ borderColor: "var(--border)" }}>
                        <Upload size={14} />
                      </button>
                    )}
                    <button className="w-7 h-7 flex items-center justify-center rounded border text-slate-400 hover:text-slate-600 hover:bg-white" style={{ borderColor: "var(--border)" }}>
                      <FileText size={14} />
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

      {showCreate && <QuotationCreate onClose={() => setShowCreate(false)} vi={vi} />}
    </div>
  )
}
`;

fs.writeFileSync('src/screens/Quotations.tsx', code);
