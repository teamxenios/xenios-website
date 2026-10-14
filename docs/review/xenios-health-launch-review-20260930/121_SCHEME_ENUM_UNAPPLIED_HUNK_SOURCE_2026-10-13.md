# Revision 20 B: unapplied privacy-safe URL-scheme enum for the accepted driver, source only

**SOURCE-COMPATIBLE as an unapplied one-hunk projection. No correction.** The patch `EXACT_DIFF.patch` (2,029 B
`e3b942fc…`, Core `2e1557ff`, tree `c35327db`) has one hunk whose nine-line preimage occurs exactly once in the
accepted doc 109 driver (40,786 B `b2f0901d…`) at lines 260–268; applying it textually yields 41,303 bytes with sha256
`5c90b077…`, exactly the projected successor named in `BYTE_PROOF.json`, with the prefix and suffix of the file
unchanged. The hunk adds one field, `urlSchemeClass`, to the existing sanitized attachment record inside the existing
64-record cap. The field can take only fourteen fixed values: twelve literals mapped from `observedUrl.protocol` by an
own-property lookup (`HTTP`, `HTTPS`, `WS`, `WSS`, `ABOUT`, `CHROME`, `CHROME_UNTRUSTED`, `CHROME_EXTENSION`,
`DEVTOOLS`, `DATA`, `BLOB`, `FILE`), `OTHER_PROTOCOL` for any other parseable scheme, and `UNPARSEABLE` when the URL
constructor throws. No scheme text, URL, host, origin, path, query, fragment, identifier or stack is emitted; the
existing `urlClass` and `hasQueryOrFragment` logic, the acceptance predicate at lines 275–277, the `Target.closeTarget`
plus `UNEXPECTED_BROWSER_TARGET` refusal at 278–279, the overflow counter and the 19 Chromium arguments are outside
the hunk and unchanged. Source compatibility is not permission to apply, transfer or run it.

Reviewer: this session, `claude-fable-5-1`, revision 20 item B. Read-only; the projection was computed as text, not
parsed, imported or executed. Docs 117–120 unchanged. Archive: `hl12/121_scheme_enum_unapplied_hunk_source.json`.

**Where the bytes are.** Root `DOC119_REVISION20_SCHEME_ENUM_SOURCE_PROPOSAL_20261013/`: `EXACT_DIFF.patch`,
`BYTE_PROOF.json` 750 B `6b13f6ce…`, `PROPOSAL.json` 5,569 B `f8b28a24…`, all byte-identical to the Core blobs under
`doc104-baseline-reconciliation-20261013/target-scheme-telemetry-source-proposal/`. Base: the accepted driver blob
from doc 109 (`b2f0901d…`), the same bytes the diagnostic pinned and ran (doc 120).

## 1. What the hunk changes, and what it cannot leak

The record is built only when `evidence.targetAttachments.length < 64` (line 258, untouched); otherwise the overflow
counter increments (line 274, untouched). Inside the existing `try`, after `new URL(info.url)` succeeds, the new lookup
`Object.hasOwn(schemeClasses, observedUrl.protocol)` selects one of twelve literals or `OTHER_PROTOCOL`; before the
`try`, the field is initialised to `UNPARSEABLE`, so a throwing constructor leaves that value. `observedUrl.protocol`
is never written anywhere; only the selected literal is. `BLOB` reflects the outer scheme only; the inner origin of a
`blob:` URL is not extracted. The URL constructor lower-cases the scheme, so case variants map the same way.
`Object.hasOwn` exists in Node 20. The field name does not occur elsewhere in the base file, so nothing else reads or
depends on it.

## 2. Why it does not change any accepted behaviour

The hunk is confined to the observability block the doc 109 review already accepted as sanitized telemetry. The
diagnostic adapter (`f79528ec…`) copies `driver.evidence.targetAttachments` rows by spread, so the new field would
appear in the diagnostic result and in the runner receipt, still within the 64-record cap and the existing sanitized
shape. The adapter's status logic, the guard, the runner, the parent and the pins are untouched by this proposal.

## 3. Minimal proving, assembly and custody requirements (all still owed)

- **Proving, under a separately valid source-test scope:** for each of the twelve schemes, an unknown parseable
  scheme, a relative URL and a malformed URL, using private canary components in host, path, query and fragment,
  assert that the serialized record contains only the named enum value and the existing booleans and never a canary
  byte; assert `about:blank`, canonical-origin and other-origin classes and the acceptance and refusal paths are
  unchanged; assert the 64-record cap and overflow counter are unchanged. Those synthetic classifier tests are not
  browser evidence and not evidence about the two `OTHER_ORIGIN` service workers.
- **Assembly, mechanically necessary if ever applied:** the runner hard-codes the driver digest `b2f0901d…` in its
  exact-accepted-modules check (runner line 388) and pins row 49 carries the driver path, size and hash; a new driver
  therefore requires a runner successor changing that one literal, new pins rows for the driver and the runner, a
  parent whose self row changes accordingly, fresh output and private-profile names, and a new finite ticket with a
  fresh 2,048 MiB admission. Each of those successors needs my narrow byte comparison before any ticket. The used doc
  117 inputs and the doc 120 archive must never be overwritten; the base driver copy at the diagnostic path stays as
  it is.
- **Custody and scope:** zero application navigation, zero journey credit, actual outer exit timing and an
  independent closure again, and no reading of the result as scheme ownership, cause or benignity. A future run that
  reports, say, `CHROME_EXTENSION` or `HTTPS` for the rejected workers would narrow the question; it would not by
  itself authorize any guard relaxation.
