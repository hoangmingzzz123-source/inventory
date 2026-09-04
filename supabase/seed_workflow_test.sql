-- Idempotent fixture for live quotation workflow testing.
-- Run this in Supabase SQL Editor after applying migrations.
-- Use only in a non-production project.

insert into organizations (id, name)
values ('11111111-1111-4111-8111-111111111111', 'Workflow Test Company')
on conflict (id) do update set name = excluded.name;

insert into warehouses (id, org_id, code, name, address, phone, status)
values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'TEST-WH', 'Workflow Test Warehouse', 'Test address', '0900000000', 'Active')
on conflict (id) do update set name = excluded.name, org_id = excluded.org_id;

insert into categories (id, org_id, code, name_vi, name_en, status)
values ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'TEST-CAT', 'Danh mục kiểm thử', 'Test Category', 'Active')
on conflict (id) do update set name_vi = excluded.name_vi, name_en = excluded.name_en;

insert into brands (id, org_id, code, name, country, status)
values ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', 'TEST-BRAND', 'Test Brand', 'Vietnam', 'Active')
on conflict (id) do update set name = excluded.name;

insert into units (id, org_id, code, name_vi, name_en, status)
values ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', 'PCS-TEST', 'Cái', 'Piece', 'Active')
on conflict (id) do update set name_vi = excluded.name_vi, name_en = excluded.name_en;

insert into customers (id, org_id, code, name, phone, email, tax_code, address, status)
values ('66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111', 'TEST-CUST', 'Khách hàng kiểm thử', '0911111111', 'customer@test.local', 'TEST-TAX-C', 'Địa chỉ khách hàng kiểm thử', 'Active')
on conflict (id) do update set name = excluded.name, phone = excluded.phone, email = excluded.email, address = excluded.address;

insert into suppliers (id, org_id, code, name, phone, email, tax_code, address, status)
values ('77777777-7777-4777-8777-777777777777', '11111111-1111-4111-8111-111111111111', 'TEST-SUP', 'Nhà cung cấp kiểm thử', '0922222222', 'supplier@test.local', 'TEST-TAX-S', 'Địa chỉ nhà cung cấp kiểm thử', 'Active')
on conflict (id) do update set name = excluded.name, phone = excluded.phone, email = excluded.email, address = excluded.address;

insert into products (id, org_id, sku, barcode, name, category, brand, unit, cost, price, qty, status)
values ('88888888-8888-4888-8888-888888888888', '11111111-1111-4111-8111-111111111111', 'TEST-SKU-001', 'TEST-BAR-001', 'Sản phẩm kiểm thử', 'TEST-CAT', 'TEST-BRAND', 'Piece', 100000, 150000, 0, 'Active')
on conflict (id) do update set name = excluded.name, cost = excluded.cost, price = excluded.price, qty = 0;

-- Clean only fixture documents so the workflow test can be repeated.
delete from inventory_ledger where org_id = '11111111-1111-4111-8111-111111111111' and ref like 'TEST-%';
delete from goods_receipts where org_id = '11111111-1111-4111-8111-111111111111' and ref like 'TEST-%';
delete from quotations where org_id = '11111111-1111-4111-8111-111111111111' and customer_id = '66666666-6666-4666-8666-666666666666';
