

Trong `categories.xlsx`, phần import hiện đúng với bộ cột:

`CODE | NAME | STATUS | ĐVT | giá nhập | giá xuất | có vat hay không | vat`

Còn file báo giá mẫu có cấu trúc chính gồm thông tin công ty, thông tin khách hàng/người báo giá, bảng hàng hóa và phần điều khoản/xác nhận. Bảng chi tiết hiện có các cột: **STT – Hàng hóa đề xuất – Hàng hóa cung cấp – Quy cách/Nhãn hiệu – Đơn vị – KL – Đơn giá – Thành tiền trước thuế – VAT (%) – Tiền thuế – Thành tiền sau thuế – Ghi chú**.

---

# 1. Mở rộng Category thành nguồn giá mặc định

Category hiện tại không còn chỉ là:

```text
Category
- Code
- Name
- Status
```

mà nên thành:

```text
Category
- Code
- Name
- Status

- DefaultUnitId / DefaultUnit
- DefaultPurchasePrice
- DefaultSalePrice

- HasVat
- DefaultVatRate
```

Mình khuyên đặt tên là:

```text
DefaultPurchasePrice
DefaultSalePrice
```

thay vì:

```text
PurchasePrice
SalePrice
```

vì đây **không phải giá mua/bán thực tế hiện tại**.

Nó chỉ là:

> Giá tham chiếu mặc định của Category khi chưa có dữ liệu lịch sử.

Ví dụ:

```text
Category:
Ống kẽm

ĐVT: cây
DefaultPurchasePrice: 100.000
DefaultSalePrice: 135.000
HasVat: true
DefaultVatRate: 8%
```

---

# 2. Giá nhập của Category tuyệt đối không được tác động Inventory

Điểm này cần phân biệt rõ.

Nếu import:

```text
Ống kẽm
Giá nhập = 100.000
```

thì **không được**:

```text
Ledger IN
StockCost = 100.000
```

vì chưa có hoạt động nhập kho nào.

Nó chỉ có ý nghĩa:

```text
ReferencePurchasePrice = 100.000
```

để sale tham khảo khi báo giá.

Giá vốn thực tế vẫn đến từ:

```text
Product
    ↓
Inventory receipt / impNcc
    ↓
Ledger / Lot
```

---

# 3. Rule validation khi import Category

Ví dụ file:

| CODE   | NAME    | ĐVT | giá nhập | giá xuất | có vat hay không | vat |
| ------ | ------- | --- | -------: | -------: | ---------------- | --: |
| ONG001 | Ống kẽm | cây |   100000 |   135000 | TRUE             |   8 |

Rule:

```text
DefaultPurchasePrice >= 0
DefaultSalePrice >= 0
```

Nếu:

```text
HasVat = false
```

thì:

```text
VatRate = 0/null
```

Nếu:

```text
HasVat = true
```

thì:

```text
VatRate bắt buộc
0 < VatRate <= 100
```

Importer nên normalize:

```text
true / TRUE / 1 / có / yes
→ true

false / FALSE / 0 / không / no
→ false
```

Nếu hệ thống có bảng `UnitOfMeasure`, cột `ĐVT` nên map vào master này.

Ví dụ:

```text
cái
kg
cuộn
bộ
viên
```

Nếu không tìm được đơn vị:

> Không nên âm thầm tạo Unit mới.

Import Preview nên báo:

```text
Row 35:
Đơn vị "cayy" không tồn tại.
```

để user sửa hoặc tạo master trước.

---

# 4. Ghép với logic Reference báo giá chúng ta vừa chốt

Đây là chỗ Category Default phát huy tác dụng.

Khi user tạo Quotation và chọn:

```text
Customer = Công ty ABC
Category = Ống kẽm
```

hệ thống lookup theo thứ tự:

```text
ƯU TIÊN 1
Latest Quotation:
Customer + Category

         ↓ không có

ƯU TIÊN 2
Latest Quotation:
Category
bất kể Customer

         ↓ không có

ƯU TIÊN 3
Category Default
```

Hay:

```text
CUSTOMER_CATEGORY_QUOTATION
           ↓
CATEGORY_QUOTATION
           ↓
CATEGORY_DEFAULT
```

Đây chính là fallback hoàn chỉnh.

---

# 5. Ví dụ cụ thể

Category:

```text
Ống kẽm

ĐVT = cây
Giá nhập mặc định = 100.000
Giá xuất mặc định = 135.000
VAT = 8%
```

### Trường hợp A — khách này từng mua

Công ty ABC từng có:

```text
QT-0091

Ống kẽm
Giá bán = 145.000
VAT = 8%
```

Khi tạo báo giá mới cho ABC:

```text
SalePrice = 145.000

Reference:
QT-0091
Cùng khách hàng + danh mục
```

Không dùng `135.000`.

---

### Trường hợp B — khách chưa mua nhưng người khác đã mua

ABC chưa từng mua.

Nhưng XYZ có:

```text
QT-0103

Ống kẽm
Giá bán = 148.000
```

Thì:

```text
SalePrice = 148.000

Reference:
QT-0103
Báo giá gần nhất của danh mục
```

---

### Trường hợp C — Category hoàn toàn mới

Không có bất cứ quotation nào của `Ống kẽm`.

Hệ thống:

```text
ĐVT          = cây
Giá nhập ref = 100.000
Giá bán      = 135.000
VAT          = 8%
```

và UI ghi rõ:

```text
Nguồn tham chiếu:
Giá mặc định của danh mục
```

Đây đúng với mục đích bạn vừa yêu cầu.

---

# 6. Panel Reference bên phải cũng phải thể hiện trường hợp này

Ví dụ:

```text
┌──────────────────────────────────┐
│ THAM CHIẾU BÁO GIÁ               │
│                                  │
│ Ống kẽm                          │
│                                  │
│ Không có báo giá trước đó.        │
│                                  │
│ Đang sử dụng mặc định danh mục   │
│                                  │
│ ĐVT:             cây             │
│ Giá nhập ref:    100.000         │
│ Giá bán ref:     135.000         │
│ VAT:             8%              │
│                                  │
│ [DEFAULT CATEGORY]               │
└──────────────────────────────────┘
```

Nếu có lịch sử:

```text
[REF: QT-0091]
Cùng khách hàng + danh mục
```

hoặc:

```text
[REF: QT-0103]
Báo giá gần nhất của danh mục
```

User nhìn vào là biết **giá này đến từ đâu**.

---

# 7. Nên lưu source của Reference vào QuotationItem

Mình đề xuất:

```text
QuotationItem
-------------------------------

CategoryId

Unit
Quantity

ReferencePurchasePrice
UnitSalePrice

HasVat
VatRate

ReferenceType
ReferenceQuotationItemId

Note
```

`ReferenceType`:

```text
CUSTOMER_CATEGORY_QUOTATION
CATEGORY_QUOTATION
CATEGORY_DEFAULT
MANUAL
```

Ví dụ:

```text
ReferenceType = CATEGORY_DEFAULT
```

Sau đó user sửa:

```text
135.000 → 140.000
```

thì actual sale price:

```text
UnitSalePrice = 140.000
```

nhưng vẫn có thể biết:

```text
ReferenceSalePrice = 135.000
ReferenceType = CATEGORY_DEFAULT
PriceOverridden = true
```

Rất tốt cho audit sau này.

---

# 8. Giá nhập và giá bán Reference nên snapshot

Ví dụ category hiện tại:

```text
DefaultPurchasePrice = 100k
DefaultSalePrice = 135k
```

QT001 được tạo.

Ba tháng sau admin sửa Category:

```text
110k
150k
```

QT001 **không được thay đổi theo**.

Vì vậy khi tạo line:

```text
referencePurchasePriceSnapshot = 100000
referenceSalePriceSnapshot = 135000
vatRateSnapshot = 8
unitSnapshot = "cây"
```

---

# 9. Thêm Ghi chú riêng cho từng Category trong báo giá

Template bạn gửi đã có cột:

> **Ghi chú**

nên requirement này rất phù hợp.

Hiện mỗi:

```text
QuotationItem
```

thêm:

```text
Note
```

Ví dụ:

```text
Ống kẽm       12 cây
145.000
Ghi chú: Hàng mạ kẽm nhúng nóng
```

Một Category khác:

```text
Bulong        100 cái
5.000
Ghi chú: Yêu cầu đủ CO/CQ
```

Ghi chú này thuộc **QuotationItem**, không thuộc Category.

Vì cùng Category nhưng từng khách/deal có thể khác nhau.

---

# 10. Không nên tự copy ghi chú của báo giá trước

Ví dụ QT cũ:

```text
Ống kẽm

Note:
Giao riêng vào sáng thứ 2.
```

QT mới không nên tự động có note đó.

Reference panel có thể hiển thị:

```text
Ghi chú báo giá trước:
"Giao riêng vào sáng thứ 2"
```

nhưng:

```text
CurrentQuotationItem.Note = blank
```

User chủ động copy nếu cần.

Điều này tránh mang nhầm yêu cầu cũ sang khách mới.

---

# 11. Mapping báo giá hiện tại với template bạn gửi

Template thực tế của bạn có:

```text
BẢNG BÁO GIÁ KIÊM XÁC NHẬN ĐẶT HÀNG
```

Phần header nên được map thành:

### Customer

```text
Khách hàng
Địa chỉ
Số điện thoại
Email
Dự án
```

### Quotation

```text
Nhân viên báo giá
Số điện thoại nhân viên
Báo giá số
Ngày
```

---

# 12. Mapping bảng hàng hóa

Template:

| Template              | Hệ thống           |
| --------------------- | ------------------ |
| STT                   | index              |
| Hàng hóa đề xuất      | Category           |
| Hàng hóa cung cấp     | OfferedDescription |
| Quy cách/Nhãn hiệu    | SpecificationBrand |
| Đơn vị                | Unit snapshot      |
| KL                    | Quantity           |
| Đơn giá               | UnitSalePrice      |
| Thành tiền trước thuế | Subtotal           |
| VAT (%)               | VatRate            |
| Tiền Thuế             | VatAmount          |
| Thành tiền sau thuế   | Total              |
| Ghi chú               | QuotationItem.Note |

Công thức:

```text
Subtotal
= Quantity × UnitSalePrice
```

```text
VatAmount
= HasVat
  ? Subtotal × VatRate / 100
  : 0
```

```text
Total
= Subtotal + VatAmount
```

---

# 13. "Hàng hóa đề xuất" và "Hàng hóa cung cấp" cần tách

Đây là điểm rất phù hợp với nghiệp vụ mới của bạn.

Ví dụ:

```text
Category:
Ống kẽm
```

thì:

### Hàng hóa đề xuất

```text
Ống kẽm
```

Đây là thứ khách yêu cầu.

Còn:

### Hàng hóa cung cấp

có thể là:

```text
Ống kẽm mạ kẽm tiêu chuẩn ...
```

hoặc để trống/chính Category nếu ở thời điểm báo giá chưa xác định Product.

Mình khuyên thêm vào line:

```text
OfferedDescription
```

Default:

```text
Category.Name
```

nhưng user được sửa.

---

# 14. "Quy cách / Nhãn hiệu"

Nên thêm:

```text
SpecificationBrand
```

vào QuotationItem.

Ví dụ:

```text
Hàng hóa đề xuất:
Ống kẽm

Hàng hóa cung cấp:
Ống kẽm mạ kẽm

Quy cách/Nhãn hiệu:
Hòa Phát / D76 / tiêu chuẩn ...
```

Nếu chưa biết Product cụ thể:

```text
SpecificationBrand = null
```

hoặc nhập mô tả chung.

Không nên ép nó thành Product vì Product thực tế chỉ được xác định ở bước Convert.

---

# 15. Có thể bổ sung default Specification vào Category sau này

Nếu muốn tối ưu nhập liệu thêm:

```text
Category
    DefaultUnit
    DefaultPurchasePrice
    DefaultSalePrice
    DefaultVat
    DefaultSpecification
```

Nhưng `DefaultSpecification` chưa bắt buộc trong scope hiện tại.

---

# 16. Preview trước khi Export

Yêu cầu này mình đánh giá **rất nên làm**.

Hiện tại:

```text
Click "Xuất báo giá"
        ↓
Download file
```

nên đổi thành:

```text
Click "Xuất báo giá"
        ↓
Generate Preview
        ↓
Hiện Preview
        ↓
User kiểm tra
        ↓
Chọn định dạng
        ↓
Export
```

---

# 17. UX đề xuất

Click:

> **Xuất báo giá**

Mở full modal/page:

```text
┌─────────────────────────────────────────────┐
│ PREVIEW BÁO GIÁ                            │
│                                             │
│ Template: H2T Standard                     │
│                                             │
│ ┌───────────────────────────────────────┐   │
│ │                                       │   │
│ │        preview báo giá thực tế        │   │
│ │                                       │   │
│ │            Page 1 / 2                 │   │
│ │                                       │   │
│ └───────────────────────────────────────┘   │
│                                             │
│ Định dạng:                                  │
│                                             │
│ ○ PDF                                       │
│ ○ Excel                                     │
│                                             │
│ [Quay lại]                [Xuất file]       │
└─────────────────────────────────────────────┘
```

Phase đầu mình khuyên:

```text
PDF
XLSX
```

là đủ.

DOCX có thể bổ sung sau nếu thực sự cần.

---

# 18. Preview và Export phải dùng cùng Render Model

Không được làm:

```text
Preview = React tự render
Export = backend tự tính lại
```

vì rất dễ:

```text
Preview nhìn một kiểu
File download ra một kiểu
```

Nên:

```text
Quotation
     ↓
QuotationExportModel
     ↓
┌──────────────┬──────────────┐
│ Preview      │ File Export  │
└──────────────┴──────────────┘
```

Cùng một data model.

Ví dụ:

```json
{
  "company": {},
  "customer": {},
  "quotation": {},
  "items": [],
  "terms": {},
  "totals": {}
}
```

---

# 19. Chống trường hợp sửa báo giá trong lúc Preview

Ví dụ:

```text
10:00 Preview QT001
```

Sau đó tab khác sửa:

```text
145k → 150k
```

nhưng user vẫn download preview cũ.

Nên preview response có:

```text
quotationVersion
```

Ví dụ:

```text
version = 7
```

Export:

```json
{
  "quotationId": "...",
  "quotationVersion": 7,
  "templateVersionId": "...",
  "format": "PDF"
}
```

Nếu hiện tại version đã là 8:

```text
Báo giá đã thay đổi.
Vui lòng refresh Preview trước khi xuất.
```

---

# 20. Master Company lấy từ template

Trong file bạn gửi, mình đọc được phần company master:

```text
CÔNG TY CỔ PHẦN ĐẦU TƯ SẢN XUẤT
VÀ THƯƠNG MẠI H2T
```

English name:

```text
H2T INVESTMENT PRODUCTION
AND TRADING JOINT STOCK COMPANY
```

Địa chỉ:

```text
Thôn Kim Hoàng,
Xã Vân Canh,
Huyện Hoài Đức,
Thành phố Hà Nội,
Việt Nam
```

Email:

```text
h2t.jsc3@gmail.com
```

Template cũng đang có:

```text
Tên tài khoản:
CÔNG TY CPĐT SẢN XUẤT VÀ THƯƠNG MẠI H2T
```

và:

```text
Số TK: 91599
Ngân hàng Techcombank
Chi nhánh Hà Tây
```

Theo đúng nội dung đang nằm trong file.

---

# 21. Nhưng không được đưa tất cả dữ liệu trong template vào CompanyMaster

Ví dụ template có:

```text
Ms. Hạnh
Mường Hoa Sapa
```

đây là:

```text
Customer / Project
```

không phải company master.

Template còn có:

```text
Mr. Dương KD
0984 651 290
```

đây nên là:

```text
Quotation salesperson
```

lấy từ:

```text
Current User / Employee profile
```

không phải hard-code Company.

---

# 22. Company Master nên thiết kế lại

Mình đề xuất:

```text
CompanyProfile
-------------------------------

CompanyName
CompanyEnglishName

Address
Email
Phone
Website

TaxCode

BankAccountName
BankAccountNumber
BankName
BankBranch

Logo
```

Ngoài ra có:

```text
QuotationSettings
-------------------------------

QuotationTitle

DefaultPaymentTerm
DefaultDeliveryTerm
DefaultValidityDays

DefaultIncludeShipping
DefaultNotes
```

---

# 23. Các điều khoản lấy từ template

Template hiện tại có những default:

```text
Báo giá đã bao gồm chi phí vận chuyển
```

```text
Thanh toán 100% trước khi giao hàng
```

```text
Thanh toán tiền mặt hoặc chuyển khoản
```

```text
Nhận hàng từ 05–07 ngày
kể từ khi thanh toán
```

```text
Báo giá có hiệu lực trong vòng 07 ngày
```

Đây không phải company identity.

Nó nên nằm:

```text
QuotationSettings
```

và khi tạo báo giá thì snapshot:

```text
Quotation.PaymentTerms
Quotation.DeliveryTerms
Quotation.ValidUntil
Quotation.FooterNotes
```

User có thể chỉnh riêng từng quotation.

---

# 24. Không nên đọc master trực tiếp từ Excel mỗi lần export

Sai kiến trúc:

```text
Export
 ↓
đọc file template
 ↓
lấy tên công ty/email/bank
```

Đúng:

```text
Template
→ dùng lần đầu để migrate/config master

CompanyProfile DB
         ↓
QuotationExportModel
         ↓
Template
```

Template chỉ chịu trách nhiệm **layout**.

Database mới là source of truth.

---

# 25. Luồng báo giá hoàn chỉnh sau thay đổi

Luồng giờ sẽ thành:

```text
Chọn Customer
       +
Chọn Category
       │
       ▼
Reference Resolver
       │
       ├─ Customer + Category quote
       │
       ├─ Category quote
       │
       └─ Category Default
       │
       ▼
Fill:
- Unit
- Reference Purchase Price
- Sale Price
- VAT
       │
       ▼
User nhập:
- Quantity
- Offered Description
- Specification/Brand
- Note
       │
       ▼
Save Quotation
       │
       ▼
Export
       │
       ▼
Preview
       │
       ▼
PDF / Excel
```

---

# 26. Chức năng Admin upload template: hoàn toàn khả thi

Nhưng mình **không khuyên cho Admin upload bất kỳ Excel nào rồi hệ thống cố hiểu nó**.

Ví dụ Admin tự upload:

```text
my_template.xlsx
```

với:

```text
merge tùy ý
đổi header tùy ý
thêm formula tùy ý
đổi sheet tùy ý
```

thì hệ thống sẽ nhanh chóng rất khó maintain.

---

# 27. Nên dùng "Controlled Template"

Admin được tải file:

> **Quotation Template Standard.xlsx**

về.

File này có những placeholder hệ thống định nghĩa sẵn.

Ví dụ:

```text
{{company.name}}
{{company.address}}

{{customer.name}}
{{customer.address}}

{{quotation.number}}
{{quotation.date}}
```

và một vùng:

```text
{{items}}
```

---

# 28. Tốt hơn nữa: dùng Named Range / Excel Table

Thay vì tìm chuỗi:

```text
{{customer.name}}
```

khắp Excel, mình khuyên sử dụng **Named Range**.

Ví dụ:

```text
COMPANY_NAME
COMPANY_ADDRESS
COMPANY_EMAIL

CUSTOMER_NAME
CUSTOMER_ADDRESS
CUSTOMER_PHONE

QUOTATION_NUMBER
QUOTATION_DATE
```

Table:

```text
QUOTATION_ITEMS
```

có các column system hỗ trợ:

```text
INDEX
PROPOSED_GOODS
OFFERED_GOODS
SPECIFICATION
UNIT
QUANTITY
UNIT_PRICE
SUBTOTAL
VAT_RATE
VAT_AMOUNT
TOTAL
NOTE
```

Admin được:

```text
đổi font
đổi màu
đổi logo
đổi width
đổi height
đổi label
merge các vùng cho phép
```

nhưng không được phá:

```text
Named ranges
QuotationItems table
```

---

# 29. Quy chuẩn template

Một template hợp lệ phải có ít nhất:

```text
COMPANY_NAME
CUSTOMER_NAME
QUOTATION_NUMBER
QUOTATION_DATE

QUOTATION_ITEMS

TOTAL_BEFORE_TAX
VAT_TOTAL
GRAND_TOTAL
```

Nếu Admin upload thiếu:

```text
QUOTATION_ITEMS
```

hệ thống báo:

> Template không hợp lệ: không tìm thấy vùng bảng hàng hóa.

Không được Activate.

---

# 30. Quy trình Admin upload

Mình đề xuất:

```text
Admin
 ↓
Template báo giá
 ↓
[Upload Template]
 ↓
Validate
 ↓
Render bằng Sample Data
 ↓
Preview
 ↓
Admin xác nhận
 ↓
Activate
```

Status:

```text
DRAFT
VALIDATED
ACTIVE
ARCHIVED
```

---

# 31. Template cần versioning

Ví dụ:

```text
H2T Standard
v1
```

sau này admin upload:

```text
v2
```

Quotation cũ có thể biết:

```text
Exported with template v1
```

Báo giá mới:

```text
template v2
```

Có thể rollback:

```text
v2 → v1
```

nếu template mới lỗi.

---

# 32. Không cho upload `.xls`

File bạn vừa gửi là:

```text
.xls
```

legacy Excel format.

Trong chức năng Admin Template mình khuyên chỉ hỗ trợ:

```text
.xlsx
```

Không hỗ trợ:

```text
.xls
.xlsm
```

Lý do:

* `.xls` là format binary cũ;
* parse/validate phức tạp hơn;
* giới hạn công cụ;
* khó kiểm soát các object cũ;
* `.xlsm` có macro, tăng rủi ro bảo mật.

File hiện tại nên được migrate thành:

```text
H2T_Quotation_Standard.xlsx
```

rồi sử dụng làm template hệ thống đầu tiên.

---

# 33. Security cho template upload

Backend cần validate:

```text
Admin only

.xlsx only

Max file size

No macros
No external data connection
No external workbook links
No executable/OLE embedded object
```

và validate schema.

Không được chỉ kiểm tra extension.

---

# 34. Admin có thể tùy chỉnh gì?

Mình đề xuất mức tự do sau:

**Cho phép:**

* Logo
* Font
* màu sắc
* border
* kích thước dòng/cột
* label tiếng Việt/Anh
* nội dung footer mặc định
* vị trí các block trong vùng cho phép
* bật/tắt một số optional column
* thứ tự optional column

**Không cho phép:**

* thêm field hệ thống không tồn tại;
* viết query;
* tự map DB;
* tự tạo công thức business;
* chạy macro;
* dùng external data source.

Đúng với yêu cầu của bạn:

> Admin custom template nhưng không phải tự xây template engine.

---

# 35. Template engine nên có danh sách field cho Admin chọn

Ví dụ màn Admin:

```text
Các field hỗ trợ:

Company
✓ Company Name
✓ Address
✓ Email
✓ Phone
✓ Bank Account

Customer
✓ Name
✓ Address
✓ Phone
✓ Email

Quotation
✓ Number
✓ Date
✓ Salesperson
✓ Project

Item
✓ Category
✓ Offered Goods
✓ Specification
✓ Unit
✓ Quantity
✓ Unit Price
✓ VAT
✓ Note
```

Không có field ngoài danh sách này.

---

# 36. Preview khi Admin upload cũng dùng chung engine

Kiến trúc đẹp nhất là:

```text
                   QuotationRenderModel
                           │
             ┌─────────────┴────────────┐
             │                          │
       Customer Export             Admin Preview
             │                          │
       Template Active            Template Draft
```

Như vậy không có hai renderer.

---

# 37. Data model tổng hợp mình đề xuất

### Category

```text
Category
-------------------------
Id
Code
Name
Status

DefaultUnitId

DefaultPurchasePrice
DefaultSalePrice

HasVat
DefaultVatRate
```

### QuotationItem

```text
QuotationItem
-------------------------
Id
QuotationId
CategoryId

CategoryNameSnapshot

OfferedDescription
SpecificationBrand

UnitSnapshot
Quantity

ReferencePurchasePrice
ReferenceSalePrice

UnitSalePrice

HasVat
VatRate

Subtotal
VatAmount
Total

Note

ReferenceType
ReferenceQuotationItemId
PriceOverridden
```

### CompanyProfile

```text
CompanyProfile
-------------------------
CompanyName
CompanyEnglishName

Address
Email
Phone
Website
TaxCode

Logo

BankAccountName
BankAccountNumber
BankName
BankBranch
```

### QuotationSettings

```text
QuotationSettings
-------------------------
DefaultTitle

DefaultPaymentTerms
DefaultDeliveryTerms
DefaultValidityDays

DefaultIncludeShipping

DefaultFooterNotes
```

### QuotationTemplate

```text
QuotationTemplate
-------------------------
Id
Name
Version

FilePath

Status

CreatedBy
CreatedAt

ValidatedAt
ActivatedAt
```

---

# 38. API cần bổ sung

Category import vẫn dùng flow preview/execute, nhưng map thêm các field mới.

Reference:

```http
GET /api/quotation-reference
?categoryId=...
&customerId=...
```

Preview:

```http
POST /api/quotations/{id}/preview
```

Có thể truyền:

```json
{
  "templateId": "..."
}
```

Export:

```http
POST /api/quotations/{id}/export
```

```json
{
  "templateId": "...",
  "quotationVersion": 7,
  "format": "PDF"
}
```

Template Admin:

```text
GET    /api/quotation-templates
POST   /api/quotation-templates
POST   /api/quotation-templates/{id}/validate
GET    /api/quotation-templates/{id}/preview
POST   /api/quotation-templates/{id}/activate
DELETE /api/quotation-templates/{id}
```

---

## Chốt lại priority dữ liệu

Đây là phần quan trọng nhất của toàn bộ thay đổi:

```text
Khi thêm Category vào Quotation

          ↓

Có báo giá cùng
Customer + Category?
          │
         YES
          ↓
Dùng báo giá đó làm Ref

         NO
          ↓

Có báo giá nào khác
của Category?
          │
         YES
          ↓
Dùng báo giá gần nhất làm Ref

         NO
          ↓

Dùng Category Default:
- Unit
- Purchase Price
- Sale Price
- VAT
```

Sau đó user vẫn có quyền sửa.

Và toàn bộ source đều được lưu để về sau biết:

> **Tại sao tại thời điểm đó hệ thống gợi ý mức giá này?**

Về phần **Admin tự upload template**, mình đánh giá **khả thi cao và rất đáng làm**, nhưng nên triển khai dưới dạng **template có schema cố định + Named Range/Table + validator + preview + versioning**, tuyệt đối không làm kiểu “upload Excel tùy ý rồi hệ thống tự đoán”. Cách đó vừa đáp ứng khả năng tùy biến, vừa giữ được code ổn định khi nghiệp vụ báo giá tiếp tục mở rộng.
