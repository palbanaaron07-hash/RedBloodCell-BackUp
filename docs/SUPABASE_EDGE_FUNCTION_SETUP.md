# Supabase Setup Guide (New blood_bank Schema + Edge Function)

This guide helps you apply the new `blood_bank` schema and then deploy the `add-donor` edge function.

## 1) Prerequisites

1. Install Supabase CLI.
2. Authenticate CLI.
3. Link this workspace to your Supabase project.

## 2) Apply the new database schema

You have two options.

Option A: Fresh rebuild in SQL Editor (drops old `blood_bank` schema)

1. Open Supabase Dashboard -> SQL Editor.
2. Run the full script from `supabase-full-setup.sql`.

Option B: Migration-based setup with CLI

```powershell
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

This applies: `supabase/migrations/202604040001_blood_bank_fresh_schema.sql`

To seed a default admin row (required for admin login bootstrap), also apply:

`supabase/migrations/202604050001_seed_default_admin.sql`

If using CLI migrations:

```powershell
supabase db push
```

Default seeded admin credentials:
- Email: `admin@bloodconnect.com`
- Password: `Admin123!@#`

Change this password after first successful login.

## 3) Deploy edge function

```powershell
supabase functions deploy add-donor --project-ref YOUR_PROJECT_REF
supabase functions deploy bootstrap-admin-auth --project-ref YOUR_PROJECT_REF
supabase functions deploy password-reset --project-ref YOUR_PROJECT_REF
```

Notes:
- Function source: `supabase/functions/add-donor/index.ts`.
- Function source: `supabase/functions/bootstrap-admin-auth/index.ts`.
- Supabase provides runtime secrets automatically:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`

## Password reset setup

Apply the password reset migration:

```powershell
supabase db push
```

Create a secret used only to fingerprint reset emails and client addresses in audit records:

```powershell
supabase secrets set PASSWORD_RESET_HASH_SECRET="YOUR_LONG_RANDOM_SECRET" --project-ref YOUR_PROJECT_REF
```

In Supabase Dashboard, configure Authentication before using the reset flow:

1. Set the email OTP length to `6` and expiry to `600` seconds.
2. Edit the **Reset password** email template to display `{{ .Token }}`. Do not include a direct confirmation link in this template.
3. Configure a custom SMTP provider for production delivery. The built-in provider is intended only for testing and has a very low email limit.
4. Keep the per-address resend interval at `60` seconds or longer and configure Auth rate limits for the expected production traffic.

The `password-reset` Edge Function adds an application-level five-attempt verification limit, per-email and per-IP request throttles, hashed audit identifiers, one-time challenge consumption, password policy enforcement, and global refresh-token revocation. It is the sole production password-reset backend; the retired PHP/MySQL API is not deployed.

## 4) Update frontend configuration

Edit `supabase-client.js` and set:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Optional override:
- `SUPABASE_FUNCTIONS_BASE_URL` (default `${SUPABASE_URL}/functions/v1`)

## 5) Important compatibility note

Current frontend/edge code still references old tables like `profiles` and `blood_requests`.
Your new schema uses `blood_bank.donor`, `blood_bank.patient`, `blood_bank.blood_request`, and related tables.

This means app code changes are required before the existing dashboard features work with the new schema.

## 6) Recommended next step

Refactor `supabase-client.js` and `supabase/functions/add-donor/index.ts` to target `blood_bank` tables and columns.
