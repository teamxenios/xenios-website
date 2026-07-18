# Research Page Inventory

**Updated:** 2026-07-18
**Status:** UI-002 corrected for INTEGRATION_QA re-review; do not merge yet

## UI-002 route status

| Route | Presentation owner | Status | Backend boundary |
|---|---|---|---|
| `/research` | CODEX_UI | Member-system overview added | Existing data only |
| `/research/membership` | CODEX_UI | $50 activation corrected; proposed offers separated | Claude owns activation/payment |
| `/research/membership/compare` | CODEX_UI | Implemented | No live checkout |
| /research/referrals | CODEX_UI | Proposed/configurable program; no production code, QR, share target, or active reward | Claude owns validation, ledger, identity, and flags |
| `/research/ambassadors` | CODEX_UI | Implemented as a separate reviewed pathway | Claude/legal own approval and compensation |
| `/research/professionals` | CODEX_UI | Implemented with clinical-compensation boundary | Claude/legal own contracts |
| `/research/trust` | CODEX_UI | Implemented; separates current controls from roadmap | Claude owns security implementation |
| `/research/how-your-data-is-used` | CODEX_UI | Implemented with logical separation map | Claude owns access/consent/retention controls |
| `/research/blueprint` | CODEX_UI | Implemented with draft, quality review, and deeper-review boundary | Claude owns private Blueprint processing |
| `/research/programs` | CODEX_UI | Reframed as outcome-oriented program merchandising | Claude owns purchase/entitlement |
| /research/invite/:referralCode | CODEX_UI | Fails closed as invalid/unavailable; no referrer claim or referral attachment | Claude owns server validation/attribution |
| /research/member/referrals | CODEX_UI | Aggregate-only production UI plus development-only aggregate sample | PR #12 owns aggregate contract; Claude owns identity, codes, credits, and fraud |
| /research/apply | Shared | Untrusted ref query ignored; post-success program copy remains proposed/inactive | Claude's submission/security API unchanged |

All listed routes remain inside the existing Research access gate and remain noindexed.

## Existing route families outside UI-002

- Framework, FAQ, guides, categories, search, articles, evidence levels, and review process.
- Peptides, products, Quantum, supplements, quality, wholesale, sign-in, and legal pages.
- Private member, onboarding, Blueprint, catalog/document, application-admin, members, products, content, settings, and audit routes.

Claude owns private and infrastructure route families by default. Regulated public topics require the accepted private-preview boundary and explicit publication approval.

## Implementation map

- Registry: `client/src/research/section.tsx`
- Shell: `client/src/research/layout.tsx`
- Existing primitives: `client/src/research/components.tsx`
- UI-002 primitives: `client/src/research/business-components.tsx`
- UI-002 responsive styles: `client/src/research/research.css`
- Client-only referral presentation adapter: client/src/research/referral-state.ts
- Authoritative shared/server referral contract: PR #12 / CLAUDE_PRIMARY ownership
- Access and noindex: existing gate, unchanged
