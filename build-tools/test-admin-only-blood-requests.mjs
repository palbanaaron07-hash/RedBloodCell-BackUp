import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relativePath) => fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const accountHtml = read('../account_dashboard.html');
const accountScript = read('../public/scripts/pages/account-dashboard.js');
const adminHtml = read('../admin_dashboard.html');
const adminScript = read('../public/scripts/pages/admin-dashboard.js');
const client = read('../public/supabase-client.js');
const migration = read('../supabase/migrations/202609230002_admin_only_blood_requests.sql');
const notificationMigration = read('../supabase/migrations/202609230001_admin_notifications.sql');

assert.doesNotMatch(accountHtml, /id="communityRequestFeed"|Community Requests \(/);
assert.doesNotMatch(accountHtml, /id="donorMatchingRequests"|id="btnPledgeHelp"/);
assert.match(accountHtml, /sent privately to the blood bank admin/);
assert.match(accountHtml, /not published as a community request/);

const loadRequests = accountScript.slice(
  accountScript.indexOf('async function loadRequests('),
  accountScript.indexOf('// Filter dropdown toggle', accountScript.indexOf('async function loadRequests('))
);
assert.doesNotMatch(loadRequests, /loadCommunityRequests\(\)|applyCommunityFilter\(\)/);
assert.match(accountScript, /Private request/);
assert.match(accountScript, /visible only to you and authorized blood bank admins/);
assert.doesNotMatch(accountScript.slice(accountScript.indexOf('function renderRequestCard('), accountScript.indexOf('let pendingBloodReceipt')), /donors pledged|markBloodReceived\(/);

assert.doesNotMatch(adminHtml, /id="mobilizeDonorsModal"|id="btnBroadcastAppeal"/);
assert.doesNotMatch(adminScript, /\$\{canMobilize \?|\$\{mobilizeBtn\}/);
assert.doesNotMatch(adminScript.slice(adminScript.indexOf('function renderRequestsSection()'), adminScript.indexOf('// Request section filters listeners')), /communityLifecycle|Donors Pledged/);
assert.doesNotMatch(client, /rpc\('get_my_matching_requests'\)/);

for (const safeguard of [
  'where false',
  'Community donor notifications are disabled',
  'Community donor responses are disabled',
  "tg_op = 'INSERT'",
  'create or replace function blood_bank.pledge_to_blood_request'
]) assert.ok(migration.includes(safeguard), `Missing admin-only safeguard: ${safeguard}`);

assert.match(notificationMigration, /trg_notify_admin_new_blood_request/);
console.log('Admin-only blood request regression checks passed.');
assert.doesNotMatch(adminScript, /openMobilizeDonorsModal|handleBroadcastAppeal|activeMobilizeRequestId/);
