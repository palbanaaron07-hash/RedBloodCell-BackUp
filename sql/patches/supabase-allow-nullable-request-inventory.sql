-- ============================================================================
-- BloodConnect — Allow Nullable inventory_id for Blood Requests
-- Description: Allows requests submitted via Community Crowdsourcing (when physical
--              inventory is 0 or unassigned) to have inventory_id as NULL.
-- ============================================================================

do $$
begin
  -- 1. Drop NOT NULL constraint on blood_request.inventory_id if it exists
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'blood_bank'
      and table_name = 'blood_request'
      and column_name = 'inventory_id'
      and is_nullable = 'NO'
  ) then
    alter table blood_bank.blood_request alter column inventory_id drop not null;
  end if;
end $$;
