import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = fs.readFileSync(new URL('../public/scripts/pages/account-dashboard.js', import.meta.url), 'utf8');
const start = source.indexOf('function renderCommunityCard(r)');
const code = source.slice(start, source.indexOf('\n}', start) + 2);
const context = vm.createContext({
  escapeHtml: value => String(value).replaceAll('<', '&lt;'),
  formatTimeAgo: () => 'Today',
  getCommunityLifecycle: request => ({ status: request.status || 'active', label: request.status || 'Active' }),
  getRequestProgressTone: () => 'tone-neutral',
  activeCommunityFilter: 'all'
});
vm.runInContext(code, context);
for (const request_type of ['replacement', 'emergency_donor']) {
  const html = context.renderCommunityCard({ id: 9, request_type, units_needed: 2, blood_type: 'A+', notes: '<test>', urgency: 'urgent' });
  assert.match(html, /request-card-heading/);
  assert.match(html, /request-arrangement-text/);
  assert.equal((html.match(/class="feed-status-pill/g) || []).length, 1);
  assert.match(html, /hideFeedCard\('9'\)/);
  assert.match(html, /openCommunityRequestDetails\('9'\)/);
  assert.match(html, /View Details/);
  assert.match(html, /&lt;test>/);
  if (request_type === 'replacement') {
    assert.doesNotMatch(html, /URGENT/);
    assert.match(html, /request-progress-summary/);
  } else {
    assert.match(html, /URGENT/);
  }
}
context.activeCommunityFilter = 'hidden';
assert.match(context.renderCommunityCard({ id: 9 }), /unhideFeedCard\('9'\)/);
const cssPath = fs.existsSync(new URL('../styles/components/mobile-request-cards.css', import.meta.url))
  ? new URL('../styles/components/mobile-request-cards.css', import.meta.url)
  : new URL('../mobile-request-cards.css', import.meta.url);
const css = fs.readFileSync(cssPath, 'utf8');
assert.match(css, /:is\(\[id\^="myReqCard-"\], \[id\^="feedCard-"\]\)/);
assert.match(css, /min-height: 48px/);
console.log('Community mobile card regression checks passed.');
