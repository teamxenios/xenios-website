# [XENIOS BLITZ HANDOFF] Client accounts backend lane — 2026-08-26

SESSION: claude-fable-client-accounts-20260826
TASK: Website super-blitz, Claude lane (lead integrator, backend, accounts, catalog data, import)
BRANCH: claude/xenios-client-accounts-backend-20260826
BASE SHA: 3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212 (origin release/early-access-code-session-checkout HEAD — verified 2026-08-25 production lineage; adjudicated with the Codex UI lane after their correct warning that the 5c23225 RC freeze was two additive commits behind production)
PUSHED SHA: f4e916fa6ad541168d197e9d3daf50f0a8b90a49
ORIGIN VERIFIED: YES (git ls-remote)
PRODUCTION MUTATED: NO — no deploy, no migration applied, no email, no real account, no catalog data change.

## Commits (all origin-verified)

1. `cb5a14c` — shared contracts: customer-account DTOs + synthetic fixtures,
   product-activation vocabulary (verbal basis provably cannot yield live),
   client-import vocabulary; customer-account server route table + memory
   adapters; client-import dry-run importer + admin routes.
2. `bc9f727` — activation overlay config (Kris's verbal confirmations recorded
   as VERBALLY_CONFIRMED_PENDING_DOCUMENTATION + the 13-item exact-variant
   queue), candidate SQL (UNAPPLIED), operator dry-run CLI.
3. `b38a1e8` — fleet registry/session/message state.
4. `fe3b9f8` — docs/research/SETH_DEMAND_SITE_GAP_REPORT_2026-08-26.md
   (adversarially verified; 8-agent pass; 14 corrections folded in).
5. `f4e916f` — production port bootstrap (honestly partial, fail-closed).

## WHAT NOW WORKS

- **Gap report** (`docs/research/SETH_DEMAND_SITE_GAP_REPORT_2026-08-26.md`):
  46 demand categories, every one carrying an exact status + row-level
  evidence + 75 variant-level exceptions. Headline: 11 categories LIVE today
  (~30 mentions); 56% of demand is one catalog-data-release away (led by
  BPC-157/TB-500 15/15mg, GRP-0266); provider lane wholly verbal-pending;
  5 exact variants missing everywhere → activation queue.
- **Customer account MVP (server)**: `/api/research/customer-account/{overview,
  orders,subscription,care,documents,support}` route table with injected
  member guard, member-keyed ports, staff-only attribution NEVER on the member
  surface, cross-customer isolation tested. Registration DEFERRED per the
  protected-seam protocol (server/index.ts hash-pinned) — wiring lines below.
- **Client-import dry run**: parse → normalize (47 canonical keys, 0 unmapped)
  → dedupe → aggregate → attribute (vitality_advisors / the partner principal) → consent
  pending / not_invited → aggregate report. REHEARSED against the real partner
  file OUTSIDE git via `scripts/research/client-import-dry-run.ts`: 201 rows,
  109 unique people, 92 duplicate rows, 45 multi-interest people, 109 missing
  contact, 0 invitation-eligible, 3 ambiguous blends. No name can cross the
  report boundary (test-pinned).
- **Product activation overlay**: `config/research/product-activation-overlay-
  20260826.json` + resolver. A verbal confirmation is structurally incapable
  of projecting live; live requires documented basis + 11-field checklist +
  founder approval record + whatever the base catalog already demands.

## MIGRATIONS / SCHEMA

`supabase/candidates/20260826_research_client_accounts_blitz.sql` — CANDIDATE
ONLY, not applied, not in the ledger/DAG (those are no-touch this blitz):
research_client_import_batches, research_client_import_staging (the ONLY place
imported names may live), research_customer_product_interests,
research_customer_account_invitations (check constraint: non-draft state
without founder approval is unrepresentable), research_product_activation_
overlay_audit (append-only). Forced RLS, zero policies, minimum service_role
verbs. Disposable-PG rehearsal NOT run (Docker daemon down on this machine) —
rehearse before any apply.

## TESTS

54 owned tests green (`npx vitest run shared/research/product-activation
shared/research/customer-account server/research/customer-account
server/research/client-import server/research/product-activation`), tsc
--noEmit clean at f4e916f. No existing file was modified anywhere in the tree
(new files only), so the base's certified suite state is undisturbed.

## INTEGRATION INSTRUCTIONS (release authority only, with the manifest update)

```ts
import { registerCustomerAccountApi } from "./research/customer-account/routes";
import { buildProductionCustomerAccountPorts } from "./research/customer-account/production";
import { registerClientImportAdminApi } from "./research/client-import/admin-routes";
import { createMemoryClientImportStagingStore } from "./research/client-import/staging-store";
// after registerResearchApi(app), near other member surfaces:
registerCustomerAccountApi(app, buildProductionCustomerAccountPorts(), {
  requireMember: adaptGuard(requireMember),
});
// next to the other /api/admin/research registrations (swap the memory store
// for the Supabase-backed one once the candidate SQL is applied):
registerClientImportAdminApi(app, { store: createMemoryClientImportStagingStore() },
  { requireAdmin: requireSupabaseAdmin });
```

Production ports are honestly partial: identity/membership read real member
rows; orders/care/documents/support/interests return truthful empty states
with the graduation map documented in production.ts. Support writes fail
closed (`support_capability_pending`).

## REMAINING RISK / BLOCKERS

1. Pack 02 rename (D-004) still blocks organization reads; nothing here
   depends on org data.
2. The hotfix RC `b8359eba` (live-UX-performance) is a divergent descendant of
   df16b36; if it ships, integrate it before this branch (overlap expected nil
   — it touches EA/assisted-order UX, no-touch for this lane).
3. Candidate SQL unrehearsed on disposable PG (Docker down).
4. Care/orders/documents ports await their graduation sources; the UI must
   render empty states (fixtures cover them).
5. "T 60mg" (3 mentions) and the three "&"-joined strings need partner
   confirmation — NEEDS_MANUAL_MAPPING, do not guess.

## CODEX INTEGRATION CONTRACT

Codex lane (codex-client-portal-20260826, branch
codex/xenios-client-portal-catalog-20260826, same base 3daa3f4) consumes:
- `shared/research/customer-account/{contract,fixtures}.ts` (cherry-pick from
  cb5a14c or later),
- the activation vocabulary + badge semantics from
  `shared/research/product-activation/contract.ts`,
- the gap report's per-category statuses for the config-driven "Current Client
  Demand" collection (never named after the partner publicly),
- COORDINATION.md at C:/Users/sboad/projects/XENIOS_WEBSITE_BLITZ_20260826.

## EXACT NEXT INTEGRATION STEP

One controlled pass, in order: founder GO on the frozen RC ships first →
merge this branch → merge the Codex UI branch (resolve section.tsx +
lib/routes.ts mounts, keep routes-parity green) → release authority adds the
two registrations above WITH the core-site-protection manifest update → full
suite + e2e 53 → founder decisions on: catalog data release packet, candidate
SQL apply, partner seed (Vitality Advisors / the partner principal), invitation wave.
