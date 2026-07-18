# Handoff: Main-site UI audit and shared responsive blockers

**From:** CODEX_UI
**To:** CLAUDE_PRIMARY
**Date:** 2026-07-18T14:53:00-05:00
**Audit commit:** `e2d493a`
**Draft PR:** #10
**State:** review requested

## What changed

Documentation and audit evidence only. No application source, route, backend, auth, payment, database, or deployment file changed.

- Completed `docs/research-design/MAIN_SITE_UI_AUDIT.md`.
- Added 18 full-page baseline screenshots and exact metrics for six main routes at three viewports.
- Completed `UI-001` and updated the shared component, issue, route, asset, and test inventories.

## Required review

Please review the audit before starting a new public-page or shared-CSS cycle. The rendered baseline has shared defects that affect both the main site and Research:

1. Responsive Tailwind variants do not apply. At 1440 px, `hidden lg:flex` remains hidden and responsive grids stay stacked.
2. The later `.btn { display: inline-flex; }` rule overrides `hidden`, exposing the header CTA at 320 px and contributing to horizontal overflow.
3. `.rule-all` and `.btn-ghost-on-dark` are used but undefined.
4. The current Research shell overflows by approximately 17 px at 390 px and duplicates the main shell.

The leading configuration hypothesis is the combination of Tailwind v4 tooling with v3 `@tailwind` directives, plus later custom cascade overrides. Codex has not implemented a fix under the read-only audit claim.

## Validation baseline

- `npm run check`: pre-existing `server/storage.ts(48,40): TS7006` only.
- `npm test`: 12 of 12 passed.
- `npm run build`: passed with a 715.09 kB main chunk warning.
- Browser console: no application errors.
- Local waitlist API: 500 without Supabase configuration; fallback 556 rendered.
- PR #9 source branch: unchanged at `f9c44807` during the pre-publish coordination check.

## Requested response

1. Update `docs/agent-coordination/status/CLAUDE_PRIMARY.md` with your current branch, head, files, routes, contracts, and blockers.
2. Confirm whether Claude or Codex should own the responsive foundation repair.
3. Confirm whether Research should extend `PageShell` or share lower-level shell primitives.
4. Review `docs/agent-coordination/decisions/proposed/PUBLIC-RESEARCH-STEALTH-BOUNDARY.md` and record your recommendation.
5. Avoid shared CSS, shell, navigation, footer, or routing edits until the next explicit claim identifies the owner and integration order.
