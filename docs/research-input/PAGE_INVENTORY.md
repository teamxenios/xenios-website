# Research Page Inventory

**Updated:** 2026-07-18
**Status:** UI-002 routes claimed for implementation

## Highest-priority public routes

| Route | Default owner | Current milestone |
|---|---|---|
| `/research` | CODEX_UI | audited at 390; 9066 px tall; approximately 17 px shell overflow |
| `/research/membership` | CODEX_UI, backend contracts shared | audited at 390; shell overflow; no redesign started |
| `/research/framework` | CODEX_UI | audited at 390; shell overflow; no redesign started |
| `/research/faq` | CODEX_UI | audited at 390; shell overflow; no redesign started |
| `/research/apply` | shared | Claude implementation present; audited at 390; shell overflow; backend untouched |
| `/research/membership/compare` | CODEX_UI | UI-002: activation, Plus, Blueprint Review, and program comparison |
| `/research/referrals` | CODEX_UI | UI-002: member referral program and qualification boundary |
| `/research/ambassadors` | CODEX_UI | UI-002: separate approved ambassador pathway |
| `/research/professionals` | CODEX_UI | UI-002: professional membership and partnership boundary |
| `/research/trust` | CODEX_UI | UI-002: privacy and security commitments versus roadmap controls |
| `/research/how-your-data-is-used` | CODEX_UI | UI-002: data separation, access, consent, and referral privacy |
| `/research/blueprint` | CODEX_UI | UI-002: automated draft, human quality review, and paid deeper-review boundary |
| `/research/programs` | CODEX_UI | UI-002: outcome-oriented merchandising rather than disconnected catalog |
| `/research/invite/:referralCode` | CODEX_UI, data contract shared | UI-002 presentation; Claude owns validation and attribution |
| `/research/member/referrals` | CODEX_UI, private contract shared | UI-002 states; Claude owns member identity, data, credits, and privacy |

## Additional public route families

- Guides, categories, search, article templates, evidence levels, and review process
- Peptides and product details
- Quantum
- Supplements
- Programs
- Quality and evidence
- Professionals and wholesale
- Sign-in and Research legal pages

## Private and admin route families

Owned by CLAUDE_PRIMARY by default: member dashboard, onboarding, Blueprint, membership activation, private catalog/documents, application admin, members, blueprints, products, content, settings, and audit.

## Current implementation

- Route registry: `client/src/research/section.tsx`
- Research shell: `client/src/research/layout.tsx`
- Research primitives: `client/src/research/components.tsx`
- Priority pages: `client/src/research/pages/Overview.tsx`, `Membership.tsx`, `Framework.tsx`, `Faq.tsx`, and `Apply.tsx`
- Access gate: the local audit used a temporary environment password and did not modify auth or backend code.

## Inventory fields to complete for extended routes

For every route, record implementation file, current components, data source, auth or access state, responsive defects, content source, asset source, owner, dependencies, and acceptance criteria.
