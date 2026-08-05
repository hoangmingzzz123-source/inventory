const fs = require('fs');
const code = fs.readFileSync('src/screens/GenericList.tsx', 'utf8');

['Customers', 'Suppliers', 'Warehouses', 'Users', 'Roles'].forEach(comp => {
  const regex = new RegExp(`export function ${comp}\\(\\) \\{[\\s\\S]*?(?=\\n// ---|\\nexport function)`, 'g');
  const match = regex.exec(code);
  if (match) {
    fs.writeFileSync(`dump_${comp}.tsx`, match[0]);
  }
});
