# Research Page Inventory

**Updated:** 2026-07-18
**Status:** UI-002 implemented and ready for review

## UI-002 route status

| Route | Presentation owner | Status | Backend boundary |
|---|---|---|---|
| `/research` | CODEX_UI | Member-system overview added | Existing data only |
| `/research/membership` | CODEX_UI | $50 activation corrected; proposed offers separated | Claude owns activation/payment |
| `/research/membership/compare` | CODEX_UI | Implemented | No live checkout |
| `/research/referrals` | CODEX_UI | Implemented with original passport and Give $10, Get $15 qualification sequence | Preview code only |
| `/research/ambassadors` | CODEX_UI | Implemented as a separate reviewed pathway | Claude/legal own approval and compensation |
| `/research/professionals` | CODEX_UI | Implemented with clinical-compensation boundary | Claude/legal own contracts |
| `/research/trust` | CODEX_UI | Implemented; separates current controls from roadmap | Claude owns security implementation |
| `/research/how-your-data-is-used` | CODEX_UI | Implemented with logical separation map | Claude owns access/consent/retention controls |
| `/research/blueprint` | CODEX_UI | Implemented with draft, quality review, and deeper-review boundary | Claude owns private Blueprint processing |
| `/research/programs` | CODEX_UI | Reframed as outcome-oriented program merchandising | Claude owns purchase/entitlement |
| `/research/invite/:referralCode` | CODEX_UI | Implemented; invitation never guarantees approval | Claude owns validation/attribution |
| `/research/member/referrals` | CODEX_UI | Empty production UI plus development-only safe-state preview | Claude owns identity, codes, activity, credits, and fraud |
| `/research/apply` | Shared | Referral query prefill and post-success presentation added | Claude's submission/security API unchanged |

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
- Referral presentation contract: `shared/research/referral-ui.ts`
- Access and noindex: existing gate, unchanged
