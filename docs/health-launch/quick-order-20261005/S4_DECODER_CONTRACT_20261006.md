# S4 pure admin evidence decoder — proposed contract

Pushed source: `10208fea644f069f58ddeaa8993db4df5eb4469d`.
Tree: `6e0a8003baa8743d243f06bf18c025f649a95152`.
Exact three-path receipt: `evidence/s4-decoder-source-10208fe.json`.
Source-only checkpoint; tests NOT RUN and independent acceptance PENDING.

This is new-only extension-module source under Samuel's adopted S4, coordinator
60d593ae2fc0623edc869e373bfe52e830968df9 and doc36 section7. The same builder
was assigned exactly three new paths after freezing S2/S3 atac36e60:

- `shared/research/assisted-order/quick-order.ts`
- `server/research/assisted-order/quick-order-repository.ts`
- `server/research/assisted-order/quick-order-repository.test.ts`

No existing runtime is edited. This module has no client, RPC invocation, SQL,
filesystem, transport, currentness authority or production adapter. Its imports
are only the existing pure canonical contract, the new shared type and existing
pure QO core vocabulary/text helper. It does not import the canonical service,
repository or outbox runtime. Nothing calls it in the application.

## Function and result

`decodeQuickOrderAdminEnvelope(value: unknown, expectedRequestId: string)` returns
`null` only when value is explicitly `null`, meaning an absent canonical request.
The expected ID must always be a canonical lowercase UUID. Malformed input throws
`QuickOrderAdminEnvelopeError` with a fixed message containing no supplied data.

For a present request the output is `{ detail: unknown, quickOrder: projection|null }`.
The canonical detail is opaque, returned for the existing canonical admin decoder
to consume. Its exact current top-level key set and identity are checked, and
marked QO lines are checked for estimate consistency; this does not replace full
canonical nested detail validation. A future integration MUST still execute the
existing `read_all` guard and canonical detail decoder. This helper is not an
authorization boundary or a public DTO producer.

New projection objects, intake/estimate and observation/notification are frozen
copies. Input objects are not mutated or frozen. The opaque detail is not claimed
to be deep-frozen or validated for browser consumption.

## Closed proposed reader envelope

All keys shown are required; unknown keys, symbols and own accessors are refused.
The outer schema is distinct from the intake schema. Timestamps in this proposed
envelope are normalized UTC millisecond strings (`YYYY-MM-DDTHH:mm:ss.sssZ`),
including the canonical detail's createdAt when QO evidence is present. The future
reader wrapper must explicitly normalize database timestamp serialization to this
wire representation; the helper does not silently accept or rewrite other forms.
It does not read the clock or attest freshness.

```text
{
  schemaVersion: "quick-order-admin-envelope-v1",
  requestId: expectedRequestId,
  detail: <complete current canonical AssistedOrderAdminDetail wire shape>,
  submittedEvent: null | {
    schemaVersion: "quick-order-v1",
    requestId: expectedRequestId,
    eventType: "submitted",
    occurredAt: <confirmedAt>,
    payloadHash: <64 lowercase hex>
  },
  enrichment: null | {
    schemaVersion: "quick-order-v1",
    companion: { requestId, payloadHash, intake },
    receipt: {
      schemaVersion: "quick-order-v1", requestId, publicReference,
      payloadHash, attributionState, estimate
    },
    obligation: { eventKey, templateKey, payload },
    observation: { state: "stale" } | {
      state: "observed", eventKey, observedAt,
      notification: { status, attemptCount, nextAttemptAt, completedAt }
    }
  }
}
```

**Legacy requires both `submittedEvent: null` and `enrichment: null` explicitly.**
An omitted member, a marker with null/missing enrichment, or enrichment without
the marker fails closed. The future service-only reader must query the submitted
event witness independently of the companion lookup. It must never manufacture
legacy null because a companion, receipt, obligation or RPC is missing. This
decoder only validates those declared semantics; proving the query's independence
and actual durable evidence remains unimplemented database/integration work.

The envelope, detail, marker, companion, receipt and obligation payload must bind
to the expected request UUID. Companion/receipt hashes equal the submitted-event
hash. Marker occurredAt, intake confirmedAt and canonical detail createdAt agree.
Receipt and notification reference equal the detail's canonical
`XRR-[0-9]{8}-[A-F0-9]{10}` identity. Missing evidence fails even with a stale
observation. A hash string comparison is not proof of payload authenticity.

## Immutable intake

Intake has exactly schemaVersion `quick-order-v1`, source, sourceDetail,
declaredCode, affiliationKind, affiliationDetail, confirmedByCustomer,
confirmedAt, requestAcknowledged, reviewState, commissionState and estimate.

Source/affiliation values and text normalization reuse QO core. Text must already
be trimmed NFC with no controls; details have the existing180-character limit.
Source detail is required except for direct; affiliation detail is empty for none
and required otherwise. Declared code is null or1–64 uppercase letters, digits,
underscores/hyphens; the trusted-code2–40 vocabulary is not substituted. Customer
confirmation and request acknowledgment are true. Initial review is
direct_no_referrer exactly for direct without code, otherwise captured_unmatched.
Commission is always not_authorized. No trust, commission or later manual review
decision is inferred from declarations.

Estimate is `{knownSubtotalCents, estimateComplete, currency: "USD"}`. It must
match the receipt and full supplied canonical line calculation. Marked QO has
1–100 unique product/variant lines, quantities1–100000 within retained bands,
canonical workflows/currency, null or positive integer price and exact safe
line/aggregate arithmetic. Request-pricing lines require null unit price per the
canonical schema. A partial known subtotal is retained; canonical total is null
only with no priced lines. The canonical retained-ID160-character limit differs
from QO input's200; no bound is silently widened. These checks validate retained
shape and consistency, not current catalog, destination or price eligibility.
Marked QO also preserves its recorded submission restriction: no research-use-only,
provider-request, activation-request or availability-review line can be accepted.
Those checks do not run on explicit legacy detail.

## Notification and observation

The proposed obligation must match:

- Event key: `assisted-order:<canonicalRequestId>:quick-order-submitted:admin`
- Template: `research.assisted_order.quick_order.submitted.admin.v1`
- Closed payload: `{schemaVersion: "quick-order-v1", requestId, publicReference}`

No supplied URL, recipient, token, contact/declaration/line payload, provider ID,
raw error or payment evidence is added to the new projection. The identifiers
remain proposals, not installed/approved templates or RPC names. No RPC constant
or callable adapter is exported. The future wrapper must select the exact durable
obligation and preserve canonical null financial-FK conditions; this slice does
not inspect storage, create an obligation or assert those schema facts.

Observed status recognizes the existing full migration vocabulary: held, pending,
processing, sent, delivered, failed_retryable, failed_permanent, cancelled. Source
anchor:20261001040351 quote-effects status constraint. Attempt count is a
nonnegative safe integer with no six-attempt/lifetime ceiling; manual requeue can
reset it. Next-attempt time is non-null, completed time nullable. No chronology,
status/completion equivalence or delivery guarantee is fabricated. Stale contains
only its state; it cannot carry old mutable notification fields as current facts.
An observed envelope must bind its eventKey to the validated obligation; that key
is omitted from the output observation. A different/missing observation identity
fails closed, even if its status/count/timestamps are otherwise well formed.

## Qualification and remaining scope

Adjacent synthetic regressions are authored only. No Node/Vitest, syntax check,
typecheck, build, browser, resource precheck or database execution is authorized
or performed for this slice. G1 remains consumed/refused at17:54:58Z (1205MiB).
There is no new reservation. Tests cannot prove persistence even when later run.

SQL naming/fence compatibility, durable currentness, full commit RPC, existing
service/repository/admin/notification integration, actual readback and live
operation require their separate concrete scope, review and qualification.
Doc36 section7 conditions stay open. Canonical source remains the existing bridge
source identity; this helper does not add a new request ledger or source authority.
S2/S3 atac36e60, the fd HTTP module, unavailable production port, manifest, SQL and
all existing runtime files remain unchanged in this checkpoint. Samuel separately
approved the supplemental source packet at coordinator dc3329; the exact six-file
shared patch, two new tests and minimal compatible new-module amendments belong
to the next slice after this freeze. That approval adds no execution authority;
SQL drafting still awaits the original reviewer's naming/fence compatibility review.
