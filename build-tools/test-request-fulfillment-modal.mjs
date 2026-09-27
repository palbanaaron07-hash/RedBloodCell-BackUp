import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const page = fs.readFileSync(new URL('../public/scripts/pages/admin-dashboard.js', import.meta.url), 'utf8');
const nodes = new Map();
const getNode = id => {
  if (!nodes.has(id)) nodes.set(id, {
    textContent: '', value: '', innerHTML: '', hidden: false, required: false, disabled: false,
    classList: { add() {}, remove() {} }
  });
  return nodes.get(id);
};
const request = { request_id: 7, status: 'approved', request_type: 'emergency_donor', patient: { first_name: 'Test' } };
let updatePayload = null;
let audit = null;
const context = vm.createContext({
  document: { getElementById: getNode },
  requestsSectionCache: [request],
  requestTransitionState: { requestId: null, targetStatus: '', oldStatus: '' },
  getCommunityLifecycleInfo: () => ({ status: 'active' }),
  normalizeRequestStatus: status => status,
  escapeHtml: value => String(value),
  syncVerificationDetailsRequirement() {},
  setRequestStatusMsg() {},
  bloodBank: () => ({ from: () => ({
    update(payload) { updatePayload = payload; return this; },
    eq() { return this; }, select() { return this; },
    async maybeSingle() { return { data: { request_id: 7, status: 'fulfilled', note: updatePayload.note }, error: null }; }
  }) }),
  logRequestStatusAudit: async entry => { audit = entry; },
  recordAdminActivity() {},
  refreshRequestsSection: async () => {},
  refreshOverviewStats: async () => {},
  refreshOverviewPanels: async () => {},
  refreshInventorySection: async () => {},
  closeRequestStatusModal() {},
  setTimeout() {}
});
const run = (start, end) => vm.runInContext(page.slice(page.indexOf(start), page.indexOf(end, page.indexOf(start))), context);
run('function getValidRequestTransitions(', 'function updateRequestsStatsCards(');
run('async function validateRequestTransition(', 'function setRequestStatusMsg(');
run('function openRequestStatusModal(', 'function closeRequestStatusModal(');
run('async function submitRequestStatusTransition(', "let adminRequestsTab = 'active';");

context.openRequestStatusModal(7, 'fulfilled');
assert.equal(getNode('requestStatusReasonGroup').hidden, true);
assert.equal(getNode('requestStatusReason').required, false);
assert.equal(getNode('requestStatusReason').disabled, true);
assert.equal(getNode('requestStatusReason').innerHTML, '');
getNode('requestStatusNote').value = 'Stock issued to requester';
await context.submitRequestStatusTransition({ preventDefault() {} });
assert.equal(updatePayload.status, 'fulfilled');
assert.equal(updatePayload.note, 'Blood bank admin confirmed fulfillment\n\nNote: Stock issued to requester');
assert.equal(audit.reason, 'Blood bank admin confirmed fulfillment');
assert.equal(audit.note, 'Stock issued to requester');

request.status = 'pending';
context.openRequestStatusModal(7, 'approved');
assert.equal(getNode('requestStatusReasonGroup').hidden, true);
context.openRequestStatusModal(7, 'rejected');
assert.equal(getNode('requestStatusReasonGroup').hidden, false);
assert.equal(getNode('requestStatusReason').required, true);
assert.equal(getNode('requestStatusReason').disabled, false);
console.log('Fulfillment omits Closure basis while preserving status, note, and audit data.');
