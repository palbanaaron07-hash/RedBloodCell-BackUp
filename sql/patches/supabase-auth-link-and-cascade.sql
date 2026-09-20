-- ============================================================
-- BloodConnect — Link Domain Records To Supabase Auth Users
-- Purpose:
-- 1) Link blood_bank records to auth.users via auth_user_id
-- 2) Enable ON DELETE CASCADE for future cleanup
-- 3) Provide helper queries for existing stale rows
-- ============================================================

begin;

set search_path to blood_bank, public;

-- 1) Add auth link columns (idempotent).
alter table blood_bank.patient add column if not exists auth_user_id uuid;
alter table blood_bank.patient add column if not exists email varchar(255);

alter table blood_bank.donor add column if not exists auth_user_id uuid;
alter table blood_bank.admin add column if not exists auth_user_id uuid;

-- 2) Backfill donor/admin links by matching email.
update blood_bank.donor d
set auth_user_id = u.id
from auth.users u
where d.auth_user_id is null
  and d.email is not null
  and lower(d.email) = lower(u.email);

update blood_bank.admin a
set auth_user_id = u.id
from auth.users u
where a.auth_user_id is null
  and a.email is not null
  and lower(a.email) = lower(u.email);

-- 3) Backfill patient links from auth metadata patient_id.
-- Your app stores patient_id in auth.users.raw_user_meta_data.patient_id.
update blood_bank.patient p
set
  auth_user_id = u.id,
  email = coalesce(p.email, u.email)
from auth.users u
where p.auth_user_id is null
  and (u.raw_user_meta_data ? 'patient_id')
  and nullif(u.raw_user_meta_data->>'patient_id', '') ~ '^[0-9]+$'
  and p.patient_id = (u.raw_user_meta_data->>'patient_id')::bigint;

-- Optional: if a patient row is linked but email is blank, fill it.
update blood_bank.patient p
set email = u.email
from auth.users u
where p.auth_user_id = u.id
  and (p.email is null or trim(p.email) = '');

-- 4) Add FK constraints with ON DELETE CASCADE (idempotent).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_patient_auth_user'
      and conrelid = 'blood_bank.patient'::regclass
  ) then
    alter table blood_bank.patient
      add constraint fk_patient_auth_user
      foreign key (auth_user_id) references auth.users(id)
      on update cascade on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_donor_auth_user'
      and conrelid = 'blood_bank.donor'::regclass
  ) then
    alter table blood_bank.donor
      add constraint fk_donor_auth_user
      foreign key (auth_user_id) references auth.users(id)
      on update cascade on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_admin_auth_user'
      and conrelid = 'blood_bank.admin'::regclass
  ) then
    alter table blood_bank.admin
      add constraint fk_admin_auth_user
      foreign key (auth_user_id) references auth.users(id)
      on update cascade on delete cascade;
  end if;
end $$;

-- 5) Helpful unique indexes for linked records (nullable-safe).
create unique index if not exists uq_patient_auth_user_id
  on blood_bank.patient(auth_user_id)
  where auth_user_id is not null;

create unique index if not exists uq_donor_auth_user_id
  on blood_bank.donor(auth_user_id)
  where auth_user_id is not null;

create unique index if not exists uq_admin_auth_user_id
  on blood_bank.admin(auth_user_id)
  where auth_user_id is not null;

commit;

-- ============================================================
-- Manual cleanup helpers for already-deleted auth users
-- (Run only what you need, after reviewing rows)
-- ============================================================

-- A) Show linked rows that now point to non-existing auth users.
-- select * from blood_bank.patient p where p.auth_user_id is not null and not exists (select 1 from auth.users u where u.id = p.auth_user_id);
-- select * from blood_bank.donor d where d.auth_user_id is not null and not exists (select 1 from auth.users u where u.id = d.auth_user_id);
-- select * from blood_bank.admin a where a.auth_user_id is not null and not exists (select 1 from auth.users u where u.id = a.auth_user_id);

-- B) Delete stale linked rows after verification.
-- delete from blood_bank.patient p where p.auth_user_id is not null and not exists (select 1 from auth.users u where u.id = p.auth_user_id);
-- delete from blood_bank.donor d where d.auth_user_id is not null and not exists (select 1 from auth.users u where u.id = d.auth_user_id);
-- delete from blood_bank.admin a where a.auth_user_id is not null and not exists (select 1 from auth.users u where u.id = a.auth_user_id);

-- C) For old rows that were never linked, delete manually by known identifier.
-- delete from blood_bank.patient where patient_id in (...);
-- delete from blood_bank.donor where lower(email) in ('user1@example.com', 'user2@example.com');

-- D) FK-safe donor purge (for donors that still have inventory/requests/records).
--    Use this when deleting from blood_bank.donor fails with FK 23503.
--
-- 1) Preview what will be removed (replace IDs/emails):
-- with target_donors as (
--   select donor_id
--   from blood_bank.donor
--   where donor_id in (3, 4)
--      or lower(email) in ('user1@example.com', 'user2@example.com')
-- ), target_inventory as (
--   select inventory_id
--   from blood_bank.blood_inventory
--   where donor_id in (select donor_id from target_donors)
-- )
-- select
--   (select count(*) from target_donors) as donors_to_delete,
--   (select count(*) from target_inventory) as inventory_rows_to_delete,
--   (select count(*) from blood_bank.blood_request r where r.inventory_id in (select inventory_id from target_inventory)) as requests_to_delete,
--   (select count(*) from blood_bank.donation_record dr where dr.donor_id in (select donor_id from target_donors)
--      or dr.inventory_id in (select inventory_id from target_inventory)) as donations_to_delete;
--
-- 2) Perform delete in correct order (transactional):
-- begin;
--
-- with target_donors as (
--   select donor_id
--   from blood_bank.donor
--   where donor_id in (3, 4)
--      or lower(email) in ('user1@example.com', 'user2@example.com')
-- ), target_inventory as (
--   select inventory_id
--   from blood_bank.blood_inventory
--   where donor_id in (select donor_id from target_donors)
-- )
-- delete from blood_bank.blood_request r
-- where r.inventory_id in (select inventory_id from target_inventory);
--
-- with target_donors as (
--   select donor_id
--   from blood_bank.donor
--   where donor_id in (3, 4)
--      or lower(email) in ('user1@example.com', 'user2@example.com')
-- ), target_inventory as (
--   select inventory_id
--   from blood_bank.blood_inventory
--   where donor_id in (select donor_id from target_donors)
-- )
-- delete from blood_bank.donation_record dr
-- where dr.donor_id in (select donor_id from target_donors)
--    or dr.inventory_id in (select inventory_id from target_inventory);
--
-- delete from blood_bank.blood_inventory bi
-- where bi.donor_id in (
--   select donor_id
--   from blood_bank.donor
--   where donor_id in (3, 4)
--      or lower(email) in ('user1@example.com', 'user2@example.com')
-- );
--
-- delete from blood_bank.donor d
-- where d.donor_id in (3, 4)
--    or lower(d.email) in ('user1@example.com', 'user2@example.com')
-- returning d.donor_id, d.first_name, d.last_name, d.email;
--
-- commit;
