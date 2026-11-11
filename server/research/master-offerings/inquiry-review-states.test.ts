import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createRequestIntentCatalog } from "../assisted-order/request-intent/catalog";
import { RequestIntentService } from "../assisted-order/request-intent/service";
import { sha256AssistedOrderHasher as hasher } from "../assisted-order/defaults";
import type { AssistedOrderViewer } from "../assisted-order/ports";
import type { RequestIntentDetail } from "@shared/research/assisted-order/request-intent";
import { GeneratedMasterOfferingCatalogReader } from "./dataset-reader";
import { getReviewedProductContent } from "./reviewed-content";
import { MasterOfferingCatalogService } from "./service";
import clinical from "./data/reviewed-inquiry-review-states.json";
import research from "./data/reviewed-inquiry-review-states.research.json";
import {
  INQUIRY_REVIEW_CODES, inquiryReviewCodeForVariant, inquiryReviewStateCount,
  inquiryReviewStateFor, readInquiryReviewStates,
} from "./inquiry-review-states";

const reader = new GeneratedMasterOfferingCatalogReader(
  resolve("server/research/master-offerings/data/member-safe-master-offerings.generated.json"),
);
const service = new MasterOfferingCatalogService(reader, async () => ({ binding: null, selection: null }));
const catalog = createRequestIntentCatalog({
  serviceFor: () => service, bindingFor: () => null, offeringVariantFor: () => null, catalogVersion: "synthetic",
});
const viewer: AssistedOrderViewer = {
  actorType: "early_access_session", memberId: null, normalizedEmail: null,
  earlyAccessCustomerRef: "synthetic-customer", earlyAccessSessionHash: "synthetic-session",
  capabilities: new Set(["assisted_orders:submit"]),
};
const records = [...clinical.records, ...research.records];
const good = { offeringId: "mo_0a", sourceVariantId: "mov_0a", customerMessage: "A synthetic sentence for a customer.",
  neutralSpecification: null, staffReviewCode: "identity_unconfirmed" };

async function everyRow() {
  const rows = [];
  for (let page = 1; ; page += 1) {
    const result = await catalog.list(viewer, { page, pageSize: 100 });
    rows.push(...result.items);
    if (rows.length >= result.total) return rows;
  }
}

describe("reviewed inquiry review states", () => {
  it("loads both data files, binds every record to a listed variant, and gives none of them a description", () => {
    expect(inquiryReviewStateCount()).toBe(records.length);
    const offerings = reader.readCatalog();
    for (const record of records) {
      const offering = offerings.find((entry) => entry.id === record.offeringId);
      const variant = offering?.variants.find((entry) => entry.id === record.sourceVariantId);
      expect(variant, record.sourceVariantId).toBeDefined();
      // A listing with a reviewed description shows that description, not a pending message.
      expect(getReviewedProductContent(offering!, variant!), record.sourceVariantId).toBeUndefined();
      expect(INQUIRY_REVIEW_CODES).toContain(record.staffReviewCode);
    }
  });

  it("refuses a record with a staff sentence, an unknown code, a blank message or a repeated variant", () => {
    expect(readInquiryReviewStates([{ schemaVersion: 1, records: [good] }]).size).toBe(1);
    for (const bad of [
      { ...good, staffReviewReason: "A plain-word reason does not belong in this file." },
      { ...good, staffReviewCode: "because_we_said_so" },
      { ...good, customerMessage: " " },
      { ...good, neutralSpecification: "" },
      { ...good, offeringId: "not-an-offering" },
    ]) {
      expect(() => readInquiryReviewStates([{ schemaVersion: 1, records: [bad] }])).toThrow("inquiry_review_state_invalid");
    }
    expect(() => readInquiryReviewStates([{ schemaVersion: 1, records: [good, { ...good, offeringId: "mo_0b" }] }]))
      .toThrow("inquiry_review_state_duplicate");
    expect(() => readInquiryReviewStates([{ schemaVersion: 2, records: [good] }])).toThrow("inquiry_review_states_invalid");
  });

  it("shows the customer sentence on the row and never sends the staff code to a customer", async () => {
    const rows = await everyRow();
    const stated = rows.filter((row) => row.sourceSelection
      && inquiryReviewCodeForVariant(row.sourceSelection.variantId) !== null);
    expect(stated).toHaveLength(records.length);
    for (const row of stated) {
      const record = records.find((entry) => entry.sourceVariantId === row.sourceSelection!.variantId)!;
      expect(row.accessNotice).toBe(record.customerMessage);
      if (record.neutralSpecification !== null) expect(row.specification).toBe(record.neutralSpecification);
      // The reason stays on the row. Whether it can be added follows the same rule as any other row.
      expect(row.intentExclusion).not.toBeNull();
      if (row.selectableForReview) expect(row.actionLabel).toBe("Details under review");
    }
    const sent = JSON.stringify(rows);
    expect(sent).not.toContain("staffReviewCode");
    for (const code of INQUIRY_REVIEW_CODES) expect(sent).not.toContain(code);
    // A row with no state is untouched.
    expect(inquiryReviewStateFor("mo_none", "mov_none")).toBeNull();
  });

  it("replaces a label that states an unconfirmed fact with the reviewed neutral specification", async () => {
    const withNeutral = records.filter((record) => record.neutralSpecification !== null);
    expect(withNeutral.length).toBeGreaterThan(0);
    const rows = await everyRow();
    for (const record of withNeutral) {
      const row = rows.find((entry) => entry.sourceSelection?.variantId === record.sourceVariantId);
      const label = reader.readCatalog().find((entry) => entry.id === record.offeringId)!
        .variants.find((entry) => entry.id === record.sourceVariantId)!.label;
      expect(row?.specification).toBe(record.neutralSpecification);
      expect(row?.specification).not.toBe(label);
    }
  });

  it("keeps the reason and the sentence when the quote-only list replaces a row's action label", async () => {
    const quoteOnly = new RequestIntentService({
      catalog, hasher, quoteOnly: true,
      repository: { findAttempt: async () => null, createOrReplay: async () => { throw new Error("unused"); } },
      standing: { accepted: async () => true }, legal: { requiredAgreements: async () => [] },
      clock: { now: () => new Date("2026-11-11T00:00:00.000Z") },
      ids: { uuid: () => "unused", publicReference: () => "unused", opaqueToken: () => "unused" },
    });
    const rows = [];
    for (let page = 1; ; page += 1) {
      const result = await quoteOnly.list(viewer, { page, pageSize: 100 });
      rows.push(...result.items);
      if (rows.length >= result.total) break;
    }
    const stated = rows.filter((row) => row.sourceSelection
      && inquiryReviewCodeForVariant(row.sourceSelection.variantId) !== null);
    expect(stated).toHaveLength(records.length);
    for (const row of stated) {
      const record = records.find((entry) => entry.sourceVariantId === row.sourceSelection!.variantId)!;
      // The two things the form prints the status from survive the quote-only list.
      expect(row.intentExclusion).not.toBeNull();
      expect(row.accessNotice).toBe(record.customerMessage);
      expect(row.unitPriceCents).toBeNull();
    }
    // The action label does not always survive: for some workflows the list replaces
    // it with the quote wording. That is why the form does not read the status from it.
    const labels = new Set(stated.filter((row) => row.selectableForReview).map((row) => row.actionLabel));
    expect([...labels].every((label) => label === "Details under review" || label === "Request a quote")).toBe(true);
    expect(JSON.stringify(rows)).not.toContain("staffReviewCode");
  });

  it("adds the review code to a line only when staff read the request", async () => {
    const record = records[0];
    const stored: RequestIntentDetail = {
      kind: "unapproved_selection_request", requestId: "20000000-0000-4000-8000-000000000001",
      publicReference: "XRI-SYNTHETIC", status: "pending_review", createdAt: "2026-11-11T00:00:00.000Z",
      contact: {
        fullLegalName: "Synthetic Customer", email: "synthetic@example.invalid", mobilePhone: "+15555550123",
        ageConfirmed: true, billingSameAsShipping: true,
        shippingAddress: { line1: "1 Synthetic Street", city: "Test", region: "TX", postalCode: "00000", countryCode: "US" },
      },
      agreements: [],
      lines: ["mov_no_state", record.sourceVariantId].map((sourceVariantId) => ({
        productId: "synthetic-product", variantId: "synthetic-" + sourceVariantId, sourceVariantId,
        productName: "Synthetic", specification: null, family: "clinical_formulations_503a",
        workflowMode: "provider_request" as const, quantity: 1, researchUseOnly: false, clinicalReviewRequired: true,
        sourceDisplayState: "care_pathway", sourceVariantDisplayState: "care_pathway", sourceRefusal: null,
        catalogVersion: "synthetic", reviewState: "pending" as const,
      })),
    };
    const request = new RequestIntentService({
      catalog, hasher,
      repository: { findAttempt: async () => null, createOrReplay: async () => { throw new Error("unused"); } },
      standing: { accepted: async () => true }, legal: { requiredAgreements: async () => [] },
      clock: { now: () => new Date("2026-11-11T00:00:00.000Z") },
      ids: { uuid: () => "unused", publicReference: () => "unused", opaqueToken: () => "unused" },
    });
    const detail = await request.staffRead(
      { subjectId: "synthetic-staff", roles: ["clinical_admin"] },
      { purpose: "request_intent_pending_read", actorSubjectId: "synthetic-staff", enabled: true },
      { get: async () => stored, list: async () => ({ items: [], total: 0, page: 1, pageSize: 25 }) },
      stored.requestId,
    );
    expect(detail?.lines.map((line) => line.reviewCode)).toEqual([null, record.staffReviewCode]);
    // The stored record itself is not changed.
    expect(stored.lines.every((line) => !("reviewCode" in line))).toBe(true);
  });
});
