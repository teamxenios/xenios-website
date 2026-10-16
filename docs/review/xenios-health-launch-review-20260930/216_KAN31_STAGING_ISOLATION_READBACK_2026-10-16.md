# KAN-31 Render staging configuration and Supabase isolation: read-only readback

**PARTIAL.** The public and client-side isolation is verified. The server-secret provenance cannot be read with the
authorized read-only tools.

- **One secure manual action for Samuel** is given in section 3.
- **What this is not.** Not deployment authority. No setting was changed, no SQL run, no browser test launched, no
  workflow retried and nothing deployed. No secret, secret hash or environment export was read or recorded.

Reviewer: `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session.
- **Context.** Main is now `5e140c29` (tree `46fd6017`), per Root. Accepted reviews and the replacement-reviewer
  verdicts are preserved.

## 1. Verified, from authoritative read-only sources

- **Render service** (Render API metadata). `srv-d9h4f4m7r5hc73ctjng0`, `xenios-research-staging`.
  - **Deploy settings:** auto-deploy off; free plan; branch
    `integration/xenios-research-track-b-commerce-activation`.
  - **What it serves:** live commit `65c9cc54` (`dep-d9h559ernols73emd3rg`); origin
    `https://xenios-research-staging.onrender.com`. No events in 7 days.
  - **E33:** not deployed.
- **Separation from production.** Production `srv-d8s9vej7uimc7384dfcg` is a separate service, with auto-deploy off,
  branch `release/early-access-code-session-checkout`, and live `7bba4b6e`. A staging deploy does not touch it.
  Rollback is to the prior live deploy `dep-d9h559ernols73emd3rg`, an existing deploy record.
- **Public config points at staging.** The staging public endpoint `/api/config` returns
  `supabaseUrl = https://tetynodzrtmdbuzgboro.supabase.co`.
  - Both `65c9cc54` (`routes.ts` 421) and E33 (`routes.ts` 484) return `process.env.SUPABASE_URL` there.
  - So the **server's** `SUPABASE_URL` is the staging project.
- **Publishable key belongs to staging.** The served publishable key is **equal** to the staging project's own default
  publishable key, compared with Supabase's key listing and printed as a match only.
- **Consequence for the service-role key.** E33's server Supabase clients (`supabase.ts` 59 and 74) all use
  `SUPABASE_URL`, together with `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY`.
  - A service key from another project would be **rejected** by the staging host.
  - It could not reach production through these clients.

## 2. Unknown with the authorized tools

The Render MCP has no read-only environment-variable reader; its only environment tool mutates. So these remain
unknown:

1. **`SUPABASE_SERVICE_ROLE_KEY` provenance.** Whether it is staging's key. A wrong key causes failures rather than
   cross-project writes, but it must still be the staging key.
2. **`DATABASE_URL`.** E33's legacy storage (`storage.ts` 138, `db.ts` 6) opens a **direct Postgres** connection when
   it is set. This is a separate channel from `SUPABASE_URL` and could point at any database, including production.
   **This is the main isolation unknown.**
3. **Session secrets.** Whether the staging session secrets (`RESEARCH_SESSION_SECRET`,
   `RESEARCH_EARLY_ACCESS_SESSION_SECRET`) differ from production's. Shared values would let sessions cross
   environments.
4. **Noted.** E33's catalog image allow-list pins the production storage origin (`member-catalog-projection.ts` 100).
   That is a read-only image reference, not a data channel.

## 3. One secure manual action for Samuel

In the Render dashboard, open `xenios-research-staging` → Environment. Check by eye, without copying or pasting any
value:

- **(a)** `DATABASE_URL` is **absent**, or its host contains `tetynodzrtmdbuzgboro`;
- **(b)** `SUPABASE_SERVICE_ROLE_KEY` is identical to the secret or `service_role` key shown in the Supabase dashboard
  for project `tetynodzrtmdbuzgboro` (Project Settings → API Keys);
- **(c)** `RESEARCH_SESSION_SECRET` and `RESEARCH_EARLY_ACCESS_SESSION_SECRET` are **not** the same values as on the
  production service `xenios-website`.

Reply with only "staging env verified (a, b, c)", or name which one failed.

**The single next blocker.** That confirmation. With it, the Doc457 conditional E33 staging-deploy authority's
isolation and configuration precondition is met, and Root can proceed under that authority, with rollback to
`dep-d9h559ernols73emd3rg`.

NOT LIVE.
