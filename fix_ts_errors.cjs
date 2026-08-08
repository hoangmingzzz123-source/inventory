const fs = require('fs');

// Fix Quotations
let qCode = fs.readFileSync('src/screens/Quotations.tsx', 'utf8');
qCode = qCode.replace(/item\.selling_price/g, '(item as any)?.selling_price');
qCode = qCode.replace(/c\.id/g, 'c.code');
qCode = qCode.replace(/s\.id/g, 's.code');
fs.writeFileSync('src/screens/Quotations.tsx', qCode);

// Fix PurchaseOrders
let poCode = fs.readFileSync('src/screens/PurchaseOrders.tsx', 'utf8');
poCode = poCode.replace(/fetchPurchaseOrders\(.*?\)\.then\(res => \{\n\s*if \(res\.data\) setPOs\(res\.data\)\n\s*\}, \[isDemo, profile\]\)\n\s*\}/g, 'fetchPurchaseOrders({ isDemo, orgId: profile?.org_id }).then(res => { if (res.data) setPOs(res.data) }) }, [isDemo, profile])');
fs.writeFileSync('src/screens/PurchaseOrders.tsx', poCode);

