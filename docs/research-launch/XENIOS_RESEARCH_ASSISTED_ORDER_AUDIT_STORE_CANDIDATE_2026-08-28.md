# Xenios Research assisted-order audit store candidate

- Status: **UNAPPLIED, UNMOUNTED, DEFAULT UNAVAILABLE**
- Schema: `research_assisted_order_audit_v1`
- Attestation: `research_assisted_order_audit_v1@sha256:0b58c26c239b7eb5c562e0c3b2db32a2cf71aa0704a520f4f90046a3a8bd2694`

This packet replaces the assisted-order JSON log callback with a production-shaped, database-enforced append-only authority. It does not apply a migration, change production configuration, or mount the capability.

## Privacy and authority contract

- The database stores only the closed event type, request UUID, closed actor type, HMAC actor alias, event/evidence fingerprints, strict per-event evidence, and timestamps.
- A raw member UUID, Early Access session hash, admin email/label, request body, customer contact, address, note, filename, object path, signed URL, token, provider error, stack, supplier fact, or money reference is never sent to the audit RPC.
- Non-system actor identities are HMAC-SHA-256 aliases under a dedicated 32-byte deployment secret and bounded key id. `system` requires a null actor alias.
- The actor key is distinct from application/session/signing secrets. It is supplied only through `RESEARCH_ASSISTED_ORDER_AUDIT_ACTOR_HMAC_KEY_B64URL`; no value belongs in Git, logs, evidence, or this document.
- The adapter rejects unknown fields, unknown event/actor/evidence values, duplicate evidence categories, malformed UUIDs/timestamps, oversized evidence, stale authority envelopes, extra RPC response fields, and reflected upstream errors.
- Exact event replay returns `replayed`. Reusing an event id/key for different content returns SQLSTATE `23505` and the adapter's bounded `conflicting_duplicate` error.
- The table has forced RLS, no policies, no direct grants (including `service_role`), owner-level UPDATE/DELETE/TRUNCATE rejection triggers, and only two service-role RPCs. Internal validators and mutation guards are not executable by application roles. Every function has `search_path = ''`.

## Truthful service sequencing

The boundaries are intentionally not described as more atomic than they are:

1. Assisted-order submission and status transitions already insert their domain events inside the existing repository transaction. Those domain events remain the authoritative durable facts. The supplemental audit append is post-commit and does not replace them.
2. Upload authorization persists the document row, appends `assisted_order.document_upload_authorized`, and only then asks storage to mint a signed upload capability. Audit failure cannot leak a URL. A later signing failure can leave a truthful authorization record and an `upload_pending` document; it does not create a false “uploaded” fact.
3. Upload completion first appends `assisted_order.document_upload_completion_authorized`, then commits the document's durable `uploaded` status. Audit refusal therefore cannot produce an unaudited uploaded state. The event asserts authorization to complete, not successful completion: if the later repository write fails, the authorization remains truthful and can be replayed on retry. The document row is the actual completion fact. Those two stores do not share a transaction.
4. Download authorization appends `assisted_order.document_download_authorized` before asking storage to sign. The event asserts authorization only. It does not assert that signing succeeded or that bytes were downloaded.

The storage signer and PostgreSQL cannot participate in one transaction. Any future claim of exact capability issuance or byte delivery requires a separate durable capability state machine/provider callback, not a renamed log event.

## Candidate files

- `supabase/candidates/20260828_research_assisted_order_audit_store_precheck.sql`
- `supabase/candidates/20260828_research_assisted_order_audit_store.sql`
- `supabase/candidates/20260828_research_assisted_order_audit_store_postcheck.sql`
- `scripts/rehearse-research-assisted-order-audit-store.sh`

They are intentionally absent from `docs/coordination/MIGRATION_DAG.json`. The rehearsal uses the locally pinned `postgres@sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20` image and proves pre/postconditions, service-role-only RPC access, direct-grant refusal, exact replay, conflicting duplicates, concurrent convergence, transaction rollback, owner-level immutability, and idempotent DDL reapply.

## Lead-owned protected composition instructions

Do not pass `auditWrite` or any logger to the production audit seam. `buildAssistedOrderProduction` intentionally ignores that legacy compatibility field and refuses composition without a branded, schema-probed authority.

The current assisted-order composition and its conditional route registrations
are top-level, while the server bundle is CommonJS. Do not add top-level
`await`. Instead, extract the complete current block from
`const assistedOrderComposition = ...` through its mounted/not-mounted log into
an `async function registerAssistedOrderBridge(): Promise<void>`. Add the
resolver import at module scope, then resolve one admin client, the RPC, and the
audit authority before constructing the composition:

```ts
import {
  resolveAssistedOrderAuditAuthority,
} from "./research/assisted-order/audit-store";

async function registerAssistedOrderBridge(): Promise<void> {
  const assistedOrderAdmin = supabaseConfigured() ? getSupabaseAdmin() : null;
  const assistedOrderRpc = assistedOrderAdmin
    ? (assistedOrderAdmin as unknown as AssistedOrderRpcClient)
    : null;

  const assistedOrderAudit = await resolveAssistedOrderAuditAuthority({
    env: process.env,
    rpc: assistedOrderRpc,
  });

  const assistedOrderComposition = buildAssistedOrderProduction({
    // preserve every existing canonical catalog/legal/storage input
    // ...
    supabaseRpc: assistedOrderRpc,
    supabaseStorage: assistedOrderAdmin
      ? (assistedOrderAdmin.storage as unknown as AssistedOrderStorageClient)
      : null,
    auditAuthority: assistedOrderAudit.authority,
    log,
  });

  // Preserve the complete existing service-present/service-absent branch here,
  // including every existing viewer, route, guard, literal path, and log.
}
```

Remove the `auditWrite` JSON logger entirely. At the beginning of the existing
startup IIFE, immediately before `await registerRoutes(httpServer, app)`, add
`await registerAssistedOrderBridge()`. Keep all assisted-order route creation
and registration inside that function and after the awaited resolution. This
preserves a synchronous CommonJS bundle while guaranteeing that no route is
mounted before the probe settles.

Do not cast or construct an authority, do not catch the probe into a logging fallback, and do not create a second Supabase RPC client for the repository. If the candidate is absent, grants drift, the response has extra/missing fields, or any exact configuration is absent, `authority` is null and the bridge remains unavailable.

Required deployment configuration names:

```text
RESEARCH_ASSISTED_ORDER_AUDIT_ENABLED=true
RESEARCH_ASSISTED_ORDER_AUDIT_SCHEMA_VERSION=research_assisted_order_audit_v1
RESEARCH_ASSISTED_ORDER_AUDIT_ATTESTATION=research_assisted_order_audit_v1@sha256:0b58c26c239b7eb5c562e0c3b2db32a2cf71aa0704a520f4f90046a3a8bd2694
RESEARCH_ASSISTED_ORDER_AUDIT_ACTOR_KEY_ID=<bounded deployment-owned key id>
RESEARCH_ASSISTED_ORDER_AUDIT_ACTOR_HMAC_KEY_B64URL=<32 random bytes, unpadded base64url, secret>
```

The SQL candidate must be independently reviewed, promoted through the migration release process, applied, and postchecked before those settings are authorized. This packet does none of those actions.

## Rollback posture

The first rollback is to leave or set `RESEARCH_ASSISTED_ORDER_AUDIT_ENABLED` false; because the assisted-order production seam requires the exact authority, the bridge remains unavailable rather than falling back to logs. Preserve audit rows under the approved retention policy. Do not drop or mutate the append-only table as an operational rollback. Any later schema removal is a separate reviewed migration after evidence preservation.
