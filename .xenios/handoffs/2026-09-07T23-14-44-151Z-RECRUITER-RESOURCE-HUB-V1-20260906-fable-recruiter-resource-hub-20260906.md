# Scanner verification, and the founder's documents made publishable

Fable, 2026-09-07. Branch `fable/recruiter-resource-hub-20260906`.
SHA `a39f0c95bc9f6dc1de39d4a91d15ae25298f1e5f`,
tree `d87f26082c0374a39a1cfcf246ea8cfabd7a863d`. Pushed. Tree clean.

## What was verified, and the correction it forced

A integrated my Resource Hub chain and then changed my scanner
(`2e4fa80`). I verified that change rather than assuming it. **A is right and
I was wrong**, so the first thing here is a correction, not a claim.

My RH-B28-1 repair still carried a systematic false negative. The marker scan
ran the string-literal stripper across the whole file, including binary stream
bytes; a stray `(` inside compressed image or font data opened a "literal"
that was blanked to the next `)`. On
`04_DAYHANA_INTERNAL_XENIOS_PRODUCT_EDUCATION_GUIDE.pdf` that erased 308,929
of 317,252 bytes and hid a genuine `/Names /EmbeddedFiles` catalog entry,
which my scanner then accepted. A's tokenizer treats stream data as data and
sees it.

Do not re-apply my version of `inflatedPdfStreams` or my marker scan over A's.

| Tree | Accepted | Refused | Controls |
| --- | --- | --- | --- |
| Mine `f1473535` | 483 | 11 | 12/12 |
| A `fa26224` | 468 | 26 | 12/12 |

Same 494 real PDFs, measured at the same time. A refuses 15 I accepted; I
refuse none A accepts. All 15 checked against the raw bytes: 14 carry a real
`/EmbeddedFile` and `/EF`, one carries `/OpenAction 72 0 R` indirect, a shape
my own controls already require be refused. Zero over-refusals.

I also previously reported A failing a benign control. That was my fixture:
it declared `/Length 44` for a 41-byte stream. Failing closed on length desync
is correct. Corrected, A accepts it and is 12/12.

A's tree: 11 test files, **243 tests passing**, all 49 of my tests kept plus 7
of A's, and B's original ASCIIHexDecode probe still refused.

## The obstacle, and its removal

Correct scanner, real cost: 14 of Samuel's own documents could not be
published, because their exporter attached C2PA Content Credentials.

`scripts/resource-hub/strip-embedded-attachments.mjs` removes the attachment
and the objects behind it, never writing over its input. Unlinking the name
tree is not enough — an unreferenced attachment is still serialized and still
reads as `/EmbeddedFile` — so every object reachable from
`/Names /EmbeddedFiles` and from `/AF` on the catalog and each page is
deleted.

Judged by A's scanner at `33436c5`:

| Check | Result |
| --- | --- |
| Documents | 14 |
| Before | refuse 14/14 |
| After | **accept 14/14** |
| `/EmbeddedFile`, `/EF`, `/Filespec` left | 0 |
| Pages preserved | 94 of 94 |
| Decoded page content streams | byte-identical, all 94 |

Nothing a reader sees changed. Originals untouched; copies and journals in the
QA evidence directory under `republishable/`.

`/OpenAction` is deliberately not touched: removing an action the scanner
cannot resolve is A's policy call, not a cleanup.

## Boundaries kept

- No production deployment, migration, flag or price change, and no merge into
  anyone's release branch. A remains the sole production executor.
- No edit to `server/research/resource-hub/service.ts` or any path A owns. The
  new script is standalone under `scripts/`.
- `vitest.config.ts` deliberately not changed during A's freeze, so adopting
  this cannot force re-qualification. The consequence, stated plainly: the new
  script has no vitest coverage, because the include globs cover
  `server/`, `shared/` and `client/src/` only. Its behaviour is evidenced by
  the 14-document run rather than by a unit test.
- No test removed, skipped, loosened, and no security rule relaxed. The
  scanner is untouched; the documents were changed to meet it.
- Nothing here is a dependency. If A leaves the script out of the RC, nothing
  breaks.

## Open for A

Whether to adopt the script for the Resource Hub content pipeline, and whether
the 14 documents get re-exported this way before publish. Both are A's call.
