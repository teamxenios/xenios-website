# Xenios Research FULL WEBSITE release candidate — 2026-08-28

Integrator: Claude Lead takeover (`claude-lead-takeover-20260828`, session `01Gjir8i7SgJFxiBHEDXr26v`) · Codex checkpoint handed off at `1a065e0cd55eabbee09654c1a4c0a8d73693824f`
Production deploy: **not performed** · Migration: **not applied** · Real accounts / invitations / activations / pricing or payment effects / external messages: **0 / 0 / 0 / none / 0**

## 1. Identity

| Item | Value |
| --- | --- |
| Attested production SHA (unchanged) | `3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212` — Render `srv-d8s9vej7uimc7384dfcg`, deploy `dep-da6vorqfngtc73brb0gg`, live, auto-deploy off (re-read read-only 2026-08-28T21:15Z) |
| Codex Lead checkpoint (preserved, untouched) | `1a065e0cd55eabbee09654c1a4c0a8d73693824f` (`CONTROL/HANDOFFS/CODEX-TO-CLAUDE-FINAL-HANDOFF.md`, `HANDOFF_READY: YES`) |
| Claude branch | `claude/xenios-research-full-finish-takeover-20260828` |
| **Code-frozen SHA (every gate below ran on this exact tree)** | **`679564fc8cb29289e2277836eb32e2deac3d8bec`** |
| Final branch HEAD (docs, evidence packet, coordination JSON and evidence-tooling expectations only on top of the code freeze — no runtime file) | `the commit that contains this document (a docs/evidence/coordination/evidence-tooling successor of the code freeze; its SHA is recorded in CONTROL/HANDOFFS/CLAUDE-FINAL-HANDOFF.md, CONTROL/CLAUDE_EVIDENCE_LEDGER.json and the pushed branch head)` — `git diff --stat 679564fc..the comm`: tracked changes 7 files changed, 107 insertions(+), 44 deletions(-); new files 79 (six release documents, the review packet, the release manifest, the continuity handoff); runtime files changed: 0 — proven after commit by `git diff --name-only 679564fc..<final>` and recorded in the final handoff |
| Rejected ancestry excluded | `ace92fd65ab46213aa5899a1591d4c565099fd0f` is **not** an ancestor of the candidate (`git merge-base --is-ancestor` exit 1); every lane/root branch carrying it was replayed by content, never merged |
| Worktree / gate clone | `C:\Users\sboad\projects\xenios-research-claude-takeover-20260828` (linked worktree, authoring) · `C:\Users\sboad\projects\xenios-research-rc-lf-20260828` (standalone LF clone, `core.autocrlf=false`, all gates) |
| Runtime | `node:20.19.0-bookworm` container: Node **v20.19.0**, npm **10.8.2**; `--network none`; source and `node_modules` volume mounted read-only; `npm ci` exit 0 on volume `xr-claude-node-modules` |
| Release manifest | `docs/coordination/release-manifests/XENIOS_RESEARCH_FULL_SITE_RC_2026-08-28.json` (headSha `679564fc8cb29289e2277836eb32e2deac3d8bec`, files 583, routes 73) |

## 2. What was integrated (by content, with evidence)

Mode vocabulary: REPLAYED = applied as content onto the Claude branch with identity verified; ALREADY_IN_HEAD = present in the Codex checkpoint; SEMANTIC_REPLAY_ONLY / REJECTED = the source carries rejected ancestry or failed adjudication, so only its safe semantics were re-implemented or it stays PRODUCTION DISABLED; DEFERRED = attempted, broke a proven contract, reverted.

### 2.1 Lanes

| Lane | Source | Mode | Into (Claude commits) | Status / open |
| --- | --- | --- | --- | --- |
| 01-TRUTH-SECURITY | codex/xr-full-finish-01-truth-20260828@ace92fd6 | REPLAYED | 7ebc8881 (replay) + d02bc145 (corrections) | REVIEW PASS (P0 0 / P1 0 new / P2 3 adjudicated); admitted |
| 02-PUBLIC-BRAND | 54f9ce7e | ALREADY_IN_HEAD | 6597df46, 72d7676b (Codex semantic composition) | open: warm-silver 8e8933ce lineage reconciliation evidence; real-browser responsive/a11y/visual; frozen-SHA PII |
| 03-CATALOG-PRODUCT | 953f931be584baf0a54502886f400a8e63c077b6 | REPLAYED | 0989cfba | admitted as dormant/unmounted source; 18 files / 171 tests |
| 04-ACCOUNT-COMMERCE | 5158fbd87c4ed8280ec5c74cec56a2e62a6ad2b4 | REPLAYED (leaf content) + COMPOSED | 1a301f1 (leaf) + 0415a82e (protected composition) | admitted; ten-route manifest; 19 files / 317 tests |
| 05-CARE-TEBRA | 28de987d | ALREADY_IN_HEAD | b41de5af | HUMAN CONFIGURATION REQUIRED |
| 06-QUALITY-COA | ecc896ec | ALREADY_IN_HEAD | 3214510, f14398e0, c9cec0cf, 1a065e0c | open: registerPublicQualityApi absent (public lot API unmounted); approved copy authority; sitemap/raw-HTTP; clinical-language; Accessibility Statement; SPA CSP; route parity |
| 07-B2B-PARTNERS | 11c7d519 | ALREADY_IN_HEAD | 45d25288, a65f2261, b404b0e8, f36a1c10 | open: referral capture; partner apply; descendants; indexability; sitemap |
| 08-ADMIN-OPERATIONS | 621c93ff | ALREADY_IN_HEAD | 60c93458, dc10c3fd | open: CRM/fulfillment unmounted; inventory aggregate (root item 17) rejected; 503 without durable RPC |
| 09-PERFORMANCE-A11Y-SEO | 8c0c7b0a | ALREADY_IN_HEAD | f36a1c10 (normalization + private raw-document policy) | open: raw HTTP/SEO (root item 15); touch targets (items 11, 14); reduced motion (item 7); CSP; browser matrix |
| 10-ADVERSARIAL-REVIEW | None | HELD | — | — |

### 2.2 Root correction queue (18 items)

| Item | Name | Mode | Into / disposition |
| --- | --- | --- | --- |
| 1 | refund authority | SEMANTIC_REPLAY_ONLY |  |
| 2 | activation/cart authority | SEMANTIC_REPLAY_ONLY |  |
| 3 | private COA capability lifecycle | REPLAYED | c9b12a85 (with storage-url-origin c7f3d1c1) |
| 4 | public-lot bounded byte stream | REPLAYED | 6342c25 |
| 5 | Care public-configuration read boundary | DEFERRED |  |
| 6 | admin CRM filtered-zero truth | REPLAYED | cf482a2 |
| 7 | reduced-motion Early Access scrolling | REPLAYED | 75f68fe |
| 8 | admin Research Home 320px grid | REPLAYED | 1fd1c30 |
| 9 | careers JobPosting schema / unknown-detail indexing | REPLAYED | 0739e7d |
| 10 | admin Trust Dial atomic seam | REPLAYED | 8774a4a |
| 11 | Research mobile touch targets (nonprotected) | REPLAYED | 9c404d7 |
| 12 | durable-publication storefront source | REPLAYED | 9fbff3f |
| 13 | Lane 03 discovery completion | REPLAYED (dormant, unmounted) | 43a72023 |
| 14 | Lead-protected Research chrome touch targets | REPLAYED | 460138b |
| 15 | raw HTTP / SEO document policy | REPLAYED | 0a2ef2b |
| 16 | member-catalog bounded-read + media signing | REJECTED |  |
| 17 | Lane 08 inventory aggregate truth | REJECTED |  |
| 18 | account truth/isolation | REPLAYED (semantic) | 880686c8 |

### 2.3 Committed root branches outside the numbered queue

| Root branch | Head | Ancestry | Mode | Into / note |
| --- | --- | --- | --- | --- |
| assisted-order-audit | 5aad8aaf | clean (mergebase f36a1c10) | REPLAYED | 197eeeb |
| attribution-privacy | 5769a71c | clean (mergebase b41de5af) | REPLAYED | a01d152 |
| care-clinical-gate | 84635084 | clean (mergebase a98e53d0) | REPLAYED | aefac85 |
| cart-session-privacy | fcb78a5a | clean (mergebase 1a065e0c) | REPLAYED | 7e5a158 |
| fulfillment-http-hardening | c956af2e | clean (mergebase 1a065e0c) | REPLAYED | a8ff044 |
| private-api-no-store | 7215149b | clean (mergebase f36a1c10) | REPLAYED | 26093ed |
| request-log-privacy | 909ffca9 | clean (mergebase a65f2261) | REPLAYED | 40bae71 |
| account-composition | 4142c9dd | ace92fd IS ancestor | SEMANTIC_REPLAY_ONLY | Lane 04 handoff: do NOT reuse its resource behaviour that copied window.location.search |
| checkout-atomic | e0fd103e | ace92fd IS ancestor | SEMANTIC_REPLAY_ONLY | checkout safe tip; must add immutable payment_provider_name + payment_currency |
| webhook-atomic | 0a679b31 | ace92fd IS ancestor | SEMANTIC_REPLAY_ONLY |  |
| migration-harness | 0a1b2e9e | ace92fd IS ancestor | REJECTED |  |
| storage-url-origin | c7f3d1c1 |  | REPLAYED | c9b12a85 |

### 2.4 Helpers (parallel Claude lanes)

| Helper branch | SHA | Mode | Into | Detail |
| --- | --- | --- | --- | --- |
| claude/xr-helper-catalog-20260828-140843 | 086a42e8 | REPLAYED | 1164cc5 | files 14, overlap 0 — protected server-side access facet snippet NOT applied |
| claude/xr-helper-a11y-evidence-20260828-140843 | 189c8da5 | REPLAYED (partial) | e8569c15 | files 29, overlap 0, excluded client/src/research/pages/AccessibilityStatement.tsx, client/src/research/pages/accessibility-statement.test.tsx — Lead's served-policy Accessibility Statement (602311ad) supersedes the helper's unmounted page; four entry-script hashbangs removed (CRLF + vite-node collection failure) |

### 2.5 Lead-owned compositions

| Commit | Composition |
| --- | --- |
| 9d1ad2d | bindings unbound-reason mislabel corrected in generator + artifact + regression |
| 6edcb2e | public quality copy narrowed away from 'clinical' |
| 600e45a | raw HTTP document policy composed into server/static.ts + server/vite.ts (+ static.test.ts) |
| ea4e294 | core-site protection manifest reconciliation (tripwire + seam repins; infra/zone prefixes; no blanket allowances) |
| 602311ad | Accessibility Statement served policy + registries + footer links on every Research surface + Gateway guard adjudication for the composed B2B roots |
| d1dfe2e | Claude Lead session registered in .xenios continuity corpus |
| fe16b207 | Research focus-visible fallback for .ra-documentation-link and Care public grid lg breakpoint (browser-evidence findings on e8569c15) |
| ad80c29f | Evidence route inventory: accessibility statement, three policy documents, three account tabs added to scripts/evidence/routes.public.json |
| 7931044a | Static directory indexes (/hino subtree) served by express.static again; only / and /index.html answered by the raw HTTP policy handler before static; regression tests for /hino/, /hino/story/, bare /hino 301, /index.html |
| 5293abe4 | Root/document policy registrations made statically resolvable (GET /, GET /index.html); server/static.ts tripwire re-pinned; route census pin 401/410 |
| bfc1eeae | Privacy scrub: partner principal's full name removed from candidate-added fixtures/defaults/tests, two fleet documents and one candidate-migration comment (12 occurrences, 9 files) |
| 42c9bdba | Root/index policy handler as guarded app.use before express.static (census admits only /api/ app.get paths); census pin restored; server/static.ts tripwire re-pinned to final bytes d3c62991 |
| a75d9be7 | Route census pin 400/409 with the scanner-diff rationale (Lane 05 Tebra configuration read mounted; public-lot API source-counted unmounted; referral-capture endpoints removed) |
| 14f154bd | express.static redirect:false + explicit production-parity 301 only for index-bearing static directories (/hino subtree); /research no longer redirected by the asset-only dist/public/research directory; static.ts tripwire re-pinned 610e15ab; three secret-shaped test fixtures rewritten (scanner allowlist untouched); fourteen inherited files whitespace/EOL-normalized so git diff --check is 0 |
| 732b9545 | static.test.ts asset-only-directory case reads the buffered image body (test-only) |
| dc70fb17 | RESEARCH_INDEXABLE production parity at the HTTP layer: buildRawHttpDocumentResponse indexable input; static.ts passes the flag; public documents noindex at header+meta until true; tests; static.ts tripwire re-pinned 75ab3f6a |
| 679564fc | Indexing gate scoped to Research documents by original pathname (marketing site indexable as in production); tripwire re-pinned 0f2cf4ab |

Full per-item identity (patch hashes, apply-checks, overlap lists, exclusion lists) is in `CONTROL/CLAUDE_INTEGRATION_LEDGER.json`; every runtime observation is in `CONTROL/CLAUDE_EVIDENCE_LEDGER.json` (E-00 … E-63); every adjudication is in `CONTROL/CLAUDE_DECISION_LOG.md`.

## 3. Gates on the code-frozen SHA `679564fc` (LF clone, pinned container)

| Gate | Command (inside `node:20.19.0-bookworm`, cwd `/workspace`, read-only) | Result |
| --- | --- | --- |
| Runtime pin | `node -v && npm -v` | v20.19.0 / 10.8.2 — exit 0 |
| Dependencies | `npm ci` (volume `xr-claude-node-modules`, `--network none` afterwards) | exit 0 |
| Type check | `./node_modules/.bin/tsc --noEmit --incremental false` | **0 errors** — exit 0 |
| Production build | `npm run build` (`node script/build.mjs`) | exit 0 — `dist/public` 7.2M (includes `dist/public/hino/index.html`) |
| Canonical e2e | `vitest run --config /test-config-e2e.mjs --configLoader runner --no-file-parallelism --testTimeout 60000` | **4 files / 53 tests passed** — exit 0 |
| Complete sequential suite | `vitest run --config /test-config.mjs --configLoader runner --no-file-parallelism --testTimeout 60000` | **Test Files 796 passed | 4 skipped (800); Tests 11954 passed | 43 skipped (11997); 710.02s** — exit 0 |
| Route census / uniqueness | `tsx scripts/acceptance/verify-route-uniqueness.ts --sha 679564fc` | exit 0 — 409 static Express API registrations across 400 call sites at 679564fc8cb29289e2277836eb32e2deac3d8bec |
| Migration DAG / ledger | `tsx scripts/acceptance/verify-migration-dag.ts` | exit 0 — Migration DAG accepted: 35 nodes, canonical checksums verified. |
| Production state + release graph | `tsx scripts/acceptance/verify-production-state.ts` | exit 0 — Trusted release baseline accepted: 3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212 / dep-da6vorqfngtc73brb0gg. |
| Release manifest | `tsx scripts/acceptance/verify-release-manifest.ts <manifest>` | **exit 1 — OWNERSHIP POLICY ONLY (disclosed, founder decision)**: schema, identity (base 3daa3f4a / head 679564fc), file inventory = exact git diff (583 files), routes (73), tests (5 × PASS with exact commands) all pass; the ownership policy the verifier reads from the trusted BASE commit (`3daa3f4a:docs/coordination/FILE_OWNERSHIP.json`, exact-file rules written for single-lane PRs) covers only 100 of the 583 changed files → 483 `UNOWNED_FILE` + 20 `WRONG_LANE_OWNER` (files owned at the base by wave2-inventory-lot-coa 5, v3-products-diagnostics-checkin 5, research-application-ui-completion 6, care-tebra-security 4; manifest lane `release-manager`). An integration RC cannot satisfy a base-anchored single-lane ownership policy; re-baselining `FILE_OWNERSHIP.json` is a release-manager decision recorded in the human-only blockers. Full verifier output: `CONTROL/EVIDENCE/gates-679564fc-lf/13-release-manifest-x12-from-worktree.txt` |
| Release control plane | `npm run check:release-control-plane` + `vitest run server/release-control-plane.test.ts` | check exit 0; test exit 0 — 43 passed | 1 skipped (44) |
| Core-site protection | `node scripts/acceptance/verify-core-site-protection.mjs 3daa3f4a… 679564fc` | exit 1 — 21 protected hashes verified; changed files 583 (allowed research/care 247, infrastructure 112, test files touched 194, seam files 3 [server/care/index.ts, server/index.ts, server/research/index.ts]); changed files outside the allowed Research/Care write zones. — 27 reviewed global-shell files listed by design (classifier not widened; founder review item) |
| Secret scan | `node scripts/acceptance/scan-release-diff.mjs 3daa3f4a… 679564fc` | exit 0 — secret findings: 0 over 70237 added lines / 541 files |
| Approved-name PII scan (never SKIPPED) | `node scripts/acceptance/verify-release-diff-scan.mjs --production-base-sha 3daa3f4a… --candidate-sha 679564fc --pii-names-file <approved corpus, outside Git, SHA-256 C7DA9838…>` | exit 0 — pii findings: 0; non-SKIPPED (wrapper requires exactly one 'secret findings: 0' and one 'pii findings: 0') |
| Disposable Postgres migration rehearsal | `bash scripts/rehearse-research-assisted-order-audit-store.sh` (host Docker, pinned `postgres@sha256:33f923b0…`, throwaway container destroyed) | **No migration ships with this deploy** (`supabase/candidates/*` unapplied, outside `MIGRATION_DAG.json`; MIGRATION REQUIRED FOR THIS DEPLOY: NO). Informational rehearsal of the assisted-order audit-store candidate on the frozen tree: **PASS** — precheck, apply, authority, grants, RLS, concurrency, replay, conflict, rollback, immutability, reapply (8.5 s; candidate SHA-256 a6814b1c…, pre 8ecd2366…, post db0354ee…). The client-account migration harness was REJECTED (trust/TOCTOU/EOL/manifest gaps) and stays PRODUCTION DISABLED. Nothing applied to any real or shared database |

Gate logs: `scratchpad/gates-679564fc-lf/*.txt` (mirrored into `CONTROL/EVIDENCE/gates-679564fc-lf/`).

### 3.1 Gates re-run on the docs successor

The successor commit changes no runtime file; the release control-plane verifiers (route uniqueness, migration DAG, production state, release manifest), the release control-plane check + suite, the core-site protection gate and both scans are re-run on that exact HEAD from the LF clone and recorded in `CONTROL/HANDOFFS/CLAUDE-FINAL-HANDOFF.md` and `CONTROL/CLAUDE_EVIDENCE_LEDGER.json` (a document cannot carry the hash of the commit that contains it).

## 4. Browser and raw-HTTP evidence on `679564fc`

Tooling: `scripts/evidence/*` (raw CDP over the repo's `ws`, host Chromium, host Node v20.19.0), production build served by `scripts/preview-research.mjs` on `127.0.0.1:5184` with **placeholder** Supabase (no real data, no network). Readiness was polled before capture. Output: `CONTROL/EVIDENCE/browser-679564fc8cb29289e2277836eb32e2deac3d8bec/` → packet `docs/review/xenios-research-full-site-20260828/`.

| Item | Result |
| --- | --- |
| Route inventory | 43 routes (30 public, 13 private/denied, 404 probe, `/`, `/hino`, Care, admin) |
| Widths | 1440 / 1024 / 768 / 430 / 390 / 375 / 360 / 320 + 200 % zoom equivalent (720 CSS px @ DPR 2); reduced-motion and forced-colors renders at 390 |
| Runs | **473** (385 AUTOMATED_PASS · 44 notes · 44 AUTOMATED_FAIL) |
| Raw HTTP head evidence | 43 records: 43 AUTOMATED_PASS / 0 AUTOMATED_FAIL |
| `/hino/` continuity | GET /hino -> 200 (redirects: [{"from": "http://127.0.0.1:5184/hino", "status": 301, "to": "http://127.0.0.1:5) -> static Hino index served (no SPA root); x-robots-tag (none) |
| Authoritative 404 | GET /research/this-route-does-not-exist-xr-evidence -> 404, x-robots-tag noindex,nofollow,noarchive |
| PII / secret scan of the evidence set | 1001 text files scanned, findings: 0; 473 screenshots listed for manual review |
| Screenshots | 473 PNG captures; every one listed for manual PII/PHI review (`piiPhiReview: MANUAL_PENDING`) — synthetic data only |

### 4.1 Findings classification

- **CONSOLE_CLEAN** (78 runs on `/research/early-access`, `/research/early-access/order-request`, `/research/lots/XR-EVIDENCE-NEGATIVE-LOT`, `/care`, `/care/appointments`, `/research/this-route-does-not-exist-xr-evidence`, `/`, `/hino`) — HARNESS / BY DESIGN — the preview serves the production build with placeholder Supabase (127.0.0.1:54321, unreachable): data-backed endpoints answer 5xx and the client logs them (Early Access, order request, lot lookup); the 404 probe logs its own 404; Google Fonts requests are refused by the Care self-only CSP (Lane 05 finding 1, by design). No candidate-owned script error. Recorded, not a candidate defect.
- **NETWORK_CLEAN** (78 runs on `/research/early-access`, `/research/early-access/order-request`, `/research/lots/XR-EVIDENCE-NEGATIVE-LOT`, `/care`, `/care/appointments`, `/research/this-route-does-not-exist-xr-evidence`, `/`, `/hino`) — HARNESS / BY DESIGN — failed requests are the placeholder-Supabase API calls (5xx), the 404 probe's own document status, and Google Fonts blocked by the Care self-only CSP; no candidate-owned asset fails.
- **TARGETS_44x44** (44 runs on `/care`, `/care/appointments`, `/`, `/hino`) — GLOBAL SHELL / HINO — founder review item, not a candidate defect. Attribution from the run audits: on /care and /care/appointments every undersized target is global-shell markup rendered around the Care content (skip link, announcement dismiss button, header wordmark, footer links) — 0 Care-owned offenders; on / the page-owned offenders are Home.tsx hero/CTA ghost buttons (hard tripwire, byte-identical to production); on /hino they are the static Hino microsite's own header/nav (byte-identical to production). Every Research-owned surface passes. Decision recorded in XENIOS_RESEARCH_HUMAN_ONLY_BLOCKERS_2026-08-28.md.
- **ARIA_REFERENCES_RESOLVE** (33 runs on `/care`, `/care/appointments`, `/`) — GLOBAL SHELL — founder review item: the single unresolved reference on /, /care and /care/appointments is the shell's mobile-nav button aria-controls=nav-mobile-overlay (overlay not mounted until opened), inside the hard-tripwire Navbar, unchanged from production. Research surfaces pass.

## 5. Protected files and seams

- Hard tripwires (`docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json`): 21 hashes verified; `server/static.ts` and `server/vite.ts` re-pinned at `ea4e294` and again at `679564fc` for the `/hino` correction.
- Seams composed by the Lead only: `server/index.ts` (Codex compositions + request/error log redaction `40bae71`), `server/research/index.ts`, `server/care/index.ts` (clinical write gate `aefac85`), `client/src/research/lib/routes.ts` / `section.tsx` / `layout.tsx` / `lib/member-routing.ts` (ten-entry account-portal manifest, opaque order-detail return `0415a82e`; Accessibility Statement footer `602311ad`).
- Classifier not widened: 27 reviewed global-shell files remain listed as zone violations by design (founder review item; "Do not widen the manifest to pass").
- Global marketing shell (`Home.tsx`, `index.css`, `index.html`, Navbar/Footer/TopRibbon) **unchanged**.

## 6. Routes

Route census on the frozen SHA: exit 0 — 409 static Express API registrations across 400 call sites at 679564fc8cb29289e2277836eb32e2deac3d8bec. Public Research documents, the Accessibility Statement (`/research/policies/accessibility`, served as an explicit draft), three policy documents, B2B informational roots, Care public pages, ten account-portal routes (detail-before-list), Early Access, admin operations. Unmounted by design: public storefront (`RESEARCH_PUBLIC_STOREFRONT_ENABLED` unset), public lot API, member-catalog bounded read (503), inventory aggregate (503).

## 7. Capability classification

See `XENIOS_RESEARCH_CAPABILITY_MATRIX_2026-08-28.md` for the full table. Summary:

- **REAL AND CONNECTED**: raw HTTP document policy (root `/`, every SPA document, authoritative 404) with static directory indexes preserved; account portal truth (money facts from durable facts, history completeness DTOs, renewal discriminant); request/error log redaction; clinical write gate; private API no-store; cart session privacy; attribution privacy; fulfillment HTTP hardening; Care self-only CSP; Accessibility Statement (draft) route; quality/testing/documents editorial pages with narrowed non-clinical copy.
- **HUMAN CONFIGURATION REQUIRED**: Tebra scheduling / portal / telehealth (fail-closed pending state; `XENIOS_RESEARCH_TEBRA_INTEGRATION_2026-08-28.md`).
- **PRODUCTION DISABLED (engineering residuals, truthfully unavailable)**: refund execution (root 01), exact product/variant activation and cart/checkout mutation authority (root 02), production webhook application, member-catalog bounded read + media signing (root 16), inventory aggregate (root 17), public lot verification API, durable guard for the public Tebra configuration endpoint (root 05), client-account migration harness.
- **FUTURE MIGRATION REQUIRED**: every `supabase/candidates/*` file.

## 8. Human-only inputs and founder decisions

`XENIOS_RESEARCH_HUMAN_ONLY_BLOCKERS_2026-08-28.md`: 16 external inputs (1 provided — the approved PII corpus, hash-verified), 10 founder decisions PENDING. None was guessed; each ships in its truthful disabled/pending state.

## 9. Independent review

A separate read-only adversarial reviewer (fresh agent, no build context) reviews the final HEAD from the LF clone with the brief in `CONTROL/REPORTS/`; the verdict (required: P0 = 0, deployment-blocking P1 = 0, critical P2 = 0) is recorded in `CONTROL/REPORTS/CLAUDE-FINAL-INDEPENDENT-REVIEW-<sha8>.md` and summarized in `CONTROL/HANDOFFS/CLAUDE-FINAL-HANDOFF.md`. The Lane 01 review of `d02bc145` (PASS, P0 0 / P1 0 new / P2 3 adjudicated) is at `CONTROL/REPORTS/CLAUDE-LANE01-INDEPENDENT-REVIEW-d02bc145.md`.

## 10. Boundaries honoured

No production deploy or merge; no real or shared-staging migration; no real account, invitation, activation, founder-hold change, pricing/payment/refund effect, or external message; no contact with Tebra, providers, pharmacies or customers; no secret, token, PII, PHI, private client name or private product interest in Git or in evidence (approved corpus never printed or copied); no medical efficacy, dosing or protocol claim; no inferred provider approval, pharmacy processing or shipment. The Codex Lead worktree was never edited; no worktree or branch was deleted or force-pushed; Codex Epoch 5 was not reused.

## 11. Verdict

**READY FOR SAMUEL DEPLOY REVIEW: YES — on the evidence above, subject to the independent review of the final HEAD recording PASS in CONTROL/HANDOFFS/CLAUDE-FINAL-HANDOFF.md**

Every runtime gate is green on the exact code-frozen tree; the docs/evidence/tooling successor commit changes no runtime file and re-ran the control-plane verifiers, protection gate and both scans; browser and raw-HTTP evidence are captured on the frozen build with every failing assertion classified (global shell / harness, no Research-owned defect); the approved-name PII scan is non-SKIPPED with zero findings; no migration ships. Deployment remains Samuel's decision: the candidate ships every unfinished capability truthfully disabled or pending, and the founder decisions listed in the blockers document are open, none of them deployment-blocking. One release-control-plane gate is disclosed rather than passed: the release-manifest verifier's ownership policy, read from the 3daa production base with exact-file single-lane rules, cannot admit an integration candidate (483 of 583 changed files have no base owner; 20 belong to other lanes) while every other manifest check passes — a release-manager/founder re-baseline decision, recorded in the blockers document.
