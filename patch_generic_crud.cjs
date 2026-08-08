const fs = require('fs');
let code = fs.readFileSync('src/screens/GenericList.tsx', 'utf8');

const genericCrudCode = `
import { Edit } from "lucide-react";
export function GenericCrudList({ title, data, setData, columns, templateCols, templateFile }: any) {
  const { t, lang } = useLang();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  
  const filtered = data.filter((item: any) => search === "" || Object.values(item).some((v: any) => String(v).toLowerCase().includes(search.toLowerCase())));
  
  const heads = columns.map((c: any) => c.label);
  
  return (
    <div className="flex flex-col h-full">
      <Toolbar search={search} onSearch={setSearch} onCreate={() => { setEditingItem(null); setShowForm(true); }} createLabel={lang === "vi" ? "Thêm " + title : "Add " + title}
        templateFile={templateFile} templateCols={templateCols}
        onExportCsv={() => exportCsv(templateFile, heads, filtered.map((item: any) => columns.map((c: any) => item[c.key])))}
        onExportXlsx={() => exportXlsx(templateFile, heads, filtered.map((item: any) => columns.map((c: any) => item[c.key])))}
      />
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse min-w-[900px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b" style={{ borderColor: "var(--border)" }}>
              {columns.map((c: any) => <th key={c.key} className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">{c.label}</th>)}
              <th className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item: any, i: number) => (
              <tr key={i} className="border-b hover:bg-slate-50/60 group cursor-pointer" style={{ borderColor: "var(--border)" }}>
                {columns.map((c: any) => (
                  <td key={c.key} className={"px-4 py-2.5 " + (c.isStatus ? "" : "text-slate-800")}>
                    {c.isStatus ? <StatusBadge status={item[c.key]} /> : (c.format ? c.format(item[c.key]) : item[c.key])}
                  </td>
                ))}
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    <button onClick={(e) => { e.stopPropagation(); setEditingItem(item); setShowForm(true); }} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"><Edit size={14} /></button>
                    <button onClick={(e) => { e.stopPropagation(); setData(data.filter((x: any) => x !== item)); }} className="w-7 h-7 flex items-center justify-center rounded-md text-red-400 hover:bg-red-50 hover:text-red-500"><X size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="text-sm font-semibold">{editingItem ? (lang === "vi" ? "Sửa " + title : "Edit " + title) : (lang === "vi" ? "Thêm " + title : "Add " + title)}</h2>
              <button onClick={() => setShowForm(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"><X size={14} /></button>
            </div>
            <form onSubmit={e => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const newItem: any = { ...editingItem };
              columns.forEach((c: any) => {
                newItem[c.key] = fd.get(c.key) || "";
              });
              if (editingItem) {
                setData(data.map((x: any) => x === editingItem ? newItem : x));
              } else {
                setData([...data, newItem]);
              }
              setShowForm(false);
            }}>
              <div className="p-5 grid grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto">
                {columns.map((c: any) => (
                  <div key={c.key}>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">{c.label}</label>
                    <input name={c.key} defaultValue={editingItem ? editingItem[c.key] : ""} className="w-full h-8 px-3 rounded-lg border text-xs outline-none" style={{ borderColor: "var(--border)" }} />
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 px-5 py-3.5 border-t bg-slate-50" style={{ borderColor: "var(--border)" }}>
                <button type="button" onClick={() => setShowForm(false)} className="h-8 px-4 rounded-lg border text-xs text-slate-600" style={{ borderColor: "var(--border)" }}>{t("cancel")}</button>
                <button type="submit" className="h-8 px-4 rounded-lg bg-blue-600 text-white text-xs font-medium">{t("save")}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
`;

// Insert Edit from lucide-react at the top if it's missing
if (!code.includes('Edit,')) {
  code = code.replace(/import \{ /, 'import { Edit, ');
}

// Just add GenericCrudList component before export function Customers()
code = code.replace(/export function Customers\(\) \{/, genericCrudCode + '\nexport function Customers() {');

// Now, modify Customers to use GenericCrudList
const newCustomers = `
export function Customers() {
  const { lang } = useLang();
  const [data, setData] = useState(customers);
  const { isDemo } = useDemo();
  const { profile } = useAuth();
  useEffect(() => {
    fetchCustomers({ isDemo, orgId: profile?.org_id }).then(res => { if (res.data) setData(res.data) });
  }, [isDemo, profile]);

  const columns = lang === "vi" ? [
    { key: "code", label: "Mã KH" }, { key: "name", label: "Tên khách hàng" }, { key: "phone", label: "Điện thoại" },
    { key: "email", label: "Email" }, { key: "taxCode", label: "MST" }, { key: "creditLimit", label: "Hạn mức TD", format: fmt },
    { key: "debt", label: "Công nợ", format: fmt }, { key: "status", label: "Trạng thái", isStatus: true }
  ] : [
    { key: "code", label: "Code" }, { key: "name", label: "Customer Name" }, { key: "phone", label: "Phone" },
    { key: "email", label: "Email" }, { key: "taxCode", label: "Tax Code" }, { key: "creditLimit", label: "Credit Limit", format: fmt },
    { key: "debt", label: "Debt", format: fmt }, { key: "status", label: "Status", isStatus: true }
  ];

  return <GenericCrudList title={lang === "vi" ? "khách hàng" : "customer"} data={data} setData={setData} columns={columns} templateCols={["code", "name", "phone", "email", "taxCode", "creditLimit", "debt", "status"]} templateFile="customers" />;
}
`;

// Replace the old Customers function
code = code.replace(/export function Customers\(\) \{[\s\S]*?\n\/\/ --- Suppliers ---/, newCustomers + '\n// --- Suppliers ---');

// Do the same for Suppliers
const newSuppliers = `
export function Suppliers() {
  const { lang } = useLang();
  const [data, setData] = useState(suppliers);
  const { isDemo } = useDemo();
  const { profile } = useAuth();
  useEffect(() => {
    fetchSuppliers({ isDemo, orgId: profile?.org_id }).then(res => { if (res.data) setData(res.data) });
  }, [isDemo, profile]);

  const columns = lang === "vi" ? [
    { key: "code", label: "Mã NCC" }, { key: "name", label: "Tên nhà cung cấp" }, { key: "phone", label: "Điện thoại" },
    { key: "email", label: "Email" }, { key: "taxCode", label: "MST" }, { key: "debt", label: "Công nợ", format: fmt },
    { key: "status", label: "Trạng thái", isStatus: true }
  ] : [
    { key: "code", label: "Code" }, { key: "name", label: "Supplier Name" }, { key: "phone", label: "Phone" },
    { key: "email", label: "Email" }, { key: "taxCode", label: "Tax Code" }, { key: "debt", label: "Debt", format: fmt },
    { key: "status", label: "Status", isStatus: true }
  ];

  return <GenericCrudList title={lang === "vi" ? "nhà cung cấp" : "supplier"} data={data} setData={setData} columns={columns} templateCols={["code", "name", "phone", "email", "taxCode", "debt", "status"]} templateFile="suppliers" />;
}
`;
code = code.replace(/export function Suppliers\(\) \{[\s\S]*?\n\/\/ --- Warehouses ---/, newSuppliers + '\n// --- Warehouses ---');

// And Warehouses
const newWarehouses = `
export function Warehouses() {
  const { lang } = useLang();
  const [data, setData] = useState(warehouses);
  const { isDemo } = useDemo();
  const { profile } = useAuth();
  useEffect(() => {
    fetchWarehouses({ isDemo, orgId: profile?.org_id }).then(res => { if (res.data) setData(res.data) });
  }, [isDemo, profile]);

  const columns = lang === "vi" ? [
    { key: "code", label: "Mã kho" }, { key: "name", label: "Tên kho" }, { key: "location", label: "Địa điểm" },
    { key: "manager", label: "Thủ kho" }, { key: "capacity", label: "Sức chứa" }, { key: "status", label: "Trạng thái", isStatus: true }
  ] : [
    { key: "code", label: "Code" }, { key: "name", label: "Warehouse Name" }, { key: "location", label: "Location" },
    { key: "manager", label: "Manager" }, { key: "capacity", label: "Capacity" }, { key: "status", label: "Status", isStatus: true }
  ];

  return <GenericCrudList title={lang === "vi" ? "kho" : "warehouse"} data={data} setData={setData} columns={columns} templateCols={["code", "name", "location", "manager", "capacity", "status"]} templateFile="warehouses" />;
}
`;
code = code.replace(/export function Warehouses\(\) \{[\s\S]*?\n\/\/ --- Sales Orders ---/, newWarehouses + '\n// --- Sales Orders ---');

fs.writeFileSync('src/screens/GenericList.tsx', code);
