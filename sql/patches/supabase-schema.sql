-- ============================================================
-- BloodConnect - Fresh Supabase Schema (blood_bank)
-- Run this in Supabase SQL Editor for a clean rebuild.
-- WARNING: This drops and recreates schema blood_bank.
-- ============================================================

begin;

drop schema if exists blood_bank cascade;
create schema blood_bank;
set search_path to blood_bank;

create table donor (
  donor_id bigint generated always as identity primary key,
  first_name varchar(100) not null,
  middle_name varchar(100),
  last_name varchar(100) not null,
  email varchar(255) unique,
  contact_number varchar(50),
  blood_type varchar(5) not null,
  address text,
  availability_status varchar(50),
  last_donation_date date,
  created_at timestamptz not null default now()
);

create table blood_inventory (
  inventory_id bigint generated always as identity primary key,
  donor_id bigint not null references donor(donor_id) on update cascade on delete restrict,
  blood_type varchar(5) not null,
  units_available int not null default 0,
  date_stock date not null,
  status varchar(50) not null,
  last_updated timestamptz not null default now()
);

create table donation_record (
  donation_id bigint generated always as identity primary key,
  donor_id bigint not null references donor(donor_id) on update cascade on delete restrict,
  inventory_id bigint not null references blood_inventory(inventory_id) on update cascade on delete restrict,
  blood_type varchar(5) not null,
  quantity int not null,
  donation_date date not null
);

create table patient (
  patient_id bigint generated always as identity primary key,
  first_name varchar(100) not null,
  middle_name varchar(100),
  last_name varchar(100) not null,
  blood_type_needed varchar(5) not null,
  hospital_name varchar(255),
  contact_number varchar(50),
  address text,
  created_at timestamptz not null default now()
);

create table blood_request (
  request_id bigint generated always as identity primary key,
  patient_id bigint not null references patient(patient_id) on update cascade on delete restrict,
  inventory_id bigint not null references blood_inventory(inventory_id) on update cascade on delete restrict,
  blood_type_needed varchar(5) not null,
  quantity int not null,
  urgency_level varchar(50) not null,
  request_date timestamptz not null default now(),
  status varchar(50) not null
);

create table admin (
  admin_id bigint generated always as identity primary key,
  first_name varchar(100) not null,
  last_name varchar(100) not null,
  email varchar(255) not null unique,
  password_hash varchar(255) not null,
  created_at timestamptz not null default now()
);

create or replace function blood_bank.set_last_updated()
returns trigger
language plpgsql
as $$
begin
  new.last_updated := now();
  return new;
end;
$$;

drop trigger if exists trg_blood_inventory_last_updated on blood_inventory;
create trigger trg_blood_inventory_last_updated
before update on blood_inventory
for each row execute function blood_bank.set_last_updated();

create index if not exists idx_inventory_blood_type on blood_inventory(blood_type);
create index if not exists idx_request_status on blood_request(status);
create index if not exists idx_donation_date on donation_record(donation_date);

commit;
