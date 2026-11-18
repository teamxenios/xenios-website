# Xenios Early Access Data and Email Policy 1.0 — Root review copy

Status: **PROPOSED — NOT APPROVED — NOT EFFECTIVE**

Review revision: `root-review-2`, prepared 2026-11-18.

Proposed policy records: `EA-DURABLE-RETENTION-1.0` and `EA-TRANSACTIONAL-RECIPIENTS-1.0`.

Proposed accountable owner: Samuel Boadu, samuel@xeniostechnology.com. Root owns engineering implementation and release verification with the database, mail and responsible clinical administrators.

## Source and approval boundary

This is a new, reviewable consolidation of the proposal pasted into Codex. It is not a recovered copy of the three linked original files. Their bytes and hashes are unavailable. The exact captured pasted answer has SHA256 `731bfcedb97a1cb43996d683fe41f0dc37590f78dcd66125e7df58c354953414` (18,326 UTF-8 bytes). Its conditional approval template is not an approval.

Approval must identify this review copy's actual SHA256 and both policy records in KAN-149, linked from KAN-225. Approval identity, time, record references and effective cutoff remain empty until actually supplied. A proposed record must never populate an enabled runtime setting. Business-policy approval and implementation qualification are separate: approval does not establish that controls, provider suitability or delivery have been verified.

This review makes ordinary retention anchors explicit: days run from the stated event; calendar months and years retain those calendar units. The retention settings below are proposed business choices, not universal legal minimums. Do not substitute a quote, email, page view or staff comment for an operational closure or a completed order.

## EA-DURABLE-RETENTION-1.0

### Purposes and collection

Keep the information necessary to handle a saved Early Access request, provide support and establish what happened. Each class must have a purpose, owner, lifecycle anchor and expiry. Separate temporary catalog entry from submitted requests and their necessary contact snapshots.

At submission, retain the customer name and preferred name when supplied; request-bound email; necessary postal address; exact product, variant and quantity; reference and received time; applicable terms/privacy versions; existing eligibility attestation result; actual request status and assigned operator where the corresponding workflow exists. Preserve the customer's actual submitted selections and quantities.

Optional operational additions may include phone, preferred service-contact method, referral source/code, account executive through the existing attribution contract, relevant organization and limited delivery instructions. They require reviewed fields and clear purposes. Phone does not imply marketing or SMS consent; referral attribution does not authorize disclosure to the referrer. These additions must not delay qualification of an acknowledgement using existing necessary fields.

Do not add medical history, diagnoses, medications, pregnancy information, lab results/uploads, medical images, identity documents, full birth date or detailed health-goal profiling to general catalog intake. Necessary clinical collection belongs to the responsible clinical pathway, with its own purpose, consent, access and provider arrangements.

### Proposed schedule

| Record class | Proposed retention and anchor |
| --- | --- |
| Temporary catalog-entry name, email and address | Existing two-hour expiry; existing cleanup every five minutes. KAN-149/13139 remains unchanged. |
| Submitted request that does not become an order, and related quotes | Earlier of 90 days after operational closure or 180 days after submission. With no closure, the submission-based 180-day cap still applies, subject to an approved exception below. |
| Completed-request operational record and supporting quotes | 12 calendar months after final operational closure of a genuinely converted/completed request. Closure or cancellation of an unconverted request does not enter this class; its earlier 90/180-day rule still applies. Issuing a quote is insufficient. The actual completion event must be defined and recorded before enforcement. |
| Necessary support linked to a request | The associated request's expiry. |
| Unrelated support correspondence | Normally 90 days after support closure. |
| Rendered email/outbox payload | 30 days after terminal delivery or failure, or earlier when lawful parent deletion requires removal. A pending/retrying job needs an explicit bounded lifecycle rather than indefinite retention. |
| Company-controlled raw delivery/bounce webhook payload | Seven days after receipt. This does not promise deletion of the provider's own records. |
| Minimal delivery and staff-access evidence | 12 calendar months after the evidence event, without full email bodies, addresses, product lists or clinical notes. |
| Company-controlled notification mailbox copies | 90 days after the mailbox receives the message, supported by actual mailbox controls. |
| Ordinary diagnostics, IP and user-agent records | 30 days after collection; exclude personal request contents. |
| Necessary financial records | Proposed seven years after the relevant financial year closes, limited to the necessary finance record and subject to the applicable accounting requirements. This does not extend the entire request or product/contact snapshot. |
| Clinical records, prescriptions and medical evaluations | Separate schedule from the responsible licensed entity/provider; this policy does not supply that schedule. |

When Submit Request succeeds, the necessary request information must be saved separately from temporary catalog entry. Temporary cleanup must not erase a durable request, quote or receipt merely because the catalog session expires.

Issuing a quote, viewing a page, sending an automated message or adding an incidental staff comment does not restart the clock, establish conversion to an order or move an unconverted request into the longer completed-request class. Define and record the real closure/conversion events before enforcement; do not infer them from email or quote activity.

### Exceptions, deletion and residuals

Review unresolved unconverted cases before expiry. A genuinely active case may receive a specific extension with a named owner, reason and fixed expiry. The ordinary extension cap is one calendar year from submission; it must not silently renew. Legal holds are separately scoped, recorded and released, rather than treated as an ordinary active-case extension.

Handle verified deletion requests through the responsible privacy process. Apply deletion to the actual related storage and necessary dependent payloads, while retaining only a specifically justified, minimized exception record. Financial or legal retention must remain scoped to the material it actually requires.

Do not silently apply these prospective defaults to unknown legacy records or staging fixtures. Inventory and classify those separately with their existing approvals and provenance. Keep the existing separately approved staging-fixture handling separate from customer/business retention.

Inventory provider-managed residuals, backups and mailbox copies separately. Do not promise that an application purge removes a customer's own email copy, instantly clears vendor backups, or enforces a vendor retention period that the company cannot control. Document the real provider capabilities, residual windows and restoration/deletion handling before claiming implementation complete. Do not invent missing operational details from the unseen original files.

## EA-TRANSACTIONAL-RECIPIENTS-1.0

### Customer service messages

Send a customer acknowledgement only to the email address bound to that customer's successfully committed saved request. Do not accept notification recipients or internal routing from browser/form input. No marketing, promotional calls, SMS, affiliate, family, account executive or other-customer copies are authorized by this policy.

The received message may contain the request reference, received time, truthful received/in-queue status, next steps and approved FAQ/help link. Exclude product lists, postal addresses, sensitive notes and private quote contents. Keep promotional offers and recommendations out of the service message.

Send received/in-queue only after request commit. Send review-started only after the actual saved review-start transition. Quote-available and shipping messages require their own real events when those workflows exist. Retry must preserve one request and one notice for the same event; do not replay old requests or bulk-send historical acknowledgements.

### Internal messages and support

Proposed internal short-alert recipients are team@xeniostechnology.com and samuel@xeniostechnology.com. Internal alerts are separate from customer messages; do not CC these addresses onto the customer email. This does not require splitting the existing authorized internal pair into two provider messages. Verify Seth's exact address, role and assignment before separately adding access; do not guess it.

Full customer details remain in the protected staff portal. Full-detail staff email is a separately qualified template requiring suitable provider arrangements, recipient permissions and mailbox retention. This policy does not activate it.

The intended Reply-To is team@xeniostechnology.com. Samuel is the proposed accountable monitoring owner. Enable Reply-To only after a controlled reply is observed in the correct inbox and monitoring coverage is confirmed. Until then, use the approved FAQ/help link, omit Reply-To and make no monitored-reply promise.

### Provider and clinical exclusions

This policy does not authorize PHI through Resend. Its published no-BAA limitation must be respected. Minimal email wording does not, by itself, establish that a clinical communication is non-PHI; sender, relationship and metadata may matter. Qualify the permitted operational route separately using real data-flow facts. Use a suitable separately arranged route for regulated clinical mail. Do not enable a generic all-request sender solely because its template omits product names.

### Prospective activation and evidence

Keep both policy records proposed until explicit approval is recorded against this exact document hash. Then prepare a real effective cutoff and bind the actual approved references to retention_policy_version and recipient_policy_version. Do not use placeholder references, backdate the cutoff or treat approval time as automatic deployment time.

Version and deploy the matching notices with the behavior described. Capture the applicable versions on new submissions. Preserve the existing temporary two-hour/five-minute rule. Before activation, verify lifecycle anchors, purge controls, durable/temporary separation, permitted mail route, recipient binding, retry/idempotency, actual delivery and controlled inbox result. Keep full-detail mail off. Follow the existing release process for application, schema and configuration changes.

Use one explicitly authorized controlled acknowledgement journey after prerequisites are ready. Preserve the original saved customer request and do not create a duplicate to replace its verification. Controlled test records must have explicit fixture provenance and cleanup, rather than being counted as customers.

## Proposed customer-facing copy

These drafts must not be published as promises before their described controls exist.

### Before catalog access

We use your name, email and postal address to give you access to the Early Access catalog. Your temporary catalog-access record expires after two hours, and cleanup runs every five minutes. If you submit a request, we save your selections and the contact information needed to respond as a separate request record. Our privacy notice explains how long we keep that record and who can access it.

### Before Submit Request

By submitting, you ask Xenios to review your selections and use the contact details provided to handle this request and send service updates. Submitting a request does not confirm payment, availability, clinical eligibility or shipment. Requests that do not become orders are kept for up to 180 days from submission, normally no more than 90 days after closure. Completed-request support records are normally kept for 12 months after closure. Limited legal, financial or active-case exceptions are explained in our privacy notice. Marketing is optional and separate.

### Acknowledgement

Subject: We received your Xenios request — [reference]

We received your request and added it to our review queue.

Your reference: [reference]

Received: [timestamp]

Our team will review your selections and contact you about the next steps. This is confirmation of receipt; availability, payment, clinical eligibility and shipment are not confirmed by this message.

[Approved help link]

## Qualification and remaining ownership

Root must map the proposed schedule to actual storage and real lifecycle events, prepare reviewed retention controls and notice changes, reconcile the sender's data-route eligibility, and return exact deployed SHA plus one-request/one-notice retry and controlled-inbox evidence. Database and mailbox administrators own their respective enforcement mechanisms. Samuel owns business approval and monitoring coverage; the responsible licensed provider owns clinical policy and clinical-route suitability.

The pasted proposal refers to more detailed deletion, hold, backup, legacy and fixture provisions in an unseen full file. This review preserves their required separation and safeguards; it does not claim those unseen details were recovered. Missing implementation and provider facts must be documented and resolved before the corresponding activation or retention promise. Approval of this copy approves only the text and schedules present here.
