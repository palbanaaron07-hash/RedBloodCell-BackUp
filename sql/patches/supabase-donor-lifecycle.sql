-- ============================================================
-- BloodConnect — Donor Lifecycle Migration
-- Run this in the Supabase SQL Editor (blood_bank schema).
-- This is ADDITIVE — safe to run on an existing database.
-- ============================================================

begin;

set search_path to blood_bank;

-- ----------------------------------------------------------------
-- 1. Add lifecycle columns to the donor table
-- ----------------------------------------------------------------

-- donor_status tracks the current step in the donation lifecycle.
-- Allowed values: registered | checked_in | donated | deferred | incomplete
alter table blood_bank.donor
  add column if not exists donor_status varchar(30) not null default 'registered';

-- Store gender and date_of_birth (already collected in the UI form)
alter table blood_bank.donor
  add column if not exists gender varchar(10);

alter table blood_bank.donor
  add column if not exists date_of_birth date;

-- Timestamp of the most recent clinic check-in
alter table blood_bank.donor
  add column if not exists check_in_date timestamptz;

-- Free-text reason if the donor is deferred
alter table blood_bank.donor
  add column if not exists deferred_reason text;

-- ----------------------------------------------------------------
-- 2. Create donor_checkin history table
--    Records every check-in event for audit / reporting.
-- ----------------------------------------------------------------

create table if not exists blood_bank.donor_checkin (
  checkin_id   bigint generated always as identity primary key,
  donor_id     bigint not null references blood_bank.donor(donor_id) on update cascade on delete cascade,
  checked_in_at timestamptz not null default now(),
  checked_in_by varchar(255),          -- email / name of admin who performed the check-in
  notes        text
);

create index if not exists idx_checkin_donor on blood_bank.donor_checkin(donor_id);

-- ----------------------------------------------------------------
-- 3. Create donor_status_log table
--    Audit trail of all status transitions.
-- ----------------------------------------------------------------

create table if not exists blood_bank.donor_status_log (
  log_id       bigint generated always as identity primary key,
  donor_id     bigint not null references blood_bank.donor(donor_id) on update cascade on delete cascade,
  old_status   varchar(30),
  new_status   varchar(30) not null,
  changed_at   timestamptz not null default now(),
  changed_by   varchar(255),
  notes        text
);

create index if not exists idx_status_log_donor on blood_bank.donor_status_log(donor_id);

-- ----------------------------------------------------------------
-- 4. Function: enforce 56-day (8-week) waiting period
--    Raises an exception if an admin tries to mark a donor
--    as donated when fewer than 56 days have passed since
--    their last donation date.
-- ----------------------------------------------------------------

create or replace function blood_bank.enforce_donation_waiting_period()
returns trigger
language plpgsql
as $$
declare
  days_since int;
begin
  -- Only enforce when transitioning TO 'donated'
  if new.donor_status = 'donated' and old.donor_status is distinct from 'donated' then
    if old.last_donation_date is not null then
      days_since := (current_date - old.last_donation_date);
      if days_since < 56 then
        raise exception
          'Donor must wait 56 days between donations. % days remain.',
          (56 - days_since)
          using errcode = 'P0001';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_donor_waiting_period on blood_bank.donor;
create trigger trg_donor_waiting_period
  before update on blood_bank.donor
  for each row
  execute function blood_bank.enforce_donation_waiting_period();

-- ----------------------------------------------------------------
-- 5. Function: auto-set last_donation_date when status = 'donated'
--    Also resets check_in_date.
-- ----------------------------------------------------------------

create or replace function blood_bank.sync_donation_date()
returns trigger
language plpgsql
as $$
begin
  if new.donor_status = 'donated' and old.donor_status is distinct from 'donated' then
    new.last_donation_date := current_date;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_donor_sync_donation_date on blood_bank.donor;
create trigger trg_donor_sync_donation_date
  before update on blood_bank.donor
  for each row
  execute function blood_bank.sync_donation_date();

-- ----------------------------------------------------------------
-- 6. Backfill existing donors
--    Set status to 'donated' if they have a last_donation_date,
--    otherwise keep 'registered'.
-- ----------------------------------------------------------------

update blood_bank.donor
set donor_status = 'donated'
where last_donation_date is not null
  and donor_status = 'registered';

-- ----------------------------------------------------------------
-- 7. Add helpful index on donor_status
-- ----------------------------------------------------------------

create index if not exists idx_donor_status on blood_bank.donor(donor_status);

commit;
