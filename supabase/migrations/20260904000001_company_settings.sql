-- One company profile per organization for documents and settings.
create table if not exists company_settings (
  org_id         uuid primary key references organizations(id) on delete cascade,
  name           text not null,
  representative text,
  tax_id         text,
  address        text,
  phone          text,
  website        text,
  email          text,
  logo_url       text,
  updated_at     timestamptz default now()
);

alter table company_settings enable row level security;
create policy "company_settings_read" on company_settings for select using (org_id = get_org_id());
create policy "company_settings_insert" on company_settings for insert with check (org_id = get_org_id());
create policy "company_settings_update" on company_settings for update using (org_id = get_org_id());
create policy "company_settings_delete" on company_settings for delete using (org_id = get_org_id());
