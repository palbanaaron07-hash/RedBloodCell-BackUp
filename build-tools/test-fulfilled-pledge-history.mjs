import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(
  new URL('../supabase/migrations/202609200003_fulfilled_pledges_in_donation_history.sql', import.meta.url),
  'utf8'
);
const legacyMigration = fs.readFileSync(
  new URL('../supabase/migrations/202609200004_legacy_fulfilled_pledges_in_history.sql', import.meta.url),
  'utf8'
);

assert.match(migration, /create or replace function blood_bank\.get_my_donation_history\(\)/i);
assert.match(migration, /dp\.status in \('request_fulfilled', 'recipient_confirmed'\)/i);
assert.match(migration, /'completed'::varchar/i);
assert.match(migration, /Emergency donation fulfilled for request #/i);
assert.match(migration, /set last_donation_date = greatest/i);
assert.match(migration, /donor_status = 'donated'/i);
assert.match(migration, /availability_status = 'unavailable'/i);
assert.match(migration, /set status = 'request_fulfilled'/i);

const donorUpdatePosition = migration.indexOf('update blood_bank.donor d');
const pledgeUpdatePosition = migration.indexOf('update blood_bank.donor_pledge');
assert.ok(donorUpdatePosition > 0 && pledgeUpdatePosition > donorUpdatePosition);
assert.match(legacyMigration, /dp\.status = 'pledged'/i);
assert.match(legacyMigration, /br\.recipient_received_at is not null/i);
assert.match(legacyMigration, /br\.community_status = 'fulfilled'/i);

console.log('Fulfilled pledge donation-history regression checks passed.');
