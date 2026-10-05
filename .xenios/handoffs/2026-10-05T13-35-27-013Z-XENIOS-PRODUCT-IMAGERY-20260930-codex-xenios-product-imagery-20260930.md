# Exact-SHA imagery handoff: execution sprint v2

SESSION ID: codex-xenios-product-imagery-20260930

TASK: XENIOS-PRODUCT-IMAGERY-20260930

BRANCH: codex/xenios-product-imagery-20260930

WORKTREE: C:/Users/sboad/.codex/worktrees/c502/xenios-website

BASE HANDOFF: b3a60d2906c5e44eacd7f2150ec2c3c95dacc380

PREPARATION SOURCE: eee7abe7c68f2aa382f8a49118f5239b671cdc2c

PREPARATION TREE: a723f5ff3e65d176e648cf958308e5112a2eea00

FINAL PUSHED CORRECTION SOURCE: cf4c23af9dc11e8d8c8bc0533e3306e08fdf739f

FINAL PUSHED CORRECTION TREE: b24b44ec99191ce2f3813da5df884f7e0db34872

## Completed and incomplete

The 24-identity Batch 1 coverage preparation, candidate corrections, blank-label
policy and scale-aware framing verifier are complete. They grant zero product
render authority. Three private calibration studies were rerendered under
Samuel's exact authorization recorded in Claude cd66f3c report 31, with three
attempts per study and no raster manipulation outside imagegen.

Only study 04 attempt 3 passed the numeric framing gate. It is selected for
independent exact-asset review, NOT accepted. Studies 03 and 05 remain framing
failures. All nine raw attempts, their exact prompts, reference ancestry, hashes,
read-only measurements and structural-only C2PA metadata are preserved.

Report: docs/product-imagery/EXECUTION_SPRINT_V2_IMAGERY_2026-10-05.md

Manifest: docs/product-imagery/evidence/calibration-corrections-v2/manifest.json

Contact sheet: docs/product-imagery/evidence/calibration-corrections-v2/review.html

Screenshots: same directory, review-1440.png / review-768.png / review-390.png /
review-320.png. No broken images, overflow, filters, image blending or external
network requests. Served source bytes and contain-only display are verified.

## Verification

- Final serial imagery suite: 54 PASS, 0 FAIL, 0 SKIP, 106.599 seconds.
- Focused correction suite: 5/5 PASS, including extra-authority, prompt-drift,
  forged selection, wrong-reference and byte-drift rejection.
- Imagery verify: PASS, 426 reviewed source rows / 424 canonical / 423 targets,
  25 preserved Batch 0 images / 0 public assets.
- No-em-dash runtime-source check: PASS, 1338 files / 0 findings.
- Continuity validate and Git diff checks: PASS.
- Four-width browser evidence: PASS; desktop/narrow-mobile screenshots inspected.
- Internal Codex engineering QA: no concrete blocker; all original, candidate,
  prompt, registry, provenance and parent-reference hashes consistent; all nine
  repository PNGs exactly match their recorded generator-output files. This is
  NOT the registered Claude review and not independent visual acceptance.
- Earlier Oct 3 suite crossed host sleep and had one Python ETIMEDOUT. The
  subsequent fresh 49/49 and final 54/54 runs passed without weakening timeouts.
- Typecheck/build/full release gates: not run for this documentation/private
  imagery-tool-only slice. No runtime code was changed.

## Preserved boundaries

No changes against the prior handoff in client/, server/, shared/, the frozen
founder preview, original Batch 0 candidates or original calibration PNGs.
No canonical founder decision edits, catalog/price/commerce changes, Product
Control wiring, hosted writes, managed SQL apply, deployment or production use.
No Batch 1 product renders and no rerenders of calibration 01/02/06.
No image publication. No automatic Claude contact. No recurring task scheduled.

## Parallel-lane continuity

- Existing Core chat 01a0e098-3b23-7233-9b07-877ace092650 received v2 Session 01.
  It completed source 70cd421a6ab79513744f531d921b3ece61044874, tree
  37ea984993cc78ee61d0e9ca944fca0213e73ba8, records
  7d665730b6db11d64f4a9910af99fde420ded53b. It is NOT independently accepted;
  protection and browser/native-200%/ten-width qualification remain incomplete.
- New MC-01 chat 01a103a8-56a3-7cb1-bf88-f26e08755188 is active in isolated
  worktree C:/Users/sboad/.codex/worktrees/2227/xenios-website on
  codex/xenios-mc01-reconciliation-20261003. Observed source:
  ed9bb9b456bb78994f4fcfedac6ac2112142a5b6. No independent acceptance inferred.
- New Finance chat creation returned client-new-thread:30f12b12-7ba2-4017-9903-29b3d7efc82b.
  Its active isolated worktree is C:/Users/sboad/.codex/worktrees/3221/xenios-website,
  branch codex/xenios-finance-release-blockers-20261003, observed source
  d2e12dcd5cd55e0fce84a41ff49635f85cafaf52. The app listing did not expose its
  resolved chat ID; do not create a duplicate. It has been instructed to separate
  loaded-host timing from idle-host/cloud race qualification.
- These are local isolated worktrees, not cloud compute isolation. Other lanes
  remain responsible for their own tests and exact-SHA handoffs.
- Registered Claude reviewer remains cd66f3c411e6164981295d81c2116e50343edc86.
  User launches v2 prompts 06/07 in Claude; Codex cannot create Opus sessions.
  No duplicate review dispatch was sent.

## Remaining gates and next task

Calibrations 03/05 still need a deliberate correction; 04 needs exact-SHA and
per-asset independent review. Measurement success never changes commerce state.
Batch 1 is still unauthorized. D/E runtime waits for independently accepted
MC-01. Private preview refresh waits for accepted Core A/B/C; do not import the
unaccepted Core handoff merely because implementation tests pass.

Next session: read AGENTS.md and the full continuity corpus, recover current
origin, inspect the registered Claude branch, preserve these raw attempts,
register/claim the smallest exact imagery lease before any edit, and continue
only the still-authorized bounded task. Never overwrite these failures with a
newly passing result; retain lineage. No production or hosted authority exists.

NEXT FIRST COMMAND: node scripts/agentic/xenios-os.mjs resume --session codex-xenios-product-imagery-20260930

SESSION STATE: handoff_ready; task qa, not done; exact imagery lease handed off.

DIRTY WORK: none expected after the records/handoff commit; verify with Git.

BACKGROUND WORK: no root render, capture or test process left running. Existing
user preview and other sprint chats are not stopped or mutated by this handoff.
