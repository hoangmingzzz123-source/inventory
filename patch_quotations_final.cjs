const fs = require('fs');

let code = fs.readFileSync('src/screens/Quotations.tsx', 'utf8');

// 1. Add discountType state
code = code.replace(
  'const [globalDiscount, setGlobalDiscount] = useState(0)',
  `const [globalDiscount, setGlobalDiscount] = useState(0)
  const [discountType, setDiscountType] = useState<"pct" | "amount">("pct")`
);

// 2. Fix the subtotal / finalTotal calculation
code = code.replace(
  'const finalTotal = subtotal * (1 - globalDiscount/100)',
  `const discountAmount = discountType === "pct" ? subtotal * (globalDiscount / 100) : globalDiscount
  const finalTotal = subtotal - discountAmount`
);

// 3. Fix the UI for discount
code = code.replace(
  '<span className="text-slate-500">Chiết khấu (%):</span>\n                  <input type="number" value={globalDiscount} onChange={e => setGlobalDiscount(Number(e.target.value))} className="w-20 h-8 px-2 text-right rounded border text-sm outline-none" style={{ borderColor: "var(--border)" }} />',
  `<div className="flex items-center gap-2">
                    <span className="text-slate-500">{vi ? "Chiết khấu:" : "Discount:"}</span>
                    <select value={discountType} onChange={e => setDiscountType(e.target.value as any)} className="h-7 px-1 text-xs border rounded outline-none" style={{ borderColor: "var(--border)" }}>
                      <option value="pct">%</option>
                      <option value="amount">VNĐ</option>
                    </select>
                  </div>
                  <input type="number" value={globalDiscount} onChange={e => setGlobalDiscount(Number(e.target.value))} className="w-24 h-8 px-2 text-right rounded border text-sm outline-none" style={{ borderColor: "var(--border)" }} />`
);

// 4. Update the links in the latest import side panel to open in new tab with the ID
code = code.replace(
  '<a href="#" className="font-medium text-blue-600 flex items-center gap-1 hover:underline">{latestImport.receipt_id} <ExternalLink size={10} /></a>',
  `<a href={\`/?screen=goods-receipt&id=\${latestImport.receipt_id}\`} target="_blank" rel="noreferrer" className="font-medium text-blue-600 flex items-center gap-1 hover:underline" title={vi ? "Mở tab mới" : "Open in new tab"}>{latestImport.receipt_id} <ExternalLink size={10} /></a>`
);

code = code.replace(
  '<a href="#" className="font-medium text-blue-600 flex items-center gap-1 hover:underline">{latestImport.quotation_id} <ExternalLink size={10} /></a>',
  `<a href={\`/?screen=quotations&id=\${latestImport.quotation_id}\`} target="_blank" rel="noreferrer" className="font-medium text-blue-600 flex items-center gap-1 hover:underline" title={vi ? "Mở tab mới" : "Open in new tab"}>{latestImport.quotation_id} <ExternalLink size={10} /></a>`
);

code = code.replace(
  '<a href="#" className="font-medium text-blue-600 flex items-center gap-1 hover:underline truncate max-w-[120px]" title={latestImport.customer_name}>{latestImport.customer_name} <ExternalLink size={10} /></a>',
  `<a href={\`/?screen=customers&id=\${latestImport.customer_id}\`} target="_blank" rel="noreferrer" className="font-medium text-blue-600 flex items-center gap-1 hover:underline truncate max-w-[120px]" title={latestImport.customer_name}>{latestImport.customer_name} <ExternalLink size={10} /></a>`
);


fs.writeFileSync('src/screens/Quotations.tsx', code);
