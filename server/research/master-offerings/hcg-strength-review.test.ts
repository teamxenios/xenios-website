import { resolve } from "node:path";
import { expect, it } from "vitest";
import { HCG_STRENGTH_REVIEW as held } from "@shared/research/master-offerings/hcg-strength-review";
import {
  REQUEST_INTENT_KIND,
  type RequestIntentDetail,
} from "@shared/research/assisted-order/request-intent";
import {
  assistedOrderFormPair, requiredAssistedOrderFormAcknowledgments,
} from "@shared/research/assisted-order/form";
import { createRequestIntentCatalog } from "../assisted-order/request-intent/catalog";
import { RequestIntentService, type StoredIntent } from "../assisted-order/request-intent/service";
import { sha256AssistedOrderHasher as hasher } from "../assisted-order/defaults";
import type { AssistedOrderViewer } from "../assisted-order/ports";
import { GeneratedMasterOfferingCatalogReader } from "./dataset-reader";
import { buildMasterOfferingPriceList, toMasterOfferingPriceListCsv } from "./price-list-export";
import { MasterOfferingCatalogService } from "./service";

const reader = new GeneratedMasterOfferingCatalogReader(
  resolve("server/research/master-offerings/data/member-safe-master-offerings.generated.json"),
);
const service = new MasterOfferingCatalogService(reader, async () => ({ binding: null, selection: null }));
const catalog = createRequestIntentCatalog({
  serviceFor: () => service,
  bindingFor: () => null,
  offeringVariantFor: () => null,
  catalogVersion: "synthetic",
});
const viewer: AssistedOrderViewer = {
  actorType: "early_access_session", memberId: null, normalizedEmail: null,
  earlyAccessCustomerRef: "synthetic-customer", earlyAccessSessionHash: "synthetic-session",
  capabilities: new Set(["assisted_orders:submit"]),
};
const now = "2026-11-06T09:00:00.000Z";

it("shows the same neutral held record at both member URLs and in the price-list export", async () => {
  const detail = await service.detail(held.slug);
  expect(detail).toMatchObject({
    id: held.offeringId, slug: held.slug, displayState: "approval_required",
    stateExplanation: held.notice,
    variants: [{
      id: held.variantId, label: held.specification, action: { kind: "none" },
      reviewedContent: { specifications: expect.arrayContaining([{ label: "Strength", value: "Under review" }]) },
    }],
  });
  expect(await service.detail(held.legacySlug)).toEqual(detail);
  expect(await service.variant(held.legacySlug, held.variantId)).toEqual(detail?.variants[0]);
  expect(JSON.stringify(detail)).not.toContain("120000");
  const document = buildMasterOfferingPriceList({
    offerings: reader.readCatalog(), prices: new Map(), audience: "member", generatedAt: now,
  });
  expect(document.rows).toHaveLength(420);
  expect(document.rows.find((row) => row.variantId === held.variantId)).toMatchObject({
    offeringSlug: held.slug, variant: held.specification, purchasePath: "Not available",
  });
  expect(toMasterOfferingPriceListCsv(document)).not.toContain(held.legacySlug);
});

it("takes a quote inquiry for the exact held variant, alone or in a mixed request, and never states the disputed strength", async () => {
  const page = await catalog.list(viewer, { search: "HCG" });
  const row = page.items.find((item) => item.sourceSelection?.variantId === held.variantId);
  // Held is a review reason, not a refusal: the row can be added.
  expect(row).toMatchObject({
    specification: held.specification, intentExclusion: "specification_review",
    selectableForReview: true, actionLabel: "Details under review",
    sourceRefusal: "formulation_hold", workflowMode: "availability_review",
    sourceSelection: { slug: held.slug, variantId: held.variantId },
  });
  expect(JSON.stringify(row)).not.toContain("120000");
  const sibling = page.items.find((item) => item.sourceSelection?.variantId === "mov_e218a4fead30388a55ff");
  if (!row || !sibling) throw new Error("Missing exact HCG fixture");
  const required = [{ kind: "fixture-terms", version: "fixture-v1" }];
  const agreements = [
    ...required,
    ...requiredAssistedOrderFormAcknowledgments({ includesResearchUseOnly: true }).map(assistedOrderFormPair),
  ].map((pair) => ({ ...pair, accepted: true as const, acceptedAt: now }));
  const base = {
    contact: {
      fullLegalName: "Synthetic Customer", email: "synthetic@example.invalid",
      mobilePhone: "+15555550123", ageConfirmed: true, billingSameAsShipping: true,
      shippingAddress: {
        line1: "1 Synthetic Street", city: "Test", region: "TX", postalCode: "00000", countryCode: "US",
      },
    },
    agreements,
  };
  const heldLine = { productId: row.productId, variantId: row.variantId, quantity: 1 };
  const saved = new Map<string, StoredIntent>();
  const details: RequestIntentDetail[] = [];
  let nextId = 0;
  const request = new RequestIntentService({
    catalog, hasher,
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
      uuid: () => "20000000-0000-4000-8000-00000000000" + (nextId += 1),
      publicReference: () => "unused", opaqueToken: () => "unused",
    },
  });

  // The held listing by itself.
  const alone = { ...base, idempotencyKey: "10000000-0000-4000-8000-000000000001", lines: [heldLine] };
  const aloneReceipt = await request.submit(viewer, alone);
  expect(aloneReceipt).toMatchObject({ kind: REQUEST_INTENT_KIND, status: "pending_review" });

  // The held listing with an ordinary one: one request, both lines, in order.
  const mixed = {
    ...base, idempotencyKey: "10000000-0000-4000-8000-000000000002",
    lines: [{ productId: sibling.productId, variantId: sibling.variantId, quantity: 2 }, heldLine],
  };
  const mixedReceipt = await request.submit(viewer, mixed);
  expect(details).toHaveLength(2);
  expect(details[1].lines.map((line) => [line.sourceVariantId, line.quantity])).toEqual([
    ["mov_e218a4fead30388a55ff", 2], [held.variantId, 1],
  ]);
  // Staff read the reason the held line needs a decision, and a pending line only.
  expect(details[1].lines[1]).toMatchObject({
    specification: held.specification, sourceRefusal: "formulation_hold",
    workflowMode: "availability_review", reviewState: "pending",
  });
  expect(JSON.stringify(details)).not.toContain("120000");
  // No price, payment, order or reservation fact is stored with an inquiry.
  expect(JSON.stringify(details)).not.toMatch(/price|amount|payment|invoice|reserv/i);

  // A second submit of the same attempt returns the same receipt and writes nothing.
  await expect(request.submit(viewer, mixed)).resolves.toEqual(mixedReceipt);
  await expect(request.recover(viewer, mixed.idempotencyKey)).resolves.toEqual(mixedReceipt);
  expect(details).toHaveLength(2);
  // Another session cannot read it back, and a changed retry is a conflict.
  await expect(request.recover({ ...viewer, earlyAccessSessionHash: "other" }, mixed.idempotencyKey)).resolves.toBeNull();
  await expect(request.submit(viewer, { ...mixed, lines: [{ ...mixed.lines[0], quantity: 3 }, heldLine] }))
    .rejects.toMatchObject({ code: "attempt_conflict" });

  // An invented identity is still refused, and it stores nothing.
  await expect(request.submit(viewer, {
    ...base, idempotencyKey: "10000000-0000-4000-8000-000000000003",
    lines: [heldLine, { productId: row.productId, variantId: "mov_invented_variant", quantity: 1 }],
  })).rejects.toMatchObject({ code: "selection_requires_refresh" });
  expect(details).toHaveLength(2);
});
