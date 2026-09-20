-- ============================================================
-- BloodConnect - Canonical Blood Type Cleanup + Constraints
-- Run this once in the Supabase SQL Editor.
-- ============================================================

begin;

create or replace function blood_bank.canonical_blood_type(raw_value text)
returns text
language sql
immutable
as $$
  select case
    when upper(regexp_replace(coalesce(raw_value, ''), '[^A-Za-z0-9+-]', '', 'g')) in ('A+', 'APOS', 'APOSITIVE', 'APLUS') then 'A+'
    when upper(regexp_replace(coalesce(raw_value, ''), '[^A-Za-z0-9+-]', '', 'g')) in ('A-', 'ANEG', 'ANEGATIVE', 'AMINUS') then 'A-'
    when upper(regexp_replace(coalesce(raw_value, ''), '[^A-Za-z0-9+-]', '', 'g')) in ('B+', 'BPOS', 'BPOSITIVE', 'BPLUS') then 'B+'
    when upper(regexp_replace(coalesce(raw_value, ''), '[^A-Za-z0-9+-]', '', 'g')) in ('B-', 'BNEG', 'BNEGATIVE', 'BMINUS') then 'B-'
    when upper(regexp_replace(coalesce(raw_value, ''), '[^A-Za-z0-9+-]', '', 'g')) in ('AB+', 'ABPOS', 'ABPOSITIVE', 'ABPLUS') then 'AB+'
    when upper(regexp_replace(coalesce(raw_value, ''), '[^A-Za-z0-9+-]', '', 'g')) in ('AB-', 'ABNEG', 'ABNEGATIVE', 'ABMINUS') then 'AB-'
    when upper(regexp_replace(coalesce(raw_value, ''), '[^A-Za-z0-9+-]', '', 'g')) in ('O+', 'OPOS', 'OPOSITIVE', 'OPLUS') then 'O+'
    when upper(regexp_replace(coalesce(raw_value, ''), '[^A-Za-z0-9+-]', '', 'g')) in ('O-', 'ONEG', 'ONEGATIVE', 'OMINUS') then 'O-'
    else null
  end;
$$;

update blood_bank.donor
set blood_type = blood_bank.canonical_blood_type(blood_type)
where blood_bank.canonical_blood_type(blood_type) is not null;

update blood_bank.patient
set blood_type_needed = blood_bank.canonical_blood_type(blood_type_needed)
where blood_bank.canonical_blood_type(blood_type_needed) is not null;

update blood_bank.blood_inventory
set blood_type = blood_bank.canonical_blood_type(blood_type)
where blood_bank.canonical_blood_type(blood_type) is not null;

update blood_bank.blood_request
set blood_type_needed = blood_bank.canonical_blood_type(blood_type_needed)
where blood_bank.canonical_blood_type(blood_type_needed) is not null;

update blood_bank.donation_record
set blood_type = blood_bank.canonical_blood_type(blood_type)
where blood_bank.canonical_blood_type(blood_type) is not null;

alter table blood_bank.donor
  drop constraint if exists chk_donor_blood_type_valid,
  add constraint chk_donor_blood_type_valid
  check (blood_type in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'));

alter table blood_bank.patient
  drop constraint if exists chk_patient_blood_type_needed_valid,
  add constraint chk_patient_blood_type_needed_valid
  check (blood_type_needed in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'));

alter table blood_bank.blood_inventory
  drop constraint if exists chk_inventory_blood_type_valid,
  add constraint chk_inventory_blood_type_valid
  check (blood_type in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'));

alter table blood_bank.blood_request
  drop constraint if exists chk_request_blood_type_needed_valid,
  add constraint chk_request_blood_type_needed_valid
  check (blood_type_needed in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'));

alter table blood_bank.donation_record
  drop constraint if exists chk_donation_record_blood_type_valid,
  add constraint chk_donation_record_blood_type_valid
  check (blood_type in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'));

commit;
