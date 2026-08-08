const fs = require('fs');
let code = fs.readFileSync('src/screens/Quotations.tsx', 'utf8');

// Find latestImport and insert latestQuotation below it.
const latestImportMatch = code.match(/const latestImport = useMemo[^\n]*\n(?:[^\n]*\n)*?  \}, \[activeItem\?\.product_id\]\)/);

if (latestImportMatch) {
  const latestImportBlock = latestImportMatch[0];
  const latestQuotationBlock = `
  const latestQuotation = useMemo(() => {
    if (!activeItem || !activeItem.product_id) return null;
    const records = mockQuotations
      .filter(q => q.items && q.items.some(i => i.product_id === activeItem.product_id))
      .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (records.length > 0) {
      const q = records[0];
      const item = q.items.find(i => i.product_id === activeItem.product_id);
      return {
        id: q.id,
        date: q.date,
        customer_name: q.customer_name,
        selling_price: item.selling_price || 0
      };
    }
    return null;
  }, [activeItem?.product_id])`;

  code = code.replace(latestImportBlock, latestImportBlock + '\n' + latestQuotationBlock);
}

// Find side panel rendering and add the latestQuotation UI
const sidePanelUI = `                  </div>
                )}
              </div>
            ) : (`;

const newUI = `                  </div>
                )}
                {latestQuotation && (
                  <div className="bg-white p-3 rounded-lg border mt-4" style={{ borderColor: "var(--border)" }}>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 font-semibold">{vi ? "Giá bán gần nhất" : "Latest Selling Price"}</div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Mã Báo giá:</span>
                        <a href={\`/?screen=quotations&id=\${latestQuotation.id}\`} target="_blank" rel="noreferrer" className="font-medium text-blue-600 flex items-center gap-1 hover:underline" title={vi ? "Mở tab mới" : "Open in new tab"}>{latestQuotation.id} <ExternalLink size={10} /></a>
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
            ) : (`;

code = code.replace(sidePanelUI, newUI);

fs.writeFileSync('src/screens/Quotations.tsx', code);
