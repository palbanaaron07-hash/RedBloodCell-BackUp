-- The admin table policy calls is_admin(), which reads that same table.
-- Run the existing predicate as its owner to avoid recursive RLS evaluation.
-- Preserve its definition, grants, and admin membership rules.
begin;

alter function blood_bank.is_admin() security definer;

notify pgrst, 'reload schema';
commit;
