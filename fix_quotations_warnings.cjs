const fs = require('fs');
let code = fs.readFileSync('src/screens/Quotations.tsx', 'utf8');

// Fix key warning: initialize items with id
code = code.replace(
  /useState<any\[\]>\(initialData\?\.items\?\.length \? initialData\.items : /g,
  'useState<any[]>(initialData?.items?.length ? initialData.items.map((it: any, i: number) => ({ ...it, id: it.id || Date.now() + i })) : '
);

// Fix uncontrolled input warnings
code = code.replace(/value=\{it\.profit_pct\?\.toFixed\(1\)\}/g, 'value={it.profit_pct ?? ""}');
code = code.replace(/value=\{it\.selling_price\?\.toFixed\(0\)\}/g, 'value={it.selling_price ?? ""}');
code = code.replace(/value=\{it\.cost_price\}/g, 'value={it.cost_price ?? ""}');
code = code.replace(/value=\{it\.qty\}/g, 'value={it.qty ?? ""}');

fs.writeFileSync('src/screens/Quotations.tsx', code);
