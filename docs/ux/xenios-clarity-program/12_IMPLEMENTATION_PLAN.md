# 12 — Implementation plan (for Codex, after Samuel's decisions)

## Preconditions (all required before runtime edits)

1. **Qualified base.** The audit/release-control lane names one exact qualified base SHA/tree (expected `c4ea8a9` or reconciled successor). If it differs from `c4ea8a9`, diff the files below first; this spec was written against `c4ea8a9`.
2. **Decisions.** `02_DECISIONS.md` carries Samuel's answers for D-01..D-12 (or "accept defaults").
3. **Worktree/branch.** `codex/xenios-clarity-implementation-20260926` from the qualified base; register + claim via `node scripts/agentic/xenios-os.mjs`.
4. **Lease conflicts to resolve first** (active in `.xenios/CODE_OWNERSHIP.json` on 2026-09-26):
   - `client/src/care/**` — leased to `codex-ordering-readiness-20260923`. Release or hand over before editing Care pages.
   - `shared/research/master-offerings/**`, `server/research/master-offerings/**`, `server/research/catalog/**`, `server/research/catalog-display/**` — leased to `claude-fable-s7` (likely stale; confirm via `xenios-os.mjs stale`). The product index must read these authorities, not edit them.
   - `client/src/research/assisted-order/**`, `client/src/research/early-access/…Payment…` — leased to `codex-ordering-readiness-20260923`.
5. **Protected files.** Changes to paths listed in `CORE_SITE_PROTECTION_MANIFEST.json` go through the canonical protected-change review; never update fingerprints to pass tests.

## Phase 1 — Front door (no decisions beyond D-01/D-02/D-03 needed; highest value)

Scope: one chrome, new root, audience selector, controlled vocabulary, jargon removal, dead-end fixes.

| Work | Likely files (@ c4ea8a9) | Notes |
| --- | --- | --- |
| Brand module | new `client/src/lib/brand.ts` | `publicBrandName`, `legalEntityName`; all chrome reads it |
| Shared header/footer | `client/src/components/Navbar.tsx`, `Footer.tsx`, `lib/nav.ts`, `TopRibbon.tsx` | IA §Header/§Footer; remove ribbon from health pages (keep on `/workspace`) |
| Research/Care chrome unification | `client/src/research/layout.tsx` (MinimalChrome), `research/pages/Gateway.tsx`, `research/pages/PublicEditorialNav.tsx`, Care page shell | Public Research/Care pages render shared chrome; password gate never on public links (CUX-07) |
| New Home | `client/src/pages/Home.tsx` → move current to `pages/workspace/WorkspaceHome.tsx`; new Home | P-01; `AccountAccessChooser.tsx` becomes the audience selector (6 tiles) |
| Routes + redirects | `client/src/App.tsx`, `client/src/research/section.tsx`, server redirect table if any | IA route map; keep all authority routes; 301s; remove `/partners→/ecosystem`, `/faq→/product` |
| New static pages | `/individuals`, `/how-it-works`, `/faq`, `/about`, `/support`, `/quality`, `/research` explainer, `/practices` (+3), `/partners`, `/suppliers`, `/status`, `/sign-in`, `/activate` aliases | Copy from `05_COPY_DECK.md` |
| Claim cleanup | `care/CarePublicPages.tsx`, `care/CareAccessRequestForm.tsx`, `research/pages/Gateway.tsx`, `research/pages/Faq.tsx`, `research/early-access/fulfillment-copy.ts`, `server/research/early-access/cart/customer-status.ts`, `server/research/early-access/notifications/communications.ts`, `server/care/manual-access.ts` (email text only), `research/quality/*` | Remove/replace per CLAIM_LEDGER statuses; email template text changes only |
| Status labels | `research/assisted-order/AssistedOrderStatusPage.tsx` (display mapping only) | §13 mapping; no state-machine change |
| Sign-in dead end | `research/pages/SignIn.tsx` | Remove "View application information"; add Activate + Care note |
| Research-use disclosure | `server/research/master-offerings/customer-projection.ts` | Attach disclosure to `research_peptides_materials` (and capsules/topicals/supplies as counsel directs) — CUX-09. Coordinate with master-offerings lease owner |

Exit: U-G01..U-G08, U-001..U-006, U-030..U-036 (copy), U-080..U-094, U-110, U-111 pass.

## Phase 2 — Durable inquiries and applications (closes CUX-08, CUX-16)

| Work | Notes |
| --- | --- |
| Durable business inquiry | Extend the existing contact route (or add a sibling) to store an inquiry record (type, contact, practice/org fields, content hash, reference `INQ-XXXXXXXX`, state `inquiry_received`, owner, due date) **before** reporting accepted; keep provider-acceptance semantics and idempotency. Reuse existing storage pattern (Care uses `loi_submissions`) and the notification outbox for the courtesy email. **No second email system.** Schema change goes through the migration DAG and production approval like any other. |
| Founder queue lane | Add "Business inquiries" lane to command center (read-only list + state transitions) behind `requireSupabaseAdmin` |
| Career application | Durable application form (name, email, role, links, note) → record + receipt (existing recruiting-mail receipt kind) + founder lane |
| Confirmation copy | Show reference only once the record exists (N-08/N-09/N-13) |

Exit: U-061..U-063, U-075..U-077, U-102.

## Phase 3 — Products and prices (needs D-04, D-05, D-12)

| Work | Notes |
| --- | --- |
| Public product index + page | Mount the existing storefront projection/publication authority (`server/research/storefront/*`, `research/storefront/StorefrontProductPage.tsx`) under `/products`; a product appears only with an approved publication record (Samuel's D-04 list = publication approvals). Signed-out price = D-05 per SKU. Request Order deep-links to the assisted-order request with product+variant |
| Care-only product linking | Card CTA → `/care/schedule` (Q-17 default), not member-only metabolic-care |
| Flag | `RESEARCH_PUBLIC_STOREFRONT_ENABLED` is a production configuration change → Samuel's explicit production approval at release time |

Exit: U-020..U-024, U-043.

## Phase 4 — Practice program activation (needs D-07..D-10, Q-01..Q-07; engineering + ops)

Not part of the clarity release. Listed so the public pages' promises have a path:
Referral V1 enablement + affiliate bindings SQL; single commission schedule; payout provider; consent capture for practice visibility; Pack 02 org tables (resolve `research_organizations` name collision, CUX-17) and mounting of org workspace pages; partner application opened (commerce-independent apply path).

## What Codex must NOT do

- Enable `commerceEnabled`, the EA cart, the public storefront flag, Referral V1, the affiliate program, or any production configuration.
- Add ordering-on-behalf-of-clients, practice clinical approval, or commission on Care.
- Publish any claim whose ledger status is not verified/approved.
- Change admin guard, Care clinical capability gates, claim-token authority, payment verification authority, or outbox semantics.
- Copy System Labs text, assets or structure details beyond the patterns in `SYSTEM_LABS_REFERENCE_ANALYSIS.md`.

## Tests to add (focused)

Root comprehension/navigation; 390/768/1440 layout (overflow); audience selector destinations; product card contract; Care boundary copy; practice page content assertions (no ordering-for-clients, no rates, Care-no-commission); partner closed/open states (no password wall); sign-in/activation/status states; submission accepted/rejected/uncertain; notification ownership (inquiry record before accepted); keyboard/focus; admin isolation; native commerce dark; controlled-vocabulary lint (retired labels absent); claim-ledger lint (do-not-publish strings absent).

## Release checks (per CODEX_01)

Focused tests · typecheck · exact production build · exact-build browser UAT (`11_UAT_MATRIX.csv`) · full release suite · route uniqueness · protected-change gate · canonical site records · `git diff --check`. Report in `13_IMPLEMENTATION_REPORT.md` with runtime SHA separate from docs/handoff SHA.

## Estimated size

Phase 1: ~20 new/rewritten page components, 6 chrome files, ~12 copy/claim edits, route/redirect table. Phase 2: 1 schema addition + route + admin lane + 2 forms. Phase 3: mount + publication list. Phase 1 alone resolves CUX-01..04, 06 (explanation), 07, 10–15, 20–22.
