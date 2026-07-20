# File claims — one owner per file (Integration Coordinator)

Updated 2026-07-19. Prevents two sessions editing the same file. A session
must check this before touching a path; shared files require a handoff. This
extends integration/route-ownership.md with the full post-#25 fleet.

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

## Currently claimed / in-flight

- PR #25 (ACCOUNT_EMAIL_SYSTEMS): all server/research/* + shared/research/* +
  the client research recovery surface. Locked until merged.
- No other session may edit server/research/* or shared/research/* until #25
  merges (would conflict). They may PREPARE new-module designs.
