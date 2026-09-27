import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const client = fs.readFileSync(new URL('../public/supabase-client.js', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../public/scripts/pages/admin-dashboard.js', import.meta.url), 'utf8');
const creation = client.slice(client.indexOf('async function createBloodRequest('), client.indexOf('async function recordReplacementDonation('));
let supportResult = { error: { message: 'Contact write rejected' } };
let documentResult = { data: [{ storage_path: 'owner/42/file.pdf' }] };
let documentCalls = 0;
const context = vm.createContext({
  SUPABASE_CONFIGURED: true,
  supabaseClient: { auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) } },
  resolveOrCreatePatientId: async () => ({ patientId: 7 }),
  normalizeBloodType: value => value,
  isValidBloodType: () => true,
  validateRequestSupportingDocuments: files => ({ ok: true, files }),
  bloodBank: () => ({ from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: { request_id: 42 }, error: null }) }) }) }) }),
  saveRequestVerificationSupport: async () => { if (supportResult instanceof Error) throw supportResult; return supportResult; },
  saveRequestSupportingDocuments: async () => { documentCalls++; return documentResult; }
});
vm.runInContext(creation, context);
const payload = { blood_type: 'A+', facility_contact: '12345', supporting_documents: [{}] };
let result = await context.createBloodRequest(payload);
assert.equal(documentCalls, 1, 'A contact error must not skip document uploads');
assert.equal(result.data.supporting_documents.length, 1);
assert.match(result.warning, /Facility contact was not saved/);
supportResult = new Error('Network failure');
result = await context.createBloodRequest(payload);
assert.equal(documentCalls, 2, 'Thrown contact errors must not skip uploads');
assert.equal(result.error, null, 'The saved request must not be reported as an unsaved request');
supportResult = { data: { facility_contact: '12345' } };
documentResult = { error: { message: 'Upload failed' } };
result = await context.createBloodRequest(payload);
assert.equal(result.data.verification_support.facility_contact, '12345');
assert.match(result.warning, /Supporting documents were not saved/);
documentResult = { data: [] };
result = await context.createBloodRequest({ blood_type: 'A+' });
assert.equal(result.warning, undefined);

const container = { innerHTML: '' };
const modal = { classList: { contains: () => true } };
let readSupport = { data: [], error: { message: 'Permission error' } };
let readDocs = { data: [], error: { message: 'Missing table' } };
const ui = vm.createContext({
  document: { getElementById: () => container },
  console: { error() {} },
  listRequestVerificationSupport: async () => readSupport,
  listRequestSupportingDocuments: async () => readDocs,
  getRequestAllDocuments: row => row.supporting_documents || [],
  prepareAdminRequestDocuments() {},
  escapeHtml: value => String(value),
  formatDateShort: value => value
});
vm.runInContext('let adminRequestDetailsVersion = 1;\n' +
  admin.slice(admin.indexOf('function getVerificationNoteDisplayText('), admin.indexOf('function openAdminRequestDetails(')) +
  admin.slice(admin.indexOf('async function refreshAdminPrivateSupport('), admin.indexOf('function closeAdminRequestDetailModal(')), ui);
const row = { request_id: 42, private_support_loading: true };
assert.match(ui.renderAdminPrivateSupportSection(row), /Loading private support/);
assert.doesNotMatch(ui.renderAdminPrivateSupportSection(row), /No supporting documents attached/);
await ui.refreshAdminPrivateSupport(row, modal, 1);
assert.match(container.innerHTML, /Unable to load facility contact/);
assert.doesNotMatch(container.innerHTML, /No supporting documents attached/);
readSupport = { data: [{ facility_contact: '12345', verified_by_email: 'admin@bloodconnect.com', verified_at: '2026-09-27', verification_method: 'other', verification_note: 'Coordinator approved this request using Verify and Approve Request.\n\nActual review note' }] };
readDocs = { data: [{ storage_path: 'owner/42/file.pdf', file_name: 'file.pdf' }] };
await ui.refreshAdminPrivateSupport(row, modal, 1);
assert.match(container.innerHTML, /12345/);
assert.match(container.innerHTML, /<span>Verified by<\/span><strong>admin<\/strong>/);
assert.doesNotMatch(container.innerHTML, /admin@bloodconnect\.com|Verification basis|Other documented verification|Coordinator approved this request using/);
assert.match(container.innerHTML, /<span>Verification Note<\/span><strong>Actual review note<\/strong>/);
assert.match(container.innerHTML, /Attached Supporting Documents \(1\)/);
readSupport = { data: [] }; readDocs = { data: [] };
await ui.refreshAdminPrivateSupport(row, modal, 1);
assert.equal(row.verification_support, null, 'A successful empty read must clear stale cached support');
assert.match(container.innerHTML, /No supporting documents attached/);
container.innerHTML = 'Another request';
await ui.refreshAdminPrivateSupport(row, modal, 0);
assert.equal(container.innerHTML, 'Another request', 'Stale modal responses must not overwrite another request');
console.log('Request support save, loading, error, empty-result and modal-race checks passed.');
