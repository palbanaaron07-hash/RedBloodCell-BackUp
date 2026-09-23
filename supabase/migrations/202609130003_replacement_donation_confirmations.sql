begin;

create table if not exists blood_bank.replacement_donation_confirmation (
  confirmation_id bigint generated always as identity primary key,
  request_id bigint not null references blood_bank.blood_request(request_id) on update cascade on delete cascade,
  units_confirmed integer not null check (units_confirmed > 0),
  donation_date date not null,
  receiving_facility varchar(180) not null check (nullif(trim(receiving_facility), '') is not null),
  confirmation_reference varchar(120) not null check (nullif(trim(confirmation_reference), '') is not null),
  donor_source varchar(20) not null check (donor_source in ('app', 'external')),
  donor_id bigint references blood_bank.donor(donor_id) on update cascade on delete restrict,
  coordinator_note text,
  recorded_by uuid not null default auth.uid(),
  recorded_at timestamptz not null default now(),
  voided_at timestamptz, voided_by uuid, void_reason text,
  check ((donor_source = 'app' and donor_id is not null) or (donor_source = 'external' and donor_id is null))
);
create unique index if not exists uq_replacement_confirmation_reference
  on blood_bank.replacement_donation_confirmation
  (request_id, lower(trim(receiving_facility)), lower(trim(confirmation_reference)))
  where voided_at is null;
create index if not exists idx_replacement_confirmation_request
  on blood_bank.replacement_donation_confirmation(request_id, recorded_at desc);
alter table blood_bank.replacement_donation_confirmation enable row level security;
drop policy if exists replacement_confirmation_admin_read on blood_bank.replacement_donation_confirmation;
create policy replacement_confirmation_admin_read on blood_bank.replacement_donation_confirmation
  for select to authenticated using (exists (
    select 1 from blood_bank.admin a where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  ));

create or replace function blood_bank.refresh_replacement_confirmation_progress(p_request_id bigint)
returns blood_bank.replacement_campaign language plpgsql security definer set search_path = blood_bank, public
as $$
declare campaign blood_bank.replacement_campaign%rowtype; total integer;
begin
  select * into campaign from blood_bank.replacement_campaign where request_id = p_request_id for update;
  if not found then raise exception 'Replacement campaign not found'; end if;
  select coalesce(sum(units_confirmed), 0)::integer into total
    from blood_bank.replacement_donation_confirmation where request_id = p_request_id and voided_at is null;
  update blood_bank.replacement_campaign set confirmed_units = total,
    status = case when total >= target_units then 'complete'
      when status = 'pending_verification' then 'pending_verification'
      when pledged_units >= target_units then 'pledged' else 'active' end,
    completed_at = case when total >= target_units then coalesce(completed_at, now()) else null end,
    updated_at = now()
    where request_id = p_request_id returning * into campaign;
  update blood_bank.blood_request set
    status = case when total >= campaign.target_units then 'fulfilled' else status end,
    community_status = case when total >= campaign.target_units then 'fulfilled' else community_status end,
    community_fulfilled_at = case when total >= campaign.target_units then coalesce(community_fulfilled_at, now()) else community_fulfilled_at end
    where request_id = p_request_id;
  return campaign;
end; $$;

create or replace function blood_bank.record_replacement_donation(
  p_request_id bigint, p_units integer, p_donation_date date, p_receiving_facility text,
  p_confirmation_reference text, p_donor_source text, p_donor_id bigint default null, p_note text default null
) returns jsonb language plpgsql security definer set search_path = blood_bank, public
as $$
declare request_row blood_bank.blood_request%rowtype; campaign blood_bank.replacement_campaign%rowtype;
  entry blood_bank.replacement_donation_confirmation%rowtype; current_total integer;
begin
  if not exists (select 1 from blood_bank.admin a where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  then raise exception 'Blood donation coordinator access required'; end if;
  if p_units is null or p_units <= 0 then raise exception 'Confirmed units must be greater than zero'; end if;
  if p_donation_date is null or p_donation_date > current_date then raise exception 'Enter a valid donation date that is not in the future'; end if;
  if nullif(trim(p_receiving_facility), '') is null then raise exception 'Receiving facility is required'; end if;
  if nullif(trim(p_confirmation_reference), '') is null then raise exception 'Facility confirmation reference is required'; end if;
  if p_donor_source not in ('app', 'external') then raise exception 'Select App donor or External donor'; end if;
  if (p_donor_source = 'app' and p_donor_id is null) or (p_donor_source = 'external' and p_donor_id is not null)
  then raise exception 'App donor requires a donor ID; external donor must not use an app donor ID'; end if;
  if p_donor_id is not null and not exists (select 1 from blood_bank.donor where donor_id = p_donor_id)
  then raise exception 'App donor not found'; end if;
  select * into request_row from blood_bank.blood_request where request_id = p_request_id for update;
  if not found then raise exception 'Blood request not found'; end if;
  if request_row.request_type <> 'replacement' then raise exception 'Only hospital replacement requests accept replacement donation confirmations'; end if;
  if request_row.verification_status <> 'verified' then raise exception 'The request must be verified before recording replacement donations'; end if;
  select * into campaign from blood_bank.replacement_campaign where request_id = p_request_id for update;
  if not found then raise exception 'Replacement campaign not found'; end if;
  if campaign.status in ('complete', 'cancelled') or request_row.status = 'fulfilled'
  then raise exception 'This replacement request is already closed'; end if;
  select coalesce(sum(units_confirmed), 0)::integer into current_total
    from blood_bank.replacement_donation_confirmation where request_id = p_request_id and voided_at is null;
  if current_total + p_units > campaign.target_units
  then raise exception 'Confirmed units would exceed the replacement target (% of % already confirmed)', current_total, campaign.target_units; end if;
  insert into blood_bank.replacement_donation_confirmation (
    request_id, units_confirmed, donation_date, receiving_facility, confirmation_reference,
    donor_source, donor_id, coordinator_note
  ) values (
    p_request_id, p_units, p_donation_date, trim(p_receiving_facility), trim(p_confirmation_reference),
    p_donor_source, p_donor_id, nullif(trim(p_note), '')
  ) returning * into entry;
  if p_donor_id is not null then
    update blood_bank.donor set
      last_donation_date = greatest(coalesce(last_donation_date, p_donation_date), p_donation_date),
      donor_status = 'donated',
      availability_status = case when current_date - p_donation_date < 90 then 'unavailable' else availability_status end
    where donor_id = p_donor_id;
  end if;
  campaign := blood_bank.refresh_replacement_confirmation_progress(p_request_id);
  return jsonb_build_object('confirmation', to_jsonb(entry), 'campaign', to_jsonb(campaign));
exception when unique_violation then
  raise exception 'This facility confirmation reference has already been recorded for the request';
end; $$;

create or replace function blood_bank.list_replacement_donations(p_request_id bigint)
returns table (
  confirmation_id bigint, units_confirmed integer, donation_date date, receiving_facility varchar,
  confirmation_reference varchar, donor_source varchar, donor_id bigint, donor_display text,
  coordinator_note text, recorded_at timestamptz
) language sql stable security definer set search_path = blood_bank, public
as $$
  select c.confirmation_id, c.units_confirmed, c.donation_date, c.receiving_facility,
    c.confirmation_reference, c.donor_source, c.donor_id,
    case when c.donor_source = 'app' then concat_ws(' ', d.first_name, d.last_name) else 'External donor' end,
    c.coordinator_note, c.recorded_at
  from blood_bank.replacement_donation_confirmation c left join blood_bank.donor d on d.donor_id = c.donor_id
  where c.request_id = p_request_id and c.voided_at is null
    and exists (select 1 from blood_bank.admin a where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  order by c.donation_date desc, c.confirmation_id desc;
$$;

create or replace function blood_bank.get_my_donation_history()
returns table (
  donation_id bigint, blood_type varchar, quantity int, donation_date date,
  status varchar, notes text
) language sql stable security definer set search_path = blood_bank, public
as $$
  select dr.donation_id, dr.blood_type, dr.quantity, dr.donation_date,
    coalesce(dr.status, 'completed')::varchar, coalesce(dr.notes, dr.reason, '')::text
  from blood_bank.donation_record dr join blood_bank.donor d on d.donor_id = dr.donor_id
  where d.auth_user_id = auth.uid()
  union all
  select -c.confirmation_id, d.blood_type, c.units_confirmed, c.donation_date,
    'completed'::varchar, ('Replacement donation confirmed by ' || c.receiving_facility)::text
  from blood_bank.replacement_donation_confirmation c join blood_bank.donor d on d.donor_id = c.donor_id
  where d.auth_user_id = auth.uid() and c.voided_at is null
  order by donation_date desc, donation_id desc;
$$;

create or replace function blood_bank.complete_my_blood_request(p_request_id bigint)
returns jsonb language plpgsql security definer set search_path = blood_bank, public
as $$
declare request_row blood_bank.blood_request%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update blood_bank.blood_request br set recipient_received_at = coalesce(br.recipient_received_at, now()),
    community_status = 'fulfilled', community_fulfilled_at = coalesce(br.community_fulfilled_at, now()), status = 'fulfilled'
  where br.request_id = p_request_id
    and br.patient_id in (select patient_id from blood_bank.patient where auth_user_id = auth.uid())
    and br.request_type = 'emergency_donor' and br.community_status in ('active', 'covered')
  returning br.* into request_row;
  if not found then raise exception 'Only the recipient can confirm blood received for an active emergency donor request'; end if;
  return to_jsonb(request_row);
end; $$;

create or replace function blood_bank.rhu_complete_replacement(p_request_id bigint, p_confirmed_units integer, p_confirmation_reference text)
returns jsonb language plpgsql security definer set search_path = blood_bank, public
as $$ begin raise exception 'Record each facility-confirmed replacement donation separately'; end; $$;

revoke all on function blood_bank.refresh_replacement_confirmation_progress(bigint) from public;
revoke all on function blood_bank.record_replacement_donation(bigint, integer, date, text, text, text, bigint, text) from public;
revoke all on function blood_bank.list_replacement_donations(bigint) from public;
grant execute on function blood_bank.record_replacement_donation(bigint, integer, date, text, text, text, bigint, text) to authenticated;
grant execute on function blood_bank.list_replacement_donations(bigint) to authenticated;
grant execute on function blood_bank.get_my_donation_history() to authenticated;
grant select on blood_bank.replacement_donation_confirmation to authenticated;
commit;
notify pgrst, 'reload schema';
