# Production Approval Packet (single approval, end of preparation)

Every reversible engineering, integration, testing, and preparation step is
complete. This packet lists ONLY the irreversible or credential-gated actions,
consolidated so Samuel approves once. Nothing here has been executed.

Approve as a whole, or line by line. Two tracks are separable: the member
platform can go live in its disabled-capability state independently of commerce,
which stays gated until real COAs and a payment provider arrive.

## Track A — deploy the member platform and base site (safe today)

1. **Merge** the exact READY release head (integration PR #34, head recorded in
   the handoff) to `main`, squash.
2. **Deploy** that exact SHA on Render. Confirm the deployed SHA matches.
3. **Apply Supabase migrations 10-19** (member platform), the exact ordered
   sequence in `FULL_PRODUCTION_MIGRATION_MANIFEST.md`. All idempotent, RLS-on,
   no policies. Paste into the Supabase SQL Editor after your review. The full
   pending set (9-26) is pre-concatenated, ready to paste, at
   `supabase/production/research-full-production.sql`; run
   `supabase/production/research-production-verification.sql` afterward (every
   check should return zero rows). The RLS posture (enabled + zero policies =
   service-role-only, correct) is explained in
   `supabase/production/research-production-rollback-notes.md`.
4. **Confirm** `RESEARCH_PUBLIC=false` and `RESEARCH_INDEXABLE=false` remain
   set. Do NOT enable commerce.
5. **Post-deploy smoke**: load `/research` (gateway renders, non-indexed),
   sign in a test member, confirm the member overview, assessment, and document
   center load, and confirm every external capability reports disabled.

Result: the private member platform is live with truthful disabled capabilities.
No member data is at risk; no commerce.

## Track B — enable a capability (each is its own gate, do when ready)

For each capability, the code, disabled state, test provider, adapter shell,
env validation, default-false flag, and activation steps are complete. Provide
the named variables only when you choose to activate; the request format is in
`PROVIDER_READINESS.md`. No secret is requested now, because for every one an
earlier node is still open.

| Capability | What is still needed before it can be enabled |
| --- | --- |
| Transactional email | verify xeniostechnology.com in Resend, set RESEND_API_KEY, DKIM/SPF |
| Membership billing | choose + approve payment processor, set Stripe vars, register webhook |
| Product commerce | ALL of: real COAs delivered + verified, production commerce repository layer wired, processor approved, per-SKU eligibility passes, flag on, SKU admin-released |
| Identity verification | choose provider, set IDENTITY_* vars, register webhook, counsel consent sign-off |
| Private media | set RESEARCH_MEDIA_BUCKET, enable flag |
| Telegram | create bot, set TELEGRAM_* vars, register webhook |
| Shipping / Mitch fulfillment | carrier account + Mitch feed, set vars |
| Affiliate payouts | choose payout provider, set PAYOUT_* vars |

## Track C — the one true external blocker for commerce

Commerce cannot be enabled for ANY SKU until the actual COA and quality
documents arrive through the secure channel and are matched. As of this
preparation, 0 of 65 referenced attachments are physically present, so 0 of 15
SKUs are purchase-eligible. This is a supplier-delivery blocker, not a code
blocker. When the files arrive, drop them into the
`XENIOS_SUPPLIER_SECURE_INTAKE/` subfolders and re-run the attachment
verification; eligibility recomputes per SKU with no code change.

The full 19-gate matrix for every SKU is machine-readable at
`docs/research-commerce/PER_SKU_GATE_REPORT.json`. Each SKU fails five gates
independently (coa, payment, agreements, feature_flag, admin_release), so no SKU
is blocked merely because another's documents are missing; each must clear its
own gates.

## Rollback

- Pre-merge: discard the draft branch. Nothing is deployed or run.
- Post-merge, pre-migration: revert the merge commit on `main`, redeploy the
  prior SHA on Render. No schema change has occurred.
- Post-migration: the migrations are additive and non-destructive; every new
  table is inert until its lane is flagged on, so a rollback of code leaves the
  unused tables safely in place. A schema rollback (dropping the new tables) is
  a separate manual decision, never routine.

## What NOT to do

- Do not enable product commerce or any commerce flag: 0/15 eligible, no COAs,
  no processor.
- Do not run migrations 20-26 (commerce) as part of Track A; they are only
  needed once commerce is being wired for real.
- Do not treat any referenced attachment as verified while its file is absent.
