Nghiệp vụ này hợp lý, nhưng để triển khai không bị rối về sau, mình đề xuất chuẩn hóa thành mô hình **Báo giá theo Category → Convert để phân bổ Product thực tế → Reserve/nhập kho → Giao hàng mới trừ kho**.

## 1. Bản chất nghiệp vụ

Hiện tại cần tách 2 khái niệm:

**Danh mục sản phẩm (Category)** = thứ khách hàng quan tâm và được dùng để báo giá.

> Ví dụ: `Ống kẽm`

**Sản phẩm (Product/SKU)** = hàng thực tế trong kho hoặc hàng thực tế nhập từ NCC để giao.

> `Ống kẽm Hòa Phát v2026`
> `Ống kẽm Tân Việt`

Quan hệ:

```text
Category
Ống kẽm
   │
   ├── Product: Ống kẽm Hòa Phát v2026
   │       tồn: 6
   │
   └── Product: Ống kẽm Tân Việt
           tồn: 10
```

Khách hàng không nhất thiết quan tâm giao Hòa Phát hay Tân Việt, nên **Quotation không cần xác định Product cụ thể tại thời điểm báo giá**.

Ví dụ:

```text
BÁO GIÁ

Ống kẽm       12 cái      150.000      1.800.000
Bulong         5 hộp      ...
```

Đến lúc **Convert**, nhân viên mới quyết định 12 cái ống kẽm đó thực tế lấy từ đâu.

---

# 2. Flow tổng thể mình đề xuất

```text
Tạo báo giá
    ↓
Quotation
    ↓
Convert
    ↓
Phân bổ sản phẩm thực tế
    │
    ├── lấy hàng tồn
    │
    └── nhập hàng mới
    ↓
Validate đủ số lượng
    ↓
Xác nhận Convert
    ↓
CHỜ GIAO HÀNG
    ↓
Giao hàng
    ↓
Ledger OUT
    ↓
ĐÃ GIAO HÀNG
```

Điểm rất quan trọng:

> **Convert không phải là giao hàng.**

Convert chỉ xác định:

> "Tôi sẽ lấy những Product nào để đáp ứng Category mà khách đã mua."

---

# 3. QuotationItem nên lưu Category thay vì Product

Ví dụ:

### quotation_items

| field        | value     |
| ------------ | --------- |
| quotation_id | QT001     |
| category_id  | ONG_KEM   |
| quantity     | 12        |
| unit_price   | 150.000   |
| total        | 1.800.000 |

Không cần:

```text
product_id = HoaPhat
```

vì tại thời điểm báo giá chưa biết sẽ giao sản phẩm nào.

Nên snapshot thêm:

```text
category_name
unit_price
quantity
```

để sau này Category có đổi tên thì báo giá cũ vẫn giữ nguyên lịch sử.

---

# 4. Khi click Convert

Hiện popup:

```text
XÁC NHẬN CHUYỂN BÁO GIÁ

Danh mục                         SL
-------------------------------------
Ống kẽm                          12
Bulong                            5
Dây điện                         20
```

Mỗi Category nên có trạng thái:

```text
○ Chưa phân bổ
✓ Đã phân bổ 12/12
```

User click:

> `Ống kẽm - 12 cái`

thì mở phần phân bổ.

---

# 5. Không nên coi "Lấy tồn kho" và "Nhập kho mới" là radio

Đây là điểm quan trọng trong requirement.

Hai lựa chọn phải có thể **dùng kết hợp**.

Ví dụ khách cần:

```text
12 Ống kẽm
```

Kho hiện có:

```text
Hòa Phát    6
Tân Việt   10
```

Có thể thực hiện:

```text
4 Hòa Phát từ kho
3 Tân Việt từ kho
5 Tân Việt nhập mới
------------------
12
```

Vì vậy UI nên là:

```text
☑ LẤY TỪ TỒN KHO

☑ NHẬP KHO MỚI
```

chứ không phải:

```text
○ Lấy tồn kho
○ Nhập mới
```

---

# 6. Option 1 — Lấy từ tồn kho

Ví dụ cần:

```text
Ống kẽm: 12
```

Hiển thị:

| Chọn | Product        | Có thể sử dụng | SL lấy |
| ---- | -------------- | -------------: | -----: |
| ☐    | Hòa Phát v2026 |              6 |        |
| ☐    | Tân Việt       |             10 |        |

Khi tick Hòa Phát:

```text
☑ Hòa Phát
Số lượng: [6]
```

Default:

```text
min(availableQuantity, remainingQuantity)
```

Ở đây:

```text
min(6, 12) = 6
```

Remaining:

```text
12 - 6 = 6
```

Sau đó tick Tân Việt:

```text
available = 10
remaining = 6

default = min(10,6) = 6
```

UI:

```text
☑ Hòa Phát       [6]
☑ Tân Việt       [6]

Đã chọn: 12 / 12
Còn thiếu: 0
```

Ngay lúc đó:

* disable các Product khác;
* disable "Nhập kho mới";
* cho phép Submit.

---

# 7. Công thức UI quan trọng

Tại mọi thời điểm:

```text
requiredQuantity
=
12
```

```text
allocatedQuantity
=
SUM(stockAllocation)
+
SUM(newStockAllocation)
```

```text
remainingQuantity
=
requiredQuantity - allocatedQuantity
```

Điều kiện:

```text
allocatedQuantity < requiredQuantity
→ không được Submit
```

```text
allocatedQuantity == requiredQuantity
→ Submit enabled
```

```text
allocatedQuantity > requiredQuantity
→ không cho phép xảy ra
```

---

# 8. Không được chỉ dựa vào tồn kho vật lý

Đây là một bug nghiệp vụ rất dễ gặp.

Giả sử:

```text
Tân Việt tồn: 10
```

Quotation A convert:

```text
lấy 10
```

nhưng chưa giao.

Quotation B convert tiếp và cũng nhìn thấy:

```text
tồn = 10
```

rồi lấy tiếp 10.

=> bạn đã bán 20 trong khi chỉ có 10.

Vì vậy cần khái niệm:

```text
OnHand
Reserved
Available
```

Công thức:

```text
Available = OnHand - Reserved
```

Ví dụ:

```text
OnHand     = 10
Reserved   = 6
Available  = 4
```

Popup Convert phải hiển thị **Available**, không phải chỉ `OnHand`.

---

# 9. Convert hàng tồn nên RESERVE chứ chưa trừ kho

Ví dụ:

```text
Ống kẽm cần 12

Hòa Phát: 6
Tân Việt: 6
```

Sau Convert:

```text
Hòa Phát
OnHand      6
Reserved    6
Available   0

Tân Việt
OnHand     10
Reserved    6
Available   4
```

Kho vật lý vẫn còn:

```text
6 + 10
```

vì hàng chưa được giao.

Nhưng hệ thống hiểu rằng 12 cái đã được dành cho đơn này.

---

# 10. Option 2 — Nhập kho mới

Phần này mình đề xuất chia thành 2 trường hợp.

### A. Nhập thêm Product đã tồn tại

```text
NHẬP KHO MỚI

☐ Ống kẽm Hòa Phát v2026
   NCC: [...]
   SL nhập: [...]

☐ Ống kẽm Tân Việt
   NCC: [...]
   SL nhập: [...]
```

Khác với phần tồn kho:

> `SL nhập` **không bị giới hạn bởi tồn kho hiện tại**.

Nếu đang thiếu 6:

```text
remaining = 6
```

tick Tân Việt thì default hợp lý nhất là:

```text
quantity = 6
```

chứ không phải dựa vào stock Tân Việt.

---

# 11. Trường hợp nhập Product hoàn toàn mới

Phía cuối:

```text
+ NHẬP SẢN PHẨM MỚI

Tên sản phẩm:
[Ống kẽm .................]

Danh mục:
[Ống kẽm]      ← khóa

Nhà cung cấp:
[.........................]

Đơn vị:
[.........................]

Giá nhập:
[.........................]

Số lượng:
[.........................]
```

`category_id` phải tự động lấy:

```text
Ống kẽm
```

và không cho user đổi sang Category khác.

Nếu Quotation đã có data ví dụ:

```text
supplier
product description
brand
```

thì có thể pre-fill.

### Một cải tiến quan trọng

Không nên tạo Product ngay khi user nhập form trong popup.

Chỉ khi user:

> Submit Convert

thì transaction mới:

```text
Create Product
→ Create ProductSupplier nếu cần
→ Ledger IN
→ Allocation
```

Nếu user đóng popup thì không sinh Product rác.

---

# 12. Nghiệp vụ "Nhập kho mới" cần làm rõ về mặt ý nghĩa

Requirement hiện tại của bạn nói:

> Submit Convert → ledger thêm số lượng hàng nhập.

Điều đó hoàn toàn triển khai được, nhưng nó mang ý nghĩa:

> **Khi user chọn "Nhập kho mới", hàng được coi là đã thực sự nhập vào kho.**

Ví dụ:

```text
Tân Việt:
OnHand = 10

Convert:
Nhập thêm = 5
```

Ledger:

```text
IN +5
```

khi đó:

```text
OnHand = 15
```

5 cái mới này đồng thời nên được:

```text
Reserved = 5
```

cho quotation hiện tại.

Nếu ý nghĩa thực tế lại là:

> "Tôi sẽ đặt NCC mua 5 cái trong tương lai"

thì **không được Ledger IN ngay**.

Khi đó phải có thêm Purchase Order / Pending Inbound.

Với requirement hiện tại, mình hiểu **"Nhập kho mới" = hàng đã nhập thực tế**, nên Ledger IN lúc Convert là hợp lý.

---

# 13. Allocation — entity mới rất quan trọng

Hiện Quotation chỉ biết:

```text
12 × Ống kẽm
```

Sau Convert phải có nơi lưu:

```text
12 cái đó thực tế là sản phẩm nào.
```

Mình đề xuất entity:

```text
QuotationAllocation
```

Ví dụ:

| quotation | category | product  | source    | qty |
| --------- | -------- | -------- | --------- | --: |
| QT001     | Ống kẽm  | Hòa Phát | STOCK     |   6 |
| QT001     | Ống kẽm  | Tân Việt | STOCK     |   3 |
| QT001     | Ống kẽm  | Tân Việt | NEW_STOCK |   3 |

Tổng:

```text
6 + 3 + 3 = 12
```

Đây chính là **kế hoạch giao hàng**.

---

# 14. Data model mình đề xuất

Có thể thành:

```text
Category
   │
   └── Product
          │
          └── ProductSupplier
```

và:

```text
Quotation
   │
   └── QuotationItem
          │
          └── category_id
```

sau Convert:

```text
QuotationItem
     │
     └── QuotationAllocation
             ├── product_id
             ├── source_type
             ├── quantity
             ├── supplier_id
             └── reservation_id
```

Có thể thiết kế:

```text
quotation_allocations
------------------------------
id
quotation_item_id
category_id
product_id
source_type
quantity
supplier_id
created_at
created_by
```

`source_type`:

```text
STOCK
NEW_STOCK
```

---

# 15. Ledger không nên lưu Category

Ledger nên quản lý **Product thực tế**.

Sai:

```text
Ledger
Ống kẽm +10
```

Đúng:

```text
Ledger
Ống kẽm Tân Việt +10
```

Vì stock thực tế nằm trên Product/SKU chứ không nằm trên Category.

---

# 16. Ledger cũng không nên UPDATE record cũ

Ledger nên là **append-only**.

Ví dụ Product Tân Việt:

```text
IN      +10
IN       +5
OUT      -3
OUT      -5
```

Stock:

```text
SUM(quantity_delta)
```

Không làm:

```text
UPDATE ledger SET quantity = ...
```

Điều này giúp audit lịch sử rất rõ.

---

# 17. Ví dụ hoàn chỉnh

Khách mua:

```text
Ống kẽm: 12
```

Kho:

```text
Hòa Phát     6
Tân Việt    10
```

User Convert.

### User chọn tồn kho

```text
Hòa Phát      4
Tân Việt      3
```

Đã cấp:

```text
7 / 12
```

Thiếu:

```text
5
```

UI vẫn enable:

```text
Nhập kho mới
```

User chọn:

```text
Tân Việt
SL nhập = 5
```

Tổng:

```text
Hòa Phát STOCK      4
Tân Việt STOCK      3
Tân Việt NEW_STOCK  5
---------------------
                    12
```

Valid.

---

# 18. Khi Submit Convert

BE nên chạy **một transaction duy nhất**.

Logic:

```text
1. Lock / kiểm tra lại stock.
2. Kiểm tra quotation vẫn có thể Convert.
3. Kiểm tra tất cả Category đủ quantity.
4. Tạo Product mới nếu có.
5. Tạo ProductSupplier nếu có.
6. Với NEW_STOCK:
      Ledger IN +quantity.
7. Tạo QuotationAllocation.
8. Reserve toàn bộ Product sẽ giao.
9. Update Quotation.
10. Commit transaction.
```

Trạng thái:

```text
QUOTATION
    ↓ Convert
AWAITING_DELIVERY
```

Tên tiếng Việt:

> **Chờ giao hàng**

---

# 19. Vì sao BE phải validate lại?

Không được tin vào quantity FE gửi lên.

Ví dụ hai nhân viên cùng mở popup:

```text
Tân Việt available = 10
```

A chọn 10.

B cũng chọn 10.

A Submit trước.

Khi B Submit, BE phải kiểm tra:

```text
available hiện tại = 0
```

và trả lỗi:

> Số lượng tồn kho đã thay đổi. Vui lòng kiểm tra lại phân bổ sản phẩm.

Nếu không làm bước này rất dễ âm kho.

---

# 20. Sau Convert nên khóa phần nội dung báo giá

Khi quotation đã thành:

```text
CHỜ GIAO HÀNG
```

không nên cho sửa trực tiếp:

```text
Category
Quantity
Price
```

vì Allocation đã được tạo.

Nếu vẫn cho sửa quantity từ:

```text
12 → 15
```

thì allocation 12 không còn hợp lệ.

Nếu business cần chức năng này sau này, nên có:

```text
Hủy Convert
```

hoặc:

```text
Điều chỉnh đơn
```

với cơ chế release reservation / phân bổ lại.

---

# 21. Button "Giao hàng"

Ở trạng thái:

```text
CHỜ GIAO HÀNG
```

hiển thị:

> **Giao hàng**

Click:

```text
XÁC NHẬN GIAO HÀNG

Ống kẽm: 12

- Hòa Phát: 4
- Tân Việt: 8

Bạn có chắc chắn hàng đã được giao?
```

Confirm.

---

# 22. Khi xác nhận giao hàng

BE lấy **QuotationAllocation**, không lấy Category để tính lại.

Ví dụ:

```text
Hòa Phát STOCK     4
Tân Việt STOCK     3
Tân Việt NEW       5
```

Tạo Ledger:

```text
Hòa Phát OUT       -4
Tân Việt OUT       -3
Tân Việt OUT       -5
```

Có thể gộp cùng Product:

```text
Hòa Phát OUT -4
Tân Việt OUT -8
```

nhưng mình thiên về **giữ line theo allocation/reference** để audit dễ hơn.

Sau đó:

```text
release reservation
```

và:

```text
Quotation.status = DELIVERED
```

---

# 23. Ledger đầy đủ của ví dụ

Giả sử ban đầu:

```text
Hòa Phát:
IN +6

Tân Việt:
IN +10
```

Convert:

```text
NEW STOCK Tân Việt:
IN +5
```

Stock vật lý:

```text
Hòa Phát = 6
Tân Việt = 15
```

Reserved:

```text
Hòa Phát = 4
Tân Việt = 8
```

Available:

```text
Hòa Phát = 2
Tân Việt = 7
```

Giao hàng:

```text
Hòa Phát OUT -4
Tân Việt OUT -8
```

Cuối cùng:

```text
Hòa Phát = 2
Tân Việt = 7
```

Reserved:

```text
0
```

Available:

```text
2 + 7
```

Hoàn toàn khớp.

---

# 24. Rule UI mình đề xuất

Trong từng Category nên luôn hiện:

```text
Yêu cầu:      12
Đã phân bổ:    7
Còn thiếu:     5
```

Rule:

```text
remaining > 0
→ cho chọn Product / nhập mới
```

```text
remaining == 0
→ disable toàn bộ Product chưa chọn
→ disable thêm Product mới
→ disable nhập kho mới
```

Nếu user giảm quantity:

```text
6 → 3
```

thì:

```text
remaining tăng lên
```

và các option được enable lại.

---

# 25. Một nuance về checkbox

Không nên disable checkbox của Product **đã được chọn** khi đạt đủ quantity.

Ví dụ:

```text
Hòa Phát 6
Tân Việt 6

Total 12/12
```

Phải cho user:

```text
☑ Hòa Phát
☑ Tân Việt
```

và vẫn có thể bỏ chọn Hòa Phát.

Nếu bỏ:

```text
6/12
```

thì các lựa chọn khác tự enable trở lại.

Chỉ disable:

> **Product chưa được chọn / action thêm mới**

khi remaining = 0.

---

# 26. Quotation có nhiều Category

Ví dụ:

```text
Ống kẽm          12
Bulong            5
Dây điện         20
```

Popup Convert:

```text
✓ Ống kẽm        12/12
✓ Bulong           5/5
⚠ Dây điện        15/20
```

Button:

```text
[ Xác nhận Convert ]
```

phải disabled.

Chỉ khi:

```text
✓ Ống kẽm        12/12
✓ Bulong           5/5
✓ Dây điện        20/20
```

mới submit được.

---

# 27. Một vấn đề nữa: cùng Category xuất hiện nhiều lần trong Quotation

Mình khuyên **business rule không cho cùng Category xuất hiện hai line trong một báo giá**, trừ khi thật sự có nhu cầu.

Ví dụ tránh:

```text
Ống kẽm  5   giá 100k
Ống kẽm  7   giá 120k
```

Nếu có trường hợp này thì Allocation bắt buộc phải tham chiếu:

```text
quotation_item_id
```

chứ không chỉ:

```text
category_id
```

Mình vẫn khuyên Allocation luôn có `quotation_item_id`, kể cả hiện tại chưa cần.

---

# 28. Trạng thái đề xuất

Có thể giữ đơn giản:

```text
DRAFT
   ↓
SENT / QUOTED
   ↓
AWAITING_DELIVERY
   ↓
DELIVERED
```

`Convert` là **action**, không nhất thiết là status.

Tức là:

```text
Convert
→ tạo allocation
→ reservation
→ nhập kho nếu cần
→ status = AWAITING_DELIVERY
```

---

# 29. Hủy sau khi Convert

Đây là trường hợp nên thiết kế ngay dù UI chưa làm.

Ví dụ quotation:

```text
AWAITING_DELIVERY
```

nhưng khách hủy.

Đối với hàng tồn:

```text
release reservation
```

Không có Ledger OUT vì chưa giao.

Đối với NEW_STOCK đã nhập:

```text
không nên tự động xóa Ledger IN
```

vì hàng thực tế đã nhập kho rồi.

Hàng đó trở thành:

```text
available stock
```

để bán cho khách khác.

Đây là một ưu điểm rất lớn của việc tách:

```text
Stock
Reservation
Allocation
```

ra khỏi nhau.

---

# 30. Mô hình cuối cùng

Mình sẽ đi theo mô hình này:

```text
                    CATEGORY
                       │
                 ┌─────┴─────┐
                 │           │
             Product A   Product B
                 │           │
                 └─────┬─────┘
                       │
                 Stock Ledger


Quotation
    │
    └── QuotationItem
            │
            │ category_id
            │ qty = 12
            │
            └── QuotationAllocation
                    │
          ┌─────────┼──────────┐
          │         │          │
       Product A Product B Product B
          │         │          │
        STOCK     STOCK     NEW_STOCK
          │         │          │
          4         3          5
```

Và lifecycle:

```text
BÁO GIÁ
Category × Quantity
        ↓
      CONVERT
        ↓
Product Allocation
        ↓
┌───────────────────────┐
│ Existing Stock        │ → Reserve
│ New Stock             │ → Ledger IN + Reserve
└───────────────────────┘
        ↓
CHỜ GIAO HÀNG
        ↓
     GIAO HÀNG
        ↓
Ledger OUT
Release Reservation
        ↓
ĐÃ GIAO HÀNG
```

## 31. 4 entity mình cho là bắt buộc nên có

Nếu tiếp tục từ thiết kế app hiện tại, mình sẽ bổ sung ít nhất:

1. **`quotation_items.category_id`** — báo giá theo Category.
2. **`quotation_allocations`** — lưu Product thực tế sẽ giao.
3. **`inventory_reservations`** — chống bán trùng tồn kho.
4. **`inventory_ledger`** — IN/OUT thực tế, append-only.

Trong đó công thức chuẩn là:

```text
OnHand = SUM(posted ledger quantity)
Reserved = SUM(active reservations)
Available = OnHand - Reserved
```

Đây sẽ là nền tảng khá sạch để sau này phát triển thêm **hủy đơn, giao từng phần, purchase order, nhiều kho, nhiều NCC, cost/profit và FEFO** mà không phải phá lại flow hiện tại.
