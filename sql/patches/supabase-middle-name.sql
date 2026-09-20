-- Run this once in the Supabase SQL Editor for an existing VeinDrop database.
begin;

alter table blood_bank.patient
  add column if not exists middle_name varchar(100);

alter table blood_bank.donor
  add column if not exists middle_name varchar(100);

commit;
