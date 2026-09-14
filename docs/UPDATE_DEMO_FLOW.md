Yêu cầu này nên được làm thành một **module Demo/Scenario riêng**, không nên chỉ “seed vài record”. Nếu thiết kế đúng, nó vừa giúp bạn test toàn bộ hệ thống, vừa giúp demo cho khách/BA/FE mà không làm bẩn dữ liệu thật.

## 1. Phần 1 — Sửa API dữ liệu cho các dropdown

Hiện tượng hiện tại:

```text
Tạo báo giá
  ├─ Kho              → không có data
  ├─ Danh mục         → không có data
  ├─ Khách hàng       → không có data
  ├─ Nhà cung cấp     → không có data
  └─ ...
```

Cần phân biệt rõ hai trường hợp:

```text
API lỗi / query sai / auth sai
```

và:

```text
API chạy đúng nhưng database thực sự chưa có dữ liệu
```

Không nên xử lý bằng cách hard-code dropdown ở FE.

### Kiến trúc API đề xuất

Thay vì lấy toàn bộ object bằng các API CRUD hiện tại, nên có nhóm API `lookup` chuyên phục vụ dropdown:

| Dropdown     | API                           |
| ------------ | ----------------------------- |
| Kho          | `GET /api/lookups/warehouses` |
| Danh mục     | `GET /api/lookups/categories` |
| Khách hàng   | `GET /api/lookups/customers`  |
| Nhà cung cấp | `GET /api/lookups/suppliers`  |
| Sản phẩm     | `GET /api/lookups/products`   |
| Đơn vị tính  | `GET /api/lookups/units`      |

Response thống nhất:

```json
{
  "items": [
    {
      "id": "uuid",
      "code": "KHO_HN",
      "label": "Kho Hà Nội"
    }
  ]
}
```

Không nên trả cả object kiểu:

```json
{
  "address": "...",
  "createdAt": "...",
  "updatedAt": "...",
  "deletedAt": "...",
  "createdBy": "...",
  ...
}
```

vì dropdown không cần.

---

# 2. Lookup cần hỗ trợ search

Ví dụ:

```http
GET /api/lookups/categories?search=ống
```

Response:

```json
{
  "items": [
    {
      "id": "cat-01",
      "code": "ONG_KEM",
      "label": "Ống kẽm"
    }
  ]
}
```

Có thể hỗ trợ:

```text
search
limit
offset
isActive
```

Ví dụ:

```http
GET /api/lookups/customers?search=minh&limit=20
```

FE không cần load 10.000 customer vào dropdown.

---

# 3. Dropdown Product phải phụ thuộc Category

Với nghiệp vụ chúng ta vừa phân tích:

```text
Category
   ↓
Products thuộc Category
```

API:

```http
GET /api/lookups/products?categoryId={categoryId}
```

Ví dụ:

```json
{
  "items": [
    {
      "id": "p01",
      "label": "Ống kẽm Hòa Phát v2026",
      "categoryId": "cat01"
    },
    {
      "id": "p02",
      "label": "Ống kẽm Tân Việt",
      "categoryId": "cat01"
    }
  ]
}
```

Trong màn Convert, Product cần thêm thông tin stock:

```http
GET /api/lookups/products
    ?categoryId=cat01
    &warehouseId=wh01
    &includeStock=true
```

Response:

```json
{
  "items": [
    {
      "id": "p01",
      "label": "Ống kẽm Hòa Phát v2026",
      "onHand": 6,
      "reserved": 2,
      "available": 4
    }
  ]
}
```

Phải dùng:

```text
available = onHand - reserved
```

chứ không lấy trực tiếp tồn vật lý.

---

# 4. Các lookup phải có cùng rule security

Ví dụ user thuộc:

```text
organization A
```

thì API:

```http
GET /api/lookups/warehouses
```

không được trả Warehouse của organization B.

Query conceptually:

```sql
WHERE organization_id = current_user.organization_id
AND is_active = true
AND deleted_at IS NULL
```

Đây là lỗi rất hay xảy ra khi CRUD API có tenant filter nhưng API dropdown mới lại quên filter.

---

# 5. UX khi DB chưa có dữ liệu

Nếu API trả:

```json
{
  "items": []
}
```

FE không được hiện dropdown trắng mà không giải thích.

Nên hiện:

```text
Chưa có danh mục sản phẩm.

[ + Tạo danh mục ]
```

hoặc:

```text
Không có kho khả dụng.
```

Điều này rất hữu ích trong hệ thống mới hoàn toàn.

---

# 6. Tab mới: Demo full luồng hệ thống

Mình đề xuất thêm một tab:

> **System Demo**

hoặc tiếng Việt:

> **Demo nghiệp vụ**

Ví dụ menu:

```text
Dashboard
Sản phẩm
Kho
Nhà cung cấp
Khách hàng
Báo giá
────────────────
Demo nghiệp vụ
```

Tab chỉ xuất hiện khi:

```text
user.isAuthenticated == true
```

Nhưng phía BE **vẫn phải kiểm tra auth**.

Không được chỉ:

```jsx
{isLoggedIn && <DemoTab />}
```

rồi API không bảo vệ.

Endpoint phải có:

```text
[Authorize]
```

hoặc middleware tương đương.

---

# 7. Cơ chế ẩn tab Demo

User muốn:

> có thể ẩn đi khi không muốn sử dụng nữa.

Nên có hai lớp.

### Feature flag toàn hệ thống

Ví dụ:

```env
DEMO_FEATURE_ENABLED=true
```

Backend/frontend config:

```json
{
  "features": {
    "demo": true
  }
}
```

Nếu:

```text
DEMO_FEATURE_ENABLED=false
```

thì tab biến mất hoàn toàn.

### Ẩn riêng với user

Trong tab:

```text
[ Ẩn tab Demo ]
```

Có thể lưu:

```text
localStorage
```

hoặc user preferences.

Ví dụ:

```text
demoFeatureHidden=true
```

Sau này user có thể bật lại ở:

```text
Cài đặt
→ Tính năng
→ Hiển thị Demo nghiệp vụ
```

Mình khuyên dùng cả hai:

```text
Feature flag
        +
User preference
```

---

# 8. Demo không nên đơn giản chỉ là "Seed data"

Nên xây dựng:

```text
Demo Scenario Engine
```

Concept:

```text
User
 ↓
Demo tab
 ↓
Chọn scenario
 ↓
POST /api/demo/scenarios/{scenario}
 ↓
DemoScenarioService
 ↓
Domain/Application Services thật
 ↓
Database
```

Điểm quan trọng:

> Demo nên đi qua các business service của hệ thống càng nhiều càng tốt.

Không nên làm:

```sql
INSERT INTO quotation ...
INSERT INTO ledger ...
UPDATE stock ...
```

bỏ qua toàn bộ business logic.

Nếu làm vậy thì Demo chạy được nhưng **không chứng minh flow hệ thống thật hoạt động**.

---

# 9. Thiết kế màn Demo

Màn hình:

```text
DEMO NGHIỆP VỤ

Các scenario này tạo dữ liệu demo để kiểm tra
toàn bộ chức năng hệ thống.

───────────────────────────────────────

Master Data
Tạo Kho, Category, Supplier, Customer,
Product và tồn kho cơ bản.

                  [ Tạo demo ]

───────────────────────────────────────

Báo giá cơ bản
Tạo Category → Product → Customer →
Quotation.

                  [ Chạy flow ]

───────────────────────────────────────

Báo giá → lấy tồn kho
Tạo báo giá và Convert hoàn toàn bằng
hàng có sẵn trong kho.

                  [ Chạy flow ]

───────────────────────────────────────

Báo giá → nhập hàng mới
Không đủ tồn kho → nhập thêm →
Convert → Chờ giao hàng.

                  [ Chạy flow ]

───────────────────────────────────────

Báo giá → tồn kho + nhập mới
Một phần lấy tồn kho, một phần nhập mới.

                  [ Chạy flow ]

───────────────────────────────────────

Full E2E
Customer → Quotation → Accept →
Convert → Import → Reserve →
Delivery → Ledger OUT → Delivered.

                  [ Chạy full flow ]

───────────────────────────────────────

                     [ XÓA DỮ LIỆU DEMO ]
```

---

# 10. Các scenario nên có

Mình đề xuất ít nhất những scenario sau:

| Scenario                 | Mục đích                 |
| ------------------------ | ------------------------ |
| `MASTER_DATA`            | tạo dữ liệu nền          |
| `QUOTATION_DRAFT`        | test lập báo giá         |
| `QUOTATION_ACCEPTED`     | test báo giá accepted    |
| `CONVERT_STOCK_ONLY`     | convert hoàn toàn từ tồn |
| `CONVERT_NEW_STOCK_ONLY` | toàn bộ nhập mới         |
| `CONVERT_MIXED`          | vừa tồn vừa nhập         |
| `AWAITING_DELIVERY`      | dừng tại Chờ giao hàng   |
| `DELIVERED`              | full delivery            |
| `FULL_E2E`               | chạy toàn bộ nghiệp vụ   |

---

# 11. Tại sao cần các scenario "dừng giữa chừng"

Nếu chỉ có:

```text
Run Full Demo
```

và cuối cùng mọi quotation đều thành:

```text
Đã giao hàng
```

thì bạn lại không test được màn:

```text
Draft
Accepted
Converted
Chờ giao hàng
```

Do đó nên có cả:

```text
Quotation Draft Demo
Quotation Accepted Demo
Awaiting Delivery Demo
Delivered Demo
```

Để sau khi chạy Demo có data ở tất cả trạng thái.

---

# 12. Ví dụ FULL_E2E

Khi user click:

> `Chạy full flow`

BE có thể tạo scenario:

```text
Customer:
Công ty Demo ABC

Warehouse:
Kho Demo Hà Nội

Category:
Ống kẽm Demo

Supplier:
Hòa Phát Demo
Tân Việt Demo

Products:
Ống kẽm Hòa Phát Demo
Ống kẽm Tân Việt Demo
```

Stock ban đầu:

```text
Hòa Phát: 6
Tân Việt: 10
```

Tạo Quotation:

```text
QT-DEMO-20260911-001

Customer:
Công ty Demo ABC

Ống kẽm
Quantity: 12
Price: 150.000
```

Flow:

```text
DRAFT
 ↓
ACCEPTED
 ↓
CONVERT
```

Allocation:

```text
Hòa Phát stock     4
Tân Việt stock     3
Tân Việt import    5
────────────────────
                  12
```

Ledger:

```text
Tân Việt
IN +5
```

Reservation:

```text
Hòa Phát 4
Tân Việt 8
```

Quotation:

```text
AWAITING_DELIVERY
```

Sau đó Demo có thể chạy tiếp:

```text
Delivery
```

Ledger:

```text
Hòa Phát OUT -4
Tân Việt OUT -8
```

Release reservation.

Cuối cùng:

```text
DELIVERED
```

---

# 13. `source = dataDemo`

Yêu cầu này nên áp dụng cho **tất cả record được tạo bởi Demo**.

Ví dụ:

```text
categories.source
products.source
suppliers.source
customers.source
warehouses.source
quotations.source
quotation_items.source
quotation_allocations.source
inventory_ledger.source
inventory_reservations.source
...
```

Value:

```text
dataDemo
```

Data thường:

```text
user
```

hoặc:

```text
manual
import
system
dataDemo
```

Mình khuyên dùng enum:

```text
MANUAL
IMPORT
SYSTEM
DATA_DEMO
```

Nếu DB hiện tại muốn giữ đúng requirement:

```text
dataDemo
```

thì vẫn được.

---

# 14. Nhưng chỉ `source = dataDemo` là chưa đủ

Đây là điểm mình khuyên nên bổ sung.

Giả sử Minh bấm:

```text
Full Demo
```

3 lần.

Database có:

```text
300 record source=dataDemo
```

Khi debug rất khó biết record nào thuộc lần chạy nào.

Nên thêm:

```text
demo_run_id
```

Ví dụ:

```text
source = dataDemo
demo_run_id = 2ef47a...
```

Lần chạy sau:

```text
source = dataDemo
demo_run_id = 7ab253...
```

---

# 15. Thêm bảng `demo_runs`

Ví dụ:

```sql
demo_runs
---------
id
scenario
status
created_by
created_at
finished_at
error_message
```

Ví dụ:

```text
id:
DR-001

scenario:
FULL_E2E

status:
SUCCESS

created_by:
user-123
```

Các record demo:

```text
source = dataDemo
demo_run_id = DR-001
```

---

# 16. API Demo đề xuất

```http
GET /api/demo/scenarios
```

Response:

```json
{
  "items": [
    {
      "code": "MASTER_DATA",
      "name": "Master Data",
      "description": "Tạo dữ liệu nền"
    },
    {
      "code": "FULL_E2E",
      "name": "Full E2E",
      "description": "Chạy toàn bộ flow bán hàng"
    }
  ]
}
```

Chạy scenario:

```http
POST /api/demo/scenarios/FULL_E2E/run
```

Response:

```json
{
  "demoRunId": "DR-001",
  "status": "SUCCESS",
  "created": {
    "warehouses": 1,
    "categories": 1,
    "suppliers": 2,
    "products": 2,
    "customers": 1,
    "quotations": 1,
    "ledgerEntries": 4
  }
}
```

---

# 17. Không nên cho FE gửi trực tiếp data demo

Không nên:

```http
POST /demo/run
```

body:

```json
{
  "warehouse": {...},
  "product": {...},
  "stock": 999
}
```

Vì FE có thể vô tình tạo dữ liệu không hợp lệ.

Nên FE chỉ gửi:

```json
{
  "scenario": "FULL_E2E"
}
```

BE quyết định toàn bộ scenario.

---

# 18. Demo phải dùng transaction

Ví dụ Full flow tạo:

```text
Warehouse
Category
Supplier
Product
Customer
Quotation
Ledger
Reservation
Allocation
```

Nếu Product tạo lỗi giữa chừng mà Customer/Kho đã được lưu thì Demo sẽ để database trong trạng thái nửa vời.

Vì vậy:

```text
Begin Transaction

Create Warehouse
Create Category
Create Supplier
Create Customer
Create Product
Create stock
Create quotation
Accept
Convert
...

Commit
```

Nếu fail:

```text
Rollback
```

và:

```text
demo_run.status = FAILED
```

Có một nuance: nếu muốn lưu `demo_run FAILED` để debug, record `demo_run` nên được ghi ngoài transaction chính hoặc update sau rollback.

---

# 19. Nên chạy business service thật

Ví dụ không nên:

```csharp
quotation.Status = "Delivered";
_db.SaveChanges();
```

Demo service nên gọi:

```text
CreateQuotationCommand
AcceptQuotationCommand
ConvertQuotationCommand
DeliverQuotationCommand
```

Tức là:

```text
DemoScenarioService
        ↓
CreateCustomer
CreateProduct
AddStock
CreateQuotation
AcceptQuotation
ConvertQuotation
DeliverQuotation
```

Điều đó giúp Demo trở thành một dạng:

> **integration/business smoke test trực tiếp trên hệ thống**

---

# 20. Ví dụ structure BE

Nếu đang theo Clean Architecture/CQRS thì rất hợp với kiến trúc:

```text
Application
 └── Demo
      ├── Commands
      │    ├── RunDemoScenario
      │    └── DeleteDemoData
      │
      ├── Queries
      │    └── GetDemoScenarios
      │
      └── Services
           └── DemoScenarioService
```

Trong:

```text
DemoScenarioService
```

có:

```text
RunMasterData()
RunQuotationDraft()
RunConvertStockOnly()
RunConvertNewStock()
RunConvertMixed()
RunAwaitingDelivery()
RunFullE2E()
```

Nhưng có thể tái sử dụng builder chung để tránh duplicate code.

---

# 21. Dùng `DemoContext`

Một cách rất sạch là:

```csharp
DemoContext
{
    DemoRunId
    Source = "dataDemo"
    CurrentUserId
}
```

Mọi command được gọi trong Demo sẽ nhận context này.

Khi tạo Entity:

```text
entity.Source = DemoContext.Source
entity.DemoRunId = DemoContext.DemoRunId
```

Như vậy không cần hard-code:

```text
"dataDemo"
```

ở 30 chỗ khác nhau.

---

# 22. Xóa dữ liệu Demo

Button:

> **Xóa dữ liệu demo**

Không nên đơn giản:

```sql
DELETE FROM products WHERE source='dataDemo'
```

vì sẽ bị FK.

Quan hệ có thể là:

```text
Warehouse
  ↓
Inventory

Category
  ↓
Product
     ↓
Ledger

Customer
   ↓
Quotation
      ↓
QuotationItem
          ↓
QuotationAllocation
                ↓
Reservation
```

Phải xóa từ con lên cha.

---

# 23. Thứ tự cleanup đề xuất

Concept:

```text
Delivery / transaction detail
        ↓
Inventory reservations
        ↓
Quotation allocations
        ↓
Quotation items
        ↓
Quotation audit/history
        ↓
Quotations
        ↓
Inventory ledger
        ↓
ProductSupplier
        ↓
Products
        ↓
Categories
        ↓
Suppliers
        ↓
Customers
        ↓
Warehouses
        ↓
demo_runs
```

Tùy schema thật sẽ điều chỉnh.

Toàn bộ cleanup cũng phải:

```text
BEGIN TRANSACTION
...
COMMIT
```

Fail:

```text
ROLLBACK
```

Không để xóa nửa Demo.

---

# 24. API xóa Demo

Có thể:

```http
DELETE /api/demo/data
```

hoặc rõ hơn:

```http
POST /api/demo/cleanup
```

Mình thích:

```http
DELETE /api/demo/data
```

Response:

```json
{
  "success": true,
  "deleted": {
    "quotations": 12,
    "quotationItems": 18,
    "products": 8,
    "categories": 4,
    "ledgerEntries": 35
  }
}
```

---

# 25. Xác nhận trước khi xóa

FE phải popup:

```text
XÓA DỮ LIỆU DEMO

Toàn bộ dữ liệu có source = "dataDemo"
sẽ bị xóa.

Dữ liệu thật sẽ không bị ảnh hưởng.

Bạn có chắc chắn muốn tiếp tục?

[Hủy]      [Xóa dữ liệu demo]
```

Backend vẫn không được tin FE.

Query phải luôn bao gồm:

```text
WHERE source = 'dataDemo'
```

và nếu cleanup một run:

```text
AND demo_run_id = @demoRunId
```

---

# 26. Có thể thêm xóa theo từng lần Demo

Ngoài:

```text
Xóa tất cả dữ liệu Demo
```

nên hỗ trợ:

```text
Xóa run này
```

Ví dụ màn hình:

| Time  | Scenario   | Status  | Action |
| ----- | ---------- | ------- | ------ |
| 09:15 | Full E2E   | Success | Xóa    |
| 09:18 | Stock only | Success | Xóa    |

API:

```http
DELETE /api/demo/runs/{demoRunId}
```

Rất tiện khi test.

---

# 27. Không cho dữ liệu thật phụ thuộc dữ liệu Demo

Đây là một rule rất quan trọng.

Giả sử Demo tạo:

```text
Customer Demo ABC
```

Sau đó user vào màn tạo quotation bình thường và sử dụng Customer Demo này để tạo:

```text
Quotation thật
source = manual
```

Sau đó click:

```text
Xóa dữ liệu Demo
```

thì Customer Demo bị xóa nhưng quotation thật đang reference Customer đó.

Có hai cách xử lý.

### Cách mình khuyên

Các dropdown thông thường mặc định **không hiển thị dataDemo**.

Ví dụ:

```http
GET /api/lookups/customers
```

query:

```sql
WHERE source <> 'dataDemo'
```

Trong chế độ Demo:

```http
GET /api/lookups/customers?includeDemo=true
```

mới hiện.

Như vậy giảm rất nhiều nguy cơ trộn dữ liệu.

---

# 28. UI nên đánh dấu dữ liệu Demo

Ở các màn:

```text
Products
Customers
Quotation
Warehouse
```

data Demo nên có badge:

```text
Ống kẽm Hòa Phát      [DEMO]
```

hoặc:

```text
QT-DEMO-0001          Demo
```

để user không nhầm với data thật.

---

# 29. Naming demo cũng nên rõ

Không nên tạo:

```text
Công ty ABC
Kho Hà Nội
Ống kẽm Hòa Phát
```

Nên:

```text
[DEMO] Công ty ABC
[DEMO] Kho Hà Nội
[DEMO] Ống kẽm
[DEMO] Ống kẽm Hòa Phát
```

Code:

```text
DEMO-WH-001
DEMO-CAT-001
DEMO-PROD-001
DEMO-QT-001
```

Dù đã có `source`, naming như vậy vẫn rất hữu ích khi nhìn UI.

---

# 30. Flow Demo báo giá hoàn chỉnh

Mình sẽ thiết kế scenario chính như sau:

```text
RUN QUOTATION FULL FLOW

1. Create Warehouse
        ↓
2. Create Category
        ↓
3. Create Suppliers
        ↓
4. Create Products
        ↓
5. Import initial inventory
        ↓
6. Create Customer
        ↓
7. Create Quotation
        ↓
8. Accept Quotation
        ↓
9. Convert Quotation
        ↓
10. Allocate existing stock
        ↓
11. Import missing stock
        ↓
12. Create ledger IN
        ↓
13. Create reservation
        ↓
14. Set AWAITING_DELIVERY
        ↓
15. Deliver
        ↓
16. Ledger OUT
        ↓
17. Release reservation
        ↓
18. Set DELIVERED
```

Tất cả record:

```text
source = dataDemo
demo_run_id = xxx
```

---

# 31. Demo phải tạo audit/history giống user thật

Nếu hệ thống có:

```text
AuditLog
StatusHistory
QuotationHistory
InventoryTransaction
```

thì Demo cũng phải tạo.

Ví dụ:

```text
Quotation CREATED
Quotation ACCEPTED
Quotation CONVERTED
Quotation DELIVERED
```

Không nên chỉ set status cuối cùng.

Nhờ đó Demo cũng kiểm tra được:

```text
audit trail
timeline
history tab
```

---

# 32. Trạng thái chạy trên FE

Khi click:

```text
[Chạy Full E2E]
```

button:

```text
[ Đang tạo dữ liệu... ]
```

disable để tránh double click.

Sau thành công:

```text
✓ Demo tạo thành công

Warehouse: 1
Categories: 2
Products: 4
Customers: 1
Quotation: 2
Ledger: 7

[Xem báo giá]
[Xem tồn kho]
```

FE có thể dựa vào response:

```json
{
  "links": {
    "quotationId": "...",
    "warehouseId": "..."
  }
}
```

để navigate.

---

# 33. Chống double-click / duplicate request

Backend nên hỗ trợ idempotency hoặc ít nhất FE lock button.

Tốt hơn:

```http
POST /api/demo/scenarios/FULL_E2E/run

Idempotency-Key:
uuid
```

Nếu browser retry request thì không tạo scenario hai lần ngoài ý muốn.

---

# 34. API permission

Requirement tối thiểu của bạn:

```text
Chỉ logged-in user được sử dụng.
```

Nên áp dụng:

```text
GET    /api/demo/*
POST   /api/demo/*
DELETE /api/demo/*
```

đều authenticated.

Nếu đây là hệ thống triển khai thật cho nhiều nhân viên, mình còn khuyên thêm permission:

```text
DEMO_DATA_MANAGE
```

hoặc:

```text
Admin
SuperAdmin
Developer
```

Nhưng đây là lớp bổ sung; requirement hiện tại vẫn có thể bắt đầu bằng authenticated user.

---

# 35. Một điểm quan trọng với multi-user

Giả sử:

```text
User A chạy Demo
User B chạy Demo
```

Nếu A bấm:

```text
Xóa dữ liệu Demo
```

có nên xóa Demo của B không?

Nên định nghĩa hai API:

```http
DELETE /api/demo/my-data
```

xóa:

```text
source = dataDemo
AND created_by = currentUser
```

và với Admin:

```http
DELETE /api/demo/all-data
```

Nếu app cá nhân/small internal thì một nút xóa tất cả cũng được.

---

# 36. Data model mình đề xuất thêm

Ở các entity hỗ trợ Demo:

```text
source
demo_run_id
```

Trong `demo_runs`:

```text
id
scenario_code
status
created_by
started_at
completed_at
error
metadata
```

`metadata` có thể lưu:

```json
{
  "quotationId": "...",
  "warehouseId": "...",
  "customerId": "..."
}
```

giúp UI navigate tới kết quả Demo.

---

# 37. Acceptance Criteria cho dropdown

Phần dropdown được xem là hoàn thành khi:

| Case                  | Expected                       |
| --------------------- | ------------------------------ |
| Có warehouse          | Dropdown hiển thị warehouse    |
| Có category           | Dropdown hiển thị category     |
| Search                | Trả đúng record                |
| User khác org         | Không thấy dữ liệu             |
| Không có data         | Hiển thị empty state           |
| API fail              | Hiển thị lỗi/retry             |
| Category thay đổi     | Product dropdown refresh       |
| Warehouse thay đổi    | Stock/available refresh        |
| Data deleted/inactive | Không xuất hiện                |
| Demo data             | được filter/đánh dấu đúng rule |

---

# 38. Acceptance Criteria cho Demo

| Case                | Expected                         |
| ------------------- | -------------------------------- |
| Chưa login          | Không truy cập được Demo API     |
| Login               | Có thể chạy scenario             |
| Run Master Data     | Tạo đủ master records            |
| Run Full E2E        | Tạo được full flow               |
| Record tạo bởi Demo | `source=dataDemo`                |
| Record cùng run     | cùng `demo_run_id`               |
| Flow lỗi giữa chừng | rollback                         |
| Delete demo         | xóa đúng Demo data               |
| Delete demo         | không xóa user data              |
| Double click        | không tạo duplicate ngoài ý muốn |
| Hide tab            | tab biến mất                     |
| Re-enable           | có thể bật lại                   |
| Demo entity         | có badge DEMO                    |
| Audit               | có đầy đủ status/history         |

---

# 39. Kiến trúc cuối cùng mình khuyên dùng

```text
                     AUTHENTICATED USER
                            │
             ┌──────────────┴───────────────┐
             │                              │
          Normal UI                      Demo Tab
             │                              │
             │                       DemoScenario API
             │                              │
             │                      DemoScenarioService
             │                              │
             └──────────────┬───────────────┘
                            │
                     Application Layer
                            │
            ┌───────────────┼─────────────────┐
            │               │                 │
     Customer Service Product Service Quotation Service
            │               │                 │
            └───────────────┼─────────────────┘
                            │
                       Inventory
                       / Ledger
                            │
                         Database
```

Demo không xây một hệ business logic thứ hai.

Nó chỉ là **orchestrator gọi lại chính business logic hiện có**.

---

# 40. Scope triển khai mình sẽ chốt

Requirement sau khi chuẩn hóa sẽ thành:

> Hoàn thiện toàn bộ API lookup phục vụ các dropdown trong nghiệp vụ báo giá, bao gồm warehouse, category, customer, supplier, product và các master data liên quan. Lookup phải hỗ trợ authorization, tenant scope, active/deleted filtering và các dependency như product theo category/warehouse.

> Bổ sung module `Demo nghiệp vụ`, chỉ accessible với authenticated user và có thể ẩn/bật thông qua feature flag/user preference. Module cung cấp nhiều business scenario từ master data đến full quotation flow.

> Mỗi lần chạy scenario phải tạo `demo_run_id` riêng. Tất cả dữ liệu được tạo phải có `source = "dataDemo"` và `demo_run_id` tương ứng.

> Demo scenario phải ưu tiên gọi lại Application/Domain commands hiện có thay vì insert trực tiếp DB, nhằm đảm bảo validation, ledger, reservation, audit và status transition hoạt động giống flow thực tế.

> Hỗ trợ cleanup toàn bộ hoặc từng demo run. Cleanup phải transactional, chỉ xóa dữ liệu Demo và không ảnh hưởng dữ liệu người dùng thật.

Điểm mình cho là **quan trọng nhất cần bổ sung so với requirement ban đầu** là `demo_run_id`. Chỉ dùng mỗi `source = "dataDemo"` thì chạy được, nhưng rất khó debug, xóa từng scenario, chống trộn dữ liệu và truy vết khi hệ thống bắt đầu lớn. `source + demo_run_id + created_by` sẽ làm module Demo an toàn và dùng lâu dài hơn rất nhiều.
