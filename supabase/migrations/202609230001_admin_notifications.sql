begin;

alter table blood_bank.notifications
  add column if not exists audience varchar(20) not null default 'user',
  add column if not exists related_record_type varchar(40),
  add column if not exists related_record_id bigint,
  add column if not exists event_key varchar(180);

update blood_bank.notifications
set audience = 'admin'
where notification_type like 'admin\_%' escape '\'
   or notification_type like '%\_admin' escape '\';
create or replace function blood_bank.classify_notification_audience()
returns trigger
language plpgsql
set search_path = blood_bank, public
as $$
begin
  if new.audience = 'user' and (
    new.notification_type like 'admin\_%' escape '\'
    or new.notification_type like '%\_admin' escape '\'
  ) then
    new.audience := 'admin';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_classify_notification_audience on blood_bank.notifications;
create trigger trg_classify_notification_audience
before insert or update of notification_type on blood_bank.notifications
for each row execute function blood_bank.classify_notification_audience();

create unique index if not exists uq_notifications_recipient_event
  on blood_bank.notifications(recipient_user_id, event_key)
  where event_key is not null;

create index if not exists idx_notifications_recipient_unread
  on blood_bank.notifications(recipient_user_id, created_at desc)
  where read_at is null;

drop policy if exists notifications_delete_own on blood_bank.notifications;
create policy notifications_delete_own
  on blood_bank.notifications for delete to authenticated
  using (recipient_user_id = auth.uid());

grant select, update, delete on blood_bank.notifications to authenticated;

create or replace function blood_bank.create_admin_notification(
  p_event_key text,
  p_notification_type text,
  p_title text,
  p_message text,
  p_related_record_type text default null,
  p_related_record_id bigint default null,
  p_request_id bigint default null
)
returns integer
language plpgsql
security definer
set search_path = blood_bank, public
as $$
declare
  inserted_count integer := 0;
begin
  with inserted as (
    insert into blood_bank.notifications (
      recipient_user_id,
      audience,
      request_id,
      notification_type,
      title,
      message,
      related_record_type,
      related_record_id,
      event_key
    )
    select
      u.id,
      'admin',
      p_request_id,
      left(coalesce(p_notification_type, 'admin_system'), 40),
      left(coalesce(p_title, 'Administrator notification'), 140),
      coalesce(p_message, ''),
      left(p_related_record_type, 40),
      p_related_record_id,
      left(p_event_key, 180)
    from auth.users u
    join blood_bank.admin a on lower(a.email) = lower(u.email)
    where u.id is not null
    on conflict (recipient_user_id, event_key) where event_key is not null do nothing
    returning 1
  )
  select count(*)::integer into inserted_count from inserted;

  return inserted_count;
end;
$$;

revoke all on function blood_bank.create_admin_notification(text, text, text, text, text, bigint, bigint) from public;
revoke all on function blood_bank.create_admin_notification(text, text, text, text, text, bigint, bigint) from anon, authenticated;

create or replace function blood_bank.notify_admin_new_blood_request()
returns trigger
language plpgsql
security definer
set search_path = blood_bank, public
as $$
begin
  perform blood_bank.create_admin_notification(
    'blood_request_created:' || new.request_id,
    'admin_request_created',
    'New Blood Request',
    'A new request for ' || coalesce(new.blood_type_needed, 'unspecified') ||
      ' blood (' || coalesce(new.quantity, 0) || ' unit(s)) has been submitted and requires review.',
    'blood_request',
    new.request_id,
    new.request_id
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_admin_new_blood_request on blood_bank.blood_request;
create trigger trg_notify_admin_new_blood_request
after insert on blood_bank.blood_request
for each row execute function blood_bank.notify_admin_new_blood_request();

create or replace function blood_bank.notify_admin_new_donor()
returns trigger
language plpgsql
security definer
set search_path = blood_bank, public
as $$
begin
  perform blood_bank.create_admin_notification(
    'donor_registered:' || new.donor_id,
    'admin_donor_registered',
    'New Donor Registration',
    'A new ' || coalesce(new.blood_type, 'unspecified') || ' donor profile has been registered.',
    'donor',
    new.donor_id,
    null
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_admin_new_donor on blood_bank.donor;
create trigger trg_notify_admin_new_donor
after insert on blood_bank.donor
for each row execute function blood_bank.notify_admin_new_donor();

create or replace function blood_bank.notify_admin_low_inventory()
returns trigger
language plpgsql
security definer
set search_path = blood_bank, public
as $$
declare
  normalized_type text := upper(trim(new.blood_type));
  current_total integer := 0;
  previous_total integer := 0;
  new_contribution integer := 0;
  old_contribution integer := 0;
  level_key text;
begin
  select coalesce(sum(greatest(units_available, 0)), 0)::integer
    into current_total
  from blood_bank.blood_inventory
  where upper(trim(blood_type)) = normalized_type
    and lower(coalesce(status, 'available')) not in ('expired', 'quarantined');

  new_contribution := case
    when lower(coalesce(new.status, 'available')) in ('expired', 'quarantined') then 0
    else greatest(coalesce(new.units_available, 0), 0)
  end;

  if tg_op = 'INSERT' then
    previous_total := current_total - new_contribution;
  elsif upper(trim(old.blood_type)) = normalized_type then
    old_contribution := case
      when lower(coalesce(old.status, 'available')) in ('expired', 'quarantined') then 0
      else greatest(coalesce(old.units_available, 0), 0)
    end;
    previous_total := current_total - new_contribution + old_contribution;
  else
    previous_total := current_total - new_contribution;
  end if;

  if current_total <= 15 and (tg_op = 'INSERT' or previous_total > 15) then
    level_key := case when current_total = 0 then 'unavailable' else 'low' end;
    perform blood_bank.create_admin_notification(
      'inventory_' || level_key || ':' || normalized_type || ':' || txid_current(),
      case when current_total = 0 then 'admin_inventory_unavailable' else 'admin_inventory_low' end,
      case when current_total = 0 then normalized_type || ' Blood Unavailable' else 'Low ' || normalized_type || ' Blood Stock' end,
      case
        when current_total = 0 then normalized_type || ' blood inventory is unavailable and requires attention.'
        else normalized_type || ' blood inventory is low at ' || current_total || ' unit(s).'
      end,
      'blood_inventory',
      new.inventory_id,
      null
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_admin_low_inventory on blood_bank.blood_inventory;
create trigger trg_notify_admin_low_inventory
after insert or update of units_available, status, blood_type on blood_bank.blood_inventory
for each row execute function blood_bank.notify_admin_low_inventory();

insert into blood_bank.notifications (
  recipient_user_id,
  audience,
  request_id,
  notification_type,
  title,
  message,
  related_record_type,
  related_record_id,
  event_key,
  created_at
)
select
  u.id,
  'admin',
  r.request_id,
  'admin_request_created',
  'Blood Request Pending Review',
  'Request #' || r.request_id || ' for ' || coalesce(r.blood_type_needed, 'unspecified') ||
    ' blood (' || coalesce(r.quantity, 0) || ' unit(s)) requires review.',
  'blood_request',
  r.request_id,
  'blood_request_created:' || r.request_id,
  coalesce(r.request_date, now())
from blood_bank.blood_request r
cross join auth.users u
join blood_bank.admin a on lower(a.email) = lower(u.email)
where lower(coalesce(r.status, 'pending')) in ('pending', 'submitted', 'under_review')
on conflict (recipient_user_id, event_key) where event_key is not null do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
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
