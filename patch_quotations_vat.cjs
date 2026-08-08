const fs = require('fs');

let code = fs.readFileSync('src/screens/Quotations.tsx', 'utf8');

// Update item state to include units
code = code.replace(
  'const [items, setItems] = useState<any[]>([{ id: Date.now(), product_id: "", supplier_id: "", qty: 1, cost_price: 0, profit_pct: 0, selling_price: 0, total: 0 }])',
  `const [items, setItems] = useState<any[]>([{ id: Date.now(), product_id: "", supplier_id: "", import_unit: "", sell_unit: "", qty: 1, cost_price: 0, profit_pct: 0, selling_price: 0, total: 0 }])`
);
code = code.replace(
  'const [discountType, setDiscountType] = useState<"pct" | "amount">("pct")',
  `const [discountType, setDiscountType] = useState<"pct" | "amount">("pct")\n  const [globalVat, setGlobalVat] = useState(10)`
);

// handleProductChange: populate import_unit and sell_unit
code = code.replace(
  'const sell = cost * (1 + profit/100)',
  `const sell = cost * (1 + profit/100)
        const unit = prod.unit || latest?.unit || "Piece"`
);

code = code.replace(
  'product_id: productId,\n          supplier_id: latest ? latest.supplier_id : "",\n          cost_price: cost,\n          profit_pct: profit,\n          selling_price: sell,\n          total: sell * i.qty',
  `product_id: productId,
          supplier_id: latest ? latest.supplier_id : "",
          import_unit: unit,
          sell_unit: unit,
          cost_price: cost,
          profit_pct: profit,
          selling_price: sell,
          total: sell * i.qty`
);

// Add row button
code = code.replace(
  'setItems(p => [...p, { id: Date.now(), product_id: "", supplier_id: "", qty: 1, cost_price: 0, profit_pct: 0, selling_price: 0, total: 0 }])',
  'setItems(p => [...p, { id: Date.now(), product_id: "", supplier_id: "", import_unit: "", sell_unit: "", qty: 1, cost_price: 0, profit_pct: 0, selling_price: 0, total: 0 }])'
);

// Totals calculation
code = code.replace(
  `const discountAmount = discountType === "pct" ? subtotal * (globalDiscount / 100) : globalDiscount
  const finalTotal = subtotal - discountAmount`,
  `const discountAmount = discountType === "pct" ? subtotal * (globalDiscount / 100) : globalDiscount
  const totalBeforeVat = subtotal - discountAmount
  const vatAmount = totalBeforeVat * (globalVat / 100)
  const finalTotal = totalBeforeVat + vatAmount`
);

// Update table headers to include ĐVT Nhập, ĐVT Bán
const oldHeaders = `<thead className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
                  <tr>
                    <th className="py-2.5 px-3 font-medium text-slate-600">{vi ? "Sản phẩm" : "Product"}</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600">{vi ? "Nhà cung cấp" : "Supplier"}</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600 text-right">SL</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600 text-right">{vi ? "Giá nhập" : "Cost"}</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600 text-right">% Lãi</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600 text-right">{vi ? "Đơn giá báo" : "Price"}</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600 text-right">{vi ? "Thành tiền" : "Total"}</th>
                  </tr>
                </thead>`;

const newHeaders = `<thead className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
                  <tr>
                    <th className="py-2.5 px-3 font-medium text-slate-600">{vi ? "Sản phẩm" : "Product"}</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600">{vi ? "Nhà cung cấp" : "Supplier"}</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600">{vi ? "ĐV Nhập" : "In Unit"}</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600">{vi ? "ĐV Bán" : "Out Unit"}</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600 text-right">SL</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600 text-right">{vi ? "Giá nhập" : "Cost"}</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600 text-right">% Lãi</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600 text-right">{vi ? "Giá bán" : "Price"}</th>
                    <th className="py-2.5 px-3 font-medium text-slate-600 text-right">{vi ? "Thành tiền" : "Total"}</th>
                  </tr>
                </thead>`;
code = code.replace(oldHeaders, newHeaders);

// Update table cells
const oldCells = `<td className="py-2 px-3 text-right"><input type="number" min={1} value={it.qty} onChange={e => handleUpdateItem(it.id, 'qty', Number(e.target.value))} className="w-16 h-8 px-2 text-xs text-right rounded border outline-none bg-white" style={{ borderColor: "var(--border)" }} /></td>`;
const newCells = `<td className="py-2 px-3">
                        <select value={it.import_unit} onChange={e => handleUpdateItem(it.id, 'import_unit', e.target.value)} className="w-20 h-8 px-1 text-xs rounded border outline-none bg-white" style={{ borderColor: "var(--border)" }}>
                          <option value="Piece">{vi ? "Cái" : "Piece"}</option>
                          <option value="Roll">{vi ? "Cuộn" : "Roll"}</option>
                          <option value="Kg">{vi ? "Kg" : "Kg"}</option>
                          <option value="Box">{vi ? "Hộp" : "Box"}</option>
                          <option value="Set">{vi ? "Bộ" : "Set"}</option>
                        </select>
                      </td>
                      <td className="py-2 px-3">
                        <select value={it.sell_unit} onChange={e => handleUpdateItem(it.id, 'sell_unit', e.target.value)} className="w-20 h-8 px-1 text-xs rounded border outline-none bg-white" style={{ borderColor: "var(--border)" }}>
                          <option value="Piece">{vi ? "Cái" : "Piece"}</option>
                          <option value="Roll">{vi ? "Cuộn" : "Roll"}</option>
                          <option value="Kg">{vi ? "Kg" : "Kg"}</option>
                          <option value="Box">{vi ? "Hộp" : "Box"}</option>
                          <option value="Set">{vi ? "Bộ" : "Set"}</option>
                          <option value="Meter">{vi ? "Mét" : "Meter"}</option>
                        </select>
                      </td>
                      <td className="py-2 px-3 text-right"><input type="number" min={1} value={it.qty} onChange={e => handleUpdateItem(it.id, 'qty', Number(e.target.value))} className="w-16 h-8 px-2 text-xs text-right rounded border outline-none bg-white" style={{ borderColor: "var(--border)" }} /></td>`;
code = code.replace(oldCells, newCells);

// Update totals footer
const oldFooter = `<div className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">{vi ? "Chiết khấu:" : "Discount:"}</span>
                    <select value={discountType} onChange={e => setDiscountType(e.target.value as any)} className="h-7 px-1 text-xs border rounded outline-none" style={{ borderColor: "var(--border)" }}>
                      <option value="pct">%</option>
                      <option value="amount">VNĐ</option>
                    </select>
                  </div>
                  <input type="number" value={globalDiscount} onChange={e => setGlobalDiscount(Number(e.target.value))} className="w-24 h-8 px-2 text-right rounded border text-sm outline-none" style={{ borderColor: "var(--border)" }} />
                </div>
                <div className="flex justify-between text-base font-bold pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                  <span className="text-slate-900">Tổng cộng:</span>
                  <span className="text-blue-600">{fmt(finalTotal)}</span>
                </div>`;

const newFooter = `<div className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">{vi ? "Chiết khấu:" : "Discount:"}</span>
                    <select value={discountType} onChange={e => setDiscountType(e.target.value as any)} className="h-7 px-1 text-xs border rounded outline-none" style={{ borderColor: "var(--border)" }}>
                      <option value="pct">%</option>
                      <option value="amount">VNĐ</option>
                    </select>
                  </div>
                  <input type="number" value={globalDiscount} onChange={e => setGlobalDiscount(Number(e.target.value))} className="w-24 h-8 px-2 text-right rounded border text-sm outline-none" style={{ borderColor: "var(--border)" }} />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">{vi ? "Tiền trước VAT:" : "Before VAT:"}</span>
                  <span className="font-medium text-slate-900">{fmt(totalBeforeVat)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">VAT (%):</span>
                  <input type="number" value={globalVat} onChange={e => setGlobalVat(Number(e.target.value))} className="w-16 h-8 px-2 text-right rounded border text-sm outline-none" style={{ borderColor: "var(--border)" }} />
                </div>
                <div className="flex justify-between text-base font-bold pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                  <span className="text-slate-900">{vi ? "Tổng thanh toán:" : "Total Amount:"}</span>
                  <span className="text-blue-600">{fmt(finalTotal)}</span>
                </div>`;
code = code.replace(oldFooter, newFooter);

// Fix Latest Record to show correct Unit
code = code.replace(
  '<span className="font-medium text-slate-900 truncate max-w-[120px]" title={latestImport.supplier_name}>{latestImport.supplier_name}</span>\n                    </div>\n                    <div className="flex justify-between border-t pt-2 mt-2" style={{ borderColor: "var(--border)" }}>',
  `<span className="font-medium text-slate-900 truncate max-w-[120px]" title={latestImport.supplier_name}>{latestImport.supplier_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">{vi ? "Đơn vị nhập:" : "Unit:"}</span>
                      <span className="font-medium text-slate-900">{latestImport.unit}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2 mt-2" style={{ borderColor: "var(--border)" }}>`
);

fs.writeFileSync('src/screens/Quotations.tsx', code);
