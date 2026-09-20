-- Require an active pledge before requester receipt confirmation and allow a
-- requester to release a pledge that did not result in a completed donation.

begin;

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
      else 'The requester confirmed blood was received for request #' || request_row.request_id ||
        '. Thank you for pledging; no further response is needed.' end
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
        ' was marked fulfilled by the requester. Verify any completed donation separately before adding donor history.' end
  from auth.users u
  join blood_bank.admin a on lower(a.email) = lower(u.email)
  where u.id is not null;

  if request_row.request_type = 'emergency_donor' then
    update blood_bank.donor_pledge
    set status = 'request_fulfilled', updated_at = now()
    where request_id = request_row.request_id and status = 'pledged';
  end if;

  return to_jsonb(request_row);
end;
$$;

create or replace function blood_bank.mark_my_request_pledge_unsuccessful(
  p_request_id bigint,
  p_pledge_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = blood_bank, public
as $$
declare
  request_row blood_bank.blood_request%rowtype;
  pledge_row blood_bank.donor_pledge%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select br.* into request_row
  from blood_bank.blood_request br
  join blood_bank.patient p on p.patient_id = br.patient_id
  where br.request_id = p_request_id
    and p.auth_user_id = auth.uid()
    and br.community_status in ('active', 'covered')
  for update of br;

  if not found then raise exception 'Only the requester can update an active pledge'; end if;

  update blood_bank.donor_pledge dp
  set status = 'unable_to_donate', updated_at = now()
  where dp.pledge_id = p_pledge_id
    and dp.request_id = p_request_id
    and dp.status = 'pledged'
  returning dp.* into pledge_row;

  if not found then raise exception 'This pledge is no longer active'; end if;

  insert into blood_bank.notifications (recipient_user_id, request_id, notification_type, title, message)
  select d.auth_user_id, request_row.request_id,
    'pledge_unsuccessful', 'Pledge marked unsuccessful',
    'The requester reported that your pledge for request #' || request_row.request_id ||
    ' did not result in a completed donation. Contact the facility or coordinator if this is incorrect.'
  from blood_bank.donor d
  where d.donor_id = pledge_row.donor_id and d.auth_user_id is not null;

  insert into blood_bank.notifications (recipient_user_id, request_id, notification_type, title, message)
  select distinct d.auth_user_id, request_row.request_id,
    'request_still_needs_donors', 'Request still needs donor support',
    'A pledge for request #' || request_row.request_id ||
    ' was unsuccessful. Your active pledge remains recorded; please continue coordinating with the facility.'
  from blood_bank.donor_pledge dp
  join blood_bank.donor d on d.donor_id = dp.donor_id
  where dp.request_id = request_row.request_id and dp.status = 'pledged' and d.auth_user_id is not null;

  insert into blood_bank.notifications (recipient_user_id, request_id, notification_type, title, message)
  select distinct u.id, request_row.request_id,
    'pledge_unsuccessful_admin', 'Donor pledge unsuccessful',
    'Pledge #' || pledge_row.pledge_id || ' for request #' || request_row.request_id ||
    ' was marked unsuccessful by the requester. No donation history was created.'
  from auth.users u
  join blood_bank.admin a on lower(a.email) = lower(u.email)
  where u.id is not null;

  return jsonb_build_object(
    'request_id', request_row.request_id,
    'pledge_id', pledge_row.pledge_id,
    'status', pledge_row.status
  );
end;
$$;

revoke all on function blood_bank.complete_my_blood_request(bigint) from public;
grant execute on function blood_bank.complete_my_blood_request(bigint) to authenticated;
revoke all on function blood_bank.mark_my_request_pledge_unsuccessful(bigint, bigint) from public;
grant execute on function blood_bank.mark_my_request_pledge_unsuccessful(bigint, bigint) to authenticated;

commit;
notify pgrst, 'reload schema';
