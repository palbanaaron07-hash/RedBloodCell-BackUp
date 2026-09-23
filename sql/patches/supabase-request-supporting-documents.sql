-- ============================================================
-- BloodConnect — Multi-File Request Supporting Documents Patch
-- Purpose: Run this script in Supabase SQL Editor to create the
--          request_supporting_documents table and RLS policies.
-- ============================================================

begin;

create table if not exists blood_bank.request_supporting_documents (
  id bigserial primary key,
  request_id bigint not null references blood_bank.blood_request(request_id) on delete cascade,
  storage_path text not null,
  file_name varchar(255),
  mime_type varchar(100),
  file_size bigint,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint request_supporting_documents_file_check check (
    mime_type in ('image/jpeg', 'image/png', 'application/pdf')
    and file_size > 0
    and file_size <= 20971520
  )
);

create index if not exists idx_request_supporting_documents_request_id
  on blood_bank.request_supporting_documents(request_id);

alter table blood_bank.request_supporting_documents enable row level security;

-- SELECT policy: Request owner or Admin can read supporting documents
drop policy if exists request_supporting_documents_select on blood_bank.request_supporting_documents;

create policy request_supporting_documents_select
  on blood_bank.request_supporting_documents
  for select to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from blood_bank.blood_request br
      join blood_bank.patient p on p.patient_id = br.patient_id
      where br.request_id = request_supporting_documents.request_id
        and p.auth_user_id = auth.uid()
    )
    or exists (
      select 1 from blood_bank.admin a
      where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or (a.auth_user_id is not null and a.auth_user_id = auth.uid())
    )
  );

-- INSERT policy: Owner can insert files for their own pending requests
drop policy if exists request_supporting_documents_insert on blood_bank.request_supporting_documents;

create policy request_supporting_documents_insert
  on blood_bank.request_supporting_documents
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and split_part(storage_path, '/', 1) = auth.uid()::text
    and exists (
      select 1 from blood_bank.blood_request br
      join blood_bank.patient p on p.patient_id = br.patient_id
      where br.request_id = request_supporting_documents.request_id
        and p.auth_user_id = auth.uid()
        and br.status = 'pending'
        and coalesce(br.verification_status, 'pending') = 'pending'
    )
  );

-- DELETE policy: Owner can delete files for their own pending requests
drop policy if exists request_supporting_documents_delete on blood_bank.request_supporting_documents;

create policy request_supporting_documents_delete
  on blood_bank.request_supporting_documents
  for delete to authenticated
  using (
    created_by = auth.uid()
    and exists (
      select 1 from blood_bank.blood_request br
      join blood_bank.patient p on p.patient_id = br.patient_id
      where br.request_id = request_supporting_documents.request_id
        and p.auth_user_id = auth.uid()
        and br.status = 'pending'
        and coalesce(br.verification_status, 'pending') = 'pending'
    )
  );

grant select, insert, delete on blood_bank.request_supporting_documents to authenticated;
grant usage, select on sequence blood_bank.request_supporting_documents_id_seq to authenticated;

notify pgrst, 'reload schema';

commit;
