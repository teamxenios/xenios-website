# Route Ownership

**Updated:** 2026-07-18

| Area | Default owner | Coordination rule |
|---|---|---|
| Public Research presentation and responsive behavior | CODEX_UI | Claim before editing |
| `/research`, `/research/membership`, `/research/framework`, `/research/faq` | CODEX_UI | Preserve Claude's membership-state contracts |
| Public guide, evidence, quality, peptide, Quantum, supplement, program, professional, and wholesale presentation | CODEX_UI | Publication boundary decision required for regulated topics |
| `/research/apply` presentation | Shared | Claude owns submission/security contract; Codex owns visual and accessibility review |
| Application APIs, state machine, admin review, lifecycle email | CLAUDE_PRIMARY | Handoff required before UI contract changes |
| Authentication, payment, onboarding, Blueprint, private dashboard, private data | CLAUDE_PRIMARY | Outside CODEX_UI default scope |
| Root navigation, footer, global CSS, tokens, analytics, redirects, SEO defaults, deployment | Shared | Active claim plus status update before editing |

No route ownership overrides an active, narrower claim.
