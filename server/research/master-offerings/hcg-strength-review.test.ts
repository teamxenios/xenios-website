import { resolve } from "node:path";
import { expect, it, vi } from "vitest";
import { HCG_STRENGTH_REVIEW as held } from "@shared/research/master-offerings/hcg-strength-review";
import {
  REQUEST_INTENT_KIND,
  validateRequestIntentInput,
  type RequestIntentReceipt,
} from "@shared/research/assisted-order/request-intent";
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

it("refuses fresh requests for the exact held variant and preserves its stored receipt", async () => {
  const page = await catalog.list(viewer, { search: "HCG" });
  const row = page.items.find((item) => item.sourceSelection?.variantId === held.variantId);
  expect(row).toMatchObject({
    specification: held.specification, intentExclusion: "specification_review",
    selectableForReview: false, sourceRefusal: "formulation_hold", workflowMode: "availability_review",
    sourceSelection: { slug: held.slug, variantId: held.variantId },
  });
  expect(JSON.stringify(row)).not.toContain("120000");
  const siblingIds = ["mov_e218a4fead30388a55ff", "mov_b5c50d1bb9d8ad998062"];
  const siblings = siblingIds.map((id) => page.items.find((item) => item.sourceSelection?.variantId === id));
  for (const sibling of siblings) expect(sibling).toMatchObject({ selectableForReview: true });
  if (!row || !siblings[0]) throw new Error("Missing exact HCG fixture");
  const input = validateRequestIntentInput({
    idempotencyKey: "10000000-0000-4000-8000-000000000001",
    contact: {
      fullLegalName: "Synthetic Customer", email: "synthetic@example.invalid",
      mobilePhone: "+15555550123", ageConfirmed: true, billingSameAsShipping: true,
      shippingAddress: {
        line1: "1 Synthetic Street", city: "Test", region: "TX", postalCode: "00000", countryCode: "US",
      },
    },
    agreements: [{ kind: "fixture-terms", version: "fixture-v1", accepted: true, acceptedAt: now }],
    lines: [{ productId: row.productId, variantId: row.variantId, quantity: 1 }],
  });
  const ownerHash = hasher.stableHash([
    "request-intent-owner", "session", viewer.earlyAccessCustomerRef, viewer.earlyAccessSessionHash,
  ]);
  const attemptHash = hasher.hash(input.idempotencyKey);
  let saved: StoredIntent | null = null;
  const createOrReplay = vi.fn(async () => { throw new Error("Unexpected request write"); });
  const requiredAgreements = vi.fn(async () => []);
  const uuid = vi.fn(() => "unused");
  const request = new RequestIntentService({
    catalog, hasher,
    repository: {
      findAttempt: async (owner, attempt) => owner === ownerHash && attempt === attemptHash ? saved : null,
      createOrReplay,
    },
    standing: { accepted: async () => true },
    legal: { requiredAgreements },
    clock: { now: () => new Date(now) },
    ids: { uuid, publicReference: () => "unused", opaqueToken: () => "unused" },
  });
  await expect(request.submit(viewer, input)).rejects.toMatchObject({ code: "selection_requires_refresh" });
  await expect(request.submit(viewer, {
    ...input,
    lines: [{ productId: siblings[0].productId, variantId: siblings[0].variantId, quantity: 1 }, ...input.lines],
  })).rejects.toMatchObject({ code: "selection_requires_refresh" });
  expect(requiredAgreements).not.toHaveBeenCalled();
  expect(uuid).not.toHaveBeenCalled();
  const receipt: RequestIntentReceipt = {
    kind: REQUEST_INTENT_KIND, requestId: "20000000-0000-4000-8000-000000000001",
    publicReference: "synthetic-receipt", status: "pending_review", createdAt: now,
  };
  saved = {
    receipt,
    fingerprint: hasher.stableHash({
      kind: REQUEST_INTENT_KIND, contact: input.contact, agreements: input.agreements, lines: input.lines,
    }),
  };
  await expect(request.submit(viewer, input)).resolves.toEqual(receipt);
  await expect(request.recover(viewer, input.idempotencyKey)).resolves.toEqual(receipt);
  await expect(request.recover({ ...viewer, earlyAccessSessionHash: "other" }, input.idempotencyKey)).resolves.toBeNull();
  await expect(request.submit(viewer, { ...input, lines: [{ ...input.lines[0], quantity: 2 }] }))
    .rejects.toMatchObject({ code: "attempt_conflict" });
  expect(createOrReplay).not.toHaveBeenCalled();
});
