-- A ledger stores every movement; the previous unique key allowed only one
-- movement per reference/product/warehouse combination.
alter table if exists inventory_ledger
  drop constraint if exists inventory_ledger_org_id_ref_product_id_warehouse_id_key;