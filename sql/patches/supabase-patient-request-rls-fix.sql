-- ============================================================
-- BloodConnect — Patient + Blood Request RLS Fix
-- Purpose: Fix patient linking failures that prevent request submission.
-- ============================================================

begin;

set search_path to blood_bank;

-- Drop existing recursive/overly-strict policies on patient table.
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'blood_bank'
      and tablename  = 'patient'
      and cmd in ('SELECT', 'INSERT', 'UPDATE', 'ALL')
  loop
    execute format('drop policy if exists %I on blood_bank.patient', pol.policyname);
  end loop;
end;
$$;

-- Create simple non-recursive patient policies for authenticated users.
create policy patient_select_authenticated
  on blood_bank.patient
  for select
  to authenticated
  using (true);

create policy patient_insert_authenticated
  on blood_bank.patient
  for insert
  to authenticated
  with check (true);

create policy patient_update_authenticated
  on blood_bank.patient
  for update
  to authenticated
  using (true)
  with check (true);

-- Ensure blood_inventory lookup is non-recursive for authenticated users.
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'blood_bank'
      and tablename  = 'blood_inventory'
      and cmd in ('SELECT', 'ALL')
  loop
    execute format('drop policy if exists %I on blood_bank.blood_inventory', pol.policyname);
  end loop;
end;
$$;

create policy blood_inventory_select_authenticated
  on blood_bank.blood_inventory
  for select
  to authenticated
  using (true);

-- Ensure blood_request allows authenticated reads/inserts.
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'blood_bank'
      and tablename  = 'blood_request'
      and cmd in ('SELECT', 'INSERT', 'ALL')
  loop
    execute format('drop policy if exists %I on blood_bank.blood_request', pol.policyname);
  end loop;
end;
$$;

create policy blood_request_select_authenticated
  on blood_bank.blood_request
  for select
  to authenticated
  using (true);

create policy blood_request_insert_authenticated
  on blood_bank.blood_request
  for insert
  to authenticated
  with check (true);

commit;
