# Xenios Research — Release Board (Integration Coordinator)

Owner: CLAUDE_INTEGRATION_COORDINATOR. Updated: 2026-07-19.
Source of truth order: current repo + migrations > master-pack root docs >
V2/V3 session prompts > appendices. This board is how the parallel build
sessions coordinate; every session updates its own row after each PR.

## Phase 0 — CLEARED. PR #25 is MERGED.

- PR #25 `research: harden account, email, and active-member access lifecycle`
  **MERGED** into main. Merge commit **87150f488c68576c6fec5f49a4957f3d122eca01**.
- origin/main is now at `87150f4`, which also includes PR #26
  (supabase service-key boot diagnostic), PR #28 (approval-expiry sweep), and
  the recovery-session-isolation hardening. Base site + account/email/recovery
  foundation are live in main.
- The full runtime fleet is **UNLOCKED**. Sessions branch from the current
  post-#25 `origin/main` (87150f4).

Closed/superseded: PR #13 (`codex/research-ui-content`).

## Post-#25 base rule (now active)

Every lane: `git fetch origin` → branch from **origin/main @ 87150f4** → one
isolated worktree → target `main` directly → no stacked PRs → do not edit
another session's claimed files (see file-claims.md). Do NOT re-implement or
weaken PR #25's account, recovery, authorization, email, outbox, or
active-member work; extend it additively.

## Active lane branches (post-merge)

| Branch | Window / owner | Lane |
|---|---|---|
| claude/research-access-ui-rebuild | Website | Research presentation / access UI |
| claude/research-product-guide-content-now | Website 3 | products / Guides / commerce / distribution backend + content |
| claude/research-paperwork-factory-now | Website 2 (paperwork) | legal/paperwork + member-platform backend |
| claude/integration-coordinator | PowerShell (this) | coordination, contracts, integration, release |

## Release train (PR sequence per Integration Coordinator prompt)

| # | Session (owner) | Backend/UI | Depends on | Needs external credential? | Buildable now w/o keys? |
|---|---|---|---|---|---|
| 0 | Account/Email/Recovery (CLAUDE_ACCOUNT_EMAIL_SYSTEMS) | backend | — | Resend domain, Supabase Auth redirect, Render env | **MERGED (PR #25 @ 87150f4)** |
| 1 | Account/Identity/MFA/Security (04) | backend | #25 merged | Identity provider (Stripe Identity/Persona/…), MFA/passkey config | Partly — MFA/session/recovery-code logic yes; live identity provider no |
| 2 | Application/Approval/Activation backend (05) | backend | #25, Stripe | Stripe (activation $50 + $25/mo) | Partly — state machine + attestation yes; live billing no |
| 3 | Assessment/Blueprint/Xenios 30·90 (08/10-master) | backend | #25 | — | Yes |
| 4 | Recommendation engine + supplements (09) | backend | #25, source registry | — | Yes (flag-gated, synthetic) |
| 5 | Catalog/commerce/subscriptions/orders (10/11-master) | backend | #2, Stripe | Stripe, carrier accounts | Partly — catalog/cart/order model yes; live checkout/shipping no |
| 6 | Shipping/fulfillment/lots/shelf-life (11) | backend | #5 | Carrier accounts, temp-controlled SLAs | Partly — lot/shelf-life model yes; carrier rates no |
| 7 | Admin/support/Telegram/Infinity (16/14-master) | backend | #25 | Telegram bot token, Infinity link | Partly — admin+support yes; live Telegram no |
| 8 | Health tracker backend (17/13-master) | backend | #25 | — | Yes (synthetic, privacy-gated) |
| 9 | Peptide/blend Guide factory (12) | content | source registry | — | Yes (drafts, evidence-cited, no medical claims from memory) |
| 10 | Paperwork/legal/SOP factory (07) | docs | — | Counsel review | Yes (clearly-marked DRAFT templates only) |
| 11 | Finance/pricing/unit economics (25/20-master) | model/docs | supplements, shipping, affiliates | Final prices/margins (configurable) | Yes (parameterized model) |
| 12 | Affiliate/Research-Rep portal backend (21) | backend | #25 | Payout processor | Partly — program/ledger yes; payouts no |
| 13 | Access/application/activation UI (06/15-master, Codex) | UI | #2 backend | — | After its backend |
| 14 | Member dashboard/catalog/account UI (14/16-master, Codex) | UI | #3,#5 backends | — | After its backends |
| 15 | Guides library UI (15/17-master, Codex) | UI | #9 | — | After #9 |
| 16 | Health tracker UI (18, Codex) | UI | #8 | — | After #8 |
| 17 | Affiliate/Rep portal UI (22, Codex) | UI | #12 | — | After #12 |
| 18 | Security/privacy/compliance QA (26/19-master) | QA | all above | — | Continuous |
| 19 | Release coordinator (27/21-master) | release | all | all approvals | Final gate |

"Buildable now w/o keys" = the logic, schema, tests, and synthetic/flag-gated
paths can be built and merged with every production flag false; only the live
external integration is deferred until Samuel provides the credential.

## Release gates (every PR, before merge)

tests · typecheck · build · migration review (drafted, not run) · security ·
accessibility · legal status · processor · identity · supplier · carrier ·
support readiness. Feature flags stay false through code merge.

## External-dependency shopping list (Samuel provides; code proceeds without)

These are the ONLY blockers to going live per lane; all code is built with the
integration behind a default-false flag or a synthetic/attestation path until
the credential exists.

- Resend: verify `xeniostechnology.com` (SPF/DKIM/DMARC); set
  `RESEARCH_EMAIL_FROM` + `RESEARCH_EMAIL_REPLY_TO` on Render. (PR #25)
- Supabase Auth: allowlist `https://xeniostechnology.com/research/reset-password`;
  confirm `SITE_URL`; review recovery-email template. (PR #25)
- Supabase SQL: run `supabase/research-member-billing.sql` before any billing
  enablement (drafted, PENDING). (PR #25)
- Stripe: activation ($50 one-time) + subscription ($25/mo) keys +
  webhook secret + price IDs. (lanes #2, #5)
- Identity provider (age 21+/identity verification): account + webhook secret.
  (lane #1)
- MFA/passkeys: Supabase MFA config (no external key, needs project settings).
  (lane #1)
- Telegram: bot token + per-chat mapping. (lane #7)
- Carrier accounts + temperature-controlled SLAs + per-state availability.
  (lanes #5, #6)
- Affiliate payout processor. (lane #12)
- Quantum commerce lane: not activated until its operating lane is approved.

## What PR #25 already provides (do NOT rebuild in later lanes)

- Fresh-browser password recovery (gate-free `/research/reset-password` +
  `forgot-password` wall allowlist), provider-level recovery capture.
- Recovery-purpose server authorization (`denyRecoveryPurposeSession`, amr
  claim) in `requireMember` + `requireSupabaseAdmin`.
- `requireActiveMember` (status matrix + billing_state) on catalog/orders +
  `/api/research/member/catalog`; `requireMember` resolves by `auth_user_id`.
- Purpose-scoped account-claim tokens; claim orphan cleanup + stranded heal +
  concurrency; approval-expiry enforcement; claim-success email.
- Durable outbox: explicit-success sends, crash-ladder to failed_permanent,
  per-recipient admin alerts, admin list/requeue/test-email endpoints.
- Member status + billing-state model (`shared/research/membership-types.ts`);
  canonical sender identity.
- Shared path/recovery helpers (`shared/research/paths.ts`, `recovery.ts`) —
  reuse these for any new Research surface, do not reimplement route matching.

## This coordinator's constraints honored

No production flags changed · no SQL run · no secrets touched · no own-PR
merge · targets main directly · docs-only (no code) · does not edit any
session's claimed files.
