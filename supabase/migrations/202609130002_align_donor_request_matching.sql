create or replace function blood_bank.get_my_matching_requests()
returns table (
  request_id bigint, blood_type_needed varchar, quantity int,
  urgency_level varchar, request_date timestamptz, status varchar
)
language sql stable security definer
set search_path = blood_bank, public
as $$
  select br.request_id, br.blood_type_needed, br.quantity,
         br.urgency_level, br.request_date, br.status
  from blood_bank.blood_request br
  join blood_bank.donor d on d.auth_user_id = auth.uid()
  where br.status = 'approved'
    and br.verification_status = 'verified'
    and br.community_status = 'active'
    and br.expires_at > now()
    and lower(coalesce(d.availability_status, '')) = 'available'
    and lower(coalesce(d.donor_status, '')) in ('approved', 'donated')
    and (d.last_donation_date is null or d.last_donation_date <= current_date - 90)
    and upper(trim(br.blood_type_needed)) = upper(trim(d.blood_type))
    and not exists (
      select 1 from blood_bank.patient p
      where p.patient_id = br.patient_id and p.auth_user_id = auth.uid()
    )
    and not exists (
      select 1 from blood_bank.donor_pledge dp
      where dp.request_id = br.request_id and dp.donor_id = d.donor_id and dp.status = 'pledged'
    )
  order by case lower(br.urgency_level) when 'critical' then 1 when 'urgent' then 2 else 3 end,
           br.request_date desc;
$$;
revoke all on function blood_bank.get_my_matching_requests() from public;
grant execute on function blood_bank.get_my_matching_requests() to authenticated;

-- Preserve existing authorization, messages, deduplication and audit behavior.
-- Apply the same medical-stage rule to both notification count and insert.
do $migration$
declare definition text;
begin
  definition := pg_get_functiondef('blood_bank.notify_eligible_donors(bigint)'::regprocedure);
  if position('not in (''deferred'', ''incomplete'', ''checked_in'')' in definition) = 0 then
    raise exception 'Expected notification eligibility predicate not found';
  end if;
  definition := replace(definition,
    'not in (''deferred'', ''incomplete'', ''checked_in'')',
    'in (''approved'', ''donated'')');
  execute definition;
end;
$migration$;
