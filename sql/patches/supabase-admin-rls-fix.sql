-- ============================================================
-- BloodConnect — Admin RLS Recursion Fix
-- Purpose: Fix "stack depth limit exceeded" caused by recursive RLS
--          policies on blood_bank.admin.
-- ============================================================

begin;

set search_path to blood_bank;

-- Inspect existing policies first (optional)
-- select policyname, cmd, qual, with_check
-- from pg_policies
-- where schemaname = 'blood_bank' and tablename = 'admin';

-- Drop potentially recursive policies on admin.
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'blood_bank'
      and tablename  = 'admin'
      and cmd in ('SELECT', 'ALL')
  loop
    execute format('drop policy if exists %I on blood_bank.admin', pol.policyname);
  end loop;
end;
$$;

-- Keep a simple non-recursive SELECT policy for authenticated users.
-- Adjust this to stricter rules later once auth mapping is finalized.
create policy admin_select_authenticated
  on blood_bank.admin
  for select
  to authenticated
  using (true);

commit;
