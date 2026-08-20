# HANDOFF — iOS auto-zoom (#5) and raw enum family headers (#8)

Session `claude-fable-storefront`, second lane. Both items assigned to this
lane by the lead's adjudication
`.xenios/messages/2026-08-20T16-00-00-000Z-QA-FINDINGS-ADJUDICATED-claude-fable-desktop.md`.

## BASE SHA

`cf649c10f8a9129b9d425430f4dcbc5f37367917` (integration head at claim time)

## BRANCH

`lane/storefront-mobile-a11y-20260820` — pushed to `origin`.

## COMMIT SHA

**`0e4b75950fa36c5e5b31123a3d4dd9ca593422df`** (branch head, pushed)

One commit. Nothing mounted, no route, no migration, no production mutation.

## FILES CHANGED

```
client/src/research/assisted-order/assisted-order.css        (the live fix)
client/src/research/assisted-order/AssistedOrderPage.tsx     (2 render sites)
client/src/research/assisted-order/family-label.ts           (new)
client/src/research/assisted-order/family-label.test.ts      (new)
client/src/mobile-input-zoom.test.ts                         (new, repo-wide guard)
client/src/index.css                                         (.cs-fld-input 14px -> 16px)
client/src/research/early-access/roadmap/peptide-roadmap-catalog.css
```

No lead-owned seam touched. `api.ts` and `wizard-state.ts` deliberately
untouched — they carry finding #6, which you routed to the assisted-order lane.

## WHAT WAS ACTUALLY WRONG

**#5.** `.xenios-order-page label` sets `.9rem` (14.4px) and the controls used
`font: inherit`, so every field of the order form inherited 14.4px. iOS Safari
zooms the page when a focused text control is under 16px and does not zoom
back, so a customer tapping Email lost the layout and had to pinch back out on
each subsequent field, mid-checkout.

Fixed by pinning `font-size: 16px` on the controls and inheriting only
family/weight/line-height. **Not** re-folded into the `font:` shorthand — the
shorthand resets font-size, which is exactly how this shipped.

**#8.** The assisted-order catalog carries `family` as the raw Product Control
slug (`production-catalog.ts` sets `family: offering.family`). Both the card
eyebrow and the family picker rendered it verbatim, and `.xenios-order-eyebrow`
is `text-transform: uppercase`, so the customer read
`CLINICAL_FORMULATIONS_503A` while choosing what to order.

Fixed by labelling through the canonical `MASTER_OFFERING_FAMILY_LABELS`, so
the order form, the member catalog and the public storefront agree. The option
VALUE is still the exact server slug the query filters on.

## THE GUARD FOUND WHAT I WOULD HAVE MISSED

`client/src/mobile-input-zoom.test.ts` reads every stylesheet and fails on any
text control under 16px, or any that takes its size from the `font:` shorthand.
jsdom cannot catch this class of bug: no layout engine, no cross-sheet cascade.

Run against the tree it found **two further offenders** beyond the reported one:

| Offender | Live? |
| --- | --- |
| `.xenios-order-page input/select/textarea` (14.4px via inherit) | **YES — the reported, live defect** |
| `.ea-roadmap__controls input/select` (14px via inherit, same bug) | No — `PeptideRoadmapCatalog` is referenced only by its own test, so this surface is prepared but unmounted. Preventative. |
| `.cs-fld-input` (14px) | No — no component renders `.cs-fld-*` today. Preventative. |

It also caught a false positive in its own first detector: `.ra-select-check`
is a checkmark, not a select, and matched only because a hyphen is a word
boundary. The detector now strips class/id tokens before looking for an element
selector, and that case is pinned as a test so the detector cannot silently
regress into forcing a threshold onto elements that cannot zoom.

## TESTS

```powershell
npx vitest run client/src
npm run check
```

- `npm run check` (tsc): clean.
- **Full client suite: 187 files, 1794 tests, all passed.** Note this run
  included `kris-launch-a/access-presentation.test.tsx`, which passed — the
  known flake S6 reported did not reproduce here.
- Focused: `client/src/research/assisted-order` +
  `client/src/mobile-input-zoom.test.ts` + `client/src/components/PageShell.test.tsx`
  — 7 files, 44 tests, green.

Decisive:

- `mobile-input-zoom.test.ts` — no control under 16px anywhere; none takes its
  size from the shorthand; the detector's own true/false cases are pinned.
- `family-label.test.ts` — sweeps the WHOLE closed family vocabulary against
  the canonical labels, and asserts no output ever contains `_` or is entirely
  upper-case, so a raw identifier cannot reach a customer.

## BROWSER VERIFICATION

Real Chromium, against the **actual built stylesheet**
(`dist/public/assets/assisted-order-BF2GZerR.css`), with the real DOM shape
(`label` wrapping the control) so the engine resolved the true cascade:

| Element | Computed font-size | Zooms on iOS |
| --- | --- | --- |
| label | 14.4px | n/a (labels do not zoom) |
| input[type=email] | **16px** | no |
| select | **16px** | no |
| textarea | **16px** | no |

Verdict: no text control zooms; the label's visual size is unchanged, so the
design is preserved and only the fields moved.

**Caveat.** The order form itself could not be driven end to end here: the
route sits behind the client password gate and needs the assisted-order
config/catalog endpoints, and the production server cannot boot in this session
without Supabase service credentials (pre-existing; the committed
`scripts/preview-research.mjs` fails identically). So the measurement above
loads the real built CSS and measures the real cascade, rather than clicking
through the live form. The label-render change (#8) is covered by unit tests,
not by a browser screenshot.

## CONFLICT RISKS

| Risk | Detail |
| --- | --- |
| **MEDIUM** | `AssistedOrderPage.tsx` — I changed two render sites. Finding #6 (member JWT) is routed to the assisted-order lane and lives in `api.ts`. Different files; if that lane also edits this one, take mine for the two `assistedOrderFamilyLabel(...)` call sites. |
| **LOW** | `client/src/index.css` — one font-size on a dead class. |
| **LOW** | `assisted-order.css` — one rule. |
| **NONE** | The two new test files and `family-label.ts` are new paths. |

## SUGGESTION FOR THE LEAD, NOT ACTED ON

`production-catalog.ts` could send a `familyLabel` beside `family`, the way the
master-offerings contract already does, which would remove the need for any
client-side labelling. That crosses into the assisted-order server lane and the
shared contract, so it is left as a note rather than done here.

## STATUS OF MY FIRST LANE

`lane/launch-public-storefront` at `3c7dcc7` is still awaiting integration, and
still carries the one open founder decision (the Gateway CTA reversing
`RESEARCH_HOME_CATALOG_POLICY`). Unchanged by this lane.
