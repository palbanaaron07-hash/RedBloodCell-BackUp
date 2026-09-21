import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pages = [
  'index.html',
  'learn_more.html',
  'login.html',
  'register.html',
  'forgot-password.html',
  'donor_registration.html',
  'account_dashboard.html',
  'recipient_donor_map.html',
  'account_notifications.html',
  'patient_dashboard.html',
  'patient_donor_map.html',
  'patient_notifications.html',
  'admin_dashboard.html',
  'donor_pledge_details.html'
];

const errors = [];
const allowedInlineScripts = new Map([
  // This tiny head script applies the saved theme before first paint.
  ['account_dashboard.html', 1]
]);

function localReferenceTarget(reference, baseDirectory) {
  if (/^(?:[a-z]+:|\/\/|#)/i.test(reference) || reference === '/') return null;
  const withoutQuery = reference.split(/[?#]/, 1)[0];
  return reference.startsWith('/')
    ? resolve(baseDirectory, withoutQuery.slice(1))
    : resolve(baseDirectory, withoutQuery);
}

for (const page of pages) {
  const sourcePath = resolve(root, page);
  const builtPath = resolve(root, 'dist', page);

  if (!existsSync(sourcePath)) errors.push(`Missing source page: ${page}`);
  if (!existsSync(builtPath)) errors.push(`Missing built page: dist/${page}`);
}

for (const page of pages) {
  const html = readFileSync(resolve(root, page), 'utf8');
  const inlineScriptCount = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/gi)].length;
  const expectedInlineCount = allowedInlineScripts.get(page) ?? 0;

  if (inlineScriptCount !== expectedInlineCount) {
    errors.push(`${page} has ${inlineScriptCount} inline scripts; expected ${expectedInlineCount}`);
  }

  const localReferences = [...html.matchAll(/(?:href|src)=["']([^"']+)["']/g)].map((match) => match[1]);

  for (const reference of localReferences) {
    const normalized = reference.split(/[?#]/, 1)[0].replace(/^\//, '');
    if (!normalized || /^(?:[a-z]+:|\/\/|#)/i.test(reference)) continue;
    const sourceCandidates = [resolve(root, normalized), resolve(root, 'public', normalized)];

    if (!sourceCandidates.some((candidate) => existsSync(candidate))) {
      errors.push(`${basename(page)} references missing local file: ${reference}`);
    }
  }
}

for (const page of pages) {
  const builtHtml = readFileSync(resolve(root, 'dist', page), 'utf8');
  const references = [...builtHtml.matchAll(/(?:href|src)=["']([^"']+)["']/g)].map((match) => match[1]);

  for (const reference of references) {
    const target = localReferenceTarget(reference, resolve(root, 'dist'));
    if (target && !existsSync(target)) {
      errors.push(`dist/${page} references missing built file: ${reference}`);
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Architecture verification passed for ${pages.length} HTML routes.`);
}
