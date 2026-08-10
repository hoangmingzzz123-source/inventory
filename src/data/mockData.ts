export const kpiData = [
  { label: "Today's Revenue", value: "₫24,580,000", change: "+12.5%", trend: "up", sub: "vs yesterday" },
  { label: "Today's Orders", value: "48", change: "+8.3%", trend: "up", sub: "Sales orders" },
  { label: "Purchase", value: "₫8,200,000", change: "-3.1%", trend: "down", sub: "vs yesterday" },
  { label: "Inventory Value", value: "₫1.24B", change: "+0.8%", trend: "up", sub: "Total stock value" },
  { label: "Receivable", value: "₫185,000,000", change: "+5.2%", trend: "up", sub: "Outstanding" },
  { label: "Payable", value: "₫62,400,000", change: "-8.9%", trend: "down", sub: "Outstanding" },
]

export const revenueData = [
  { date: "Jan", revenue: 145, purchase: 82, sales: 134 },
  { date: "Feb", revenue: 162, purchase: 95, sales: 155 },
  { date: "Mar", revenue: 178, purchase: 110, sales: 168 },
  { date: "Apr", revenue: 155, purchase: 88, sales: 142 },
  { date: "May", revenue: 192, purchase: 125, sales: 180 },
  { date: "Jun", revenue: 210, purchase: 138, sales: 198 },
  { date: "Jul", revenue: 198, purchase: 120, sales: 185 },
  { date: "Aug", revenue: 225, purchase: 142, sales: 212 },
]

export const inventoryDonutData = [
  { name: "Electronics", value: 35, fill: "#2563eb" },
  { name: "Clothing", value: 22, fill: "#7c3aed" },
  { name: "Food & Bev", value: 18, fill: "#059669" },
  { name: "Tools", value: 15, fill: "#d97706" },
  { name: "Others", value: 10, fill: "#64748b" },
]

export const products = [
  { id: "P001", sku: "LP-DELL-001", barcode: "8938999123450", name: "Dell Latitude 5540 i5", category: "Laptop", brand: "Dell", unit: "Piece", cost: 18500000, price: 22000000, qty: 24, status: "Active", updated: "2026-08-03", updatedBy: "Nguyen Van A" },
  { id: "P002", sku: "PH-SAM-002", barcode: "8935999765432", name: "Samsung Galaxy A55 5G", category: "Phone", brand: "Samsung", unit: "Piece", cost: 7800000, price: 9500000, qty: 52, status: "Active", updated: "2026-08-03", updatedBy: "Tran Thi B" },
  { id: "P003", sku: "MON-LG-003", barcode: "8938776543210", name: "LG 27\" 4K Monitor", category: "Monitor", brand: "LG", unit: "Piece", cost: 6200000, price: 7800000, qty: 15, status: "Active", updated: "2026-08-02", updatedBy: "Le Van C" },
  { id: "P004", sku: "KB-LOGI-004", barcode: "0097855123678", name: "Logitech MX Keys", category: "Keyboard", brand: "Logitech", unit: "Piece", cost: 2100000, price: 2800000, qty: 38, status: "Active", updated: "2026-08-01", updatedBy: "Nguyen Van A" },
  { id: "P005", sku: "SSD-WD-005", barcode: "7182930045612", name: "WD Black SN850X 1TB NVMe", category: "Storage", brand: "WD", unit: "Piece", cost: 2800000, price: 3500000, qty: 67, status: "Active", updated: "2026-08-03", updatedBy: "Pham Van D" },
  { id: "P006", sku: "RAM-KIN-006", barcode: "7409126354897", name: "Kingston Fury Beast 32GB DDR5", category: "Memory", brand: "Kingston", unit: "Piece", cost: 1850000, price: 2400000, qty: 43, status: "Active", updated: "2026-07-31", updatedBy: "Tran Thi B" },
  { id: "P007", sku: "LP-APPLE-007", barcode: "0194252777432", name: "MacBook Pro M3 14\"", category: "Laptop", brand: "Apple", unit: "Piece", cost: 45000000, price: 52000000, qty: 8, status: "Active", updated: "2026-08-02", updatedBy: "Le Van C" },
  { id: "P008", sku: "RTR-TP-008", barcode: "8858999234510", name: "TP-Link Archer AXE75", category: "Network", brand: "TP-Link", unit: "Piece", cost: 1650000, price: 2100000, qty: 0, status: "Inactive", updated: "2026-07-28", updatedBy: "Nguyen Van A" },
  { id: "P009", sku: "CAM-LOREX-009", barcode: "0820799543216", name: "Lorex 4K IP Camera 8CH", category: "Security", brand: "Lorex", unit: "Set", cost: 8500000, price: 11000000, qty: 5, status: "Active", updated: "2026-08-03", updatedBy: "Pham Van D" },
  { id: "P010", sku: "UPS-APC-010", barcode: "0731304261432", name: "APC Smart-UPS 1500VA", category: "Power", brand: "APC", unit: "Piece", cost: 5200000, price: 6800000, qty: 12, status: "Active", updated: "2026-08-01", updatedBy: "Tran Thi B" },
]

export const purchaseOrders = [
  { id: "PO-202608-000001", supplier: "Tech Distributor VN", warehouse: "HN-Warehouse-01", status: "Approved", total: 185000000, createdBy: "Nguyen Van A", date: "2026-08-01" },
  { id: "PO-202608-000002", supplier: "Samsung Vietnam", warehouse: "HCM-Warehouse-01", status: "Receiving", total: 392000000, createdBy: "Tran Thi B", date: "2026-08-02" },
  { id: "PO-202608-000003", supplier: "Dell EMC Vietnam", warehouse: "HN-Warehouse-01", status: "Draft", total: 740000000, createdBy: "Le Van C", date: "2026-08-03" },
  { id: "PO-202607-000045", supplier: "Logitech APAC", warehouse: "DN-Warehouse-01", status: "Completed", total: 84000000, createdBy: "Nguyen Van A", date: "2026-07-28" },
  { id: "PO-202607-000044", supplier: "WD Technologies", warehouse: "HCM-Warehouse-01", status: "Cancelled", total: 140000000, createdBy: "Pham Van D", date: "2026-07-25" },
  { id: "PO-202608-000004", supplier: "Apple Vietnam", warehouse: "HN-Warehouse-01", status: "Pending Approval", total: 2250000000, createdBy: "Le Van C", date: "2026-08-03" },
]

export const salesOrders = [
  { id: "SO-202608-000048", customer: "FPT Telecom", warehouse: "HN-Warehouse-01", status: "Completed", total: 52000000, createdBy: "Tran Thi B", date: "2026-08-03" },
  { id: "SO-202608-000047", customer: "VNPT Group", warehouse: "HCM-Warehouse-01", status: "Delivered", total: 98500000, createdBy: "Nguyen Van A", date: "2026-08-03" },
  { id: "SO-202608-000046", customer: "Viettel Store", warehouse: "HN-Warehouse-01", status: "Approved", total: 175000000, createdBy: "Le Van C", date: "2026-08-02" },
  { id: "SO-202608-000045", customer: "Nguyen Kim Corp", warehouse: "HCM-Warehouse-01", status: "Draft", total: 43000000, createdBy: "Pham Van D", date: "2026-08-02" },
  { id: "SO-202608-000044", customer: "Hoang Ha Mobile", warehouse: "DN-Warehouse-01", status: "Cancelled", total: 18500000, createdBy: "Tran Thi B", date: "2026-08-01" },
]

export const inventoryBalance = [
  { warehouse: "HN-Warehouse-01", product: "Dell Latitude 5540 i5", sku: "LP-DELL-001", available: 12, reserved: 3, incoming: 5, outgoing: 2, avgCost: 18500000, value: 222000000 },
  { warehouse: "HCM-Warehouse-01", product: "Samsung Galaxy A55 5G", sku: "PH-SAM-002", available: 30, reserved: 8, incoming: 20, outgoing: 10, avgCost: 7800000, value: 234000000 },
  { warehouse: "HN-Warehouse-01", product: "LG 27\" 4K Monitor", sku: "MON-LG-003", available: 8, reserved: 2, incoming: 0, outgoing: 5, avgCost: 6200000, value: 49600000 },
  { warehouse: "DN-Warehouse-01", product: "Logitech MX Keys", sku: "KB-LOGI-004", available: 25, reserved: 5, incoming: 10, outgoing: 8, avgCost: 2100000, value: 52500000 },
  { warehouse: "HCM-Warehouse-01", product: "WD Black SN850X 1TB", sku: "SSD-WD-005", available: 50, reserved: 10, incoming: 20, outgoing: 7, avgCost: 2800000, value: 140000000 },
  { warehouse: "HN-Warehouse-01", product: "MacBook Pro M3 14\"", sku: "LP-APPLE-007", available: 5, reserved: 2, incoming: 3, outgoing: 1, avgCost: 45000000, value: 225000000 },
]

export const customers = [
  { code: "C001", name: "FPT Telecom", phone: "024-3737-8888", email: "purchase@fpt.vn", tax_code: "0101248150", credit_limit: 1000000000, debt: 185000000, status: "Active" },
  { code: "C002", name: "VNPT Group", phone: "024-3775-6666", email: "supply@vnpt.vn", tax_code: "0100686209", credit_limit: 2000000000, debt: 98500000, status: "Active" },
  { code: "C003", name: "Viettel Store", phone: "024-3756-7891", email: "b2b@viettel.com.vn", tax_code: "0100489426", credit_limit: 5000000000, debt: 0, status: "Active" },
  { code: "C004", name: "Nguyen Kim Corp", phone: "028-3920-8282", email: "mua.hang@nguyenkim.com.vn", tax_code: "0307258855", credit_limit: 500000000, debt: 43000000, status: "Active" },
  { code: "C005", name: "Hoang Ha Mobile", phone: "024-3555-6666", email: "supply@hoanghamobile.com", tax_code: "0101234567", credit_limit: 300000000, debt: 0, status: "Inactive" },
]

export const suppliers = [
  { code: "S001", name: "Tech Distributor VN", phone: "024-3888-9999", email: "sales@techdist.vn", tax_code: "0101987654", debt: 185000000, status: "Active" },
  { code: "S002", name: "Samsung Vietnam", phone: "028-3822-8228", email: "b2b@samsung.com.vn", tax_code: "0308523876", debt: 392000000, status: "Active" },
  { code: "S003", name: "Dell EMC Vietnam", phone: "024-3562-8881", email: "vn_sales@dell.com", tax_code: "0101567890", debt: 0, status: "Active" },
  { code: "S004", name: "Logitech APAC", phone: "+65-6391-8000", email: "apac@logitech.com", tax_code: "", debt: 84000000, status: "Active" },
  { code: "S005", name: "Apple Vietnam", phone: "028-3827-2288", email: "vn-reseller@apple.com", tax_code: "0302686209", debt: 0, status: "Active" },
]

export const lowStockItems = [
  { sku: "LP-APPLE-007", name: "MacBook Pro M3 14\"", qty: 5, min: 10, warehouse: "HN-Warehouse-01" },
  { sku: "CAM-LOREX-009", name: "Lorex 4K IP Camera 8CH", qty: 5, min: 8, warehouse: "HN-Warehouse-01" },
  { sku: "MON-LG-003", name: "LG 27\" 4K Monitor", qty: 8, min: 10, warehouse: "HN-Warehouse-01" },
  { sku: "UPS-APC-010", name: "APC Smart-UPS 1500VA", qty: 12, min: 15, warehouse: "HCM-Warehouse-01" },
]

export const recentActivities = [
  { type: "purchase", text: "PO-202608-000002 received 20 units Samsung Galaxy A55", time: "2 phút trước", user: "Tran Thi B" },
  { type: "sales", text: "SO-202608-000048 completed — FPT Telecom", time: "15 phút trước", user: "Tran Thi B" },
  { type: "inventory", text: "Stock adjustment — Dell Latitude 5540 (+5 units)", time: "1 giờ trước", user: "Le Van C" },
  { type: "purchase", text: "PO-202608-000003 created — Dell EMC Vietnam", time: "2 giờ trước", user: "Le Van C" },
  { type: "sales", text: "SO-202608-000046 approved — Viettel Store", time: "3 giờ trước", user: "Nguyen Van A" },
  { type: "system", text: "Daily inventory snapshot completed", time: "6 giờ trước", user: "System" },
]

export const auditLogs = [
  { entity: "Product", action: "UPDATE", field: "Selling Price", oldVal: "21,500,000", newVal: "22,000,000", user: "Nguyen Van A", time: "2026-08-03 14:32:11", ip: "192.168.1.45", device: "Chrome / Windows" },
  { entity: "Purchase Order", action: "APPROVE", field: "Status", oldVal: "Submitted", newVal: "Approved", user: "Le Van C", time: "2026-08-03 13:15:44", ip: "192.168.1.22", device: "Chrome / MacOS" },
  { entity: "Inventory", action: "ADJUST", field: "Qty", oldVal: "19", newVal: "24", user: "Tran Thi B", time: "2026-08-03 11:08:30", ip: "192.168.1.67", device: "Firefox / Windows" },
  { entity: "Customer", action: "UPDATE", field: "Credit Limit", oldVal: "500,000,000", newVal: "1,000,000,000", user: "Nguyen Van A", time: "2026-08-03 10:22:55", ip: "192.168.1.45", device: "Chrome / Windows" },
  { entity: "Sales Order", action: "CANCEL", field: "Status", oldVal: "Approved", newVal: "Cancelled", user: "Pham Van D", time: "2026-08-03 09:45:12", ip: "192.168.1.90", device: "Edge / Windows" },
]

export const warehouses = [
  { code: "HN-01", name: "Hà Nội Main Warehouse", address: "12 Nguyễn Chí Thanh, Đống Đa, Hà Nội", manager: "Nguyen Van A", phone: "024-3888-1234", status: "Active", stockValue: 520000000 },
  { code: "HCM-01", name: "HCM City Warehouse", address: "45 Điện Biên Phủ, Bình Thạnh, TP.HCM", manager: "Tran Thi B", phone: "028-3822-5678", status: "Active", stockValue: 780000000 },
  { code: "DN-01", name: "Đà Nẵng Warehouse", address: "89 Lê Duẩn, Hải Châu, Đà Nẵng", manager: "Le Van C", phone: "0236-382-9012", status: "Active", stockValue: 245000000 },
]

export const stockLedger = [
  { date: "2026-08-03 14:30", ref: "GR-202608-0012", type: "Purchase", warehouse: "HN-01", product: "Dell Latitude 5540", qtyIn: 5, qtyOut: 0, balance: 24, cost: 18500000, avgCost: 18500000, user: "Tran Thi B" },
  { date: "2026-08-03 11:15", ref: "SO-202608-0047", type: "Sales", warehouse: "HCM-01", product: "Samsung Galaxy A55", qtyIn: 0, qtyOut: 10, balance: 30, cost: 7800000, avgCost: 7800000, user: "Nguyen Van A" },
  { date: "2026-08-03 09:00", ref: "ADJ-202608-0005", type: "Adjustment", warehouse: "HN-01", product: "Dell Latitude 5540", qtyIn: 5, qtyOut: 0, balance: 19, cost: 18500000, avgCost: 18500000, user: "Le Van C" },
  { date: "2026-08-02 16:45", ref: "TRF-202608-0003", type: "Transfer In", warehouse: "DN-01", product: "Logitech MX Keys", qtyIn: 10, qtyOut: 0, balance: 25, cost: 2100000, avgCost: 2100000, user: "Pham Van D" },
  { date: "2026-08-02 10:30", ref: "SO-202608-0044", type: "Sales", warehouse: "HN-01", product: "LG 27\" 4K Monitor", qtyIn: 0, qtyOut: 3, balance: 8, cost: 6200000, avgCost: 6200000, user: "Tran Thi B" },
]

export const categories = [
  { id: "CAT001", code: "LAPTOP", name_vi: "Máy tính xách tay", name_en: "Laptop", parent: null, status: "Active", items: 18 },
  { id: "CAT002", code: "PHONE", name_vi: "Điện thoại di động", name_en: "Mobile Phone", parent: null, status: "Active", items: 12 },
  { id: "CAT003", code: "MONITOR", name_vi: "Màn hình máy tính", name_en: "Monitor", parent: null, status: "Active", items: 8 },
  { id: "CAT004", code: "KEYBOARD", name_vi: "Bàn phím", name_en: "Keyboard", parent: "INPUT", status: "Active", items: 15 },
  { id: "CAT005", code: "STORAGE", name_vi: "Thiết bị lưu trữ", name_en: "Storage", parent: null, status: "Active", items: 22 },
  { id: "CAT006", code: "MEMORY", name_vi: "Bộ nhớ RAM", name_en: "Memory", parent: null, status: "Active", items: 11 },
  { id: "CAT007", code: "NETWORK", name_vi: "Thiết bị mạng", name_en: "Network", parent: null, status: "Active", items: 9 },
  { id: "CAT008", code: "POWER", name_vi: "Nguồn điện & UPS", name_en: "Power & UPS", parent: null, status: "Active", items: 6 },
]

export const brands = [
  { id: "BR001", code: "DELL", name: "Dell", country: "USA", website: "dell.com", status: "Active", products: 12 },
  { id: "BR002", code: "SAMSUNG", name: "Samsung", country: "South Korea", website: "samsung.com", status: "Active", products: 18 },
  { id: "BR003", code: "APPLE", name: "Apple", country: "USA", website: "apple.com", status: "Active", products: 8 },
  { id: "BR004", code: "LG", name: "LG Electronics", country: "South Korea", website: "lg.com", status: "Active", products: 7 },
  { id: "BR005", code: "LOGITECH", name: "Logitech", country: "Switzerland", website: "logitech.com", status: "Active", products: 14 },
  { id: "BR006", code: "WD", name: "Western Digital", country: "USA", website: "westerndigital.com", status: "Active", products: 10 },
  { id: "BR007", code: "KINGSTON", name: "Kingston Technology", country: "USA", website: "kingston.com", status: "Active", products: 9 },
  { id: "BR008", code: "TPLINK", name: "TP-Link", country: "China", website: "tp-link.com", status: "Active", products: 11 },
  { id: "BR009", code: "APC", name: "APC by Schneider Electric", country: "France", website: "apc.com", status: "Active", products: 5 },
]

export const units = [
  { id: "UN001", code: "PCS", name_vi: "Cái / Chiếc", name_en: "Piece", type: "Quantity", items: 68, status: "Active" },
  { id: "UN002", code: "SET", name_vi: "Bộ", name_en: "Set", type: "Quantity", items: 12, status: "Active" },
  { id: "UN003", code: "BOX", name_vi: "Hộp", name_en: "Box", type: "Packaging", items: 5, status: "Active" },
  { id: "UN004", code: "CARTON", name_vi: "Thùng carton", name_en: "Carton", type: "Packaging", items: 4, status: "Active" },
  { id: "UN005", code: "KG", name_vi: "Kilogram", name_en: "Kilogram", type: "Weight", items: 2, status: "Active" },
  { id: "UN006", code: "LICENSE", name_vi: "Giấy phép", name_en: "License", type: "Digital", items: 3, status: "Active" },
]


export const quotations = [
  {
    id: "QT-2026-001",
    customer_id: "CUST-001",
    customer_name: "Công ty ABC",
    date: "2026-08-01",
    valid_until: "2026-08-15",
    subtotal: 12000000,
    discount_pct: 5,
    tax_pct: 10,
    total: 12540000,
    status: "accepted",
    notes: "Báo giá thiết bị văn phòng",
    items: [
      { product_id: "P-001", name: "Laptop Dell XPS 15", quantity: 1, unit_price: 10000000, profit_pct: 20 },
      { product_id: "P-002", name: "Chuột Logitech", quantity: 2, unit_price: 1000000, profit_pct: 15 }
    ]
  },
  {
    id: "QT-2026-002",
    customer_id: "CUST-003",
    customer_name: "Đại lý Thành Phát",
    date: "2026-08-05",
    valid_until: "2026-08-20",
    subtotal: 5000000,
    discount_pct: 0,
    tax_pct: 8,
    total: 5400000,
    status: "pending",
    notes: "Báo giá vật tư",
    items: [
      { product_id: "P-003", name: "Bàn phím cơ", quantity: 5, unit_price: 1000000, profit_pct: 10 }
    ]
  }
]

export const importRecords = [
  { id: "IMP-001", receipt_id: "GR-001", product_id: "P001", product_name: "Dell Latitude 5540 i5", supplier_id: "SUP-001", supplier_name: "Tech Distributor VN", cost_price: 18000000, unit: "Piece", quantity: 50, date: "2026-07-15", quotation_id: "", customer_id: "", customer_name: "" },
  { id: "IMP-002", receipt_id: "GR-002", product_id: "P001", product_name: "Dell Latitude 5540 i5", supplier_id: "SUP-002", supplier_name: "Dell EMC Vietnam", cost_price: 18500000, unit: "Piece", quantity: 100, date: "2026-08-01", quotation_id: "QT-2026-001", customer_id: "CUST-001", customer_name: "Công ty ABC" },
  { id: "IMP-003", receipt_id: "GR-003", product_id: "P004", product_name: "Logitech MX Keys", supplier_id: "SUP-003", supplier_name: "Logitech APAC", cost_price: 2000000, unit: "Piece", quantity: 200, date: "2026-07-28", quotation_id: "", customer_id: "", customer_name: "" }
]

