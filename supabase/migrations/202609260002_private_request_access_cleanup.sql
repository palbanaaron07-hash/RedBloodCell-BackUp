-- Retire the remaining community RPC and restrict private requests to participants.
-- Keep historical pledge, replacement and notification records intact.
begin;

create or replace function blood_bank.owns_request_identity(p_patient_id bigint, p_requester_user_id bigint)
returns boolean language sql stable security definer
set search_path = pg_catalog, blood_bank
as $$
  select auth.uid() is not null and (
    exists (select 1 from blood_bank.patient p where p.patient_id = p_patient_id and p.auth_user_id = auth.uid())
    or exists (select 1 from blood_bank.users u where u.user_id = p_requester_user_id and u.auth_user_id = auth.uid())
  );
$$;
revoke all on function blood_bank.owns_request_identity(bigint, bigint) from public;
grant execute on function blood_bank.owns_request_identity(bigint, bigint) to authenticated;

drop policy if exists blood_request_select_authenticated on blood_bank.blood_request;
create policy blood_request_select_authenticated on blood_bank.blood_request
for select to authenticated using (
  blood_bank.is_admin() or blood_bank.owns_request_identity(patient_id, requester_user_id)
);
drop policy if exists blood_request_insert_authenticated on blood_bank.blood_request;
create policy blood_request_insert_authenticated on blood_bank.blood_request
for insert to authenticated with check (
  blood_bank.is_admin() or blood_bank.owns_request_identity(patient_id, requester_user_id)
);
drop policy if exists blood_request_update_authenticated on blood_bank.blood_request;
create policy blood_request_update_authenticated on blood_bank.blood_request
for update to authenticated using (
  blood_bank.is_admin() or blood_bank.owns_request_identity(patient_id, requester_user_id)
) with check (
  blood_bank.is_admin() or blood_bank.owns_request_identity(patient_id, requester_user_id)
);

drop policy if exists replacement_campaign_read_authenticated on blood_bank.replacement_campaign;
create policy replacement_campaign_read_authenticated on blood_bank.replacement_campaign
for select to authenticated using (
  blood_bank.is_admin() or exists (
    select 1 from blood_bank.blood_request br where br.request_id = replacement_campaign.request_id
    and blood_bank.owns_request_identity(br.patient_id, br.requester_user_id)
  )
);

create or replace function blood_bank.pledge_to_blood_request(
  p_request_id bigint, p_units integer default 1, p_pass_reference text default null,
  p_preferred_date date default null, p_preferred_time text default null,
  p_donor_phone text default null, p_notes text default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog, blood_bank
as $$
begin
  raise exception 'Community donor responses are disabled. Blood requests are handled privately by the blood bank admin.';
end;
$$;
revoke all on function blood_bank.pledge_to_blood_request(bigint, integer, text, date, text, text, text) from public;
revoke all on function blood_bank.pledge_to_blood_request(bigint, integer, text, date, text, text, text) from anon, authenticated;

notify pgrst, 'reload schema';
commit;
