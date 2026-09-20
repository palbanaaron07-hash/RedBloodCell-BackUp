-- ============================================================
-- BloodConnect - Enable Admin Dashboard Realtime Notifications
-- Run this once in the Supabase SQL Editor.
-- ============================================================

do $$
begin
  begin
    alter publication supabase_realtime add table blood_bank.blood_request;
  exception when duplicate_object then
    null;
  end;

  begin
    alter publication supabase_realtime add table blood_bank.donor;
  exception when duplicate_object then
    null;
  end;

  begin
    alter publication supabase_realtime add table blood_bank.blood_inventory;
  exception when duplicate_object then
    null;
  end;
end $$;
