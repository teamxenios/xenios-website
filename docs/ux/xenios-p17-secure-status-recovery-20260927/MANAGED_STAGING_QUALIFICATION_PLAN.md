# Xenios P-17 — managed non-production staging qualification plan

Prepared: 2026-09-28  
Candidate runtime: `fef7b313c23ac0e12046420041aa51a3a6e3c2d6`  
Runtime tree: `55bdc57d3992393f4b767cd7f9c6a00c53e25c60`  
Migration SHA-256: `98cce457db8d82c72a399223117dcf4d98488dc153f3d1883e65a07e95220292`  
Current status: plan only; managed staging not run

## 1. Authority and environment identity gate

This plan is deliberately non-executable until all fields below are completed from authenticated, current evidence and Samuel explicitly authorizes this exact candidate against that exact non-production environment.

| Required identity | Value before execution |
|---|---|
| Managed non-production provider | **UNASSIGNED — stop** |
| Project name | **UNASSIGNED — stop** |
| Project ref/ID | **UNASSIGNED — stop** |
| Region | **UNASSIGNED — stop** |
| Managed PostgreSQL version | **UNOBSERVED — stop** |
| Deployed application service/environment ID | **UNASSIGNED — stop** |
| Non-production public origin | **UNASSIGNED — stop** |
| Production project ref/ID | Obtain read-only from current release records; must differ from staging |
| Production application service ID/origin | Obtain read-only from current release records; must differ from staging |
| Named executor | **UNASSIGNED — stop** |
| Explicit authorization record | **ABSENT — stop** |

Positive distinction is mandatory: compare exact project ref, database host fingerprint, application service ID, origin, environment label, and credential audience. “Not production” by naming convention, branch, or operator memory is insufficient. Abort if any staging identifier equals, aliases, routes to, or cannot be distinguished from production.

Only synthetic `example.invalid` identities and captured/sink delivery are permitted. Never use a real customer, mailbox, order, payment, Care/clinical record, supplier, affiliate, or production credential.

## 2. Frozen inputs

Before contact with staging, create an evidence directory and record:

- exact branch and remote ref;
- runtime SHA/tree, test-only SHA, release-control SHA, and frozen docs/handoff tip;
- clean-worktree proof;
- migration and candidate-mirror SHA-256 plus byte equality;
- full commit/path classification from `CLAUDE_REVIEW_PACKET.md`;
- independent Claude review result and any findings disposition;
- named staging authorization and exact permitted effects.

Stop if the runtime tree differs, the migration checksum differs, the candidate mirror differs, the worktree is dirty outside evidence files, or review has an unresolved P0/P1 finding.

## 3. Read-only managed preflight

Capture without mutation:

1. authenticated project identity, database host, region, environment label, and organization/workspace;
2. positive comparison against current production identifiers;
3. managed PostgreSQL server version and relevant installed extensions;
4. migration history, including absence of version `20260927203000` and absence/presence of the two relations and five RPC signatures;
5. required predecessor objects: assisted-order requests/events, durable Research outbox authority, service role, `anon`, `authenticated`, and `postgres` owner capability;
6. current relation owners, RLS flags, policies, relation grants, function owners, function ACLs, `proconfig`, and function body hashes for any pre-existing same-name object;
7. current synthetic-fixture namespace availability and outbox baseline counts;
8. deployed application identity/config names without printing secret values: `RESEARCH_SESSION_SECRET`, `SITE_URL`, database URL audience, durable rate-limit backing, outbox sink/provider mode, and production-mode cookie behavior.

Abort on unknown project identity, production overlap, missing predecessor authority, object collision, migration-history conflict, missing captured-email sink, real delivery configuration, or inability to preserve rollback evidence.

## 4. Migration installation qualification

The only permitted SQL input is `supabase/migrations/20260927203000_research_status_recovery.sql` with the pinned SHA-256. Execute through the provider’s audited migration mechanism as the named staging executor.

Sequence:

1. Run the checked-in precheck and save raw output.
2. Capture a transactionally consistent before snapshot of migration history, objects, owners, ACLs, policies, function definitions/body hashes, and synthetic-domain row counts.
3. Apply the exact migration once and record provider receipt, executor, timestamps, transaction outcome, and installed migration version.
4. Apply the exact migration a second time to prove idempotent installation; record the second receipt and verify no duplicate objects/grants/history rows.
5. Run the checked-in postcheck and an independent catalog query.

Required postconditions:

- exactly two additive relations exist, owned by the expected privileged owner;
- both have RLS enabled and forced, with zero browser policies;
- `PUBLIC`, `anon`, `authenticated`, and `service_role` have zero direct relation privileges;
- exactly five expected overload signatures exist and no unexpected overload exists;
- all five are `SECURITY DEFINER`, owned by `postgres`, with `search_path = pg_catalog, public`;
- only `service_role` has exact-signature EXECUTE; `PUBLIC`, `anon`, and `authenticated` do not;
- function body hashes match the exact candidate;
- migration history contains exactly one canonical installed version/receipt;
- no unrelated schema/object/grant changes occurred.

PostgreSQL 17 `MAINTAIN` handling: query `information_schema.role_table_grants` and `aclexplode`/catalog ACLs explicitly. Treat any direct `MAINTAIN` grant to browser or service roles as failure. If the managed platform represents owner/inherited maintenance authority differently, document it separately; do not weaken or rewrite candidate ACLs merely to make a generic query pass.

## 5. Managed database and PostgREST behavior

Create only bounded synthetic fixtures under the approved namespace, with canonical emails ending in `@example.invalid`. Record fixture IDs in the evidence bundle; never reuse existing rows.

Verify through the same managed PostgREST/service-role boundary used by the application:

1. matching eligible reference/email returns one canonical subject;
2. wrong, unknown, malformed, case/whitespace variants, Care-style references, and cross-owner pairs reveal no subject;
3. preparation re-reads canonical recipient and rejects edited recipient/owner/subject bindings;
4. repeat preparation with the same idempotency key is stable;
5. replacement preparation revokes an older unused subject token;
6. malformed, wrong-purpose, expired, consumed, revoked, and wrong-owner token/session inputs refuse;
7. status returns only the safe exact-subject projection;
8. the status session cannot read account, other order, raw token, payment/document, Care/clinical, partner, admin, or commerce data;
9. explicit end revokes the session.

Run the double-consume test from two independent database/PostgREST connections synchronized to exchange the same token. Required result: one success maximum, one refusal, exactly one session row, and one consumed token. Any two-success result is an immediate stop and rollback trigger.

## 6. Synthetic outbox capture — no external email

Configure an approved captured-email sink before the application starts. The sink must have no route to public delivery and must retain envelope, headers, body, provider idempotency key, and attempt metadata as evidence.

Verify:

- every public request response is byte-for-byte neutral across eligible, ineligible, malformed, rate-limited, and induced outbox-failure cases;
- only an eligible canonical match creates `research.status_recovery.requested` / `research.status_recovery.link`;
- repeated requests within the five-minute bucket create one deterministic event;
- envelope recipient equals the canonical stored email even if the outbox recipient field is tampered before dispatch;
- the URL origin equals the positively verified non-production HTTPS origin;
- malicious `SITE_URL` variants containing HTTP, credentials, path, query, or fragment cannot enter the link;
- the credential appears only in the captured message fragment and transient client memory, never database rows, logs, request URLs, analytics, or evidence exports;
- provider retry preserves the same usable link and does not produce a second live token;
- no message leaves the sink.

Redact raw credentials from retained evidence. Store hashes and structural assertions only.

## 7. Deployed non-production browser qualification

Use the exact frozen runtime tree deployed to the positively identified non-production service, connected only to the qualified non-production database and captured-email sink.

Run desktop and 390 px mobile journeys:

1. Request with matching, wrong, unknown, malformed, case/whitespace, cross-owner, and Care-style data; compare status, body, headers, timing bounds, and absence/presence of captured events.
2. Open a captured fragment link as a normal navigation and as a simulated scanner/prefetch GET. Confirm initial GET does not exchange or consume.
3. Confirm the fragment is removed immediately from the visible URL/history and is absent from server/CDN/access logs, Referer headers, analytics, error telemetry, and subresource requests.
4. Choose `View status`; confirm one explicit POST exchange, the production cookie attributes, and the one safe status view.
5. Refresh, close the tab, reopen `/status`, and confirm the status-only cookie restores the same exact-subject projection without browser storage or fragment persistence.
6. End the session and confirm immediate denial and cookie clearing. Repeat after 30-minute token expiry and 24-hour session expiry using controlled staging time/fixtures where supported.
7. Attempt direct navigation/API access to another order and all excluded account/payment/document/Care/partner/admin/commerce surfaces with only the status cookie; all must fail closed.
8. Exercise back/forward, duplicate tabs, double-click exchange, provider retry link, expired link, replaced link, and already-consumed link.

Capture network HAR with secrets redacted, screenshots, cookie attributes, server/outbox correlation IDs, and database assertions. Never retain a raw recovery or session token.

## 8. Security abuse matrix

The staging evidence must explicitly cover:

- enumeration by response body/status/header/timing and rate-limit outcome;
- IP and email rate-limit isolation, deny-on-storage-failure behavior, and raw-key absence;
- origin/header injection and hostile `SITE_URL` configuration;
- scanner, unfurl, prefetch, HEAD/GET, and repeated document navigation;
- cross-owner reference/email mixing;
- token substitution, truncation, encoding, replay, concurrent exchange, replacement, expiry, and revocation;
- cookie fixation, wrong cookie name/path, non-status route leakage, and SameSite/Secure/HttpOnly enforcement;
- PostgREST direct table/RPC attempts as `anon` and `authenticated`;
- unexpected function overload invocation and search-path shadowing;
- log, trace, analytics, HAR, screenshot, database, and evidence-bundle token leakage.

Any disclosure, external delivery, two-success consume, cross-owner read, direct browser table access, unsafe overload, or raw-token persistence is a P0 stop.

## 9. Rollback and cleanup

Rollback requires its own explicit staging authorization. Use the checked-in rollback instructions against the recorded apply receipt; do not improvise a blanket reset.

Order:

1. stop the staging application/outbox worker to prevent new recovery actions;
2. retain redacted evidence and migration/app logs;
3. revoke/expire synthetic sessions and tokens;
4. remove only recorded synthetic fixture and captured-message rows;
5. drop the five exact RPC signatures, then the two additive recovery relations, only if rollback is authorized;
6. reconcile migration history using the provider’s supported mechanism;
7. run absence checks and prove assisted-order/outbox predecessor rows are unchanged;
8. restore the prior staging application SHA/config if a deployment was part of the authorized run;
9. confirm zero production contact and zero external delivery.

## 10. Evidence package and release stop conditions

Required output:

- signed identity/authorization record;
- exact SHA/tree/checksum inventory;
- read-only preflight and production-distinction proof;
- first and second apply receipts;
- pre/post catalog snapshots, ACL/RLS/owner/search-path/body-hash/overload evidence;
- managed PostgREST behavior and independent-connection race evidence;
- captured-email sink evidence with token redaction;
- deployed browser matrix, HAR/screenshots, cookie/header assertions, and leakage scan;
- synthetic fixture inventory and cleanup receipt;
- rollback rehearsal or explicit “not run” limitation;
- reviewer findings and final PASS/FAIL/BLOCKED disposition.

Stop without release recommendation if any required identity or authorization is missing; any checksum/tree differs; managed Postgres behavior differs from local evidence; apply-twice is not clean; privileges/ownership/search path/overloads differ; external delivery cannot be disabled; browser or race evidence is incomplete; cleanup cannot be proven; or any P0/P1 remains unresolved.

Passing this plan would qualify only the named non-production environment and exact candidate. It would not authorize production migration, deployment, real email, real-user smoke, commerce activation, or any other production mutation.

