-- Use red-cell donor compatibility for emergency requests, keep replacement
-- campaigns open to every eligible blood type, and notify request owners when
-- a validated donor pledge is created.

begin;
set search_path to blood_bank, public;

create or replace function blood_bank.is_red_cell_compatible(
  p_donor_blood_type text,
  p_recipient_blood_type text
)
returns boolean
language sql
immutable
set search_path = blood_bank, public
as $$
  select upper(replace(trim(coalesce(p_donor_blood_type, '')), ' ', '')) = any (
    case upper(replace(trim(coalesce(p_recipient_blood_type, '')), ' ', ''))
      when 'A+' then array['A+', 'A-', 'O+', 'O-']
      when 'A-' then array['A-', 'O-']
      when 'B+' then array['B+', 'B-', 'O+', 'O-']
      when 'B-' then array['B-', 'O-']
      when 'AB+' then array['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
      when 'AB-' then array['A-', 'B-', 'AB-', 'O-']
      when 'O+' then array['O+', 'O-']
      when 'O-' then array['O-']
      else array[]::text[]
    end
  );
$$;

create or replace function blood_bank.get_my_matching_requests()
returns table (
  request_id bigint, blood_type_needed varchar, quantity int,
  urgency_level varchar, request_date timestamptz, status varchar,
  request_type varchar
)
language sql stable security definer
set search_path = blood_bank, public
as $$
  select br.request_id, br.blood_type_needed, br.quantity,
         br.urgency_level, br.request_date, br.status, br.request_type
  from blood_bank.blood_request br
  join blood_bank.donor d on d.auth_user_id = auth.uid()
  where br.status = 'approved'
    and br.verification_status = 'verified'
    and br.community_status = 'active'
    and (br.request_type = 'replacement' or br.expires_at > now())
    and lower(coalesce(d.availability_status, '')) = 'available'
    and lower(coalesce(d.donor_status, '')) in ('approved', 'donated')
    and (d.last_donation_date is null or d.last_donation_date <= current_date - 90)
    and (
      br.request_type = 'replacement'
      or blood_bank.is_red_cell_compatible(d.blood_type, br.blood_type_needed)
    )
    and not blood_bank.is_requester_donor(
      br.patient_id, d.auth_user_id, d.email, d.contact_number
    )
    and not exists (
      select 1 from blood_bank.donor_pledge dp
      where dp.request_id = br.request_id and dp.donor_id = d.donor_id and dp.status = 'pledged'
    )
  order by case when br.request_type = 'emergency_donor' then 1 else 2 end,
           case lower(br.urgency_level) when 'critical' then 1 when 'urgent' then 2 else 3 end,
           br.request_date desc;
$$;

create or replace function blood_bank.notify_eligible_donors(p_request_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = blood_bank, public
as $$
declare
  request_row blood_bank.blood_request%rowtype;
  eligible_count integer := 0;
  inserted_count integer := 0;
begin
  if not exists (
    select 1 from blood_bank.admin a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  ) then
    raise exception 'Blood donation coordinator access required';
  end if;

  select * into request_row
  from blood_bank.blood_request
  where request_id = p_request_id
  for update;

  if not found then raise exception 'Blood request not found'; end if;
  if request_row.verification_status <> 'verified' or request_row.status <> 'approved' then
    raise exception 'The coordinator must verify this request before notifying donors';
  end if;
  if request_row.community_status <> 'active'
    or (request_row.request_type <> 'replacement' and request_row.expires_at <= now())
  then
    raise exception 'This request is not accepting donor responses';
  end if;

  select count(*)::integer into eligible_count
  from blood_bank.donor d
  where d.auth_user_id is not null
    and (request_row.request_type = 'replacement'
      or blood_bank.is_red_cell_compatible(d.blood_type, request_row.blood_type_needed))
    and lower(coalesce(d.availability_status, '')) = 'available'
    and lower(coalesce(d.donor_status, 'registered')) in ('approved', 'donated')
    and (d.last_donation_date is null or d.last_donation_date <= current_date - 90)
    and not blood_bank.is_requester_donor(
      request_row.patient_id, d.auth_user_id, d.email, d.contact_number
    )
    and not exists (
      select 1 from blood_bank.donor_pledge dp
      where dp.request_id = request_row.request_id
        and dp.donor_id = d.donor_id
        and dp.status = 'pledged'
    );

  insert into blood_bank.notifications (
    recipient_user_id, request_id, notification_type, title, message
  )
  select
    d.auth_user_id,
    request_row.request_id,
    'donor_appeal',
    case when request_row.request_type = 'replacement'
      then 'Hospital replacement donor request'
      else 'Compatible blood request available' end,
    case when request_row.request_type = 'replacement'
      then 'Request #' || request_row.request_id || ' needs ' || request_row.quantity ||
        ' replacement donor(s). Any eligible blood type may respond. Open VeinDrop to review the request.'
      else 'Your ' || d.blood_type || ' blood type can donate to request #' || request_row.request_id ||
        ', which needs ' || request_row.quantity || ' unit(s) of ' || request_row.blood_type_needed ||
        '. Open VeinDrop to review the request and respond if you are able.' end
  from blood_bank.donor d
  where d.auth_user_id is not null
    and (request_row.request_type = 'replacement'
      or blood_bank.is_red_cell_compatible(d.blood_type, request_row.blood_type_needed))
    and lower(coalesce(d.availability_status, '')) = 'available'
    and lower(coalesce(d.donor_status, 'registered')) in ('approved', 'donated')
    and (d.last_donation_date is null or d.last_donation_date <= current_date - 90)
    and not blood_bank.is_requester_donor(
      request_row.patient_id, d.auth_user_id, d.email, d.contact_number
    )
    and not exists (
      select 1 from blood_bank.donor_pledge dp
      where dp.request_id = request_row.request_id
        and dp.donor_id = d.donor_id
        and dp.status = 'pledged'
    )
  on conflict do nothing;

  get diagnostics inserted_count = row_count;

  insert into blood_bank.blood_request_status_log (
    request_id, admin_id, old_status, new_status, reason, note, changed_at
  ) values (
    request_row.request_id,
    coalesce(auth.uid()::text, 'blood-donation-coordinator'),
    request_row.status,
    request_row.status,
    'Compatible donor in-app notification',
    inserted_count || ' new in-app alert(s); ' || eligible_count || ' compatible donor(s) matched.',
    now()
  );

  return jsonb_build_object(
    'eligible_count', eligible_count,
    'notified_count', inserted_count,
    'already_notified_count', greatest(eligible_count - inserted_count, 0)
  );
end;
$$;

create or replace function blood_bank.require_verified_request_for_pledge()
returns trigger
language plpgsql
security definer
set search_path = blood_bank, public
as $$
declare
  request_row blood_bank.blood_request%rowtype;
  donor_row blood_bank.donor%rowtype;
begin
  if new.status <> 'pledged' then return new; end if;

  select * into request_row
  from blood_bank.blood_request
  where request_id = new.request_id;

  if not found
    or request_row.verification_status <> 'verified'
    or request_row.status <> 'approved'
  then
    raise exception 'This request must be verified by a coordinator before donors can respond';
  end if;

  select * into donor_row
  from blood_bank.donor
  where donor_id = new.donor_id;

  if not found then raise exception 'A valid donor profile is required'; end if;
  if lower(coalesce(donor_row.availability_status, '')) <> 'available'
    or lower(coalesce(donor_row.donor_status, 'registered')) not in ('approved', 'donated')
    or (donor_row.last_donation_date is not null
      and donor_row.last_donation_date > current_date - 90)
  then
    raise exception 'Your donor profile is not currently eligible to pledge';
  end if;
  if blood_bank.is_requester_donor(
    request_row.patient_id, donor_row.auth_user_id, donor_row.email, donor_row.contact_number
  ) then
    raise exception 'You cannot pledge to your own blood request';
  end if;
  if request_row.request_type <> 'replacement'
    and not blood_bank.is_red_cell_compatible(donor_row.blood_type, request_row.blood_type_needed)
  then
    raise exception 'Your % blood type is not compatible with the requested % blood type',
      donor_row.blood_type, request_row.blood_type_needed;
  end if;

  return new;
end;
$$;

create or replace function blood_bank.notify_requester_of_pledge()
returns trigger
language plpgsql
security definer
set search_path = blood_bank, public
as $$
declare
  request_row blood_bank.blood_request%rowtype;
  donor_row blood_bank.donor%rowtype;
  donor_name text;
begin
  if new.status <> 'pledged' then return new; end if;

  select * into request_row from blood_bank.blood_request where request_id = new.request_id;
  select * into donor_row from blood_bank.donor where donor_id = new.donor_id;
  donor_name := concat_ws(' ', donor_row.first_name, donor_row.middle_name, donor_row.last_name);

  insert into blood_bank.notifications (
    recipient_user_id, request_id, notification_type, title, message
  )
  select
    p.auth_user_id,
    request_row.request_id,
    'pledge_received',
    case when request_row.request_type = 'replacement'
      then 'Replacement donor pledged'
      else 'Compatible donor pledged' end,
    case when request_row.request_type = 'replacement'
      then donor_name || ' (' || donor_row.blood_type || ') pledged ' || new.units_pledged ||
        ' replacement unit(s) for request #' || request_row.request_id ||
        '. The donation will count after facility confirmation.'
      else donor_name || ' pledged ' || new.units_pledged || ' unit(s) for request #' ||
        request_row.request_id || '. Their ' || donor_row.blood_type ||
        ' blood type is compatible with the requested ' || request_row.blood_type_needed || ' type.' end
  from blood_bank.patient p
  where p.patient_id = request_row.patient_id
    and p.auth_user_id is not null;

  return new;
end;
$$;

drop trigger if exists trg_require_verified_request_for_pledge on blood_bank.donor_pledge;
create trigger trg_require_verified_request_for_pledge
before insert or update of status, request_id, donor_id on blood_bank.donor_pledge
for each row execute function blood_bank.require_verified_request_for_pledge();

drop trigger if exists trg_notify_requester_of_pledge on blood_bank.donor_pledge;
create trigger trg_notify_requester_of_pledge
after insert on blood_bank.donor_pledge
for each row execute function blood_bank.notify_requester_of_pledge();

revoke all on function blood_bank.is_red_cell_compatible(text, text) from public;
revoke all on function blood_bank.require_verified_request_for_pledge() from public;
revoke all on function blood_bank.notify_requester_of_pledge() from public;
revoke all on function blood_bank.get_my_matching_requests() from public;
revoke all on function blood_bank.notify_eligible_donors(bigint) from public;
grant execute on function blood_bank.get_my_matching_requests() to authenticated;
grant execute on function blood_bank.notify_eligible_donors(bigint) to authenticated;

commit;
notify pgrst, 'reload schema';
