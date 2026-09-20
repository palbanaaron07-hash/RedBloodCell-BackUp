-- Fix: Make inventory_id nullable on blood_request table
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor > New Query)

SET search_path TO blood_bank;

ALTER TABLE blood_bank.blood_request
  ALTER COLUMN inventory_id DROP NOT NULL;
