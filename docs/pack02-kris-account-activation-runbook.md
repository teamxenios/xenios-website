# Pack 02 Kris account activation runbook

Status: prepared, unmounted, and production-unapplied. This runbook never supplies or infers Kris's email or Supabase Auth UID.

## 1. Read-only identity decision

An authorized Supabase operator runs `supabase/pack02-candidates/inspect_kris_identity_read_only.sql`. The transaction is repeatable-read and read-only, ends with `rollback`, and searches Auth metadata, canonical member/application records, and Early Access identity evidence. A name match is only a locator.

The operator must reconcile exactly one normalized email and one of these outcomes:

- existing confirmed Supabase Auth UID plus the same active `research_applications` email;
- no Auth user for a founder-confirmed email plus one active application;
- ambiguous, inactive, missing, or conflicting evidence, which is a human gate.

Roman Digital UID `20ec822d-8123-4088-ac05-9c8f4b2da784` is not Kris identity evidence. Test fixtures and partial-name/email matches are not identity evidence.

## 2. Existing-user attach path

Use `activateBuyerAccount` with `path: "existing_auth"`, the exact audited application ID, exact audited confirmed Auth UID, canonical normalized email, and an operator audit label. The composition re-reads the Auth row by UID, requires confirmed email equality, rejects conflicting member ownership, and creates only the canonical active `research_members` binding when it does not already exist.

It then requests the existing Supabase recovery flow with redirect `/research/reset-password`. It does not create an Auth user or accept a credential. An existing exact active binding is idempotently returned as ready. If an earlier secure invitation exists but remains unconfirmed, use `existing_unconfirmed_resend` with its exact audited UID; that path generates a Supabase `invite` link, verifies the returned UID/email, and hands the one-time action URL directly to the reviewed encrypted/immediate notification boundary. It never creates a second user or stores/logs the link in plaintext.

## 3. Secure-invite path

Use `activateBuyerAccount` with `path: "new_secure_invite"` only after the read-only audit proves no Auth identity exists for the founder-confirmed canonical email. The composition checks again, calls the single Supabase secure invitation API, and binds the returned Auth UID to the active canonical application/member record.

The exact adapter is `server/research/account-identity/buyer-activation-supabase.ts`. It calls the existing Supabase Admin Auth invitation/lookup APIs, the existing anonymous recovery/resend APIs, canonical `research_applications` and `research_members`, and the candidate `research_bind_active_buyer_account` RPC. That RPC atomically creates the canonical member binding and immutable account-binding audit event.

Supabase Auth and Postgres cannot share one transaction. Therefore Pack 02 never automatically deletes an invited Auth identity after a binding error: the database commit may have succeeded even when the response was lost. The composition re-reads exact canonical binding evidence; if it cannot prove the result, it returns `BINDING_OUTCOME_UNCERTAIN` for operator reconciliation. The invitation/recovery provider owns action tokens and credentials; Pack 02 does not receive or persist them.

The legacy member claim endpoint is not this operator path because it accepts a caller-supplied credential while repairing legacy records. Do not use it to activate Kris.

## 4. Mounted account journey reused by Pack 02

After the canonical active member binding exists, no Kris-specific application code is required:

- `/research/sign-in` uses the existing Supabase browser session and server member verification;
- `/research/member` is the mounted member account home;
- `/research/member/products` is the active-member catalog and pricing surface;
- `/research/member/cart` and `/research/member/checkout` reuse Buyer Commerce;
- `/research/member/orders` and `/research/member/orders/:id` reuse canonical order state, payment-state transitions, shipment/fulfillment state, carrier, and tracking;
- `/research/reset-password` provides the existing secure recovery/initial-access surface;
- logout clears the Supabase session and local member-scoped state.

Organization membership remains a separate authorization projection over the same Auth UID. It does not widen personal member history, and personal membership does not grant Roman Digital history.

No authenticated-landing preference table is part of Pack 02. If one Auth UID later has both verified member and existing admin authorization, a scoped landing decision must derive from those existing server-verified roles and explicit route intent; it must not introduce a second identity, preference schema, or client-trusted role assertion. Agentic OS owns final integration of any such behavior.

## 5. Q50 integration gate

Pack 02 displays quantities 1 through 50 and rejects quantity-only manual-review projections, but it does not own cart or checkout limits. Final fusion must consume and reverify:

- canonical F013 Q50 candidate `5e9ac687d95841529d75deb2d1d580d91380aebd`;
- assembled Buyer Commerce F013 delta `0a8b38e62bdf58c9d6646a7cb830309fd2fe6d68`.

Before execution, Agentic OS must promote and rehearse `supabase/pack02-candidates/20260813_research_buyer_account_activation.sql` after its Pack02 event-table dependency, then instantiate `createSupabaseBuyerActivationDeps(getSupabaseAdmin(), getSupabaseAnon(), reviewedPendingInviteDelivery)` inside an authorized administrative operator boundary. Exact audited values are supplied to `activateBuyerAccount`; no password field is accepted by its strict schema.

Do not mount Pack 02 candidate routes, apply SQL, invite a user, attach an identity,
or claim production checkout Q50 until the fused candidate is independently
accepted. Those operator actions stay gated.

The RECREATION half of that gate is discharged: Pack 02 is fused with the
authoritative Q50, Buyer Commerce, Catalog and Pack 04 heads onto `ba9fa0ae` at
candidate `2171dce`, so `REBASE_OR_RECREATE_REQUIRED` no longer applies. It is
replaced here rather than deleted, because the operator restrictions above are a
different gate and remain fully in force.
