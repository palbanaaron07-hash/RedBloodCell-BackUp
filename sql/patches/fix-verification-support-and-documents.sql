-- ============================================================
-- BloodConnect — Fix Verification Support & Supporting Documents
-- Run this in Supabase SQL Editor to ensure:
-- 1. request_supporting_documents table exists
-- 2. Storage bucket 'request-supporting-documents' exists
-- 3. RLS policies allow requesters to upload & admins to view
-- ============================================================

begin;

-- 1. Ensure request_supporting_documents table exists
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
alter table blood_bank.request_verification_support enable row level security;

-- 2. Ensure storage bucket exists
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'request-supporting-documents',
  'request-supporting-documents',
  false,
  20971520,
  array['image/jpeg', 'image/png', 'application/pdf']
)
on conflict (id) do update set
  file_size_limit = 20971520,
  allowed_mime_types = array['image/jpeg', 'image/png', 'application/pdf'];

-- 3. RLS Policies for request_verification_support (Facility contact & verification metadata)
drop policy if exists request_verification_support_select_participants on blood_bank.request_verification_support;
create policy request_verification_support_select_participants
  on blood_bank.request_verification_support
  for select to authenticated
  using (
    created_by = auth.uid()
    or exists (
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
    or coalesce(auth.jwt() ->> 'email', '') in ('admin@bloodconnect.com', 'adminblood@gmail.com')
  );

drop policy if exists request_verification_support_insert_owner on blood_bank.request_verification_support;
create policy request_verification_support_insert_owner
  on blood_bank.request_verification_support
  for insert to authenticated
  with check (
    created_by = auth.uid()
    or exists (
      select 1 from blood_bank.blood_request br
      join blood_bank.patient p on p.patient_id = br.patient_id
      where br.request_id = request_verification_support.request_id
        and p.auth_user_id = auth.uid()
    )
    or coalesce(auth.jwt() ->> 'email', '') in ('admin@bloodconnect.com', 'adminblood@gmail.com')
  );

-- 4. RLS Policies for request_supporting_documents (Files metadata)
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
    or coalesce(auth.jwt() ->> 'email', '') in ('admin@bloodconnect.com', 'adminblood@gmail.com')
  );

drop policy if exists request_supporting_documents_insert on blood_bank.request_supporting_documents;
create policy request_supporting_documents_insert
  on blood_bank.request_supporting_documents
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and split_part(storage_path, '/', 1) = auth.uid()::text
  );

-- 5. Storage policies for storage.objects (request-supporting-documents bucket)
drop policy if exists request_supporting_documents_storage_select on storage.objects;
create policy request_supporting_documents_storage_select
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
      or coalesce(auth.jwt() ->> 'email', '') in ('admin@bloodconnect.com', 'adminblood@gmail.com')
    )
  );

drop policy if exists request_supporting_documents_storage_insert on storage.objects;
create policy request_supporting_documents_storage_insert
  on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'request-supporting-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 6. Permissions
grant select, insert, update, delete on blood_bank.request_verification_support to authenticated;
grant select, insert, delete on blood_bank.request_supporting_documents to authenticated;
grant usage, select on sequence blood_bank.request_supporting_documents_id_seq to authenticated;

notify pgrst, 'reload schema';

commit;
