-- Run this once against the local XAMPP/MySQL bloodconnect database.
alter table profiles
  add column middle_name varchar(100) null after first_name;
