-- ============================================================
-- BloodConnect — Hotfix: Allow authenticated INSERT on blood_inventory
-- Fixes: "new row violates row-level security policy for table blood_inventory"
-- Run this in Supabase SQL Editor.
-- ============================================================

begin;

set search_path to blood_bank;

alter table blood_bank.blood_inventory enable row level security;

drop policy if exists blood_inventory_insert_authenticated on blood_bank.blood_inventory;

create policy blood_inventory_insert_authenticated
  on blood_bank.blood_inventory
  for insert
  to authenticated
  with check (true);

commit;
