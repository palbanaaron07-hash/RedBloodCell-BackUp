-- Migration: Restrict public map donors to medically screened and eligible donors only
-- Ensures donors who are only 'registered', 'checked_in', 'deferred', or in 90-day waiting period do not appear on public maps.

create or replace function blood_bank.list_visible_donors()
returns table (
  donor_id bigint,
  blood_type varchar,
  availability_status varchar,
  donor_status varchar,
  show_on_map boolean,
  location_status varchar,
  map_area varchar,
  last_donation_date date
)
language sql
stable
security definer
set search_path = blood_bank, public
as $$
  select d.donor_id, d.blood_type, d.availability_status,
         coalesce(d.donor_status, 'registered'::varchar),
         d.show_on_map, d.location_status, d.map_area, d.last_donation_date
  from blood_bank.donor d
  where auth.uid() is not null
    and d.show_on_map is true
    and lower(coalesce(d.location_status, '')) = 'verified'
    and lower(coalesce(d.donor_status, '')) not in ('registered', 'checked_in', 'deferred', 'incomplete')
    and (
      lower(coalesce(d.donor_status, '')) = 'approved'
      or (
        lower(coalesce(d.donor_status, '')) = 'donated'
        and (d.last_donation_date is null or d.last_donation_date <= current_date - interval '90 days')
      )
    )
  order by d.donor_id;
$$;

revoke all on function blood_bank.list_visible_donors() from public;
grant execute on function blood_bank.list_visible_donors() to authenticated;
