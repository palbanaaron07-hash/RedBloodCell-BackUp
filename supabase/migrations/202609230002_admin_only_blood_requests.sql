-- Retire the community-request workflow without deleting historical records.
-- New blood requests are handled privately by authorized blood bank admins.

begin;
set search_path to blood_bank, public;

-- Keep the existing RPC contract for older clients, but never expose requests
-- as donor matches.
create or replace function blood_bank.get_my_matching_requests()
returns table (
  request_id bigint,
  blood_type_needed varchar,
  quantity int,
  urgency_level varchar,
  request_date timestamptz,
  status varchar,
  request_type varchar
)
language sql
stable
security definer
set search_path = blood_bank, public
as $$
  select
    br.request_id,
    br.blood_type_needed,
    br.quantity,
    br.urgency_level,
    br.request_date,
    br.status,
    br.request_type
  from blood_bank.blood_request br
  where false;
$$;

-- Older admin clients must not be able to publish donor appeals.
create or replace function blood_bank.notify_eligible_donors(p_request_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = blood_bank, public
as $$
begin
  raise exception 'Community donor notifications are disabled. Blood requests are handled privately by the blood bank admin.';
end;
$$;

-- Preserve historical pledge rows, while rejecting every new pledge or
-- transition into the pledged state.
create or replace function blood_bank.require_verified_request_for_pledge()
returns trigger
language plpgsql
security definer
set search_path = blood_bank, public
as $$
begin
  if tg_op = 'INSERT'
    or (
      tg_op = 'UPDATE'
      and new.status = 'pledged'
      and old.status is distinct from new.status
    )
  then
    raise exception 'Community donor responses are disabled. Blood requests are handled privately by the blood bank admin.';
  end if;

  return new;
end;
$$;

-- Replace the latest eight-argument RPC so cached/older frontends fail safely.
create or replace function blood_bank.pledge_to_blood_request(
  p_request_id bigint,
  p_units integer default 1,
  p_pass_reference text default null,
  p_preferred_date date default null,
  p_preferred_time text default null,
  p_donor_phone text default null,
  p_notes text default null,
  p_support_preferences jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = blood_bank, public
as $$
begin
  raise exception 'Community donor responses are disabled. Blood requests are handled privately by the blood bank admin.';
end;
$$;

revoke all on function blood_bank.get_my_matching_requests() from public;
revoke all on function blood_bank.notify_eligible_donors(bigint) from public;
revoke all on function blood_bank.require_verified_request_for_pledge() from public;
revoke all on function blood_bank.pledge_to_blood_request(bigint, integer, text, date, text, text, text, jsonb) from public;

grant execute on function blood_bank.get_my_matching_requests() to authenticated;
grant execute on function blood_bank.notify_eligible_donors(bigint) to authenticated;
grant execute on function blood_bank.pledge_to_blood_request(bigint, integer, text, date, text, text, text, jsonb) to authenticated;

commit;
notify pgrst, 'reload schema';