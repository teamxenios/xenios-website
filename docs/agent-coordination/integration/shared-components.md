# Shared Components

**Status:** UI-002 implementation complete

| Component or file | Consumers | UI-002 strategy | Review risk |
|---|---|---|---|
| `client/src/components/PageShell.tsx` | Main public pages | Preserved unchanged | None from UI-002 |
| `client/src/components/Navbar.tsx` | Main `PageShell` | Added explicit responsive class contracts for primary nav and CTA | Claude should regression-check any pending header work |
| `client/src/components/Footer.tsx` | Main `PageShell` | Preserved unchanged | None from UI-002 |
| `client/src/index.css` | Entire client | Uses the Tailwind v4 import and defines missing shared rules/focus treatment | Shared file; review before parallel edits |
| `client/src/research/layout.tsx` | Research route family | Keeps the gated Research shell but reuses main tokens, type, 4 px geometry, and button language | Future shell consolidation remains optional |
| `client/src/research/components.tsx` | Existing Research pages | Preserved as the legacy content primitive set | Avoid mixing old inline layout with new business primitives on the same page |
| `client/src/research/business-components.tsx` | UI-002 routes | New page hero, journey, checklist, passport, share, and safe-status primitives | Claude contracts must not bypass privacy-safe inputs |
| `client/src/research/research.css` | Research route family | Isolated responsive shell and business-surface styles based on main tokens | Keep loaded only inside the lazy Research bundle |
| `shared/research/referral-ui.ts` | Invite, apply, and dashboard presentation | Normalizes public codes and exports the only UI-safe status vocabulary | Treat as a shared frontend/backend presentation contract |

`UI-002` deliberately did not modify authentication, application submission APIs, payment, database, admin, or deployment components.
