import assert from 'node:assert/strict';
import fs from 'node:fs';

const dashboard = fs.readFileSync('public/scripts/pages/admin-dashboard.js', 'utf8');
const client = fs.readFileSync('public/supabase-client.js', 'utf8');
const html = fs.readFileSync('admin_dashboard.html', 'utf8');
const migration = fs.readFileSync('supabase/migrations/202609230001_admin_notifications.sql', 'utf8');

assert.match(dashboard, /listMyAdminNotifications\(150\)/);
assert.match(dashboard, /markAllMyAdminNotificationsRead\(\)/);
assert.match(dashboard, /deleteAllMyAdminNotifications\(\)/);
assert.match(dashboard, /deleteMyNotification\(notification\.id\)/);
assert.match(dashboard, /subscribeToNotifications\(user\.id/);
assert.doesNotMatch(dashboard, /bloodconnect_read_notifications|bloodconnect_dismissed_notifications/);
assert.doesNotMatch(dashboard, /generateBootstrapNotifications|startRequestNotificationPolling/);

for (const filter of ['all', 'unread', 'read', 'request', 'inventory', 'donor']) {
  assert.match(html, new RegExp(`data-notif-filter="${filter}"`));
}

assert.match(client, /filter: `recipient_user_id=eq\.\$\{userId\}`/);
assert.match(client, /async function markAllMyAdminNotificationsRead/);
assert.match(client, /async function deleteMyNotification/);
assert.match(client, /async function deleteAllMyAdminNotifications/);

assert.match(migration, /create policy notifications_delete_own/);
assert.match(migration, /add column if not exists audience/);
assert.match(migration, /uq_notifications_recipient_event/);
assert.match(migration, /trg_notify_admin_new_blood_request/);
assert.match(migration, /trg_notify_admin_new_donor/);
assert.match(migration, /trg_notify_admin_low_inventory/);
assert.match(migration, /join blood_bank\.admin a on lower\(a\.email\) = lower\(u\.email\)/);

console.log('Admin notification regression checks passed.');
