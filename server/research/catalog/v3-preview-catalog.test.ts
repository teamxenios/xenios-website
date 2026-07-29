import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getV3PreviewProfile,
  V3_PREVIEW_PRICING_STATE,
  v3PreviewCatalogProducts,
  v3PreviewProfiles,
} from "./v3-preview-catalog";

describe("V3 public-safe preview catalog", () => {
  it("contains exactly 49 unique member-only previews", () => {
    expect(v3PreviewProfiles).toHaveLength(49);
    expect(new Set(v3PreviewProfiles.map((item) => item.id)).size).toBe(49);
    expect(new Set(v3PreviewProfiles.map((item) => item.slug)).size).toBe(49);
    expect(v3PreviewProfiles.every((item) => item.memberOnly)).toBe(true);
  });

  it.each(v3PreviewProfiles)(
    "$slug remains price-pending and non-transactional",
    (item) => {
      expect(item.pricingState).toBe(V3_PREVIEW_PRICING_STATE);
      expect(item.approvedPrice).toBeNull();
      expect(item.approvedVariantCount).toBe(0);
      expect(item.purchasingEnabled).toBe(false);
      expect(item.documentationState).toBe("pending");
      expect(item.coaState).toBe("not_published");
    },
  );

  it("projects zero legacy compatibility products or manufactured SKU authority", () => {
    expect(v3PreviewCatalogProducts).toEqual([]);
    expect(v3PreviewProfiles.every((item) => !("sku" in item))).toBe(true);
  });

  it("keeps future pathways informational and non-clinical", () => {
    const pathways = v3PreviewProfiles.filter(
      (item) => item.kind === "pathway_profile",
    );
    expect(pathways).toHaveLength(3);
    expect(
      pathways.every(
        (item) =>
          item.lane === "future_clinical" &&
          item.availability === "information_only" &&
          item.summary.includes("does not provide prescribing"),
      ),
    ).toBe(true);
  });

  it("reads an exact slug and rejects unknown identities", () => {
    expect(getV3PreviewProfile("  omega-3  ")?.displayName).toBe("Omega-3");
    expect(getV3PreviewProfile("unknown")).toBeNull();
  });

  it("contains no value-shaped pricing decision, currency amount, local path, or private catalog metadata", () => {
    const rendered = JSON.stringify(v3PreviewProfiles);
    expect(rendered).not.toMatch(
      /\b(?:decision|price)[-_][a-z0-9]+(?:[-_][a-z0-9]+)*\b/i,
    );
    expect(rendered).not.toMatch(/(?:USD|[$€£])\s*\d/i);
    expect(rendered).not.toMatch(/\b\d+\s+cents\b/i);
    expect(rendered).not.toMatch(/(?:[A-Z]:\\|\/(?:Users|home)\/)/);
    expect(rendered).not.toMatch(
      /sourceUrl|source_cost|internal_cost|supplier|wholesale|private_reference/i,
    );
  });

  it("pins the release check-in to the trusted base and GitHub head branch", () => {
    const checkIn = readFileSync(
      resolve(
        process.cwd(),
        "docs/coordination/session-checkins/products-and-diagnostics.md",
      ),
      "utf8",
    );

    expect(checkIn).toContain(
      "EXACT BASE: `ca52b824158a51eff6d0b0b4d6abc202b1b90a05`",
    );
    expect(checkIn).toContain(
      "BRANCH: `agent/website-3-pr120-post-ownership-reconstruction`",
    );
    expect(checkIn).not.toMatch(
      /fc07a9b123806765b383203baf4b534dc3574ed2|feature\/website-3-pr109-livebase-sanitized/,
    );
  });
});
