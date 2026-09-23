-- ============================================================
-- VeinDrop - One auth account with Patient and/or Donor profiles
-- Additive and backward-compatible: no IDs or existing relations change.
-- ============================================================

begin;

set search_path to blood_bank, public;

-- Link each optional domain profile to the same Supabase Auth identity.
alter table blood_bank.patient add column if not exists auth_user_id uuid;
alter table blood_bank.patient add column if not exists email varchar(255);
alter table blood_bank.donor add column if not exists auth_user_id uuid;
alter table blood_bank.donor add column if not exists donor_status varchar(30) not null default 'registered';
alter table blood_bank.donor add column if not exists check_in_date timestamptz;
alter table blood_bank.donor add column if not exists deferred_reason text;
alter table blood_bank.donor add column if not exists show_on_map boolean not null default false;
alter table blood_bank.donor add column if not exists location_status varchar(30) not null default 'needs_review';
alter table blood_bank.donor add column if not exists map_area varchar(120);

-- The existing donor form offers values longer than the original varchar(10).
alter table blood_bank.donor alter column gender type varchar(30);

-- Preserve and link existing records wherever the current application already
-- stored a patient_id in auth metadata or used the same donor email.
update blood_bank.patient p
set auth_user_id = u.id,
    email = coalesce(nullif(trim(p.email), ''), u.email)
from auth.users u
where p.auth_user_id is null
  and nullif(u.raw_user_meta_data->>'patient_id', '') ~ '^[0-9]+$'
  and p.patient_id = (u.raw_user_meta_data->>'patient_id')::bigint;

update blood_bank.patient p
set email = u.email
from auth.users u
where p.auth_user_id = u.id
  and (p.email is null or trim(p.email) = '');

update blood_bank.donor d
set auth_user_id = u.id
from auth.users u
where d.auth_user_id is null
  and d.email is not null
  and lower(d.email) = lower(u.email)
  and not exists (
    select 1
    from blood_bank.donor linked
    where linked.auth_user_id = u.id
  );

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
end $$;

create unique index if not exists uq_patient_auth_user_id
  on blood_bank.patient(auth_user_id)
  where auth_user_id is not null;

create unique index if not exists uq_donor_auth_user_id
  on blood_bank.donor(auth_user_id)
  where auth_user_id is not null;

-- Return only the signed-in user's linked profiles. Role/capability checks use
-- these database links; editable auth metadata is never authoritative.
create or replace function blood_bank.get_my_account_profiles()
returns jsonb
language plpgsql
security definer
set search_path = blood_bank, public
as $$
declare
  current_user_id uuid := auth.uid();
  patient_profile jsonb;
  donor_profile jsonb;
  account_roles jsonb := '[]'::jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select to_jsonb(p) into patient_profile
  from blood_bank.patient p
  where p.auth_user_id = current_user_id
  limit 1;

  select to_jsonb(d) into donor_profile
  from blood_bank.donor d
  where d.auth_user_id = current_user_id
  limit 1;

  if patient_profile is not null then
    account_roles := account_roles || '"patient"'::jsonb;
  end if;
  if donor_profile is not null then
    account_roles := account_roles || '"donor"'::jsonb;
  end if;

  return jsonb_build_object(
    'roles', account_roles,
    'patient', patient_profile,
    'donor', donor_profile
  );
end;
$$;

-- Create or link a patient profile for the current auth user. Existing patient
-- rows, requests, and IDs are retained.
create or replace function blood_bank.activate_my_patient_profile(
  p_first_name text default null,
  p_middle_name text default null,
  p_last_name text default null,
  p_blood_type text default null,
  p_contact_number text default null,
  p_address text default null
)
returns blood_bank.patient
language plpgsql
security definer
set search_path = blood_bank, public
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := lower(coalesce(auth.jwt()->>'email', ''));
  metadata jsonb := coalesce(auth.jwt()->'user_metadata', '{}'::jsonb);
  normalized_blood_type text;
  result blood_bank.patient%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if current_email in ('admin@bloodconnect.com', 'adminblood@gmail.com') or exists (
    select 1 from blood_bank.admin a
    where lower(a.email) = current_email
  ) then
    raise exception 'Admin accounts cannot activate patient features.' using errcode = '42501';
  end if;

  normalized_blood_type := upper(replace(coalesce(nullif(trim(p_blood_type), ''), metadata->>'blood_type', ''), ' ', ''));
  if normalized_blood_type not in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') then
    raise exception 'A valid blood type is required.' using errcode = '22023';
  end if;

  select * into result
  from blood_bank.patient
  where auth_user_id = current_user_id
  limit 1
  for update;

  if found then
    update blood_bank.patient
    set first_name = coalesce(nullif(trim(p_first_name), ''), result.first_name),
        middle_name = coalesce(nullif(trim(p_middle_name), ''), result.middle_name),
        last_name = coalesce(nullif(trim(p_last_name), ''), result.last_name),
        blood_type_needed = normalized_blood_type,
        contact_number = coalesce(nullif(trim(p_contact_number), ''), result.contact_number),
        address = coalesce(nullif(trim(p_address), ''), result.address),
        email = coalesce(nullif(current_email, ''), result.email)
    where patient_id = result.patient_id
    returning * into result;
    return result;
  end if;

  -- Link the exact legacy patient row referenced by existing auth metadata.
  if nullif(metadata->>'patient_id', '') ~ '^[0-9]+$' then
    update blood_bank.patient
    set auth_user_id = current_user_id,
        email = coalesce(nullif(current_email, ''), email)
    where patient_id = (metadata->>'patient_id')::bigint
      and auth_user_id is null
    returning * into result;
    if found then return result; end if;
  end if;

  insert into blood_bank.patient (
    auth_user_id, email, first_name, middle_name, last_name,
    blood_type_needed, hospital_name, contact_number, address
  ) values (
    current_user_id,
    nullif(current_email, ''),
    coalesce(nullif(trim(p_first_name), ''), nullif(trim(metadata->>'first_name'), ''), 'Patient'),
    nullif(trim(coalesce(p_middle_name, metadata->>'middle_name', '')), ''),
    coalesce(nullif(trim(p_last_name), ''), nullif(trim(metadata->>'last_name'), ''), 'User'),
    normalized_blood_type,
    null,
    nullif(trim(coalesce(p_contact_number, metadata->>'phone', '')), ''),
    nullif(trim(coalesce(p_address, metadata->>'address', '')), '')
  )
  returning * into result;

  return result;
end;
$$;

-- Create or link a donor profile for the current auth user. The established
-- registration status and admin screening lifecycle are reused unchanged.
create or replace function blood_bank.activate_my_donor_profile(
  p_first_name text default null,
  p_middle_name text default null,
  p_last_name text default null,
  p_contact_number text default null,
  p_blood_type text default null,
  p_gender text default null,
  p_date_of_birth date default null,
  p_address text default null
)
returns blood_bank.donor
language plpgsql
security definer
set search_path = blood_bank, public
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := lower(coalesce(auth.jwt()->>'email', ''));
  metadata jsonb := coalesce(auth.jwt()->'user_metadata', '{}'::jsonb);
  normalized_blood_type text;
  birth_date date := coalesce(p_date_of_birth, nullif(metadata->>'dob', '')::date);
  result blood_bank.donor%rowtype;
  conflicting_donor_id bigint;
begin
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if current_email = '' then
    raise exception 'A verified account email is required.' using errcode = '22023';
  end if;
  if current_email in ('admin@bloodconnect.com', 'adminblood@gmail.com') or exists (
    select 1 from blood_bank.admin a
    where lower(a.email) = current_email
  ) then
    raise exception 'Admin accounts cannot activate donor features.' using errcode = '42501';
  end if;

  normalized_blood_type := upper(replace(coalesce(nullif(trim(p_blood_type), ''), metadata->>'blood_type', ''), ' ', ''));
  if normalized_blood_type not in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') then
    raise exception 'A valid blood type is required.' using errcode = '22023';
  end if;
  if birth_date is null or birth_date > current_date - interval '18 years' then
    raise exception 'You must be at least 18 years old to register as a donor.' using errcode = '22023';
  end if;

  if nullif(trim(p_contact_number), '') is not null then
    select donor_id into conflicting_donor_id
    from blood_bank.donor
    where contact_number = trim(p_contact_number)
      and auth_user_id is distinct from current_user_id
    limit 1;
    if conflicting_donor_id is not null then
      raise exception 'This phone number is already registered to another donor.' using errcode = '23505';
    end if;
  end if;

  select * into result
  from blood_bank.donor
  where auth_user_id = current_user_id
  limit 1
  for update;

  if not found then
    select * into result
    from blood_bank.donor
    where lower(email) = current_email
    limit 1
    for update;

    if found and result.auth_user_id is not null and result.auth_user_id <> current_user_id then
      raise exception 'This donor email is linked to another account.' using errcode = '23505';
    end if;
  end if;

  if found then
    update blood_bank.donor
    set auth_user_id = current_user_id,
        first_name = coalesce(nullif(trim(p_first_name), ''), result.first_name),
        middle_name = coalesce(nullif(trim(p_middle_name), ''), result.middle_name),
        last_name = coalesce(nullif(trim(p_last_name), ''), result.last_name),
        email = current_email,
        contact_number = coalesce(nullif(trim(p_contact_number), ''), result.contact_number),
        blood_type = normalized_blood_type,
        gender = coalesce(nullif(trim(p_gender), ''), result.gender),
        date_of_birth = birth_date,
        address = coalesce(nullif(trim(p_address), ''), result.address)
    where donor_id = result.donor_id
    returning * into result;
    return result;
  end if;

  insert into blood_bank.donor (
    auth_user_id, first_name, middle_name, last_name, email,
    contact_number, blood_type, gender, date_of_birth, address,
    availability_status, donor_status
  ) values (
    current_user_id,
    coalesce(nullif(trim(p_first_name), ''), nullif(trim(metadata->>'first_name'), ''), 'Donor'),
    nullif(trim(coalesce(p_middle_name, metadata->>'middle_name', '')), ''),
    coalesce(nullif(trim(p_last_name), ''), nullif(trim(metadata->>'last_name'), ''), 'User'),
    current_email,
    nullif(trim(coalesce(p_contact_number, metadata->>'phone', '')), ''),
    normalized_blood_type,
    nullif(trim(coalesce(p_gender, metadata->>'gender', '')), ''),
    birth_date,
    nullif(trim(coalesce(p_address, metadata->>'address', '')), ''),
    'available',
    'registered'
  )
  returning * into result;

  return result;
end;
$$;

-- Donors may pause their own availability, but cannot bypass a medical
-- deferral or the established 90-day donation waiting period.
create or replace function blood_bank.set_my_donor_availability(p_is_available boolean)
returns blood_bank.donor
language plpgsql
security definer
set search_path = blood_bank, public
as $$
declare
  current_user_id uuid := auth.uid();
  result blood_bank.donor%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into result
  from blood_bank.donor
  where auth_user_id = current_user_id
  limit 1
  for update;

  if not found then
    raise exception 'No donor profile is linked to this account.' using errcode = 'P0002';
  end if;

  if p_is_available and result.donor_status = 'deferred' then
    raise exception 'A deferred donor must be cleared by staff before becoming available.' using errcode = '22023';
  end if;

  if p_is_available
     and result.last_donation_date is not null
     and current_date - result.last_donation_date < 90 then
    raise exception 'You are still within the required 90-day donation waiting period.' using errcode = '22023';
  end if;

  update blood_bank.donor
  set availability_status = case when p_is_available then 'available' else 'unavailable' end
  where donor_id = result.donor_id
  returning * into result;

  return result;
end;
$$;

-- Privacy-safe donor-facing history and matching request summaries.
create or replace function blood_bank.get_my_donation_history()
returns table (
  donation_id bigint,
  blood_type varchar,
  quantity int,
  donation_date date
)
language sql
security definer
set search_path = blood_bank, public
as $$
  select dr.donation_id, dr.blood_type, dr.quantity, dr.donation_date
  from blood_bank.donation_record dr
  join blood_bank.donor d on d.donor_id = dr.donor_id
  where d.auth_user_id = auth.uid()
  order by dr.donation_date desc, dr.donation_id desc;
$$;

create or replace function blood_bank.get_my_matching_requests()
returns table (
  request_id bigint,
  blood_type_needed varchar,
  quantity int,
  urgency_level varchar,
  request_date timestamptz,
  status varchar
)
language sql
security definer
set search_path = blood_bank, public
as $$
  select br.request_id, br.blood_type_needed, br.quantity,
         br.urgency_level, br.request_date, br.status
  from blood_bank.blood_request br
  join blood_bank.donor d on d.auth_user_id = auth.uid()
  where lower(br.status) = 'approved'
    and upper(replace(br.blood_type_needed, ' ', '')) = any (
      case upper(replace(d.blood_type, ' ', ''))
        when 'O-' then array['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+']::text[]
        when 'O+' then array['O+', 'A+', 'B+', 'AB+']::text[]
        when 'A-' then array['A-', 'A+', 'AB-', 'AB+']::text[]
        when 'A+' then array['A+', 'AB+']::text[]
        when 'B-' then array['B-', 'B+', 'AB-', 'AB+']::text[]
        when 'B+' then array['B+', 'AB+']::text[]
        when 'AB-' then array['AB-', 'AB+']::text[]
        when 'AB+' then array['AB+']::text[]
        else array[]::text[]
      end
    )
  order by
    case lower(br.urgency_level)
      when 'critical' then 1 when 'urgent' then 2 else 3
    end,
    br.request_date desc;
$$;

-- Public-facing donor maps need only an approximate area and availability.
-- Keep donor identity and contact information out of ordinary authenticated clients.
create or replace function blood_bank.list_visible_donors()
returns table (
  donor_id bigint,
  blood_type varchar,
  availability_status varchar,
  donor_status varchar,
  show_on_map boolean,
  location_status varchar,
  map_area varchar,
  last_donation_date date
)
language sql
stable
security definer
set search_path = blood_bank, public
as $$
  select d.donor_id, d.blood_type, d.availability_status,
         coalesce(d.donor_status, 'registered'::varchar),
         d.show_on_map, d.location_status, d.map_area, d.last_donation_date
  from blood_bank.donor d
  where auth.uid() is not null
    and d.show_on_map is true
    and lower(coalesce(d.location_status, '')) = 'verified'
    and (
      lower(coalesce(d.availability_status, '')) = 'available'
      or lower(coalesce(d.donor_status, '')) in ('approved', 'registered')
    )
  order by d.donor_id;
$$;

revoke all on function blood_bank.get_my_account_profiles() from public;
revoke all on function blood_bank.activate_my_patient_profile(text, text, text, text, text, text) from public;
revoke all on function blood_bank.activate_my_donor_profile(text, text, text, text, text, text, date, text) from public;
revoke all on function blood_bank.set_my_donor_availability(boolean) from public;
revoke all on function blood_bank.get_my_donation_history() from public;
revoke all on function blood_bank.get_my_matching_requests() from public;
revoke all on function blood_bank.list_visible_donors() from public;

grant execute on function blood_bank.get_my_account_profiles() to authenticated;
grant execute on function blood_bank.activate_my_patient_profile(text, text, text, text, text, text) to authenticated;
grant execute on function blood_bank.activate_my_donor_profile(text, text, text, text, text, text, date, text) to authenticated;
grant execute on function blood_bank.set_my_donor_availability(boolean) to authenticated;
grant execute on function blood_bank.get_my_donation_history() to authenticated;
grant execute on function blood_bank.get_my_matching_requests() to authenticated;
grant execute on function blood_bank.list_visible_donors() to authenticated;
grant usage on schema blood_bank to authenticated;

commit;

notify pgrst, 'reload schema';
