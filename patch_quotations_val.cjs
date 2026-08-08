const fs = require('fs');
let code = fs.readFileSync('src/screens/Quotations.tsx', 'utf8');

code = code.replace(
  'if (!customerId) return alert(vi ? "Vui lòng chọn khách hàng" : "Please select a customer")',
  `if (!customerId) return alert(vi ? "Vui lòng chọn khách hàng" : "Please select a customer")
    if (!date) return alert(vi ? "Vui lòng chọn ngày báo giá" : "Please select a date")
    if (discountType === "pct" && (globalDiscount < 0 || globalDiscount > 100)) return alert(vi ? "Chiết khấu % phải từ 0 đến 100" : "Discount % must be between 0 and 100")
    if (items.some(i => i.qty <= 0)) return alert(vi ? "Số lượng phải lớn hơn 0" : "Quantity must be greater than 0")
    if (items.some(i => i.selling_price < 0)) return alert(vi ? "Đơn giá bán không hợp lệ" : "Selling price is invalid")`
);

// Format the date output correctly in table
code = code.replace(
  '<td className="py-3 text-sm font-medium text-blue-600">{q.id}</td>',
  `<td className="py-3 text-sm font-medium text-blue-600 cursor-pointer hover:underline" onClick={() => setViewingItem(q)}>{q.id}</td>`
);

fs.writeFileSync('src/screens/Quotations.tsx', code);
