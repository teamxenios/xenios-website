---
name: Supabase integration quirks (Express + Vite stack)
description: Non-obvious gotchas wiring supabase-js into this Node/Express app — Node 20 WebSocket crash, new API key format, DDL limits.
---

# Supabase integration quirks

## Node 20 + supabase-js crashes at client construction (WebSocket)
`createClient()` eagerly builds a Realtime client, which needs a global `WebSocket`.
Node 20 has none, so construction throws `Node.js 20 detected without native WebSocket support`
and (if done at import time) takes down the whole server.

**Fix:** install `ws` and pass `realtime: { transport: ws }` to every `createClient`.
Also construct clients lazily (getter functions, not at import) so a missing key or
transport can never crash boot.

**Why:** we never use realtime subscriptions, but supabase-js initializes it regardless.

## This project uses Supabase's NEW API key format
Keys are `sb_publishable_...` (replaces anon, public/safe for browser) and
`sb_secret_...` (replaces service_role, server-only, bypasses RLS).
They are opaque to supabase-js — pass them as the key arg like the old JWT keys.

**Convention here:** store `sb_publishable_` in env `SUPABASE_ANON_KEY` (+ `VITE_SUPABASE_URL`
/ `VITE_SUPABASE_ANON_KEY` for the browser admin client) and `sb_secret_` in secret
`SUPABASE_SERVICE_ROLE_KEY`. All server reads/writes use the secret (service) client;
RLS is enabled with no policies, so only the secret key can touch data.

## Schema/DDL must be run by the user in the SQL Editor
There is no Postgres password / direct connection available, and the service key only
talks to PostgREST (no arbitrary DDL). `supabase/schema.sql` must be pasted into the
Supabase SQL Editor by the user. Symptom when not done: `PGRST205 Could not find the
table '...' in the schema cache`.
