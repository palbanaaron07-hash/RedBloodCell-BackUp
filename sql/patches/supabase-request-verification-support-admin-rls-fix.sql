-- ============================================================
-- BloodConnect — Fix Request Verification Support Admin Select Policy
-- Purpose: Ensure blood donation coordinators / admins can view
--          private verification support regardless of whether auth is
--          matched by email or auth_user_id.
-- ============================================================

begin;

drop policy if exists request_verification_support_select_participants on blood_bank.request_verification_support;

create policy request_verification_support_select_participants
  on blood_bank.request_verification_support
  for select to authenticated
  using (
    exists (
      select 1 from blood_bank.blood_request br
      join blood_bank.patient p on p.patient_id = br.patient_id
      where br.request_id = request_verification_support.request_id
        and p.auth_user_id = auth.uid()
    )
    or exists (
      select 1 from blood_bank.admin a
      where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or (a.auth_user_id is not null and a.auth_user_id = auth.uid())
    )
  );

drop policy if exists request_supporting_documents_select_participants on storage.objects;

create policy request_supporting_documents_select_participants
  on storage.objects
  for select to authenticated
  using (
    bucket_id = 'request-supporting-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from blood_bank.admin a
        where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          or (a.auth_user_id is not null and a.auth_user_id = auth.uid())
      )
    )
  );

notify pgrst, 'reload schema';

commit;
