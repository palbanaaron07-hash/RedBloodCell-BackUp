-- Manual admin archive state for blood requests. Request status and history stay intact.
begin;

alter table blood_bank.blood_request
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid;
create index if not exists idx_blood_request_archived_at
  on blood_bank.blood_request(archived_at, request_date desc);

create or replace function blood_bank.guard_request_archive_fields()
returns trigger language plpgsql security definer
set search_path = pg_catalog, blood_bank
as $$
begin
  if (new.archived_at is distinct from old.archived_at
      or new.archived_by is distinct from old.archived_by)
     and not blood_bank.is_admin() then
    raise exception 'Only an authorized coordinator can change request archives';
  end if;
  return new;
end;
$$;
revoke all on function blood_bank.guard_request_archive_fields() from public;
drop trigger if exists trg_guard_request_archive_fields on blood_bank.blood_request;
create trigger trg_guard_request_archive_fields
before update of archived_at, archived_by on blood_bank.blood_request
for each row execute function blood_bank.guard_request_archive_fields();

create or replace function blood_bank.set_request_archive(p_request_ids bigint[], p_archive boolean)
returns integer language plpgsql security definer
set search_path = pg_catalog, blood_bank
as $$
declare
  target_ids bigint[];
  updated_count integer;
begin
  if not blood_bank.is_admin() then
    raise exception 'Only an authorized coordinator can change request archives';
  end if;
  if p_archive is null or p_request_ids is null or array_length(p_request_ids, 1) is null
     or array_length(p_request_ids, 1) > 200 or array_position(p_request_ids, null) is not null then
    raise exception 'Select between 1 and 200 valid blood requests';
  end if;
  select array_agg(distinct id) into target_ids from unnest(p_request_ids) as id where id > 0;
  if coalesce(array_length(target_ids, 1), 0) <> (select count(distinct id) from unnest(p_request_ids) as id) then
    raise exception 'Invalid blood request selection';
  end if;
  update blood_bank.blood_request
     set archived_at = case when p_archive then coalesce(archived_at, now()) else null end,
         archived_by = case when p_archive then coalesce(archived_by, auth.uid()) else null end
   where request_id = any(target_ids);
  get diagnostics updated_count = row_count;
  if updated_count <> array_length(target_ids, 1) then
    raise exception 'One or more blood requests no longer exist';
  end if;
  return updated_count;
end;
$$;
revoke all on function blood_bank.set_request_archive(bigint[], boolean) from public;
grant execute on function blood_bank.set_request_archive(bigint[], boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
