# Handoff

TASK: PHASE-ZERO-SUCCESSOR-READY (pre-restart checkpoint under the founder's
three-track directive)

SESSION: claude-fable-desktop — this identity continues. The successor Local
session ADOPTS it (heartbeat it; never register a second production writer).
productionWriter remains claude-fable-desktop in RELEASE_STATE.json.

BRANCH: claude/assisted-order-bridge (in sync with origin). The only
untracked file is the deliberately local `.mcp.json` (scoped MCP config,
bearer via `${SUPABASE_ACCESS_TOKEN}` reference, no literal secret; verified
this session). `.claude/settings.local.json` stays gitignored.

COMMIT SHA AT HANDOFF: cbbe5da (two-lane corpus integration) plus this
checkpoint commit — confirm with `git log -1` after the restart.

STATE THE SUCCESSOR INHERITS (all verified this session, 2026-08-17):

1. Production predecessor RECONCILED: production runs
   458e7284c12cfbd95bd91371afb88cb8a6201454 via MANUAL Render deploy
   dep-da1lmgu417fc73elr8f0 (live 19:05:41Z, trigger manual, actor UNKNOWN —
   Render exposes none). Drift b0fe396..458e7284 independently derived as
   NON-RUNTIME (3 commits: corpus/docs/agentic only, fast-forward). Packet,
   PROJECT_STATE, RELEASE_STATE all updated; 458e7284 is the containment
   redeploy target. /api/health green.
2. Frozen release 32bbd7998e806d881590c9e9a32123c2b8ba8168 =
   tag RESEARCH_PLATFORM_0_5_ASSISTED_ORDER_RC, verified descendant of the
   new predecessor. M71 SHA256
   da60e8b0f0d66625ff72f687f3386c45edaf27f5fc5f020e9137f7e6d486091a verified
   from disk AND at the frozen SHA.
3. Render: service srv-d8s9vej7uimc7384dfcg tracks
   release/early-access-code-session-checkout (remote head = deployed
   458e7284); autoDeploy no, autoDeployTrigger off.
4. The ONLY open preflight items are DB-side (M71 unapplied; zero
   assisted-order tables; zero routines) — blocked because this process
   lacked SUPABASE_ACCESS_TOKEN, so supabase-xenios-prod exposed no tools.
   The founder is adding the variable to the Desktop Local environment and
   restarting the app; the successor should find it SET.
5. Corpus integration done: DECISIONS.md D-009 (two-lane directive), three
   overlay prompts in .xenios/prompts/, .xenios/VISION_GAP_MAP.md (ten-domain
   survey), six new lane tasks in ACTIVE_TASKS.json.

PRODUCTION MUTATED: no. M71 not applied; Render untouched; nothing deployed;
flag untouched; account-level Supabase never used.

NEXT EXACT TASK (successor): run the founder's PHASE ZERO PRODUCTION
SUCCESSOR prompt exactly — check SUPABASE_ACCESS_TOKEN SET/UNSET (never the
value), verify supabase-xenios-prod tools, run the read-only DB preflight
(project yvzeduaxbwgcwllhywff, M71 unapplied, zero tables, zero routines,
hash, frozen release, predecessor 458e7284, deploy dep-da1lmgu417fc73elr8f0,
sole executor), report READY FOR FOUNDER GO, STOP. Production mutation only
on Samuel's subsequent in-session GO, executing the packet steps 1-5 in
order. AFTER Phase Zero completes and is recorded: release the
productionWriter seat (null), update the corpus, then stop or claim an
unowned lane (founder instruction 2026-08-17).

CROSS-LANE NOTES (do not do this work from the executor seat):

- ASSISTED-ORDER-CONVERSION is state=blocked, dependsOn ASSISTED-ORDER-MOUNT
  (state=qa, author claude-fable-main, SHA 32bbd799). The cashflow-expansion
  account unblocks it by INDEPENDENT QA acceptance of that exact SHA
  (xenios-os accept), which it may perform itself since it is not the author.
- FULL-VISION-DEMO is ready and unowned for the vision account.
- Shared mount files (server/index.ts, client/src/research/section.tsx,
  lib/routes.ts) are single-writer seams — coordinate via .xenios/messages.

FOUNDER ACTION (open): the SUPABASE_ACCESS_TOKEN Local-environment fix and
app restart (FOUNDER_ACTIONS.md); confirm or identify the actor of manual
deploy dep-da1lmgu417fc73elr8f0.
