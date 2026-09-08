# Approved-name input — replacement proposal (new version, not recovery)

**Status: PROPOSAL. No file has been generated. Nothing here is approved.**
This proposes how a replacement for the missing approved-name corpus would be
produced, by whom, from what, and how it would be approved as **version 2**.
It is not permission to create a substitute to make the gate pass.

## Why a replacement is needed

The 2026-08-29/30 release gate used an approved-name corpus of 6,463 bytes,
SHA-256 `c7da9838a3a8236a1b94465f3bfe21121fcc0de9dc586f8c08e167cf7d9ac34b`,
held outside Git. Its filename, origin and storage location were never
recorded. Bounded searches have exhausted the recorded possibilities: A
searched Downloads (657,316 files) and AppData Temp (113,791); Claude
searched the user profile by exact size; Samuel checked the 293 files
mounted in the chat runtime. None matched. Further filesystem search is not
proposed.

## What the scanner does with the input

`scripts/acceptance/scan-release-diff.mjs` reads the file as **one name per
line** (or TSV, first column), keeps entries longer than three characters
that contain whitespace (full names only), lowercases them, and reports any
added line in the release diff containing one. `verify-release-diff-scan.mjs`
requires the file to exist outside the repository and refuses SKIPPED. A
PASS is therefore scoped to that list and that diff.

## Proposed source material (authorized, documented)

Owner: the privacy-input owner designated by Samuel, working from the
systems of record — never from chat history, screenshots, or Claude's
context. Claude must not see the names.

| Source | What to take | Why |
| --- | --- | --- |
| Supabase project `yvzeduaxbwgcwllhywff`: `research_members`, `research_applications`, `research_partners` | Full legal name of every current and historical member, applicant and partner (`first + last`), via a read-only export run by the owner | The people whose names must never appear in code or docs |
| Team, advisors and named business contacts | Founder, staff, advisors and counterparties named in internal agreements and proposals | Names that appear in internal document titles and could leak into records |
| Support and outbox recipients | Names attached to `research_notification_outbox` and support threads | Appear in fixtures and logs most easily |

Explicit exclusions: no emails, phone numbers, addresses, clinical details or
identifiers (the scanner only matches names); no names invented or padded.
**Do not exclude a real person because their name resembles a synthetic
preview persona** — the personas are fixtures, the people are not; if a real
name collides, keep it and let the scan flag the fixture for review.

## Samuel's conditions on preparation (2026-09-08)

Preparation of version 2 is authorized **through an existing authorized
read-only connection only**, as a replacement input, not recovery. The
operator must first identify themselves and confirm the exact documented
source systems and available name fields — no guessed columns, no unrelated
data. Recorded spellings and relevant variants are preserved as recorded.
Unavailable historical sources and coverage limits are documented; no
equivalence to the unrecovered original is claimed. The resulting file is
approved separately by hash before it qualifies anything. **Claude has no
authorized read-only connection in its current session (the configured
Supabase connector is rejected) and is therefore not the operator.**

## Confirmed source fields (Samuel's read-only schema query, 2026-09-08T03:14Z)

`PRIVACY_INPUT_V2_SCHEMA_ONLY_RECEIPT.json` beside this file — metadata
only, no personal rows selected, read-only transaction. It replaces the
guessed columns in the table above:

| Table | Name fields that exist | Consequence for the operator |
| --- | --- | --- |
| `research_applications` | `first_name`, `last_name` | Primary source of full names |
| `research_members` | `first_name`, `application_id` (FK → applications) — **no `last_name`/`full_name`** | Resolve a member's full name only through its application; a member without one has no full name here |
| `research_partners` | `legal_name`, `member_id` | Check whether `legal_name` is a person or an entity before treating it as a personal name |
| `research_notification_outbox` | `application_id`, `member_id`, `recipient`, `payload` — **no name column** | Resolve through the documented relationships only; do not dump `payload`; do not infer a name from a `recipient` address |

Only the member→application foreign key was returned among the referencing
tables; other links must be validated before coverage is claimed. A must
confirm this mapping through its own authorized connection; the receipt
proves access in Samuel's host, not A's.

## Processing

1. Owner exports the name fields above, trims, keeps each name as recorded
   (Unicode and recorded variants kept; no forced `First Last` restructuring),
   removes exact duplicates case-insensitively, one per line, UTF-8, LF.
   Names without whitespace will not match the scanner's full-name rule; the
   owner records how many entries fall outside it.
2. Owner stores it **outside every Git worktree** at a location they record
   privately (recommended: the same secure folder that holds the Supabase
   service credentials), records byte size and SHA-256, and gives Claude
   only the path (or sets `XENIOS_RELEASE_PII_NAMES_FILE`).
3. The operator returns, without the names: source systems and observation
   time; coverage and exclusions; entry count and deduplication method; byte
   count and SHA-256; confirmation of secure storage; and the limitations of
   the resulting scan (full names containing whitespace, this list, this
   diff).

## Approval as a new version

Samuel approves **version 2** by its SHA-256 and byte count, recorded in the
release records with the coverage statement. The old hash `c7da9838…` is
retired and noted as unrecovered. Only then does the release owner run:

```
node scripts/acceptance/verify-release-diff-scan.mjs \
  --production-base-sha ff3c496245739233b71e46f9e5d6e26af9d57017 \
  --candidate-sha <final candidate> \
  --pii-names-file <outside-repo path>
```

and records the exit status, `secret findings`, `pii findings`, scan scope
and the input's hash — never the input.

## What this does not do

It does not recover the original list; the two may differ in coverage, and
the record will say so. It does not clear the secret-fixture re-bind
(Reviewer packet 1) or the ownership review (Reviewer packet 2), which are
separate.
