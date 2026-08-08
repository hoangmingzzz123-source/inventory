const fs = require('fs');
let code = fs.readFileSync('src/screens/GenericList.tsx', 'utf8');

const newUsers = `
export function Users() {
  const { lang } = useLang();
  const [data, setData] = useState([
    { code: "U001", name: "Nguyễn Văn A", role: "Super Admin", email: "nva@warehouseos.vn", status: "Active" },
    { code: "U002", name: "Trần Thị B", role: "Inventory", email: "ttb@warehouseos.vn", status: "Active" },
    { code: "U003", name: "Lê Văn C", role: "Sales", email: "lvc@warehouseos.vn", status: "Active" },
  ]);

  const columns = lang === "vi" ? [
    { key: "code", label: "Mã NV" }, { key: "name", label: "Họ tên" },
    { key: "role", label: "Quyền (Role)" }, { key: "email", label: "Email" },
    { key: "status", label: "Trạng thái", isStatus: true }
  ] : [
    { key: "code", label: "Code" }, { key: "name", label: "Full Name" },
    { key: "role", label: "Role" }, { key: "email", label: "Email" },
    { key: "status", label: "Status", isStatus: true }
  ];

  return <GenericCrudList title={lang === "vi" ? "người dùng" : "user"} data={data} setData={setData} columns={columns} templateCols={["code", "name", "role", "email", "status"]} templateFile="users" />;
}
`;
code = code.replace(/export function Users\(\) \{[\s\S]*?\n\/\/ --- Roles ---/, newUsers + '\n// --- Roles ---');
fs.writeFileSync('src/screens/GenericList.tsx', code);
