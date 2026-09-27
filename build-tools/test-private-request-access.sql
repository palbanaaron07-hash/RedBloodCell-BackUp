-- Run after applying 202609260002; all test changes are rolled back.
begin;
create temp table request_access_fixture as
select p.patient_id, u.id as owner_id, u.email as owner_email,
  (select au.id from auth.users au join blood_bank.admin a on lower(a.email)=lower(au.email) limit 1) as admin_id,
  (select au.email from auth.users au join blood_bank.admin a on lower(a.email)=lower(au.email) limit 1) as admin_email,
  (select count(*) from blood_bank.blood_request) as original_requests
from blood_bank.patient p join auth.users u on u.id=p.auth_user_id
where not exists (select 1 from blood_bank.admin a where lower(a.email)=lower(u.email))
and exists (select 1 from blood_bank.blood_request br where br.patient_id=p.patient_id)
limit 1;
grant select on request_access_fixture to authenticated;
do $$ begin
  if not exists (select 1 from request_access_fixture where admin_id is not null) then
    raise exception 'Missing requester/admin fixtures';
  end if;
end $$;
select set_config('request.jwt.claims', (select json_build_object('sub',owner_id,'email',owner_email,'role','authenticated')::text from request_access_fixture),true) is not null as session_ready;
set local role authenticated;
do $$ begin
  if exists (select 1 from blood_bank.blood_request where not blood_bank.owns_request_identity(patient_id,requester_user_id)) then
    raise exception 'Requester can read unrelated requests';
  end if;
  if not exists (select 1 from blood_bank.blood_request) then raise exception 'Own requests hidden'; end if;
end $$;
insert into blood_bank.blood_request(request_id,patient_id,blood_type_needed,quantity,urgency_level,request_type,status,note)
overriding system value
select -926260002,patient_id,'O+',1,'normal','emergency_donor','pending','Rollback-only access test' from request_access_fixture;
update blood_bank.blood_request set quantity=2 where request_id=-926260002;
do $$ begin
  if not exists (select 1 from blood_bank.blood_request where request_id=-926260002 and quantity=2) then raise exception 'Owner create/edit failed'; end if;
  perform count(*) from blood_bank.request_verification_support;
  perform count(*) from blood_bank.request_supporting_documents;
  perform count(*) from blood_bank.replacement_campaign;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub','00000000-0000-0000-0000-000000000001','email','audit@example.invalid','role','authenticated')::text,true) is not null as session_ready;
set local role authenticated;
do $$ declare affected integer; begin
  if exists (select 1 from blood_bank.blood_request) then raise exception 'Unrelated account can read requests'; end if;
  if exists (select 1 from blood_bank.replacement_campaign) then raise exception 'Unrelated account can read campaigns'; end if;
  if exists (select 1 from blood_bank.request_verification_support) then raise exception 'Private support leaked'; end if;
  if exists (select 1 from blood_bank.request_supporting_documents) then raise exception 'Attachments leaked'; end if;
  update blood_bank.blood_request set quantity=3 where request_id=-926260002;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Unrelated update allowed'; end if;
  begin
    insert into blood_bank.blood_request(request_id,patient_id,blood_type_needed,quantity,urgency_level,request_type)
    overriding system value select -926260003,patient_id,'O+',1,'normal','emergency_donor' from request_access_fixture;
    raise exception 'Unrelated insert allowed';
  exception when insufficient_privilege then null;
  end;
  if has_function_privilege(current_user, 'blood_bank.pledge_to_blood_request(bigint,integer,text,date,text,text,text)', 'EXECUTE') then raise exception 'Legacy pledge RPC executable'; end if;
  begin
    perform blood_bank.pledge_to_blood_request(-926260002::bigint,1::integer,null::text,null::date,null::text,null::text,null::text,'[]'::jsonb);
    raise exception 'Legacy pledge RPC remained enabled';
  exception when raise_exception then
    if sqlerrm not like 'Community donor responses are disabled.%' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claims',(select json_build_object('sub',admin_id,'email',admin_email,'role','authenticated')::text from request_access_fixture),true) is not null as session_ready;
set local role authenticated;
do $$ begin
  if (select count(*) from blood_bank.blood_request) <> (select original_requests+1 from request_access_fixture) then raise exception 'Admin request list changed'; end if;
  perform count(*) from blood_bank.request_verification_support;
  perform count(*) from blood_bank.request_supporting_documents;
end $$;
update blood_bank.blood_request set status='rejected' where request_id=-926260002;
do $$ begin
  if not exists (select 1 from blood_bank.blood_request where request_id=-926260002 and status='rejected') then raise exception 'Admin status update failed'; end if;
end $$;
reset role;
select 'PASS: owner create/edit, admin list/status, private-support reads, unrelated access denied, legacy pledge disabled' as result;
rollback;
