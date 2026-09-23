import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const client = fs.readFileSync('public/supabase-client.js', 'utf8');
const dashboard = fs.readFileSync('public/scripts/pages/admin-dashboard.js', 'utf8');
const overviewFunction = fs.readFileSync('supabase/functions/overview-stats/index.ts', 'utf8');

const helperMatch = client.match(/function isPendingUrgentRequestRecord\(row\) \{[\s\S]*?\n\}/);
assert.ok(helperMatch, 'Pending urgent request predicate must exist.');

const context = { Date };
vm.createContext(context);
vm.runInContext(`${helperMatch[0]}\nglobalThis.isPendingUrgentRequestRecord = isPendingUrgentRequestRecord;`, context);
const isPendingUrgent = context.isPendingUrgentRequestRecord;

assert.equal(isPendingUrgent({ request_type: 'emergency_donor', urgency_level: 'urgent', status: 'pending' }), true);
assert.equal(isPendingUrgent({ request_type: 'unsure', urgency_level: 'critical', status: 'submitted' }), true);
assert.equal(isPendingUrgent({ request_type: 'emergency_donor', urgency_level: 'emergency', status: 'approved' }), false);
assert.equal(isPendingUrgent({ request_type: 'replacement', urgency_level: 'urgent', status: 'pending' }), false);
assert.equal(isPendingUrgent({ request_type: 'emergency_donor', urgency_level: 'normal', status: 'pending' }), false);
assert.equal(isPendingUrgent({ request_type: 'emergency_donor', urgency_level: 'urgent', status: 'fulfilled' }), false);
assert.equal(isPendingUrgent({ request_type: 'emergency_donor', urgency_level: 'urgent', status: 'pending', community_status: 'expired' }), false);
assert.equal(isPendingUrgent({ request_type: 'emergency_donor', urgency_level: 'urgent', status: 'pending', expires_at: '2000-01-01T00:00:00Z' }), false);

assert.match(client, /async function getPendingUrgentRequestCount/);
assert.match(client, /\.filter\(isPendingUrgentRequestRecord\)\.length/);
const parseableOverviewFunction = overviewFunction
  .replace(/^import .*;$/m, '')
  .replace(/: Record<string, unknown>/g, '');
assert.doesNotThrow(() => new vm.Script(parseableOverviewFunction));
assert.match(overviewFunction, /\[donorsRes, pendingReqRes, urgentReqRes, totalReqRes, inventoryRes, donationsRes\]/);
assert.doesNotMatch(overviewFunction, /pendingReqRes\.error \|\|\s+urgentReqRes\.error/);

assert.match(dashboard, /refreshPendingUrgentRequestsKpi\(\)/);
assert.match(dashboard, /pendingUrgentRefreshPromise/);
assert.match(overviewFunction, /pending_urgent_requests: urgentReqRes\.error/);

console.log('Pending urgent request regression checks passed.');
