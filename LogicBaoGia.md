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
l
# Cập nhật spec panel báo giá cũ:
Kết hợp được, và thực ra **panel ref càng cần thiết hơn khi báo giá theo Category**. Chỉ cần đổi tư duy từ:

> Chọn Product → xem latest record của Product

thành:

> Chọn Category → xem các giao dịch tham chiếu của **tất cả Product thuộc Category đó**, rồi user chọn một record làm `reference` cho dòng báo giá.

Ví dụ bạn đang báo giá:

```text
Danh mục: Ống kẽm
Số lượng: 12
```

Trong hệ thống:

```text
Ống kẽm
├── Ống kẽm Hòa Phát v2026
└── Ống kẽm Tân Việt
```

Panel bên phải có thể trở thành **“Thông tin tham chiếu”**.

---

## 1. UI mình đề xuất

Màn báo giá:

```text
┌─────────────────────────────────────┐ ┌──────────────────────────────┐
│             BÁO GIÁ                 │ │  THÔNG TIN THAM CHIẾU       │
│                                     │ │                              │
│ Khách hàng: [Công ty ABC]           │ │ Danh mục: Ống kẽm            │
│                                     │ │                              │
│ Danh mục: [Ống kẽm]                 │ │ [Cùng khách] [Tất cả]        │
│ Số lượng: [12]                      │ │                              │
│ Giá bán: [150.000]                  │ │ ★ Ref gần nhất               │
│ VAT: [10%]                          │ │                              │
│                                     │ │ SP: Ống kẽm Hòa Phát         │
│                                     │ │ Khách: Công ty XYZ           │
│                                     │ │ SL: 20                       │
│                                     │ │ Giá nhập: 112.000            │
│                                     │ │ Giá bán: 148.000             │
│                                     │ │ Lợi nhuận: 32,14%            │
│                                     │ │ Ngày: 01/09/2026             │
│                                     │ │ Báo giá: QT-260901-01 ↗       │
│                                     │ │                              │
│                                     │ │ [Dùng giá này làm ref]       │
└─────────────────────────────────────┘ └──────────────────────────────┘
```

Điểm quan trọng là **reference không có nghĩa Product này sẽ được giao**.

Ví dụ bạn lấy:

```text
Ref giá:
Ống kẽm Hòa Phát
Giá bán 148.000
```

nhưng sau Convert có thể giao:

```text
6 Hòa Phát
6 Tân Việt
```

Hai nghiệp vụ hoàn toàn độc lập.

---

# 2. Tách rõ 3 lớp dữ liệu

Bạn nên coi hệ thống có ba layer:

```text
CATEGORY
"Khách hàng đang mua cái gì?"

        ↓

REFERENCE
"Giá này được tham khảo từ giao dịch nào?"

        ↓

ALLOCATION
"Cuối cùng giao Product nào?"
```

Ví dụ:

```text
Quotation Item
Category: Ống kẽm
Quantity: 12
Sale Price: 150.000
```

Reference:

```text
Reference Product:
Ống kẽm Hòa Phát

Reference Customer:
Công ty XYZ

Previous Sale Price:
148.000

Previous Import Price:
112.000

Previous Quotation:
QT001
```

Sau Convert:

```text
Allocation:

Hòa Phát      4
Tân Việt      8
```

Không có vấn đề gì cả.

---

# 3. Panel nên lấy những thông tin gì?

Với nhu cầu của bạn về:

> giá, người mua, ...

mình sẽ hiển thị mỗi reference record:

| Field          | Ý nghĩa                        |
| -------------- | ------------------------------ |
| Product        | Product thực tế ở giao dịch cũ |
| Category       | Danh mục                       |
| Customer       | Người mua trước                |
| Supplier       | NCC của Product                |
| Quantity       | SL giao dịch                   |
| Import price   | Giá nhập gần thời điểm đó      |
| Sale price     | Giá bán                        |
| Margin         | % lợi nhuận                    |
| VAT            | VAT                            |
| Quotation      | Báo giá nguồn                  |
| Order/Invoice  | Chứng từ bán                   |
| Import invoice | Chứng từ nhập                  |
| Date           | Ngày giao dịch                 |
| Warehouse      | Kho                            |
| Salesperson    | Người tạo báo giá / sale       |

Các ID liên quan đều nên clickable:

```text
QT-000123       ↗
KH-000056       ↗
NK-000291       ↗
SP-000019       ↗
```

---

# 4. Không chỉ hiển thị 1 record

Spec ban đầu là:

> latest impNcc

Nhưng khi chuyển sang Category, chỉ lấy **1 latest record** sẽ hơi yếu.

Ví dụ:

```text
Ống kẽm

Hòa Phát:
giá nhập 110k
giá bán gần nhất 145k

Tân Việt:
giá nhập 105k
giá bán gần nhất 140k
```

User nên nhìn thấy cả hai.

Mình đề xuất panel mặc định hiển thị:

### Giao dịch bán gần đây

Ví dụ:

```text
GẦN ĐÂY

01/09
Hòa Phát
Công ty ABC
20 cái
Giá bán: 148k
Giá nhập: 112k
Margin: 32%

28/08
Tân Việt
Công ty DEF
10 cái
Giá bán: 142k
Giá nhập: 106k
Margin: 34%

20/08
Hòa Phát
Công ty GHI
50 cái
Giá bán: 144k
...
```

Khoảng:

```text
5–10 record
```

là hợp lý.

---

# 5. Nên có hai tab trong panel

Panel:

```text
[ Giá bán ] [ Giá nhập ]
```

### Tab Giá bán

Dữ liệu từ:

```text
Quotation / Order / Delivery
```

Hiển thị:

```text
Product
Customer
Quantity
Sale Price
VAT
Margin
Quotation
Date
```

Đây là nơi Sale tham khảo:

> Lần trước mình đã bán Category này bao nhiêu?

### Tab Giá nhập

Dữ liệu từ:

```text
impNcc / inventory receipt / ledger IN
```

Hiển thị:

```text
Product
Supplier
Quantity
Import Price
VAT
Import unit
Invoice
Import date
```

Đây là nơi tham khảo:

> Giá vốn gần nhất là bao nhiêu?

---

# 6. Filter cực kỳ hữu ích: “Cùng khách hàng”

Giả sử hiện đang báo giá cho:

```text
Công ty Minh Anh
```

và Category:

```text
Ống kẽm
```

Panel nên ưu tiên:

```text
[Cùng khách hàng]
```

Kết quả:

```text
Lần gần nhất bán Ống kẽm cho
Công ty Minh Anh:

Ngày: 15/08
Product: Hòa Phát
SL: 30
Giá bán: 143.000
```

Sau đó mới đến:

```text
[Tất cả khách hàng]
```

Điều này cực kỳ hữu ích cho sale vì nhiều khách thường có **giá riêng**.

---

# 7. Thứ tự ưu tiên Reference

Khi chọn:

```text
Customer + Category
```

BE có thể trả:

### Reference số 1

```text
Latest sale:
same Customer
same Category
```

Nếu không có:

### Reference số 2

```text
Latest sale:
any Customer
same Category
```

Và song song:

### Reference giá vốn

```text
Latest import:
products in same Category
```

Logic:

```text
Customer A + Category X
        ↓
Có lịch sử Customer A mua Category X?
        ↓ YES
hiển thị lên đầu

        ↓ NO

Lấy lịch sử toàn bộ khách mua Category X
```

---

# 8. “Dùng làm ref” chứ không auto áp dụng mù quáng

Ví dụ panel:

```text
Previous Sale Price: 148.000

[ Áp dụng giá ]
```

Khi click:

```text
SalePrice = 148.000
```

Nhưng user vẫn sửa được:

```text
150.000
```

Mình không khuyên tự động overwrite giá ngay khi Category thay đổi.

Nên:

```text
Hiển thị gợi ý
        ↓
User chọn
        ↓
Apply
```

vì lịch sử có thể không phù hợp với deal hiện tại.

---

# 9. Có thể hiển thị Recommendation

Panel có thể tổng hợp thêm:

```text
GIÁ THAM KHẢO

Giá bán gần nhất:       148.000
Giá bán cùng khách:     145.000
Giá bán trung bình:     146.500

Giá nhập gần nhất:
Hòa Phát:               112.000
Tân Việt:               106.000

Giá bán hiện tại:       150.000
```

Và:

```text
Estimated margin:
Hòa Phát: 33.9%
Tân Việt: 41.5%
```

Nhưng đây chỉ là **reference**, vì chưa biết Product nào sẽ được allocate khi Convert.

---

# 10. Vậy `% lợi nhuận` tính thế nào khi chưa biết Product?

Đây là điểm quan trọng nhất khi báo giá theo Category.

Trước đây:

```text
Product
→ biết giá nhập
→ tính chính xác margin
```

Bây giờ:

```text
Category
→ có nhiều Product
→ nhiều giá nhập khác nhau
```

Không thể nói có một `cost price` chính xác.

Mình đề xuất có:

```text
Reference Cost
```

Ví dụ user chọn:

```text
Reference:
Ống kẽm Hòa Phát

Reference Cost = 112.000
```

Nếu:

```text
Sale Price = 150.000
```

thì:

```text
Reference Margin
= (150.000 - 112.000) / 112.000
≈ 33.93%
```

UI phải gọi đúng tên:

> **Lợi nhuận tham chiếu**

không nên gọi:

> Lợi nhuận thực tế

---

# 11. Lợi nhuận thực tế chỉ biết sau Convert

Sau Convert:

```text
4 Hòa Phát @112k
8 Tân Việt @106k
```

Cost thực tế:

```text
4 × 112
+
8 × 106
=
1.296k
```

Average cost:

```text
1.296 / 12
= 108k
```

Giá bán:

```text
150k × 12
= 1.800k
```

Lúc đó mới tính được:

```text
Actual Gross Profit:
504k
```

và margin thực tế.

Do đó nên phân biệt:

```text
Quotation:
Reference margin

After Convert:
Expected actual margin

After Delivery:
Actual margin
```

Kiến trúc như vậy sẽ rất sạch.

---

# 12. Nên lưu Reference vào QuotationItem

Mình khuyên **có lưu**, chứ đừng chỉ hiển thị UI rồi mất.

Ví dụ:

```text
quotation_item
--------------------------
category_id
quantity
unit_price

reference_product_id
reference_sale_id
reference_import_id
```

Nhưng tốt hơn nữa là một bảng:

```text
quotation_item_references
```

Ví dụ:

```text
id
quotation_item_id

reference_type
reference_entity_id

product_id
customer_id
supplier_id

reference_import_price
reference_sale_price
reference_quantity
reference_date
```

`reference_type`:

```text
SALE
IMPORT
MANUAL
```

---

# 13. Vì sao phải snapshot?

Giả sử tháng 9 bạn tạo báo giá:

```text
QT100
```

tham khảo:

```text
QT050
Sale price: 148k
Import price: 112k
```

Sau này QT050 có correction hoặc product price thay đổi.

QT100 vẫn phải nhớ:

> Khi tạo báo giá, tôi đã tham khảo giá **148 / 112**.

Nên Quotation Reference lưu cả:

```text
reference_id
+
snapshot
```

Ví dụ:

```json
{
  "referenceQuotationId": "QT050",
  "referenceProductId": "P01",
  "referenceCustomerId": "C10",

  "snapshotSalePrice": 148000,
  "snapshotImportPrice": 112000,
  "snapshotMargin": 32.14,
  "snapshotDate": "2026-09-01"
}
```

Không chỉ FK.

---

# 14. API hợp lý

Khi chọn Category:

```http
GET /api/quotation-reference
    ?categoryId=CAT01
    &customerId=CUS01
```

Response:

```json
{
  "sameCustomer": [
    {
      "productId": "P01",
      "productName": "Ống kẽm Hòa Phát v2026",
      "customerId": "CUS01",
      "customerName": "Công ty ABC",
      "quantity": 20,
      "salePrice": 148000,
      "importPrice": 112000,
      "quotationId": "QT050",
      "date": "2026-09-01"
    }
  ],
  "recentSales": [],
  "recentImports": []
}
```

FE panel chỉ render response.

---

# 15. Khi user click một record

Ví dụ:

```text
Ống kẽm Hòa Phát
Công ty ABC
148.000

[Dùng làm tham chiếu]
```

FE set:

```text
referenceProductId = P01
referenceQuotationId = QT050
referenceSalePrice = 148000
referenceImportPrice = 112000
```

Nếu user click:

```text
[Áp dụng giá bán]
```

thì mới:

```text
unitPrice = 148000
```

Hai action nên khác nhau:

```text
Dùng làm tham chiếu
```

và:

```text
Áp dụng giá
```

---

# 16. Mình đề xuất panel cuối cùng như sau

```text
┌────────────────────────────────────────┐
│ THAM CHIẾU BÁO GIÁ                     │
│                                        │
│ Ống kẽm                                │
│                                        │
│ [Cùng khách] [Gần đây] [Giá nhập]      │
│                                        │
│ ────────────────────────────────────── │
│ ★ Gần nhất cùng khách                  │
│                                        │
│ Ống kẽm Hòa Phát                       │
│ Công ty ABC                            │
│                                        │
│ SL:             20                     │
│ Giá nhập:       112.000                │
│ Giá bán:        148.000                │
│ Margin:          32,1%                 │
│ VAT:             10%                   │
│ Ngày:           01/09/2026             │
│                                        │
│ QT-000123 ↗     KH-00010 ↗             │
│                                        │
│ [Dùng làm ref] [Áp dụng giá]           │
│                                        │
│ ────────────────────────────────────── │
│ Các giao dịch khác                     │
│                                        │
│ Tân Việt      142k      Công ty XYZ    │
│ Hòa Phát      145k      Công ty DEF    │
│ ...                                    │
└────────────────────────────────────────┘
```

Và nếu chưa chọn Category:

```text
Hãy chọn danh mục sản phẩm để xem
thông tin tham chiếu.
```

Nếu Category chưa có lịch sử:

```text
Chưa có lịch sử bán hàng của danh mục này.

Giá nhập gần nhất:
Hòa Phát: 112.000
Tân Việt: 106.000
```

Nếu hoàn toàn chưa có:

```text
Chưa có dữ liệu tham chiếu.
```

---

## Chốt nghiệp vụ

Mình sẽ **không bỏ panel cũ**, mà nâng nó từ:

```text
Latest import của Product
```

thành:

```text
Reference Center của Category
```

Trong đó:

```text
Category
   │
   ├── lịch sử bán
   │     ├── Product đã bán
   │     ├── người mua
   │     ├── số lượng
   │     ├── giá bán
   │     └── quotation ref
   │
   └── lịch sử nhập
         ├── Product
         ├── NCC
         ├── giá nhập
         └── chứng từ nhập
```

**Báo giá vẫn theo Category. Reference vẫn giữ được Product, giá, khách hàng/người mua, NCC và chứng từ cũ. Convert mới quyết định Product thực tế được giao.**

Đây là cách kết hợp hai yêu cầu mà không làm mất giá trị của panel ban đầu, đồng thời không phá nghiệp vụ mới “một Category có nhiều Product”.

Nên bổ sung rule lookup reference theo **thứ tự ưu tiên cố định** như sau:

### Logic tìm báo giá tham chiếu

Khi user chọn:

```text
Customer + Category
```

hệ thống tìm reference theo thứ tự:

```text
1. Báo giá gần nhất
   cùng Customer
   + cùng Category

        ↓ nếu không có

2. Báo giá gần nhất
   của Category đó
   bất kể Customer

        ↓ nếu vẫn không có

3. Không có dữ liệu báo giá tham chiếu
   → chỉ hiển thị lịch sử giá nhập nếu có
```

Ví dụ đang tạo báo giá:

```text
Customer: Công ty ABC
Category: Ống kẽm
```

Hệ thống query trước:

```text
Category = Ống kẽm
Customer = Công ty ABC
```

Nếu có:

```text
QT-0098
Customer: Công ty ABC
Category: Ống kẽm
Date: 01/09/2026
Sale Price: 148.000
```

thì chọn `QT-0098` làm **Primary Reference**.

Nếu Công ty ABC chưa từng mua Ống kẽm, hệ thống fallback sang:

```text
Category = Ống kẽm
Customer = ANY
```

và lấy báo giá gần nhất, ví dụ:

```text
QT-0102
Customer: Công ty XYZ
Category: Ống kẽm
Date: 05/09/2026
Sale Price: 152.000
```

Panel cần ghi rõ nguồn:

```text
★ Báo giá tham chiếu

QT-0102
Ống kẽm Hòa Phát
Khách hàng: Công ty XYZ
Giá bán: 152.000
Ngày: 05/09/2026

⚠ Chưa có lịch sử cùng khách hàng.
Đang hiển thị báo giá gần nhất của danh mục.
```

## Điều kiện "gần nhất"

Không nên đơn giản lấy:

```sql
ORDER BY created_at DESC
```

Mà nên lấy theo **ngày hiệu lực/ngày báo giá**, rồi mới dùng `created_at` làm tie-breaker:

```text
ORDER BY quotation_date DESC,
         created_at DESC
```

Và chỉ lấy các báo giá hợp lệ, ví dụ:

```text
status != DRAFT
status != CANCELLED
deleted_at IS NULL
```

Nếu hệ thống có `ACCEPTED`, mình còn khuyên ưu tiên:

```text
ACCEPTED / CONVERTED / DELIVERED
```

hơn quotation chỉ mới `SENT`, vì đây là mức giá thực tế khách đã chấp nhận.

Thứ tự tốt hơn có thể là:

```text
1. Gần nhất cùng Customer + Category
   và đã ACCEPTED/CONVERTED/DELIVERED

2. Gần nhất cùng Customer + Category
   trạng thái hợp lệ khác

3. Gần nhất cùng Category
   và đã ACCEPTED/CONVERTED/DELIVERED

4. Gần nhất cùng Category

5. Không có quotation reference
```

## API

Có thể giữ một API:

```http
GET /api/quotation-reference
    ?categoryId={categoryId}
    &customerId={customerId}
```

BE tự xử lý fallback.

Response nên nói rõ **vì sao record này được chọn**:

```json
{
  "reference": {
    "quotationId": "QT-0102",
    "customerId": "CUS-XYZ",
    "customerName": "Công ty XYZ",
    "categoryId": "CAT-ONG-KEM",
    "productId": "PROD-HP",
    "productName": "Ống kẽm Hòa Phát",
    "quantity": 20,
    "salePrice": 152000,
    "importPrice": 112000,
    "quotationDate": "2026-09-05"
  },
  "matchType": "CATEGORY_ONLY"
}
```

`matchType` nên có:

```text
CUSTOMER_AND_CATEGORY
CATEGORY_ONLY
NONE
```

FE nhờ vậy không cần tự suy luận.

## Nếu một quotation có nhiều dòng cùng Category

Reference phải trả theo `QuotationItem`, không chỉ theo `Quotation`.

Ví dụ `QT-0102` có:

```text
Ống kẽm      152.000
Bulong        80.000
```

thì reference của `Ống kẽm` phải lấy chính line:

```text
quotation_item.category_id = ONG_KEM
```

và trả:

```text
quotationItemId
```

để trace chính xác.

### Rule cuối cùng

```text
Selected Customer
       +
Selected Category
       │
       ▼
Có quotation cùng Customer + Category?
       │
   YES │              NO
       ▼               ▼
Lấy gần nhất       Tìm quotation
                   cùng Category
                         │
                    YES  │   NO
                         ▼
                   Lấy gần nhất
                         │
                         ▼
                 Reference Panel
```

Mình khuyên dùng rule này làm **auto-selected primary reference**, nhưng panel vẫn nên hiển thị thêm vài giao dịch gần đây để user có thể chọn một reference khác nếu mức giá gần nhất không phù hợp.
