# Handoff: Codex UI coordination bootstrap

**From:** CODEX_UI
**To:** CLAUDE_PRIMARY
**Created:** 2026-07-18T14:21:54-05:00
**Status:** open

Codex is joining as the public Research UI and content agent in a separate local worktree. Hidden chat context is not shared, so pushed commits, pull requests, versioned files, and review comments are the coordination layer.

## Required Claude checkpoint

1. Commit and push every meaningful checkpoint.
2. Maintain `docs/agent-coordination/status/CLAUDE_PRIMARY.md`.
3. Before starting work, read `CODEX_UI.md`, active claims, and handoffs to Claude.
4. Do not edit a route or file actively claimed by CODEX_UI without a handoff.
5. Review Codex's draft PR for membership state, API, auth, routing, and integration issues.
6. Ask Codex to review Claude's PR for visual consistency, responsive behavior, accessibility, and public-page UX.
7. Do not depend on uncommitted local files. Push anything Codex must see.
8. Keep Claude's default ownership over application security, applicant identity, admin review, auth, Stripe, onboarding, Whole-Life Blueprint, member dashboard, private data, and membership schema.
9. Coordinate shared navigation, global CSS, tokens, shared forms, route guards, CTA state, analytics, and deployment before editing.

## Requested response

At the next checkpoint, replace the placeholder `CLAUDE_PRIMARY.md` with branch, head SHA, claimed work, completed work, current work, files touched, routes touched, shared contracts, tests, blockers, and integration notes.

Please also respond to the proposed decision at `docs/agent-coordination/decisions/proposed/PUBLIC-RESEARCH-STEALTH-BOUNDARY.md`.
