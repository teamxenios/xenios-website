# Handoff: cross-model continuity OS installed (claude-fable-desktop, 2026-08-19)

## What this was

Founder-directed CONTINUITY-ONLY integration during the hard pause. No feature
work, no merges, no production mutation, no flag/pricing change.

## Installed

- `.xenios/FULL_VISION.md` — the canonical full Xenios Research vision.
- `.xenios/prompts/UNIVERSAL_MODEL_AGNOSTIC_CONTINUITY_OS.md` — the universal
  takeover prompt (role detection: same-session / clean takeover / recovery /
  lead / worker / solo; continues the EXISTING fleet). Its pre-switch section
  now defers to the existing `.xenios/prompts/PRE_SWITCH_CHECKPOINT_PROMPT.md`
  (preserved untouched).
- `.xenios/prompts/NEW_MODEL_START_PROMPT_2026-08-19.txt` — the short paste.
- `docs/research-launch/XENIOS_FULL_CURRENT_RETAIL_PRICING_426_VARIANTS_2026-08-19.csv`
  — the 426-row retail source (424 numeric, 2 Price-on-request: BAM15 500mcg,
  Syringes & Alcohol Swabs) for the future Product Control reconciliation.
- `AGENTS.md` + `CLAUDE.md` — mandatory five-item session reading list
  (corpus, full vision, latest build status, latest handoff, ownership), then
  the universal OS for role detection. Git/production truth still outranks
  every prompt.

## NEW founder directives embedded in the pack — QUEUED, NOT IMPLEMENTED
(the hard pause holds; these are feature work for resume)

1. ONE Early Access password: customer journey keeps ONLY the dedicated Early
   Access code prompt ("Xenios Genesis"; env stores a HASH, plaintext never
   committed); remove the outer shared Research password from that journey;
   anyone with the code may enter the EA order flow (contact/shipping/policy
   still required; Care routing unchanged).
2. Maximum quantity 100 per exact variant across UI/contracts/server/DB/tests
   (hunt down hidden 20- and 50-unit limits; note M71's line CHECK is
   band-based, no schema change expected, but VERIFY).
3. Full 426-row retail catalog reconciliation through Product Control from the
   CSV above (the canonical dataset is still the 420-row 8/13 generation).

## State

- Branch `xenios/launch-integration-20260819`; production unchanged
  (a66434d9 live, Release A); hard pause otherwise unchanged; fleet paused
  with dirty worktrees preserved (see the full build status file).
- HANDOFF SHA: recorded in the commit that carries this file.

## Next exact command (for any resuming session)

Read the five mandatory files, then `.xenios/prompts/UNIVERSAL_MODEL_AGNOSTIC_CONTINUITY_OS.md`,
then await the founder's explicit resume order (top actions live in
docs/research-launch/XENIOS_RESEARCH_FULL_BUILD_STATUS_2026-08-19.md §14).
