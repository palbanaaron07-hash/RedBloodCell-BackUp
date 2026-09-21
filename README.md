# VeinDrop / RedBloodCell

VeinDrop is a multi-page blood-bank prototype. Its operational pages use classic HTML, CSS, and JavaScript with Supabase as the primary application backend.

## Development

```powershell
npm ci
npm run dev
```

`index.html` serves as the marketing home page and primary entry point for the system.

## Production verification

```powershell
npm run build
npm run verify:architecture
```

The Vite configuration explicitly treats every root HTML page as an entry. The verification command fails if a public route, referenced local asset, or production output is missing.

## Architecture boundaries

- Root `*.html` files are stable public routes. Keep their filenames when refactoring internals.
- `public/` contains classic browser scripts, PWA files, and other files that must retain stable root URLs.
- `public/scripts/pages/` contains behavior extracted unchanged from the corresponding HTML pages.
- `supabase/` contains the primary PostgreSQL migrations and privileged Edge Functions.
- `api/` is a retired PHP/MySQL compatibility layer retained for historical reference; it is not deployed.
- Root `supabase-*.sql` files are manual compatibility/recovery patches retained at their documented paths. New schema evolution belongs in `supabase/migrations/`.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for responsibilities and refactoring rules.
