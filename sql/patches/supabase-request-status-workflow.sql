-- ============================================================
-- BloodConnect — Blood Request Status Workflow Migration
-- Adds lifecycle statuses, audit trail, and notification queue.
-- Run in Supabase SQL Editor.
-- ============================================================

begin;

set search_path to blood_bank;

-- 1) Normalize status column defaults and existing rows.
alter table blood_bank.blood_request
  alter column status set default 'pending';

update blood_bank.blood_request
set status = case
  when lower(status) in ('processing', 'in_progress', 'in progress') then 'approved'
  when lower(status) in ('needs clarification', 'clarification') then 'needs_clarification'
  when lower(status) in ('declined', 'cancelled', 'canceled') then 'rejected'
  when lower(status) in ('complete', 'completed', 'done', 'closed') then 'fulfilled'
  when lower(status) in ('approved', 'pending', 'rejected', 'fulfilled', 'needs_clarification') then lower(status)
  else 'pending'
end;

-- 2) Enforce allowed lifecycle values.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_blood_request_status_lifecycle'
      and conrelid = 'blood_bank.blood_request'::regclass
  ) then
    alter table blood_bank.blood_request
      add constraint chk_blood_request_status_lifecycle
      check (status in ('pending', 'approved', 'needs_clarification', 'rejected', 'fulfilled'));
  end if;
end $$;

-- 3) Add audit trail table.
create table if not exists blood_bank.blood_request_status_log (
  log_id bigint generated always as identity primary key,
  request_id bigint not null references blood_bank.blood_request(request_id) on update cascade on delete cascade,
  admin_id text not null,
  old_status varchar(50),
  new_status varchar(50) not null,
  changed_at timestamptz not null default now(),
  reason text not null,
  note text
);

create index if not exists idx_blood_request_status_log_request_id
  on blood_bank.blood_request_status_log(request_id);

create index if not exists idx_blood_request_status_log_changed_at
  on blood_bank.blood_request_status_log(changed_at desc);

-- 4) Add notification queue for automated messaging.
create table if not exists blood_bank.blood_request_notification_queue (
  queue_id bigint generated always as identity primary key,
  request_id bigint not null references blood_bank.blood_request(request_id) on update cascade on delete cascade,
  channel varchar(20) not null,
  recipient text not null,
  message text not null,
  reason text,
  status varchar(30) not null default 'queued',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists idx_blood_request_notification_queue_request_id
  on blood_bank.blood_request_notification_queue(request_id);

create index if not exists idx_blood_request_notification_queue_status
  on blood_bank.blood_request_notification_queue(status);

-- 5) RLS: allow authenticated users to read/update requests and insert logs.
alter table blood_bank.blood_request enable row level security;
alter table blood_bank.blood_request_status_log enable row level security;
alter table blood_bank.blood_request_notification_queue enable row level security;
alter table blood_bank.blood_inventory enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'blood_bank'
      and tablename = 'blood_request'
      and policyname in (
        'blood_request_update_authenticated',
        'blood_request_select_authenticated'
      )
  loop
    execute format('drop policy if exists %I on blood_bank.blood_request', pol.policyname);
  end loop;

  for pol in
    select policyname
    from pg_policies
    where schemaname = 'blood_bank'
      and tablename = 'blood_request_status_log'
      and policyname in ('blood_request_status_log_insert_authenticated')
  loop
    execute format('drop policy if exists %I on blood_bank.blood_request_status_log', pol.policyname);
  end loop;

  for pol in
    select policyname
    from pg_policies
    where schemaname = 'blood_bank'
      and tablename = 'blood_request_notification_queue'
      and policyname in ('blood_request_notification_queue_insert_authenticated')
  loop
    execute format('drop policy if exists %I on blood_bank.blood_request_notification_queue', pol.policyname);
  end loop;

  for pol in
    select policyname
    from pg_policies
    where schemaname = 'blood_bank'
      and tablename = 'blood_inventory'
      and policyname in (
        'blood_inventory_select_authenticated',
        'blood_inventory_update_authenticated',
        'blood_inventory_insert_authenticated'
      )
  loop
    execute format('drop policy if exists %I on blood_bank.blood_inventory', pol.policyname);
  end loop;
end $$;

create policy blood_request_select_authenticated
  on blood_bank.blood_request
  for select
  to authenticated
  using (true);

create policy blood_request_update_authenticated
  on blood_bank.blood_request
  for update
  to authenticated
  using (true)
  with check (
    -- Allow all updates except changing/setting status to 'fulfilled'.
    -- Only users present in the admin table (matched by email claim) may set status = 'fulfilled'.
    (status <> 'fulfilled')
    OR
    exists (
      select 1 from blood_bank.admin a
      where a.email = current_setting('request.jwt.claims', true)::json->>'email'
    )
  );

create policy blood_request_status_log_insert_authenticated
  on blood_bank.blood_request_status_log
  for insert
  to authenticated
  with check (true);

create policy blood_request_notification_queue_insert_authenticated
  on blood_bank.blood_request_notification_queue
  for insert
  to authenticated
  with check (true);

create policy blood_inventory_select_authenticated
  on blood_bank.blood_inventory
  for select
  to authenticated
  using (true);

create policy blood_inventory_update_authenticated
  on blood_bank.blood_inventory
  for update
  to authenticated
  using (true)
  with check (true);

create policy blood_inventory_insert_authenticated
  on blood_bank.blood_inventory
  for insert
  to authenticated
  with check (true);

commit;
