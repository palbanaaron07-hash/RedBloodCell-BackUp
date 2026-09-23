begin;

-- Replacement donors replenish blood used for a patient. They are not matched
-- as though the patient were still waiting for a specific compatible unit.
drop function if exists blood_bank.get_my_matching_requests();
create function blood_bank.get_my_matching_requests()
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
      or upper(trim(br.blood_type_needed)) = upper(trim(d.blood_type))
    )
    and not exists (
      select 1 from blood_bank.patient p
      where p.patient_id = br.patient_id and p.auth_user_id = auth.uid()
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
      or upper(trim(d.blood_type)) = upper(trim(request_row.blood_type_needed)))
    and lower(coalesce(d.availability_status, '')) = 'available'
    and lower(coalesce(d.donor_status, 'registered')) in ('approved', 'donated')
    and (d.last_donation_date is null or d.last_donation_date <= current_date - 90)
    and not exists (
      select 1 from blood_bank.patient p
      where p.patient_id = request_row.patient_id and p.auth_user_id = d.auth_user_id
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
      else 'Coordinator-verified blood appeal' end,
    case when request_row.request_type = 'replacement'
      then 'Request #' || request_row.request_id || ' needs ' || request_row.quantity ||
        ' replacement donor(s). Any eligible blood type may respond. Open VeinDrop to review the request.'
      else 'Request #' || request_row.request_id || ' needs ' || request_row.quantity ||
        ' unit(s) of ' || request_row.blood_type_needed ||
        '. Open VeinDrop to review the request and respond if you are able.' end
  from blood_bank.donor d
  where d.auth_user_id is not null
    and (request_row.request_type = 'replacement'
      or upper(trim(d.blood_type)) = upper(trim(request_row.blood_type_needed)))
    and lower(coalesce(d.availability_status, '')) = 'available'
    and lower(coalesce(d.donor_status, 'registered')) in ('approved', 'donated')
    and (d.last_donation_date is null or d.last_donation_date <= current_date - 90)
    and not exists (
      select 1 from blood_bank.patient p
      where p.patient_id = request_row.patient_id and p.auth_user_id = d.auth_user_id
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
    'Eligible donor in-app notification',
    inserted_count || ' new in-app alert(s); ' || eligible_count || ' eligible donor(s) matched.',
    now()
  );

  return jsonb_build_object(
    'eligible_count', eligible_count,
    'notified_count', inserted_count,
    'already_notified_count', greatest(eligible_count - inserted_count, 0)
  );
end;
$$;

revoke all on function blood_bank.get_my_matching_requests() from public;
revoke all on function blood_bank.notify_eligible_donors(bigint) from public;
grant execute on function blood_bank.get_my_matching_requests() to authenticated;
grant execute on function blood_bank.notify_eligible_donors(bigint) to authenticated;

commit;
notify pgrst, 'reload schema';
