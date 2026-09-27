import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = fs.readFileSync(new URL('../public/scripts/pages/account-dashboard.js', import.meta.url), 'utf8');
const start = source.indexOf("document.getElementById('requestForm').addEventListener");
const end = source.indexOf("document.getElementById('editRequestForm').addEventListener", start);
const code = 'let requestSubmissionPending = false;\n' + source.slice(start, end);
let submit, creates = 0, closed = 0, tab;
let result = { data: { request_id: 42 }, error: null };
let loaded = true;
const button = {};
const form = { dataset: {}, querySelector: () => button, addEventListener: (_, fn) => { submit = fn; } };
const msg = {};
const label = {};
const context = vm.createContext({
  document: { getElementById: id => ({ requestForm: form, requestMsg: msg, selectedMyFilterText: label })[id], querySelectorAll: () => [] },
  FormData: class { *[Symbol.iterator]() { yield ['blood_type', 'A+']; } },
  createBloodRequest: async () => { creates++; return result; },
  loadRequests: async () => loaded,
  activeMyFilter: 'expired', switchRequestsTab: value => { tab = value; },
  closeRequestModal: () => { closed++; },
  setTimeout: () => 1, clearTimeout: () => {}
});
vm.runInContext(code, context);
const event = { preventDefault() {}, target: form };
await submit(event);
assert.equal(creates, 1);
assert.equal(closed, 1);
assert.equal(context.activeMyFilter, 'all');
assert.equal(tab, 'my');
assert.equal(button.disabled, false);
await submit(event);
assert.equal(creates, 1, 'Saved form must not insert twice');
form.dataset = {};
loaded = false;
await submit(event);
assert.match(msg.textContent, /was saved/);
assert.equal(button.textContent, 'Check My Requests');
assert.equal(button.disabled, false);
form.dataset = {};
result = { error: { message: 'Database rejected request' } };
await submit(event);
assert.match(msg.textContent, /Database rejected request/);
assert.equal(button.disabled, false);
form.dataset = {};
loaded = true;
result = { data: { request_id: 43 }, error: null, warning: 'Supporting documents were not saved.' };
const closedBeforeWarning = closed;
await submit(event);
assert.equal(closed, closedBeforeWarning, 'Partial-save warnings must remain visible');
assert.match(msg.textContent, /Supporting documents were not saved/);
const createsBeforeWarningRetry = creates;
await submit(event);
assert.equal(creates, createsBeforeWarningRetry, 'Checking a partial save must not create a duplicate');
assert.match(msg.textContent, /Supporting documents were not saved/);
form.dataset = {};
let resolve;
context.createBloodRequest = () => { creates++; return new Promise(done => { resolve = done; }); };
const before = creates;
const pending = submit(event);
await submit(event);
assert.equal(creates, before + 1, 'Repeated click blocked while pending');
resolve({ error: { message: 'Test failure' } });
await pending;
assert.equal(button.disabled, false);
const client = fs.readFileSync(new URL('../public/supabase-client.js', import.meta.url), 'utf8');
const creation = client.slice(client.indexOf('async function createBloodRequest('), client.indexOf('async function updateMyPatientProfile('));
assert.doesNotMatch(creation, /inventoryList/);
assert.equal((creation.match(/\.insert\(requestPayload\)/g) || []).length, 1);
// Catch stale global exports that abort startup before form listeners attach.
for (const match of source.matchAll(/window\.\w+\s*=\s*(\w+)\s*;/g)) {
  const name = match[1];
  assert.match(source, new RegExp('(?:function\\s+|(?:const|let|var)\\s+)' + name + '\\b'), `Undefined export: ${name}`);
}
assert.ok(source.startsWith('let requestSubmissionPending = false;'));
const modal = { classList: { add: value => { modal.active = value === 'active'; } } };
const modalContext = vm.createContext({
  document: { getElementById: id => ({ requestForm: form, requestModal: modal })[id] }
});
const modalStart = source.indexOf('function openRequestModal()');
const modalEnd = source.indexOf('\n}', modalStart) + 2;
vm.runInContext('let requestSubmissionPending = false;\n' + source.slice(modalStart, modalEnd), modalContext);
modalContext.openRequestModal();
assert.equal(modal.active, true, 'Create Request opens the modal');
assert.equal(button.disabled, false);
modal.active = false;
vm.runInContext('requestSubmissionPending = true;', modalContext);
button.disabled = true;
modalContext.openRequestModal();
assert.equal(modal.active, true, 'Pending submission does not block reopening the modal');
assert.equal(button.disabled, true, 'Reopening does not allow duplicate submission');
console.log('Request submission regression checks passed.');
