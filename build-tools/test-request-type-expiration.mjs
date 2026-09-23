import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../supabase/migrations/202609130009_request_type_expiration_lifecycle.sql', import.meta.url), 'utf8');
const confirmationMigration = fs.readFileSync(new URL('../supabase/migrations/202609130003_replacement_donation_confirmations.sql', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../public/supabase-client.js', import.meta.url), 'utf8');
const patient = fs.readFileSync(new URL('../public/scripts/pages/account-dashboard.js', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../public/scripts/pages/admin-dashboard.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../account_dashboard.html', import.meta.url), 'utf8');

for (const rule of [
  'alter column expires_at drop not null',
  "if new.request_type = 'replacement' then",
  'new.expires_at := null',
  "request_type <> 'replacement'",
  "(br.request_type = 'replacement' or br.expires_at > now())",
  "p.proname in ('notify_eligible_donors', 'verify_blood_request'",
  "where br.request_type = 'replacement'"
]) assert.ok(migration.includes(rule), `Missing request-type expiration rule: ${rule}`);

assert.match(confirmationMigration, /when total >= target_units then 'complete'/);
assert.match(confirmationMigration, /community_status = 'fulfilled'/);
assert.match(client, /const timedOut = !isReplacement && expiresAt/);
assert.match(admin, /const timedOut = !isReplacement && expiresAt/);
assert.match(patient, /replacement campaign stays active until the required units are confirmed/i);
assert.match(html, /name="request_type" value="emergency_donor"/);
assert.doesNotMatch(html, /What kind of help is needed/);

console.log('Request-type expiration lifecycle checks passed.');
