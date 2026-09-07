# Scanner supersession, and what it costs at publish time

Fable, 2026-09-07. Verification of A's integrated candidate
`fa26224bf050d4bac62543d8f9e1ad7f80f2795c` against my own branch head
`f1473535` (the RH-B28-1 scanner repair).

**Conclusion first: A's scanner is correct and mine was not. My RH-B28-1 repair
still had a systematic false-negative class. A's tokenizer closes it. Do not
re-apply my version of `inflatedPdfStreams` / marker scanning over A's.**

## 1. The defect in my own scanner

My scan ran markers over `stripPdfStringLiterals(decodePdfNameEscapes(text))`
applied to the **whole file**, including binary stream bytes. Compressed image
and font data contains stray `(` bytes. Each one opened a "string literal" that
was blanked to the next `)`, so real structure was erased before the markers
were looked for.

Measured on `04_DAYHANA_INTERNAL_XENIOS_PRODUCT_EDUCATION_GUIDE.pdf`:

| Quantity | Value |
| --- | --- |
| Raw bytes | 317,252 |
| Bytes surviving my stripper | 8,323 |
| Bytes blanked | 308,929 (97.4%) |
| `/EmbeddedFiles` present in raw text | yes |
| `/EmbeddedFiles` present after my stripper | **no** |
| My verdict | **accept** |
| A's verdict | refuse — `/EmbeddedFile` |

The catalog really does carry
`/Names << /EmbeddedFiles << /Names [(Content Credentials) 1240 0 R] >> >>`.
My scanner never saw it. A's tokenizer skips stream data as data and reads
dictionaries, so it does.

## 2. Like-for-like on the same 494 real PDFs, measured at the same time

| Tree | Accepted | Refused | Controls |
| --- | --- | --- | --- |
| Mine `f1473535` | 483 | 11 | 12/12 |
| A `fa26224` | 468 | 26 | 12/12 |

A refuses 15 that I accepted. I refuse none that A accepts.

I earlier reported A failing a benign control
("printed text containing /AA and /JS" -> "not fully examined"). **That was my
fixture's fault, not A's code.** The fixture declared `/Length 44` for a
41-byte stream. A fails closed on a stream-length mismatch, which is correct —
length desync is a standard way to hide objects from a parser. Corrected to
`/Length 41`, A accepts it. A is 12/12.

## 3. Every one of the 15 extra refusals is genuine

Verified against the raw bytes, not the scanner's own output:

- **14 files**: raw `/EmbeddedFile` = 1 and raw `/EF` = 1. Real embedded file
  attachments. In every sampled case the attachment is C2PA
  **"Content Credentials"** provenance written by the exporting tool.
- **1 file** (`s41587-026-03019-1.pdf`): `/OpenAction 72 0 R` — an indirect
  reference the scanner cannot resolve. My own control set already asserts
  this shape must be refused ("cannot be judged"). My scanner accepted it
  anyway, via the same stripper defect.

So: 15/15 correct refusals, 0 over-refusals.

## 4. The operational consequence, which is a founder decision

These are not hostile files. They are Samuel's own documents, and under the
integrated scanner **the Resource Hub cannot publish them as written**:

- `01`, `02`, `03`, `04`, `05`, `07`, `08`, `09` `_DAYHANA_INTERNAL_XENIOS_*`
- `XENIOS_COMPLETE_CUSTOMER_CATALOG.pdf`
- `XENIOS_MITCH_OPERATIONS_REVENUE_SHARE_PROPOSAL_4PAGE_*` (3 versions)
- `XENIOS_SETH_90_DAY_OPERATING_ADVISOR_AGREEMENT_V3/V4_10PAGE_*`

Two ways forward. I am not choosing between them, and I have not implemented
either:

1. **Re-export without Content Credentials** (no code change). The attachment
   is added by the exporting tool; printing to PDF or exporting with content
   credentials disabled removes it. Keeps the security rule intact. This is
   the safe default.
2. **A reviewed exception** for a `/Names /EmbeddedFiles` entry whose only
   attachment is C2PA provenance. This loosens a real attack channel and needs
   A's decision plus B's review. It should not be done to make a corpus pass.

Option 1 needs nobody's permission and blocks nothing. Recommend shipping the
scanner as A has it.

### Option 1 is done and proved, not just recommended

`scripts/resource-hub/strip-embedded-attachments.mjs` removes the attachment
and the objects behind it. Unlinking the name tree alone is not enough: an
unreferenced attachment is still written back out and still reads as
`/EmbeddedFile`, so the tool deletes every object reachable from
`/Names /EmbeddedFiles` and from `/AF` on the catalog and on every page. It
never writes over its input.

Run against all 14 refused documents, with the resulting copies then judged by
A's scanner at `33436c5`:

| Check | Result |
| --- | --- |
| Documents processed | 14 |
| `/EmbeddedFile`, `/EF`, `/Filespec` remaining | 0 in all 14 |
| A's scanner before | **refuse 14/14** |
| A's scanner after | **accept 14/14** |
| Pages preserved | 94 of 94 |
| Page content streams | **byte-identical**, all 94 pages, same page sizes |

Nothing a reader sees changed; the sha256 of every decoded page content
stream matches the original. Copies and journals are in the QA evidence
directory under `republishable/` (`strip-journal.jsonl`,
`republish-scanner-verdicts.json`). The originals in `Downloads` are
untouched.

The one remaining refusal, `s41587-026-03019-1.pdf`, is a third-party Nature
paper with an unresolvable `/OpenAction 72 0 R`, not a document the Hub needs
to publish. The tool does not touch `/OpenAction`, deliberately: removing an
action a scanner cannot read is a policy decision, not a cleanup.

## 5. Status of A's tree, as verified

- 11 test files, **243 tests, all passing** in an isolated worktree at
  `fa26224`.
- All 49 of my `service.test.ts` tests kept; A added 7 (56 total). No dropped
  test titles.
- B's original ASCIIHexDecode probe is still correctly refused.

Evidence: `scanner-real-pdfs-A-fa26224.json`,
`scanner-real-pdfs-mine-now.json` in the QA evidence directory.
