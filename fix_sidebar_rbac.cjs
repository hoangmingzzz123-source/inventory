const fs = require('fs');
let code = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');

if (!code.includes('useAuth')) {
  code = code.replace(/import \{ useState \} from "react"/, 'import { useState } from "react"\nimport { useAuth } from "../contexts/AuthContext"');
}

const functionStart = 'export default function Sidebar({ current, onChange }: { current: string; onChange: (id: string) => void }) {';
const functionBody = `
  const { t } = useLang()
  const { profile } = useAuth()
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    masterdata: true, inventory: true, purchase: true, sales: true, finance: true, system: true
  })

  // Basic RBAC
  const role = profile?.role?.toLowerCase() || "admin" // fallback to admin for demo
  const isSuperAdmin = role === "super_admin"
  
  const hasAccess = (item: string) => {
    if (isSuperAdmin) return true;
    if (role === "admin") return true; // Admins have full access in this basic setup
    
    // Example role limits:
    if (role === "sales") {
      return ["dashboard", "sales", "quotations", "sales-orders", "delivery-notes", "customers", "products"].includes(item);
    }
    if (role === "inventory") {
      return ["dashboard", "inventory", "stock-balance", "stock-ledger", "adjustment", "transfer", "goods-receipt", "products", "warehouses"].includes(item);
    }
    return true; // default open
  };

  const toggleGroup = (id: string) => setOpenGroups(p => ({ ...p, [id]: !p[id] }))
`;

code = code.replace(
  /export default function Sidebar.*?\n[\s\S]*?const toggleGroup.*?\n/,
  functionStart + '\n' + functionBody + '\n'
);

// We need to filter items in the render loop.
// Look for `navItems.map(item =>`
code = code.replace(
  /navItems\.map\(item => \(/,
  `navItems.filter(item => hasAccess(item.id)).map(item => (`
);

// Look for `item.children?.map(child =>`
code = code.replace(
  /item\.children\?\.map\(child => \(/,
  `item.children?.filter(child => hasAccess(child.id)).map(child => (`
);

fs.writeFileSync('src/components/Sidebar.tsx', code);
