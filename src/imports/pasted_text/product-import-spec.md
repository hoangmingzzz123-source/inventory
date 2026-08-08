Đúng, với yêu cầu bổ sung **VAT** và **đơn vị nhập**, tôi sẽ giữ nguyên nghiệp vụ bạn mô tả và mở rộng phần đặc tả theo đúng flow của demo, không tự thay đổi thành một hệ thống ERP khác.

# 1. Các thành phần chính

## 1.1. Danh mục sản phẩm

Lưu thông tin chuẩn của sản phẩm trong hệ thống.

Các thông tin cơ bản:

| Trường        | Ý nghĩa                      |
| ------------- | ---------------------------- |
| ID            | Định danh sản phẩm           |
| Mã sản phẩm   | Mã duy nhất của sản phẩm     |
| Mô tả         | Mô tả sản phẩm               |
| Đơn vị cơ bản | Cái, kg, cuộn, hộp,...       |
| Trạng thái    | Đang sử dụng / ngừng sử dụng |
| Ghi chú       | Thông tin bổ sung            |

Một **mã sản phẩm có thể có nhiều nguồn nhập khác nhau**.

Ví dụ:

```text
SP001 - Dây cáp mạng CAT6
│
├── NCC001
│   └── "Cáp mạng CAT6 UTP"
│
├── NCC002
│   └── "Dây mạng CAT6"
│
└── NCC003
    └── "CAT6 Network Cable"
```

Do đó, tên sản phẩm trong `Danh mục sản phẩm` là tên chuẩn nội bộ, trong khi tên tại nguồn nhập có thể khác.

---

# 2. Nhà cung cấp

Lưu thông tin nhà cung cấp.

Ví dụ:

| Trường     | Ý nghĩa          |
| ---------- | ---------------- |
| ID         | ID nhà cung cấp  |
| Mã NCC     | Mã nhà cung cấp  |
| Tên NCC    | Tên nhà cung cấp |
| Địa chỉ    | Địa chỉ          |
| Điện thoại | Số điện thoại    |
| Email      | Email            |
| MST        | Mã số thuế       |
| Ghi chú    | Ghi chú          |

---

# 3. `impNcc` — dữ liệu nguồn nhập / lịch sử nhập

Trong phạm vi demo, `impNcc` có thể hiểu là **bảng lưu thông tin các mặt hàng đã/đang được nhập từ nhà cung cấp**, đồng thời được sử dụng làm nguồn dữ liệu tham chiếu khi lập báo giá.

Các trường chính:

| Trường          | Ý nghĩa                  |
| --------------- | ------------------------ |
| ID              | ID record                |
| Mã hàng         | Mã sản phẩm nội bộ       |
| Tên mặt hàng    | Tên hàng theo nguồn nhập |
| Mã NCC          | Nhà cung cấp             |
| Đơn giá nhập    | Giá nhập                 |
| Đơn vị nhập     | Cái, kg, cuộn,...        |
| Số lượng nhập   | Số lượng                 |
| Ngày nhập       | Ngày nhập                |
| Mã hóa đơn nhập | Tham chiếu hóa đơn       |
| Mã báo giá      | Báo giá liên quan        |
| Mã khách hàng   | Khách hàng liên quan     |
| Ghi chú         | Thông tin khác           |

### Điểm quan trọng

Một `Mã hàng` có thể xuất hiện nhiều lần:

```text
SP001 | NCC001 | 100.000 | 01/08/2026
SP001 | NCC001 | 105.000 | 05/08/2026
SP001 | NCC002 | 110.000 | 07/08/2026
```

Do đó hệ thống có thể xác định:

> Giá nhập gần nhất của sản phẩm từ từng nhà cung cấp.

---

# 4. Khách hàng

Lưu thông tin khách hàng sử dụng khi lập báo giá.

```text
ID
Mã khách hàng
Tên khách hàng
Địa chỉ
Điện thoại
Email
Mã số thuế
Ghi chú
```

---

# 5. Báo giá

Một báo giá là **header** của một giao dịch báo giá.

Thông tin:

| Trường              | Ý nghĩa                           |
| ------------------- | --------------------------------- |
| ID                  | ID báo giá                        |
| Mã báo giá          | Mã duy nhất                       |
| ID khách hàng       | Khách hàng                        |
| Ngày báo giá        | Ngày lập                          |
| Hiệu lực đến        | Thời hạn báo giá                  |
| Chiết khấu          | Chiết khấu toàn bộ báo giá        |
| VAT                 | Thuế VAT                          |
| Tiền VAT            | Số tiền VAT                       |
| Tổng tiền trước VAT | Tổng trước thuế                   |
| Tổng tiền sau VAT   | Tổng thanh toán                   |
| Trạng thái          | Draft / Đã gửi / Đồng ý / Từ chối |
| Ghi chú             | Ghi chú                           |

---

# 6. Chi tiết báo giá

Mỗi báo giá có **nhiều dòng sản phẩm**.

Ví dụ:

```text
QT00001

SP001
SP002
SP003
SP010
```

Mỗi dòng chứa:

| Trường       | Ý nghĩa           |
| ------------ | ----------------- |
| ID           | ID                |
| ID báo giá   | Báo giá           |
| ID `impNcc`  | Record nguồn nhập |
| Mã sản phẩm  | Mã hàng           |
| Tên sản phẩm | Tên hiển thị      |
| Nhà cung cấp | NCC               |
| % lợi nhuận  | Lợi nhuận         |
| Đơn giá nhập | Giá vốn           |
| Đơn giá bán  | Giá bán           |
| Số lượng     | Số lượng báo giá  |
| Đơn vị       | Đơn vị báo giá    |
| Thành tiền   | SL × đơn giá      |
| Ghi chú      | Ghi chú           |

---

# 7. Đơn vị nhập và đơn vị báo giá

Đây là phần cần làm rõ.

Ví dụ một sản phẩm:

```text
SP001 - Cáp điện
```

có thể nhập:

```text
10 cuộn
```

nhưng khi báo giá có thể bán:

```text
50 mét
```

Nếu demo của bạn yêu cầu đơn vị nhập và đơn vị báo giá riêng, **không nên giả định chúng luôn giống nhau**.

Trong màn hình báo giá nên có:

```text
Mã sản phẩm
Tên sản phẩm
Nhà cung cấp
Đơn giá nhập
Đơn vị nhập
Đơn giá bán
Đơn vị bán
Số lượng
```

Tuy nhiên nếu nghiệp vụ hiện tại của demo quy định:

> Đơn vị nhập = đơn vị báo giá

thì có thể auto-fill cùng giá trị nhưng vẫn cho phép người dùng kiểm tra/chọn lại.

---

# 8. VAT trong báo giá

VAT nên được thể hiện **ở cấp báo giá**, đồng thời phải thể hiện rõ trên từng dòng/tổng hợp khi in báo giá.

Ví dụ:

```text
Tạm tính:                 10.000.000
Chiết khấu 5%:              500.000
------------------------------------
Tiền trước VAT:             9.500.000

VAT 10%:                     950.000
------------------------------------
TỔNG THANH TOÁN:           10.450.000
```

## Công thức

```text
Tổng dòng
= Số lượng × Đơn giá bán
```

```text
Tạm tính
= Tổng tất cả các dòng
```

```text
Tiền chiết khấu
= Tạm tính × % chiết khấu
```

```text
Tiền trước VAT
= Tạm tính - Tiền chiết khấu
```

```text
Tiền VAT
= Tiền trước VAT × VAT %
```

```text
Tổng thanh toán
= Tiền trước VAT + Tiền VAT
```

---

# 9. VAT nên hỗ trợ nhiều mức

Không nên hard-code chỉ `10%`.

Dropdown:

```text
VAT
├── 0%
├── 5%
├── 8%
├── 10%
└── Không chịu VAT
```

Nếu sản phẩm trong demo có thể có mức VAT khác nhau, có thể đặt VAT ở **từng dòng báo giá**.

Ví dụ:

| SP    | SL |     Giá | VAT |
| ----- | -: | ------: | --: |
| SP001 | 10 | 100.000 | 10% |
| SP002 |  5 | 200.000 |  8% |
| SP003 |  2 | 500.000 |  0% |

Khi đó phần tổng báo giá sẽ cộng VAT theo từng dòng.

**Nếu demo hiện tại áp dụng một mức VAT chung cho cả báo giá thì nên giữ VAT ở Header để giao diện đơn giản hơn.**

---

# 10. Luồng lập báo giá hoàn chỉnh

Người dùng vào:

> **Báo giá → Tạo báo giá**

Màn hình gồm **2 panel chính**.

### Panel trái — Thông tin báo giá

```text
Khách hàng
[ 🔍 Tìm khách hàng ]

Ngày báo giá
[ 08/08/2026 ]

Hiệu lực đến
[ 15/08/2026 ]

Chiết khấu
[ 5% ]

VAT
[ 10% ]
```

Sau đó là danh sách sản phẩm.

---

# 11. Thêm sản phẩm vào báo giá

Click:

> `+ Thêm sản phẩm`

Xuất hiện một dòng:

```text
Mã sản phẩm       [🔍 SP001 ▼]

Nhà cung cấp      [🔍 NCC001 ▼]

Tên hàng          [Cáp mạng CAT6]

Đơn vị nhập       [Cuộn ▼]

Đơn giá nhập      [100.000]

% lợi nhuận       [20%]

Đơn giá bán       [120.000]

Số lượng          [10]

Đơn vị báo giá    [Cuộn ▼]

VAT               [10%]

Thành tiền        [1.200.000]
```

---

# 12. Khi chọn mã sản phẩm

Ví dụ:

```text
SP001
```

hệ thống tìm các nguồn tương ứng.

```text
SP001
│
├── NCC001
├── NCC002
└── NCC003
```

Dropdown nhà cung cấp chỉ hiển thị những NCC có liên quan tới sản phẩm đó.

---

# 13. Chọn nhà cung cấp

Ví dụ:

```text
SP001
+
NCC001
```

hệ thống tìm `impNcc` gần nhất:

```text
SP001
NCC001

07/08/2026
Giá nhập: 100.000
Tên: Cáp CAT6 UTP
Đơn vị: Cuộn
```

Sau đó tự động fill vào form.

---

# 14. Panel Latest Record

Panel bên phải hiển thị dữ liệu lịch sử.

Ví dụ:

```text
LATEST RECORD
────────────────────────

Mã hàng:
SP001

Tên hàng:
Cáp CAT6 UTP

Nhà cung cấp:
NCC001

Ngày nhập:
07/08/2026

Đơn vị nhập:
Cuộn

Số lượng:
100

Đơn giá nhập:
100.000

Mã hóa đơn:
HD000123

Mã báo giá:
QT00098

Khách hàng:
Công ty ABC
```

---

# 15. Các mã có thể click

Ví dụ:

```text
Mã hóa đơn: HD000123
```

click → mở:

```text
Invoice Detail
```

trong **tab mới**.

Tương tự:

```text
QT00098
```

→ mở:

```text
Quotation Detail
```

và:

```text
KH001
```

→ mở:

```text
Customer Detail
```

Điều này tạo thành **navigation xuyên suốt dữ liệu**, rất giống cách người dùng tra cứu dữ liệu trong demo.

---

# 16. Không có lịch sử

Nếu:

```text
SP999
```

chưa từng có trong `impNcc`:

```text
LATEST RECORD

Chưa có dữ liệu nhập trước đó.

Tên hàng: ""
Đơn giá nhập: 0
Đơn vị nhập: ""
Số lượng: 0
Ngày nhập: ""
```

Nhưng form vẫn cho phép người dùng nhập mới.

---

# 17. Tự động tính giá

### Trường hợp 1

Người dùng nhập:

```text
Đơn giá nhập = 100.000

% lợi nhuận = 20%
```

→

```text
Đơn giá bán = 120.000
```

### Trường hợp 2

Người dùng nhập:

```text
Đơn giá nhập = 100.000

Đơn giá bán = 125.000
```

→

```text
% lợi nhuận = 25%
```

---

# 18. Thêm nhiều sản phẩm

Ví dụ:

```text
BÁO GIÁ QT00001

Customer: ABC

────────────────────────────────────────────

SP001 | NCC001 | 100K | 20% | 120K | 10
SP002 | NCC002 | 200K | 15% | 230K | 5
SP003 | NCC001 | 500K | 30% | 650K | 2
SP005 | NCC003 | 50K  | 10% | 55K  | 100

────────────────────────────────────────────
```

---

# 19. Tổng báo giá

```text
Tạm tính                 5.000.000

Chiết khấu 5%             -250.000

Tiền trước VAT            4.750.000

VAT 10%                    475.000

─────────────────────────────────

TỔNG THANH TOÁN           5.225.000
```

---

# 20. Save

Khi click:

> **Lưu báo giá**

hệ thống lưu:

```text
Quotation
+
Quotation Items
```

Trạng thái ban đầu:

```text
DRAFT
```

Sau khi xác nhận/gửi cho khách:

```text
SENT / ISSUED
```

---

# 21. Print

Sau khi lưu có thể:

```text
[In báo giá]
```

Bản in phải thể hiện:

```text
Thông tin công ty

BÁO GIÁ

Mã báo giá
Ngày báo giá
Hiệu lực

Khách hàng
Địa chỉ
MST

STT
Mã SP
Tên hàng
Đơn vị
SL
Đơn giá
Thành tiền

Tạm tính
Chiết khấu
VAT
Tổng thanh toán

Ghi chú

Điều khoản

Người lập
```

---

# 22. Accept

Khi khách hàng đồng ý:

```text
Báo giá
     ↓
ACCEPTED
     ↓
Nhập kho
```

Các dòng trong báo giá được sử dụng để tạo dữ liệu nhập kho.

Ví dụ:

```text
QT00001

SP001
Tên: Cáp CAT6
NCC: NCC001
Đơn giá nhập: 100.000
Đơn vị nhập: Cuộn
SL: 10
```

→ tạo record nhập kho tương ứng.

---

# 23. Thông tin nhập kho

Khi Accept, dữ liệu nhập kho bao gồm tối thiểu:

```text
Mã hàng
Tên hàng
Nhà cung cấp
Đơn giá nhập
Đơn vị nhập
Số lượng nhập
Ngày nhập
Mã hóa đơn nhập
Mã báo giá
Mã khách hàng
```

Nếu có kho:

```text
Kho nhập
```

cũng được xác định tại bước này.

---

# 24. Sau khi nhập kho

Record mới trở thành dữ liệu lịch sử `impNcc`.

Ví dụ:

```text
07/08/2026
SP001
NCC001
100.000
```

Sau khi nhập:

```text
08/08/2026
SP001
NCC001
105.000
```

Lần lập báo giá sau sẽ ưu tiên record:

```text
08/08/2026
```

vì đây là **latest record**.

---

# 25. Reject

Nếu khách hàng không đồng ý:

```text
Báo giá
   ↓
REJECTED
```

Không tạo dữ liệu nhập kho.

Không cập nhật lịch sử nhập.

Không tăng tồn kho.

Báo giá vẫn được lưu để phục vụ thống kê.

---

# 26. Thống kê theo đúng nghiệp vụ

Dashboard không chỉ thống kê số lượng sản phẩm.

Nó phải phản ánh flow:

```text
BÁO GIÁ
   ↓
KHÁCH HÀNG
   ↓
ACCEPT / REJECT
   ↓
NHẬP KHO
   ↓
GIÁ NHẬP
   ↓
GIÁ BÁN
   ↓
LỢI NHUẬN
```

### KPI báo giá

* Tổng số báo giá
* Báo giá đang chờ
* Báo giá đã đồng ý
* Báo giá từ chối
* Tổng giá trị báo giá
* Tổng giá trị đã đồng ý
* Tỷ lệ đồng ý
* Tổng chiết khấu
* Tổng VAT

### KPI nhập kho

* Tổng số phiếu nhập
* Tổng giá trị nhập
* Số lượng hàng nhập
* Giá trị nhập theo nhà cung cấp
* Giá nhập theo sản phẩm
* Số sản phẩm chưa từng nhập

### KPI lợi nhuận

* Tổng giá trị bán
* Tổng giá vốn
* Lợi nhuận dự kiến
* % lợi nhuận trung bình
* Top sản phẩm có lợi nhuận cao
* Top sản phẩm có giá nhập tăng

---

# 27. Thống kê giá nhập

Đây là thống kê đặc biệt quan trọng với nghiệp vụ của demo.

Ví dụ:

```text
SP001 - NCC001

01/08    90.000
03/08    95.000
05/08   100.000
08/08   105.000
```

Có thể hiển thị:

```text
Giá nhập gần nhất: 105.000
Giá nhập trước đó: 100.000
Mức tăng: +5%
```

---

# 28. Thống kê nhà cung cấp

Ví dụ:

| NCC    | Số sản phẩm | Giá trị nhập | Giá nhập TB |
| ------ | ----------: | -----------: | ----------: |
| NCC001 |          25 |          50M |        100K |
| NCC002 |          18 |          35M |         95K |
| NCC003 |          12 |          20M |        110K |

Có thể drill-down:

```text
NCC001
    ↓
Danh sách sản phẩm
    ↓
Lịch sử giá nhập
    ↓
Báo giá liên quan
    ↓
Phiếu nhập liên quan
```

---

# 29. Thống kê khách hàng

```text
Khách hàng ABC

Tổng báo giá:       15
Đồng ý:             10
Từ chối:             3
Đang chờ:            2

Acceptance Rate: 76.9%

Giá trị báo giá:    150M
Giá trị đã chốt:    100M
```

---

# 30. Thống kê VAT

Dashboard có thể có:

```text
VAT 0%     10M
VAT 5%     20M
VAT 8%     50M
VAT 10%    80M
```

Và:

```text
Tổng tiền trước VAT
Tổng VAT
Tổng tiền sau VAT
```

Điều này đặc biệt hữu ích nếu sau này bạn muốn đối chiếu báo giá với nhập kho/hóa đơn.

---

# 31. Luồng nghiệp vụ hoàn chỉnh của demo

Tóm lại, **business flow đúng theo mô tả của bạn** là:

```text
                    PRODUCT
                       │
                       │
                 SUPPLIER
                       │
                       ▼
                    impNcc
                       │
              Latest Purchase Record
                       │
                       ▼
                 CREATE QUOTATION
                       │
             ┌─────────┴─────────┐
             │                   │
         CUSTOMER            PRODUCTS
             │                   │
             └─────────┬─────────┘
                       │
                       ▼
                QUOTATION ITEMS
                       │
          ┌────────────┼────────────┐
          │            │            │
       Cost Price   Profit %    Selling Price
          │            │            │
          └────────────┼────────────┘
                       │
                       ▼
                  QUOTATION
                       │
             ┌─────────┴─────────┐
             │                   │
           PRINT              CUSTOMER
                                 │
                     ┌───────────┴───────────┐
                     │                       │
                   ACCEPT                  REJECT
                     │                       │
                     ▼                       ▼
                NHẬP KHO                  CLOSED
                     │
                     ▼
                   impNcc
                     │
                     ▼
             Latest Record mới
                     │
                     ▼
                DASHBOARD
```

### Điểm cốt lõi cần giữ nguyên khi tái hiện thành Web

**Product → Supplier → impNcc → Latest Record → Quotation → Customer Decision → Nhập kho → impNcc → Statistics.**

Trong đó:

* **VAT** thuộc phần tính tổng của báo giá.
* **Chiết khấu** thuộc báo giá.
* **Đơn vị nhập** phải xuất hiện trong cả dữ liệu lịch sử nhập và form nhập kho; khi lập báo giá có thể auto-fill từ latest record.
* **Đơn giá nhập** lấy từ latest `impNcc` nhưng người dùng được sửa.
* **Tên hàng** lấy từ latest `impNcc` nhưng sản phẩm mới sẽ mặc định `""`.
* **Đơn vị nhập** lấy từ latest `impNcc`; sản phẩm chưa từng nhập sẽ để trống.
* **Giá bán ↔ % lợi nhuận** được tính hai chiều.
* Một báo giá có **nhiều sản phẩm**.
* Mỗi sản phẩm có **NCC riêng**.
* Accept mới dẫn đến **nhập kho**.
* Reject không tạo nhập kho nhưng **vẫn lưu báo giá** để thống kê.
* `impNcc` sau khi Accept có thêm record mới và record đó trở thành **latest record** cho các báo giá tiếp theo.

Đây là phiên bản tôi sẽ coi là **business specification của demo**, trước khi chuyển nó thành `SPEC.md` và sau đó mới thiết kế database/UI cho bản Web.
