-- ============================================================
-- VeinDrop - Donor map visibility controls
-- Run this in the Supabase SQL Editor.
-- Adds admin-controlled map settings used by the patient donor map.
-- ============================================================

begin;

set search_path to blood_bank;

alter table blood_bank.donor
  add column if not exists show_on_map boolean not null default false,
  add column if not exists location_status varchar(30) not null default 'needs_review',
  add column if not exists map_area varchar(120);

update blood_bank.donor
set map_area = nullif(trim(address), '')
where map_area is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_donor_location_status'
      and conrelid = 'blood_bank.donor'::regclass
  ) then
    alter table blood_bank.donor
      add constraint chk_donor_location_status
      check (location_status in ('verified', 'needs_review', 'missing', 'hidden'));
  end if;
end $$;

grant select (show_on_map, location_status, map_area) on blood_bank.donor to anon, authenticated;
grant update (show_on_map, location_status, map_area) on blood_bank.donor to authenticated;

commit;

-- Refresh Supabase/PostgREST API schema cache so the browser can save these
-- columns immediately after this script runs.
notify pgrst, 'reload schema';
