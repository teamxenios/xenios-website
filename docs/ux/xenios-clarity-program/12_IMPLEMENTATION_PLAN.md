# 12 — Implementation plan (superseded)

Superseded on 2026-09-26 by **`18_CODEX_IMPLEMENTATION_BRIEF.md`**, which Codex must follow.

The original plan (strategy content tip `7307d73`) had three stale assumptions, corrected in 18:

1. **Base.** The original plan waited for "a qualified base". The base is now `3298f279` (subject to the CODEX_00 disposition).
2. **Protected files.** The original plan treated Home, Navbar, Footer, `lib/nav.ts`, `App.tsx` and `server/routes.ts` as ordinary edit targets. They are protected by Samuel's 2026-07-29 core-site directive. Brief 18 splits the work into full mode (if B-1 is approved) and fallback mode.
3. **Durable inquiries.** The original plan proposed extending the contact route in `server/routes.ts` / `server/services`. Both are protected. Brief 18 uses a new `server/research/` endpoint over the existing `loi_submissions` store, with no migration.

The original phase content survives in 18 §3 (steps 1–12). Phase 4 (practice program activation) remains out of scope for this release; see `09_PRACTICE_MODEL.md` §Capability classification.
