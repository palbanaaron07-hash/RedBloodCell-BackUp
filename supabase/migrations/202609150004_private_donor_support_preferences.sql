-- Support choices are private arrangements between the donor and request owner.
-- Do not store medical self-check responses here.

begin;
set search_path to blood_bank, public;

create table if not exists blood_bank.donor_pledge_support_preferences (
  pledge_id bigint primary key references blood_bank.donor_pledge(pledge_id) on delete cascade,
  support_preferences jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table blood_bank.donor_pledge_support_preferences enable row level security;

drop policy if exists donor_support_preferences_select_private on blood_bank.donor_pledge_support_preferences;
create policy donor_support_preferences_select_private
  on blood_bank.donor_pledge_support_preferences
  for select to authenticated
  using (
    exists (
      select 1 from blood_bank.donor_pledge dp
      join blood_bank.donor d on d.donor_id = dp.donor_id
      where dp.pledge_id = donor_pledge_support_preferences.pledge_id
        and d.auth_user_id = auth.uid()
    )
    or exists (
      select 1 from blood_bank.donor_pledge dp
      join blood_bank.blood_request br on br.request_id = dp.request_id
      join blood_bank.patient p on p.patient_id = br.patient_id
      where dp.pledge_id = donor_pledge_support_preferences.pledge_id
        and p.auth_user_id = auth.uid()
    )
  );

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
declare
  donor_row blood_bank.donor%rowtype;
  request_row blood_bank.blood_request%rowtype;
  pledge_row blood_bank.donor_pledge%rowtype;
  clean_preferences jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(coalesce(p_support_preferences, '[]'::jsonb)) <> 'array' then
    raise exception 'Support preferences must be a list';
  end if;

  select coalesce(jsonb_agg(choice), '[]'::jsonb) into clean_preferences
  from (
    select distinct value as choice
    from jsonb_array_elements_text(coalesce(p_support_preferences, '[]'::jsonb)) as choices(value)
    where value in ('meals', 'travel', 'allowance', 'screening')
  ) selected;

  select * into donor_row from blood_bank.donor where auth_user_id = auth.uid() limit 1;
  if not found then raise exception 'A donor profile is required before responding'; end if;

  perform blood_bank.refresh_community_request_lifecycle();
  select * into request_row from blood_bank.blood_request where request_id = p_request_id for update;
  if not found then raise exception 'Blood request not found'; end if;
  if request_row.community_status <> 'active' then raise exception 'This request is no longer accepting donor responses'; end if;
  if request_row.patient_id in (select patient_id from blood_bank.patient where auth_user_id = auth.uid()) then
    raise exception 'You cannot pledge to your own blood request';
  end if;

  select * into pledge_row from blood_bank.donor_pledge
  where request_id = p_request_id and donor_id = donor_row.donor_id and status = 'pledged' limit 1;
  if found then return to_jsonb(pledge_row); end if;

  insert into blood_bank.donor_pledge (
    request_id, donor_id, units_pledged, pass_reference, preferred_date,
    preferred_time, donor_phone, notes
  ) values (
    p_request_id, donor_row.donor_id, greatest(1, coalesce(p_units, 1)),
    nullif(trim(p_pass_reference), ''), p_preferred_date,
    nullif(trim(p_preferred_time), ''), nullif(trim(p_donor_phone), ''),
    nullif(trim(p_notes), '')
  ) returning * into pledge_row;

  insert into blood_bank.donor_pledge_support_preferences (pledge_id, support_preferences)
  values (pledge_row.pledge_id, clean_preferences);

  return to_jsonb(pledge_row);
end;
$$;

create or replace function blood_bank.get_my_request_support_preferences(p_request_id bigint)
returns table (donor_name text, support_preferences jsonb, pledged_at timestamptz)
language plpgsql
security definer
set search_path = blood_bank, public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from blood_bank.blood_request br
    join blood_bank.patient p on p.patient_id = br.patient_id
    where br.request_id = p_request_id and p.auth_user_id = auth.uid()
  ) then
    raise exception 'Only the requester can view donor support preferences';
  end if;

  return query
  select concat_ws(' ', d.first_name, d.middle_name, d.last_name)::text,
         sp.support_preferences,
         dp.pledged_at
  from blood_bank.donor_pledge dp
  join blood_bank.donor d on d.donor_id = dp.donor_id
  join blood_bank.donor_pledge_support_preferences sp on sp.pledge_id = dp.pledge_id
  where dp.request_id = p_request_id
    and dp.status = 'pledged'
  order by dp.pledged_at desc;
end;
$$;

revoke all on function blood_bank.pledge_to_blood_request(bigint, integer, text, date, text, text, text, jsonb) from public;
revoke all on function blood_bank.get_my_request_support_preferences(bigint) from public;
grant execute on function blood_bank.pledge_to_blood_request(bigint, integer, text, date, text, text, text, jsonb) to authenticated;
grant execute on function blood_bank.get_my_request_support_preferences(bigint) to authenticated;

commit;
notify pgrst, 'reload schema';
