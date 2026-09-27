import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const page = read('../public/scripts/pages/admin-dashboard.js');
const archive = read('../public/scripts/pages/admin-request-archive.js');
const nodes = Object.fromEntries(['requestsSectionList','requestArchiveToolbar','requestSelectionToggle','requestSelectionActions','requestSelectionCount','requestArchiveBulkButton','requestSelectAllToggle','requestArchiveMessage','requestsFilterSummary','clearRequestFilters'].map(id => [id, { innerHTML: '', textContent: '', hidden: false, disabled: false }]));
const row = (request_id, archived_at = null) => ({ request_id, archived_at, blood_type_needed: 'A+', quantity: 2, status: 'pending', patient: { first_name: 'Test', last_name: 'Requester' } });
const requests = [row(11), row(12), row(13)];
const calls = [];
const context = vm.createContext({
  window: {},
  document: {
    getElementById: id => nodes[id] || null,
    querySelectorAll: selector => selector === '#requestsSectionList .request-select-checkbox'
      ? [...nodes.requestsSectionList.innerHTML.matchAll(/class="request-select-checkbox" value="(\d+)"/g)].map(match => ({ value: match[1] }))
      : [],
    addEventListener() {}
  },
  adminRenderBlocked: () => false,
  requestsSectionCache: requests,
  requestsVisibleCount: 2,
  requestsPageSize: 2,
  requestStatusFilterValue: 'all',
  requestBloodTypeFilterValue: 'all',
  getSearchQuery: () => '',
  includesQuery: () => true,
  getCommunityLifecycleInfo: item => ({ status: item.community_status === 'expired' || (item.expires_at && new Date(item.expires_at) <= new Date()) ? 'expired' : item.status }),
  normalizeRequestStatus: status => status,
  normalizeBloodType: value => value,
  isUrgentRequest: () => false,
  escapeHtml: value => String(value),
  updateRequestsPagination() {},
  bloodBank: () => ({ rpc: async (name, args) => { calls.push({ name, args }); requests.forEach(item => { if (args.p_request_ids.includes(item.request_id)) item.archived_at = args.p_archive ? '2026-09-27T00:00:00Z' : null; }); return { data: args.p_request_ids.length, error: null }; } }),
  refreshRequestsSection: async () => context.renderRequestsSection()
});
vm.runInContext(archive, context);
vm.runInContext(page.slice(page.indexOf('function getRequestDisplayStatus('), page.indexOf('function isUrgentRequest(')), context);
vm.runInContext(page.slice(page.indexOf('function isPendingRequest('), page.indexOf('function getValidRequestTransitions(')), context);
vm.runInContext(page.slice(page.indexOf("let adminRequestsTab = 'active';"), page.indexOf('async function loadReplacementConfirmationHistory')), context);
vm.runInContext(page.slice(page.indexOf('function renderRequestsSection()'), page.indexOf('function updateRequestsPagination')), context);
context.renderRequestsSection();
assert.doesNotMatch(nodes.requestsSectionList.innerHTML, /request-actions-toggle|request-card-menu|btn-row-action/);
assert.match(nodes.requestsSectionList.innerHTML, /role="button" tabindex="0"/);
context.toggleRequestSelectionMode(true);
assert.equal((nodes.requestsSectionList.innerHTML.match(/class="request-select-checkbox"/g) || []).length, 2);
assert.equal(nodes.requestSelectAllToggle.textContent, 'Select all');
context.toggleSelectAllRequests();
assert.equal(nodes.requestSelectionCount.textContent, '3 selected');
assert.equal(nodes.requestSelectAllToggle.textContent, 'Unselect all');
context.toggleSelectAllRequests();
assert.equal(nodes.requestSelectionCount.textContent, '0 selected');
assert.equal(nodes.requestSelectAllToggle.textContent, 'Select all');
context.toggleSelectAllRequests();
await context.archiveSelectedRequests();
assert.equal(calls.length, 1);
assert.equal(calls[0].name, 'set_request_archive');
assert.deepEqual(Array.from(calls[0].args.p_request_ids), [11, 12, 13]);
assert.equal(calls[0].args.p_archive, true);
assert.ok(requests.every(item => item.status === 'pending'));
context.switchAdminRequestsTab('archives');
assert.equal((nodes.requestsSectionList.innerHTML.match(/role="button" tabindex="0"/g) || []).length, 2);
context.toggleRequestSelectionMode(true);
assert.match(nodes.requestArchiveBulkButton.textContent, /Unarchive selected/);
context.toggleSelectAllRequests();
await context.archiveSelectedRequests();
assert.equal(calls.length, 2);
assert.deepEqual(Array.from(calls[1].args.p_request_ids), [11, 12, 13]);
assert.equal(calls[1].args.p_archive, false);
assert.ok(requests.every(item => item.archived_at === null && item.status === 'pending'));
assert.match(nodes.requestsSectionList.innerHTML, /No archived requests yet/);
requests.push({ ...row(14), expires_at: '2020-01-01T00:00:00Z' });
context.switchAdminRequestsTab('active');
context.requestsVisibleCount = 10;
context.renderRequestsSection();
assert.match(nodes.requestsSectionList.innerHTML, /Request #14[\s\S]*?<span class="badge rejected">Expired<\/span>/);
assert.equal(context.isPendingRequest(requests[3]), false);
context.requestStatusFilterValue = 'pending';
context.renderRequestsSection();
assert.doesNotMatch(nodes.requestsSectionList.innerHTML, /Request #14/);
context.requestStatusFilterValue = 'expired';
context.renderRequestsSection();
assert.match(nodes.requestsSectionList.innerHTML, /Request #14/);
assert.doesNotMatch(nodes.requestsSectionList.innerHTML, /Request #11/);
console.log('Request cards, expired status, filtering, batch archive, and batch unarchive checks passed.');
