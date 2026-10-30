import { describe, expect, it, vi } from "vitest";
import { sha256AssistedOrderHasher } from "../defaults";
import type { AssistedOrderViewer } from "../ports";
import { assistedOrderFormPair, requiredAssistedOrderFormAcknowledgments } from "../../../../shared/research/assisted-order/form";
import { validateRequestIntentInput, type RequestIntentCatalogItem, type RequestIntentInput } from "../../../../shared/research/assisted-order/request-intent";
import { RequestIntentService, type CreateIntent, type RequestIntentDependencies, type StoredIntent } from "./service";
import { requestIntentRepository } from "./rpc-repository";

const now = "2026-10-14T12:00:00.000Z";
const key = "10000000-0000-4000-8000-000000000001";
const viewer: AssistedOrderViewer = {
  actorType: "member", memberId: "member-a", authUserId: "20000000-0000-4000-8000-000000000001",
  earlyAccessSessionHash: null, normalizedEmail: "synthetic@example.invalid",
  capabilities: new Set(["assisted_orders:submit", "assisted_orders:read_own"]),
};
function item(id: string, clinical: boolean): RequestIntentCatalogItem {
  return {
    productId: id, variantId: id + "-variant", productName: "Synthetic " + id, family: clinical ? "clinical_formulations_503a" : "research_peptides_materials",
    channel: "synthetic", specification: "synthetic variant", format: null, packBasis: null,
    minimumQuantity: 1, maximumQuantity: 100, quantityIncrement: 1, unitPriceCents: null, currency: "USD",
    workflowMode: clinical ? "provider_request" : "direct_order_request", actionLabel: "Add to request",
    accessNotice: null, researchUseOnly: !clinical, catalogVersion: "synthetic-catalog", priceVersion: null,
    sourceSelection: { family: clinical ? "clinical_formulations_503a" : "research_peptides_materials", slug: id, variantId: "source-" + id },
    selectableForReview: true, intentExclusion: null, clinicalReviewRequired: clinical,
    sourceDisplayState: clinical ? "care_pathway" : "request_access",
    sourceVariantDisplayState: clinical ? "care_pathway" : "request_access",
    sourceRefusal: clinical ? "provider_pathway" : null,
  };
}
function input(ruo = true): RequestIntentInput {
  return {
    idempotencyKey: key,
    contact: {
      fullLegalName: "Synthetic Customer", email: "synthetic@example.invalid", mobilePhone: "+15555550123",
      ageConfirmed: true, shippingAddress: { line1: "1 Synthetic Street", city: "Test", region: "TX", postalCode: "00000", countryCode: "US" },
      billingSameAsShipping: true,
    },
    agreements: [
      // Test fixture only, never a proposed legal registry entry.
      { kind: "fixture-terms", version: "fixture-v1", accepted: true, acceptedAt: now },
      ...requiredAssistedOrderFormAcknowledgments({ includesResearchUseOnly: ruo })
        .map((ack) => ({ ...assistedOrderFormPair(ack), accepted: true as const, acceptedAt: now })),
    ],
    lines: ruo
      ? [{ productId: "clinical", variantId: "clinical-variant", quantity: 2 }, { productId: "research", variantId: "research-variant", quantity: 3 }]
      : [{ productId: "clinical", variantId: "clinical-variant", quantity: 2 }],
  };
}
function setup() {
  const records = new Map<string, CreateIntent>();
  const sideEffect = vi.fn();
  let sequence = 0;
  const items = [item("clinical", true), item("research", false)];
  const saved = (record: CreateIntent): StoredIntent => ({
    fingerprint: record.fingerprint,
    receipt: {
      kind: record.detail.kind, requestId: record.detail.requestId, publicReference: record.detail.publicReference,
      status: record.detail.status, createdAt: record.detail.createdAt,
    },
  });
  const deps: RequestIntentDependencies = {
    catalog: {
      list: vi.fn(async () => ({ items, total: items.length, page: 1, pageSize: 24, families: [], channels: [], workflowModes: [] })),
      resolveMany: vi.fn(async (_v, identities) => identities.map((line) => items.find((row) => row.productId === line.productId && row.variantId === line.variantId) ?? null)),
    },
    repository: {
      findAttempt: vi.fn(async (owner, attempt) => {
        const record = records.get(owner + ":" + attempt);
        return record ? saved(record) : null;
      }),
      createOrReplay: vi.fn(async (record) => {
        const binding = record.ownerHash + ":" + record.attemptHash;
        const prior = records.get(binding);
        if (!prior) records.set(binding, record);
        return saved(prior ?? record);
      }),
    },
    standing: { accepted: vi.fn(async () => true) },
    legal: { requiredAgreements: vi.fn(async () => [{ kind: "fixture-terms", version: "fixture-v1" }]) },
    hasher: sha256AssistedOrderHasher,
    ids: { uuid: () => "30000000-0000-4000-8000-" + String(++sequence).padStart(12, "0"), publicReference: () => "unused", opaqueToken: () => "unused" },
    clock: { now: () => new Date(now) },
  };
  // Extra capabilities are intentionally unreachable by the service contract.
  const service = new RequestIntentService({ ...deps, outbox: sideEffect, payments: sideEffect,
    prescriptions: sideEffect, suppliers: sideEffect, analytics: sideEffect } as RequestIntentDependencies);
  return { service, deps, records, items, sideEffect };
}

describe("private unapproved mixed request intent", () => {
  it("saves clinical plus RUO exact variants and quantities once; returns only a genuine minimal receipt", async () => {
    const { service, records, sideEffect } = setup();
    const receipt = await service.submit(viewer, input());
    expect(records.size).toBe(1);
    const stored = [...records.values()][0].detail;
    expect(stored.lines.map((line) => [line.productId, line.quantity, line.reviewState])).toEqual([
      ["clinical", 2, "pending"], ["research", 3, "pending"],
    ]);
    expect(stored.lines.map((line) => [line.clinicalReviewRequired, line.researchUseOnly])).toEqual([[true, false], [false, true]]);
    expect(receipt.publicReference).toBe(stored.publicReference);
    expect(Object.keys(receipt).sort()).toEqual(["createdAt", "kind", "publicReference", "requestId", "status"]);
    expect(JSON.stringify(receipt)).not.toContain("clinical");
    expect(sideEffect).not.toHaveBeenCalled();
    expect(() => service.rejectCommercialTransition()).toThrow("unapproved_intent_has_no_commercial_authority");
  });

  it("replays a lost committed response without re-resolving changing catalog or inventing another reference", async () => {
    const { service, deps, records } = setup();
    vi.mocked(deps.repository.createOrReplay).mockImplementationOnce(async (record) => {
      records.set(record.ownerHash + ":" + record.attemptHash, record);
      throw new Error("synthetic lost response after commit");
    });
    await expect(service.submit(viewer, input())).rejects.toThrow("synthetic lost response");
    const retry = await service.submit(viewer, input());
    expect(records.size).toBe(1);
    expect(retry.requestId).toBe([...records.values()][0].detail.requestId);
    expect(deps.catalog.resolveMany).toHaveBeenCalledTimes(1);
    expect(await service.recover(viewer, key)).toEqual(retry);
  });

  it("changed facts under the same attempt conflict rather than duplicate", async () => {
    const { service, records } = setup();
    await service.submit(viewer, input());
    await expect(service.submit(viewer, { ...input(), lines: [{ productId: "clinical", variantId: "clinical-variant", quantity: 4 }] }))
      .rejects.toMatchObject({ code: "attempt_conflict", status: 409 });
    expect(records.size).toBe(1);
  });

  it("same-attempt concurrent service calls converge in the atomic repository contract", async () => {
    const { service, records } = setup();
    const results = await Promise.all([service.submit(viewer, input()), service.submit(viewer, input())]);
    expect(results[0]).toEqual(results[1]);
    expect(records.size).toBe(1);
    // This memory contract test does NOT establish PostgreSQL race behavior.
  });

  it("another owner with the same contact email cannot recover a saved request", async () => {
    const { service } = setup();
    await service.submit(viewer, input());
    expect(await service.recover({ ...viewer, authUserId: "20000000-0000-4000-8000-000000000002" }, key)).toBeNull();
    await expect(service.recover({ ...viewer, authUserId: null }, key)).rejects.toMatchObject({ status: 401 });
  });

  it("private staff readback requires purpose-bound canonical staff authority, not general admin or unassigned clinician", async () => {
    const { service, records } = setup();
    const receipt = await service.submit(viewer, input());
    const get = vi.fn(async () => [...records.values()][0].detail);
    const capability = { purpose: "request_intent_pending_read" as const, actorSubjectId: "synthetic-staff", enabled: true };
    for (const roles of [["research_admin" as const], ["clinician" as const]]) {
      await expect(service.staffRead({ subjectId: "synthetic-staff", roles }, capability, { get, list: async () => ({ items: [], total: 0, page: 1, pageSize: 25 }) }, receipt.requestId)).rejects.toMatchObject({ status: 403 });
    }
    expect(get).not.toHaveBeenCalled();
    const detail = await service.staffRead({ subjectId: "synthetic-staff", roles: ["clinical_admin"] }, capability, { get, list: async () => ({ items: [], total: 0, page: 1, pageSize: 25 }) }, receipt.requestId);
    expect(detail?.lines).toHaveLength(2);
    await expect(service.staffRead({ subjectId: "synthetic-staff", roles: ["clinical_admin"] },
      { ...capability, enabled: false }, { get, list: async () => ({ items: [], total: 0, page: 1, pageSize: 25 }) }, receipt.requestId)).rejects.toMatchObject({ status: 403 });
  });

  it("binds both pending read operations to the actor and preserves backend approval refusal", async () => {
    const { service } = setup();
    const principal = { subjectId: "synthetic-staff", roles: ["clinical_admin" as const] };
    const context = { purpose: "request_intent_pending_read" as const, actorSubjectId: "synthetic-staff", enabled: true };
    const reader = { get: vi.fn(async () => { throw new Error("synthetic SQL refusal"); }),
      list: vi.fn(async () => { throw new Error("synthetic SQL refusal"); }) };
    for (const invalid of [{ ...context, actorSubjectId: "another-actor" }, { ...context, enabled: false },
      { ...context, purpose: "care" as typeof context.purpose }]) {
      await expect(service.staffRead(principal, invalid, reader, key)).rejects.toMatchObject({ status: 403 });
      await expect(service.staffList(principal, invalid, reader, 1)).rejects.toMatchObject({ status: 403 });
    }
    expect(reader.get).not.toHaveBeenCalled(); expect(reader.list).not.toHaveBeenCalled();
    await expect(service.staffRead(principal, context, reader, key)).rejects.toThrow("synthetic SQL refusal");
    await expect(service.staffList(principal, context, reader, 1)).rejects.toThrow("synthetic SQL refusal");
    expect(reader.get).toHaveBeenCalledWith(key, principal.subjectId);
    expect(reader.list).toHaveBeenCalledWith(principal.subjectId, 1);
    // Mock refusal propagation is not evidence that SQL ACL/capability checks ran.
  });

  it("clinical-only acknowledgments do not fabricate RUO acceptance", async () => {
    const { service, records } = setup();
    await service.submit(viewer, input(false));
    expect([...records.values()][0].detail.agreements.some((ack) => ack.kind.endsWith(":research_use_only"))).toBe(false);
  });

  it("missing legal facts, unaccepted facts and unknown medical/payment fields refuse before persistence", async () => {
    for (const raw of [
      { ...input(), medicalHistory: "not collected" },
      { ...input(), paymentVerificationId: "not authority" },
      { ...input(), agreements: [] },
      { ...input(), agreements: input().agreements.map((ack) => ({ ...ack, accepted: false })) },
      { ...input(), lines: [{ productId: "clinical", variantId: "clinical-variant", quantity: 2, reviewState: "approved" }] },
    ]) {
      const { service, records } = setup();
      await expect(service.submit(viewer, raw)).rejects.toThrow();
      expect(records.size).toBe(0);
    }
  });

  it("unavailable legal authority, unknown variants, coming-soon and excessive quantities do not save", async () => {
    const first = setup();
    vi.mocked(first.deps.legal.requiredAgreements).mockRejectedValue(new Error("synthetic unavailable"));
    await expect(first.service.submit(viewer, input())).rejects.toMatchObject({ code: "legal_requirements_unavailable" });
    expect(first.records.size).toBe(0);
    const second = setup();
    second.items[0] = { ...second.items[0], selectableForReview: false, intentExclusion: "coming_soon" };
    await expect(second.service.submit(viewer, input())).rejects.toMatchObject({ code: "selection_requires_refresh" });
    expect(second.records.size).toBe(0);
    const third = setup();
    await expect(third.service.submit(viewer, { ...input(), lines: [{ productId: "research", variantId: "research-variant", quantity: 101 }] }))
      .rejects.toMatchObject({ code: "selection_requires_refresh" });
  });

  it.each([true, false])("rejects stale legal versions before persistence and accepts refreshed exact requirements; RUO=%s", async (includesResearchUseOnly) => {
    const { service, deps, records } = setup();
    vi.mocked(deps.legal.requiredAgreements).mockResolvedValue([{ kind: "fixture-terms", version: "fixture-v2" }]);
    const stale = input(includesResearchUseOnly);
    await expect(service.submit(viewer, stale)).rejects.toMatchObject({ status: 400, code: "current_acknowledgments_required" });
    expect(records.size).toBe(0); expect(deps.repository.createOrReplay).not.toHaveBeenCalled();
    const refreshed: RequestIntentInput = { ...stale, idempotencyKey: "10000000-0000-4000-8000-000000000002",
      agreements: stale.agreements.map((agreement) => agreement.kind === "fixture-terms" ? { ...agreement, version: "fixture-v2" } : agreement) };
    const result = await service.submit(viewer, refreshed);
    expect(records.size).toBe(1); expect(deps.repository.createOrReplay).toHaveBeenCalledTimes(1);
    const saved = [...records.values()][0].detail;
    expect(saved.contact).toEqual(validateRequestIntentInput(refreshed).contact);
    expect(saved.contact.billingAddress).toEqual(saved.contact.shippingAddress);
    expect(saved.agreements).toEqual(refreshed.agreements);
    expect(result.publicReference).toBe(saved.publicReference);
    await expect(service.recover(viewer, refreshed.idempotencyKey)).resolves.toEqual(result);
  });

  it("a persistence failure never manufactures a confirmation", async () => {
    const { service, deps, records } = setup();
    vi.mocked(deps.repository.createOrReplay).mockRejectedValue(new Error("synthetic unavailable"));
    await expect(service.submit(viewer, input())).rejects.toThrow();
    expect(records.size).toBe(0);
  });

  it("RPC failures do not disclose provider messages or turn an uncertain write into success", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: "XX000", message: "private provider diagnostic" } }));
    const repository = requestIntentRepository({ rpc });
    await expect(repository.findAttempt("a".repeat(64), "b".repeat(64))).rejects.toMatchObject({
      code: "request_intent_persistence_uncertain", status: 503,
    });
    expect(rpc).toHaveBeenCalledWith("request_intent_find_attempt", { p_owner_hash: "a".repeat(64), p_attempt_hash: "b".repeat(64) });
  });
});
