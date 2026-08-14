-- ═══════════════════════════════════════════════════════════════════════════════
-- WAREHOUSE OS - DATABASE UPDATE QUERIES
-- Run these in Supabase Dashboard → SQL Editor → New query
-- Copy and paste ALL of this, then click RUN
-- ═══════════════════════════════════════════════════════════════════════════════

-- Step 1: Create ROLES table
CREATE TABLE IF NOT EXISTS roles (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code        text NOT NULL,
  name_vi     text NOT NULL,
  name_en     text NOT NULL,
  is_system   boolean NOT NULL DEFAULT false,
  description text,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (org_id, code)
);

-- Step 2: Create ROLE_PERMISSIONS table
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id     uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  module      text NOT NULL,
  action      text NOT NULL,
  allowed     boolean NOT NULL DEFAULT true,
  PRIMARY KEY (role_id, module, action)
);

-- Step 3: Drop and recreate QUOTATION_ITEMS (to fix foreign key)
DROP TABLE IF EXISTS quotation_items CASCADE;

-- Step 4: Drop and recreate QUOTATIONS with proper UUID types
DROP TABLE IF EXISTS quotations CASCADE;

CREATE TABLE quotations (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id    uuid REFERENCES customers(id),
  customer_name  text NOT NULL,
  date           date NOT NULL DEFAULT CURRENT_DATE,
  valid_until    date,
  status         text NOT NULL DEFAULT 'Draft',
  discount_val   numeric(18,0) NOT NULL DEFAULT 0,
  discount_type  text NOT NULL DEFAULT 'pct',
  notes          text,
  total          numeric(18,0) NOT NULL DEFAULT 0,
  created_by     text,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  UNIQUE (org_id, id)
);

-- Step 5: Create QUOTATION_ITEMS table with matching UUID types
CREATE TABLE quotation_items (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  quotation_id   uuid NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  product_id     uuid REFERENCES products(id),
  product_name   text NOT NULL,
  supplier_id    uuid REFERENCES suppliers(id),
  supplier_name  text,
  import_unit    text,
  sell_unit      text,
  qty            numeric(18,2) NOT NULL DEFAULT 1,
  cost_price     numeric(18,0) NOT NULL DEFAULT 0,
  profit_pct     numeric(18,2) NOT NULL DEFAULT 0,
  selling_price  numeric(18,0) NOT NULL DEFAULT 0,
  vat_pct        numeric(18,2) NOT NULL DEFAULT 0,
  total          numeric(18,0) NOT NULL DEFAULT 0,
  created_at     timestamptz DEFAULT now()
);

-- Step 6: Add 'created_by' column to PURCHASE_ORDERS (if not exists)
ALTER TABLE purchase_orders
ADD COLUMN IF NOT EXISTS created_by text;

-- Step 7: Add 'tax_code' column to SUPPLIERS (if not exists)
ALTER TABLE suppliers
ADD COLUMN IF NOT EXISTS tax_code text;

-- Step 8: Enable RLS for new tables
ALTER TABLE roles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_items     ENABLE ROW LEVEL SECURITY;

-- Step 9: Create RLS policies for ROLES
DROP POLICY IF EXISTS "org_isolation" ON roles;
CREATE POLICY "org_isolation" ON roles
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "org_insert_roles" ON roles FOR INSERT
  WITH CHECK (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "org_update_roles" ON roles FOR UPDATE
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "org_delete_roles" ON roles FOR DELETE
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Step 9: Create RLS policies for ROLE_PERMISSIONS
DROP POLICY IF EXISTS "org_isolation" ON role_permissions;
CREATE POLICY "org_isolation" ON role_permissions
  USING (role_id IN (
    SELECT id FROM roles WHERE org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
  ));

CREATE POLICY "org_insert_role_permissions" ON role_permissions FOR INSERT
  WITH CHECK (role_id IN (
    SELECT id FROM roles WHERE org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
  ));

CREATE POLICY "org_update_role_permissions" ON role_permissions FOR UPDATE
  USING (role_id IN (
    SELECT id FROM roles WHERE org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
  ));

CREATE POLICY "org_delete_role_permissions" ON role_permissions FOR DELETE
  USING (role_id IN (
    SELECT id FROM roles WHERE org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
  ));

-- Step 10: Create RLS policies for QUOTATIONS
DROP POLICY IF EXISTS "org_isolation" ON quotations;
CREATE POLICY "org_isolation" ON quotations
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "org_insert_quotations" ON quotations FOR INSERT
  WITH CHECK (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "org_update_quotations" ON quotations FOR UPDATE
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "org_delete_quotations" ON quotations FOR DELETE
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Step 11: Create RLS policies for QUOTATION_ITEMS
DROP POLICY IF EXISTS "org_isolation" ON quotation_items;
CREATE POLICY "org_isolation" ON quotation_items
  USING (quotation_id IN (
    SELECT id FROM quotations WHERE org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
  ));

CREATE POLICY "org_insert_quotation_items" ON quotation_items FOR INSERT
  WITH CHECK (quotation_id IN (
    SELECT id FROM quotations WHERE org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
  ));

CREATE POLICY "org_update_quotation_items" ON quotation_items FOR UPDATE
  USING (quotation_id IN (
    SELECT id FROM quotations WHERE org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
  ));

CREATE POLICY "org_delete_quotation_items" ON quotation_items FOR DELETE
  USING (quotation_id IN (
    SELECT id FROM quotations WHERE org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
  ));

-- ═══════════════════════════════════════════════════════════════════════════════
-- ✅ DONE! All tables and policies have been created/updated.
-- ═══════════════════════════════════════════════════════════════════════════════
