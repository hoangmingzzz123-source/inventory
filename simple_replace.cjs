const fs = require('fs');
let code = fs.readFileSync('src/screens/GenericList.tsx', 'utf8');

const modules = [
  { name: 'Categories', titleVi: 'danh mục', titleEn: 'category', cols: ['code', 'name', 'status'] },
  { name: 'Brands', titleVi: 'thương hiệu', titleEn: 'brand', cols: ['code', 'name', 'status'] },
  { name: 'Units', titleVi: 'đơn vị tính', titleEn: 'unit', cols: ['code', 'name', 'status'] },
  { name: 'StockBalance', titleVi: 'tồn kho', titleEn: 'stock balance', cols: ['product', 'sku', 'warehouse', 'qty', 'status'] },
  { name: 'StockLedger', titleVi: 'sổ kho', titleEn: 'stock ledger', cols: ['date', 'doc_no', 'product', 'type', 'qty', 'balance'] },
  { name: 'InventoryAdjustment', titleVi: 'điều chỉnh kho', titleEn: 'adjustment', cols: ['date', 'doc_no', 'warehouse', 'reason', 'status'] },
  { name: 'InventoryTransfer', titleVi: 'chuyển kho', titleEn: 'transfer', cols: ['date', 'doc_no', 'from', 'to', 'status'] },
  { name: 'GoodsReceipt', titleVi: 'nhập kho', titleEn: 'goods receipt', cols: ['date', 'doc_no', 'po_no', 'warehouse', 'status'] },
  { name: 'PurchaseReturn', titleVi: 'trả hàng NCC', titleEn: 'purchase return', cols: ['date', 'doc_no', 'supplier', 'total', 'status'] },
  { name: 'SupplierPayment', titleVi: 'thanh toán NCC', titleEn: 'supplier payment', cols: ['date', 'doc_no', 'supplier', 'amount', 'method'] },
  { name: 'SalesOrders', titleVi: 'đơn hàng', titleEn: 'sales order', cols: ['date', 'doc_no', 'customer', 'total', 'status'] },
  { name: 'DeliveryNotes', titleVi: 'phiếu giao hàng', titleEn: 'delivery note', cols: ['date', 'doc_no', 'so_no', 'customer', 'status'] },
  { name: 'Invoices', titleVi: 'hóa đơn', titleEn: 'invoice', cols: ['date', 'doc_no', 'customer', 'total', 'status'] },
  { name: 'CustomerReceipts', titleVi: 'thu tiền KH', titleEn: 'customer receipt', cols: ['date', 'doc_no', 'customer', 'amount', 'method'] },
  { name: 'Receivables', titleVi: 'phải thu', titleEn: 'receivable', cols: ['customer', 'total_debt', 'overdue', 'status'] },
  { name: 'Payables', titleVi: 'phải trả', titleEn: 'payable', cols: ['supplier', 'total_debt', 'overdue', 'status'] },
  { name: 'CashBook', titleVi: 'sổ quỹ', titleEn: 'cash book', cols: ['date', 'doc_no', 'type', 'amount', 'balance'] },
];

for (const mod of modules) {
  const startStr = `export function ${mod.name}() {`;
  let startIndex = code.indexOf(startStr);
  if (startIndex === -1) continue;
  
  // find the next export function or end of file to know the end
  let endIndex = code.length;
  const nextFuncMatch = code.substring(startIndex + startStr.length).match(/export function /);
  if (nextFuncMatch) {
    endIndex = startIndex + startStr.length + nextFuncMatch.index;
  }
  
  // also, we shouldn't eat the comments before the next export function if possible, but it's okay for now.
  const replacement = `export function ${mod.name}() {
  const { lang } = useLang();
  const [data, setData] = useState([{ ${mod.cols.map(c => c + ': "Sample ' + c + '"').join(', ')} }]);
  const columns = lang === "vi" ? [
    ${mod.cols.map(c => '{ key: "' + c + '", label: "' + c.toUpperCase() + '", isStatus: ' + (c === 'status') + ' }').join(', ')}
  ] : [
    ${mod.cols.map(c => '{ key: "' + c + '", label: "' + c.toUpperCase() + '", isStatus: ' + (c === 'status') + ' }').join(', ')}
  ];
  return <GenericCrudList title={lang === "vi" ? "${mod.titleVi}" : "${mod.titleEn}"} data={data} setData={setData} columns={columns} templateCols={[${mod.cols.map(c=>'"' + c + '"').join(',')}]} templateFile="${mod.name.toLowerCase()}" />;
}
\n// --- NEXT ---\n`;

  code = code.substring(0, startIndex) + replacement + code.substring(endIndex);
}

fs.writeFileSync('src/screens/GenericList.tsx', code);
