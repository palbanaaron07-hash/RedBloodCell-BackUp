begin;
create temp table archive_test_ids as select request_id, status, row_number() over(order by request_id) as n from blood_bank.blood_request order by request_id limit 2;
grant select on archive_test_ids to authenticated;
do $$ begin if (select count(*) from archive_test_ids) <> 2 then raise exception 'Need two test requests'; end if; end $$;
select set_config('request.jwt.claims', (select json_build_object('sub',u.id,'email',u.email,'role','authenticated')::text from auth.users u join blood_bank.admin a on lower(a.email)=lower(u.email) limit 1), true) is not null as ready;
set local role authenticated;
do $$ declare ids bigint[]; changed integer; begin
  select array_agg(request_id) into ids from archive_test_ids;
  select blood_bank.set_request_archive(ids, true) into changed;
  if changed <> 2 then raise exception 'Batch archive count wrong'; end if;
  if (select count(*) from blood_bank.blood_request where request_id=any(ids) and archived_at is not null) <> 2 then raise exception 'Batch archive state wrong'; end if;
  select blood_bank.set_request_archive(array[ids[1]], false) into changed;
  if changed <> 1 then raise exception 'Restore count wrong'; end if;
  if exists (select 1 from blood_bank.blood_request br join archive_test_ids t using(request_id) where br.status is distinct from t.status) then raise exception 'Archive changed request status'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-000000000001','email','audit@example.invalid','role','authenticated')::text, true) is not null as ready;
set local role authenticated;
do $$ declare ids bigint[]; begin
  select array_agg(request_id) into ids from archive_test_ids;
  begin
    perform blood_bank.set_request_archive(ids, true);
    raise exception 'Non-admin archive succeeded';
  exception when raise_exception then
    if sqlerrm not like 'Only an authorized coordinator%' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claims', (select json_build_object('sub',p.auth_user_id,'role','authenticated')::text from blood_bank.patient p join blood_bank.blood_request br on br.patient_id=p.patient_id where p.auth_user_id is not null limit 1), true) is not null as ready;
set local role authenticated;
do $$ begin
  begin
    update blood_bank.blood_request set archived_at=now() where request_id=(select br.request_id from blood_bank.blood_request br join blood_bank.patient p on p.patient_id=br.patient_id where p.auth_user_id=auth.uid() limit 1);
    raise exception 'Requester changed archive fields directly';
  exception when raise_exception then
    if sqlerrm not like 'Only an authorized coordinator%' then raise; end if;
  end;
end $$;
reset role;
select 'PASS: batch archive, restore, unchanged status, direct request changes denied, non-admin RPC denied' as result;
rollback;
