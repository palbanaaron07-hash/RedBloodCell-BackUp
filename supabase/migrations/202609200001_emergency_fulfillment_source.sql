-- Emergency donor pledge completion and deferral lifecycle.
-- A requester confirms receipt at request level; medical donation history remains
-- an administrator/facility responsibility.

begin;

alter table blood_bank.donor_pledge
  drop constraint if exists donor_pledge_status_check;

alter table blood_bank.donor_pledge
  add constraint donor_pledge_status_check
  check (status in ('pledged', 'cancelled', 'request_fulfilled', 'unable_to_donate', 'recipient_confirmed'));

drop function if exists blood_bank.complete_my_blood_request(bigint, text, bigint);

create or replace function blood_bank.complete_my_blood_request(p_request_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = blood_bank, public
as $$
declare
  request_row blood_bank.blood_request%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update blood_bank.blood_request br
  set recipient_received_at = coalesce(br.recipient_received_at, now()),
      community_status = 'fulfilled',
      community_fulfilled_at = coalesce(br.community_fulfilled_at, now()),
      status = 'fulfilled'
  where br.request_id = p_request_id
    and br.patient_id in (
      select p.patient_id from blood_bank.patient p where p.auth_user_id = auth.uid()
    )
    and br.request_type = 'emergency_donor'
    and br.community_status in ('active', 'covered')
  returning br.* into request_row;

  if not found then
    raise exception 'Only the recipient can confirm blood received for an active emergency donor request';
  end if;

  insert into blood_bank.notifications (
    recipient_user_id, request_id, notification_type, title, message
  )
  select distinct d.auth_user_id, request_row.request_id,
    'pledged_request_fulfilled', 'Emergency request fulfilled',
    'The requester confirmed blood was received for request #' || request_row.request_id ||
    '. Thank you for pledging; no further response is needed.'
  from blood_bank.donor_pledge dp
  join blood_bank.donor d on d.donor_id = dp.donor_id
  where dp.request_id = request_row.request_id
    and dp.status = 'pledged'
    and d.auth_user_id is not null;

  insert into blood_bank.notifications (
    recipient_user_id, request_id, notification_type, title, message
  )
  select distinct u.id, request_row.request_id,
    'requester_confirmed_received', 'Requester confirmed blood received',
    'Emergency donor assistance request #' || request_row.request_id ||
    ' was marked fulfilled by the requester. Verify any completed donation separately before adding donor history.'
  from auth.users u
  join blood_bank.admin a on lower(a.email) = lower(u.email)
  where u.id is not null;

  update blood_bank.donor_pledge
  set status = 'request_fulfilled', updated_at = now()
  where request_id = request_row.request_id and status = 'pledged';

  return to_jsonb(request_row);
end;
$$;

create or replace function blood_bank.release_emergency_pledges_when_deferred()
returns trigger
language plpgsql
security definer
set search_path = blood_bank, public
as $$
declare
  pledge_row record;
begin
  if lower(coalesce(new.donor_status, '')) <> 'deferred'
     or lower(coalesce(old.donor_status, '')) = 'deferred' then
    return new;
  end if;

  for pledge_row in
    select dp.pledge_id, dp.request_id
    from blood_bank.donor_pledge dp
    join blood_bank.blood_request br on br.request_id = dp.request_id
    where dp.donor_id = new.donor_id
      and dp.status = 'pledged'
      and br.request_type = 'emergency_donor'
      and br.community_status in ('active', 'covered')
    for update of dp
  loop
    update blood_bank.donor_pledge
    set status = 'unable_to_donate', updated_at = now()
    where pledge_id = pledge_row.pledge_id;

    if new.auth_user_id is not null then
      insert into blood_bank.notifications (
        recipient_user_id, request_id, notification_type, title, message
      ) values (
        new.auth_user_id, pledge_row.request_id, 'pledge_unavailable',
        'Pledge released',
        'Your pledge for request #' || pledge_row.request_id ||
        ' was marked unable to donate after deferral. The request remains open if more help is needed.'
      );
    end if;

    insert into blood_bank.notifications (
      recipient_user_id, request_id, notification_type, title, message
    )
    select p.auth_user_id, pledge_row.request_id,
      'pledged_donor_unavailable', 'A pledged donor became unavailable',
      'One pledge for request #' || pledge_row.request_id ||
      ' was released. The request remains open and the active pledge count has been updated.'
    from blood_bank.blood_request br
    join blood_bank.patient p on p.patient_id = br.patient_id
    where br.request_id = pledge_row.request_id and p.auth_user_id is not null;

    insert into blood_bank.notifications (
      recipient_user_id, request_id, notification_type, title, message
    )
    select distinct d.auth_user_id, pledge_row.request_id,
      'request_still_needs_donors', 'Emergency request still needs support',
      'A donor became unable to donate for request #' || pledge_row.request_id ||
      '. Your active pledge is still recorded; please continue coordinating with the facility.'
    from blood_bank.donor_pledge dp
    join blood_bank.donor d on d.donor_id = dp.donor_id
    where dp.request_id = pledge_row.request_id
      and dp.status = 'pledged'
      and d.auth_user_id is not null;

    insert into blood_bank.notifications (
      recipient_user_id, request_id, notification_type, title, message
    )
    select distinct u.id, pledge_row.request_id,
      'pledged_donor_unavailable_admin', 'Emergency pledge released',
      'A deferred donor can no longer fulfill pledge #' || pledge_row.pledge_id ||
      ' for request #' || pledge_row.request_id || '. The request remains open.'
    from auth.users u
    join blood_bank.admin a on lower(a.email) = lower(u.email)
    where u.id is not null;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_release_emergency_pledges_when_deferred on blood_bank.donor;
create trigger trg_release_emergency_pledges_when_deferred
after update of donor_status on blood_bank.donor
for each row execute function blood_bank.release_emergency_pledges_when_deferred();

revoke all on function blood_bank.complete_my_blood_request(bigint) from public;
grant execute on function blood_bank.complete_my_blood_request(bigint) to authenticated;
revoke all on function blood_bank.release_emergency_pledges_when_deferred() from public;

commit;
notify pgrst, 'reload schema';
