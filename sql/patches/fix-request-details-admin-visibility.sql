-- ============================================================
-- BloodConnect — Fix: Facility Contact & Documents Not Visible to Admin
-- Purpose: Ensure all data submitted by the requester (facility contact
--          and supporting documents) is readable by the admin in the
--          Request Details panel.
--
-- HOW TO RUN: Paste the ENTIRE file into Supabase SQL Editor and click Run.
-- No BEGIN/COMMIT — each statement runs independently to avoid deadlocks.
-- Safe to re-run multiple times (all statements are idempotent).
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- STEP 1: Create request_supporting_documents table (if not exists)
-- ──────────────────────────────────────────────────────────────
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

grant select, insert, delete on blood_bank.request_supporting_documents to authenticated;
grant usage, select on sequence blood_bank.request_supporting_documents_id_seq to authenticated;

-- ──────────────────────────────────────────────────────────────
-- STEP 2: Fix RLS on request_verification_support (facility_contact)
-- ──────────────────────────────────────────────────────────────

alter table blood_bank.request_verification_support enable row level security;

grant select, insert, update, delete on blood_bank.request_verification_support to authenticated;

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
  );

drop policy if exists request_verification_support_insert_owner on blood_bank.request_verification_support;

create policy request_verification_support_insert_owner
  on blood_bank.request_verification_support
  for insert to authenticated
  with check (
    (
      created_by = auth.uid()
      and (storage_path is null or split_part(storage_path, '/', 1) = auth.uid()::text)
      and exists (
        select 1 from blood_bank.blood_request br
        join blood_bank.patient p on p.patient_id = br.patient_id
        where br.request_id = request_verification_support.request_id
          and p.auth_user_id = auth.uid()
          and br.status = 'pending'
          and coalesce(br.verification_status, 'pending') = 'pending'
      )
    )
    or exists (
      select 1 from blood_bank.admin a
      where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or (a.auth_user_id is not null and a.auth_user_id = auth.uid())
    )
  );

drop policy if exists request_verification_support_update_coordinator on blood_bank.request_verification_support;

create policy request_verification_support_update_coordinator
  on blood_bank.request_verification_support
  for update to authenticated
  using (
    exists (
      select 1 from blood_bank.admin a
      where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or (a.auth_user_id is not null and a.auth_user_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from blood_bank.admin a
      where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or (a.auth_user_id is not null and a.auth_user_id = auth.uid())
    )
  );

drop policy if exists request_verification_support_delete_owner on blood_bank.request_verification_support;

create policy request_verification_support_delete_owner
  on blood_bank.request_verification_support
  for delete to authenticated
  using (
    created_by = auth.uid()
    and exists (
      select 1 from blood_bank.blood_request br
      join blood_bank.patient p on p.patient_id = br.patient_id
      where br.request_id = request_verification_support.request_id
        and p.auth_user_id = auth.uid()
        and br.status = 'pending'
        and coalesce(br.verification_status, 'pending') = 'pending'
    )
  );

-- ──────────────────────────────────────────────────────────────
-- STEP 3: Fix RLS on request_supporting_documents (uploaded files)
-- ──────────────────────────────────────────────────────────────

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

-- ──────────────────────────────────────────────────────────────
-- STEP 4: Ensure storage bucket exists
-- ──────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'request-supporting-documents',
  'request-supporting-documents',
  false,
  20971520,
  array['image/jpeg', 'image/png', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = array['image/jpeg', 'image/png', 'application/pdf'];

-- ──────────────────────────────────────────────────────────────
-- STEP 5: Fix Storage object RLS policies
-- ──────────────────────────────────────────────────────────────

drop policy if exists request_supporting_documents_select_participants on storage.objects;
drop policy if exists request_supporting_documents_insert_owner on storage.objects;
drop policy if exists request_supporting_documents_delete_owner on storage.objects;
drop policy if exists request_supporting_documents_storage_select on storage.objects;
drop policy if exists request_supporting_documents_storage_insert on storage.objects;
drop policy if exists request_supporting_documents_storage_delete on storage.objects;

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
    )
  );

create policy request_supporting_documents_storage_insert
  on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'request-supporting-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy request_supporting_documents_storage_delete
  on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'request-supporting-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ──────────────────────────────────────────────────────────────
-- STEP 6: Reload PostgREST schema cache
-- ──────────────────────────────────────────────────────────────
notify pgrst, 'reload schema';
