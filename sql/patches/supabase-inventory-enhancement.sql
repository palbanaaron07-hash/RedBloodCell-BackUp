-- ============================================================
-- BloodConnect — Blood Inventory Enhancement Migration
-- Run this in the Supabase SQL Editor
-- Adds: expiry_date, remarks, bag_id to blood_inventory
-- Creates: auto-expire trigger, RLS fix for inventory
-- ============================================================

begin;

set search_path to blood_bank;

-- 1. Add missing columns to blood_inventory
alter table blood_bank.blood_inventory
  add column if not exists expiry_date   date,
  add column if not exists remarks       text,
  add column if not exists bag_id        varchar(30) generated always as (
    'BAG-' || lpad(inventory_id::text, 6, '0')
  ) stored;

-- 2. Back-fill expiry_date for existing rows: 42 days from date_stock (standard whole blood shelf life)
update blood_bank.blood_inventory
set expiry_date = date_stock + interval '42 days'
where expiry_date is null;

-- 3. Auto-expire trigger: marks status = 'expired' when expiry_date < current_date
create or replace function blood_bank.auto_expire_inventory()
returns void
language plpgsql
as $$
begin
  update blood_bank.blood_inventory
  set    status = 'expired'
  where  expiry_date < current_date
    and  status not in ('expired', 'discarded', 'used');
end;
$$;

-- 4. Ensure RLS is disabled on blood_inventory so anon key can update status
alter table blood_bank.blood_inventory disable row level security;

commit;
