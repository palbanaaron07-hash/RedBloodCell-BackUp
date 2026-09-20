-- ============================================================
-- BloodConnect — Public Donor Registration RLS Fix
-- Run this in the Supabase SQL Editor.
-- This allows anyone (public/anon) to submit the registration form.
-- ============================================================

begin;

set search_path to blood_bank;

-- 1. Ensure the schema is accessible to the public (anon) and logged-in users
grant usage on schema blood_bank to anon, authenticated;

-- 2. Grant permissions to the donor table
grant insert, select on table blood_bank.donor to anon;
grant all on table blood_bank.donor to authenticated;

-- 3. Also grant permissions to the identity sequence (needed for auto-increment IDs)
grant usage, select on all sequences in schema blood_bank to anon, authenticated;

-- 4. Enable RLS
alter table blood_bank.donor enable row level security;

-- 5. Drop existing policies to avoid conflicts
drop policy if exists donor_public_insert on blood_bank.donor;
drop policy if exists donor_all_authenticated on blood_bank.donor;

-- 6. Create RLS Policies
-- Allow anyone to register
create policy donor_public_insert
  on blood_bank.donor
  for insert
  to anon, authenticated
  with check (true);

-- Allow authenticated users (Admins) to do everything
create policy donor_all_authenticated
  on blood_bank.donor
  for all
  to authenticated
  using (true)
  with check (true);

commit;
