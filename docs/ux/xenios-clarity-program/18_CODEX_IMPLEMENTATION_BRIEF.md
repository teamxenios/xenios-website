# 18 — Codex implementation brief (the contract for `CODEX_03`)

Supersedes `12_IMPLEMENTATION_PLAN.md` wherever they differ.

## 0. Start conditions — do not write runtime code until all five hold

| # | Condition | How to verify |
| --- | --- | --- |
| 1 | Samuel has answered `17_OWNER_DECISION_PACKET.md` (per item or "accept all RECOMMENDED DEFAULTS") and the answers are committed on the strategy branch | Answer fields filled, with initials and date |
| 2 | Codex's `RELEASE_DISPOSITION_ADDENDUM.md` (CODEX_00) confirms the implementation base | See §1 |
| 3 | Strategy content SHA is fixed | The strategy-branch commit that contains Samuel's answers; record it in the implementation report as "STRATEGY SHA" |
| 4 | Leases in §5 resolved | U-114 |
| 5 | Fresh worktree `codex/xenios-clarity-implementation-20260926` from the §1 base, registered and claimed via `node scripts/agentic/xenios-os.mjs` | `git worktree list`; `.xenios/sessions/…` |

Do not implement in the audit branch, the strategy branch, the checkout-security branch, or any branch that triggers production.

## 1. Base

- **Expected base:** `3298f279ad760a861e26e3e08514bb49694fae38`, tree `ac69ecf87e3c622738908bb4fa7a1779aad493fb` (frozen audit candidate).
- Evidence/handoff tip `bad1c4124ef3a199eec01802438073cdf73b2b83` is docs and records only; zero client/server/shared/supabase/config changes after `3298f279`, verified by this lane.
- If the CODEX_00 addendum names a different base, use that and diff the §4 files first.
- Application source at `3298f279` is byte-identical to `c4ea8a9`, the source this strategy analysed.

## 2. Mode is set by owner decision B-1

| B-1 answer | Mode | Scope |
| --- | --- | --- |
| APPROVED (amend the 2026-07-29 directive) | **Full mode** | Everything in §3 |
| DECLINED / DEFERRED | **Fallback mode** | Only the allowed-zone rows of §3 and `04_INFORMATION_ARCHITECTURE.md` §Fallback. Zero protected-path changes (U-113). |

**Full mode protected-change procedure:**
- Record B-1 approval in the protected-change review.
- Run the canonical protected-change review for every protected path touched. Note: the audit closeout hard-locks the complete normalized bytes of `Home.tsx`, `Navbar.tsx`, `AccountAccessChooser.tsx`, `Admin.tsx` and six contact seams (`server/routes.ts`, `server/services/contact-delivery.ts`, `server/services/email.ts`, `client/src/components/ContactForm.tsx`, `client/src/lib/content.ts`, `client/src/lib/waitlist-service.ts`) as reported seams — every one of them is a re-baseline item. `Admin.tsx` and the contact seams should not need to change at all.
- Re-baseline `CORE_SITE_PROTECTION_MANIFEST.json` through that review, not by hand-editing hashes.
- Update `protectedRoutes` to include the new routes.
- Independent second-agent approval (Claude, CLAUDE_04) is expected before release.

## 3. Page-by-page order

Each step lands as one or more coherent runtime commits with focused tests. Copy comes from `05_COPY_DECK.md`, specs from `PAGE_SPECIFICATIONS.md`, and CTAs from `07_CTA_MATRIX.csv` (the `gate` and `fallback_if_B1_declined` columns).

| Step | Work | Zone | Decisions it depends on |
| --- | --- | --- | --- |
| 1 | Brand module + legal-string fix ("Xenios Technologies, Inc.") | allowed (research/care); protected for coach footer | A-1 |
| 2 | Claim cleanup: remove or replace every DO NOT PUBLISH and unapproved claim (72 hours ×22, one business day ×8, state-licensed ×6, $30/month ×3, third-party testing ×1, Research Rep ×15). Email template text included. No state-machine changes. | allowed (`client/src/care`, `client/src/research`, `server/care`, `server/research`) | D-1, D-2 |
| 3 | Research-use disclosure on real research families (CUX-09) | allowed (`server/research/master-offerings/customer-projection.ts`, leased — see §5) | counsel wording (C-018) |
| 4 | Status label mapping (copy deck §13) on assisted-order status | allowed (leased path — see §5) | none |
| 5 | Unified Research+Care chrome and the password wall removed from public links (CUX-07) | allowed | none |
| 6 | Practice pages: `/practices` + 3 sub-pages (full) or `/research/practices/*` (fallback) | full: protected (`App.tsx`); fallback: allowed | E-1, E-2, F-1, G-1, H-1 (use DEFERRED text where unanswered) |
| 7 | Partners (closed state + interest inquiry; Apply only if opened), suppliers | same split | F-1 |
| 8 | Sign-in / activation / status / support / quality / FAQ / how-it-works pages | same split | none |
| 9 | Products index + product page template (reads storefront publication records; empty-state if none) | same split | C-1, C-2 |
| 10 | Home + shared header/footer + audience selector; coach home → `/workspace`; redirects | **full mode only** | A-1, B-1, B-2 |
| 11 | Careers "Apply" | **full mode only** (protected) | I-1 |
| 12 | Durable inquiries + founder lane (Phase 2) | allowed (`server/research/`, admin research lane) | Q-14 owner default = founder |

Stop after step 11 and report if step 12 needs a schema change (see §6).

## 4. File ownership map (at `3298f279`)

| Area | Files | Protected? | Owner during implementation |
| --- | --- | --- | --- |
| Coach/root chrome | `client/src/pages/Home.tsx`, `components/Navbar.tsx`, `components/Footer.tsx`, `components/TopRibbon.tsx`, `components/AccountAccessChooser.tsx`, `lib/nav.ts`, `App.tsx` | **Yes** | Codex, full mode only |
| Research shell | `client/src/research/layout.tsx`, `research/section.tsx`, `research/pages/Gateway.tsx`, `research/pages/PublicEditorialNav.tsx`, `research/pages/*` | No | Codex |
| Research B2B | `client/src/research/b2b/*` | No | Codex |
| Care public | `client/src/care/*` | No | **Leased** to `codex-ordering-readiness-20260923` — resolve first |
| Assisted order UI | `client/src/research/assisted-order/*` | No | **Leased** (same) |
| Early Access copy | `client/src/research/early-access/fulfillment-copy.ts`, `server/research/early-access/cart/customer-status.ts` | No | Not covered by any active lease glob (verified) — Codex |
| Catalog authority | `server/research/master-offerings/**`, `shared/research/master-offerings/**`, `server/research/catalog*/**` | No | **Leased** to `claude-fable-s7` (stale) |
| Assisted-order comms | `server/research/assisted-order/communications.ts` | No | **Leased** to `claude-fable-s3` (stale) |
| Org accounts | `server/research/account-identity/**`, `shared/research/account-identity.ts`, pack02 SQL | No | **Leased** to `codex-astra-a-pack02-20260909`; do not touch (explanation pages only) |
| Contact route | `server/routes.ts`, `server/services/contact-delivery.ts`, `server/services/email.ts` | **Yes** | Do not modify; new inquiry endpoint goes under `server/research/` |
| Care request server | `server/care/manual-access.ts` | No | Email text only |
| Admin guard | `server/routes.ts` `requireSupabaseAdmin` | **Yes** | Never modify |

## 5. Lease and conflict map (active leases at `bad1c41`)

| Session | Last heartbeat | Paths (abridged) | Status | Required action |
| --- | --- | --- | --- | --- |
| `claude-fable-s7` | 2026-08-21 | master-offerings, catalog, catalog-display, catalog-price-projection | stale (>1 month) | `xenios-os.mjs stale`, then a recorded takeover/release before step 3 |
| `claude-fable-s3` | 2026-08-21 | assisted-order communications | stale | same, before editing assisted-order email copy |
| `codex-astra-a-pack02-20260909` | 2026-09-09 | account-identity, pack02 SQL | stale | leave untouched; no implementation step edits these |
| `codex-ordering-readiness-20260923` | 2026-09-24 | payment options, assisted-order UI, member orders, **`client/src/care/**`** | work shipped in production `79414143`; lease stale | recorded release/takeover before steps 2, 4, 5 |

Resolve stale leases through the fleet tool with a recorded note. Never delete another session's records.

## 6. Data and schema assumptions

- **No migrations by default.** The whole clarity release (steps 1–11) needs no schema change.
- **Step 12 (durable inquiries), no-migration path:**
  - Reuse the existing `loi_submissions` store exactly as Care requests do: `insertLoi` / `updateLoiStatus` / `listLoi` in `server/supabase-store.ts`. Call them; do not edit them — the file is protected.
  - Tag each row with a classifier (pattern: `server/care/manual-access-classifier.ts`).
  - Derive the reference from the row id (pattern: `CARE-XXXXXXXX` → `INQ-XXXXXXXX`).
  - Default owner = founder; due dates are tracked in the command-center lane.
  - The courtesy email goes through the existing outbox or email path. No second email system.
- **STOP** and ask Samuel if owner or due-date fields require new columns. That is a migration needing its own approval.
- **Flags** stay exactly as in production: `commerceEnabled=false`, EA cart off, `RESEARCH_PUBLIC_STOREFRONT_ENABLED` off, Referral V1 off, affiliate program off, portal flags off. Enabling any of them is a separate production decision.

## 7. Tests required

- **Focused unit/component tests** for every step, plus:
  - controlled-vocabulary lint: retired labels absent on public routes;
  - claim lint: DO NOT PUBLISH strings absent;
  - card contract;
  - practice-page assertions: no ordering-for-clients; no rates; "Care services never earn commission";
  - partner closed state: no password wall;
  - sign-in/activation/status states;
  - accepted, rejected and uncertain outcomes for every form;
  - admin isolation;
  - commerce dark.
- **UAT matrix:** all rows of `11_UAT_MATRIX.csv` applicable to the mode, at 390/768/1440 plus real desktop zoom (U-G09).
- **Browser personas:** J-01…J-13 (`06_PERSONA_JOURNEYS.md`), minimum J-01, J-02, J-03, J-04 (Stephen), J-08, J-09, J-10, J-11 (full mode), J-12.
- **Gates:**
  - typecheck
  - exact production build
  - full suite
  - route uniqueness
  - protected-change gate (U-112 or U-113)
  - migration DAG, which must be unchanged unless step 12 has an approved migration
  - canonical site records
  - `git diff --check`

## 8. Release boundaries

- No deployment, production configuration, flag, credential, database, payment, customer, clinical or real-message action.
- Production GO is Samuel's exact-SHA decision after CLAUDE_04 review and CODEX fixes.
- The audit candidate `3298f279` may be deployed separately, per CODEX_00, before or independently of this redesign.
- Nothing from this branch merges into the audit branch.

## 9. Commit rules

- Runtime commits (`client/`, `server/`, `shared/`) are separate from test-only commits and from docs/handoff/records commits.
- The implementation report (`13_IMPLEMENTATION_REPORT.md`) lists RUNTIME SHA and tree separately from DOCS/HANDOFF TIP.
- Never describe a docs commit as the runtime candidate.

## 10. Exact stop conditions (stop, record, ask)

1. Any unanswered decision whose DEFERRED state is not defined in the packet.
2. B-1 not approved, yet a step needs a protected file.
3. A step needs a migration, a flag change, or a new server authority (auth, admin, clinical, payment, notification system).
4. Any claim that would need a status other than VERIFIED FOR PUBLIC USE or an approved packet wording.
5. A lease cannot be resolved through the fleet tool.
6. The base named by CODEX_00 differs from §1 and the §4 files changed.
7. Any test shows a regression in Care boundaries, owner isolation, admin guard or commerce-dark.
8. A practice or partner flow would need to show client identity, order contents or Care data.
