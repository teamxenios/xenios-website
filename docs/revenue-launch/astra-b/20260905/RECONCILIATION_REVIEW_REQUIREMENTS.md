# Reconciliation review requirements: ASTRA-B engineering input

Date: 2026-09-05. Evidence baseline: `1bd9431b0eac6d12a255832fe2f676f07e2a5027`.
Document worktree baseline: `d54cdb9cc0bb935af2864e01171c3b077ad8430f`.
Task: `XENIOS-SETH-ASTRA-B-REVIEW-20260905`.

This is a bounded engineering audit and contract recommendation for ASTRA-A,
which owns the authoritative shared/backend contract. It is not a second
runtime authority, an approved mapping or price book, implementation/readiness
acceptance, supplier confirmation, or permission to publish or deploy.
No reconciliation client implementation starts until ASTRA-A supplies the
canonical contract. The field names below describe requirements, not a new DTO.

## Evidence scope and provenance

The audit used already committed JSON and code, not a fresh supplier or
production observation. These paths are pinned to the evidence baseline above;
their contents were unchanged at the document worktree baseline:

| Repository path | What it supports; limitation |
| --- | --- |
| `docs/revenue-launch/20260905/canonical-reconciliation.json` | 39 source rows, 34 exact historical identity joins, five unresolved mappings, six formulation flags; historical review evidence only. |
| `docs/revenue-launch/20260905/complete-package-canonical-facts.json` | Later recorded canonical facts and the same five unmapped source IDs; not supplier or commerce approval. |
| `docs/revenue-launch/20260905/complete-package-supplier-confirmations.json` | Historical per-unit lookup coverage and absence of current confirmations at the recorded time; not inventory proof. |
| `docs/revenue-launch/20260905/complete-package-source-hashes.json` | Immutable package/source hash references; verified bytes do not approve their contents. |
| `docs/revenue-launch/20260905/COMPLETE_PACKAGE_GATE.md` | Later complete-package verification and its remaining gates; supersedes the earlier missing-package claims. |
| `docs/revenue-launch/20260905/SOURCE_CHECKPOINT.md` | Earlier checkpoint, retained as history rather than current package-verification truth. |
| `config/research/revenue-launch/seth-source-reconciliation-20260905.json` | Unapproved source intake, source/launch IDs, risk flags, null canonical assignments and false approval/activation; initial package metadata is historical. |
| `scripts/revenue-launch/validate_source.py` | Strict source validation, exact identifiers, duplicate rejection, hash verification and non-publishing intake. |
| `scripts/revenue-launch/reconcile_source.py` | Exact historical identity joins and nonactivating review output; no name-based matching. |
| `shared/research/master-offerings/formulation-hold.ts` | Existing reviewed formulation holds and declared-marker handling; not a source approval authority. |
| `server/research/early-access/ops/supplier-confirmation.ts` | Existing supplier evidence, exact unit identity, named confirmation, withdrawal and expiry rules. |

The canonical reconciliation records observation time
`2026-09-05T04:23:27.735991+00:00`. The later supplier report records
`2026-09-05T04:41:46.263961+00:00`. Neither timestamp is refreshed by this audit.
No CSV/workbook contents were analyzed for this document; no tests, network,
credential access, or production actions were performed for this assignment.

## Exact exception inventory

There are **11 issues across 10 distinct source rows**. XRUO-014 has both issues;
do not count it as two products or collapse either issue.

### Five mapping exceptions

All five have `identityEvidence: unresolved` and a null current canonical
identity in the historical reconciliation.

| Source ID | Source product | Exact source configuration |
| --- | --- | --- |
| XRUO-007 | Retatrutide | 60 mg |
| XRUO-014 | CJC-1295 + Ipamorelin | 5 mg with DAC (exact split pending) |
| XRUO-024 | MOTS-C | 40 mg |
| XRUO-026 | Glutathione | 600 mg |
| XRUO-035 | Kisspeptin-10 | 10 mg |

### Six formulation assumptions or unresolved splits

| Source ID | Source product | Exact source configuration |
| --- | --- | --- |
| XRUO-009 | BPC-157 + TB-500 | 10 mg total (5 mg + 5 mg assumed) |
| XRUO-010 | BPC-157 + TB-500 | 20 mg total (10 mg + 10 mg assumed) |
| XRUO-013 | CJC-1295 + Ipamorelin | 10 mg total, No DAC (5 mg + 5 mg assumed) |
| XRUO-014 | CJC-1295 + Ipamorelin | 5 mg with DAC (exact split pending) |
| XRUO-025 | GLOW | 70 mg (BPC-157 10 + TB-500 10 + GHK-Cu 50 assumed) |
| XRUO-039 | KLOW | 80 mg (BPC-157 10 + TB-500 10 + GHK-Cu 50 + KPV 10 assumed) |

Five of these six rows have exact historical IDs reverified; only XRUO-014 is
also unmapped. An exact ID join confirms the recorded relationship, not the
assumed formulation, presentation, inventory, supplier readiness or price.
The source assumptions remain visible even if a canonical display name appears
to specify a component split. Do not erase an assumption by changing its label.

## Required fact separation and lifecycle semantics

ASTRA-A should expose independent evidence facts for identity binding,
formulation, unit of sale and supplier confirmation. A single row-level badge
must not promote every fact because one has evidence. Keep source verification,
proposal review, price approval, activation and release readiness separate.

The normalized evidence vocabulary must be exactly
`UNKNOWN | PENDING | CONFIRMED | EXPIRED | REJECTED`, with these meanings:

| State | Admissible meaning | Required UI treatment |
| --- | --- | --- |
| UNKNOWN | No admissible evidence for this fact, an unavailable observation, or insufficient identity/lineage. | Show `Unknown` plus an explicit reason such as `Not checked`, `No current confirmation observed`, or `Evidence unavailable`; never a green completion state. |
| PENDING | A recorded review/confirmation request exists for this exact fact and revision, with no completed disposition. | Show `Pending` and the request reference/time when supplied. A risk flag alone is not proof that a request was made. |
| CONFIRMED | The canonical authority supplies evidence that confirms this particular fact for this exact identity/source revision and applicable validity window. | Show `Confirmed` with fact scope, evidence reference and observation/review time. Never translate this into `Approved price`, `Available`, `Buy now`, or `Launch ready`. |
| EXPIRED | Previously confirmed evidence has reached its documented validity end. | Show `Expired` and the expiry time; retain the historical evidence without treating it as currently usable. Do not invent a validity period. |
| REJECTED | An authorized reviewer explicitly rejected this fact/proposal, with a recorded reason and revision. | Show `Rejected` with the safe reason and review provenance. Null, HTTP failure, missing mapping and withdrawal alone are not rejection events. |

These are evidence states, not a replacement for existing product, price,
supplier or order lifecycle enums. ASTRA-A defines the exhaustive mapping from
its canonical raw facts. ASTRA-B consumes that shared contract and does not
maintain a second server-state normalizer. Unknown enum values, malformed
timestamps or invalid evidence combinations render unavailable/unknown with an
appropriate error reason; never silently become confirmed or pending.

Temporal expiry and source-revision mismatch are distinct. A source change
must make prior evidence inapplicable, but is not itself proof of time expiry.
Unless the canonical contract explicitly defines otherwise, the current fact
becomes UNKNOWN with a stale-revision reason, while the old reviewed event
remains historical. Only new admissible evidence restores confirmation.

The five unresolved bindings have no basis for confirmation. The six
formulation flags mean confirmation is required: project UNKNOWN with that
reason unless ASTRA-A supplies an actual pending-review event. Do not manufacture
review actors, requests, timestamps, reasons or decisions when seeding a view.

## Independently verified facts versus proposals

Independently verified here means the committed artifacts/code were inspected
and support the stated counts, exact joins and limitations. It does not mean
an independent supplier attested the source content.

Keep at least three distinguishable layers in the eventual review projection:

1. Source assertion: what the pinned input says, including every assumption.
2. Proposal: a suggested mapping or value, visibly unapproved, with no effect on
   the active canonical identity, prices or holds.
3. Authoritative evidence/decision: a separately identifiable record from the
   owning system, with scope, actor and revision where actually available.

Byte verification, workbook/source agreement, an existing catalog SKU, a
successful request, and passing software tests cannot substitute for layer 3.
Historical `source_workbook_unverified` blockers are superseded only by the
later documented package-verification evidence; this does not supersede
formulation, supplier, approval or release blockers. Do not rewrite the original
historical report to disguise that distinction.

## Immutable lineage requirements for ASTRA-A's contract

Each decision must resolve to an immutable evidence record, rather than only a
mutable source ID, descriptive name or boolean. Requirements include:

- Contract/schema version and evidence ID; original source package revision,
  package/manifest/file hashes, source ID and launch item ID.
- Exact source location, such as JSON pointer or recorded row reference, plus
  a deterministic row-content digest with an explicitly defined serialization.
- Exact canonical product ID, variant ID and SKU when bound; preserve nulls
  when unknown. Proposed bindings must not overwrite accepted bindings.
- Evidence type and fact scope; referenced artifact/digest; observation time;
  actual review request/decision ID, reviewer and review time when present.
- Applicable validity boundary, reason code and superseded-evidence reference;
  retain prior decisions and rejected proposals instead of mutating history.
- Explicit applicability to the current source and canonical identity revision.
  Reusing a source ID after its configuration changes cannot preserve approval.

Evidence URLs/references exposed to clients must be authorized, allowlisted and
safe. Do not copy private supplier contacts, cost/margin fields, credentials,
clinical information, customer data or raw source notes into the DTO, fixtures
or client bundle. A missing field stays unknown/null, not a fabricated value.

## Exact matching and fail-closed controls

The current reconciliation joins a historical source ID to exact product ID,
variant ID, matching parent product ID and SKU. It rejects ambiguous historical
source bindings. Preserve this rule: no fuzzy name matching, nearest strength,
synonyms, punctuation-based fallback or silent candidate selection. In
particular, No DAC and with DAC must never become interchangeable.

Two hardening requirements belong to ASTRA-A's authoritative implementation,
not to an ASTRA-B workaround: reject duplicate canonical IDs before constructing
lookup maps (the current dict construction can overwrite them), and bind a
review to the source-row digest/revision rather than source ID alone. Existing
source validation rejects duplicate source IDs and duplicate JSON keys; do not
bypass that validation with a separate client ingestion path.

Future contract and UI verification must include these negative controls;
they are recommendations, not test results from this document:

- Missing/duplicate source or canonical IDs, wrong parent/SKU, multiple candidate
  bindings and changed row hashes never yield a confirmed exact mapping.
- The XRUO-014 overlap remains two issues on one row; partial response coverage
  or zero rows cannot be presented as a complete successful review.
- Missing evidence, unknown enums, malformed times, expired evidence, explicit
  rejection and read failure fail closed without false completion.
- Five reverified formulation-row bindings do not clear the six formulation
  flags; source display-copy normalization does not change authority.
- Nonempty placeholders such as `Form not stated` remain unknown facts, not
  validated unit-of-sale data; presentation/shipping evidence stays separate.
- An unauthorized user obtains no review projection or evidence. Retain the
  existing canonical admin guard and private-field boundaries.
- No UI status, proposal, local fixture, source price, browser total or client
  clock can approve, publish, activate, change price or grant purchase rights.

## Supplier truth and first-slice boundary

The committed per-unit supplier report has 34 successful lookups, zero current
confirmations, and five unmapped rows not checked. `ok: true` attests the lookup,
not availability. The existing live-only reader filters active/unexpired
records, so a null result cannot identify whether history is unknown, expired,
withdrawn or rejected. Do not infer any supplier fact from absence alone.

Reuse the canonical supplier model's exact identity, named confirmation,
evidence reference, withdrawal and expiry semantics. A stale historical record
cannot become active because a panel is opened. Even a genuinely current
supplier confirmation is not by itself inventory, price, documentation,
payment, release or purchasability approval.

This assignment changes this document only under the approved ASTRA-B evidence
carve-out. ASTRA-A retains shared/backend types, source scripts/config, supplier
and price authority, migrations, release gates and canonical corpus integration.
No client implementation, extra endpoint, save/approve action, replacement
catalog, source import or runtime state store is introduced here. Await ASTRA-A's
canonical contract before implementing the reconciliation view. Existing
price-review work elsewhere is not accepted or rejected by this audit.
