-- ============================================================
-- PATCH: Update donor waiting period from 56 days to 90 days (3 months)
-- Apply to: Supabase project (blood_bank schema)
-- ============================================================

-- 1. Update the trigger function that enforces the waiting period
--    before marking a donor as 'donated'
CREATE OR REPLACE FUNCTION blood_bank.enforce_donation_waiting_period()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  days_since INT;
BEGIN
  -- Only enforce when transitioning TO 'donated'
  IF new.donor_status = 'donated' AND old.donor_status IS DISTINCT FROM 'donated' THEN
    IF old.last_donation_date IS NOT NULL THEN
      days_since := (current_date - old.last_donation_date);
      IF days_since < 90 THEN
        RAISE EXCEPTION
          'Donor must wait 90 days (3 months) between donations. % days remain.',
          (90 - days_since)
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;
  RETURN new;
END;
$$;

-- 2. Replace pattern in all views/functions across migrations:
--    BEFORE: d.last_donation_date <= current_date - 56
--    AFTER:  d.last_donation_date <= current_date - 90
--
--    BEFORE: last_donation_date > current_date - 56
--    AFTER:  last_donation_date > current_date - 90
--
--    BEFORE: current_date - result.last_donation_date < 56
--    AFTER:  current_date - result.last_donation_date < 90
--
--    BEFORE: current_date - p_donation_date < 56 then 'unavailable'
--    AFTER:  current_date - p_donation_date < 90 then 'unavailable'
--
--    BEFORE: interval '56 days'
--    AFTER:  interval '90 days'
--
-- Migration files affected:
--   202609150001_all_eligible_donor_appeals.sql (lines 78, 103, 156, 190)
--   202609140003_blood_compatibility_and_pledge_notifications.sql (lines 51, 108, 141, 206)
--   202609140002_exclude_requesters_from_donor_appeals.sql (lines 58, 115, 148)
--   202609140001_replacement_any_blood_type.sql (lines 25, 83, 117)
--   202609130009_request_type_expiration_lifecycle.sql (line 134)
--   202609130003_replacement_donation_confirmations.sql (line 97)
--   202609130002_align_donor_request_matching.sql (line 19)
--   202609130001_map_respects_donor_availability.sql (line 21)
--   202609120004_in_app_donor_appeals.sql (lines 71, 99)
--   202609060002_strict_map_screening_eligibility.sql (line 32)
--   202608240001_multi_role_accounts.sql (lines 365-366)
