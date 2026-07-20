# File claims — one owner per file (Integration Coordinator)

Updated 2026-07-20 (post-PR-#25 merge, main @ 87150f4). Prevents two sessions
editing the same file. A session must check this before touching a path;
shared files require a handoff. Extends integration/route-ownership.md.

## Active post-merge lane claims (authoritative)

| Path glob | Owner branch / window | Notes |
|---|---|---|
| `client/src/research/**` presentation components, route shells, scoped styles, `*.test.tsx` UI tests | claude/research-access-ui-rebuild (Website) | UI takeover; do NOT touch server or shared contracts |
| `docs/research-legal/**`, `docs/research-operations/document-control/**` | claude/research-paperwork-factory-now (Website 2) | DRAFT legal docs + document-control SOPs |
| `content/research-products/**`, `content/research-guides/**`, `content/research-goals/**`, `docs/research-content/**` | claude/research-product-guide-content-now (Website 3) | product/Guide/goal content seeds |
| `server/research/**` member-platform backend NEW modules (application, agreements, profile, assessment, blueprint, plans, documents, tracker, questions, telegram, member-admin) | Website 2 backend | extends PR #25 modules additively; NO edits to recovery/auth/outbox internals |
| `server/research/**` commerce/distribution NEW modules (products, guides, inventory, commerce, fulfillment, referrals, affiliates, commissions) | Website 3 backend | products-data.ts owned here |
| `docs/agent-coordination/**`, `docs/agent-coordination/blitzscale/**`, integration + release-validation scripts, shared contract barrels (coordination only) | claude/integration-coordinator (PowerShell, this) | contracts frozen here; single temporary owner for shared route registration |

## Shared files (single temporary owner + explicit integration plan)

`server/index.ts`, `server/routes.ts`, `server/research/index.ts` route
registration, `shared/research/*` type barrels, `package.json` scripts,
`client/src/App.tsx`, `client/src/research/section.tsx`/`layout.tsx`/`core.tsx`.
Temporary owner: Integration Coordinator. A lane needing a change here posts a
handoff; the coordinator applies it or grants a scoped, time-boxed claim. Any
session editing outside its claim without approval is rejected at review.

## Legacy detail (pre-merge fleet mapping)

## Rules

- One owner per file. Edit only files your session owns or has a written
  handoff for (docs/agent-coordination/handoffs/).
- `docs/agent-coordination/status/CLAUDE_PRIMARY.md` and any `status/*` are
  append-your-own; every branch touches its own status file only.
- `shared/research/*` contract changes require a decision file or handoff.
- Backend must merge before the matching Codex UI session starts.

## Ownership

| Path / area | Owner session | Notes |
|---|---|---|
| server/research/members.ts, member-auth.ts, guards.ts, membership.ts, membership-emails.ts, outbox.ts, index.ts | ACCOUNT_EMAIL_SYSTEMS (PR #25) → then IDENTITY_SECURITY (04) by handoff | #25 owns until merged; identity/MFA extends via handoff |
| server/routes.ts requireSupabaseAdmin + admin dashboard | ACCOUNT_EMAIL_SYSTEMS (auth) / ADMIN_SUPPORT (16) for admin routes | split by function; coordinate on the shared file |
| shared/research/paths.ts, recovery.ts, membership-types.ts | ACCOUNT_EMAIL_SYSTEMS | contract; reuse, do not fork |
| server/research/ identity/session/MFA/cancellation (new files) | IDENTITY_SECURITY (04) | new modules, post-#25 |
| server/research/ application/approval/activation + Stripe (new) | APPLICATION_ACTIVATION (05) | activation extends membership.ts by handoff |
| server/research/ assessment, blueprint, xenios30/90 (new) | ASSESSMENT_BLUEPRINT (08) | new modules |
| server/research/ recommendation, supplements (new) | RECOMMENDATION_SUPPLEMENTS (09) | flag-gated |
| server/research/ catalog, cart, orders, subscriptions | COMMERCE_CATALOG (10) | products-data.ts owned here post-#25 |
| server/research/ shipping, lots, shelf-life (new) | SHIPPING_FULFILLMENT (11) | |
| server/research/ admin queue extensions, support, telegram, infinity | ADMIN_SUPPORT (16) | |
| server/research/ tracker (new) | HEALTH_TRACKER_BACKEND (17) | privacy-gated |
| server/research/ referrals.ts, fraud*.ts + affiliate portal (new) | AFFILIATE_PORTAL_BACKEND (21) | referrals already in main; extend |
| client/src/research/pages/** presentation, components.tsx | Codex UI sessions (06,14,15,18,22) | one Codex session per surface |
| client/src/research/section.tsx, layout.tsx, core.tsx | SHARED — handoff required | route/provider unions; ACCOUNT_EMAIL_SYSTEMS holds until #25 merges |
| docs/legal/**, docs/paperwork/** (new) | PAPERWORK_FACTORY (07) | DRAFT templates only |
| docs/finance/** (new) | FINANCE (25) | parameterized model |
| docs/guides/**, content (new) | GUIDE_FACTORY (12) | evidence-cited |
| supabase/*.sql | owning backend session drafts; NEVER run by an agent | Samuel runs; ledger in MIGRATIONS.md |
| docs/agent-coordination/integration/**, file-claims.md | INTEGRATION_COORDINATOR | this session |

## Currently claimed / in-flight (post-merge)

- PR #25 is MERGED (merge commit 87150f4); its account/recovery/auth/email/
  outbox/member-access code is now the shared foundation in main — extend it
  additively, do not rewrite it.
- `server/research/*` and `shared/research/*` are NO LONGER locked to a single
  branch: new modules are split by lane above. Contract-level edits to the
  shared type barrels go through the Integration Coordinator.
- Active lanes: research-access-ui-rebuild, research-paperwork-factory-now,
  research-product-guide-content-now, integration-coordinator.
