# Application architecture

## Runtime topology

```text
Browser
  |-- root HTML routes (index.html, dashboards, auth)
  |-- classic page controllers (`public/scripts/pages`)
  |-- shared Supabase browser API (`/supabase-client.js`)
  |
  |-- Supabase Auth + PostgreSQL + Realtime
  |-- Supabase Edge Functions for privileged operations
  `-- PHP/MySQL compatibility API under `/api/*.php`
```

Supabase is authoritative for current authentication and operational data. PHP/MySQL exists only for fallback and synchronization compatibility. New features must not introduce an additional primary write path in MySQL.

## Stable interfaces

The following are compatibility surfaces and should not be renamed without an explicit migration:

- root HTML filenames and their query/hash navigation;
- `/api/*.php` endpoint paths;
- `/supabase-client.js`, `/account_notifications.js`, and PWA asset URLs;
- Supabase Edge Function names;
- database objects already referenced by deployed clients.

The September 2026 recipient/donor route migration renamed the canonical account pages and assets. The old
`patient_*.html` routes remain redirect aliases so deployed bookmarks, query strings, and hash navigation continue
to work.

Internal page logic may be split further as long as script order, global functions used by inline event attributes, and initialization timing remain unchanged.

## Frontend ownership

- `index.html`: marketing and system entry home page.
- Other root HTML files: operational multi-page application routes.
- `public/scripts/pages/<page>.js`: controller for one operational page.
- `public/supabase-client.js`: shared compatibility facade for authentication and domain operations.
- root CSS files: stable stylesheets used by operational pages; they remain at their existing URLs for compatibility.

The remaining small inline script in `account_dashboard.html` is intentionally kept in the document head because it applies the stored theme before rendering and prevents a flash of the wrong theme.

## Data ownership

- `supabase/migrations/`: canonical forward migration history.
- `supabase/functions/`: server-side privileged functions.
- `sql/patches/`: historical/manual recovery SQL patches (formerly root `supabase-*.sql`). Do not apply them blindly after migrations; confirm deployed schema state first.
- `sql/data.sql`: seed/reference data snapshot.
- `api/`: legacy MySQL compatibility. Its session and database records can diverge from Supabase, so new workflows should use Supabase unless a compatibility requirement is explicit.
- `docs/`: project documentation including architecture, system context, and setup guides.


## Refactoring rules

1. Preserve public routes and endpoint paths.
2. Make one mechanical change at a time and compare extracted code with its original content.
3. Keep classic scripts classic until inline event attributes have been replaced deliberately; changing them to ES modules changes global visibility and execution timing.
4. Run `npm run build` followed by `npm run verify:architecture` after structural changes.
5. Put new schema changes in timestamped migrations, not new root SQL patches.
6. Treat removal of the PHP/MySQL layer as a separate data-migration project, not a folder cleanup.
