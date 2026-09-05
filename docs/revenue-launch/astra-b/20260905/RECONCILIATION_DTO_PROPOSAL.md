# Minimal read-only reconciliation DTO proposal

Date: 2026-09-05. Evidence/code baseline:
`1bd9431b0eac6d12a255832fe2f676f07e2a5027`.
Companion: `RECONCILIATION_REVIEW_REQUIREMENTS.md` in this directory.

Proposed for ASTRA-A review, not an implemented or accepted contract. ASTRA-A
owns `shared/research/revenue-launch.ts`, authoritative backend projection,
runtime validation and route choice. ASTRA-B must consume that final shared
contract rather than implementing these declarations independently. No shared,
server or client code is changed by this proposal.

## Existing authorities to reuse

- `shared/research/required-inputs.ts`: canonical `RequiredInput`, its version,
  states and audit events. Do not copy `enteredValue`, sensitive references or
  the entire audit history into this review response.
- `server/research/required-inputs.ts`: existing required-input reads and state
  authority; the projection must not write or transition required inputs.
- `server/research/products-diagnostics/required-input-application.ts` and
  `product-admin-production.ts`: existing readiness/release decisions. This
  evidence view neither reimplements those gates nor treats their resolved
  `not_applicable`/`superseded` states as confirmed facts.
- `server/research/early-access/ops/supplier-confirmation.ts`: exact-unit,
  named-human, evidence-bound supplier confirmation and expiry/withdrawal rules.
- Pinned source/reconciliation JSON listed in the companion requirements:
  source assertions and historical exact joins, not supplier or price authority.

## Proposed shared TypeScript shape

This is one read response for one immutable source set or an explicitly declared
subset. Initially it can cover the ten Phase A exception rows, with eleven
issues. It contains no prices, approval commands, mutation URLs or readiness
boolean. Fields are readonly and all responses require strict runtime validation.

```ts
type EvidenceState =
  | "UNKNOWN" | "PENDING" | "CONFIRMED" | "EXPIRED" | "REJECTED";

type FactKind =
  | "identity_binding" | "formulation" | "unit_of_sale" | "supplier";

type ExactIdentity = Readonly<{
  productId: string;
  variantId: string;
  sku: string;
}>;

// Only safe references to records the viewer may inspect; never raw evidence.
type EvidenceReference = Readonly<{
  authority: "source_reconciliation" | "required_input" | "supplier_confirmation";
  recordId: string;
  recordRevision: string; // Canonical version or immutable record digest.
  observedAt: string;     // UTC ISO timestamp of the source observation.
  reviewedAt: string | null;
  reviewerLabel: string | null; // Server-redacted display label, not contact data.
  expiresAt: string | null;
  href: string | null;    // Authorized internal read/navigation link only.
}>;

type UnknownReason =
  | "missing_binding" | "confirmation_required" | "not_checked"
  | "no_current_evidence" | "read_unavailable" | "revision_mismatch"
  | "superseded" | "not_applicable" | "withdrawn" | "invalid_evidence";

type ReviewFact =
  | Readonly<{
      state: "UNKNOWN";
      reason: UnknownReason;
      observedAt: string | null; // Successful empty read time, if known.
      evidence: EvidenceReference | null; // May reference inapplicable history.
    }>
  | Readonly<{
      state: "PENDING";
      reason: "review_requested";
      observedAt: string;
      evidence: EvidenceReference; // The actual submitted review/request record.
    }>
  | Readonly<{
      state: "CONFIRMED";
      reason: "exact_identity_reverified" | "verified_fact";
      observedAt: string;
      evidence: EvidenceReference;
    }>
  | Readonly<{
      state: "EXPIRED";
      reason: "validity_ended";
      observedAt: string;
      evidence: EvidenceReference & Readonly<{ expiresAt: string }>;
    }>
  | Readonly<{
      state: "REJECTED";
      reason: "explicit_rejection";
      observedAt: string;
      evidence: EvidenceReference;
    }>;

type ReconciliationReviewRow = Readonly<{
  sourceId: string;
  launchItemId: string;
  sourcePointer: string; // Exact JSON pointer into the immutable source file.
  sourceRowSha256: string;
  productLabel: string;
  configurationLabel: string; // Preserve source assumption/DAC distinctions.
  issueKinds: readonly ("identity_binding" | "formulation")[];
  exactIdentity: ExactIdentity | null; // Corroborated join, NOT commerce approval.
  proposedIdentity: ExactIdentity | null; // Explicit recorded proposal only.
  facts: Readonly<Record<FactKind, ReviewFact>>;
}>;

type ReconciliationReviewResponse =
  | Readonly<{
      status: "AVAILABLE";
      schemaVersion: 1;
      projectedAt: string; // Server clock; does not refresh evidence observations.
      source: Readonly<{
        sourceSetId: string;
        packageSha256: string;
        manifestSha256: string;
        sourceFileSha256: string;
        scope: "phase_a_exceptions" | "phase_a";
      }>;
      coverage: Readonly<{
        complete: true;
        expectedRows: number;
        returnedRows: number;
      }>;
      rows: readonly ReconciliationReviewRow[];
    }>
  | Readonly<{
      status: "UNAVAILABLE";
      schemaVersion: 1;
      reason: "source_unavailable" | "source_invalid" | "projection_unavailable";
    }>;
```

String identifiers and SHA-256 strings above require exact runtime validation;
TypeScript alone supplies none. The fixed fact keys scope their evidence. Each
reference must resolve server-side to the exact source-set revision, row digest,
fact kind and applicable product/variant/SKU, either directly or through the
existing canonical binding. Reject a confirmation if that linkage cannot be
established; do not retrofit an invented version onto historical evidence.

`recordRevision` pins the complete underlying immutable record. It is not a new
mutable review store. The underlying authority retains decision reasons and
supersession history; its authorized read page can display them. This minimal
response deliberately omits raw free-text reasons and attachments. ASTRA-A may
provide a bounded, redacted reason label later without changing decision power.

The source-row digest must cover the complete authoritative source row using a
specified deterministic serialization, not merely the two display labels. The
source-file/package hashes and pointer retain original byte lineage. No client
calculation establishes or changes these hashes. `proposedIdentity` is null
unless a real proposal exists; multiple conflicting candidates cannot silently
be reduced to the first result. Proposal changes never rewrite `exactIdentity`.

## Exhaustive server projection semantics

The five-state vocabulary is an evidence projection only. It must not replace
canonical required-input/supplier lifecycle enums or their decision functions.

| Canonical observation | Review projection |
| --- | --- |
| Required input absent or `missing` | UNKNOWN with missing/confirmation-required reason; no invented pending request. |
| `entered` or `under_review` with an actual review/submission event | PENDING, referencing that event/version; otherwise UNKNOWN. |
| `verified` with exact fact/identity/revision and admissible verification evidence | CONFIRMED for that fact only. |
| `expired` with documented prior confirmation and validity end | EXPIRED; malformed or missing required evidence becomes UNKNOWN/invalid_evidence. |
| `rejected` with an actual rejection event | REJECTED; the underlying record retains actor/time/reason. |
| `superseded`, `not_applicable` | UNKNOWN with the corresponding reason; not a claim the fact was confirmed. Canonical readiness may independently treat these as resolved. |
| Source row or canonical identity revision differs from the reviewed binding | UNKNOWN/revision_mismatch; retain old evidence as history, do not mislabel it temporal expiry. |
| Exact historical source/product/variant/parent/SKU join is reverified | Identity-binding CONFIRMED/exact_identity_reverified, with historical observation time and source reference; no other fact is promoted. |
| Exact supplier record is active, current, valid and passes canonical liveness | Supplier CONFIRMED/verified_fact for its exact unit only. |
| Actual matching supplier record has passed its documented expiry | Supplier EXPIRED, if historical read authority supplies the record. |
| Supplier record is withdrawn | UNKNOWN/withdrawn, not REJECTED without an explicit rejection authority. |
| Successful live-only supplier read returns null | UNKNOWN/no_current_evidence with that read's observation time; not EXPIRED or REJECTED. |
| Supplier read was not attempted / failed | UNKNOWN/not_checked or UNKNOWN/read_unavailable; distinguish from successful empty observation. |

The existing live-only supplier reader cannot supply an expired record merely
by returning null. No extra privileged fallback/read is authorized by this
proposal. If the established authoritative read cannot distinguish history,
the projection remains UNKNOWN. Historical 34 successful lookups with zero
confirmations never become 34 confirmed supplier facts.

## Availability, completeness and UI contract

- HTTP 401/403 retains the existing canonical admin boundary and returns no row
  or source evidence; this is not an AVAILABLE empty review.
- Source/identity projection failure or malformed source coverage yields
  UNAVAILABLE (normally HTTP 503 for unavailable dependencies). A safe reason
  replaces raw upstream errors. UNAVAILABLE has no rows or success counts.
- A complete source projection may still have UNKNOWN supplier or required-input
  facts when those individual observations are missing/unavailable. Row coverage
  is not evidence completeness, and evidence completeness is not launch readiness.
- AVAILABLE requires unique exact source IDs, valid hashes, all four fact keys,
  `returnedRows === rows.length === expectedRows`, and the expected source set.
  For this pinned exceptions scope the server derives ten rows and eleven issue
  entries. A missing row or empty list must not pass as completed review.
- Render exactly Unknown, Pending, Confirmed, Expired or Rejected for each fact,
  plus its safe reason and observation time. Do not calculate status from raw
  strings, a green product badge, non-null evidence, price, or a browser clock.
  Expiry refresh behavior must come from ASTRA-A's contract; never keep presenting
  a now-stale response as current confirmation without revalidation.
- `exactIdentity: null` cannot accompany a confirmed identity-binding fact.
  A supplier confirmation must bind to the same exact identity and applicable
  unit specification. A binding confirmation cannot clear formulation holds.

## Rights-safe reads and excluded capabilities

Mount inside the existing protected Product Control read family using the
canonical admin guard; ASTRA-A selects and registers the exact route. Use
`Cache-Control: no-store`. No endpoint or role is added by this document.

The server emits `href` only for a mounted internal destination the viewer may
read. Validate the parsed same-origin path against an explicit route/query
allowlist; reject external/protocol-relative URLs, credentials, unsafe encodings
and secret-bearing query strings. Recheck authorization at the destination.
Return null when no safe authorized link exists; display an inert reference.
The browser must never turn an evidence reference, source path, private contact,
raw URL or label into a link by concatenation.

Exclude raw supplier records/contact/SKU economics, required-input entered
values or secret-reference names, source cost/margin/notes, patient/customer
data and real fixtures from the client bundle. Safe labels and references are
server allowlisted; importing committed operational JSON into React is not a
permitted substitute for the protected read.

There is no new approve, reject, request-review, map, save, activate, publish or
write workflow in this first contract. There is no price or release authority.
ASTRA-A review and implementation are prerequisites to ASTRA-B UI integration;
this proposal and the companion audit provide no implementation/test acceptance.
