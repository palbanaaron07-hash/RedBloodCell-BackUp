# Retired PHP/MySQL compatibility API

This directory preserves the old `/api/*.php` endpoints for historical reference.
The production browser no longer calls these endpoints, and the GitHub deployment
workflow does not copy this directory into `dist`.

Supabase Auth, the `blood_bank` PostgreSQL schema, RPCs, Realtime, Storage, and
Edge Functions are the only active production backend. Do not add new calls to
these PHP endpoints.
