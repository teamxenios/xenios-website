# UI-001: Coordination bootstrap and main-site UI audit

**Owner:** CODEX_UI
**Completed:** 2026-07-18
**Routes:** read-only inspection of `/`, `/product`, `/how-it-works`, `/for-coaches`, `/about`, `/careers`, and current `/research` routes
**Files changed:** documentation under `docs/`; no route implementation files
**Shared contracts:** route ownership, shared-component inventory, screenshot baseline, test matrix
**Explicit exclusions honored:** membership backend, authentication, payment, onboarding, private member data, admin application workflow, database migrations, deployment configuration

## Acceptance result

- Local and GitHub state verified.
- Coordination files created and updated.
- Main-site fonts, spacing, containers, buttons, cards, navigation, footer, motion, focus behavior, and breakpoints documented with actual file paths.
- Eighteen exact main-site baseline screenshots and computed metrics versioned.
- Baseline typecheck, tests, build, narrow-width, zoom approximation, keyboard, reduced-motion, console, network, and overflow results recorded.
- No substantive Research redesign started.

## Material findings

- Responsive Tailwind variants do not apply in the rendered site.
- Undefined `.rule-all` and `.btn-ghost-on-dark` classes create visible defects.
- Main header overflows at 320 px; current Research shell overflows at 390 px.
- Research duplicates the main shell rather than extending it.
- Public Research content conflicts with existing stealth-copy rules.

See `docs/research-design/MAIN_SITE_UI_AUDIT.md` for evidence and the next-cycle gate.
