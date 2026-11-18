# Canonical supplier/fulfillment source preparation

Task `SUPPLIER-WORKSPACE`; session `codex-ea-supplier-preparation-20261118`, actual worker `/root/supplier_model`. Source base `a5b549a86cad9ba9a57774ffb294dc4e159d929e`. This is Queue B expansion after the next qualified Early Access release, not a new prerequisite for that release.

## Implemented source behavior

`createCanonicalFulfillmentSources` supplies the existing CRM composite repository's `supplierAssignments` and `fulfillment` readers. It reuses `FulfillmentOperationsPort`, canonical fulfillment states, `AdminOperationsSourceReader`, existing source envelopes and the existing `CrmSupplierOperations` screen. It creates no store, shipment/order state machine, role, route, API endpoint or second internal workspace.

The caller supplies three existing server authorities: current internal actor resolution, the canonical fulfillment read port, and an authorized canonical fulfillment-order foreign-key lookup. The new lineage contract describes that lookup; it is not an implementation or permission grant. Every lineage row must match the requested fulfillment ID, canonical order reference and same verified actor. Missing, duplicate, extra, malformed or inconsistent lineage refuses the entire source. A fulfillment UUID or reference alone never becomes `orderId`.

The two concurrent CRM source reads share one in-flight read only. Completed snapshots are not cached. Current actor identity/role is resolved before source access and checked again after the awaited queue/lineage reads; missing, changed or revoked authority discards the snapshot. Supplier operators cannot use this internal reader. Root must preserve the existing admin wall and derive the actor from verified server identity, never a client object, domain or editable metadata.

The queue remains bounded (default100, maximum200). Both source collections are always `partial`, including empty results: an empty window is not an authoritative total of zero. Existing pre-assignment proposals, awaiting-approval records and terminal assignment history are not fabricated. `supplierAssignments` contains already-created, nonterminal work/in-transit assignments; terminal states remain visible in the fulfillment collection with their exact canonical state. The adapter issues no commands and does not bypass the engine's paid-order release gate.

Each output is built from an explicit field list. Neither output contains recipient name/address/phone/email, member identity, affiliate attribution, clinical information, supplier cost, lot documents or private upstream errors. `fulfillmentId` remains the canonical fulfillment-order ID; `orderId` comes only from the separate authorized lineage source. An actual `tracking_created` remains distinct from `shipped`. The queue has `updatedAt`, not a tracking-event timestamp, so `lastTrackingAt` stays null instead of inventing an event time.

## Root composition and remaining scope

Inject the actual current-role and order-lineage adapters, then pass the two readers to `createCompositeAdminCrmSupplierOperationsRepository({ sources: { ...existingSources, ...fulfillmentSources } })`. Do not mount the preparation code as a public or supplier endpoint. The existing CRM service, admin route guard, source schema validation and UI continue to own their existing responsibilities. Production data-adapter/auth/environment qualification and the protected mount remain Root work.

This slice does not connect stock, public/private lot documents, supplier quote/cost review, returns, supplier partner login/UI or dispatch actions. Their existing canonical inventory, quality, supplier-offer, order and fulfillment systems remain authoritative. Unconnected sources remain unavailable. Missing documents do not become approved; inventory does not become zero or available; a record does not prove an external shipment. Evolve/PX One coverage, equipment, same-day cutoffs and home fulfillment remain meeting proposals until verified. No relabeling, dispensing, shipping, migration, provider or mail activation occurs here.

Historical supplier workspace `79d6b61e99fc6800c8962933c40aab4adc10f80d` is preserved, not blindly imported: its client API paths differ from the current engine's exported constants, and its old member-token lifecycle needs a current session boundary before any future partner mount.

## Verification and exact evidence

The new test file drives the existing in-memory fulfillment engine and paid gate for assignment, tracking creation and explicit shipment. It also covers source/role failures, revocation during awaited lineage, exact order binding, malformed/duplicate rows, overwide-field minimization, partial empty windows and in-flight coalescing with the existing composite repository. These are synthetic fixtures, not actual supplier/shipping events.

No local test, compiler, build or browser job is authorized for this worker while Root's single heavy slot is assigned elsewhere. Local verification is limited to pure Node syntax/static source checks, corpus validation and diff checks. Runtime/type/full-suite outcomes must be attached to the exact pushed head by hosted CI or a later explicit allocation. Source implementation alone is not mounted or deployed operational completion.
