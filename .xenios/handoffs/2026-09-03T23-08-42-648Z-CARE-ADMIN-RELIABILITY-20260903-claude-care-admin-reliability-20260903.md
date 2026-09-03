# Handoff — CARE-ADMIN-RELIABILITY-20260903 (P0, incident CARE-2A99C6F7)

Session: `claude-care-admin-reliability-20260903` (Claude Fable 5.1)
Branch: `claude/care-admin-reliability-20260903`
Base: `8cca3373047a2161f5360541a9b2fc5c71f8063f` (release branch head after the 2026-09-03 production-truth reconciliation; contains live `50c2d35cf543724fad17a61d9d5c36cf81fe5f21`)
Tested code SHA: `ace27886dd3b76a8e5dcc982111bb7062e9e451b`
Production: unchanged at `50c2d35c…` / `dep-daatp715efls738v00dg`. Nothing deployed, no migration, no environment change, no customer message, no operational status mutated.

## What was done

- Applied and adapted the prepared Care admin reliability package against the live lineage: protected admin projection over the same `loi_submissions` rows the public Care writer stores (`GET /api/admin/care/access-requests`, `GET …/:requestId`, `PATCH …/:requestId/status`, literal paths, injected canonical `requireSupabaseAdmin`), the `/admin/research/care-requests` queue page (search, filters, contact actions, operational status vocabulary, notification-failure and malformed-row visibility, honest unavailable/unauthorized/empty states, standing no-PHI notice), route manifest + router + "Care" navigation group.
- Adaptations: Express 5 `req.params` coercion; literal registrations so the release route census counts every door; page body exported for jsdom tests; clinical-route-coverage classification with driven response proofs for the three doors; admin-nav pin 6 groups / 27 links (Care first); route census pin `411/402 → 414/405`; seam `server/care/index.ts` re-pinned with a chained note.
- Continuity: stale lease `codex-care-manual-access-20260831` on `CARE-MANUAL-ACCESS-20260831` released (its work is live at `50c2d35c`; its worktree was clean), this session registered, task `CARE-ADMIN-RELIABILITY-20260903` created and claimed.

## Verification (on `ace27886`)

tsc 0 errors; build PASS; focused/page/wiring/coverage/nav/control-plane/core-site gates PASS; provenanced candidate preview: unauthenticated admin doors → 401, control route → 404, page route → 200; responsive pass 1440–320 with no horizontal overflow (populated queue verified in jsdom — no admin session in the preview harness). Full sequential suite: see the release packet for the final count.

## Blocked / follow-ups

- Read-only production proof that `CARE-2A99C6F7` is returned by the protected endpoint requires an authorized admin session against production (post-deploy smoke) or an authorized DB read; neither exists in this session. Seth must not be asked to resubmit.
- Generic `/admin` LOI page still lists Care rows with the legacy LOI status vocabulary; hide Care rows there in a follow-up.
- Two dormant July `claude/f5/care-admin-*` branches (main-based clinical admin console) are unrelated to this queue and were left untouched.

## Next exact action

Samuel approves the exact tested SHA (or its records-only successor with an identical runtime tree) for a commit-pinned Render deploy of `srv-d8s9vej7uimc7384dfcg`; then the read-only post-deploy smoke in the packet.
