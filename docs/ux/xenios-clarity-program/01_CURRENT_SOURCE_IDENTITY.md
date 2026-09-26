TASK: XENIOS-CLARITY-SPEC-20260926 — clarity program (CLAUDE_01 strategy + CLAUDE_03 reconciliation)
ROLE: Claude Code — strategy/specification lane (session `claude-clarity-spec-20260926`)
STRATEGY BRANCH: claude/xenios-clarity-spec-20260926
ORIGINAL STRATEGY BASE: 049dfd9d387893623771b8a76b90df6a8bc444d7 (content tip 7307d73, head 91e8473)
RECONCILED AGAINST: runtime 3298f279ad760a861e26e3e08514bb49694fae38 / evidence tip bad1c4124ef3a199eec01802438073cdf73b2b83
FINAL OWNER-APPROVED STRATEGY CONTENT SHA / TREE: af5713863dcf9b8455c568b89ffc15f6c103e58a / aed302d6cf48ce760878b5138d3028b6c908e35b (approval recorded 2026-09-26, SB; later commits change identity/handoff records only)
RUNTIME FILES CHANGED: NONE
TEST-ONLY FILES CHANGED: NONE
DOCS-ONLY FILES CHANGED: docs/ux/xenios-clarity-program/** and this lane's own .xenios records
PRODUCTION MUTATED: NO

# 01 — Current source identity (reconciled 2026-09-26)

## Identities

| Role | SHA | Tree | Status |
| --- | --- | --- | --- |
| Observed production | `79414143d4355d5d3d14cd5fe6e5a536dc68d99d` | `ca9d77ce95bede22b40315fa4cbcdee91de2312c` | Live (Render `dep-daqft3vf3r2c73b7e88g`), commerce disabled; re-read read-only by the audit lane 2026-09-26 |
| **Frozen audit candidate (implementation base, pending disposition)** | `3298f279ad760a861e26e3e08514bb49694fae38` | `ac69ecf87e3c622738908bb4fa7a1779aad493fb` | Local release gates PASS; exact-SHA manifest ACCEPTED; full suite 18,055 pass / 85 skip / 0 fail; **deployment not authorized**; Codex release-disposition addendum (`CODEX_00`) pending |
| Audit evidence / handoff tip | `bad1c4124ef3a199eec01802438073cdf73b2b83` | `d93750d0fbedaf2b26e8cd426400fa0ee776c060` | Documentation/records only after `3298f279` (verified: zero client/server/shared/supabase/config changes) |
| Application runtime analysed by the original strategy | `c4ea8a9111fcdf7b66cff7db42347e7d38a3fefa` | `e79b5eef…` | **Application bytes identical in `3298f279`.** Between them only three test files changed (`client/src/research/pages/quality-surfaces.test.tsx`, `server/core-site-protection.test.ts`, `server/release-control-plane.test.ts`) plus docs/records/manifest |
| Original tested contact repair | `02d525baa7d784ed16e297c1d17b1e4050ecf4cc` | — | Preserved |

Consequence: every source-level finding in this package (routes, copy, claims, gates, statuses, catalog counts) holds unchanged for `3298f279`. Re-verified on 2026-09-26 by string search at `3298f279`: "72 hours" (22 occurrences), "one business day" (8), "state-licensed" (6), "30 per month" (3), "Third-party testing" (1), "Research Rep" (15), "View application information" (1), "Xenios Technology<" (1), "The AI workspace for serious coaches" (1).

## What changed in the release picture since the original strategy

| Then (at 049dfd9) | Now (at bad1c41) |
| --- | --- |
| Release NOT ACCEPTED; 2 suite failures; protected fingerprints and production binding failing | Local gates PASS; manifest ACCEPTED; production binding PASS; protected review PASS via lead review (not independent second-agent approval) |
| "Qualified base does not exist" | `3298f279` is the qualified candidate, subject to Codex's final disposition and Samuel's exact-SHA GO |

## Governing constraint discovered during reconciliation

`docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json` (task `XCA-W17-CORE-PROTECTION`, baseline `766f19f`, 2026-07-29) records **Samuel's directive: "the main xenios website outside /health, /research and /care must not be redesigned, rewritten, or behaviorally modified."** It protects `/` and every coach-site route (`/about`, `/careers`, `/how-it-works`, `/contact`, `/partners` redirect, `/faq` redirect …) and the globs `client/src/App.tsx`, `client/src/pages/**`, `client/src/components/**`, `client/src/lib/**`, `server/routes.ts`, `server/services/**`, `shared/schema.ts`. Allowed write zones are `client/src/research/`, `client/src/care/`, `server/research/`, `server/care/`, `shared/research/`, `shared/care/`, `supabase/`, `config/research/` (and a few content/public research paths).

The original strategy's front-door plan (new root, shared header, new top-level routes) touches protected files. It therefore requires Samuel to **explicitly amend that July directive** (decision B-1 in `17_OWNER_DECISION_PACKET.md`), and the manifest must then be re-baselined through the canonical protected-change process. Without that amendment, only the allowed-zone fallback in `04_INFORMATION_ARCHITECTURE.md` §Fallback may be built.

## Worktree and ownership

- Strategy worktree `C:/xenios-wt/clarity-spec`; only `docs/ux/xenios-clarity-program/**` and this session's `.xenios` records are written.
- Leases are per-branch records. This lane's lease exists on the strategy branch only; the audit branch (`bad1c41`) does not carry it. The four stale active leases relevant to implementation are listed in `18_CODEX_IMPLEMENTATION_BRIEF.md` §Leases.
