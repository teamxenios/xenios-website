# Shared Early Access receipt endpoint

The existing quote-delivery endpoint previously had no configured callers and
was attached only from a fully enabled private quote desk, after global JSON
parsing. Customer notices need receipt capture even while quote issuing is off.

Root mounts the existing `/api/webhooks/early-access/quote-delivery` door once,
before JSON and URL-encoded parsing. The exact production or staging Render
service and Supabase project must match. `EA_REQUEST_DELIVERY_RECEIPTS_ENABLED`
defaults off. This does not turn on workflow, customer notices, quote issuance,
quote transport, full-detail staff email or self-service account recovery.

`EA_REQUEST_DELIVERY_RECEIPT_SECRETS` is an operator-approved JSON array of one
or two provider `whsec_` signing secrets, for the specific environment's
registered provider endpoint. No values belong in source, tickets or logs.
Obtain the actual endpoint's secrets through the supported provider admin
path; never manufacture a value and treat it as configured. Separate staging
and production provider registrations/secrets must be verified during rollout.
An enabled environment with malformed/missing secrets keeps a retryable503
door and performs no database write; unrelated intake remains available.

The shared verifier authenticates exact raw bytes and physical headers. The
existing customer-notice channel stores only event ID, provider message UUID,
delivery kind and body digest through the existing service-only row90 RPC.
It does not route by email, keep addresses/bounce text or infer customer reading.
Provider event identity replay returns204; conflicting facts return409;
database failure returns503. Existing body limits and compressed-input refusal
are preserved. No new endpoint path or caller-supplied tenant is introduced.

An independently authorized quote desk receives a same-environment channel
attachment handle through both production and staging portal compositions.
It can attach only once. Quote events retain their existing quote authority,
restricted transaction, recipient tag and signed evidence handling. Unclaimed
events reach the customer channel on the same door. A quote composition can
no longer accidentally mount a late JSON-parsed receipt endpoint; enabled
receipt composition requires the pre-parser attachment callback. Existing
quote desks with no receipt option retain their previous unavailable-evidence
behavior. No missing issuer, fixture, pool or clearance gate is bypassed.

Qualification includes exact HTTP signatures/raw parsing, both environment
identities, off/preview/cross-project refusal, unavailable config, replay and
failure behavior, one late channel, and a real owned-PG16 HTTP-to-receipt-to-
notice evidence case with quoting disabled. The PG fixture has no managed
credentials and uses synthetic contacts/messages only. These are authored
checks until the actual hosted job completes; no local heavy test was run.

Activation remains separate: apply approved row90/91 through migration
prechecks/postchecks; verify actual provider endpoint configuration/secrets;
bind prospective policy and eligible data route; implement retention controls;
qualify a separately permitted controlled event and inbox observation.
The approved minimal customer notice and internal alert take priority.
Full-detail staff email, referral fields and clinical/PHI routing retain their
separate restrictions. Recovery-email inbox proof is not acknowledgement proof.

Rollback is to switch receipt capture off and pause relevant senders/provider
delivery as coordinated with the provider owner. Preserve requests, notice
jobs, digests and signed evidence. Do not resend or rewrite jobs to make a
presentation word look successful. Missing receipts remain unknown.
