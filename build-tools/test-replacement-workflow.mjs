import fs from 'node:fs';
import assert from 'node:assert/strict';

const patient = fs.readFileSync(new URL('../public/scripts/pages/account-dashboard.js', import.meta.url), 'utf8');
const card = patient.slice(patient.indexOf('function renderRequestCard('), patient.indexOf('let pendingBloodReceipt'));
assert.match(card, /const canComplete = hasActivePledge/);
const receipt = patient.slice(patient.indexOf('function markBloodReceived('), patient.indexOf('function closeBloodReceivedDialog'));
assert.match(receipt, /request\.request_type === 'replacement'/);
assert.match(receipt, /coordinator confirms the required replacement donations/);

const admin = fs.readFileSync(new URL('../public/scripts/pages/admin-dashboard.js', import.meta.url), 'utf8');
for (const expected of [
  'function openReplacementDonationModal(', 'function submitReplacementDonation(',
  'Record Replacement Donation', 'function loadReplacementConfirmationHistory(',
  "request.request_type === 'replacement' && targetStatus === 'fulfilled'",
  'The request completes automatically at the target.',
  'Public recruitment has expired. Facility-confirmed replacement donations can still be recorded.'
]) assert.ok(admin.includes(expected), `Missing admin workflow: ${expected}`);
assert.doesNotMatch(admin, /Â/);

const html = fs.readFileSync(new URL('../admin_dashboard.html', import.meta.url), 'utf8');
for (const id of ['replacementDonationModal', 'replacementUnits', 'replacementDate', 'replacementFacility', 'replacementReference', 'replacementDonorSource', 'replacementAppDonor']) {
  assert.ok(html.includes(`id="${id}"`), `Missing field ${id}`);
}

const client = fs.readFileSync(new URL('../public/supabase-client.js', import.meta.url), 'utf8');
assert.match(client, /async function recordReplacementDonation/);
assert.match(client, /async function listReplacementDonations/);

const sql = fs.readFileSync(new URL('../supabase/migrations/202609130003_replacement_donation_confirmations.sql', import.meta.url), 'utf8');
for (const rule of [
  'replacement_donation_confirmation', 'where voided_at is null',
  "p_donor_source not in ('app', 'external')", 'current_total + p_units > campaign.target_units',
  "request_row.request_type <> 'replacement'", "request_row.verification_status <> 'verified'",
  "request_type = 'emergency_donor'", 'refresh_replacement_confirmation_progress(bigint) from public',
  'This facility confirmation reference has already been recorded'
]) assert.ok(sql.includes(rule), `Missing database safeguard: ${rule}`);
console.log('Replacement workflow regression checks passed.');
