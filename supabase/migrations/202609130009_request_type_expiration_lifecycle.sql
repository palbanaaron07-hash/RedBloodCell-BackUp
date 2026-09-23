begin;

-- Emergency donor requests remain time-sensitive. Replacement campaigns do not
-- expire on a timer because completion depends on facility-confirmed donations.
alter table blood_bank.blood_request
  alter column expires_at drop not null;

create or replace function blood_bank.set_request_expiration_by_type()
returns trigger
language plpgsql
set search_path = blood_bank, public
as $$
begin
  if new.request_type = 'replacement' then
    new.expires_at := null;
  elsif new.expires_at is null then
    new.expires_at := coalesce(new.request_date, now()) + interval '72 hours';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_request_expiration_by_type on blood_bank.blood_request;
create trigger trg_set_request_expiration_by_type
before insert or update of request_type, request_date on blood_bank.blood_request
for each row execute function blood_bank.set_request_expiration_by_type();

-- Restore still-open replacement campaigns that the old universal timer archived.
update blood_bank.blood_request br
set expires_at = null,
    community_status = case
      when lower(coalesce(br.status, '')) = 'fulfilled' then 'fulfilled'
      when lower(coalesce(br.status, '')) in ('cancelled', 'canceled', 'rejected', 'declined') then 'expired'
      when coalesce((
        select sum(dp.units_pledged)
        from blood_bank.donor_pledge dp
        where dp.request_id = br.request_id and dp.status = 'pledged'
      ), 0) >= greatest(br.quantity, 1) then 'covered'
      else 'active'
    end
where br.request_type = 'replacement';

update blood_bank.replacement_campaign rc
set status = case
      when lower(coalesce(br.status, '')) = 'fulfilled' then 'complete'
      when lower(coalesce(br.status, '')) in ('cancelled', 'canceled', 'rejected', 'declined') then 'cancelled'
      when lower(coalesce(br.verification_status, 'pending')) <> 'verified' then 'pending_verification'
      when rc.pledged_units >= rc.target_units then 'pledged'
      else 'active'
    end,
    updated_at = now()
from blood_bank.blood_request br
where br.request_id = rc.request_id
  and br.request_type = 'replacement'
  and rc.status <> 'complete';

create or replace function blood_bank.refresh_one_request_coverage(p_request_id bigint)
returns void
language plpgsql
security definer
set search_path = blood_bank, public
as $$
declare
  request_row blood_bank.blood_request%rowtype;
  pledged_units integer;
begin
  select * into request_row
  from blood_bank.blood_request
  where request_id = p_request_id
  for update;

  if not found or request_row.community_status in ('fulfilled', 'expired') then
    return;
  end if;

  if request_row.request_type <> 'replacement' and request_row.expires_at <= now() then
    update blood_bank.blood_request
    set community_status = 'expired'
    where request_id = p_request_id;
    return;
  end if;

  select coalesce(sum(units_pledged), 0)::integer into pledged_units
  from blood_bank.donor_pledge
  where request_id = p_request_id and status = 'pledged';

  update blood_bank.blood_request
  set community_status = case
    when pledged_units >= greatest(quantity, 1) then 'covered'
    else 'active'
  end
  where request_id = p_request_id;
end;
$$;

create or replace function blood_bank.refresh_community_request_lifecycle()
returns integer
language plpgsql
security definer
set search_path = blood_bank, public
as $$
declare
  affected integer;
begin
  update blood_bank.blood_request
  set community_status = 'expired'
  where community_status in ('active', 'covered')
    and request_type <> 'replacement'
    and expires_at is not null
    and expires_at <= now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;

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
    and (br.request_type = 'replacement' or br.expires_at > now())
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

-- Preserve the existing authorization and behavior of related RPCs while making
-- their expiry checks request-type aware.
do $migration$
declare
  routine record;
  definition text;
  updated_definition text;
begin
  for routine in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'blood_bank'
      and p.proname in ('notify_eligible_donors', 'verify_blood_request',
        'rhu_verify_request', 'manage_my_blood_request')
  loop
    definition := pg_get_functiondef(routine.oid);
    updated_definition := replace(
      definition,
      'request_row.expires_at <= now()',
      '(request_row.request_type <> ''replacement'' and request_row.expires_at <= now())'
    );
    if updated_definition is distinct from definition then
      execute updated_definition;
    elsif routine.proname = 'notify_eligible_donors' then
      raise exception 'Expected donor notification expiry check was not found';
    end if;
  end loop;
end;
$migration$;

revoke all on function blood_bank.set_request_expiration_by_type() from public;
revoke all on function blood_bank.refresh_one_request_coverage(bigint) from public;
revoke all on function blood_bank.refresh_community_request_lifecycle() from public;
revoke all on function blood_bank.get_my_matching_requests() from public;
grant execute on function blood_bank.refresh_community_request_lifecycle() to authenticated;
grant execute on function blood_bank.get_my_matching_requests() to authenticated;

commit;
notify pgrst, 'reload schema';
