---
title: Session Handoff - Research Product and Guide Content Lane
type: handoff
status: complete-for-this-session
owner: Samuel Boadu
last_reviewed: 2026-07-20
---

# Session Handoff

## Session

Website 3, Session 2 content lane. Xenios Research product catalog content, goal pages,
and the all-Guide evidence factory. No runtime code was written in this lane.

## Master-pack root

`C:\Users\sboad\OneDrive\Desktop\XENIOS_RESEARCH_FINAL_MASTER_IMPLEMENTATION_PACK_V1`
(27 files). All six required documents were read in full: `00_START_HERE.md`,
`01_XENIOS_RESEARCH_FINAL_CANONICAL_MASTER_PRODUCT_SPEC_V1.md`,
`02_ROUND_10_FINAL_FOUNDER_DECISIONS_V11.md`, `23_OFFICIAL_SOURCE_REGISTRY.md`,
`24_SUPPLEMENT_CANDIDATE_CATALOG_UP_TO_50.md`,
`25_ALL_PEPTIDE_AND_BLEND_GUIDE_PRODUCTION_PLAN.md`. Also read
`12_CLAUDE_CONTENT_GUIDES_EVIDENCE_ENGINE_MEGA_PROMPT.md`.

## Repository root

`C:\Users\sboad\Downloads\xenios-website`, remote `teamxenios/xenios-website`.

## Base origin/main SHA

Started on `468466f5088692a68a769bf76ea13bcca1c91866`.
**Rebased onto `87150f488c68576c6fec5f49a4957f3d122eca01`** after PR #25 merged.
The rebase was conflict-free because every path in this lane is greenfield.

## Branch

`claude/research-product-guide-content-now`

## Worktree

`C:\Users\sboad\Downloads\wt-research-product-guide-content-now` (clean)

## Head SHA

See the branch tip on origin. Five commits ahead of `87150f4`.

## Remote branch pushed

Yes. Force-pushed after the rebase with `--force-with-lease`.

## Pull request opened

Draft PR targeting `main`, opened only after PR #25 and PR #26 both merged and this
branch was rebased, per the agreed sequence. Not merged.

## Files read

The master pack documents above, plus the repository tree on `origin/main`, both
`CLAUDE.md` files, and the live GitHub state of PR #25, #26, and #28.

## Files created

170 markdown files, approximately 3.07 MB, in four trees:

- `docs/research-content/` (8): CONTENT_ARCHITECTURE, PRODUCT_CONTENT_SCHEMA,
  GUIDE_CONTENT_SCHEMA, CLAIM_EVIDENCE_SCHEMA, EDITORIAL_WORKFLOW,
  CONTENT_STATUS_BOARD, OPEN_RESEARCH_GAPS, VALIDATION_REPORT.
- `content/research-products/` (16): all 15 product records P001 to P015, plus README.
- `content/research-products/supplement-candidates/` (5): up to 50 Momentous and
  Pure Encapsulations candidate records.
- `content/research-goals/` (14): all 11 goals, the two Intimacy and Vitality
  companion pages, plus README.
- `content/research-guides/member-faq/` (13): the member education FAQ library.
- `content/research-guides/individual/` (114 files across 14 of 20 folders).
- `content/research-guides/blends/` (0 of 6 folders).

## Sources used

FDA (approvals, warning letters, compounding bulks decisions), ClinicalTrials.gov,
PubMed-indexed systematic reviews and human trials, primary preclinical literature,
WADA prohibited list where relevant, and official brand pages for supplement facts only.
Retailer blogs, vendor pages, and forums were excluded as scientific evidence by rule.

## Unresolved issues

1. **Guide packets are incomplete.** 11 of 26 packets are complete. 3 are partial
   (mots-c 4 of 9, nad-plus 7 of 9, slu-pp-332 4 of 9). 6 individual and all 6 blend
   packets are not started. This stopped on a platform session limit, not a content
   decision.
2. **Salvaged research is available.** Web-verified research records for 13 compounds
   were recovered from the interrupted run so the remainder can be drafted without
   repeating research. They are not in the repository; they are session artifacts.
3. **No citation has been human-verified.** The automated cross-check proves only that
   nothing was cited that its packet does not also register.
4. **Every supplier fact is unconfirmed**, including KLOW's ingredient set, which was
   deliberately not guessed.

## Validation

See `VALIDATION_REPORT.md`. Summary: zero real dosing violations, zero em dashes, zero
orphan citations, zero authorization overreach, zero blanket safety claims. Raw regex
hit counts are high because prohibited-claims tables quote forbidden phrasing in order
to ban it; every hit was adjudicated in context.

## Production changes made

None. No runtime file was touched. No SQL was run. No secret, flag, DNS, provider, or
deployment setting was changed. Nothing was merged.

## Production changes not made

No edits to `client/`, `server/`, `shared/`, `supabase/`, `package.json`,
`package-lock.json`, `.env*`, or `render*`. No commerce enablement. No Guide publication.

## Conflicts avoided with PR #25 and PR #26

Structurally impossible rather than merely avoided. PR #25 touched `server/`, `client/`,
`shared/`, `docs/`, `supabase/`, `vitest.config.ts`, `.env.example`, and the package
files. PR #26 touched `.env.example` and `server/supabase.ts`. This lane's four trees
did not exist on `main` at all. A path-overlap check returned zero before any file was
written, and the post-merge rebase confirmed it with zero conflicts.

## Rebase instructions

Already rebased onto `87150f4`. If `main` advances again:

```powershell
git -C C:\Users\sboad\Downloads\wt-research-product-guide-content-now fetch origin --prune
git -C C:\Users\sboad\Downloads\wt-research-product-guide-content-now rebase origin/main
git -C C:\Users\sboad\Downloads\wt-research-product-guide-content-now push --force-with-lease origin claude/research-product-guide-content-now
```

Conflicts remain unlikely while no other lane writes into these four trees. Session 1
(paperwork factory) confirmed it claims only `docs/research-legal/**` and
`docs/research-operations/document-control/**`, which are disjoint.

## Samuel approvals required

1. **Nothing here may publish.** Every file is an AI draft at workflow state `draft`.
2. **Independent human verification of every citation** before any Guide publishes.
3. **Counsel review** of regulatory status statements and prohibited-claims lists.
4. **Written reseller authorization** from Momentous and Pure Encapsulations before any
   supplement record moves past candidate. Every record reads NOT AUTHORIZED today.
5. **Supplier answers** for composition, ratio, concentration, format, shelf life,
   storage, COA, purity, and sterility. All are NOT CONFIRMED, by design.
6. **Commerce approval** before any product record's commerce state changes. Peptide and
   Quantum commerce are blocked.
7. **A decision on completing the remaining 15 Guide packets**, which need roughly one
   more uninterrupted run.
