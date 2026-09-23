begin;

create table if not exists blood_bank.notifications (
  notification_id bigint generated always as identity primary key,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  request_id bigint references blood_bank.blood_request(request_id) on update cascade on delete cascade,
  notification_type varchar(40) not null default 'donor_appeal',
  title varchar(140) not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_donor_appeal_per_request
  on blood_bank.notifications(recipient_user_id, request_id, notification_type)
  where request_id is not null and notification_type = 'donor_appeal';

create index if not exists idx_notifications_recipient_created
  on blood_bank.notifications(recipient_user_id, created_at desc);

alter table blood_bank.notifications enable row level security;

drop policy if exists notifications_select_own on blood_bank.notifications;
create policy notifications_select_own
  on blood_bank.notifications for select to authenticated
  using (recipient_user_id = auth.uid());

drop policy if exists notifications_update_own on blood_bank.notifications;
create policy notifications_update_own
  on blood_bank.notifications for update to authenticated
  using (recipient_user_id = auth.uid())
  with check (recipient_user_id = auth.uid());

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
    raise exception 'RHU coordinator access required';
  end if;

  select * into request_row
  from blood_bank.blood_request
  where request_id = p_request_id
  for update;

  if not found then raise exception 'Blood request not found'; end if;
  if request_row.verification_status <> 'verified' or request_row.status <> 'approved' then
    raise exception 'The RHU must verify this request before notifying donors';
  end if;
  if request_row.community_status <> 'active' or request_row.expires_at <= now() then
    raise exception 'This request is not accepting donor responses';
  end if;

  select count(*)::integer into eligible_count
  from blood_bank.donor d
  where d.auth_user_id is not null
    and upper(trim(d.blood_type)) = upper(trim(request_row.blood_type_needed))
    and lower(coalesce(d.availability_status, '')) = 'available'
    and lower(coalesce(d.donor_status, 'registered')) not in ('deferred', 'incomplete', 'checked_in')
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
    'RHU-verified blood appeal',
    'Request #' || request_row.request_id || ' needs ' || request_row.quantity ||
      ' unit(s) of ' || request_row.blood_type_needed ||
      '. Open VeinDrop to review the request and respond if you are able.'
  from blood_bank.donor d
  where d.auth_user_id is not null
    and upper(trim(d.blood_type)) = upper(trim(request_row.blood_type_needed))
    and lower(coalesce(d.availability_status, '')) = 'available'
    and lower(coalesce(d.donor_status, 'registered')) not in ('deferred', 'incomplete', 'checked_in')
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
    coalesce(auth.uid()::text, 'rhu-coordinator'),
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

revoke all on function blood_bank.notify_eligible_donors(bigint) from public;
grant execute on function blood_bank.notify_eligible_donors(bigint) to authenticated;
grant select, update on blood_bank.notifications to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'blood_bank'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table blood_bank.notifications;
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;