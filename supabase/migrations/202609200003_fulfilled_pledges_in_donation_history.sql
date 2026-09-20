-- Show requester-confirmed emergency donations in the pledged donor's history.
-- Active pledges are treated as completed when the requester confirms receipt;
-- pledges that did not result in a donation must be released first.

begin;

create or replace function blood_bank.get_my_donation_history()
returns table (
  donation_id bigint,
  blood_type varchar,
  quantity int,
  donation_date date,
  status varchar,
  notes text
)
language sql
stable
security definer
set search_path = blood_bank, public
as $$
  select history.donation_id,
         history.blood_type,
         history.quantity,
         history.donation_date,
         history.status,
         history.notes
  from (
    select dr.donation_id,
           dr.blood_type,
           dr.quantity,
           dr.donation_date,
           coalesce(dr.status, 'completed')::varchar as status,
           coalesce(dr.notes, dr.reason, '')::text as notes
    from blood_bank.donation_record dr
    join blood_bank.donor d on d.donor_id = dr.donor_id
    where d.auth_user_id = auth.uid()

    union all

    select -c.confirmation_id,
           d.blood_type,
           c.units_confirmed,
           c.donation_date,
           'completed'::varchar,
           ('Replacement donation confirmed by ' || c.receiving_facility)::text
    from blood_bank.replacement_donation_confirmation c
    join blood_bank.donor d on d.donor_id = c.donor_id
    where d.auth_user_id = auth.uid()
      and c.voided_at is null

    union all

    select -(1000000000000::bigint + dp.pledge_id),
           d.blood_type,
           dp.units_pledged,
           coalesce(br.recipient_received_at, br.community_fulfilled_at, dp.updated_at)::date,
           'completed'::varchar,
           ('Emergency donation fulfilled for request #' || br.request_id)::text
    from blood_bank.donor_pledge dp
    join blood_bank.donor d on d.donor_id = dp.donor_id
    join blood_bank.blood_request br on br.request_id = dp.request_id
    where d.auth_user_id = auth.uid()
      and br.request_type = 'emergency_donor'
      and dp.status in ('request_fulfilled', 'recipient_confirmed')
  ) history
  order by history.donation_date desc, history.donation_id desc;
$$;

create or replace function blood_bank.complete_my_blood_request(p_request_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = blood_bank, public
as $$
declare
  request_row blood_bank.blood_request%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  update blood_bank.blood_request br
  set recipient_received_at = now(),
      community_status = case when br.request_type = 'emergency_donor' then 'fulfilled' else br.community_status end,
      community_fulfilled_at = case when br.request_type = 'emergency_donor' then coalesce(br.community_fulfilled_at, now()) else br.community_fulfilled_at end,
      status = case when br.request_type = 'emergency_donor' then 'fulfilled' else br.status end
  where br.request_id = p_request_id
    and br.patient_id in (select p.patient_id from blood_bank.patient p where p.auth_user_id = auth.uid())
    and br.request_type in ('emergency_donor', 'replacement')
    and br.community_status in ('active', 'covered')
    and br.recipient_received_at is null
    and exists (
      select 1 from blood_bank.donor_pledge dp
      where dp.request_id = br.request_id and dp.status = 'pledged'
    )
  returning br.* into request_row;

  if not found then
    raise exception 'An active donor pledge is required before confirming blood received';
  end if;

  insert into blood_bank.notifications (recipient_user_id, request_id, notification_type, title, message)
  select distinct d.auth_user_id, request_row.request_id,
    'pledged_request_received', 'Requester confirmed blood received',
    case when request_row.request_type = 'replacement'
      then 'The requester confirmed blood was received for request #' || request_row.request_id ||
        '. Your replacement pledge remains active until the facility verifies your donation.'
      else 'The requester confirmed your completed donation for request #' || request_row.request_id ||
        '. It is now visible in your donation history.' end
  from blood_bank.donor_pledge dp
  join blood_bank.donor d on d.donor_id = dp.donor_id
  where dp.request_id = request_row.request_id and dp.status = 'pledged' and d.auth_user_id is not null;

  insert into blood_bank.notifications (recipient_user_id, request_id, notification_type, title, message)
  select distinct u.id, request_row.request_id,
    'requester_confirmed_received', 'Requester confirmed blood received',
    case when request_row.request_type = 'replacement'
      then 'The requester acknowledged receipt for replacement request #' || request_row.request_id ||
        '. Replacement donations still require facility verification.'
      else 'Emergency donor assistance request #' || request_row.request_id ||
        ' was marked fulfilled by the requester and added to each active pledged donor''s history.' end
  from auth.users u
  join blood_bank.admin a on lower(a.email) = lower(u.email)
  where u.id is not null;

  if request_row.request_type = 'emergency_donor' then
    update blood_bank.donor d
    set last_donation_date = greatest(coalesce(d.last_donation_date, current_date), current_date),
        donor_status = 'donated',
        availability_status = 'unavailable'
    where d.donor_id in (
      select dp.donor_id
      from blood_bank.donor_pledge dp
      where dp.request_id = request_row.request_id and dp.status = 'pledged'
    );

    update blood_bank.donor_pledge
    set status = 'request_fulfilled', updated_at = now()
    where request_id = request_row.request_id and status = 'pledged';
  end if;

  return to_jsonb(request_row);
end;
$$;

revoke all on function blood_bank.get_my_donation_history() from public;
grant execute on function blood_bank.get_my_donation_history() to authenticated;
revoke all on function blood_bank.complete_my_blood_request(bigint) from public;
grant execute on function blood_bank.complete_my_blood_request(bigint) to authenticated;

commit;
notify pgrst, 'reload schema';
