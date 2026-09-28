# Claude independent review — P-17 secure status recovery + clarity candidate

Reviewer: Claude Code (`claude/xenios-p17-clarity-review-20260927`), 2026-09-28. First-pass review: no runtime source was edited, nothing was deployed, no migration touched staging or production, and no real email was sent.

## Identity and commit classification (verified from Git)

| Role | SHA | Tree | Verified |
| --- | --- | --- | --- |
| Parent clarity runtime | `5dcbc45f49a753bb857b8f6f035e83d212bd9648` | `4bd01064…` | ancestor of candidate |
| **Runtime candidate** | `fef7b313c23ac0e12046420041aa51a3a6e3c2d6` | `55bdc57d3992393f4b767cd7f9c6a00c53e25c60` | tree matches; descends from `3298f279` |
| Test-only | `4ca346e0bae7252eab62b71e59310cf263211a68` | — | tests, SQL pre/postcheck, rollback note, disposable verifier only |
| Release control | `9b77f1ce400074985da87daba48628d3ffa1f570` | — | `a683c60` (manifest, DAG, MIGRATIONS.md, release test, fleet records) + `9b77f1c` (release test) |
| Docs/handoff tip | `86350d7ec12dcd1f7cb4ee1fbad8f0682b664263` | — | docs, site records, `.xenios` only |
| Production (per packet) | `79414143d4355d5d3d14cd5fe6e5a536dc68d99d` | — | not re-observed by this review |

No `client/`, `server/` or `shared/` file changes after `fef7b313` (verified by `git diff fef7b313 86350d7`). Paths after the candidate: tests, `supabase/candidates/*.{pre,post}check.sql`, `rollback.md`, `supabase/verification/*`, `supabase/MIGRATIONS.md`, `docs/**`, `.xenios/**`, release-control files. The migration exists as two byte-identical copies (`supabase/migrations/` and `supabase/candidates/`).

## Evidence levels used (kept separate)

| Level | What this review actually did |
| --- | --- |
| Source inspection | Whole migration line by line; all `server/research/status-recovery/*`, contract, outbox dispatch, `server/index.ts` wiring, `static.ts`, client `StatusPage`, inquiry persistence |
| Unit/focused tests | Candidate runtime + Codex test files: 13 files / 110 tests PASS (Node 24.14.1 — **not** the pinned 20.19.0) |
| Typecheck / build | `tsc` PASS; `npm run build` PASS on the exact candidate tree (Node 24.14.1) |
| Full suite | See §Full suite |
| SQL / local rehearsal | Disposable **Supabase Postgres 17.6.1.171** container (real `anon`/`authenticated`/`service_role`/non-superuser `postgres` roles): bridge migration → P-17 applied **twice** → Codex verifier `PASS_STATUS_RECOVERY_DISPOSABLE_BEHAVIOUR` reproduced → **80/80** additional Claude adversarial checks PASS → independent-connection double-consume race PASS. Container is local and disposable; this is not managed-parity evidence |
| Exact-build browser | Candidate `dist/public` served by the candidate's own `serveStatic`, with the candidate's real status-recovery HTTP/service/notification/crypto code over its shipped in-memory store and a local outbox capture (review harness). Built-in browser at 375/768/1440 and 320/640 CSS-width reflow |
| Managed staging / production / external delivery | **Not performed** (UNVERIFIED) |

## Security review results

### Migration and database authority — PASS
- Additive only: two new tables, two indexes, five functions; no change to existing objects; preflight requires the assisted-order bridge.
- Both tables `ENABLE` + `FORCE` RLS; `REVOKE ALL` from `public, anon, authenticated, service_role`. Verified per role incl. PG17 `MAINTAIN`: 48/48 privilege checks absent; `service_role` read attempt → `insufficient_privilege` despite BYPASSRLS.
- Five `SECURITY DEFINER` functions owned by `postgres`, `search_path = pg_catalog, public`, exactly one overload each, `EXECUTE` for `service_role` only, no PUBLIC grant; `anon`/`authenticated` execute attempts → `insufficient_privilege`.
- No dynamic SQL; every relation reference schema-qualified. `pg_temp` shadowing attempt (service_role temp table named `research_assisted_order_requests` with a fake row) had no effect.
- Check constraints bound token lifetime ≤ 30 min, session ≤ 24 h, digest/idempotency formats, purpose, source, owner-binding format.
- Apply-twice PASS; postcondition DO-block enforces forced RLS, zero direct role grants and single overloads.

### Neutral response — PASS
Valid+correct email, valid+wrong email, unknown reference and Care-style reference each returned **202**, identical 138-byte body, identical `Cache-Control: no-store` / `Referrer-Policy: no-referrer` headers. Only the eligible pair produced an outbox job. Service catches every internal outcome (rate limit, store, outbox) into the same response. Timing: see R-04 (P3).

### Canonical recipient — PASS
Outbox recipient is re-read from the order row inside `prepare_delivery`; a stale/edited outbox `recipient` cannot redirect the credential (verified in source; SQL T4/T6 and Codex verifier). Match normalises only `btrim`+case; a full-width confusable reference did not match (T4b).

### Token lifecycle — PASS
- Emailed credential = HMAC-SHA-256(sha256(`RESEARCH_SESSION_SECRET`), label ‖ idempotency key) → 43-char base64url, 256-bit output, deterministic per outbox event so retries reuse one link; only its SHA-256 digest is stored (T14). Session credential = 32 random bytes. The design's entropy is the server secret's, not per-token randomness — acceptable and documented; see R-09 for the non-production fallback key.
- Single use: consumed token cannot mint a second session (T9b), outbox retry after consumption does not re-issue (T9c), exact expiry boundary refused (T7a), replaced token revoked (Codex verifier), wrong-owner / changed-owner refused (T4c–e, T8, T10).
- Concurrency: two independent connections exchanging the same digest → one `true`, one `false` after lock wait; one session row; token consumed once.
- No raw token in DB (T14). Captured link used only a synthetic local fixture token.

### Scanner-safe exchange — PASS (with R-03)
Fresh document load of `/status#recovery=…`: fragment removed by `replaceState` (URL became `/status`), `meta referrer=no-referrer`, server `Cache-Control: no-store` + `Referrer-Policy: no-referrer`, page shows "Secure status link ready" and **did not consume**; explicit **View status** POST exchanged (204) and status loaded. A plain GET (scanner/prefetch) never reaches the exchange endpoint. Replay of the consumed link → 401 and safe copy. Exception: same-document navigation (R-03).

### Status-only session — PASS
Cookie `xr_status_recovery`: HttpOnly (not visible to `document.cookie`), `SameSite=Strict`, `Path=/api/research/status` (does not path-match `/api/research/status-recovery/*`), 24 h max-age, `Secure` only when `NODE_ENV=production` (R-09). Projection is exactly `publicReference, status, timeline, updatedAt` (T9e) for the one bound order (T9d). Closed-tab return in a fresh tab restored status from the cookie; **End secure status access** revoked it and the next load showed the request form. Exchange requires `application/json`, so a cross-site form cannot drive it.

### Owner isolation — PASS
Session bound to subject + owner binding; status becomes null if the order's member or Early-Access binding changes (T10); member orders refuse null/other owners (T4c/d). No account, other-order, document, payment-destination, Care, partner or admin data is reachable through the session.

### Notification/origin security — PASS (with R-05, R-06, R-09)
Reuses the existing outbox; `eventKey = status-recovery:<idempotencyKey>` dedupes on the outbox's unique `event_key` (23505 treated as success). Link origin comes from `SITE_URL` validated to https/no-credentials/no-path/no-query, else the production origin; **no Host-header input**. Binding failure at send → non-retryable failure (no dead link sent). No external delivery claimed.

### Existing-authority regression — PASS at source/test level; one UX regression (R-02)
Status-recovery routes register before the legacy `/api/research` wall; no change to admin guard, account claim, password recovery, Early-Access or assisted-order status authorities, manual payment or outbox semantics; Express 5 forwards async errors (no crash path). `commerceEnabled` untouched. The candidate **removed the `/status` page's entry points** to existing authorities (see R-02) without removing the authorities.

## Full clarity UX (exact-build browser, harness APIs where noted)

Owner decisions verified on the rendered site: public brand **Xenios**; footer `© 2026 Xenios Technologies, Inc.`; neutral hero verbatim; six-tile selector; **pathway tiles only** (0 product cards, 0 prices, 0 counts; `/products` empty-state as approved); Care copy verbatim; research-use note; practices: conservative G-1 wording, "doesn't place orders for clients", structural commission text incl. "Care services never earn commission", H-1 inventory line, INQ-reference next steps with no response-time promise; partners: inquiry vs application vs activation vs sign-in separated, `/partners/apply` → honest closed state (no password wall); suppliers: invitation after review; careers: **general interest only**, legacy role URLs redirect; sign-in: Activate Account + Care-patient note, dead "application information" link removed; quality: explicit "no unverified testing claims"; `/workspace` uses Join Waitlist; `/health` → `/`, `/research/organizations` → `/practices`.

Forbidden-string sweep (72 hours, one business day, state-licensed, $30/month, third-party testing, Research Rep, Early Access, passwordless, Catalogue, Eon, Infinity, clinician-guided, "your client stays your client", named roles, product counts, premium, 20%/7.5%, 21-day, every other Friday, Get access, Prepare an inquiry, Member sign in, Xenios Technology, licensed pharmacy, certificate of analysis) across swept routes: **0 hits** (the only /quality match is its own disclaimer).

Responsive: no horizontal overflow on 19 public routes at **320, 390 and 640 CSS px**, or at 768/1440 on inspected routes. Keyboard: first Tab = Skip to content; mobile menu is a dialog that takes focus and closes on Escape returning focus to the trigger.

**Real browser zoom (200%/400%) was not available to this reviewer's tooling**; 640 px and 320 px CSS-width reflow were used as proxies and are reported as such.

### Comprehension answers (from the UI alone)
What is Xenios — Care and research products, clearly separated. What can I do — Start Care, explore research products, practices/partners/suppliers/careers paths. Care cost — "Submitting a Care request is free." How to order — request → quote/payment details → verified by a person → tracking. Status — Check Status (`/status`) / Sign In. Practice — For Practices; cannot order for clients; sees counts, credited orders, commission; commission structural only, never on Care. Supplier — Suppliers (invitation after review). Work — Careers (general interest). Sign in — header Sign In at every width. **Care status** — not answerable from `/status` (R-01).

## Findings

Severity: P0 unsafe/false/data exposure · P1 core job blocked or unverified regulated claim · P2 real confusion/regression with workaround · P3 polish/hardening.

| ID | Sev | Persona | Route | Viewport | Expected | Actual | Reproduction | Evidence | Authority impact | Recommended correction | Independently reproduced |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R-01 | P2 | Care prospect | `/status` | 768 | Approved spec (copy deck §11, UAT U-093): a CARE reference is told the Care team updates them directly; link to Care support | CARE-/INQ-style reference submits to recovery and shows "Check your email"; no email will ever come; only generic Contact Support. Parent `5dcbc45` had format-based Care/INQ guidance; `fef7b31` removed it | Enter `CARE-ABCD1234` + any email → Send secure status link | Browser (harness); `git diff 5dcbc45 fef7b31 -- client/src/clarity/pages.tsx` | None (format-based guidance reveals nothing about existence) | Restore format-only branches before submit: CARE- → Care-team message + `/care/support`; INQ- → "no public status; we'll contact you"; keep neutral recovery for XRR- | YES |
| R-02 | P2 | Returning customer | `/status` | all | U-092: signed-in shortcut to account orders; existing same-browser status path reachable | "Signed in? … View Account Orders" and same-browser `readAssistedOrderToken` route removed; page offers only Sign In / Contact Support | Load `/status` without cookie | Source diff; browser | Existing authorities intact but no longer reachable from `/status` | Re-add "Signed in? View account orders" link and same-browser credential shortcut ahead of the email-recovery form | YES |
| R-03 | P2 | Returning customer | `/status` | 375 | Link always scrubbed from URL/history and offers View status | If `/status` is already open in the tab, following/pasting the link is a same-document hash change: fragment (raw token) stays in address bar and history; page shows the request form (dead end) until manual reload | Open `/status`, then navigate same tab to `/status#recovery=<token>` | Browser: `location.hash.length=53`, form shown, no View status | Raw single-use token lingers in local history ≤30 min | Handle `hashchange` (and popstate) with the same scrub-and-hold logic as mount | YES |
| R-04 | P3 | Attacker w/ known reference | `/api/research/status-recovery/request` | — | Response time independent of match | 75 ms floor; match path adds one outbox insert vs mismatch — floor likely below both paths on managed latency | Code path comparison | Source (`service.ts` minimumResponseMs=75) | Could confirm a guessed email for a known reference; bounded by 3/email and 5/IP per 10 min and 40-bit reference randomness | Respond 202 first and run match/enqueue asynchronously, or raise floor above p99 of the match path | NO (not measurable meaningfully off managed infra) |
| R-05 | P3 | Customer | email | — | Email states true remaining lifetime | Outbox retries within 30 min resend the same token whose expiry is fixed at first send while copy says "expires in 30 minutes" | Source (`notification.ts`, SQL idempotent branch) | Source + SQL | None | Say "expires 30 minutes after it was first sent" or render the absolute time | NO (source) |
| R-06 | P3 | Customer | `/status` | — | A second request can recover a lost/used link | Same 5-minute bucket → same idempotency key: outbox dedupes the job; if the first link was consumed, prepare returns null (non-retryable). User sees "Check your email" with nothing coming | SQL T9c; source | SQL + source | None | Add copy: "If you don't receive it within a few minutes, try again later or Contact Support"; optionally include consumed-state in bucket key | Partially (SQL) |
| R-07 | P3 | Customer | `/status` | 375 | Status vocabulary per copy deck §13 | Timeline renders raw codes ("payment pending"); labels differ from §13 (e.g. "Payment pending" vs "Awaiting payment") | Status view in browser | Browser | None | Map timeline codes through the same label table; align labels to §13 | YES |
| R-08 | P3 | Keyboard/SR user | `/status` | 375 | Focus moves to the error | After failed exchange focus falls to `<body>` (alert still announced) | Replay consumed link → View status | Browser | None | Focus the alert or the reference field on error | YES |
| R-09 | P3 | Operator | staging config | — | Staging behaves like production | `SITE_URL` unset → links point to production origin (observed); `RESEARCH_SESSION_SECRET` unset with `NODE_ENV≠production` → fixed dev HMAC key; cookie `Secure` only when `NODE_ENV=production` | Harness capture; source | Harness + source | Staging-only | Staging plan must assert `NODE_ENV=production`, staging `SITE_URL`, and a unique secret before any run | YES (origin) |
| R-10 | P3 | Operator | DB | — | Order lifecycle unaffected | `on delete restrict` FKs from tokens/sessions block deleting an assisted order that ever had recovery (erasure/retention path) | SQL T15 | SQL | Data-retention procedure | Document; or cascade/cleanup job for expired rows | YES |
| R-11 | P3 | Operator | inquiries | — | Bounded lookup | On insert error, `persistInquiryWithLoiStore` loads the entire `loi_submissions` table (`listLoi`) to find one id | Source | Source | Performance/PII in memory | Fetch by id | NO (source) |
| R-12 | P3 | Visitor | `/sign-in` | 1440 | Bounded retry when config unavailable | ~20 `/api/config` requests in ~2 s while config returns 503 | Harness (config 503) | Browser | Load on outage | Exponential backoff | YES (harness condition) |
| R-13 | P3 | Partner | `/partners` | 1440 | F-1 wording "eligible research-product orders" | Lead says "earn commission on eligible orders" | View page | Browser | Minor claim precision | Use approved phrase | YES |
| R-14 | P3 | Reviewer | SQL qualification | — | Reproducible from repo | Disposable bootstrap (roles, M71 authority) not checked in | Repo search | Source | Evidence reproducibility | Check in the bootstrap script | YES |
| R-15 | P3 | — | migration | — | Defense in depth | `search_path` omits explicit trailing `pg_temp`; not exploitable here (T3) | SQL T3 | SQL | None today | `set search_path = pg_catalog, public, pg_temp` | YES (non-exploitable) |

**Totals: P0 0 · P1 0 · P2 3 · P3 12.**

## Full suite
See the result line appended at the end of this document (run at `9b77f1c`, application source identical to `fef7b313`, Node 24.14.1).

## Readiness

- **READY FOR CODEX FIX: YES** — no P0/P1; CODEX_11 rules mean no runtime change is required for staging. R-01–R-03 are recommended source fixes before any production GO (they are approved-spec deviations and a token-in-history edge case), and can be fixed in the same narrow slice without touching the credential design.
- **READY FOR MANAGED STAGING QUALIFICATION: YES**, conditional on the staging environment asserting R-09 (`NODE_ENV=production`, staging `SITE_URL`, unique `RESEARCH_SESSION_SECRET`), synthetic outbox capture only, and an explicit authorization naming the candidate and staging project.
- External delivery: UNVERIFIED. Managed staging parity: UNVERIFIED. Production mutated: NO.

## Full suite result (appended)

Run at `9b77f1ce400074985da87daba48628d3ffa1f570` (application source identical to `fef7b313`), Node 24.14.1, `--testTimeout=60000`: **987 files passed, 6 skipped; 18,169 tests passed, 85 skipped; 0 failed** (404 s). Matches the Codex-reported totals. Evidence: `claude-review-evidence/` (adversarial SQL, SQL run output, review harness, suite summary). The synthetic token in the SQL/harness evidence is a local fixture value, not a production credential.
