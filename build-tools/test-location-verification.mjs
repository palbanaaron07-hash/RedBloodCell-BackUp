import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../public/supabase-client.js', import.meta.url), 'utf8');
const areasStart = source.indexOf('const BOHOL_MAP_AREAS =');
const updateStart = source.indexOf('async function updateDonorMapSettings(');
const code = source.slice(areasStart, source.indexOf('\n}', updateStart) + 2);
let current = { map_area: 'Town A', location_status: 'verified' };
let saved;
const context = vm.createContext({
  SUPABASE_CONFIGURED: true,
  bloodBank: () => ({ from: () => {
    let update;
    const query = {
      select() { return this; }, eq() { return this; },
      update(value) { update = value; return this; },
      async single() {
        if (update) { saved = update; return { data: update, error: null }; }
        return { data: current, error: null };
      }
    };
    return query;
  } })
});
vm.runInContext(code, context);
assert.equal(context.normalizeBoholMapArea('Cabawan, City of Tagbilaran, Bohol'), 'Tagbilaran City');
assert.equal(context.normalizeBoholMapArea('Tawala, Panglao, Bohol'), 'Panglao');
await context.updateDonorMapSettings(1, { map_area: '', location_status: 'verified', show_on_map: true });
assert.equal(saved.location_status, 'missing');
await context.updateDonorMapSettings(1, { map_area: 'Town B', location_status: 'verified', show_on_map: true });
assert.equal(saved.location_status, 'needs_review');
await context.updateDonorMapSettings(1, { map_area: 'Barangay Tawala, Panglao, Bohol', location_status: 'needs_review', show_on_map: true });
assert.equal(saved.location_status, 'verified');
assert.equal(saved.map_area, 'Panglao');
await context.updateDonorMapSettings(1, { map_area: 'Carmen, Cebu', location_status: 'verified', show_on_map: true });
assert.equal(saved.location_status, 'needs_review');
assert.equal(saved.map_area, 'Carmen, Cebu');
await context.updateDonorMapSettings(1, { map_area: 'Town A', location_status: 'verified', show_on_map: false });
assert.equal(saved.location_status, 'verified');
assert.equal(saved.show_on_map, false, 'Hiding does not erase verification');
current = { map_area: 'Town A', location_status: 'hidden' };
await context.updateDonorMapSettings(1, { map_area: 'Town A', location_status: 'needs_review', show_on_map: false });
assert.equal(saved.show_on_map, false);
assert.equal(saved.location_status, 'needs_review');
const result = await context.updateDonorMapSettings(1, { location_status: 'hidden' });
assert.ok(result.error, 'Legacy hidden is not a new verification choice');
const admin = fs.readFileSync(new URL('../public/scripts/pages/admin-dashboard.js', import.meta.url), 'utf8');
const begin = admin.indexOf('function syncLocationVerification(');
const option = {};
const nodes = { profileMapArea: { value: '' }, profileLocationStatus: { querySelector: () => option }, locationVerificationHelp: {} };
const ui = vm.createContext({ document: { getElementById: id => nodes[id] }, normalizeBoholMapArea: context.normalizeBoholMapArea });
vm.runInContext(admin.slice(begin, admin.indexOf('\n}', begin) + 2), ui);
ui.syncLocationVerification(current);
assert.equal(nodes.profileLocationStatus.value, 'missing');
assert.equal(nodes.profileLocationStatus.disabled, true);
nodes.profileMapArea.value = 'Town B';
ui.syncLocationVerification(current, true);
assert.equal(nodes.profileLocationStatus.value, 'needs_review');
assert.equal(option.disabled, true);
ui.syncLocationVerification({ map_area: 'Town B', location_status: 'needs_review' });
assert.equal(option.disabled, false);
nodes.profileMapArea.value = 'Panglao, Bohol';
ui.syncLocationVerification({ map_area: '', location_status: 'needs_review' }, true);
assert.equal(nodes.profileLocationStatus.value, 'verified');
assert.equal(option.disabled, false);
console.log('Location verification regression checks passed.');
