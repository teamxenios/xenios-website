# Lane 13 state report: the education library and the neuroscience classification

Branch: `claude/f5/education-neuroscience-library`
Date: 2026-08-01

This is a state report. It says what the two libraries hold, what is verified, and
what is not. Nothing below is a projection or a target.

## Sources

| Source | Sheet | Sheet rows | Data rows imported |
| --- | --- | --- | --- |
| `XENIOS_RESEARCH_COMPLETE_MASTER_2026-08-01_V3.xlsx` (sha256 `e2f7a8e1a59fbda8e01af1fc090112b8b51cc20bf30a890bab53c1d38dbc7f47`) | `43 Education Exercise` | 103 | 100 (EX-0001 to EX-0100) |
| same | `44 Neuroscience Map` | 123 | 120 (NEU-0001 to NEU-0120) |
| `13_EDUCATION_EXERCISE_AND_LEARNING_LIBRARY_2026-08-01_v2.xlsx` | `Approval Matrix` | 13 | 10 (ED-AP-001 to ED-AP-010) |
| `14_SCIENTIFICSEAN_NEUROSCIENCE_AND_COMPOUND_CLASSIFICATION_2026-08-01_v2.xlsx` | `ScientificSean Categories` | 22 | 19 |
| same | `ScientificSean Vendors` | 14 | 11 |

Sheet rows include a title banner, a scope sentence, and a header row, which is why
the imported count is three lower in each case.

## A. Education library

100 records, all imported from the production tracker exactly as it stands.

| State | Count |
| --- | --- |
| Total records | 100 |
| DRAFT | 100 |
| IN_REVIEW / APPROVED / PUBLISHED / WITHDRAWN | 0 |
| With a recorded professional review | 0 |
| With a transcript | 0 |
| With an image or video reference | 0 |
| Publishable today | 0 |
| Carrying sensitive subject matter | 0 |

Every record carries the same five blockers, one hundred times each:

`MISSING_AUDIENCE`, `MISSING_TRANSCRIPT`, `MISSING_MEDIA`, `MISSING_REVIEW_DATE`,
`MISSING_REQUIRED_REVIEW`.

Why zero reviews: the workbook's reviewer column reads "Professional reviewer
pending" on all 100 rows. That is a placeholder, and `isRealValue` in the shared
contract rejects it, so it can never satisfy a review requirement. The same
applies to "Video needed", "Transcript needed", "Tags needed", and "Script draft".

Afam Maduka is the named author on all 100 rows, transcribed from the author
column. No review by him or by anyone else is recorded anywhere in this build.

Why zero audiences: the workbook assigns no per record audience. The library level
scope sentence is kept verbatim as `LIBRARY_SCOPE_STATEMENT`, and no per record
value was derived from it.

### The gate

`evaluatePublication` and `publishEducationRecord` in
`shared/research/education/library.ts` enforce that content involving injury,
surgery, pain, a neurological limitation, or rehabilitation cannot publish until
the matching professional review is recorded. `PublishedEducationRecord` carries a
unique symbol brand attached only inside `publishEducationRecord`, so a published
record cannot be constructed by hand.

Requirements are transcribed from approval matrix rows ED-AP-001 to ED-AP-010 and
each carries its matrix row id.

## B. Neuroscience classification

120 records, classified into the eight operating classes by an ordered rule set
that fails closed.

| Operating class | Count |
| --- | --- |
| education | 1 |
| consumer_wellness | 0 |
| authorized_supplement | 32 |
| research_material | 53 |
| professional_assessment | 2 |
| clinician_supervised_service | 6 |
| prescription_required_pathway | 16 |
| investigational_held | 10 |

| Surface | Count |
| --- | --- |
| research (display only) | 85 |
| care | 24 |
| education | 1 |
| internal_only | 10 |

| Rule | Rows decided |
| --- | --- |
| NEU-RULE-01-HELD | 5 |
| NEU-RULE-02-PRESCRIPTION | 16 |
| NEU-RULE-03-CLINICIAN-SERVICE | 6 |
| NEU-RULE-04-ASSESSMENT | 2 |
| NEU-RULE-05-RESEARCH | 53 |
| NEU-RULE-06-SUPPLEMENT | 32 |
| NEU-RULE-07-EDUCATION | 1 |
| NEU-RULE-09-FAIL-CLOSED | 5 |

`consumer_wellness` is zero because no row in this sheet resolves to it. Rule 8
exists for rows that state a public wellness lane without an authorized supplement
route; none appear today. The count is reported rather than filled.

### Verification

| State | Count |
| --- | --- |
| Verified rows | 0 |
| Unverified rows | 120 |
| Rows that may present as an offer | 0 |
| Rows exposing an add to cart control | 0 |
| Rows carrying an approved customer amount | 0 |
| Rows carrying a supplier item code | 0 |
| Rows carrying lab documentation | 0 |

Every row imports UNVERIFIED because the sheet carries no verification evidence:
Status is "Review" on all 120 rows and the source context names the discovery
source. Row level verification requires all six inputs, each with a recorded
document: exact product or service, rights to offer, prescriber requirement,
source, approved customer amount, availability.

Scientific Sean is a discovery source. Its categories and vendors are transcribed
only as coverage counts and the review action Xenios owes. No images, labels,
certificates, or product text were copied.

### Routing

`prescription_required_pathway` and `clinician_supervised_service` route to
`CARE_ROUTE_CONTRACTS.publicShell` and never expose an add to cart control,
verified or not. `professional_assessment` routes to Care as well, since it is
delivered by a person. That is 24 of the 120 rows.

The Research surface reuses the existing offer convention
(`resolvePrivateLaneOfferMode`, `describeOfferMode`) rather than inventing a
second one. That resolver pins the global commerce switch to false, so direct
self serve checkout is structurally unreachable here. No second routing
convention was created.

No surface ever renders a zero amount. A record with no approved amount shows
"Not currently available".

## Gaps reported, not filled

1. No professional review exists for any of the 100 exercise records. Production
   of scripts, video, transcripts, and tags is outstanding, and so is a per record
   audience decision. All of it is an editorial and review task, not a code task.
2. No neuroscience row has row level verification. All six inputs are outstanding
   on all 120 rows. Until a row is verified it stays display only.
3. Neither library is mounted on an HTTP route. `server/research/index.ts` is a
   hash pinned seam on this branch, so registering endpoints was out of scope
   here. The modules are the consumable surface for whoever owns that seam.
4. There is no client rendering. This lane is server side plus shared contracts.
5. `investigational_held` holds 10 rows, 5 of which the rules cannot place at all
   (a multi rail row, two bare product review rows, and a jurisdiction status
   row). Those need a human decision, and holding them is the correct state.
