import { ArrowDown, ArrowLeftRight, BarChart3, BookOpen, CheckCircle2, ClipboardList, CreditCard, FileText, Package, Settings, ShieldCheck, ShoppingCart, Truck, Warehouse } from "lucide-react"
import { useLang } from "../i18n/LangContext"

const steps = [
  { icon: ClipboardList, vi: "Thiết lập dữ liệu gốc", en: "Set up master data", detailVi: "Tạo sản phẩm, danh mục, hãng, đơn vị, kho, khách hàng và nhà cung cấp.", detailEn: "Create products, categories, brands, units, warehouses, customers, and suppliers.", color: "blue" },
  { icon: FileText, vi: "Lập báo giá", en: "Create quotation", detailVi: "Chọn khách hàng, thêm sản phẩm, số lượng, giá bán, VAT và chiết khấu.", detailEn: "Select a customer, add products, quantities, prices, VAT, and discounts.", color: "indigo" },
  { icon: CheckCircle2, vi: "Gửi và duyệt", en: "Send and accept", detailVi: "Lưu nháp, gửi khách hàng, chấp thuận hoặc từ chối báo giá.", detailEn: "Save a draft, send it, then accept or reject the quotation.", color: "emerald" },
  { icon: Truck, vi: "Tạo phiếu nhập kho", en: "Receive goods", detailVi: "Chọn kho nhận hàng, ghi nhận số lượng thực tế và hoàn tất chứng từ.", detailEn: "Choose the receiving warehouse, record quantities, and complete the receipt.", color: "amber" },
  { icon: Warehouse, vi: "Cập nhật tồn kho", en: "Update inventory", detailVi: "Tồn kho, chi tiết phiếu nhập và sổ kho được cập nhật theo từng sản phẩm.", detailEn: "Stock balance, receipt details, and inventory ledger update per product.", color: "teal" },
  { icon: BarChart3, vi: "Theo dõi và báo cáo", en: "Monitor and report", detailVi: "Xem Dashboard, tồn kho, doanh thu, mua hàng, công nợ và báo cáo.", detailEn: "Review the Dashboard, inventory, revenue, purchases, receivables, and reports.", color: "rose" },
]

const colorMap: Record<string, string> = { blue: "bg-blue-50 text-blue-700 border-blue-200", indigo: "bg-indigo-50 text-indigo-700 border-indigo-200", emerald: "bg-emerald-50 text-emerald-700 border-emerald-200", amber: "bg-amber-50 text-amber-700 border-amber-200", teal: "bg-teal-50 text-teal-700 border-teal-200", rose: "bg-rose-50 text-rose-700 border-rose-200" }

export default function UserGuide() {
  const { lang } = useLang()
  const vi = lang === "vi"
  return (
    <div className="h-full overflow-x-hidden overflow-y-auto bg-slate-50 p-3 sm:p-5">
      <div className="mx-auto max-w-6xl space-y-3 sm:space-y-5">
        <section className="rounded-2xl border bg-white p-4 sm:p-6" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white sm:h-12 sm:w-12"><BookOpenIcon /></div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 sm:text-xl">{vi ? "Hướng dẫn sử dụng WarehouseOS" : "WarehouseOS User Guide"}</h1>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500 sm:text-sm sm:leading-6">{vi ? "Thực hiện theo luồng dưới đây để quản lý dữ liệu, bán hàng, nhập kho và theo dõi hiệu quả vận hành." : "Follow this workflow to manage master data, sales, receiving, inventory, and operational performance."}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-4 sm:p-5" style={{ borderColor: "var(--border)" }}>
          <div className="mb-4 flex items-center justify-between sm:mb-5"><div><h2 className="text-sm font-semibold text-slate-900">{vi ? "Sơ đồ luồng nghiệp vụ" : "Business workflow"}</h2><p className="mt-1 text-xs text-slate-400">{vi ? "Từ dữ liệu gốc đến báo cáo quản trị" : "From master data to management reporting"}</p></div><Settings size={18} className="text-slate-400" /></div>
          <div className="flex flex-col items-stretch gap-3 lg:flex-row lg:items-stretch lg:gap-2">
            {steps.map((step, index) => {
              const Icon = step.icon
              return <div key={step.vi} className="flex flex-1 items-center gap-2 lg:block">
                <div className={`min-h-[132px] flex-1 rounded-xl border p-3 sm:min-h-[164px] sm:p-4 ${colorMap[step.color]}`}>
                  <div className="mb-3 flex items-center justify-between"><Icon size={22} /><span className="text-[10px] font-bold opacity-60">0{index + 1}</span></div>
                  <h3 className="text-sm font-bold">{vi ? step.vi : step.en}</h3>
                  <p className="mt-2 text-xs leading-5 opacity-80">{vi ? step.detailVi : step.detailEn}</p>
                </div>
                {index < steps.length - 1 && <ArrowDown size={18} className="mx-auto shrink-0 text-slate-300 lg:hidden" />}
                {index < steps.length - 1 && <span className="hidden shrink-0 items-center px-0.5 text-slate-300 lg:flex">→</span>}
              </div>
            })}
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <GuideSection icon={<Package size={17} />} title={vi ? "1. Dữ liệu gốc" : "1. Master data"} items={vi ? ["Tạo danh mục, hãng và đơn vị trước khi tạo sản phẩm.", "Khai báo kho để sử dụng khi nhập hoặc chuyển kho.", "Tạo khách hàng và nhà cung cấp với đầy đủ thông tin liên hệ."] : ["Create categories, brands, and units before products.", "Set up warehouses for receiving and transfers.", "Create customers and suppliers with complete contact details."]} />
          <GuideSection icon={<FileText size={17} />} title={vi ? "2. Báo giá và bán hàng" : "2. Quotations and sales"} items={vi ? ["Tạo báo giá, chọn khách hàng và thêm các dòng sản phẩm.", "Kiểm tra VAT, chiết khấu và tổng thanh toán trước khi lưu.", "Gửi báo giá, theo dõi trạng thái và xuất PDF/Excel có logo."] : ["Create a quotation, select a customer, and add product lines.", "Review VAT, discount, and grand total before saving.", "Send it, track status, and export branded PDF/Excel documents."]} />
          <GuideSection icon={<ShoppingCart size={17} />} title={vi ? "3. Mua hàng và nhập kho" : "3. Purchasing and receiving"} items={vi ? ["Tạo PO với nhà cung cấp, kho và chi tiết sản phẩm.", "Duyệt PO rồi chọn Nhận hàng khi hàng thực tế về kho.", "Phiếu nhập, tồn kho và sổ kho được ghi nhận theo từng dòng."] : ["Create a PO with supplier, warehouse, and product lines.", "Approve the PO and choose Receive Goods when stock arrives.", "Receipt details, stock balance, and ledger are recorded per line."]} />
          <GuideSection icon={<BarChart3 size={17} />} title={vi ? "4. Dashboard và báo cáo" : "4. Dashboard and reports"} items={vi ? ["Dashboard hiển thị dữ liệu thật theo công ty sau khi đăng nhập.", "Dùng tồn kho hiện tại và sổ kho để kiểm tra số lượng.", "Xuất các bảng dữ liệu ra Excel/CSV khi cần phân tích."] : ["After login, Dashboard shows live data for the active organization.", "Use stock balance and ledger to verify quantities.", "Export data to Excel/CSV for further analysis."]} />
          <GuideSection icon={<ArrowLeftRight size={17} />} title={vi ? "5. Điều chỉnh, chuyển kho và trả hàng" : "5. Adjustments, transfers, and returns"} items={vi ? ["Điều chỉnh ghi nhận phần chênh lệch giữa tồn thực tế và sổ kho.", "Chuyển kho tạo đồng thời một dòng xuất và một dòng nhập có cùng tham chiếu.", "Dùng đảo phiếu hoặc phiếu trả để giữ nguyên lịch sử thay vì xóa chứng từ đã hoàn tất."] : ["Adjustments record the difference between physical and ledger stock.", "Transfers create matching outbound and inbound movements under one reference.", "Use reversals or returns to preserve history instead of deleting completed documents."]} />
          <GuideSection icon={<CreditCard size={17} />} title={vi ? "6. Công nợ và dòng tiền" : "6. Balances and cash flow"} items={vi ? ["Phiếu giao hàng tạo hóa đơn và công nợ khách hàng tương ứng.", "Ghi nhận thu hoặc chi từ đúng chứng từ nguồn; hệ thống không cho vượt số dư còn lại.", "Đối chiếu phải thu, phải trả và sổ quỹ trong màn hình Tài chính và Báo cáo."] : ["A delivery creates its linked invoice and customer balance.", "Record receipts or payments against the source document; amounts cannot exceed the outstanding balance.", "Reconcile receivables, payables, and the cash book from Finance and Reports."]} />
          <GuideSection icon={<ShieldCheck size={17} />} title={vi ? "7. Người dùng, quyền và kiểm toán" : "7. Users, permissions, and audit"} items={vi ? ["Quản trị viên tạo liên kết mời theo email và vai trò; liên kết hết hạn sau 7 ngày.", "Cấu hình quyền xem, tạo, sửa, xóa, duyệt và xuất dữ liệu theo từng vai trò.", "Theo dõi thay đổi nghiệp vụ trong Nhật ký kiểm toán; không chia sẻ tài khoản giữa nhiều người."] : ["Administrators create email- and role-bound invitation links that expire after 7 days.", "Configure view, create, update, delete, approve, and export permissions for each role.", "Review business changes in Audit Logs and never share accounts between people."]} />
        </div>
      </div>
    </div>
  )
}

function GuideSection({ icon, title, items }: { icon: React.ReactNode; title: string; items: string[] }) {
  return <section className="rounded-2xl border bg-white p-5" style={{ borderColor: "var(--border)" }}><div className="mb-3 flex items-center gap-2 text-blue-600"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">{icon}</span><h2 className="text-sm font-semibold text-slate-900">{title}</h2></div><ul className="space-y-2 text-xs leading-5 text-slate-600">{items.map(item => <li key={item} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />{item}</li>)}</ul></section>
}

function BookOpenIcon() {
  return <BookOpen size={23} />
}
