XENIOS CODEX FLEET DISPATCH - CODEX 1

ROLE: WRITER
PROMPT FILE: 01_CODEX_EA_GATE_ACCESS.md
CREATE YOUR WORKTREE:
  git worktree add C:/xenios-wt/codex1-ea-gate -b codex/ea-one-code-gate-20260820 7b16a2e06dfc227f5bc748b14480c9d072e566de
BRANCH: codex/ea-one-code-gate-20260820

[XENIOS CODEX RESUME BASE]
INTEGRATION BRANCH: xenios/launch-integration-20260819
CODEX RESUME SHA: 7b16a2e06dfc227f5bc748b14480c9d072e566de
  (full test suite GREEN on this exact SHA: 659 files / 9,758 tests passed, 0 failures, 2026-08-20)
PRODUCTION SHA: a66434d980c909303d3595382e5df77342fbc127 (LIVE, Release A, deploy dep-da31altg1s2s73f6tep0)
ROLLBACK SHA: 458e7284c12cfbd95bd91371afb88cb8a6201454 (flags OFF first)

CORE LAW: Claude main (claude-fable-desktop) is the SOLE integration, release and
production owner. You never deploy, never apply production migrations, never change
production env or flags, never change live pricing, never send real email, never mark
real payment or shipment, and never edit a lead-owned seam (server/index.ts,
server/research/index.ts, client/src/research/section.tsx,
client/src/research/adminx-section.tsx, migration DAG/ledger, release manifests,
production packet, shared .xenios fleet state). Send the lead exact snippets instead.

NO-DOWNTIME LAW: the Early Access production path is LIVE and must keep working
through every phase. EXPAND -> MIGRATE -> DARK DEPLOY (feature OFF) -> SMOKE LIVE
PATHS -> ENABLE PROGRESSIVELY -> SMOKE NEW -> RECORD ROLLBACK. Never make a
destructive migration the only route forward.

OWNED PATHS (you are the ONE writer here):
server/research/early-access/private-access-config.ts, private-access-password.ts, private-access-session.ts and their tests; client/src/research/early-access/EarlyAccessRoute.tsx unlock screen + copy; a local-only hash minting script under scripts/ (never a committed plaintext code); NEW wall-admission matrix tests (may live in server/research/early-access-wall.test.ts additively).

FORBIDDEN PATHS (another writer or the lead owns these):
server/research/index.ts and server/index.ts (LEAD SEAMS - snippets only); every Product Control / pricing path; the assisted-order wizard.

LEAD BRIEFING FOR THIS LANE (verified facts - read before you plan):
LEAD FINDINGS (verified in source, do NOT rebuild these):
- The narrow exemption ALREADY EXISTS. /research/early-access renders EarlyAccessRoute directly in client/src/research/section.tsx with NO Gateway wrapper, and every EA customer API door is individually admitted through the /api/research wall via EARLY_ACCESS_OPEN_READ_PATHS / EARLY_ACCESS_OPEN_WRITE_PATHS plus anchored regexes for order/cart/assisted-order paths (server/research/index.ts ~line 286-411).
- Production probe 2026-08-20: GET https://xeniostechnology.com/research/early-access -> 200 with no outer research password; /api/research/early-access/session -> {"authenticated":false}; /api/research/early-access/assisted-orders/config -> enabled:true.
- The gate is ALREADY hash-only: RESEARCH_EARLY_ACCESS_PASSWORD_HASH, format scrypt$32768$8$1$<salt b64url>$<digest b64url> (server/research/early-access/private-access-password.ts). N=32768,r=8,p=1,16-byte salt,64-byte digest, explicit maxmem required.
- The founder REJECTED RESEARCH_PUBLIC=true as the solution. Do not propose it.
- server/research/early-access-wall.test.ts already passes 67 tests pinning the admissions.
YOUR REAL SCOPE: (a) unlock screen displays the name "Xenios Genesis" (the code itself is customer-entered; plaintext NEVER committed/logged/bundled/stored in browser storage); (b) a local hash-minting helper the lead runs at release; (c) NEW admission-matrix tests proving every EA journey door answers WITHOUT the outer research cookie AND that admin/member/supplier/finance/affiliate-admin/Care stay walled; (d) audit for any plaintext-leak path. The env change itself is LEAD-owned.

CHECKPOINT LAW: every coherent slice and roughly every 15 minutes - save, run focused
tests, commit, push, heartbeat, update task state, refresh an exact-SHA handoff in
.xenios/handoffs/, message dependent lanes in .xenios/messages/, continue. Do not
accumulate thousands of uncommitted lines.

FINISH LAW: when your lane is done - commit, push, hand off the exact SHA, release the
lease, run `node scripts/agentic/xenios-os.mjs next`, and with lead approval take the
next highest-priority unowned full-vision lane. Do not sit idle.

Return the standard checkpoint block (SESSION / TASK / WORKTREE / BRANCH / BASE SHA /
PUSHED SHA / LEASE / COMPLETED / FILES / TESTS / TYPECHECK / BUILD / MIGRATION /
PRODUCTION MUTATED / BLOCKERS / INTEGRATION INSTRUCTIONS / NEXT CODE ACTION).

Your full lane prompt follows verbatim.

================================================================
# CODEX 1 — EARLY ACCESS ONE-CODE GATE / ACCESS

Read continuity files first. Only write if this path family is unowned.

Goal:
`/research/early-access`
-> no outer Research password
-> one dedicated Xenios Genesis code
-> secure Early Access session

Do not use `RESEARCH_PUBLIC=true` as a shortcut if it opens broader Research access.

Responsibilities:
- trace Research wall + EA wall
- isolate gate/session changes
- exact route/API admission matrix
- rate-limit/session/security tests
- prove admin/member/supplier/Care remain protected
- provide lead seam snippets for protected composition files

Plaintext XeniosGenesis must not be committed. Production uses secure hash only.

If Claude already owns implementation, operate as independent adversarial QA and return exact defects/tests.
