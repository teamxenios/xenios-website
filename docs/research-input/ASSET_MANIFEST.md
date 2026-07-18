# Research Asset Manifest

**Updated:** 2026-07-18

No third-party production Research asset is approved. UI-002 uses code-native composition only.

| Asset name | Repository path | Creator | Source | Rights | Allowed use | Status | Accessible equivalent | Routes used |
|---|---|---|---|---|---|---|---|---|
| Main-site baseline screenshots | `docs/research-design/baseline/main-site/` | CODEX_UI capture | Local xenios site at `f9c44807` | xenios site capture | Internal visual baseline | Captured, audit-only | n/a | 18 captures across 6 main routes |
| UI-002 implementation previews | `docs/research-design/previews/ui-002/` | CODEX_UI capture | Local UI at `b72e6d1` | xenios site capture | Historical internal review only | Pre-correction; not current production behavior | n/a | Referrals, passport, invite, membership compare |
| Repository attached assets | `attached_assets/` | Unknown or mixed | Historical repository inputs | Review required | None until verified | Blocked | Pending | None |
| Superpower referral screenshot | Local Codex attachment only, not versioned | Superpower | Third-party mobile website | Third-party rights unknown | Pattern inspiration only | Prohibited as a production asset | n/a | Internal UI-002 reference |
| xenios Member Passport | `client/src/research/business-components.tsx` and `client/src/research/research.css` | CODEX_UI | Original code-native xenios composition | xenios-owned source code | Non-functional program and development presentation while flags are off | Implemented with no issued code or production QR | Semantic DOM and explicit unavailable labels | Referral surfaces |
| Invitation QR | Runtime SVG from `qrcode.react` | Future server-validated public invitation URL only | Open-source ISC package | ISC dependency | Encode only an enabled, server-validated public invitation URL | Disabled; no production or development QR renders | Pending enabled contract; current UI states unavailable | Future referral surfaces |

Future imagery must have known provenance, rights, approval, alt text, and route usage before production use.
