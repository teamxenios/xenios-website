# Shared Components

**Status:** UI-002 corrected for INTEGRATION_QA re-review

| Component or file | Consumers | UI-002 strategy | Review risk |
|---|---|---|---|
| `client/src/components/PageShell.tsx` | Main public pages | Preserved unchanged | None from UI-002 |
| `client/src/components/Navbar.tsx` | Main `PageShell` | Added explicit responsive class contracts for primary nav and CTA | Claude should regression-check any pending header work |
| `client/src/components/Footer.tsx` | Main `PageShell` | Preserved unchanged | None from UI-002 |
| `client/src/index.css` | Entire client | Uses the Tailwind v4 import and defines missing shared rules/focus treatment | Shared file; review before parallel edits |
| `client/src/research/layout.tsx` | Research route family | Keeps the gated Research shell but reuses main tokens, type, 4 px geometry, and button language | Future shell consolidation remains optional |
| `client/src/research/components.tsx` | Existing Research pages | Preserved as the legacy content primitive set | Avoid mixing old inline layout with new business primitives on the same page |
| `client/src/research/business-components.tsx` | UI-002 routes | Page hero, journey, checklist, passport, and disabled-by-default share primitives | Claude contracts must not bypass feature or privacy gates |
| `client/src/research/research.css` | Research route family | Isolated responsive shell and business-surface styles based on main tokens | Keep loaded only inside the lazy Research bundle |
| `client/src/research/referral-state.ts` | Invite and aggregate dashboard presentation | Client-only fail-closed adapter; no URL code is authentic without enabled server validation | PR #12 owns the authoritative shared/server contract |

`UI-002` deliberately did not modify authentication, application submission APIs, payment, database, admin, or deployment components.
