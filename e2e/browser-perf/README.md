# Seeded local environment for browser / mobile / performance proof

Stands up the Early Access launch surface at FULL canonical catalog scale
(217 products / 417 variants / 417 retail prices) against a throwaway local
Supabase, with no production credentials anywhere. Written by
`claude-fable-browser-perf`; results in
`docs/research-launch/BROWSER_PERF_PROOF_2026-08-21.md`.

## Why this exists

The founder's 30–60 s catalog cannot be measured or verified fixed against
production without hammering it, and the fleet policy (correctly) refuses to
hand any session the production `SUPABASE_SERVICE_ROLE_KEY`. Query COUNT and
SHAPE — the facts that make the page slow — are fully measurable locally.

## Recipe

1. **Start a local stack** (any project id; ports must not collide with other
   sessions' stacks — check `docker ps` first):

   ```bash
   npx supabase start   # with supabase/migrations empty or held aside
   ```

   The repo's migrations do NOT apply to an empty database (they assume the
   base schema from the standalone `supabase/research-*.sql` files). Fastest
   proven path: clone the schema from a stack that already works, then add
   what the Early Access catalog path needs:

   ```bash
   docker exec <src-db> pg_dump -U postgres -d postgres --schema=public > /tmp/schema.sql
   docker cp /tmp/schema.sql <dst-db>:/tmp/
   docker exec <dst-db> psql -U postgres -d postgres -f /tmp/schema.sql
   # then, in this order (ERROR-free when ordered like this):
   #   research-required-input-readiness.sql
   #   research-inventory-lots.sql
   #   research-products-diagnostics.sql
   #   research-inventory-lot-coa-admin.sql
   #   migrations/20260804122000_research_early_access_supplier_operations.sql
   #   migrations/20260804130000_research_early_access_unit_holds.sql
   #   migrations/20260726143000_research_product_control_center.sql
   #   migrations/20260804121000_research_early_access_commerce_persistence.sql
   # finally:
   #   grant all on all tables in schema public to service_role;
   #   grant execute on all functions in schema public to service_role;
   #   NOTIFY pgrst, 'reload schema';
   ```

2. **Seed full canonical scale** (exact UUIDs from the committed binding
   artifact, retail prices from the founder CSV):

   ```bash
   node e2e/browser-perf/seed-full-catalog.mjs /tmp/seed.sql
   docker cp /tmp/seed.sql <dst-db>:/tmp/ && docker exec <dst-db> psql -U postgres -d postgres -f /tmp/seed.sql
   ```

3. **Work around the 414 URI limit.** With 217 published products the catalog
   reader's `in.(…)` query strings are ~7.7 KB and the local Kong 414s them
   (nginx 8 KB default). Run the sidecar proxy and point `SUPABASE_URL` at it:

   ```bash
   docker run -d --name xenios-rest-proxy --network supabase_network_<project> \
     -p 54346:3000 -v $PWD/e2e/browser-perf/rest-proxy.conf:/etc/nginx/conf.d/default.conf:ro nginx:alpine
   ```

   (Edit the upstream container names in the conf for your project id. This
   limit is ALSO a latent production risk — see the proof doc §2.)

4. **Boot the production bundle:**

   ```bash
   npm run build
   PORT=5219 \
   SUPABASE_URL=http://127.0.0.1:54346 \
   SUPABASE_ANON_KEY=<from `npx supabase status`> \
   SUPABASE_SERVICE_ROLE_KEY=<from `npx supabase status` — LOCAL demo key only> \
   RESEARCH_EARLY_ACCESS_OWNER_ID=3f2f4bde-6f0f-4a11-9a3e-8c7d5b2a1e90 \
   RESEARCH_EARLY_ACCESS_SESSION_IDENTITY_ENABLED=true \
   RESEARCH_ASSISTED_ORDER_BRIDGE_ENABLED=true \
   RESEARCH_ASSISTED_ORDER_ADMIN_EMAIL=launch-admin@localhost.invalid \
   RESEARCH_EARLY_ACCESS_REQUIRED_AGREEMENTS='[{"kind":"early_access_terms","version":"v1"}]' \
   node scripts/preview-research.mjs
   ```

   Do not set `SITE_URL` to an http:// URL (boot refuses: claim links require HTTPS).

5. **Measure round trips** at the proxy: `docker logs xenios-rest-proxy --since <mark>`
   and count `rest/v1` lines between request markers. Time endpoints with curl;
   measure the browser with the Performance API.

## Session flow for scripted E2E

```
POST /api/research/early-access/unlock {}     -> session cookie (OPEN_ACCESS)
GET  /api/research/early-access/assisted-orders/catalog?pageSize=24
POST /api/research/early-access/assisted-orders   -> 201 + XRR reference
```

## Safety

- The only keys used are the supabase CLI's LOCAL demo JWTs.
- Never point this at production. Never request the production service-role key.
- Orders created here are labeled `*@localhost.invalid`; email provider is
  unconfigured, so nothing can send.
