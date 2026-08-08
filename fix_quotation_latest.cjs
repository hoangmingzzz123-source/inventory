const fs = require('fs');
let code = fs.readFileSync('src/screens/Quotations.tsx', 'utf8');

// Update latestQuotation to also check customer_id
code = code.replace(
  /const records = mockQuotations\n\s*\.filter\(q => q\.items && q\.items\.some\(i => i\.product_id === activeItem\.product_id\)\)/,
  `const records = mockQuotations
      .filter(q => q.customer_id === customerId && q.items && q.items.some(i => i.product_id === activeItem.product_id))`
);

// We need to add customerId to the dependency array of useMemo
code = code.replace(
  /\}, \[activeItem\?\.product_id\]\)/,
  `}, [activeItem?.product_id, customerId])`
);

fs.writeFileSync('src/screens/Quotations.tsx', code);
