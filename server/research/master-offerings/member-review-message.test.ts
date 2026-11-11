import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { AssistedOrderViewer } from "../assisted-order/ports";
import { createRequestIntentCatalog } from "../assisted-order/request-intent/catalog";
import { GeneratedMasterOfferingCatalogReader } from "./dataset-reader";
import { reviewedHeldSpecifications } from "./reviewed-holds";
import { MasterOfferingCatalogService } from "./service";

/**
 * The member full catalog says the same thing about a listing as the quote
 * request form: a reviewed description, or the one reviewed sentence that
 * says why there is none. Real catalog, list and detail, no browser.
 */
const reader = new GeneratedMasterOfferingCatalogReader(
  resolve("server/research/master-offerings/data/member-safe-master-offerings.generated.json"),
);
const service = new MasterOfferingCatalogService(reader, async () => ({ binding: null, selection: null }));
const viewer: AssistedOrderViewer = {
  actorType: "early_access_session", memberId: null, normalizedEmail: null,
  earlyAccessCustomerRef: "synthetic-customer", earlyAccessSessionHash: "synthetic-session",
  capabilities: new Set(["assisted_orders:submit"]),
};

type MemberRow = {
  family: string; slug: string; variantId: string; label: string;
  described: boolean; reviewMessage: string | undefined;
};

async function memberRows(): Promise<MemberRow[]> {
  const rows: MemberRow[] = [];
  for (let page = 1; ; page += 1) {
    const result = await service.list({ page, pageSize: 100 });
    for (const product of result.products) {
      for (const entry of product.variants) {
        rows.push({
          family: product.family, slug: product.slug, variantId: entry.id, label: entry.label,
          described: entry.reviewedContent !== undefined, reviewMessage: entry.reviewMessage,
        });
      }
    }
    if (page >= result.totalPages) return rows;
  }
}

describe("the reviewed sentence on the member full catalog", () => {
  it("gives every listing a reviewed description or the reviewed sentence, never both and never neither", async () => {
    const rows = await memberRows();
    expect(rows.length).toBeGreaterThan(400);
    const described = rows.filter((row) => row.described);
    const explained = rows.filter((row) => row.reviewMessage !== undefined);
    expect(described.length).toBeGreaterThan(0);
    expect(explained.length).toBeGreaterThan(0);
    expect(described.length + explained.length).toBe(rows.length);
    for (const row of rows) {
      expect(row.described !== (row.reviewMessage !== undefined), row.variantId).toBe(true);
      if (row.reviewMessage !== undefined) expect(row.reviewMessage.trim().length, row.variantId).toBeGreaterThan(20);
    }
  });

  it("says, row for row, what the quote request form says, and shows the same neutral label", async () => {
    const catalog = createRequestIntentCatalog({
      serviceFor: () => service, bindingFor: () => null, offeringVariantFor: () => null,
      catalogVersion: "synthetic", reviewedFormulationHolds: reviewedHeldSpecifications(),
    });
    const form = new Map<string, { reviewMessage: string | undefined; specification: string | null }>();
    for (let page = 1; ; page += 1) {
      const result = await catalog.list(viewer, { page, pageSize: 100 });
      for (const item of result.items) {
        form.set(item.sourceSelection!.variantId, { reviewMessage: item.reviewMessage, specification: item.specification });
      }
      if (form.size >= result.total) break;
    }
    const rows = await memberRows();
    expect(rows.length).toBe(form.size);
    let neutral = 0;
    for (const row of rows) {
      const formRow = form.get(row.variantId);
      expect(formRow, row.variantId).toBeDefined();
      expect(row.reviewMessage, row.variantId).toBe(formRow!.reviewMessage);
      if (row.reviewMessage !== undefined) {
        // A row with a reviewed state shows the label the form shows for it.
        expect(row.label, row.variantId).toBe(formRow!.specification);
        const dataset = (await reader.readCatalog()).flatMap((entry) => entry.variants)
          .find((entry) => entry.id === row.variantId)!;
        if (dataset.label !== row.label) neutral += 1;
      }
    }
    // At least one listing's label states an unconfirmed fact and is shown neutrally.
    expect(neutral).toBeGreaterThan(0);
  });

  it("carries the sentence on the detail page and never the staff code", async () => {
    const row = (await memberRows()).find((entry) => entry.reviewMessage !== undefined)!;
    const detail = await service.detail(row.slug);
    expect(detail).not.toBeNull();
    const body = JSON.stringify(detail);
    expect(body).toContain(JSON.stringify(row.reviewMessage).slice(1, -1));
    expect(body).not.toContain("staffReviewCode");
    for (const code of ["offering_decision", "identity_unconfirmed", "strength_or_formulation_unconfirmed",
      "label_or_source_needed", "category_display_decision", "risk_review", "wording_decision", "description_pending"]) {
      expect(body, code).not.toContain(code);
    }
  });
});
