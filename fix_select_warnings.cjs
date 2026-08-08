const fs = require('fs');
let code = fs.readFileSync('src/screens/Quotations.tsx', 'utf8');

code = code.replace(/value=\{it\.product_id\}/g, 'value={it.product_id ?? ""}');
code = code.replace(/value=\{it\.supplier_id\}/g, 'value={it.supplier_id ?? ""}');
code = code.replace(/value=\{it\.import_unit\}/g, 'value={it.import_unit ?? ""}');
code = code.replace(/value=\{it\.sell_unit\}/g, 'value={it.sell_unit ?? ""}');
code = code.replace(/value=\{it\.vat_pct\}/g, 'value={it.vat_pct ?? 0}');

fs.writeFileSync('src/screens/Quotations.tsx', code);
