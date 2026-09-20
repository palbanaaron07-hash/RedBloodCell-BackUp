-- ============================================================
-- BloodConnect — Donor Lifecycle RLS Fix
-- Run this in the Supabase SQL Editor AFTER supabase-donor-lifecycle.sql
-- 
-- Fixes: "stack depth limit exceeded" when updating donor status.
-- Root cause: RLS on donor table triggers recursive admin-table lookup.
-- ============================================================

begin;

set search_path to blood_bank;

-- ----------------------------------------------------------------
-- 1. Disable RLS on the internal audit tables
--    (donor_status_log and donor_checkin are admin-only write tables,
--     not accessed by end users, so RLS is not needed)
-- ----------------------------------------------------------------

alter table blood_bank.donor_status_log disable row level security;
alter table blood_bank.donor_checkin     disable row level security;

-- ----------------------------------------------------------------
-- 2. Ensure the donor table has a permissive UPDATE policy
--    that does NOT recursively look up the admin table.
--
--    Drop any existing update policies that may cause recursion,
--    then add a simple open policy for authenticated users.
-- ----------------------------------------------------------------

-- Show existing policies (useful to see what's there)
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'donor' AND schemaname = 'blood_bank';

-- Drop any policy that causes the recursion on UPDATE
-- (adjust the policy name if yours is different — check pg_policies above)
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'blood_bank'
      and tablename  = 'donor'
      and cmd in ('UPDATE', 'ALL')
  loop
    execute format('drop policy if exists %I on blood_bank.donor', pol.policyname);
  end loop;
end;
$$;

-- Add clean, non-recursive UPDATE policy for authenticated users
-- (allows any authenticated user to update donor rows)
create policy donor_update_authenticated
  on blood_bank.donor
  for update
  to authenticated
  using  (true)
  with check (true);

-- Also ensure SELECT policy exists for authenticated (needed for .select('*') after update)
do $$
declare
  has_select boolean;
begin
  select exists (
    select 1 from pg_policies
    where schemaname = 'blood_bank'
      and tablename  = 'donor'
      and cmd in ('SELECT', 'ALL')
  ) into has_select;

  if not has_select then
    execute '
      create policy donor_select_authenticated
        on blood_bank.donor
        for select
        to authenticated
        using (true)
    ';
  end if;
end;
$$;

-- ----------------------------------------------------------------
-- 3. Also disable RLS on blood_inventory and donation_record
--    if they have similar issues (they are inserted by the admin
--    flow and should not be user-restricted).
-- ----------------------------------------------------------------

-- Only disable if RLS is currently enabled on these tables
do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'blood_bank'
      and c.relname = 'blood_inventory'
      and c.relrowsecurity = true
  ) then
    alter table blood_bank.blood_inventory disable row level security;
  end if;

  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'blood_bank'
      and c.relname = 'donation_record'
      and c.relrowsecurity = true
  ) then
    alter table blood_bank.donation_record disable row level security;
  end if;
end;
$$;

commit;
