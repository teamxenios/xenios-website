[FABLE RELEASE SUPPORT HANDOFF]

**Actual time / timezone:** 2026-09-07, 2:52 PM America/Chicago (session began this window at 2:32 PM).

**Task and exact ownership:** Priority A from the 2:30 PM blitz — one reproduced
release-blocking defect, fixed in the paths I already lease
(`server/research/resource-hub/**`). I touched no file owned by A or B. B's branch has
moved to `a01289d` (partner payouts, order/commission isolation); A's branch is unchanged
at `3351eb34`. Neither has touched the Resource Hub.

**Source base / integrated candidate:** parent `b1b41c8084cbcf1b3b477fa47462862d6a71b509`
(records successor `f41bff55…`), branch `fable/recruiter-resource-hub-20260906`, merge base
with the live account baseline `ff3c4962…` is `096d70c`. I did not receive a frozen
integrated SHA from A before this deliverable; the question is in the message sent to A at
19:37 UTC.

**Your full commit SHA / tree:** `f14735350c5262af574f19571daa6c13291162db`, tree
`606a5528502cb91641561e42bb9c03aa3d978741`. Pushed. Working tree clean.

**Changed files:** two, both mine.
- `server/research/resource-hub/service.ts` (the `inflatedPdfStreams` tokenizer plus one new
  `isPdfTokenBoundary` helper)
- `server/research/resource-hub/service.test.ts` (new describe block `RH-B28-1b`, 7 tests)

**First failing reproduction:** an adversarial verification pass over `b1b41c80` found, and
three independent agents reproduced, this: `inflatedPdfStreams` tokenized `stream` /
`endstream` over the raw bytes with no lexing state, unlike the marker scan which strips
string literals. Any six-byte `stream` occurrence not preceded by `end` was taken as a
stream start; the `endstream` search then landed on the NEXT object's `endstream` and the
cursor advanced past it. So this file was accepted (`ok:true`) although the identical object
stream without the first line is refused:

```
%PDF-1.5
1 0 obj << /Note (stream ) >> endobj
2 0 obj << /Type /ObjStm /N 1 /First 0 /Filter /FlateDecode /Length N >>
stream
<deflate("1 0 << /Type /Action /S /JavaScript /JS (app.alert(1)) >>")>
endstream
endobj
%%EOF
```

Before the fix: 4 of the 7 new tests fail (`expected true to be false` on the literal decoy,
the comment decoy, the nested/escaped decoy, and `expected '' to match /not fully examined/`
on the missing-endstream case). After the fix: 49/49 in that file.

**What the fix changed:** the scanner makes one position-preserving lexing pass instead of a
raw `indexOf` walk. A string literal is consumed as data (nesting and backslash escapes per
the PDF grammar) and never searched for keywords; a comment runs to end of line; `stream`
counts only on a token boundary and not as the tail of `endstream`; stream data is skipped
wholesale so a literal inside binary data cannot reopen lexing; a stream's dictionary is read
from its own preceding `obj` with literals blanked, so `(/ObjStm)` cannot pose as structure.
Three conditions now fail closed as an unexamined file (which the validator already refuses):
an unterminated string literal, a `stream` keyword not followed by CRLF/LF, and a stream with
no `endstream`. Nothing else in the hub changed; the RH-B28-2 and RH-B28-3 fixes are untouched.

**Focused test commands / results** (worktree `C:\Users\sboad\projects\xenios-resource-hub-20260906`,
Node 24.14.1 via the repo's own `npx`, no package changes):
- `npx vitest run server/research/resource-hub/service.test.ts` → 49 passed.
- `npx vitest run` over the 19 focused files (resource-hub, partner portal routes + service,
  core-site protection, release control plane, the three resource-hub client suites,
  ResourceHubAdmin, partner Resources, admin-shell, routes-parity, research walls / frontdoor
  / capabilities / account-access) → **557 passed, 1 pre-existing skip**.
- `npx tsc --noEmit -p tsconfig.json` → clean.
- B's exact ASCIIHexDecode probe (`scratchpad/b28-probe.mts`, verbatim input) → still refused:
  `unsupportedStreams: 1`, `ok:false`.
- 494 real PDFs from the founder's Downloads folder → **483 accepted / 11 policy refusals,
  unchanged from before this fix**; 12/12 synthetic controls (8 negative, 4 benign positive).
  Journal: `scanner-real-pdfs.json`.

**Browser scenarios / failures / limitations:** none run for this change — it is a pure
server-side byte scanner with no rendered surface. The rendered-controls journey (18/18) and
nine-width sweep (45/45) from the b1 candidate still apply to the client code, which this
commit does not touch. Limitation restated: this is a first-line filter, not malware
certification; unsupported encodings are refused, not decoded; no hostile fixture was opened
in a real viewer.

**Database rehearsal scope, if any:** none. No migration applied, no database touched.

**Served build and evidence identities:** no rebuild was needed (server-only change, no
client asset). Evidence folder
`C:\Users\sboad\projects\xenios-qa-evidence-resource-hub-20260906\` still carries
`EVIDENCE_INVENTORY.json` / `inventory-b1b41c8084cb.json` bound to the parent candidate; the
scanner journal `scanner-real-pdfs.json` was regenerated on this tree (2026-09-07T19:35:25Z).

**Independent reviewer / status:** none yet, and I do not self-accept. Messages requesting
review went to A (`codex-seth-revenue-launch-20260905`) and B (`codex-seth-astra-b-20260905`)
through the continuity OS at 19:37 UTC; the message files are in `.xenios/messages/`.

**Integration instructions and dependencies:** apply only this delta on top of the accepted
runtime; the selective manifest in `docs/resource-hub/SELECTIVE_INTEGRATION_MANIFEST.md`
still holds (the one overlap with `ff3c4962` is `portal-production.ts`, comment only — keep
ff3's file). This commit adds no route, no dependency and no protected-file change, so the
seam hash and route census pins are unaffected by it.

**Required post-integration gates:** on the combined tree, re-run the resource-hub suites,
recompute the protected-seam hash and re-measure the route census (both change with whatever
else is integrated, not with this commit).

**Owned processes and cleanup:** none running. The preview harnesses on ports 5231/5232/5233
and every headless Chromium I started are stopped; `scratch-verify/` from the verification
agents is removed. The kit slice I had begun before this window (Slice 3 groundwork, not part
of this release) is parked OUTSIDE the checkout at
`C:\Users\sboad\projects\fable-kits-parked-20260907\` — four files, nothing deleted, nothing
staged.

**Remaining blocker and next exact action:** no blocker on this fix. Waiting on A for the
current integrated SHA, its freeze state, and my next assignment. Unchanged dependency from
the b1 handoff: under the intended locked review gate, `server/research/index.ts` admits
`/partner/me` and `/partner/dashboard` but not `/partner/resources` or its download, so
ordinary partner access to the library stays blocked until that bounded admission is made by
that file's owner. The founder's new code package assigns exactly that slice to A (and the
affiliate QR slice to B); it touches `server/research/index.ts`, `client/src/research/layout.tsx`
and the safe-`returnTo` list, none of which I own or have touched.

**Can A/B continue without Fable? Explain the saved state:** yes. The fix is committed and
pushed; the reproduction lives as seven tests in the repository rather than in my memory; the
evidence journals are on disk; both coordination messages are written to `.xenios/messages/`;
no background watcher holds an unrecorded result.

**Production mutated by Fable: NO**
