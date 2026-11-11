import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { HCG_STRENGTH_REVIEW as held } from "@shared/research/master-offerings/hcg-strength-review";
import {
  REQUEST_INTENT_KIND, type RequestIntentCatalogItem, type RequestIntentDetail,
} from "@shared/research/assisted-order/request-intent";
import { assistedOrderFormPair, requiredAssistedOrderFormAcknowledgments } from "@shared/research/assisted-order/form";
import { sha256AssistedOrderHasher as hasher } from "../defaults";
import type { AssistedOrderViewer } from "../ports";
import { GeneratedMasterOfferingCatalogReader } from "../../master-offerings/dataset-reader";
import { inquiryReviewCodeForVariant } from "../../master-offerings/inquiry-review-states";
import { MasterOfferingCatalogService } from "../../master-offerings/service";
import { createRequestIntentCatalog } from "./catalog";
import { RequestIntentService, type StoredIntent } from "./service";

/**
 * One quote request holding four kinds of listing from the real catalog:
 * an ordinary research item, a supplier's supplement, a clinical-review item
 * and the held listing. Service level, synthetic customer, in-memory store.
 * It is not a browser run and not a database run.
 */
const reader = new GeneratedMasterOfferingCatalogReader(
  resolve("server/research/master-offerings/data/member-safe-master-offerings.generated.json"),
);
const offerings = new MasterOfferingCatalogService(reader, async () => ({ binding: null, selection: null }));
const catalog = createRequestIntentCatalog({
  serviceFor: () => offerings, bindingFor: () => null, offeringVariantFor: () => null, catalogVersion: "synthetic",
});
const viewer: AssistedOrderViewer = {
  actorType: "early_access_session", memberId: null, normalizedEmail: null,
  earlyAccessCustomerRef: "synthetic-customer", earlyAccessSessionHash: "synthetic-session",
  capabilities: new Set(["assisted_orders:submit"]),
};
const now = "2026-11-11T08:00:00.000Z";
const required = [{ kind: "fixture-terms", version: "fixture-v1" }];

function setup() {
  const saved = new Map<string, StoredIntent>();
  const details: RequestIntentDetail[] = [];
  let nextId = 0;
  const service = new RequestIntentService({
    catalog, hasher, quoteOnly: true,
    repository: {
      findAttempt: async (owner, attempt) => saved.get(owner + ":" + attempt) ?? null,
      createOrReplay: async (record) => {
        const key = record.ownerHash + ":" + record.attemptHash;
        const prior = saved.get(key);
        if (prior) return prior;
        details.push(record.detail);
        const { kind, requestId, publicReference, status, createdAt } = record.detail;
        const stored = { receipt: { kind, requestId, publicReference, status, createdAt }, fingerprint: record.fingerprint };
        saved.set(key, stored);
        return stored;
      },
    },
    standing: { accepted: async () => true },
    legal: { requiredAgreements: async () => required },
    clock: { now: () => new Date(now) },
    ids: {
      uuid: () => "30000000-0000-4000-8000-00000000000" + (nextId += 1),
      publicReference: () => "unused", opaqueToken: () => "unused",
    },
  });
  return { service, details };
}

async function everyRow(service: RequestIntentService): Promise<RequestIntentCatalogItem[]> {
  const rows: RequestIntentCatalogItem[] = [];
  for (let page = 1; ; page += 1) {
    const result = await service.list(viewer, { page, pageSize: 100 });
    rows.push(...result.items);
    if (rows.length >= result.total) return rows;
  }
}

function cart(rows: readonly RequestIntentCatalogItem[]) {
  const ordinary = rows.find((row) => row.family === "research_peptides_materials"
    && row.selectableForReview && row.intentExclusion === null && !row.clinicalReviewRequired);
  const supplement = rows.find((row) => row.family === "supplements" && row.selectableForReview);
  const clinical = rows.find((row) => row.clinicalReviewRequired && row.selectableForReview && row.intentExclusion === null);
  const heldRow = rows.find((row) => row.sourceSelection?.variantId === held.variantId);
  if (!ordinary || !supplement || !clinical || !heldRow) throw new Error("Missing a cart fixture row");
  return { ordinary, supplement, clinical, heldRow };
}

describe("one quote request with four kinds of listing from the real catalog", () => {
  it("lists every row without a price, and lets each of the four kinds be added", async () => {
    const { service } = setup();
    const rows = await everyRow(service);
    expect(rows).toHaveLength(420);
    // Quote-only: no row carries a catalog price.
    expect(rows.every((row) => row.unitPriceCents === null && row.priceVersion === null)).toBe(true);
    const { ordinary, supplement, clinical, heldRow } = cart(rows);
    for (const row of [ordinary, supplement, clinical, heldRow]) expect(row.selectableForReview).toBe(true);
    expect(heldRow).toMatchObject({ intentExclusion: "specification_review", specification: held.specification });
    expect(JSON.stringify(heldRow)).not.toContain("120000");
  });

  it("stores all four lines once, replays a second submit, and gives staff the same lines with their reasons", async () => {
    const { service, details } = setup();
    const { ordinary, supplement, clinical, heldRow } = cart(await everyRow(service));
    const chosen = [
      { row: ordinary, quantity: 2 }, { row: supplement, quantity: 1 },
      { row: clinical, quantity: 1 }, { row: heldRow, quantity: 3 },
    ];
    const agreements = [
      ...required,
      ...requiredAssistedOrderFormAcknowledgments({
        includesResearchUseOnly: chosen.some(({ row }) => row.researchUseOnly),
      }).map(assistedOrderFormPair),
    ].map((pair) => ({ ...pair, accepted: true as const, acceptedAt: now }));
    const input = {
      idempotencyKey: "10000000-0000-4000-8000-0000000000aa",
      contact: {
        fullLegalName: "Synthetic Customer", email: "synthetic@example.invalid", mobilePhone: "+15555550123",
        ageConfirmed: true, billingSameAsShipping: true,
        shippingAddress: { line1: "1 Synthetic Street", city: "Test", region: "TX", postalCode: "00000", countryCode: "US" },
      },
      agreements,
      lines: chosen.map(({ row, quantity }) => ({ productId: row.productId, variantId: row.variantId, quantity })),
    };

    const receipt = await service.submit(viewer, input);
    expect(receipt).toMatchObject({ kind: REQUEST_INTENT_KIND, status: "pending_review" });
    expect(receipt.publicReference).toMatch(/^XRI-[0-9A-F]{32}$/);
    // The customer's receipt names the request and nothing else: no line, no amount.
    expect(Object.keys(receipt).sort()).toEqual(["createdAt", "kind", "publicReference", "requestId", "status"]);

    // Submitted twice: the same receipt, and one stored request.
    expect(await service.submit(viewer, input)).toEqual(receipt);
    expect(await service.recover(viewer, input.idempotencyKey)).toEqual(receipt);
    expect(details).toHaveLength(1);
    // Another session cannot read it back.
    expect(await service.recover({ ...viewer, earlyAccessSessionHash: "another-session" }, input.idempotencyKey)).toBeNull();

    // The stored request holds the four lines, in order, each still pending.
    const stored = details[0];
    expect(stored.lines.map((line) => [line.sourceVariantId, line.quantity])).toEqual(
      chosen.map(({ row, quantity }) => [row.sourceSelection!.variantId, quantity]));
    expect(stored.lines.every((line) => line.reviewState === "pending")).toBe(true);
    // An inquiry stores no price, payment, order or reservation fact.
    expect(JSON.stringify(stored)).not.toMatch(/price|amount|payment|invoice|reserv/i);
    expect(JSON.stringify(stored)).not.toContain("120000");

    // Staff read the same request: the same lines, and why each needs a decision.
    const readback = await service.staffRead(
      { subjectId: "synthetic-staff", roles: ["clinical_admin"] },
      { purpose: "request_intent_pending_read", actorSubjectId: "synthetic-staff", enabled: true },
      { get: async () => stored, list: async () => ({ items: [], total: 0, page: 1, pageSize: 25 }) },
      receipt.requestId,
    );
    expect(readback?.lines.map((line) => [line.sourceVariantId, line.quantity, line.productName])).toEqual(
      stored.lines.map((line) => [line.sourceVariantId, line.quantity, line.productName]));
    const [ordinaryLine, supplementLine, clinicalLine, heldLine] = readback!.lines;
    expect(ordinaryLine).toMatchObject({ clinicalReviewRequired: false, researchUseOnly: true });
    expect(supplementLine).toMatchObject({ family: "supplements", clinicalReviewRequired: false });
    expect(clinicalLine).toMatchObject({ clinicalReviewRequired: true, workflowMode: "provider_request" });
    expect(heldLine).toMatchObject({
      specification: held.specification, sourceRefusal: "formulation_hold", workflowMode: "availability_review",
    });
    // A line whose listing has a review state carries its code for staff; the others carry none.
    for (const line of readback!.lines) {
      expect(line.reviewCode ?? null).toBe(inquiryReviewCodeForVariant(line.sourceVariantId));
    }

    // Nothing commercial can follow from an inquiry.
    expect(() => service.rejectCommercialTransition()).toThrow("unapproved_intent_has_no_commercial_authority");
  });

  it("refuses the whole request, and stores nothing, when one identity is invented", async () => {
    const { service, details } = setup();
    const { ordinary, heldRow } = cart(await everyRow(service));
    const agreements = [
      ...required,
      ...requiredAssistedOrderFormAcknowledgments({ includesResearchUseOnly: true }).map(assistedOrderFormPair),
    ].map((pair) => ({ ...pair, accepted: true as const, acceptedAt: now }));
    await expect(service.submit(viewer, {
      idempotencyKey: "10000000-0000-4000-8000-0000000000ab",
      contact: {
        fullLegalName: "Synthetic Customer", email: "synthetic@example.invalid", mobilePhone: "+15555550123",
        ageConfirmed: true, billingSameAsShipping: true,
        shippingAddress: { line1: "1 Synthetic Street", city: "Test", region: "TX", postalCode: "00000", countryCode: "US" },
      },
      agreements,
      lines: [
        { productId: ordinary.productId, variantId: ordinary.variantId, quantity: 1 },
        { productId: heldRow.productId, variantId: "mov_invented_variant", quantity: 1 },
      ],
    })).rejects.toMatchObject({ code: "selection_requires_refresh" });
    expect(details).toHaveLength(0);
  });
});
