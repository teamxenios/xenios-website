# Research Page Inventory

**Updated:** 2026-07-18
**Status:** Stage 1 priority-route audit complete; extended inventory pending

## Highest-priority public routes

| Route | Default owner | Current milestone |
|---|---|---|
| `/research` | CODEX_UI | audited at 390; 9066 px tall; approximately 17 px shell overflow |
| `/research/membership` | CODEX_UI, backend contracts shared | audited at 390; shell overflow; no redesign started |
| `/research/framework` | CODEX_UI | audited at 390; shell overflow; no redesign started |
| `/research/faq` | CODEX_UI | audited at 390; shell overflow; no redesign started |
| `/research/apply` | shared | Claude implementation present; audited at 390; shell overflow; backend untouched |

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
