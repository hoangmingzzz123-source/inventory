const fs = require('fs');
let code = fs.readFileSync('src/screens/PurchaseOrders.tsx', 'utf8');

code = code.replace(/import \{ exportCsv, exportXlsx \} from "\.\/GenericList"/g, 'import { exportCsv, exportXlsx, ImportModal } from "./GenericList"');
code = code.replace(/Trash2, Check, AlertCircle \} from "lucide-react"/g, 'Trash2, Check, AlertCircle, Upload } from "lucide-react"');
code = code.replace(/const \[showCreate, setShowCreate\] = useState\(false\)/, 'const [showCreate, setShowCreate] = useState(false)\n  const [showImport, setShowImport] = useState(false)');

const exportBtn = `<button onClick={() => exportXlsx("purchase_orders", ["ID", "Supplier", "Date", "Expected", "Amount", "Status"], filtered.map(p => [p.id, p.supplier, p.date, p.expected, p.amount, p.status]))} className="flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs text-slate-600 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
            <Download size={13} /> {t("export")}
          </button>`;

const replaceWith = exportBtn + `
          <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs text-slate-600 hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
            <Upload size={13} /> {lang === "vi" ? "Nhập file" : "Import"}
          </button>`;

code = code.replace(exportBtn, replaceWith);

code = code.replace(/<\/div>\n  \)$/, `
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          filename="purchase_orders"
          cols={["PO_ID", "Supplier", "Date", "Expected", "Amount", "Status"]}
          lang={lang}
        />
      )}
    </div>
  )
}`);

fs.writeFileSync('src/screens/PurchaseOrders.tsx', code);
