import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { existsSync, readFileSync } from 'node:fs';

const rootDirectory = dirname(fileURLToPath(import.meta.url));

const rootHtmlPages = [
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
  'admin_dashboard.html'
];

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173
  },
  plugins: [
    {
      name: 'serve-raw-css',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const rawUrl = req.url || '';
          const url = new URL(rawUrl, 'http://127.0.0.1');
          if (url.pathname.endsWith('.css') && !url.searchParams.has('import')) {
            const cleanPath = url.pathname.replace(/^\/+/, '');
            const filePath = resolve(rootDirectory, cleanPath);
            if (existsSync(filePath)) {
              res.setHeader('Content-Type', 'text/css; charset=utf-8');
              res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
              res.end(readFileSync(filePath, 'utf8'));
              return;
            }
          }
          next();
        });
      }
    }
  ],
  build: {
    rollupOptions: {
      input: Object.fromEntries(
        rootHtmlPages.map((page) => [page.replace(/\.html$/, ''), resolve(rootDirectory, page)])
      )
    }
  }
});
