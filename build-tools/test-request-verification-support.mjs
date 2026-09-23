import fs from 'node:fs';
import assert from 'node:assert/strict';

const client = fs.readFileSync(new URL('../public/supabase-client.js', import.meta.url), 'utf8');
const patient = fs.readFileSync(new URL('../public/scripts/pages/account-dashboard.js', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../public/scripts/pages/admin-dashboard.js', import.meta.url), 'utf8');
const patientHtml = fs.readFileSync(new URL('../account_dashboard.html', import.meta.url), 'utf8');
const adminHtml = fs.readFileSync(new URL('../admin_dashboard.html', import.meta.url), 'utf8');
const sql = fs.readFileSync(new URL('../supabase/migrations/202609130004_private_request_verification_support.sql', import.meta.url), 'utf8');
const privacySql = fs.readFileSync(new URL('../supabase/migrations/202609130005_request_verification_privacy_followup.sql', import.meta.url), 'utf8');

for (const required of [
  "'request-supporting-documents'",
  'public = false',
  'request_verification_support_select_participants',
  "p.auth_user_id = auth.uid()",
  "lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))",
  "normalized_method = 'uploaded_document'",
  "normalized_method = 'facility_confirmation'",
  "normalized_method = 'other'",
  'revoke execute on function blood_bank.rhu_verify_request'
]) assert.ok(sql.includes(required), `Missing database safeguard: ${required}`);
for (const required of [
  'verified_by_email',
  'drop column if exists verification_note',
  'drop column if exists verification_method',
  'request_verification_support_update_coordinator',
  "(storage.foldername(name))[2] ~ '^[0-9]+$'"
]) assert.ok(privacySql.includes(required), `Missing privacy follow-up: ${required}`);

assert.match(client, /REQUEST_DOCUMENT_MAX_BYTES = 20 \* 1024 \* 1024/);
assert.match(client, /'image\/jpeg': 'jpg'/);
assert.match(client, /'image\/png': 'png'/);
assert.match(client, /'application\/pdf': 'pdf'/);
assert.match(client, /createSignedUrl\(path, 300\)/);
assert.match(client, /return \{ data, error: null, warning: supportResult\.error\.message \}/);

const communityStart = client.indexOf('async function listCommunityBloodRequests()');
const communityEnd = client.indexOf('async function createDonorPledge', communityStart);
assert.doesNotMatch(client.slice(communityStart, communityEnd), /listRequestVerificationSupport/,
  'Community requests must not fetch private verification support');

for (const required of ['name="supporting_document"', 'name="facility_contact"', 'Only you and authorized coordinators can view it']) {
  assert.ok(patientHtml.includes(required), `Missing recipient form control: ${required}`);
}
assert.match(patient, /const verificationSupport = req\.verification_support \|\| null/);
assert.match(admin, /rpc\('verify_blood_request'/);
assert.match(admin, /Uploaded supporting document reviewed/);
assert.match(admin, /Physical document reviewed in person/);
assert.match(admin, /Confirmed with facility representative/);
assert.match(admin, /Other documented verification/);
assert.match(admin, /Verify and Approve Request/);
assert.match(adminHtml, /id="requestStatusSubmit"/);

console.log('Private request verification support checks passed.');
