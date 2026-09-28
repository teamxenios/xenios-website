# Xenios P-17 secure status recovery — Claude review packet

Prepared: 2026-09-28  
Review target: source and evidence only  
Disposition: frozen for independent review; not authorized for migration, deployment, email delivery, staging mutation, or production mutation

## 1. Frozen identity

| Slice | Exact commit | Tree | Classification |
|---|---|---|---|
| Runtime | `fef7b313c23ac0e12046420041aa51a3a6e3c2d6` | `55bdc57d3992393f4b767cd7f9c6a00c53e25c60` | Runtime source plus the additive migration and byte-identical candidate mirror |
| Test-only | `4ca346e0bae7252eab62b71e59310cf263211a68` | `a56d10b9038b9f69a3de7036983477eb5ee4fc2c` | Tests, SQL pre/post/rollback material, and disposable verification only |
| Release-control registration | `a683c6087981f54b24d651d3278a2b4161dc0128` | `d1c4f551f44faa8bdc1714c5f34e22d87f8f53e5` | Continuity records, migration registry/DAG, protection manifest, release-control test |
| Release-control final | `9b77f1ce400074985da87daba48628d3ffa1f570` | `cefb32ac849e7bfd8bd728e59d4275e882fa4a22` | Release-control test source-pin correction only |
| Qualification/site-record candidate | `02f8c0d282055eba29321ae55802e74fafbc1f5a` | `f1ff1feeba18b4ac71eaa7d7b64f8a382829ee4f` | Evidence plus generated site records; no runtime or tests |
| Frozen docs/handoff tip | `86350d7ec12dcd1f7cb4ee1fbad8f0682b664263` | `0d8172e554c3a5fa99aa23f285094fd249961fe0` | Continuity and handoff documentation only |

The commits are one linear first-parent chain in the order shown. The runtime tree is frozen at `fef7b313`; no runtime source changes occur after it. The intentional test-only and release-control test changes are separately identified above. At packet preparation, local `HEAD` and `origin/codex/xenios-p17-secure-status-recovery-20260927` both resolved to the supplied docs/handoff tip.

Migration identity:

- managed path: `supabase/migrations/20260927203000_research_status_recovery.sql`
- candidate mirror: `supabase/candidates/20260927203000_research_status_recovery.sql`
- SHA-256: `98cce457db8d82c72a399223117dcf4d98488dc153f3d1883e65a07e95220292`
- dependency: `research_assisted_order_bridge`
- migration was not applied to any managed environment by this lane

## 2. Complete commit and changed-path classification

### Runtime — `fef7b313c23ac0e12046420041aa51a3a6e3c2d6`

Modified runtime paths:

- `client/src/care/CarePublicPages.tsx`
- `client/src/clarity/pages.tsx`
- `client/src/index.css`
- `client/src/pages/Home.tsx`
- `client/src/research/pages/Faq.tsx`
- `server/index.ts`
- `server/research/outbox.ts`
- `server/static.ts`

Added runtime paths:

- `server/research/status-recovery/crypto.ts`
- `server/research/status-recovery/http.ts`
- `server/research/status-recovery/memory-store.ts`
- `server/research/status-recovery/notification.ts`
- `server/research/status-recovery/ports.ts`
- `server/research/status-recovery/production.ts`
- `server/research/status-recovery/service.ts`
- `server/research/status-recovery/status-copy.ts`
- `server/research/status-recovery/supabase-store.ts`
- `shared/research/status-recovery/contract.ts`
- `supabase/candidates/20260927203000_research_status_recovery.sql`
- `supabase/migrations/20260927203000_research_status_recovery.sql`

### Test and SQL qualification — `4ca346e0bae7252eab62b71e59310cf263211a68`

- `client/src/clarity/StatusPage.test.tsx`
- `client/src/clarity/pages.test.tsx`
- `server/research/frontdoor.test.ts`
- `server/research/status-recovery/crypto.test.ts`
- `server/research/status-recovery/http.test.ts`
- `server/research/status-recovery/migration-source.test.ts`
- `server/research/status-recovery/notification.test.ts`
- `server/research/status-recovery/service.test.ts`
- `server/static.test.ts`
- `supabase/candidates/20260927203000_research_status_recovery.postcheck.sql`
- `supabase/candidates/20260927203000_research_status_recovery.precheck.sql`
- `supabase/candidates/20260927203000_research_status_recovery.rollback.md`
- `supabase/verification/20260927_research_status_recovery_disposable.sql`

### Release-control registration — `a683c6087981f54b24d651d3278a2b4161dc0128`

- `.xenios/ACTIVE_TASKS.json`
- `.xenios/CODE_OWNERSHIP.json`
- `.xenios/SESSION_REGISTRY.json`
- `.xenios/sessions/codex-xenios-p17-secure-status-recovery-20260927.json`
- `docs/coordination/MIGRATION_DAG.json`
- `docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json`
- `server/release-control-plane.test.ts`
- `supabase/MIGRATIONS.md`

### Release-control source-pin correction — `9b77f1ce400074985da87daba48628d3ffa1f570`

- `server/release-control-plane.test.ts`

### Qualification evidence — `8677d8f0425f6c058d58d7a864f81e7a3da126be`

- `docs/coordination/evidence/XENIOS_P17_SECURE_STATUS_RECOVERY_2026-09-27.qualification.json`
- `docs/coordination/release-manifests/XENIOS_P17_SECURE_STATUS_RECOVERY_2026-09-27.json`
- `docs/ux/xenios-p17-secure-status-recovery-20260927/BROWSER_UAT.md`
- `docs/ux/xenios-p17-secure-status-recovery-20260927/IMPLEMENTATION_CANDIDATE.md`
- `docs/ux/xenios-p17-secure-status-recovery-20260927/PROTECTED_CHANGE_REVIEW.md`
- `docs/ux/xenios-p17-secure-status-recovery-20260927/SQL_QUALIFICATION.md`

### Qualification finalization — `514c3588ab2ae52607f649a3d3e61adddd121414`

- `.xenios/CODE_OWNERSHIP.json`
- `.xenios/SESSION_REGISTRY.json`
- `.xenios/sessions/codex-xenios-p17-secure-status-recovery-20260927.json`
- `docs/coordination/evidence/XENIOS_P17_SECURE_STATUS_RECOVERY_2026-09-27.qualification.json`
- `docs/coordination/release-manifests/XENIOS_P17_SECURE_STATUS_RECOVERY_2026-09-27.json`
- `docs/ux/xenios-p17-secure-status-recovery-20260927/IMPLEMENTATION_CANDIDATE.md`

### Generated site records — `02f8c0d282055eba29321ae55802e74fafbc1f5a`

- `docs/platform/XENIOS_SITE_SYSTEM_OF_RECORD.generated.json`
- `docs/platform/XENIOS_SITE_SYSTEM_OF_RECORD.generated.md`

### Handoff records — `86350d7ec12dcd1f7cb4ee1fbad8f0682b664263`

- `.xenios/ACTIVE_TASKS.json`
- `.xenios/CODE_OWNERSHIP.json`
- `.xenios/handoffs/2026-09-27T21-33-39-844Z-XENIOS-P17-SECURE-STATUS-RECOVERY-20260927-codex-xenios-p17-secure-status-recovery-20260927.md`
- `docs/ux/xenios-p17-secure-status-recovery-20260927/HANDOFF.md`

## 3. Security and behavior inventory

### Public/API surface

- `POST /api/research/status-recovery/request`: invariant `202` neutral response for match, mismatch, malformed input, rate-limit refusal, storage failure, or outbox failure; minimum response duration defaults to 75 ms.
- `POST /api/research/status-recovery/exchange`: explicit single-use token exchange; success sets the status-only cookie and returns `204`; invalid/expired/consumed/revoked credentials return a generic `401`.
- `GET /api/research/status`: reads only the status cookie and returns one exact-subject safe projection; otherwise generic `401`.
- `POST /api/research/status/end`: revokes the session, clears the cookie, and returns `204`.

All four responses are private (`no-store`, `no-cache`, `no-referrer`, `nosniff`, `noindex, nofollow`). The browser landing uses `#recovery=...`, removes the fragment immediately with `replaceState`, performs no exchange on initial document load, and requires the user’s explicit `View status` action.

### Cookie and credential lifecycle

- Cookie: `xr_status_recovery`; HttpOnly; SameSite=Strict; Secure in production; path `/api/research/status`; 24-hour maximum age.
- Delivery credential: opaque 256-bit value; only its digest is stored; purpose `status_recovery`; maximum lifetime 30 minutes; single-use; a new valid delivery revokes prior unused subject credentials.
- Session credential: fresh opaque 256-bit value; only a domain-separated digest is stored; purpose `status_recovery_session`; maximum lifetime 24 hours; exact-subject bound; explicitly revocable.
- Durable retry: the delivery credential is deterministically re-derived from the server secret and stable event idempotency key, so provider retry does not invalidate a link already accepted by the provider.

### Enumeration, rate limiting, and canonical delivery

- Reference and email are normalized and validated; the public response never exposes whether they matched.
- Durable rate limits: 5 requests per public client key per 10 minutes and 3 per normalized email per 10 minutes. Keys contain only stable hashes, not raw email/IP values.
- Successful match uses a five-minute idempotency bucket and event key `status-recovery:<sha256>`.
- Request event: `research.status_recovery.requested`; outbox template: `research.status_recovery.link`.
- Delivery re-reads the canonical email and subject binding. A stale or edited outbox recipient cannot redirect the credential.
- Link origin accepts only an HTTPS origin with no credentials, path, query, or fragment; invalid configuration falls back to `https://xeniostechnology.com`.

### Database authority

- Additive forced-RLS relations: `public.research_status_recovery_tokens` and `public.research_status_recovery_sessions`.
- No direct table privileges for `PUBLIC`, `anon`, `authenticated`, or `service_role`; no browser policies.
- Five bounded `SECURITY DEFINER` RPCs, owned by `postgres`, with `search_path = pg_catalog, public`: `research_status_recovery_match`, `research_status_recovery_prepare_delivery`, `research_status_recovery_exchange`, `research_status_recovery_status`, and `research_status_recovery_end`.
- `service_role` receives only exact-signature EXECUTE on those five RPCs. `PUBLIC`, `anon`, and `authenticated` receive no EXECUTE.
- Status output is restricted to public reference, plain-language state, what happened, next step, next-step owner, return/support routes, and bounded timeline facts. The cookie does not grant account, owner, raw-token, payment/document, Care/clinical, partner, admin, or commerce authority.

## 4. Recorded evidence

- Focused recovery: 5 files / 20 tests passed.
- Combined focused: 6 files / 61 tests passed.
- Nearby regressions: 6 files / 145 tests passed.
- Release controls/protection: 88 passed, 1 skipped.
- Full suite: 987 files passed, 6 skipped; 18,169 tests passed, 85 skipped; zero failed (`--testTimeout=60000`, 406.54 seconds).
- Typecheck and production build passed.
- Route uniqueness: 453 registrations / 444 call sites / zero duplicates.
- Migration DAG: 38 nodes passed.
- Release manifest exact 52-file parent-to-control diff passed.
- Generated site record: 235 routes / 15 capabilities passed.
- Disposable PostgreSQL 17: apply twice, structural/ACL/behavior verification, and independent-connection double-consume race passed (one success maximum).
- Local exact-build browser UAT passed neutral landing, immediate fragment removal, explicit exchange boundary, no-referrer behavior, closed-tab cookie contract in component tests, and safe invalid-link handling.

## 5. Exact local reproduction commands

Run from repository root on the frozen branch. These commands are local/read-only except for build/test artifacts and a disposable local PostgreSQL container; they do not contact managed staging or production.

```powershell
git fetch origin codex/xenios-p17-secure-status-recovery-20260927
git rev-parse fef7b313c23ac0e12046420041aa51a3a6e3c2d6^{commit}
git show -s --format=%T fef7b313c23ac0e12046420041aa51a3a6e3c2d6
git rev-parse 4ca346e0bae7252eab62b71e59310cf263211a68^{commit}
git rev-parse 9b77f1ce400074985da87daba48628d3ffa1f570^{commit}
git rev-parse 86350d7ec12dcd1f7cb4ee1fbad8f0682b664263^{commit}
git merge-base --is-ancestor fef7b313c23ac0e12046420041aa51a3a6e3c2d6 4ca346e0bae7252eab62b71e59310cf263211a68
git merge-base --is-ancestor 4ca346e0bae7252eab62b71e59310cf263211a68 9b77f1ce400074985da87daba48628d3ffa1f570
git merge-base --is-ancestor 9b77f1ce400074985da87daba48628d3ffa1f570 86350d7ec12dcd1f7cb4ee1fbad8f0682b664263
git diff --name-status fef7b313c23ac0e12046420041aa51a3a6e3c2d6 86350d7ec12dcd1f7cb4ee1fbad8f0682b664263
Get-FileHash -Algorithm SHA256 supabase/migrations/20260927203000_research_status_recovery.sql
Get-FileHash -Algorithm SHA256 supabase/candidates/20260927203000_research_status_recovery.sql
npx vitest run server/research/status-recovery/*.test.ts --reporter=dot
npx vitest run client/src/clarity/StatusPage.test.tsx client/src/clarity/pages.test.tsx server/research/frontdoor.test.ts server/static.test.ts --reporter=dot
npx vitest run server/core-site-protection.test.ts server/release-control-plane.test.ts --reporter=dot
npm run check
npm run build
npm test -- --reporter=dot --testTimeout=60000
npm run verify:route-uniqueness
npm run verify:migration-dag
npm run verify:release-manifest
npm run site:record:check
node scripts/agentic/xenios-os.mjs validate
git diff --check fef7b313c23ac0e12046420041aa51a3a6e3c2d6^ 86350d7ec12dcd1f7cb4ee1fbad8f0682b664263
```

For SQL reproduction, follow the checked-in disposable verifier rather than substituting a managed project:

```powershell
$repo = (Get-Location).Path
docker run --name xenios-p17-pg17 --detach --env POSTGRES_PASSWORD=xenios-local-only --publish 127.0.0.1:55439:5432 --mount "type=bind,source=$repo,target=/work,readonly" postgres:17-alpine
docker exec xenios-p17-pg17 psql -U postgres -v ON_ERROR_STOP=1 -f /work/supabase/verification/research-assisted-order-bridge-disposable-bootstrap.sql
docker exec xenios-p17-pg17 psql -U postgres -v ON_ERROR_STOP=1 -f /work/supabase/migrations/20260815150000_research_assisted_order_bridge.sql
docker exec xenios-p17-pg17 psql -U postgres -v ON_ERROR_STOP=1 -f /work/supabase/candidates/20260927203000_research_status_recovery.precheck.sql
docker exec xenios-p17-pg17 psql -U postgres -v ON_ERROR_STOP=1 -f /work/supabase/migrations/20260927203000_research_status_recovery.sql
docker exec xenios-p17-pg17 psql -U postgres -v ON_ERROR_STOP=1 -f /work/supabase/migrations/20260927203000_research_status_recovery.sql
docker exec xenios-p17-pg17 psql -U postgres -v ON_ERROR_STOP=1 -f /work/supabase/candidates/20260927203000_research_status_recovery.postcheck.sql
docker exec xenios-p17-pg17 psql -U postgres -v ON_ERROR_STOP=1 -f /work/supabase/verification/20260927_research_status_recovery_disposable.sql
```

Wait for PostgreSQL readiness after `docker run` before the first `psql` command. The bootstrap is disposable-only and must never be applied to a managed project. Do not adapt these commands to managed staging without the separate approval and identity gates in the staging plan.

## 6. Independent reviewer decision requested

Review the exact runtime tree and separately classified test/control/evidence successors. Confirm or reject:

1. neutral non-enumerating request behavior;
2. canonical-recipient and trusted-origin enforcement;
3. scanner/prefetch-safe fragment and explicit POST exchange;
4. single-use/revocation/expiry/concurrency semantics;
5. exact-subject safe status projection and authority isolation;
6. forced-RLS, ownership, search-path, relation ACL, and exact function EXECUTE contract;
7. absence of runtime drift after `fef7b313`.

The requested result is an independent source-review disposition only. It is not approval to apply SQL, deploy, send email, create managed fixtures, or mutate any environment.

## 7. Explicit evidence limitations

- External email delivery is unverified. No real provider delivery, mailbox receipt, link-scanner behavior, bounce, or retry was exercised.
- Managed non-production staging is unverified and was not run. No managed PostgreSQL version, Supabase migration history, PostgREST behavior, hosted runtime configuration, provider sandbox, or deployed browser environment has been observed for this candidate.
- SQL evidence comes from disposable local PostgreSQL 17, not Supabase-managed PostgreSQL. Managed extensions, platform roles, PostgREST schema cache, and provider-specific grants remain unqualified.
- Browser UAT used an exact local build. It does not prove behavior behind deployed proxies/CDNs, hosted cookie/TLS policy, managed database latency, or an external mail scanner.
- The component suite proves the intended closed-tab cookie contract; no deployed non-production closed-tab journey has run.
- `SITE_URL`, `RESEARCH_SESSION_SECRET`, durable rate-limit backing, outbox provider configuration, and managed role ownership were not inspected in a staging environment.
- The migration has not been applied anywhere by this lane. Rollback is a reviewed plan, not an executed managed rollback receipt.
- Production remained outside scope. No current production observation is asserted by this packet beyond the previously recorded release-control evidence.
- Passing local evidence does not authorize a managed apply, deploy, real email, real-customer fixture, or production action.
