# RESOURCE HUB SLICE 1 — RH-B28 CLOSEOUT HANDOFF (exact SHA)

Task `RECRUITER-RESOURCE-HUB-V1-20260906` · session `fable-recruiter-resource-hub-20260906`
· branch `fable/recruiter-resource-hub-20260906` · merge base with live `ff3c496…`: `096d70c`.

**PRODUCTION WAS NOT MUTATED.** No deployment, no migration apply, no flag, no merge, no
customer message. The live account/partner release stays at `ff3c4962…`.

## New candidate

- Code SHA: `b1b41c8084cbcf1b3b477fa47462862d6a71b509` · tree: `15df3adf3f4c56d4a753464caf6e3addff9a3ea4`
- Parent: `b28a3e3cd809724fd70b2ec3006db6e36c76b253` (B's reviewed candidate)
- Records-only successor: the continuity commit after it.
- Selective change manifest vs ff3: `docs/resource-hub/SELECTIVE_INTEGRATION_MANIFEST.md`
  (one overlap: `portal-production.ts`, comment only; keep ff3's file).

## RH-B28-1 — unsupported object streams (failing before, passing after)

B's exact probe, verbatim input, run through the same loader:
- before (verbatim `service.ts` from b28): `{"validation":{"ok":true,"reasons":[]},"scan":{"opaqueStreams":0,"truncated":false}}`
- after (handoff SHA): `{"validation":{"ok":false,"reasons":["PDF has 1 object stream(s) with an encoding this scanner does not read (only a single FlateDecode filter without decode parameters is inspected)"]},"scan":{"opaqueStreams":0,"unsupportedStreams":1,"truncated":false}}`
Regressions in `server/research/resource-hub/service.test.ts` ("RH-B28-1" describe): B's probe,
thirteen filter/chain/predictor/malformed cases, corrupt Flate, stream-count exhaustion
(20 001 streams → truncated → refused), image/font streams still left alone. Real PDFs:
483/494 accepted, 11 policy refusals (unchanged).

## RH-B28-2 — delayed download transition matrix

`client/src/research/resource-hub/principal-bound.ts` + `partner-download-principal.test.tsx`
(partner) and `admin-principal-isolation.test.tsx` (admin previews/actions):

| Case | Partner download | Admin preview / action |
| --- | --- | --- |
| A → signed out before bytes arrive | aborted, nothing saved, no alert | no save, no outcome |
| A → B before bytes arrive | aborted, nothing saved, B's library loaded with B's token | no save; B's list untouched |
| unmount before completion | aborted, nothing saved, no state write | no save |
| older completes after newer (same surface) | older discarded, newer saves once | (generation per row/form) |
| stale failure after switch | no error shown to B | no error for B |
| current-account completion | saves exactly once, URL revoked | saves exactly once |
| same-account token refresh mid-flight | still saves for that account | keeps the operator's work, reloads with the new token |

## RH-B28-3 — synchronous principal isolation

`ResourceHubAdminForPrincipal` keys the body by principal (JWT subject or token). Tests assert
the FIRST render after A→B (no A metadata, no outcome), A→null, denied B, a stale A list
completion arriving after B, A's unsaved form and outcome gone after switch, overlapping loads
(older cannot replace newer), and a same-account refresh keeping the form.

## Rendered logout / account-switch browser journey

Harness with `PREVIEW_DOWNLOAD_DELAY_MS=6000`; every step through the page's own controls (member
sign-in form, partner sub-nav link, account portal **Sign out**, admin sign-in form, admin shell
**Sign out**); save side effects counted by pre-document hooks. 18/18:
A signs in → reads the rep-only item → starts a delayed download → in-app route change (card
unmounts) → no save; second delayed download → account portal → rendered Sign out → session gone →
no save; signed-out library shows nothing; B signs in → sees only B-authorized items → B's own
download saves exactly once → B's next in-flight download does not save after B signs out and A
signs in; admin signs in → delayed preview → rendered Sign out → no metadata, no save; non-admin
on the admin page → denied, no metadata; admin's current-session preview saves exactly once; no
console errors. Record: `rendered-journey/rendered-journey.json` + screenshots;
narrative: `browser-journey-journal.md` (2026-09-07, supersedes the 2026-09-06 journal).

## Locked-gate Resources reachability (measured, unchanged)

Harness under `PREVIEW_LOCK_GATE=1`: partner library and delivery doors → 401 "Access
required." for a signed-in member; `/partner/me`, `/partner/dashboard` → 200 (admitted);
admin doors → 200 (outside the wall). Dependency: admit `/partner/resources` and the
download pattern in `server/research/index.ts` (`MEMBER_SESSION_READ_PATHS` /
`downstreamMemberGuardedDownload`) — a bounded wall change for its owner to approve; not
made here. Evidence: `locked-gate-probe.json`, `locked-gate-partner-resources.png`.

## Build / typecheck / tests

- `npx tsc --noEmit -p tsconfig.json`: clean. `npm run build`: clean.
- Focused vitest, 19 files: 550 passed, 1 skipped (includes the three new resource-hub client suites: principal-bound 9, partner-download-principal 8, admin-principal-isolation 10). API proof on this SHA: 56/56. Nine-width sweep on this SHA: see the inventory.
- No test deleted, skipped or loosened; the pre-existing single skip is unrelated.

## Evidence inventory (immutable, bound to SHA/tree/harness/build)

`C:\Users\sboad\projects\xenios-qa-evidence-resource-hub-20260906\EVIDENCE_INVENTORY.json`
(and `inventory-<sha12>.json`): candidate SHA/tree, harness blob + sha256, served asset
hashes, B's probe before/after, artifact sha256 list, commands. Artifacts: `api-proof-journal.json`
(re-run on the handoff SHA), `width-sweep-journal.json` + `screens/`, `scanner-real-pdfs.json`,
`rendered-journey/` (json + screenshots), `locked-gate-probe.json`, `browser-journey-journal.md`.

## Limitations (unchanged or new)

- The scanner is a first-line filter, not a sandbox; unsupported encodings are refused, not decoded.
- Under the locked review gate the partner resource doors are unreachable until the wall change above.
- Same-account token refresh on the partner page keeps cards mounted only while the library reloads for the same principal; a refresh that also changes the subject is an account change.
- The preview harness uses synthetic identities and an in-memory hub; it is not production authentication proof.

## Needs from others

- B: independent review of the corrected source and this evidence.
- A: record the lease; selective integration plan per the manifest (no wholesale merge); the wall admission decision.
