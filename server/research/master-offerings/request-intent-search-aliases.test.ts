/**
 * A reviewed heading or neutral line replaces a listing's name on the card, but the listed words stay
 * searchable in the quote-request picker, as in the member catalog: the picker also searches the
 * listing's dataset aliases. The aliases are used for matching only and never enter the DTO.
 *
 * Real generated catalog and real reviewed names and states; synthetic Early Access viewer.
 */
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { AssistedOrderViewer } from "../assisted-order/ports";
import { GeneratedMasterOfferingCatalogReader } from "./dataset-reader";
import { MasterOfferingCatalogService } from "./service";
import { createRequestIntentCatalog } from "../assisted-order/request-intent/catalog";

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

// The five listings given neutral names, each found by words that are now only in its aliases.
const RENAMED = [
  { search: "libido", variantId: "mov_06beec21c59fe7842f18" },
  { search: "scream cream", variantId: "mov_06beec21c59fe7842f18" },
  { search: "hair restoration", variantId: "mov_df401fc790214eed84c8" },
  { search: "firming", variantId: "mov_5375621d23911b130fd4" },
  { search: "liver support", variantId: "mov_b29938eebdaf1935c8cc" },
  { search: "anti-aging", variantId: "mov_71799025c4b9af0971a9" },
] as const;

describe("quote-request picker search keeps the listed words of renamed listings", () => {
  for (const { search, variantId } of RENAMED) {
    it(`"${search}" finds ${variantId}, which shows its neutral name`, async () => {
      const page = await catalog.list(viewer, { search, pageSize: 100 });
      const row = page.items.find((item) => item.sourceSelection.variantId === variantId);
      expect(row).toBeDefined();
      // The card shows the neutral heading and line, not the searched words.
      expect(`${row!.productName} ${row!.specification ?? ""}`.toLowerCase()).not.toContain(search);
      // The aliases matched, but they are not part of what the picker returns.
      expect(Object.keys(row!)).not.toContain("aliases");
      expect(JSON.stringify(row)).not.toMatch(/searchAliases/);
    });
  }

  it("still finds rows by their shown name and specification", async () => {
    const page = await catalog.list(viewer, { search: "versabase cream", pageSize: 100 });
    expect(page.items.map((item) => item.sourceSelection.variantId)).toContain("mov_06beec21c59fe7842f18");
  });
});
