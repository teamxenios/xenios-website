# Route Ownership

**Updated:** 2026-07-18

| Area | Default owner | Coordination rule |
|---|---|---|
| Public Research presentation and responsive behavior | CODEX_UI | Claim before editing |
| `/research`, `/research/membership`, `/research/framework`, `/research/faq` | CODEX_UI | Preserve Claude's membership-state contracts |
| Public guide, evidence, quality, peptide, Quantum, supplement, program, professional, and wholesale presentation | CODEX_UI | Publication boundary decision required for regulated topics |
| `/research/apply` presentation | Shared | Claude owns submission/security contract; Codex owns visual and accessibility review |
| Membership compare, referrals, ambassadors, trust, data-use, Blueprint, and program presentation | CODEX_UI | Claimed under `UI-002`; remain behind private gate |
| `/research/invite/:referralCode` and `/research/member/referrals` presentation | CODEX_UI | Claude owns code validation, attribution, member identity, status, and ledger contracts |
| Application APIs, state machine, admin review, lifecycle email | CLAUDE_PRIMARY | Handoff required before UI contract changes |
| Authentication, payment, onboarding, Blueprint, private dashboard, private data | CLAUDE_PRIMARY | Outside CODEX_UI default scope |
| Root navigation, footer, global CSS, tokens, analytics, redirects, SEO defaults, deployment | Shared | `UI-002` claims the Tailwind entry directive and missing documented primitives only; all other edits require a new claim |

No route ownership overrides an active, narrower claim.
