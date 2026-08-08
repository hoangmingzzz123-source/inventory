const fs = require('fs');
let code = fs.readFileSync('src/screens/Quotations.tsx', 'utf8');

code = code.replace(
  'const convertToGoodsReceipt = (id: string) => {\n    alert(vi ? `Đã chuyển báo giá ${id} thành Phiếu nhập kho (Goods Receipt) thành công!` : `Quotation ${id} converted to Goods Receipt!`)\n    setData(prev => prev.map(q => q.id === id ? { ...q, status: "converted" } : q))\n  }',
  `const convertToGoodsReceipt = (id: string) => {
    const q = data.find(x => x.id === id)
    if (q && q.items) {
      const newRecords = q.items.map((item: any, idx: number) => {
        const prod = products.find(p => p.id === item.product_id)
        const supp = suppliers.find(s => s.id === item.supplier_id)
        return {
          id: "IMP-" + Date.now() + idx,
          receipt_id: "GR-" + Date.now().toString().slice(-4) + idx,
          product_id: item.product_id,
          product_name: prod ? prod.name : "",
          supplier_id: item.supplier_id,
          supplier_name: supp ? supp.name : "",
          cost_price: item.cost_price,
          unit: item.import_unit || "Piece",
          quantity: item.qty,
          date: new Date().toISOString().split("T")[0],
          quotation_id: id,
          customer_id: q.customer_id,
          customer_name: q.customer_name
        }
      })
      importRecords.unshift(...newRecords)
    }
    alert(vi ? \`Đã chuyển báo giá \${id} thành Phiếu nhập kho (Goods Receipt) thành công!\` : \`Quotation \${id} converted to Goods Receipt!\`)
    setData(prev => prev.map(q => q.id === id ? { ...q, status: "converted" } : q))
  }`
);

fs.writeFileSync('src/screens/Quotations.tsx', code);
